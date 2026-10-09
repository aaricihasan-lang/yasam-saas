-- =============================================================================
-- 20271101000300_astrology_owner_isolation.sql   [ADDITIVE + KISIT SIKILAŞTIRMA — VERİ SİLMEZ]
--
-- ASTROLOJİ — AŞAMA 7A: UZMAN VERİ İZOLASYONU + DANIŞAN SİLME GÜVENLİĞİ. SATIŞ SONRASI, OWNER-ONLY.
--
-- 1) UZMAN SAHİPLİĞİ (DB'de zorunlu):
--    Yaşam Sistemi'nde güvenlik sınırı tenant'tır ve provision_expert her uzmana ayrı tenant açar;
--    ANCAK users.tenant_id üzerinde tekillik YOKTUR (aynı tenant'ta birden çok kullanıcı DB'de
--    mümkündür: kanonik demo tenant'ı, eski/elle oluşturulmuş hesaplar). Astroloji bu varsayıma
--    güvenmez: doğum profili, revizyon, sağlayıcı sonucu (önbellek) ve sağlayıcı yorumu artık
--    owner_user_id taşır; bileşik FK'ler (tenant_id, owner_user_id, …) bir uzmanın kaydının başka
--    uzmanın profiline/sonucuna bağlanmasını DB düzeyinde reddeder. KB / çalışma notu / kayıtlı
--    analiz zaten owner_user_id taşıyordu → profil sahipliğiyle tutarlılık FK'si eklenir.
--    Önbellek anahtarı (tenant_id, input_hash) → (tenant_id, owner_user_id, input_hash).
--
-- 2) DANIŞAN SİLME: astro_birth_profiles / astro_analyses → clients FK'leri ON DELETE CASCADE idi;
--    Danışan silme (app/api/clients/[id]/cascade-delete → tek DELETE FROM clients) astroloji
--    profillerini, revizyonlarını, sonuçlarını, yorumlarını ve KAYITLI ANALİZLERİNİ siliyordu.
--    Ürün kararı: Astroloji bağımsızdır → FK'ler ON DELETE SET NULL (client_id). Danışan silinince
--    yalnız BAĞ kopar; astroloji kayıtları korunur. Kayıtlı analizin değişmez snapshot'ı kayıt
--    anındaki danışan adını taşımaya devam eder (snapshot DEĞİŞTİRİLMEZ).
--
-- GERİ DOLDURMA: profil sahibi = created_by_user_id; revizyon/sonuç sahibi = profilin sahibi; yorum
--   sahibi = sonucun sahibi. Sahipliği tutarsız mevcut satır (ör. bir uzmanın sinastrisinde başka
--   uzmanın profili) varsa migration FAIL-CLOSED DURUR — hiçbir satır silinmez/değiştirilmez;
--   karar owner'ındır.
--
-- RPC'ler: astro_profile_create / astro_profile_append_revision / astro_analysis_save_v2 aynı imzayla
--   yeniden tanımlanır (sahiplik yazılır ve kontrol edilir). astro_analysis_save (v1) kodda
--   kullanılmaz; bileşik FK onu da kapsar.
--
-- PRECONDITION: 20271101000000 / 000100 / 000200.
-- VERİ-YIKICI MI: HAYIR (yalnız kolon ekleme, geri doldurma, kısıt değişimi). İDEMPOTENT: EVET.
-- ⚠️ PRODUCTION'A UYGULANMADI (work/astrology-roxy, Aşama 7A yerel).
--
-- GERİ ALMA (gerekirse, sırayla):
--   ALTER TABLE public.astro_birth_profiles DROP CONSTRAINT astro_bp_client_fk;  (+ CASCADE ile geri ekle)
--   ALTER TABLE public.astro_analyses       DROP CONSTRAINT astro_an_client_fk;  (+ CASCADE ile geri ekle)
--   owner FK/UNIQUE'leri DROP; astro_pr_tenant_hash_key UNIQUE (tenant_id, input_hash) geri ekle
--   (yalnız tenant başına tek uzman varken mümkündür); owner_user_id kolonları DROP; RPC'leri
--   20271101000000 / 000200 tanımlarıyla yeniden oluştur.
-- =============================================================================

BEGIN;

-- ─── 0) Precondition ─────────────────────────────────────────────────────────
DO $pre$
BEGIN
  IF to_regclass('public.astro_birth_profiles') IS NULL OR to_regclass('public.astro_analyses') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                    AND table_name = 'astro_analyses' AND column_name = 'partner_profile_id') THEN
    RAISE EXCEPTION 'ASTRO 7A: önce 20271101000000/000100/000200 uygulanmalı';
  END IF;
