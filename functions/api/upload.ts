import { json, badRequest, Env } from "../_utils";

// 上传图片到 R2，返回可访问的 URL（由 /api/files 代理）
export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method !== "POST") {
    return json({ detail: "Method Not Allowed" }, { status: 405 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return badRequest("Content-Type must be multipart/form-data");
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return badRequest("Missing file");
  }

  const originalName = file.name || "upload";
  const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : "";

  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const key = `images/${new Date().toISOString().slice(0, 10)}/${randomHex}${ext}`;

  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
    },
  });

  const url = `/api/files/${key}`;

  return json({ url }, { status: 201 });
};


