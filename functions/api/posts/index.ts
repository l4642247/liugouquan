import { json, jsonBody, badRequest, requireAuth, queryAll, exec } from "../../_utils";

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

      return {
        id: row.id,
        content: row.content,
        location: row.location,
        latitude: row.latitude,
        longitude: row.longitude,
        images,
        created_at: row.created_at,
        distance_meters,
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
    }>(request);

    if (!body.content || !body.location || body.latitude == null || body.longitude == null) {
      return badRequest("内容、位置和坐标为必填");
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
      `INSERT INTO posts (user_id, content, location, latitude, longitude, images, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId,
      body.content,
      body.location,
      body.latitude,
      body.longitude,
      JSON.stringify(images),
      now
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

    const result = {
      id: row.id,
      content: row.content,
      location: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
      images: images,
      created_at: row.created_at,
      distance_meters: null,
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

    return json(result, { status: 201 });
  }

  return new Response("Method Not Allowed", { status: 405 });
};


