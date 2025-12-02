import { json, jsonBody, badRequest, requireAuth, exec } from "../../../_utils";

// 接受响应（动态作者接受某人的响应）
export const onRequestPost = async ({ request, env, params }: { request: Request; env: any; params: Record<string, string> }) => {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const postId = Number(params.id);
  if (!postId) {
    return badRequest("无效的动态ID");
  }

  const body = await jsonBody<{ response_id: number }>(request);
  if (!body.response_id) {
    return badRequest("请指定要接受的响应");
  }

  // 获取动态信息
  const post = await env.DB.prepare(
    `SELECT id, user_id, post_type, meetup_status, latitude, longitude FROM posts WHERE id = ?`
  ).bind(postId).first<any>();

  if (!post) {
    return json({ detail: "动态不存在" }, { status: 404 });
  }

  // 只有动态作者可以接受响应
  if (post.user_id !== userId) {
    return json({ detail: "无权操作" }, { status: 403 });
  }

  if (post.post_type !== 'meetup') {
    return badRequest("只有约遛遛类型的动态可以接受响应");
  }

  if (post.meetup_status !== 'open') {
    return badRequest("该邀约已关闭或已匹配");
  }

  // 获取响应记录
  const response = await env.DB.prepare(
    `SELECT id, sender_id, status FROM greetings WHERE id = ? AND post_id = ? AND greeting_type = 'respond'`
  ).bind(body.response_id, postId).first<any>();

  if (!response) {
    return json({ detail: "响应不存在" }, { status: 404 });
  }

  if (response.status !== 'pending') {
    return badRequest("该响应已被处理");
  }

  const now = new Date().toISOString();

  // 更新响应状态为已接受
  await exec(
    env,
    `UPDATE greetings SET status = 'accepted' WHERE id = ?`,
    body.response_id
  );

  // 更新动态状态为已匹配
  await exec(
    env,
    `UPDATE posts SET meetup_status = 'matched' WHERE id = ?`,
    postId
  );

  // 创建接受消息（通知响应者）
  await exec(
    env,
    `INSERT INTO greetings (sender_id, receiver_id, message, greeting_type, post_id, status, created_at)
     VALUES (?, ?, ?, 'accept', ?, 'accepted', ?)`,
    userId,
    response.sender_id,
    "我接受了你的邀约，一起遛狗吧！",
    postId,
    now
  );

  // 拒绝其他待处理的响应
  await exec(
    env,
    `UPDATE greetings SET status = 'rejected' WHERE post_id = ? AND greeting_type = 'respond' AND status = 'pending' AND id != ?`,
    postId,
    body.response_id
  );

  // 返回响应者的位置信息（用于导航）
  const responder = await env.DB.prepare(
    `SELECT u.id, u.nickname, u.avatar, p.latitude, p.longitude, p.location
     FROM users u
     LEFT JOIN (
       SELECT user_id, latitude, longitude, location 
       FROM posts 
       WHERE user_id = ? 
       ORDER BY datetime(created_at) DESC 
       LIMIT 1
     ) p ON u.id = p.user_id
     WHERE u.id = ?`
  ).bind(response.sender_id, response.sender_id).first<any>();

  return json({
    message: "已接受响应",
    matched_user: {
      id: responder?.id || response.sender_id,
      nickname: responder?.nickname,
      avatar: responder?.avatar,
      latitude: responder?.latitude,
      longitude: responder?.longitude,
      location: responder?.location,
    },
    meetup_location: {
      latitude: post.latitude,
      longitude: post.longitude,
    },
  });
};

