-- Group chats with admin roles (WhatsApp-style)
-- Run in Supabase SQL Editor after your base schema exists.

-- ── Conversation columns ─────────────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_type_check CHECK (type IN ('direct', 'group'));

-- Allow null participants for group chats
ALTER TABLE conversations ALTER COLUMN participant_1 DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN participant_2 DROP NOT NULL;

-- ── Members table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation_id
  ON conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user_id
  ON conversation_members(user_id);

ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;

-- ── Helpers ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv_id AND user_id = uid
  )
  OR EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conv_id
      AND (c.participant_1 = uid OR c.participant_2 = uid)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_admin(conv_id UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = conv_id AND user_id = uid AND role = 'admin'
  );
$$;

-- ── Backfill direct chat members from legacy participant columns ───────────────
INSERT INTO conversation_members (conversation_id, user_id, role)
SELECT c.id, c.participant_1, 'member'
FROM conversations c
WHERE c.participant_1 IS NOT NULL
  AND c.type = 'direct'
ON CONFLICT (conversation_id, user_id) DO NOTHING;

INSERT INTO conversation_members (conversation_id, user_id, role)
SELECT c.id, c.participant_2, 'member'
FROM conversations c
WHERE c.participant_2 IS NOT NULL
  AND c.type = 'direct'
ON CONFLICT (conversation_id, user_id) DO NOTHING;

-- ── conversation_members RLS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members can view conversation membership" ON conversation_members;
CREATE POLICY "Members can view conversation membership"
  ON conversation_members FOR SELECT
  USING (public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Creator can add initial group members" ON conversation_members;
CREATE POLICY "Creator can add initial group members"
  ON conversation_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND c.created_by = auth.uid()
        AND c.type = 'group'
    )
  );

DROP POLICY IF EXISTS "Admins can add members" ON conversation_members;
CREATE POLICY "Admins can add members"
  ON conversation_members FOR INSERT
  WITH CHECK (public.is_conversation_admin(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Admins can update member roles" ON conversation_members;
CREATE POLICY "Admins can update member roles"
  ON conversation_members FOR UPDATE
  USING (public.is_conversation_admin(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Admins can remove members or users can leave" ON conversation_members;
CREATE POLICY "Admins can remove members or users can leave"
  ON conversation_members FOR DELETE
  USING (
    public.is_conversation_admin(conversation_id, auth.uid())
    OR user_id = auth.uid()
  );

-- ── conversations RLS (add member-based access; keep legacy if policies exist) ─
DROP POLICY IF EXISTS "Users can view conversations they belong to" ON conversations;
CREATE POLICY "Users can view conversations they belong to"
  ON conversations FOR SELECT
  USING (public.is_conversation_member(id, auth.uid()));

DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
CREATE POLICY "Users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    OR auth.uid() = participant_1
    OR (type = 'direct' AND (auth.uid() = participant_1 OR auth.uid() = participant_2))
  );

DROP POLICY IF EXISTS "Admins can update group conversations" ON conversations;
CREATE POLICY "Admins can update group conversations"
  ON conversations FOR UPDATE
  USING (
    type = 'group' AND public.is_conversation_admin(id, auth.uid())
  );

-- ── messages RLS (member-based) ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  USING (public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "Users can send messages in their conversations" ON messages;
CREATE POLICY "Users can send messages in their conversations"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_member(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
CREATE POLICY "Users can update their own messages"
  ON messages FOR UPDATE
  USING (auth.uid() = sender_id);

-- Enable realtime for group membership updates (optional, run if needed)
-- ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;
