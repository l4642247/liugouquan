-- 添加动态类型支持：晒一晒(share)、随缘遇(wander)、约遛遛(meetup)

-- 为 posts 表添加新字段
ALTER TABLE posts ADD COLUMN post_type TEXT DEFAULT 'share';
-- 'share' = 晒一晒, 'wander' = 随缘遇, 'meetup' = 约遛遛

ALTER TABLE posts ADD COLUMN meetup_location_name TEXT;
-- 约遛遛地点名称

ALTER TABLE posts ADD COLUMN meetup_duration INTEGER;
-- 预计时长（分钟）

ALTER TABLE posts ADD COLUMN meetup_start_time TEXT;
-- 开始时间

ALTER TABLE posts ADD COLUMN meetup_status TEXT DEFAULT 'open';
-- 'open' = 开放中, 'matched' = 已匹配, 'completed' = 已完成, 'cancelled' = 已取消

-- 为 greetings 表添加新字段
ALTER TABLE greetings ADD COLUMN greeting_type TEXT DEFAULT 'hi';
-- 'hi' = 普通打招呼, 'respond' = 响应邀约, 'accept' = 接受响应

ALTER TABLE greetings ADD COLUMN post_id INTEGER;
-- 关联的动态ID（约遛遛场景）

ALTER TABLE greetings ADD COLUMN status TEXT DEFAULT 'pending';
-- 'pending' = 待处理, 'accepted' = 已接受, 'rejected' = 已拒绝

-- 创建索引用于打招呼频率限制查询
CREATE INDEX IF NOT EXISTS idx_greetings_frequency ON greetings(sender_id, receiver_id, created_at);

-- 创建索引用于查询动态的响应
CREATE INDEX IF NOT EXISTS idx_greetings_post ON greetings(post_id, greeting_type);