END
$pre$;

-- ─── 1) Sahiplik kolonları + geri doldurma ───────────────────────────────────
ALTER TABLE public.astro_birth_profiles            ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.astro_birth_profile_revisions   ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.astro_provider_results          ADD COLUMN IF NOT EXISTS owner_user_id uuid;
ALTER TABLE public.astro_provider_interpretations  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

UPDATE public.astro_birth_profiles SET owner_user_id = created_by_user_id WHERE owner_user_id IS NULL;

UPDATE public.astro_birth_profile_revisions r SET owner_user_id = p.owner_user_id
  FROM public.astro_birth_profiles p
 WHERE r.owner_user_id IS NULL AND p.tenant_id = r.tenant_id AND p.id = r.profile_id;

UPDATE public.astro_provider_results x SET owner_user_id = p.owner_user_id
  FROM public.astro_birth_profiles p
 WHERE x.owner_user_id IS NULL AND p.tenant_id = x.tenant_id AND p.id = x.profile_id;

UPDATE public.astro_provider_interpretations i SET owner_user_id = x.owner_user_id
  FROM public.astro_provider_results x
 WHERE i.owner_user_id IS NULL AND x.tenant_id = i.tenant_id AND x.id = i.result_id;

ALTER TABLE public.astro_birth_profiles           ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE public.astro_birth_profile_revisions  ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE public.astro_provider_results         ALTER COLUMN owner_user_id SET NOT NULL;
ALTER TABLE public.astro_provider_interpretations ALTER COLUMN owner_user_id SET NOT NULL;

-- ─── 2) FAIL-CLOSED: sahipliği tutarsız mevcut satır var mı? (varsa DUR, veri değişmez) ──────
DO $chk$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.astro_provider_results x
    JOIN public.astro_birth_profiles p ON p.tenant_id = x.tenant_id AND p.id = x.partner_profile_id
   WHERE x.partner_profile_id IS NOT NULL AND p.owner_user_id <> x.owner_user_id;
  IF n > 0 THEN RAISE EXCEPTION 'ASTRO 7A: % sağlayıcı sonucu başka uzmanın karşı taraf profilini kullanıyor — owner kararı gerekli', n; END IF;

  SELECT count(*) INTO n FROM public.astro_analyses a
    JOIN public.astro_birth_profiles p ON p.tenant_id = a.tenant_id AND p.id = a.profile_id
   WHERE p.owner_user_id <> a.owner_user_id;
  IF n > 0 THEN RAISE EXCEPTION 'ASTRO 7A: % kayıtlı analiz başka uzmanın profiline ait — owner kararı gerekli', n; END IF;

  SELECT count(*) INTO n FROM public.astro_analyses a
    JOIN public.astro_birth_profiles p ON p.tenant_id = a.tenant_id AND p.id = a.partner_profile_id
   WHERE a.partner_profile_id IS NOT NULL AND p.owner_user_id <> a.owner_user_id;
  IF n > 0 THEN RAISE EXCEPTION 'ASTRO 7A: % kayıtlı analiz başka uzmanın karşı taraf profilini kullanıyor — owner kararı gerekli', n; END IF;

  SELECT count(*) INTO n FROM public.astro_expert_notes e
    JOIN public.astro_birth_profiles p ON p.tenant_id = e.tenant_id AND p.id = e.profile_id
   WHERE p.owner_user_id <> e.owner_user_id;
  IF n > 0 THEN RAISE EXCEPTION 'ASTRO 7A: % çalışma notu başka uzmanın profiline yazılmış — owner kararı gerekli', n; END IF;
END
$chk$;

