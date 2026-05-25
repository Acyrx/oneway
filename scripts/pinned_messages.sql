-- Run this in your Supabase SQL editor to enable pinned messages

ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS pinned_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  pinned_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pinned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  message_text TEXT,
  message_type TEXT DEFAULT 'text',
  UNIQUE(conversation_id, message_id)
);

ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pinned messages" ON pinned_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can pin messages" ON pinned_messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
    AND pinned_by = auth.uid()
  );

CREATE POLICY "Members can unpin messages" ON pinned_messages
  FOR DELETE USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_members WHERE user_id = auth.uid()
    )
  );
