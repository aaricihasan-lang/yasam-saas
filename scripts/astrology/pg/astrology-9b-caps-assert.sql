-- ASTROLOJİ 9B-P3-01 — 000600 kayıt tavanı trigger'ı (uygulama rolüyle; SENTETİK). Tam sınır, başka uzman / tenant,
-- güncelleme ve silme serbest, silince yer açılır. (Eşzamanlılık ayrıca cap-concurrency.mjs ile iki+ bağlantıda sınanır.)
SET ROLE service_role;
DO $$
DECLARE
  ta uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tb uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  u uuid := 'c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9';
  u2 uuid := 'c8c8c8c8-c8c8-4c8c-8c8c-c8c8c8c8c8c8';
  r jsonb; p uuid; i int; blocked boolean; first_kb uuid; n bigint;
BEGIN
  -- Bilgi Bankası: 1000
  FOR i IN 1..1000 LOOP
    INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body) VALUES (ta, u, 'western', 'planet_in_sign:sun:cancer', 'K' || i, 'gövde');
  END LOOP;
  blocked := false;
  BEGIN
    INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body) VALUES (ta, u, 'western', 'planet_in_sign:sun:cancer', 'fazla', 'gövde');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ASTRO_RECORD_CAP:astro_kb_entries:1000%' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION '9B cap: 1001. KB kaydı engellenmedi'; END IF;
  SELECT count(*) INTO n FROM public.astro_kb_entries WHERE owner_user_id = u; IF n <> 1000 THEN RAISE EXCEPTION '9B cap: KB sayısı %', n; END IF;
  SELECT id INTO first_kb FROM public.astro_kb_entries WHERE owner_user_id = u ORDER BY title LIMIT 1;
  UPDATE public.astro_kb_entries SET body = 'güncellendi' WHERE id = first_kb;                         -- güncelleme serbest
  INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body) VALUES (ta, u2, 'western', 'planet_in_sign:sun:cancer', 'başka uzman', 'g'); -- başka uzman serbest
  INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body) VALUES (tb, u, 'western', 'planet_in_sign:sun:cancer', 'başka tenant', 'g'); -- başka tenant serbest
  DELETE FROM public.astro_kb_entries WHERE id = first_kb;                                             -- silme serbest
  INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body) VALUES (ta, u, 'western', 'planet_in_sign:sun:cancer', 'yer açıldı', 'g');

  -- Doğum profili: 2000
  FOR i IN 1..2000 LOOP
    r := public.astro_profile_create(ta, u, NULL, 'P' || i, '1990-01-01', NULL, false, 'unknown', NULL, 'Bursa', 40.2, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-01-01T09:00:00Z');
    IF i = 1 THEN p := (r->>'profile_id')::uuid; END IF;
  END LOOP;
  blocked := false;
  BEGIN
    r := public.astro_profile_create(ta, u, NULL, 'fazla', '1990-01-01', NULL, false, 'unknown', NULL, 'Bursa', 40.2, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-01-01T09:00:00Z');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ASTRO_RECORD_CAP:astro_birth_profiles:2000%' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION '9B cap: 2001. profil engellenmedi'; END IF;

  -- Kayıtlı analiz: 3000
  FOR i IN 1..3000 LOOP
    PERFORM public.astro_analysis_save_v2(ta, u, p, 1, NULL, NULL, NULL, 'western.natal', 'A' || i, gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  END LOOP;
  blocked := false;
  BEGIN
    PERFORM public.astro_analysis_save_v2(ta, u, p, 1, NULL, NULL, NULL, 'western.natal', 'fazla', gen_random_uuid(), '{}', '{}', '{}', '{}', '[]', false, NULL, '{}', '[]');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ASTRO_RECORD_CAP:astro_analyses:3000%' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION '9B cap: 3001. analiz engellenmedi'; END IF;

  -- Danışan notu: 10000 (farklı bağlam anahtarları)
  FOR i IN 1..10000 LOOP
    INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, context_key, section_key, body) VALUES (ta, u, p, 'western.synastry', gen_random_uuid()::text, 'overall', 'n');
  END LOOP;
  blocked := false;
  BEGIN
    INSERT INTO public.astro_expert_notes (tenant_id, owner_user_id, profile_id, technique, context_key, section_key, body) VALUES (ta, u, p, 'western.natal', '', 'overall', 'fazla');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ASTRO_RECORD_CAP:astro_expert_notes:10000%' THEN RAISE; END IF;
    blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION '9B cap: 10001. not engellenmedi'; END IF;
  UPDATE public.astro_expert_notes SET body = 'güncellendi', revision = revision + 1 WHERE owner_user_id = u AND technique = 'western.synastry' AND ctid IN (SELECT ctid FROM public.astro_expert_notes WHERE owner_user_id = u LIMIT 1);
END $$;
RESET ROLE;