-- ─── 3) Sahiplik kısıtları (bileşik anahtar + FK) ───────────────────────────
DO $own$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_bp_owner_key' AND conrelid = 'public.astro_birth_profiles'::regclass) THEN
    ALTER TABLE public.astro_birth_profiles ADD CONSTRAINT astro_bp_owner_key UNIQUE (tenant_id, owner_user_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_bpr_owner_fk' AND conrelid = 'public.astro_birth_profile_revisions'::regclass) THEN
    ALTER TABLE public.astro_birth_profile_revisions ADD CONSTRAINT astro_bpr_owner_fk
      FOREIGN KEY (tenant_id, owner_user_id, profile_id)
      REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id) ON DELETE CASCADE;
  END IF;

  -- Önbellek: uzman başına tekil (aynı tenant'taki iki uzman aynı sonucu PAYLAŞMAZ).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_owner_hash_key' AND conrelid = 'public.astro_provider_results'::regclass) THEN
    ALTER TABLE public.astro_provider_results ADD CONSTRAINT astro_pr_owner_hash_key UNIQUE (tenant_id, owner_user_id, input_hash);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_tenant_hash_key' AND conrelid = 'public.astro_provider_results'::regclass) THEN
    ALTER TABLE public.astro_provider_results DROP CONSTRAINT astro_pr_tenant_hash_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_owner_id_key' AND conrelid = 'public.astro_provider_results'::regclass) THEN
    ALTER TABLE public.astro_provider_results ADD CONSTRAINT astro_pr_owner_id_key UNIQUE (tenant_id, owner_user_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_owner_fk' AND conrelid = 'public.astro_provider_results'::regclass) THEN
    ALTER TABLE public.astro_provider_results ADD CONSTRAINT astro_pr_owner_fk
      FOREIGN KEY (tenant_id, owner_user_id, profile_id)
      REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id) ON DELETE CASCADE;
  END IF;
  -- partner_profile_id NULL → MATCH SIMPLE gereği denetlenmez.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_partner_owner_fk' AND conrelid = 'public.astro_provider_results'::regclass) THEN
    ALTER TABLE public.astro_provider_results ADD CONSTRAINT astro_pr_partner_owner_fk
      FOREIGN KEY (tenant_id, owner_user_id, partner_profile_id)
      REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pi_owner_fk' AND conrelid = 'public.astro_provider_interpretations'::regclass) THEN
    ALTER TABLE public.astro_provider_interpretations ADD CONSTRAINT astro_pi_owner_fk
      FOREIGN KEY (tenant_id, owner_user_id, result_id)
      REFERENCES public.astro_provider_results (tenant_id, owner_user_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_owner_fk' AND conrelid = 'public.astro_analyses'::regclass) THEN
    ALTER TABLE public.astro_analyses ADD CONSTRAINT astro_an_owner_fk
      FOREIGN KEY (tenant_id, owner_user_id, profile_id)
      REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_partner_owner_fk' AND conrelid = 'public.astro_analyses'::regclass) THEN
    ALTER TABLE public.astro_analyses ADD CONSTRAINT astro_an_partner_owner_fk
      FOREIGN KEY (tenant_id, owner_user_id, partner_profile_id)
      REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_en_owner_fk' AND conrelid = 'public.astro_expert_notes'::regclass) THEN
    ALTER TABLE public.astro_expert_notes ADD CONSTRAINT astro_en_owner_fk
      FOREIGN KEY (tenant_id, owner_user_id, profile_id)
      REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id) ON DELETE CASCADE;
  END IF;
END
$own$;

