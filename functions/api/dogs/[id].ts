import { json, jsonBody, requireAuth, notFound, exec } from "../../_utils";

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
  const id = Number(params.id);
  if (!id) {
    return notFound("Dog not found");
  }

  if (request.method === "GET") {
    const dog = await env.DB.prepare("SELECT * FROM dogs WHERE id = ?").bind(id).first<any>();
    if (!dog || dog.user_id !== userId) {
      return notFound("Dog not found");
    }
    return json(mapDogRow(dog));
  }

  if (request.method === "PATCH") {
    const body = await jsonBody<any>(request);
    const dog = await env.DB.prepare("SELECT * FROM dogs WHERE id = ?").bind(id).first<any>();
    if (!dog || dog.user_id !== userId) {
      return notFound("Dog not found");
    }

    const fields: string[] = [];
    const paramsArr: any[] = [];
    const allowed = [
      "name",
      "breed",
      "gender",
      "birthday",
      "sterilized",
      "weight_kg",
      "personality",
      "vaccination_status",
      "avatar",
      "notes",
    ];

    for (const key of allowed) {
      if (key in body) {
        fields.push(`${key} = ?`);
        paramsArr.push(body[key]);
      }
    }

    if (fields.length > 0) {
      paramsArr.push(id);
      await exec(
        env,
        `UPDATE dogs SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ...paramsArr
      );
    }

    const updated = await env.DB.prepare("SELECT * FROM dogs WHERE id = ?").bind(id).first<any>();
    return json(mapDogRow(updated));
  }

  if (request.method === "DELETE") {
    const dog = await env.DB.prepare("SELECT * FROM dogs WHERE id = ?").bind(id).first<any>();
    if (!dog || dog.user_id !== userId) {
      return notFound("Dog not found");
    }
    await exec(env, "DELETE FROM dogs WHERE id = ?", id);
    return new Response(null, { status: 204 });
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


