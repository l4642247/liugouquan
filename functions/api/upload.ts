import { json } from "../_utils";

export const onRequest = async ({ request }: { request: Request }) => {
  // 先做一个最简单的调试版本，如果这个还能返回 405，说明 /api/upload 根本没走到这个函数
  return json(
    {
      ok: true,
      method: request.method,
      message: "simple upload debug handler",
    },
    { status: 200 }
  );
};


