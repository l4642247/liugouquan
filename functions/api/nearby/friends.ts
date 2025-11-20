import { json, badRequest, queryAll } from "../../_utils";

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6_371_000; // meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

function formatDistance(distance: number): string {
  if (distance < 1) return "<1m";
  if (distance < 1000) return `${Math.round(distance)}m`;
  return `${(distance / 1000).toFixed(1)}km`;
}

function buildDogTags(dog: any): string[] {
  const tags: string[] = [];
  if (dog.breed) tags.push(dog.breed);
  const genderMap: Record<string, string> = { male: "男孩", female: "女孩", unknown: "未知" };
  if (dog.gender && genderMap[dog.gender]) {
    tags.push(genderMap[dog.gender]);
  }
  if (dog.sterilized != null) {
    tags.push(dog.sterilized ? "已绝育" : "未绝育");
  }
  if (dog.personality) {
    const parts = String(dog.personality)
      .split(/[,，;；。\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    tags.push(...parts.slice(0, 3));
  }
  return tags.slice(0, 5);
}

export const onRequestGet = async ({ request, env }: { request: Request; env: any }) => {
  const url = new URL(request.url);
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");
  const radiusParam = url.searchParams.get("radius");
  const limitParam = url.searchParams.get("limit");

  if (latParam == null || lngParam == null) {
    return badRequest("需要提供当前位置");
  }

  const lat = Number(latParam);
  const lng = Number(lngParam);
  const radius = radiusParam != null ? Number(radiusParam) : null;
  const limit = Math.min(
    50,
    Math.max(1, parseInt(limitParam || "20", 10) || 20)
  );

  // 直接从 posts + users 表中查询最近发布的动态，最多 200 条
  const posts = await queryAll<any>(
    env,
    `SELECT
       p.id,
       p.user_id,
       p.location,
       p.latitude,
       p.longitude,
       p.created_at,
       u.nickname,
       u.avatar,
       u.is_active
     FROM posts p
     JOIN users u ON p.user_id = u.id
     ORDER BY datetime(p.created_at) DESC
     LIMIT 200`
  );

  if (!posts.length) return json([]);

  const seenUserIds = new Set<number>();
  const rawFriends: any[] = [];

  for (const entry of posts) {
    const userId = Number(entry.user_id);
    if (!userId || seenUserIds.has(userId)) continue;
    if (!entry.is_active) continue;
    if (entry.latitude == null || entry.longitude == null) continue;

    const plat = Number(entry.latitude);
    const plng = Number(entry.longitude);
    const distance = haversineDistance(lat, lng, plat, plng);
    if (radius != null && distance > radius) continue;

    rawFriends.push({
      id: userId,
      name: entry.nickname || "宠友",
      avatar: entry.avatar,
      latitude: plat,
      longitude: plng,
      distance_meters: distance,
      distance_text: formatDistance(distance),
      latest_location: entry.location,
      dog: null,
      dog_count: 0,
    });

    seenUserIds.add(userId);
    if (rawFriends.length >= limit) break;
  }

  if (!rawFriends.length) return json([]);

  // 查询这些用户的狗狗信息
  const ids = Array.from(seenUserIds);
  const placeholders = ids.map(() => "?").join(",");
  const dogs = await queryAll<any>(
    env,
    `SELECT * FROM dogs WHERE user_id IN (${placeholders}) ORDER BY datetime(created_at) ASC`,
    ...ids
  );

  const dogMap = new Map<number, any[]>();
  for (const dog of dogs) {
    const uid = Number(dog.user_id);
    if (!dogMap.has(uid)) dogMap.set(uid, []);
    dogMap.get(uid)!.push(dog);
  }

  for (const friend of rawFriends) {
    const list = dogMap.get(friend.id) || [];
    friend.dog_count = list.length;
    if (!list.length) continue;
    const primary = list[0];
    friend.dog = {
      id: primary.id,
      name: primary.name,
      breed: primary.breed,
      avatar: primary.avatar,
      tags: buildDogTags(primary),
    };
  }

  return json(rawFriends);
};


