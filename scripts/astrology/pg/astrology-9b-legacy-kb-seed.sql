-- ASTROLOJİ 9B-P2-01 — eski (Bilgi Bankası kopyalı) analizler: 000700 temizliğinden ÖNCE durum (SENTETİK).
-- 000000–000500 uygulanmış şemaya yazılır; temizlik öncesi tüm diğer kolonların ve notların parmak izi kaydedilir.
CREATE SCHEMA IF NOT EXISTS test9b;
CREATE TABLE IF NOT EXISTS test9b.before (title text PRIMARY KEY, other_fp text, kb jsonb, notes_fp text);

SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  u uuid := 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1';
  r jsonb; a uuid; b uuid;
  kb_ok jsonb := '[{"entryId":"00000000-0000-4000-8000-000000000001","tradition":"western","topicKey":"planet_in_sign:sun:cancer","topicLabel":"Güneş Yengeç","title":"Genel bilgi 1","body":"Genel açıklama — ğüşıöç","sourceNote":null,"tags":["a"],"revision":1,"updatedAt":"2026-10-01T10:00:00Z"},{"entryId":"00000000-0000-4000-8000-000000000002","tradition":"western","topicKey":"planet_in_house:moon:4","topicLabel":"Ay 4. ev","title":"Genel bilgi 2","body":"Başka genel açıklama","sourceNote":"kaynak","tags":[],"revision":3,"updatedAt":"2026-10-02T10:00:00Z"}]';
BEGIN
  r := public.astro_profile_create(ta, u, NULL, 'Eski A', '1980-04-04', '09:00', true, 'exact_record', NULL, 'İzmir', 38.4, 27.1, 'Europe/Istanbul', 'auto', 10800, '1980-04-04T06:00:00Z'); a := (r->>'profile_id')::uuid;
  r := public.astro_profile_create(ta, u, NULL, 'Eski B', '1984-08-08', '10:00', true, 'exact_record', NULL, 'Ankara', 39.9, 32.8, 'Europe/Istanbul', 'auto', 10800, '1984-08-08T07:00:00Z'); b := (r->>'profile_id')::uuid;
  -- 1) natal: KB kopyalı + Roxy yorumlu + danışana özel not → KB boşaltılmalı, gerisi aynı
  PERFORM public.astro_analysis_save_v2(ta, u, a, 1, NULL, NULL, NULL, 'western.natal', 'K1 natal kb', gen_random_uuid(), '{}', '{"label":"Eski A"}', '{"zodiac":"tropical"}', '{"bodies":[{"id":"sun"}]}', kb_ok, true, '{"provider":"roxy","content":{"summary":"Roxy natal yorumu"}}', '{"snapshotSchema":"astro.analysis.v2"}', '[{"section_key":"overall","body":"A için danışana özel not"}]');
  -- 2) sinastri (karşı taraf B): KB kopyalı → boşaltılmalı; profil snapshot'ı (karşı taraf) aynı
  PERFORM public.astro_analysis_save_v2(ta, u, a, 1, b, 1, NULL, 'western.synastry', 'K2 sinastri kb', gen_random_uuid(), '{"partnerProfileId":"x"}', '{"label":"Eski A","partner":{"label":"Eski B","revision":{"birthDate":"1984-08-08"}}}', '{}', '{"aspects":[{"a":"sun","b":"moon"}]}', kb_ok, false, NULL, '{}', '[{"section_key":"overall","body":"A&B ortak not"}]');
  -- 3) tanınmayan biçim (entryId yok) → DOKUNULMAZ
  PERFORM public.astro_analysis_save_v2(ta, u, a, 1, NULL, NULL, NULL, 'western.natal', 'K3 bilinmeyen bicim', gen_random_uuid(), '{}', '{"label":"Eski A"}', '{}', '{}', '[{"title":"başlık","body":"gövde"}]', false, NULL, '{}', '[]');
  -- 4) not benzeri öğe (section_key) karışık → DOKUNULMAZ
  PERFORM public.astro_analysis_save_v2(ta, u, a, 1, NULL, NULL, NULL, 'western.natal', 'K4 not benzeri', gen_random_uuid(), '{}', '{"label":"Eski A"}', '{}', '{}',
    '[{"entryId":"00000000-0000-4000-8000-000000000003","topicKey":"planet_in_sign:sun:cancer","title":"t","body":"b","section_key":"overall"}]', false, NULL, '{}', '[]');
  -- 5) KB'siz (zaten boş) → değişmez
  PERFORM public.astro_analysis_save_v2(ta, u, b, 1, NULL, NULL, NULL, 'western.natal', 'K5 bos kb', gen_random_uuid(), '{}', '{"label":"Eski B"}', '{}', '{}', '[]', false, NULL, '{}', '[{"section_key":"overall","body":"B notu"}]');
  -- 6) dizi içinde nesne olmayan öğe → DOKUNULMAZ
  PERFORM public.astro_analysis_save_v2(ta, u, b, 1, NULL, NULL, NULL, 'western.natal', 'K6 nesne olmayan', gen_random_uuid(), '{}', '{"label":"Eski B"}', '{}', '{}', '["metin"]', false, NULL, '{}', '[]');
END $$;
RESET ROLE;

INSERT INTO test9b.before (title, other_fp, kb, notes_fp)
SELECT a.title,
       md5((to_jsonb(a) - 'kb_snapshot')::text),
       a.kb_snapshot,
       coalesce((SELECT md5(string_agg(n.section_key || '|' || n.body, '#' ORDER BY n.section_key, n.body)) FROM public.astro_analysis_notes n WHERE n.analysis_id = a.id), '-')
  FROM public.astro_analyses a
ON CONFLICT (title) DO NOTHING;
