-- Add presence_status column to profiles so online status persists to DB
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS presence_status TEXT DEFAULT 'online';

-- Allow users to update their own presence fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON profiles
      FOR UPDATE USING (id = auth.uid());
  END IF;
END $$;
