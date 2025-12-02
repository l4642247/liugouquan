import { json, badRequest, notFound, requireAuth } from '../../../_utils';

// 获取狗狗的所有提醒
export const onRequestGet = async ({ request, env, params }) => {
  const authResult = await requireAuth(env, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const dogId = Number(params.id);
  if (!dogId || Number.isNaN(dogId)) {
    return badRequest('无效的狗狗ID');
  }

  try {
    // 验证狗狗属于当前用户
    const dog = await env.DB.prepare('SELECT user_id FROM dogs WHERE id = ?').bind(dogId).first<{ user_id: number }>();
    if (!dog || dog.user_id !== userId) {
      return notFound('未找到该狗狗档案');
    }

    // 获取所有提醒
    const reminders = await env.DB.prepare(
      'SELECT * FROM reminders WHERE dog_id = ? ORDER BY reminder_type'
    )
      .bind(dogId)
      .all<{
        id: number;
        dog_id: number;
        reminder_type: string;
        last_date: string | null;
        next_date: string | null;
        cycle_days: number;
        notes: string | null;
        is_enabled: number;
        created_at: string;
        updated_at: string;
      }>();

    return json(reminders.results || []);
  } catch (error) {
    console.error('获取提醒失败:', error);
    return badRequest('获取提醒失败');
  }
};

// 创建新提醒
export const onRequestPost = async ({ request, env, params }) => {
  const authResult = await requireAuth(env, request);
  if (authResult instanceof Response) return authResult;
  const { userId } = authResult;

  const dogId = Number(params.id);
  if (!dogId || Number.isNaN(dogId)) {
    return badRequest('无效的狗狗ID');
  }

  try {
    const body = await request.json<{
      reminder_type: string;
      last_date: string;
      cycle_days: number;
      notes?: string | null;
    }>();

    const { reminder_type, last_date, cycle_days, notes } = body;

    if (!reminder_type || !['deworming', 'vaccination', 'bath'].includes(reminder_type)) {
      return badRequest(`无效的提醒类型: ${reminder_type}`);
    }

    if (!last_date) {
      return badRequest(`请提供执行日期: ${last_date}`);
    }

    if (!cycle_days || cycle_days < 1) {
      return badRequest(`周期天数必须大于0: ${cycle_days}`);
    }

    // 验证狗狗属于当前用户
    const dog = await env.DB.prepare('SELECT user_id FROM dogs WHERE id = ?').bind(dogId).first<{ user_id: number }>();
    if (!dog || dog.user_id !== userId) {
      return notFound('未找到该狗狗档案');
    }

    // 计算下次提醒日期
    const lastDate = new Date(last_date);
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + cycle_days);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    // 检查是否已存在该类型的提醒
    const existing = await env.DB.prepare(
      'SELECT id FROM reminders WHERE dog_id = ? AND reminder_type = ?'
    )
      .bind(dogId, reminder_type)
      .first<{ id: number }>();

    if (existing) {
      // 更新现有提醒
      const result = await env.DB.prepare(
        `UPDATE reminders 
         SET last_date = ?, next_date = ?, cycle_days = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(last_date, nextDateStr, cycle_days, notes || null, existing.id)
        .run();

      const updated = await env.DB.prepare('SELECT * FROM reminders WHERE id = ?')
        .bind(existing.id)
        .first();

      return json(updated);
    } else {
      // 创建新提醒
      const result = await env.DB.prepare(
        `INSERT INTO reminders (dog_id, reminder_type, last_date, next_date, cycle_days, notes, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, 1)`
      )
        .bind(dogId, reminder_type, last_date, nextDateStr, cycle_days, notes || null)
        .run();

      const created = await env.DB.prepare('SELECT * FROM reminders WHERE id = ?')
        .bind(result.meta.last_row_id)
        .first();

      return json(created, { status: 201 });
    }
  } catch (error) {
    console.error('创建提醒失败:', error);
    // 临时：返回详细错误信息以便调试
    return badRequest(`创建提醒失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

