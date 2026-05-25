-- Starred / favourite messages (per-user bookmarks)
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS starred_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  starred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, message_id)
);

ALTER TABLE starred_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stars" ON starred_messages
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS starred_messages_user_id_idx ON starred_messages(user_id);
