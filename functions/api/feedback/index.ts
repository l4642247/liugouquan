import { json, jsonBody, badRequest, exec, validateContent } from "../../_utils";

export const onRequest = async ({ request, env }: { request: Request; env: any }) => {
  const method = request.method.toUpperCase();

  if (method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 获取用户ID（可选，未登录也可以提交反馈）
  let userId: number | null = null;
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token) {
      const result = await env.DB.prepare("SELECT id FROM users WHERE auth_token = ? AND is_active = 1")
        .bind(token)
        .first<{ id: number }>();
      if (result) {
        userId = result.id;
      }
    }
  }

  const body = await jsonBody<{
    content?: string;
    contact?: string;
  }>(request);

  const content = (body.content || "").trim();
  const contact = (body.contact || "").trim();

  if (!content) {
    return badRequest("请填写反馈内容");
  }

  if (content.length < 5) {
    return badRequest("反馈内容至少5个字");
  }

  if (content.length > 1000) {
    return badRequest("反馈内容不能超过1000字");
  }

  if (!validateContent(content)) {
    return badRequest("内容包含违禁词，请修改后重试");
  }

  const now = new Date().toISOString();
  const res = await exec(
    env,
    `INSERT INTO feedback (user_id, content, contact, created_at) VALUES (?, ?, ?, ?)`,
    userId,
    content,
    contact || null,
    now
  );

  return json({ success: true, id: res.lastInsertId }, { status: 201 });
};

