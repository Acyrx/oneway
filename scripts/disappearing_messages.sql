-- Disappearing Messages
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS disappear_after INTEGER DEFAULT NULL;
-- seconds: null = off, 3600 = 1h, 86400 = 24h, 604800 = 7d, 2592000 = 30d

ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS messages_expires_at_idx ON messages(expires_at) WHERE expires_at IS NOT NULL;
