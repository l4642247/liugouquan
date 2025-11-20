import { requireAuth, notFound, exec } from "../../_utils";

export const onRequest = async ({
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
  if (request.method !== "DELETE") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const id = Number(params.id);
  if (!id) {
    return notFound("动态不存在或已删除");
  }

  const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<any>();
  if (!post) {
    return notFound("动态不存在或已删除");
  }
  if (post.user_id !== userId) {
    return new Response(JSON.stringify({ detail: "无权删除该动态" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  await exec(env, "DELETE FROM posts WHERE id = ?", id);
  return new Response(null, { status: 204 });
};


