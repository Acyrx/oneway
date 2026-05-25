-- Storage bucket and policies for file uploads and voice notes.
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor).
--
-- The bucket itself must be created via SQL using the storage API or via the
-- dashboard. The INSERT below handles it idempotently.

-- ── 1. Create the bucket ──────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-files',
  'chat-files',
  true,                         -- public: URLs are accessible without a token
  52428800,                     -- 50 MB per file
  ARRAY[
    -- images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    -- documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    -- archives
    'application/zip',
    'application/x-zip-compressed',
    -- audio (voice notes)
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    -- video
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET
    public            = EXCLUDED.public,
    file_size_limit   = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ── 2. Storage RLS policies ───────────────────────────────────────────────────
-- Supabase Storage uses the storage.objects table. Each policy must target a
-- specific operation (SELECT, INSERT, UPDATE, DELETE).

-- Allow authenticated users to upload files into any conversation folder.
-- The path convention is: {conversation_id}/{timestamp}-{random}.{ext}
-- and for voice notes:    {conversation_id}/voice-{timestamp}.webm
CREATE POLICY "Authenticated users can upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-files');

-- Allow anyone (including anonymous viewers sharing a link) to read files.
-- Because the bucket is public, Supabase already serves objects via the CDN
-- without a token, but this policy lets the JS client download via the SDK too.
CREATE POLICY "Public read access"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'chat-files');

-- Allow the uploader to delete their own files.
-- Files are stored under {conversation_id}/... so we rely on auth.uid() matching
-- the uploader. Supabase records the owner in storage.objects.owner.
CREATE POLICY "Owners can delete their files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND owner = auth.uid()
  );

-- Allow the uploader to replace (update) their own files.
CREATE POLICY "Owners can update their files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND owner = auth.uid()
  );
