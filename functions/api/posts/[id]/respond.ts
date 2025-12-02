import { json, jsonBody, badRequest, requireAuth, exec, queryAll } from "../../../_utils";

// 响应邀约 / 接受响应
export const onRequestPost = async ({ request, env, params }: { request: Request; env: any; params: Record<string, string> }) => {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const postId = Number(params.id);
  if (!postId) {
    return badRequest("无效的动态ID");
  }

  // 获取动态信息
  const post = await env.DB.prepare(
    `SELECT id, user_id, post_type, meetup_status, latitude, longitude FROM posts WHERE id = ?`
  ).bind(postId).first<any>();

  if (!post) {
    return json({ detail: "动态不存在" }, { status: 404 });
  }

  if (post.post_type !== 'meetup') {
    return badRequest("只能响应约遛遛类型的动态");
  }

  if (post.meetup_status !== 'open') {
    return badRequest("该邀约已关闭或已匹配");
  }

  // 不能响应自己的邀约
  if (post.user_id === userId) {
    return badRequest("不能响应自己的邀约");
  }

  // 检查是否已经响应过
  const existingResponse = await env.DB.prepare(
    `SELECT id FROM greetings WHERE sender_id = ? AND post_id = ? AND greeting_type = 'respond'`
  ).bind(userId, postId).first<any>();

  if (existingResponse) {
    return badRequest("您已响应过该邀约");
  }

  // 检查3分钟内是否向该用户打过招呼
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const recentGreeting = await env.DB.prepare(
    `SELECT id FROM greetings 
     WHERE sender_id = ? AND receiver_id = ? AND datetime(created_at) > datetime(?)`
  ).bind(userId, post.user_id, threeMinutesAgo).first<any>();

  if (recentGreeting) {
    return badRequest("3分钟内只能向同一用户发送一次消息");
  }

  const body = await jsonBody<{ message?: string }>(request);
  const message = body.message || "我想和你一起遛狗！";
  const now = new Date().toISOString();

  // 创建响应记录
  await exec(
    env,
    `INSERT INTO greetings (sender_id, receiver_id, message, greeting_type, post_id, status, created_at)
     VALUES (?, ?, ?, 'respond', ?, 'pending', ?)`,
    userId,
    post.user_id,
    message,
    postId,
    now
  );

  return json({ message: "响应成功，等待对方确认" }, { status: 201 });
};

// 获取动态的响应列表（仅动态作者可查看）
export const onRequestGet = async ({ request, env, params }: { request: Request; env: any; params: Record<string, string> }) => {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const postId = Number(params.id);
  if (!postId) {
    return badRequest("无效的动态ID");
  }

  // 获取动态信息
  const post = await env.DB.prepare(
    `SELECT id, user_id, post_type FROM posts WHERE id = ?`
  ).bind(postId).first<any>();

  if (!post) {
    return json({ detail: "动态不存在" }, { status: 404 });
  }

  // 只有动态作者可以查看响应列表
  if (post.user_id !== userId) {
    return json({ detail: "无权查看" }, { status: 403 });
  }

  const responses = await queryAll<any>(
    env,
    `SELECT 
       g.id,
       g.sender_id,
       g.message,
       g.status,
       g.created_at,
       u.nickname,
       u.avatar
     FROM greetings g
     JOIN users u ON g.sender_id = u.id
     WHERE g.post_id = ? AND g.greeting_type = 'respond'
     ORDER BY datetime(g.created_at) DESC`,
    postId
  );

  // 获取响应者的狗狗信息
  const senderIds = responses.map(r => r.sender_id);
  let dogMap = new Map<number, any>();
  
  if (senderIds.length > 0) {
    const placeholders = senderIds.map(() => '?').join(',');
    const dogs = await queryAll<any>(
      env,
      `SELECT * FROM dogs WHERE user_id IN (${placeholders}) ORDER BY datetime(created_at) ASC`,
      ...senderIds
    );
    for (const dog of dogs) {
      if (!dogMap.has(dog.user_id)) {
        dogMap.set(dog.user_id, dog);
      }
    }
  }

  const enriched = responses.map(r => {
    const dog = dogMap.get(r.sender_id);
    return {
      id: r.id,
      sender_id: r.sender_id,
      message: r.message,
      status: r.status,
      created_at: r.created_at,
      sender: {
        id: r.sender_id,
        nickname: r.nickname,
        avatar: r.avatar,
      },
      dog: dog ? {
        id: dog.id,
        name: dog.name,
        breed: dog.breed,
        avatar: dog.avatar,
      } : null,
    };
  });

  return json(enriched);
};

