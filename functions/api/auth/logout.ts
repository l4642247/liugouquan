import { requireAuth, exec } from "../../_utils";

export const onRequestPost = async ({ request, env }: { request: Request; env: any }) => {
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  await exec(
    env,
    "UPDATE users SET auth_token = NULL, token_created_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    userId
  );
  return new Response(null, { status: 204 });
};


