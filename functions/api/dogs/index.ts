import { json, jsonBody, requireAuth, queryAll, exec, badRequest, validateContent } from "../../_utils";

export const onRequest = async ({ request, env }: { request: Request; env: any }) => {
  const method = request.method.toUpperCase();
  const auth = await requireAuth(env, request);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  if (method === "GET") {
    const dogs = await queryAll<any>(
      env,
      "SELECT * FROM dogs WHERE user_id = ? ORDER BY datetime(created_at) DESC",
      userId
    );
    return json(dogs.map(mapDogRow));
  }

  if (method === "POST") {
    const body = await jsonBody<any>(request);
    if (!body.name) {
      return badRequest("name is required");
    }

    if (!validateContent(body.name) || !validateContent(body.breed) || !validateContent(body.personality)) {
      return badRequest("内容包含违禁词，请修改后重试");
    }

    const now = new Date().toISOString();
    const res = await exec(
      env,
      `INSERT INTO dogs (user_id, name, breed, gender, birthday, sterilized, weight_kg,
        personality, vaccination_status, avatar, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      body.name,
      body.breed ?? null,
      body.gender ?? null,
      body.birthday ?? null,
      body.sterilized ? 1 : 0,
      body.weight_kg ?? null,
      body.personality ?? null,
      body.vaccination_status ?? null,
      body.avatar ?? null,
      body.notes ?? null,
      now,
      now
    );

    const dog = await env.DB.prepare("SELECT * FROM dogs WHERE id = ?")
      .bind(res.lastInsertId)
      .first<any>();
    return json(mapDogRow(dog), { status: 201 });
  }

  return new Response("Method Not Allowed", { status: 405 });
};

function mapDogRow(row: any) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    breed: row.breed,
    gender: row.gender,
    birthday: row.birthday,
    sterilized: !!row.sterilized,
    weight_kg: row.weight_kg,
    personality: row.personality,
    vaccination_status: row.vaccination_status,
    avatar: row.avatar,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}