CREATE INDEX IF NOT EXISTS astro_bp_owner_created_idx ON public.astro_birth_profiles (tenant_id, owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS astro_an_owner_profile_idx ON public.astro_analyses (tenant_id, owner_user_id, profile_id, analysis_at DESC);

-- ─── 4) Danışan silme: CASCADE → SET NULL (client_id) ────────────────────────
DO $cli$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_bp_client_fk'
             AND conrelid = 'public.astro_birth_profiles'::regclass AND confdeltype <> 'n') THEN
    ALTER TABLE public.astro_birth_profiles DROP CONSTRAINT astro_bp_client_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_bp_client_fk' AND conrelid = 'public.astro_birth_profiles'::regclass) THEN
    ALTER TABLE public.astro_birth_profiles ADD CONSTRAINT astro_bp_client_fk
      FOREIGN KEY (tenant_id, client_id) REFERENCES public.clients (tenant_id, id) ON DELETE SET NULL (client_id);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_client_fk'
             AND conrelid = 'public.astro_analyses'::regclass AND confdeltype <> 'n') THEN
    ALTER TABLE public.astro_analyses DROP CONSTRAINT astro_an_client_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_client_fk' AND conrelid = 'public.astro_analyses'::regclass) THEN
    ALTER TABLE public.astro_analyses ADD CONSTRAINT astro_an_client_fk
      FOREIGN KEY (tenant_id, client_id) REFERENCES public.clients (tenant_id, id) ON DELETE SET NULL (client_id);
  END IF;
END
$cli$;

COMMENT ON COLUMN public.astro_analyses.event_kind IS
  'Kayıt türü etiketi. Astroloji Danışan Yolculuğu''na BAĞLANMAZ (Aşama 7A ürün kararı); bu kolon entegrasyon için değildir.';
COMMENT ON COLUMN public.astro_birth_profiles.client_id IS
  'Opsiyonel merkezî danışan KİMLİK bağı (yalnız tanıma). Danışan silinince NULL olur; astroloji kaydı korunur.';

