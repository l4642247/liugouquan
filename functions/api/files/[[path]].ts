export const onRequestGet = async ({
  env,
  params,
}: {
  env: any;
  params: { path: string[] };
}) => {
  // catch-all 参数在 Cloudflare Pages Functions 里是数组
  const key = (params.path || []).join("/");
  if (!key) {
    return new Response("Not found", { status: 404 });
  }

  const obj = await env.BUCKET.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }
  headers.set("etag", obj.httpEtag);

  return new Response(obj.body, { headers });
};

