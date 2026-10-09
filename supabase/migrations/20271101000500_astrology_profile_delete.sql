-- =============================================================================
-- 20271101000500_astrology_profile_delete.sql   [KISIT DEĞİŞİMİ + 2 FONKSİYON; VERİ SİLMEZ]
--
-- ASTROLOJİ — AŞAMA 7B-S: KALICI PROFİL SİLME GÜVENLİĞİ. OWNER-ONLY PİLOT.
--
-- SORUN (önceki şema): Ortak analiz (sinastri / composite) analizi kaydeden profilin satırıdır
--   (profile_id = Ayşe, partner_profile_id = Ahmet). Karşı taraf FK'leri ON DELETE CASCADE idi →
--   Ahmet'in profili silinirse AYŞE'NİN kayıtlı ortak analizi de silinirdi.
--
-- ÇÖZÜM (ortak analiz eksiksiz korunur):
--   • astro_an_partner_fk (tenant, partner_profile_id, partner_profile_revision) → revizyonlar:
--       CASCADE → ON DELETE SET NULL (partner_profile_id, partner_profile_revision).
--   • astro_an_partner_owner_fk (tenant, owner, partner_profile_id) → profiller:
--       CASCADE → NO ACTION. Silme fonksiyonu canlı karşı taraf bağlarını AYNI işlemde önce açıkça NULL yapar;
--       herhangi bir yol bağı bırakırsa silme REDDEDİLİR — sessiz analiz kaybı yerine fail-closed (testli:
--       tetikleyici sırası nedeniyle yalnız FK'ye güvenilmez).
--   Ortak analizin TÜM içeriği değişmez snapshot kolonlarındadır (profile_snapshot.partner = karşı tarafın kayıt
--   anındaki kimliği ve doğum verisi; technical_snapshot = iki kişinin hesap verisi/harita; provider_interp_snapshot;
--   kb_snapshot; versions_snapshot; astro_analysis_notes kopyası). Bunların HİÇBİRİ değişmez; yalnız canlı bağ
--   (partner_profile_id/partner_profile_revision) NULL olur. Kayıtlı analizi açmak zaten yalnız snapshot okur.
--   astro_an_result_fk zaten SET NULL (result_id): silinen kişinin verisini içeren ÖNBELLEK satırı (sağlayıcı
--   ham yanıtı) silinir; kayıtlı analiz ona bağlı değildir.
--
-- SİLME YOLU: tablo DELETE yetkisi service_role'e VERİLMEZ (doğrudan silme imkânsız). Yalnız
--   astro_profile_delete (SECURITY DEFINER, sabit search_path, yalnız service_role çalıştırır):
--     • tenant + uzman sahipliği; 1..100 profil; tekrar eden kimlik tekilleştirilir;
--     • profiller FOR UPDATE kilitlenir (eşzamanlı analiz kaydı / revizyon / başka silme bekler);
--     • ekranda onaylanan durum (p_expected: güncel revizyon, updated_at, kendi analiz sayısı, korunacak ortak
--       analiz sayısı) KİLİT ALTINDA yeniden hesaplanır; en küçük fark → hiçbir şey silinmez (40001);
--     • korunacak ortak analizlerin kimlikleri ve snapshot parmak izleri silmeden ÖNCE alınır, silmeden SONRA
--       birebir doğrulanır; tek fark → tüm işlem geri alınır;
--     • tek deyim / tek işlem: toplu silmede kısmi başarı YOK (hepsi ya da hiçbiri).
--   astro_profile_delete_preview: aynı kurallarla salt okunur özet (onay ekranları için).
--
-- KVKK: Bu işlem yalnız Astroloji profilini ve ona ait Astroloji kayıtlarını siler; kişinin sistemdeki diğer
--   verilerini silmez ve KVKK kapsamlı silme işlemi DEĞİLDİR. Korunan ortak analizler silinen kişinin kayıt
--   anındaki verisini (ürün kararı gereği) taşımaya devam eder.
--
-- PRECONDITION: 20271101000000…000400.   VERİ-YIKICI MI: HAYIR (kısıt + fonksiyon).   İDEMPOTENT: EVET.
-- ⚠️ PRODUCTION'A UYGULANMADI (work/astrology-roxy, yerel).
-- GERİ ALMA: fonksiyonları DROP; iki FK'yi 20271101000200 / 000300 tanımlarıyla (CASCADE) yeniden oluştur.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'astro_birth_profiles' AND column_name = 'archived_at') THEN
    RAISE EXCEPTION 'ASTRO 7B-S: önce 20271101000400 uygulanmalı';
  END IF;
END
$pre$;

-- ─── 1) Ortak analiz FK'leri: CASCADE → SET NULL / NO ACTION ────────────────
DO $fk$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_partner_fk'
             AND conrelid = 'public.astro_analyses'::regclass AND confdeltype <> 'n') THEN
    ALTER TABLE public.astro_analyses DROP CONSTRAINT astro_an_partner_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_partner_fk' AND conrelid = 'public.astro_analyses'::regclass) THEN
    ALTER TABLE public.astro_analyses ADD CONSTRAINT astro_an_partner_fk
      FOREIGN KEY (tenant_id, partner_profile_id, partner_profile_revision)
      REFERENCES public.astro_birth_profile_revisions (tenant_id, profile_id, revision)
      ON DELETE SET NULL (partner_profile_id, partner_profile_revision);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_partner_owner_fk'
             AND conrelid = 'public.astro_analyses'::regclass AND confdeltype <> 'a') THEN
    ALTER TABLE public.astro_analyses DROP CONSTRAINT astro_an_partner_owner_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_partner_owner_fk' AND conrelid = 'public.astro_analyses'::regclass) THEN
    ALTER TABLE public.astro_analyses ADD CONSTRAINT astro_an_partner_owner_fk
      FOREIGN KEY (tenant_id, owner_user_id, partner_profile_id)
      REFERENCES public.astro_birth_profiles (tenant_id, owner_user_id, id)
      ON DELETE NO ACTION;
  END IF;
