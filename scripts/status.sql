-- WhatsApp-style 24-hour statuses
-- Run in Supabase Dashboard → SQL Editor

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS statuses (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'audio')),
  content       TEXT,           -- URL for media; raw text for text statuses
  caption       TEXT,
  bg_color      TEXT DEFAULT '#128C7E',
  text_color    TEXT DEFAULT '#FFFFFF',
  duration      INTEGER NOT NULL DEFAULT 5,   -- seconds to display
  file_size     INTEGER,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS status_views (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  status_id   UUID REFERENCES statuses(id) ON DELETE CASCADE NOT NULL,
  viewer_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (status_id, viewer_id)
);

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE statuses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_views ENABLE ROW LEVEL SECURITY;

-- Owners manage their own statuses
CREATE POLICY "owners_manage_statuses" ON statuses
  FOR ALL USING (user_id = auth.uid());

-- Contacts (people who share a conversation) can read non-expired statuses
CREATE POLICY "contacts_read_statuses" ON statuses
  FOR SELECT USING (
    expires_at > NOW()
    AND EXISTS (
      SELECT 1 FROM conversation_members cm1
      JOIN conversation_members cm2
        ON cm1.conversation_id = cm2.conversation_id
      WHERE cm1.user_id = auth.uid()
        AND cm2.user_id = statuses.user_id
    )
  );

-- Viewers can read views on statuses they own or views they created
CREATE POLICY "read_status_views" ON status_views
  FOR SELECT USING (
    viewer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM statuses WHERE id = status_id AND user_id = auth.uid())
  );

CREATE POLICY "insert_own_views" ON status_views
  FOR INSERT WITH CHECK (viewer_id = auth.uid());

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS statuses_user_id_idx    ON statuses(user_id);
CREATE INDEX IF NOT EXISTS statuses_expires_at_idx ON statuses(expires_at);
CREATE INDEX IF NOT EXISTS status_views_status_idx ON status_views(status_id);
CREATE INDEX IF NOT EXISTS status_views_viewer_idx ON status_views(viewer_id);

-- ── Storage bucket ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'status-media', 'status-media', true, 52428800,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/webm','video/quicktime',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg'
  ]
) ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg','image/png','image/gif','image/webp',
    'video/mp4','video/webm','video/quicktime',
    'audio/webm','audio/ogg','audio/mp4','audio/mpeg'
  ];

DROP POLICY IF EXISTS "auth_upload_status_media"  ON storage.objects;
DROP POLICY IF EXISTS "public_read_status_media"   ON storage.objects;
DROP POLICY IF EXISTS "owner_delete_status_media"  ON storage.objects;

CREATE POLICY "auth_upload_status_media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'status-media');

CREATE POLICY "public_read_status_media" ON storage.objects
  FOR SELECT USING (bucket_id = 'status-media');

CREATE POLICY "owner_delete_status_media" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'status-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
