-- 添加提醒功能表

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dog_id INTEGER NOT NULL,
  reminder_type TEXT NOT NULL, -- 'deworming', 'vaccination', 'bath'
  last_date TEXT, -- 上次执行日期
  next_date TEXT, -- 下次提醒日期
  cycle_days INTEGER NOT NULL, -- 周期天数
  notes TEXT, -- 备注
  is_enabled INTEGER DEFAULT 1, -- 是否启用
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminders_dog_id ON reminders(dog_id);
CREATE INDEX IF NOT EXISTS idx_reminders_next_date ON reminders(next_date);

-- 移除 dogs 表中的 vaccination_status 和 notes 字段（通过 ALTER TABLE 不支持删除列，需要重建表）
-- 由于 SQLite 的限制，这里先保留字段，后续可以通过应用层忽略这些字段

