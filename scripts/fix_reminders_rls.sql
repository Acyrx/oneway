-- Allow both conversation participants to see reminders in chat.
-- Run this in the Supabase SQL editor if reminders only show for the assignee.

DROP POLICY IF EXISTS "Users can view their own reminders" ON reminders;
DROP POLICY IF EXISTS "Users can view reminders in their conversations" ON reminders;

CREATE POLICY "Users can view reminders in their conversations"
  ON reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = reminders.conversation_id
      AND (conversations.participant_1 = auth.uid() OR conversations.participant_2 = auth.uid())
    )
  );
