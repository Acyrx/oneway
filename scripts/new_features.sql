-- Run this in your Supabase SQL editor to enable the new features.
-- Also create a Storage bucket called "chat-files" set to Public in the Supabase dashboard.

-- Add public key column for E2E encryption
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_key TEXT;

-- Blocked users
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(blocker_id, blocked_id)
);
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own blocks" ON blocked_users FOR ALL USING (blocker_id = auth.uid());

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reported_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can submit reports" ON reports FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- Muted conversations
CREATE TABLE IF NOT EXISTS muted_conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, conversation_id)
);
ALTER TABLE muted_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mutes" ON muted_conversations FOR ALL USING (user_id = auth.uid());