END
$fk$;

COMMENT ON COLUMN public.astro_analyses.partner_profile_id IS
  'Ortak analizin karşı taraf profiline CANLI bağ. Karşı taraf profili silinirse NULL olur; analiz ve snapshot''ı (karşı tarafın kayıt anındaki verisi dahil) korunur.';

-- ─── 2) Önizleme (salt okunur) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.astro_profile_delete_preview(p_tenant_id uuid, p_owner_user_id uuid, p_profile_ids uuid[])
RETURNS TABLE (
  id uuid, label text, archived_at timestamptz, current_revision integer, updated_ms bigint,
  own_analysis_count bigint, shared_preserved_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  WITH sel AS (SELECT DISTINCT unnest(coalesce(p_profile_ids, '{}'::uuid[])) AS id)
  SELECT p.id, p.label, p.archived_at, p.current_revision,
         floor(extract(epoch FROM p.updated_at) * 1000)::bigint,
         (SELECT count(*) FROM public.astro_analyses a
           WHERE a.tenant_id = p.tenant_id AND a.owner_user_id = p.owner_user_id AND a.profile_id = p.id),
         -- Korunacak ortak analiz: karşı tarafı bu profil olan, SAHİBİ silinmeyecek başka bir profil olan analiz.
         (SELECT count(*) FROM public.astro_analyses a
           WHERE a.tenant_id = p.tenant_id AND a.owner_user_id = p.owner_user_id AND a.partner_profile_id = p.id
             AND a.profile_id NOT IN (SELECT s.id FROM sel s))
    FROM public.astro_birth_profiles p
    JOIN sel ON sel.id = p.id
   WHERE p.tenant_id = p_tenant_id AND p.owner_user_id = p_owner_user_id
   ORDER BY p.label, p.id
$fn$;

-- ─── 3) Kalıcı silme (tek işlem; kilit altında yeniden doğrulama) ────────────
-- p_expected: [{"id": uuid, "current_revision": int, "updated_ms": bigint, "own": int, "shared": int}, ...]
CREATE OR REPLACE FUNCTION public.astro_profile_delete(p_tenant_id uuid, p_owner_user_id uuid, p_expected jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ids uuid[];
  v_locked integer;
  v_mismatch integer;
  v_own bigint;
  v_preserved uuid[];
  v_fp_before text;
  v_fp_after text;
  v_deleted integer;
BEGIN
  IF p_tenant_id IS NULL OR p_owner_user_id IS NULL OR p_expected IS NULL OR jsonb_typeof(p_expected) <> 'array' THEN
    RAISE EXCEPTION 'ASTRO_DELETE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT (e->>'id')::uuid) INTO v_ids FROM jsonb_array_elements(p_expected) e;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 OR cardinality(v_ids) > 100
     OR cardinality(v_ids) <> jsonb_array_length(p_expected) THEN
    RAISE EXCEPTION 'ASTRO_DELETE_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Kilit: yalnız bu uzmanın, bu tenant'taki profilleri. Eksik / yabancı / zaten silinmiş → hiçbir şey silinmez.
  SELECT count(*) INTO v_locked FROM (
    SELECT p.id FROM public.astro_birth_profiles p
     WHERE p.tenant_id = p_tenant_id AND p.owner_user_id = p_owner_user_id AND p.id = ANY (v_ids)
     FOR UPDATE
  ) l;
  IF v_locked <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'ASTRO_DELETE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Onaylanan durum KİLİT ALTINDA hâlâ geçerli mi?
  SELECT count(*) INTO v_mismatch
    FROM jsonb_array_elements(p_expected) e
    JOIN public.astro_profile_delete_preview(p_tenant_id, p_owner_user_id, v_ids) pv ON pv.id = (e->>'id')::uuid
   WHERE pv.current_revision IS DISTINCT FROM (e->>'current_revision')::integer
      OR pv.updated_ms IS DISTINCT FROM (e->>'updated_ms')::bigint
      OR pv.own_analysis_count IS DISTINCT FROM (e->>'own')::bigint
      OR pv.shared_preserved_count IS DISTINCT FROM (e->>'shared')::bigint;
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'ASTRO_DELETE_STALE' USING ERRCODE = '40001';
  END IF;

  -- Korunacak ortak analizler + snapshot parmak izi (silmeden ÖNCE).
  SELECT coalesce(array_agg(a.id ORDER BY a.id), '{}'::uuid[]),
         coalesce(string_agg(md5(a.id::text || a.profile_snapshot::text || a.method_snapshot::text || a.technical_snapshot::text
           || coalesce(a.provider_interp_snapshot::text, '-') || a.kb_snapshot::text || a.versions_snapshot::text || a.title
           || a.technique_params::text || coalesce((SELECT string_agg(n.section_key || n.body, '|' ORDER BY n.section_key)
                FROM public.astro_analysis_notes n WHERE n.tenant_id = a.tenant_id AND n.analysis_id = a.id), '')), ',' ORDER BY a.id), '')
    INTO v_preserved, v_fp_before
    FROM public.astro_analyses a
   WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id
     AND a.partner_profile_id = ANY (v_ids) AND NOT (a.profile_id = ANY (v_ids));

  SELECT count(*) INTO v_own FROM public.astro_analyses a
   WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id AND a.profile_id = ANY (v_ids);

  -- Silinecek profillere giden CANLI karşı taraf bağlarını aynı işlemde kaldır (yalnız bu iki bağ kolonu; snapshot
  -- ve diğer kolonlar DEĞİŞMEZ). Tetikleyici sırasına bağımlı kalmamak için açıkça yapılır; FK'ler (SET NULL /
  -- NO ACTION) ikinci güvence katmanıdır. Silinecek profillerin kendi analizleri zaten silinir.
  UPDATE public.astro_analyses a
     SET partner_profile_id = NULL, partner_profile_revision = NULL
   WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id AND a.partner_profile_id = ANY (v_ids);

  DELETE FROM public.astro_birth_profiles p
   WHERE p.tenant_id = p_tenant_id AND p.owner_user_id = p_owner_user_id AND p.id = ANY (v_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'ASTRO_DELETE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Silmeden SONRA: korunan ortak analizlerin hepsi duruyor ve snapshot'ları birebir aynı mı?
  SELECT coalesce(string_agg(md5(a.id::text || a.profile_snapshot::text || a.method_snapshot::text || a.technical_snapshot::text
           || coalesce(a.provider_interp_snapshot::text, '-') || a.kb_snapshot::text || a.versions_snapshot::text || a.title
           || a.technique_params::text || coalesce((SELECT string_agg(n.section_key || n.body, '|' ORDER BY n.section_key)
                FROM public.astro_analysis_notes n WHERE n.tenant_id = a.tenant_id AND n.analysis_id = a.id), '')), ',' ORDER BY a.id), '')
    INTO v_fp_after
    FROM public.astro_analyses a
   WHERE a.tenant_id = p_tenant_id AND a.id = ANY (v_preserved);
  IF v_fp_after IS DISTINCT FROM v_fp_before THEN
    RAISE EXCEPTION 'ASTRO_DELETE_SHARED_INTEGRITY' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('deleted_profiles', v_deleted, 'deleted_analyses', v_own, 'preserved_shared_analyses', cardinality(v_preserved));
END
$fn$;

REVOKE ALL ON FUNCTION public.astro_profile_delete_preview(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.astro_profile_delete(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astro_profile_delete_preview(uuid, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.astro_profile_delete(uuid, uuid, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
