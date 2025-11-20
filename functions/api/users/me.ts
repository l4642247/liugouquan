import { json, jsonBody, requireAuth, exec } from "../../_utils";

export const onRequest = async ({ request, env }: { request: Request; env: any }) => {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (request.method === "GET") {
    const user = await env.DB.prepare(
      "SELECT id, nickname, avatar, phone, is_active, created_at, updated_at FROM users WHERE id = ?"
    )
      .bind(userId)
      .first<any>();
    if (!user) {
      return new Response("Not Found", { status: 404 });
    }
    return json(mapUserRow(user));
  }

  if (request.method === "PATCH") {
    const body = await jsonBody<{
      nickname?: string;
      avatar?: string | null;
    }>(request);

    const fields: string[] = [];
    const params: any[] = [];

    if (body.nickname !== undefined) {
      fields.push("nickname = ?");
      params.push(body.nickname);
    }
    if (body.avatar !== undefined) {
      fields.push("avatar = ?");
      params.push(body.avatar);
    }

    if (fields.length > 0) {
      params.push(userId);
      await exec(
        env,
        `UPDATE users SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ...params
      );
    }

    const user = await env.DB.prepare(
      "SELECT id, nickname, avatar, phone, is_active, created_at, updated_at FROM users WHERE id = ?"
    )
      .bind(userId)
      .first<any>();

    return json(mapUserRow(user));
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


