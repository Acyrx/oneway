-- Group chat features: archive, folders, push subscriptions
-- Run in Supabase Dashboard → SQL Editor

-- ── Archived conversations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS archived_conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, conversation_id)
);
ALTER TABLE archived_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own archives" ON archived_conversations
  FOR ALL USING (user_id = auth.uid());

-- ── Chat folders ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_folders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT DEFAULT '#6366f1',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE chat_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own folders" ON chat_folders
  FOR ALL USING (user_id = auth.uid());

-- ── Folder → conversation mapping ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS folder_conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  folder_id UUID REFERENCES chat_folders(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  UNIQUE(folder_id, conversation_id)
);
ALTER TABLE folder_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own folder conversations" ON folder_conversations
  FOR ALL USING (user_id = auth.uid());

-- ── Push notification subscriptions ──────────────────────────────────────────
-- Stores the browser's PushSubscription so the edge function can send pushes.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, endpoint)
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- ── Helpful indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS archived_conversations_user_id_idx ON archived_conversations(user_id);
CREATE INDEX IF NOT EXISTS folder_conversations_user_id_idx ON folder_conversations(user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions(user_id);