-- ─── 5) RPC'ler (aynı imza; sahiplik yazılır + doğrulanır) ───────────────────
CREATE OR REPLACE FUNCTION public.astro_profile_create(
  p_tenant_id uuid,
  p_user_id uuid,
  p_client_id uuid,
  p_label text,
  p_birth_date date,
  p_birth_time time,
  p_time_known boolean,
  p_time_accuracy text,
  p_location_id text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_timezone text,
  p_dst_choice text,
  p_utc_offset_seconds integer,
  p_birth_utc timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ASTRO_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.astro_birth_profiles (tenant_id, owner_user_id, client_id, label, current_revision, created_by_user_id)
  VALUES (p_tenant_id, p_user_id, p_client_id, btrim(p_label), 1, p_user_id)
  RETURNING id INTO v_profile_id;

  INSERT INTO public.astro_birth_profile_revisions (
    tenant_id, owner_user_id, profile_id, revision, birth_date, birth_time, time_known, time_accuracy,
    location_id, location_label, latitude, longitude, timezone, dst_choice,
    utc_offset_seconds, birth_utc, created_by_user_id
  ) VALUES (
    p_tenant_id, p_user_id, v_profile_id, 1, p_birth_date, p_birth_time, p_time_known, p_time_accuracy,
    p_location_id, p_location_label, p_latitude, p_longitude, p_timezone, p_dst_choice,
    p_utc_offset_seconds, p_birth_utc, p_user_id
  );

  RETURN jsonb_build_object('profile_id', v_profile_id, 'revision', 1);
END
$fn$;

CREATE OR REPLACE FUNCTION public.astro_profile_append_revision(
  p_tenant_id uuid,
  p_user_id uuid,
  p_profile_id uuid,
  p_expected_revision integer,
  p_birth_date date,
  p_birth_time time,
  p_time_known boolean,
  p_time_accuracy text,
  p_location_id text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_timezone text,
  p_dst_choice text,
  p_utc_offset_seconds integer,
  p_birth_utc timestamptz,
  p_change_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_current integer;
  v_next integer;
BEGIN
  -- Başka uzmanın profili = yok (varlık sızdırılmaz).
  SELECT current_revision INTO v_current
  FROM public.astro_birth_profiles
  WHERE tenant_id = p_tenant_id AND owner_user_id = p_user_id AND id = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASTRO_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION 'ASTRO_REVISION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  v_next := v_current + 1;

  INSERT INTO public.astro_birth_profile_revisions (
    tenant_id, owner_user_id, profile_id, revision, birth_date, birth_time, time_known, time_accuracy,
    location_id, location_label, latitude, longitude, timezone, dst_choice,
    utc_offset_seconds, birth_utc, change_note, created_by_user_id
  ) VALUES (
    p_tenant_id, p_user_id, p_profile_id, v_next, p_birth_date, p_birth_time, p_time_known, p_time_accuracy,
    p_location_id, p_location_label, p_latitude, p_longitude, p_timezone, p_dst_choice,
    p_utc_offset_seconds, p_birth_utc, NULLIF(btrim(COALESCE(p_change_note, '')), ''), p_user_id
  );

  UPDATE public.astro_birth_profiles
  SET current_revision = v_next
  WHERE tenant_id = p_tenant_id AND owner_user_id = p_user_id AND id = p_profile_id;

  RETURN jsonb_build_object('profile_id', p_profile_id, 'revision', v_next);
END
$fn$;

CREATE OR REPLACE FUNCTION public.astro_analysis_save_v2(
  p_tenant_id uuid,
  p_user_id uuid,
  p_profile_id uuid,
  p_profile_revision integer,
  p_partner_profile_id uuid,
  p_partner_profile_revision integer,
  p_result_ids uuid[],
  p_technique text,
  p_title text,
  p_save_request_id uuid,
  p_technique_params jsonb,
  p_profile_snapshot jsonb,
  p_method_snapshot jsonb,
  p_technical_snapshot jsonb,
  p_kb_snapshot jsonb,
  p_provider_interp_included boolean,
  p_provider_interp_snapshot jsonb,
  p_versions_snapshot jsonb,
  p_notes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_client uuid;
  v_existing uuid;
  n jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ASTRO_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  -- İdempotency yalnız AYNI uzmanın isteğinde (başka uzmanın analiz kimliği dönmez).
  SELECT id INTO v_existing FROM public.astro_analyses
   WHERE tenant_id = p_tenant_id AND owner_user_id = p_user_id AND save_request_id = p_save_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('analysis_id', v_existing, 'reused', true);
  END IF;
  SELECT client_id INTO v_client FROM public.astro_birth_profiles
   WHERE tenant_id = p_tenant_id AND owner_user_id = p_user_id AND id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASTRO_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.astro_analyses (
    tenant_id, owner_user_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision,
    client_id, result_id, result_ids, technique, title, save_request_id, technique_params,
    profile_snapshot, method_snapshot, technical_snapshot, provider_interp_included, provider_interp_snapshot,
    kb_snapshot, versions_snapshot
  ) VALUES (
    p_tenant_id, p_user_id, p_profile_id, p_profile_revision, p_partner_profile_id, p_partner_profile_revision,
    v_client, CASE WHEN cardinality(COALESCE(p_result_ids, '{}')) = 1 THEN p_result_ids[1] ELSE NULL END,
    COALESCE(p_result_ids, '{}'), p_technique, btrim(p_title), p_save_request_id, COALESCE(p_technique_params, '{}'::jsonb),
    p_profile_snapshot, p_method_snapshot, p_technical_snapshot, p_provider_interp_included,
    CASE WHEN p_provider_interp_included THEN p_provider_interp_snapshot ELSE NULL END,
    COALESCE(p_kb_snapshot, '[]'::jsonb), p_versions_snapshot
  ) RETURNING id INTO v_id;

  IF p_notes IS NOT NULL AND jsonb_typeof(p_notes) = 'array' THEN
    FOR n IN SELECT * FROM jsonb_array_elements(p_notes) LOOP
      INSERT INTO public.astro_analysis_notes (tenant_id, analysis_id, section_key, body)
      VALUES (p_tenant_id, v_id, n->>'section_key', n->>'body');
    END LOOP;
  END IF;
  RETURN jsonb_build_object('analysis_id', v_id, 'reused', false);
END
$fn$;

REVOKE ALL ON FUNCTION public.astro_profile_create(uuid, uuid, uuid, text, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_profile_append_revision(uuid, uuid, uuid, integer, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_analysis_save_v2(uuid, uuid, uuid, integer, uuid, integer, uuid[], text, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astro_profile_create(uuid, uuid, uuid, text, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_profile_append_revision(uuid, uuid, uuid, integer, date, time, boolean, text, text, text, double precision, double precision, text, text, integer, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_analysis_save_v2(uuid, uuid, uuid, integer, uuid, integer, uuid[], text, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
