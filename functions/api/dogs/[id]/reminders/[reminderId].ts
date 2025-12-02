import { json, badRequest, notFound, requireAuth } from '../../../../_utils';

// 获取单个提醒
export const onRequestGet = async ({ request, env, params }) => {
  const authResult = await requireAuth(env, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const dogId = Number(params.id);
  const reminderId = Number(params.reminderId);

  if (!dogId || Number.isNaN(dogId) || !reminderId || Number.isNaN(reminderId)) {
    return badRequest('无效的参数');
  }

  try {
    // 验证狗狗属于当前用户
    const dog = await env.DB.prepare('SELECT user_id FROM dogs WHERE id = ?').bind(dogId).first<{ user_id: number }>();
    if (!dog || dog.user_id !== userId) {
      return notFound('未找到该狗狗档案');
    }

    // 获取提醒
    const reminder = await env.DB.prepare(
      'SELECT * FROM reminders WHERE id = ? AND dog_id = ?'
    )
      .bind(reminderId, dogId)
      .first();

    if (!reminder) {
      return notFound('未找到该提醒');
    }

    return json(reminder);
  } catch (error) {
    console.error('获取提醒失败:', error);
    return badRequest('获取提醒失败');
  }
};

// 更新提醒
export const onRequestPatch = async ({ request, env, params }) => {
  const authResult = await requireAuth(env, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const dogId = Number(params.id);
  const reminderId = Number(params.reminderId);

  if (!dogId || Number.isNaN(dogId) || !reminderId || Number.isNaN(reminderId)) {
    return badRequest('无效的参数');
  }

  try {
    const body = await request.json<{
      last_date?: string;
      cycle_days?: number;
      notes?: string | null;
    }>();

    // 验证狗狗属于当前用户
    const dog = await env.DB.prepare('SELECT user_id FROM dogs WHERE id = ?').bind(dogId).first<{ user_id: number }>();
    if (!dog || dog.user_id !== userId) {
      return notFound('未找到该狗狗档案');
    }

    // 获取现有提醒
    const existing = await env.DB.prepare(
      'SELECT * FROM reminders WHERE id = ? AND dog_id = ?'
    )
      .bind(reminderId, dogId)
      .first<{
        reminder_type: string;
        cycle_days: number;
      }>();

    if (!existing) {
      return notFound('未找到该提醒');
    }

    const lastDate = body.last_date || null;
    const cycleDays = body.cycle_days ?? existing.cycle_days;
    const notes = body.notes !== undefined ? body.notes : null;

    // 计算下次提醒日期
    let nextDate = null;
    if (lastDate) {
      const lastDateObj = new Date(lastDate);
      const nextDateObj = new Date(lastDateObj);
      nextDateObj.setDate(nextDateObj.getDate() + cycleDays);
      nextDate = nextDateObj.toISOString().split('T')[0];
    }

    // 更新提醒
    await env.DB.prepare(
      `UPDATE reminders 
       SET last_date = ?, next_date = ?, cycle_days = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(lastDate, nextDate, cycleDays, notes, reminderId)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM reminders WHERE id = ?')
      .bind(reminderId)
      .first();

    return json(updated);
  } catch (error) {
    console.error('更新提醒失败:', error);
    return badRequest('更新提醒失败');
  }
};

// 删除提醒
export const onRequestDelete = async ({ request, env, params }) => {
  const authResult = await requireAuth(env, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const dogId = Number(params.id);
  const reminderId = Number(params.reminderId);

  if (!dogId || Number.isNaN(dogId) || !reminderId || Number.isNaN(reminderId)) {
    return badRequest('无效的参数');
  }

  try {
    // 验证狗狗属于当前用户
    const dog = await env.DB.prepare('SELECT user_id FROM dogs WHERE id = ?').bind(dogId).first<{ user_id: number }>();
    if (!dog || dog.user_id !== userId) {
      return notFound('未找到该狗狗档案');
    }

    // 删除提醒
    await env.DB.prepare('DELETE FROM reminders WHERE id = ? AND dog_id = ?')
      .bind(reminderId, dogId)
      .run();

    return json({ success: true });
  } catch (error) {
    console.error('删除提醒失败:', error);
    return badRequest('删除提醒失败');
  }
};

