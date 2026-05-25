-- Add voice_note to messages_message_type_check constraint
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE messages
ADD CONSTRAINT messages_message_type_check
CHECK (message_type IN (
  'text', 'gif', 'sticker', 'file', 'image',
  'poll', 'task', 'calendar_event', 'reminder',
  'voice_note'
));
