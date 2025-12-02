import { json, requireAuth, queryAll } from "../../_utils";

export const onRequest = async ({ request, env }: { request: Request; env: any }) => {
  const method = request.method.toUpperCase();
  
  if (method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  // 获取收到的打招呼消息
  const messages = await queryAll<any>(
    env,
    `SELECT 
      g.id,
      g.message,
      g.created_at,
      g.sender_id,
      u.nickname as sender_nickname,
      u.avatar as sender_avatar,
      d.name as dog_name,
      d.breed as dog_breed
    FROM greetings g
    JOIN users u ON g.sender_id = u.id
    LEFT JOIN dogs d ON d.user_id = u.id
    WHERE g.receiver_id = ?
    ORDER BY datetime(g.created_at) DESC
    LIMIT 50`,
    userId
  );

  return json(messages);
};

