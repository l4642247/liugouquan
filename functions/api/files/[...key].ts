export const onRequestGet = async ({
  env,
  params,
}: {
  env: any;
  params: { key: string };
}) => {
  const key = params.key;
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


