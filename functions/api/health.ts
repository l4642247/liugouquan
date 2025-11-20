import { ApiContext, json } from "../_utils";

export const onRequestGet = async ({ env }: { env: any }): Promise<Response> => {
  // Basic health check: DB / R2 / KV
  const status: Record<string, "ok" | "unavailable"> = {
    database: "ok",
    storage: "ok",
    cache: "ok",
  };

  try {
    await env.DB.prepare("SELECT 1").first();
  } catch {
    status.database = "unavailable";
  }

  try {
    // Try a simple R2 operation (list with limit 1)
    const iter = env.BUCKET.list({ limit: 1 });
    if (!iter) throw new Error("no bucket");
  } catch {
    status.storage = "unavailable";
  }

  try {
    await env.KV.get("health-check");
  } catch {
    status.cache = "unavailable";
  }

  const unavailableCount = Object.values(status).filter((s) => s === "unavailable").length;
  const overall =
    unavailableCount === 0 ? "healthy" : unavailableCount < 3 ? "degraded" : "unhealthy";

  return json({
    status: overall,
    timestamp: new Date().toISOString(),
    services: status,
  });
};


