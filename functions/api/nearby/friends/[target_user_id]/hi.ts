import { json, jsonBody, requireAuth, notFound, badRequest, exec } from "../../../../_utils";

export const onRequestPost = async ({
  request,
  env,
  params,
}: {
  request: Request;
  env: any;
  params: Record<string, string>;
}) => {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
  const targetId = Number(params.target_user_id);
  if (!targetId) {
    return notFound("宠友不存在或已停用");
  }
  if (targetId === userId) {
    return badRequest("不能向自己打招呼");
  }

  const target = await env.DB.prepare(
    "SELECT id, is_active FROM users WHERE id = ?"
  )
    .bind(targetId)
    .first<{ id: number; is_active: number } | null>();
  if (!target || !target.is_active) {
    return notFound("宠友不存在或已停用");
  }

  // 检查3分钟内是否向该用户打过招呼
  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const recentGreeting = await env.DB.prepare(
    `SELECT id, created_at FROM greetings 
     WHERE sender_id = ? AND receiver_id = ? AND datetime(created_at) > datetime(?)`
  ).bind(userId, targetId, threeMinutesAgo).first<any>();

  if (recentGreeting) {
    // 计算剩余冷却时间
    const lastTime = new Date(recentGreeting.created_at).getTime();
    const cooldownEnd = lastTime + 3 * 60 * 1000;
    const remainingSeconds = Math.ceil((cooldownEnd - Date.now()) / 1000);
    return badRequest(`请${remainingSeconds}秒后再向该用户打招呼`);
  }

  const body = await jsonBody<{ message?: string | null }>(request);
  const raw = (body.message || "").trim();
  const message = raw || "嗨～很高兴遇见你，一起遛狗吗？";

  const now = new Date().toISOString();
  const res = await exec(
    env,
    `INSERT INTO greetings (sender_id, receiver_id, message, greeting_type, status, created_at)
     VALUES (?, ?, ?, 'hi', 'pending', ?)`,
    userId,
    targetId,
    message,
    now
  );

  const greeting = await env.DB.prepare(
    "SELECT id, sender_id, receiver_id, message, greeting_type, status, created_at FROM greetings WHERE id = ?"
  )
    .bind(res.lastInsertId)
    .first<any>();

  return json(greeting, { status: 201 });
};


