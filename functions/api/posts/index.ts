import { json, jsonBody, badRequest, requireAuth, queryAll, exec, validateContent } from "../../_utils";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6_371_000; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

// 动态类型
const POST_TYPES = ['share', 'wander', 'meetup'] as const;
type PostType = typeof POST_TYPES[number];

// 时长选项（分钟）
const VALID_DURATIONS = [30, 60, 90, 120, 240];

// 约遛遛状态
const MEETUP_STATUSES = ['open', 'matched', 'completed', 'cancelled'] as const;

export const onRequest = async ({ request, env }: { request: Request; env: any }) => {
  const method = request.method.toUpperCase();

  if (method === "GET") {
    const url = new URL(request.url);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20)
    );
    const skip = Math.max(0, parseInt(url.searchParams.get("skip") || "0", 10) || 0);
    const latParam = url.searchParams.get("lat");
    const lngParam = url.searchParams.get("lng");
    const userIdParam = url.searchParams.get("user_id");

    const lat = latParam != null ? Number(latParam) : null;
    const lng = lngParam != null ? Number(lngParam) : null;

    let whereSql = "";
    const params: any[] = [];
    if (userIdParam) {
      whereSql = "WHERE p.user_id = ?";
      params.push(Number(userIdParam));
    }

    const sql = `
      SELECT
        p.*,
        u.id   AS author_id,
        u.nickname AS author_nickname,
        u.avatar   AS author_avatar,
        u.phone    AS author_phone,
        u.is_active AS author_is_active,
        u.created_at AS author_created_at,
        u.updated_at AS author_updated_at
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ${whereSql}
      ORDER BY datetime(p.created_at) DESC
      LIMIT ? OFFSET ?
    `;
    params.push(limit, skip);

    const posts = await queryAll<any>(env, sql, ...params);

    // 获取约遛遛动态的响应数量
    const meetupPostIds = posts
      .filter((p) => p.post_type === 'meetup')
      .map((p) => p.id);
    
    let responseCountMap = new Map<number, number>();
    if (meetupPostIds.length > 0) {
      const placeholders = meetupPostIds.map(() => '?').join(',');
      const responseCounts = await queryAll<{ post_id: number; cnt: number }>(
        env,
        `SELECT post_id, COUNT(*) as cnt FROM greetings 
         WHERE post_id IN (${placeholders}) AND greeting_type = 'respond'
         GROUP BY post_id`,
        ...meetupPostIds
      );
      for (const rc of responseCounts) {
        responseCountMap.set(rc.post_id, rc.cnt);
      }
    }

    const enriched = posts.map((row) => {
      let images: string[] = [];
      if (row.images) {
        try {
          const parsed = JSON.parse(row.images);
          if (Array.isArray(parsed)) {
            images = parsed.map((x) => String(x));
          }
        } catch {
          // ignore
        }
      }

      let distance_meters: number | null = null;
      if (
        lat != null &&
        lng != null &&
        row.latitude != null &&
        row.longitude != null
      ) {
        distance_meters = haversineDistance(
          lat,
          lng,
          Number(row.latitude),
          Number(row.longitude)
        );
      }

      const base = {
        id: row.id,
        content: row.content,
        location: row.location,
        latitude: row.latitude,
        longitude: row.longitude,
        images,
        created_at: row.created_at,
        distance_meters,
        post_type: row.post_type || 'share',
        author: {
          id: row.author_id,
          nickname: row.author_nickname,
          avatar: row.author_avatar,
          phone: row.author_phone,
          is_active: !!row.author_is_active,
          created_at: row.author_created_at,
          updated_at: row.author_updated_at,
        },
      };

      // 约遛遛类型额外字段
      if (row.post_type === 'meetup') {
        return {
          ...base,
          meetup_location_name: row.meetup_location_name,
          meetup_duration: row.meetup_duration,
          meetup_start_time: row.meetup_start_time,
          meetup_status: row.meetup_status || 'open',
          response_count: responseCountMap.get(row.id) || 0,
        };
      }

      return base;
    });

    return json(enriched);
  }

  if (method === "POST") {
    const auth = await requireAuth(env, request);
    if (auth instanceof Response) return auth;
    const { userId } = auth;
    const body = await jsonBody<{
      content?: string;
      location?: string;
      latitude?: number;
      longitude?: number;
      images?: string[];
      post_type?: string;
      meetup_location_name?: string;
      meetup_duration?: number;
      meetup_start_time?: string;
    }>(request);

    // 验证动态类型
    const postType = (body.post_type || 'share') as PostType;
    if (!POST_TYPES.includes(postType)) {
      return badRequest("无效的动态类型");
    }

    // 晒一晒：只需要内容或图片
    // 随缘遇/约遛遛：需要位置
    if (postType === 'share') {
      if (!body.content && (!body.images || body.images.length === 0)) {
        return badRequest("请输入内容或上传图片");
      }
    } else {
      // 随缘遇和约遛遛都需要位置
      if (!body.location || body.latitude == null || body.longitude == null) {
        return badRequest("请允许获取位置信息");
      }
    }

    // 约遛遛额外验证
    if (postType === 'meetup') {
      if (!body.meetup_location_name) {
        return badRequest("请选择遛狗地点");
      }
      if (!body.meetup_duration || !VALID_DURATIONS.includes(body.meetup_duration)) {
        return badRequest("请选择预计时长");
      }
    }

    if (body.content && !validateContent(body.content)) {
      return badRequest("内容包含违禁词，请修改后重试");
    }

    // 检查是否有带头像的狗狗档案
    const dogCountRow = await env.DB.prepare(
      `SELECT COUNT(id) as cnt FROM dogs
       WHERE user_id = ? AND avatar IS NOT NULL AND trim(avatar) != ''`
    )
      .bind(userId)
      .first<{ cnt: number }>();
    if (!dogCountRow || !dogCountRow.cnt) {
      return badRequest("请先完善狗狗档案后再发布动态");
    }

    const images = Array.isArray(body.images) ? body.images : [];
    const now = new Date().toISOString();

    const res = await exec(
      env,
      `INSERT INTO posts (user_id, content, location, latitude, longitude, images, created_at, post_type, meetup_location_name, meetup_duration, meetup_start_time, meetup_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      body.content || '',
      body.location || null,
      body.latitude ?? null,
      body.longitude ?? null,
      JSON.stringify(images),
      now,
      postType,
      postType === 'meetup' ? body.meetup_location_name : null,
      postType === 'meetup' ? body.meetup_duration : null,
      postType === 'meetup' ? (body.meetup_start_time || now) : null,
      postType === 'meetup' ? 'open' : null
    );

    const row = await env.DB.prepare(
      `SELECT
          p.*,
          u.id   AS author_id,
          u.nickname AS author_nickname,
          u.avatar   AS author_avatar,
          u.phone    AS author_phone,
          u.is_active AS author_is_active,
          u.created_at AS author_created_at,
          u.updated_at AS author_updated_at
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ?`
    )
      .bind(res.lastInsertId)
      .first<any>();

    const result: any = {
      id: row.id,
      content: row.content,
      location: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
      images: images,
      created_at: row.created_at,
      distance_meters: null,
      post_type: row.post_type,
      author: {
        id: row.author_id,
        nickname: row.author_nickname,
        avatar: row.author_avatar,
        phone: row.author_phone,
        is_active: !!row.author_is_active,
        created_at: row.author_created_at,
        updated_at: row.author_updated_at,
      },
    };

    // 约遛遛额外字段
    if (postType === 'meetup') {
      result.meetup_location_name = row.meetup_location_name;
      result.meetup_duration = row.meetup_duration;
      result.meetup_start_time = row.meetup_start_time;
      result.meetup_status = row.meetup_status;
      result.response_count = 0;
    }

    return json(result, { status: 201 });
  }

  return new Response("Method Not Allowed", { status: 405 });
};


