export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  KV: KVNamespace;
}

export type ApiContext = {
  request: Request;
  env: Env;
  params: Record<string, string>;
};

export async function jsonBody<T = any>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Invalid JSON body");
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function badRequest(message: string): Response {
  return json({ detail: message }, { status: 400 });
}

export function unauthorized(message = "Not authenticated"): Response {
  return json({ detail: message }, { status: 401 });
}

export function notFound(message = "Not found"): Response {
  return json({ detail: message }, { status: 404 });
}

export function forbidden(message = "Forbidden"): Response {
  return json({ detail: message }, { status: 403 });
}

export async function requireAuth(
  env: Env,
  request: Request
): Promise<{ userId: number } | Response> {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return unauthorized();
  }
  const token = auth.slice("Bearer ".length).trim();
  if (!token) {
    return unauthorized();
  }
  const stmt = env.DB.prepare("SELECT id FROM users WHERE auth_token = ? AND is_active = 1");
  const result = await stmt.bind(token).first<{ id: number }>();
  if (!result) {
    return unauthorized("Invalid token");
  }
  return { userId: result.id };
}

// Simple helper to run a query that returns many rows
export async function queryAll<T = any>(
  env: Env,
  sql: string,
  ...params: any[]
): Promise<T[]> {
  const res = await env.DB.prepare(sql).bind(...params).all<T>();
  return res.results || [];
}

export async function queryOne<T = any>(
  env: Env,
  sql: string,
  ...params: any[]
): Promise<T | null> {
  const res = await env.DB.prepare(sql).bind(...params).first<T>();
  return (res as T) ?? null;
}

export async function exec(
  env: Env,
  sql: string,
  ...params: any[]
): Promise<{ success: boolean; lastInsertId?: number }> {
  const res = await env.DB.prepare(sql).bind(...params).run();
  // D1 returns meta.last_row_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta: any = (res as any).meta || {};
  return { success: (res as any).success !== false, lastInsertId: meta.last_row_id ?? meta.lastRowId };
}


