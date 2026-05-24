-- Fix RLS policy for conversation_members to allow creators to add initial members
-- This addresses the issue where direct chats could not have members added by the creator.

DROP POLICY IF EXISTS "Creator can add initial members" ON conversation_members;
CREATE POLICY "Creator can add initial members"
  ON conversation_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND c.created_by = auth.uid()
    )
  );

-- Update the existing "Creator can add initial group members" policy to be redundant 
-- or just remove it in favor of the more general one above.
DROP POLICY IF EXISTS "Creator can add initial group members" ON conversation_members;
