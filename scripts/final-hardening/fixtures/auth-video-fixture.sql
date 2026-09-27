-- AUTH item 11 fixture: prod'daki video-temp durumunun minimal kopyası (yerel embedded-postgres).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('video-temp', 'video-temp', false, 5368709120, NULL)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 5368709120, allowed_mime_types = NULL;
INSERT INTO storage.buckets (id, name, public) VALUES ('stone-photos', 'stone-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS video_temp_insert ON storage.objects;
DROP POLICY IF EXISTS video_temp_select ON storage.objects;
DROP POLICY IF EXISTS video_temp_legacy_named ON storage.objects;
DROP POLICY IF EXISTS stone_photos_keep ON storage.objects;
CREATE POLICY video_temp_insert ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'video-temp' AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/');
CREATE POLICY video_temp_select ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'video-temp' AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/');
-- Adı farklı ama video-temp'e atıf yapan politika da yakalanmalı.
CREATE POLICY video_temp_legacy_named ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'video-temp');
-- Başka bucket politikasına DOKUNULMAMALI.
CREATE POLICY stone_photos_keep ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'stone-photos');

INSERT INTO storage.objects (bucket_id, name, created_at)
VALUES ('video-temp', '11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/old.mp4', now() - interval '30 days');
