import { json, jsonBody, badRequest, requireAuth, queryAll, exec } from "../../_utils";

export const onRequest = async ({ request, env }: { request: Request; env: any }) => {
  const method = request.method.toUpperCase();

  if (method === "GET") {
    // GET /api/users 需要登录
    const auth = await requireAuth(env, request);
    if (auth instanceof Response) return auth;
    // 简单返回所有用户，与原后端一致
    const users = await queryAll<any>(
      env,
      "SELECT id, nickname, avatar, phone, is_active, created_at, updated_at FROM users"
    );
    return json(users.map(mapUserRow));
  }

  if (method === "POST") {
    const auth = await requireAuth(env, request); // 原实现也要求携带 token
    if (auth instanceof Response) return auth;
    const body = await jsonBody<{
      nickname?: string;
      avatar?: string | null;
      phone?: string | null;
    }>(request);

    if (!body.nickname) {
      return badRequest("nickname is required");
    }

    const now = new Date().toISOString();
    const res = await exec(
      env,
      "INSERT INTO users (nickname, avatar, phone, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
      body.nickname,
      body.avatar ?? null,
      body.phone ?? null,
      now,
      now
    );
    const user = await env.DB.prepare(
      "SELECT id, nickname, avatar, phone, is_active, created_at, updated_at FROM users WHERE id = ?"
    )
      .bind(res.lastInsertId)
      .first<any>();

    return json(mapUserRow(user), { status: 201 });
  }

  return new Response("Method Not Allowed", { status: 405 });
};

function mapUserRow(row: any) {
  return {
    id: row.id,
    nickname: row.nickname,
    avatar: row.avatar,
    phone: row.phone,
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}


