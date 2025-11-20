import { json, jsonBody, badRequest, exec } from "../../_utils";

export const onRequestPost = async ({ request, env }: { request: Request; env: any }) => {
  const body = await jsonBody<{
    phone?: string;
    code?: string;
    nickname?: string | null;
    avatar?: string | null;
  }>(request);

  const { phone, code, nickname, avatar } = body;
  if (!phone || !code) {
    return badRequest("缺少参数");
  }
  if (code !== "123456") {
    return badRequest("验证码错误");
  }

  // 查找或创建用户
  const existing = await env.DB.prepare(
    "SELECT * FROM users WHERE phone = ? LIMIT 1"
  ).bind(phone).first<any>();

  let user = existing;
  const now = new Date().toISOString();

  if (!user) {
    const nick = nickname && nickname.trim() ? nickname.trim() : `宠友${phone.slice(-4)}`;
    const res = await exec(
      env,
      "INSERT INTO users (nickname, avatar, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      nick,
      avatar ?? null,
      phone,
      now,
      now
    );
    if (!res.success) {
      return badRequest("登录失败，请稍后重试");
    }
    user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(res.lastInsertId).first();
  }

  // 生成 token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = Array.from(tokenBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await exec(
    env,
    "UPDATE users SET auth_token = ?, token_created_at = ?, last_login_at = ?, updated_at = ? WHERE id = ?",
    token,
    now,
    now,
    now,
    user.id
  );

  const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first<any>();

  return json({
    token,
    user: {
      id: fresh.id,
      nickname: fresh.nickname,
      avatar: fresh.avatar,
      phone: fresh.phone,
      is_active: !!fresh.is_active,
      created_at: fresh.created_at,
      updated_at: fresh.updated_at,
    },
  });
};


