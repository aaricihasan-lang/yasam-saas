-- =============================================================================
-- 20271009100000_admin_purge_archived_expert.sql
--
-- SATIŞ ÖNCESİ SİLME GÜVENLİĞİ — OWNER-ONLY ARŞİV UZMAN KALICI SİLME (atomik)
--
-- AMAÇ:
--   Arşivdeki (role=expert, approval_status=approved, active=false) bir uzmanın hesabını VE
--   uzman tenant'ındaki TÜM iş verisini TEK PostgreSQL transaction'ında kalıcı olarak siler.
--   Yetki YALNIZ sistem sahibindedir (public.users.is_super_admin = true; sistemde EN FAZLA 1 —
--   uq_users_single_super_admin). "admin" rolü kalıcı silme yetkisi VERMEZ. Başka bir admine
--   bu yetkiyi açmak ancak bilinçli bir kod + migration değişikliğiyle mümkündür.
--
-- KAPSAM (owner kararı 2026-10-07 — "Hesap + tüm iş verisi"):
--   * public şemasında `tenant_id` (uuid; legacy text/varchar için lower(tenant_id) = uuid::text) kolonu
--     olan HER tablo → uzman tenant'ının satırları
--     (danışanlar + KVKK onamları cascade ile, kayıtlar, kütüphaneler, raporlar, YH, ...).
--   * `user_id uuid` kolonu olan ve tenant_id'si OLMAYAN tablolar → WHERE user_id = uzman (oturumlar,
--     güvenlik olayları, ödeme geçmişi...). tenant_id'li tablolarda başka tenant satırı ASLA silinmez.
--   * users satırı, ardından tenants satırı.
--   * KORUNANLAR (append-only denetim/yasal kanıt tasarımı; SİLİNMEZ): admin_audit_log,
--     provisioning_events, expert_usage_events, aromatherapy_claim_audit_events,
--     aromatherapy_content_audit_events, aromatherapy_content_delete_tombstones, yebs_audit_events.
--     admin_audit_log / provisioning_events'teki users/tenants FK'leri ON DELETE SET NULL'dur →
--     referans null'a düşer, satır korunur.
--   * DEĞİŞMEZ İÇERİK: aromatherapy_preparation_method_revisions guard'ına DOKUNULMAZ (tasarım gereği
--     silinemez). Böyle satırı olan uzman için purge FAIL-CLOSED reddedilir (UP020, tam rollback).
--   * Storage dosyaları bu fonksiyonda DEĞİL, route'ta (Storage API) silinir (DB COMMIT sonrası).
--
-- FAIL-CLOSED SÖZLEŞME:
--   * Silinemeyen tek bir satır kalırsa (bilinmeyen RESTRICT FK, legacy trigger...) → RAISE →
--     tüm transaction ROLLBACK. Yarım silme İMKÂNSIZ.
--   * Çapraz-tenant emniyet ağı: silme öncesi/sonrası "hedef DIŞI" satır sayıları karşılaştırılır;
--     başka tenant'tan TEK satır eksilirse (beklenmeyen cascade) → RAISE → ROLLBACK.
--   * Paylaşımlı tenant (başka kullanıcı da bağlı), sistem tenant'ı, demo hesabı, admin hedef,
--     owner'ın kendisi, arşivde olmayan uzman, e-posta doğrulaması uyuşmazlığı → RED.
--
-- APPEND-ONLY GUARD'LARINA DAR, TX-BAĞLI İSTİSNA:
--   admin_audit_log / provisioning_events guard'ları, users/tenants silinirken FK'nin yaptığı
--   ON DELETE SET NULL güncellemesine YALNIZ aynı transaction'da bu fonksiyonun yazdığı
--   admin_purge_context işareti varsa izin verir (satır korunur, referans null'a düşer). İşaret tablosuna hiçbir
--   rolün (service_role dahil) yetkisi yoktur; işaret txid_current() ile bu tx'e bağlıdır ve
--   fonksiyon sonunda silinir. service_role'ün bu tablolarda UPDATE/DELETE grant'i zaten yoktur.
--
-- GÜVENLİ / GERİYE UYUMLU:
--   Yeni tablo (boş, kilitli) + yeni fonksiyonlar + 2 guard fonksiyonunda CREATE OR REPLACE
--   (mevcut davranış BİREBİR korunur; yalnız işaretli purge istisnası eklenir). Mevcut veri DML YOK.
--   CREATE OR REPLACE sahiplik/ACL'yi korur. IDEMPOTENT.
-- =============================================================================

BEGIN;

-- ── 1) Purge işaret tablosu (tx-bağlı; hiçbir role açık değil) ─────────────────
CREATE TABLE IF NOT EXISTS public.admin_purge_context (
  txid       bigint      NOT NULL,
  user_id    uuid        NOT NULL,
  tenant_id  uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (txid, user_id)
);
REVOKE ALL ON TABLE public.admin_purge_context FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.admin_purge_context ENABLE ROW LEVEL SECURITY;

-- Bu transaction'da (txid_current) verilen kullanıcı VEYA tenant için purge yürüyor mu?
CREATE OR REPLACE FUNCTION public.admin_purge_in_progress(p_user_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_purge_context c
     WHERE c.txid = txid_current()
       AND ((p_user_id IS NOT NULL AND c.user_id = p_user_id)
         OR (p_tenant_id IS NOT NULL AND c.tenant_id = p_tenant_id))
  );
$$;
REVOKE ALL ON FUNCTION public.admin_purge_in_progress(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- Guard trigger'ları service_role bağlamında da çalışır (ör. reddedilecek bir DELETE denemesi):
-- yalnız boolean döner, kendi tx'i dışında hiçbir şey göstermez/değiştirmez.
GRANT EXECUTE ON FUNCTION public.admin_purge_in_progress(uuid, uuid) TO service_role;

-- ── 2) admin_audit_log guard — purge sırasında YALNIZ target_user_id → NULL (FK SET NULL) ──
CREATE OR REPLACE FUNCTION public.admin_audit_log_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.target_user_id IS NOT NULL
     AND NEW.target_user_id IS NULL
     AND (to_jsonb(NEW) - 'target_user_id') = (to_jsonb(OLD) - 'target_user_id')
     AND public.admin_purge_in_progress(OLD.target_user_id, NULL) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'admin_audit_log append-only: % engellendi', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

-- ── 3) provisioning_events guard — purge sırasında YALNIZ target_user/tenant → NULL ──
CREATE OR REPLACE FUNCTION public.provisioning_events_prevent_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'target_user_id' - 'target_tenant_id')
         = (to_jsonb(OLD) - 'target_user_id' - 'target_tenant_id')
     AND (NEW.target_user_id IS NULL OR NEW.target_user_id = OLD.target_user_id)
     AND (NEW.target_tenant_id IS NULL OR NEW.target_tenant_id = OLD.target_tenant_id)
     AND (NEW.target_user_id IS DISTINCT FROM OLD.target_user_id
          OR NEW.target_tenant_id IS DISTINCT FROM OLD.target_tenant_id)
     AND public.admin_purge_in_progress(OLD.target_user_id, OLD.target_tenant_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'provisioning_events append-only: % engellendi', TG_OP USING ERRCODE='check_violation';
END;
$$;

-- ── 4) Owner-only arşiv uzman kalıcı silme ─────────────────────────────────────
-- Hata kodları (route eşlemesi): UP001 parametre · UP002 kendi hesabı · UP003 yetkisiz aktör ·
-- UP004 hedef yok · UP005 hedef uzman değil/owner · UP006 arşivde değil · UP007 demo ·
-- UP008 e-posta doğrulaması · UP009 sistem tenant'ı · UP010 paylaşımlı tenant ·
-- UP020 silinemeyen satır kaldı · UP021 kullanıcı satırı silinemedi · UP022 tenant silinemedi ·
-- UP023 çapraz-tenant emniyet ağı.
CREATE OR REPLACE FUNCTION public.admin_purge_archived_expert(
  p_user_id        uuid,
  p_actor_admin_id uuid,
  p_confirm_email  text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor        public.users%ROWTYPE;
  v_target       public.users%ROWTYPE;
  v_tenant       uuid;
  v_retained     text[] := ARRAY[
    'admin_audit_log', 'provisioning_events', 'expert_usage_events',
    'aromatherapy_claim_audit_events', 'aromatherapy_content_audit_events',
    'aromatherapy_content_delete_tombstones', 'yebs_audit_events'
  ];
  v_excluded     text[];
  v_tenant_tbls  text[] := '{}';
  v_user_tbls    text[] := '{}';
  v_t            text;
  v_n            bigint;
  v_progress     boolean;
  v_pass         integer := 0;
  v_counts       jsonb := '{}'::jsonb;
  v_before       jsonb := '{}'::jsonb;
  v_last_err     text := NULL;
  v_total        bigint := 0;
  v_users_before bigint;
  v_tenants_before bigint;
  v_unsupported  text[] := '{}';
  v_text_tbls    text[] := '{}';
  v_col          text;
  v_val          text;
BEGIN
  IF p_user_id IS NULL OR p_actor_admin_id IS NULL OR coalesce(btrim(p_confirm_email), '') = '' THEN
    RAISE EXCEPTION 'admin_purge: eksik parametre' USING ERRCODE = 'UP001';
  END IF;
  IF p_user_id = p_actor_admin_id THEN
    RAISE EXCEPTION 'admin_purge: kendi hesabınızı silemezsiniz' USING ERRCODE = 'UP002';
  END IF;

  -- Aktör: aktif admin + KALICI owner işareti (DB; e-posta/admin_level'a güvenilmez).
  SELECT * INTO v_actor FROM public.users WHERE id = p_actor_admin_id;
  IF NOT FOUND
     OR lower(coalesce(v_actor.role, '')) <> 'admin'
     OR v_actor.active IS NOT TRUE
     OR v_actor.is_super_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'admin_purge: yetkisiz aktör' USING ERRCODE = 'UP003';
  END IF;

  -- Hedef: kilit altında yeniden doğrula (bayat ekran / eşzamanlı yeniden aktifleştirme).
  SELECT * INTO v_target FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_purge: kullanıcı bulunamadı' USING ERRCODE = 'UP004';
  END IF;
  IF lower(coalesce(v_target.role, '')) <> 'expert' OR v_target.is_super_admin IS TRUE THEN
    RAISE EXCEPTION 'admin_purge: yalnız uzman hesabı silinebilir' USING ERRCODE = 'UP005';
  END IF;
  IF coalesce(v_target.approval_status, '') <> 'approved' OR v_target.active IS NOT FALSE THEN
    RAISE EXCEPTION 'admin_purge: uzman arşivde değil' USING ERRCODE = 'UP006';
  END IF;
  IF coalesce(v_target.is_demo_account, false) THEN
    RAISE EXCEPTION 'admin_purge: demo hesabı silinemez' USING ERRCODE = 'UP007';
  END IF;
  IF lower(btrim(coalesce(v_target.email, ''))) <> lower(btrim(p_confirm_email)) THEN
    RAISE EXCEPTION 'admin_purge: e-posta doğrulaması uyuşmadı' USING ERRCODE = 'UP008';
  END IF;

  v_tenant := v_target.tenant_id;
  IF v_tenant = '00000000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'admin_purge: sistem tenant''ı silinemez' USING ERRCODE = 'UP009';
  END IF;
  IF v_tenant IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.tenant_id = v_tenant AND u.id <> p_user_id) THEN
      RAISE EXCEPTION 'admin_purge: tenant başka kullanıcıyla paylaşılıyor' USING ERRCODE = 'UP010';
    END IF;
    PERFORM 1 FROM public.tenants t WHERE t.id = v_tenant FOR UPDATE;
  END IF;

  -- Tx-bağlı işaret (append-only guard istisnası yalnız bununla açılır).
  INSERT INTO public.admin_purge_context (txid, user_id, tenant_id)
  VALUES (txid_current(), p_user_id, v_tenant);

  -- Kapsam tabloları (katalogdan; legacy/repo-dışı tablolar dahil).
  v_excluded := v_retained || ARRAY['users', 'tenants', 'admin_purge_context'];
  IF v_tenant IS NOT NULL THEN
    SELECT coalesce(array_agg(cl.relname::text ORDER BY cl.relname), '{}') INTO v_tenant_tbls
      FROM pg_class cl
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE ns.nspname = 'public' AND cl.relkind IN ('r', 'p') AND NOT cl.relispartition
       AND a.atttypid IN ('uuid'::regtype, 'text'::regtype, 'varchar'::regtype)
       AND cl.relname <> ALL (v_excluded);
    -- Legacy: bazı tablolarda tenant_id text (ör. prod stone_exclusions) → lower(tenant_id) = uuid::text.
    SELECT coalesce(array_agg(cl.relname::text ORDER BY cl.relname), '{}') INTO v_text_tbls
      FROM pg_class cl
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE ns.nspname = 'public' AND cl.relkind IN ('r', 'p') AND NOT cl.relispartition
       AND a.atttypid IN ('text'::regtype, 'varchar'::regtype)
       AND cl.relname <> ALL (v_excluded);
  END IF;
  -- Şeffaflık: uuid/text DIŞI tenant_id kolonlu tablolar kapsam dışıdır → sonuçta raporlanır.
  SELECT coalesce(array_agg(cl.relname::text ORDER BY cl.relname), '{}') INTO v_unsupported
    FROM pg_class cl
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
   WHERE ns.nspname = 'public' AND cl.relkind IN ('r', 'p') AND NOT cl.relispartition
     AND a.atttypid NOT IN ('uuid'::regtype, 'text'::regtype, 'varchar'::regtype)
     AND cl.relname <> ALL (v_excluded);
  SELECT coalesce(array_agg(cl.relname::text ORDER BY cl.relname), '{}') INTO v_user_tbls
    FROM pg_class cl
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'user_id' AND NOT a.attisdropped
   WHERE ns.nspname = 'public' AND cl.relkind IN ('r', 'p') AND NOT cl.relispartition
     AND a.atttypid = 'uuid'::regtype
     AND cl.relname <> ALL (v_excluded);

  -- Kullanıcı geçişi YALNIZ tenant_id'si OLMAYAN (kullanıcıya ait) tablolarda: tenant_id'li tablolar
  -- tenant geçişiyle temizlenir; başka tenant'taki satırların user_id referansı FK (SET NULL) ile çözülür,
  -- satırın kendisi ASLA silinmez (çapraz-tenant silme imkânsız). Prod'da clients/appointments/
  -- module_records gibi tablolarda user_id + tenant_id birlikte bulunur (2026-10-07 prova bulgusu).
  IF v_tenant IS NOT NULL THEN
    v_user_tbls := ARRAY(SELECT x FROM unnest(v_user_tbls) AS x WHERE x <> ALL (v_tenant_tbls) ORDER BY x);
  END IF;

  -- Çapraz-tenant emniyet ağı: "hedef DIŞI" satır sayıları (önce).
  FOREACH v_t IN ARRAY v_tenant_tbls LOOP
    v_col := CASE WHEN v_t = ANY (v_text_tbls) THEN 'lower(tenant_id)' ELSE 'tenant_id' END;
    v_val := CASE WHEN v_t = ANY (v_text_tbls) THEN '$1::text' ELSE '$1' END;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s IS DISTINCT FROM %s', v_t, v_col, v_val) INTO v_n USING v_tenant;
    v_before := v_before || jsonb_build_object('t:' || v_t, v_n);
  END LOOP;
  FOREACH v_t IN ARRAY v_user_tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IS DISTINCT FROM $1', v_t) INTO v_n USING p_user_id;
    v_before := v_before || jsonb_build_object('u:' || v_t, v_n);
  END LOOP;
  SELECT count(*) INTO v_users_before FROM public.users WHERE id <> p_user_id;
  SELECT count(*) INTO v_tenants_before FROM public.tenants WHERE id IS DISTINCT FROM v_tenant;

  -- Silme döngüsü: FK sırası bilinmediğinden (legacy şema) her tur tüm tablolar denenir;
  -- FK/guard nedeniyle o an silinemeyen tablo sonraki turda yeniden denenir. İlerleme
  -- durunca çıkılır; ardından KALAN satır varsa tümü geri alınır (fail-closed).
  LOOP
    v_pass := v_pass + 1;
    v_progress := false;
    FOREACH v_t IN ARRAY v_tenant_tbls LOOP
      v_col := CASE WHEN v_t = ANY (v_text_tbls) THEN 'lower(tenant_id)' ELSE 'tenant_id' END;
      v_val := CASE WHEN v_t = ANY (v_text_tbls) THEN '$1::text' ELSE '$1' END;
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %s = %s', v_t, v_col, v_val) USING v_tenant;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n > 0 THEN
          v_progress := true;
          v_counts := v_counts || jsonb_build_object(v_t, coalesce((v_counts ->> v_t)::bigint, 0) + v_n);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_last_err := v_t || ' [' || SQLSTATE || '] ' || SQLERRM;
      END;
    END LOOP;
    FOREACH v_t IN ARRAY v_user_tbls LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_t) USING p_user_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n > 0 THEN
          v_progress := true;
          v_counts := v_counts || jsonb_build_object(v_t, coalesce((v_counts ->> v_t)::bigint, 0) + v_n);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_last_err := v_t || ' [' || SQLSTATE || '] ' || SQLERRM;
      END;
    END LOOP;
    EXIT WHEN NOT v_progress OR v_pass >= 30;
  END LOOP;

  -- Kalan satır kontrolü (fail-closed).
  FOREACH v_t IN ARRAY v_tenant_tbls LOOP
    v_col := CASE WHEN v_t = ANY (v_text_tbls) THEN 'lower(tenant_id)' ELSE 'tenant_id' END;
    v_val := CASE WHEN v_t = ANY (v_text_tbls) THEN '$1::text' ELSE '$1' END;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s = %s', v_t, v_col, v_val) INTO v_n USING v_tenant;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'admin_purge: % tablosunda % satır silinemedi (son hata: %)', v_t, v_n, coalesce(v_last_err, '-')
        USING ERRCODE = 'UP020';
    END IF;
  END LOOP;
  FOREACH v_t IN ARRAY v_user_tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', v_t) INTO v_n USING p_user_id;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'admin_purge: % tablosunda % satır silinemedi (son hata: %)', v_t, v_n, coalesce(v_last_err, '-')
        USING ERRCODE = 'UP020';
    END IF;
  END LOOP;

  -- Hesap satırı (FK: oturum vb. CASCADE; audit/provisioning SET NULL → işaretli istisna).
  BEGIN
    DELETE FROM public.users WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'admin_purge: kullanıcı satırı silinemedi [%] %', SQLSTATE, SQLERRM USING ERRCODE = 'UP021';
  END;
  IF v_tenant IS NOT NULL THEN
    BEGIN
      DELETE FROM public.tenants WHERE id = v_tenant;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'admin_purge: tenant satırı silinemedi [%] %', SQLSTATE, SQLERRM USING ERRCODE = 'UP022';
    END;
  END IF;

  -- Çapraz-tenant emniyet ağı (sonra): hedef DIŞI hiçbir satır eksilmemiş olmalı.
  FOREACH v_t IN ARRAY v_tenant_tbls LOOP
    v_col := CASE WHEN v_t = ANY (v_text_tbls) THEN 'lower(tenant_id)' ELSE 'tenant_id' END;
    v_val := CASE WHEN v_t = ANY (v_text_tbls) THEN '$1::text' ELSE '$1' END;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s IS DISTINCT FROM %s', v_t, v_col, v_val) INTO v_n USING v_tenant;
    IF v_n < (v_before ->> ('t:' || v_t))::bigint THEN
      RAISE EXCEPTION 'admin_purge: % tablosunda başka tenant satırı etkilendi; işlem geri alındı', v_t USING ERRCODE = 'UP023';
    END IF;
  END LOOP;
  FOREACH v_t IN ARRAY v_user_tbls LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IS DISTINCT FROM $1', v_t) INTO v_n USING p_user_id;
    IF v_n < (v_before ->> ('u:' || v_t))::bigint THEN
      RAISE EXCEPTION 'admin_purge: % tablosunda başka kullanıcı satırı etkilendi; işlem geri alındı', v_t USING ERRCODE = 'UP023';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.users) < v_users_before
     OR (SELECT count(*) FROM public.tenants) < v_tenants_before THEN
    RAISE EXCEPTION 'admin_purge: başka hesap/tenant etkilendi; işlem geri alındı' USING ERRCODE = 'UP023';
  END IF;

  SELECT coalesce(sum(value::bigint), 0) INTO v_total FROM jsonb_each_text(v_counts);

  DELETE FROM public.admin_purge_context WHERE txid = txid_current() AND user_id = p_user_id;

  -- Audit (aynı tx; PII YOK — yalnız kimlik uuid'leri ve sayılar). Hedef satır silindiği için
  -- target_user_id NULL; silinen kimlik context'te korunur.
  INSERT INTO public.admin_audit_log
    (actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, result, context)
  VALUES
    (p_actor_admin_id, true, NULL, 'user_deleted',
     jsonb_build_object('role', 'expert', 'approval_status', 'approved', 'active', false),
     jsonb_build_object('deleted', true),
     jsonb_build_object('total_rows', v_total, 'tables', v_counts),
     jsonb_build_object('purged_user_id', p_user_id, 'purged_tenant_id', v_tenant,
                        'mode', 'permanent_purge', 'retained_tables', to_jsonb(v_retained)));

  RETURN jsonb_build_object('ok', true, 'tenant_id', v_tenant, 'total_rows', v_total, 'tables', v_counts,
                            'unsupported_tenant_tables', to_jsonb(v_unsupported));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_archived_expert(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_archived_expert(uuid, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma — beklenen):
--   SELECT has_function_privilege('anon', 'public.admin_purge_archived_expert(uuid,uuid,text)', 'EXECUTE');          -- false
--   SELECT has_function_privilege('authenticated', 'public.admin_purge_archived_expert(uuid,uuid,text)', 'EXECUTE'); -- false
--   SELECT has_function_privilege('service_role', 'public.admin_purge_archived_expert(uuid,uuid,text)', 'EXECUTE');  -- true
--   SELECT has_table_privilege('service_role', 'public.admin_purge_context', 'SELECT');                              -- false
--   SELECT count(*) FROM public.admin_purge_context;                                                               -- 0
-- =============================================================================
-- ROLLBACK (tek tx):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.admin_purge_archived_expert(uuid, uuid, text);
--   -- 2 guard fonksiyonunu 20260903000000 / 20260910000000 tanımlarıyla yeniden oluşturun
--   -- (purge istisnası dalı olmadan), ardından:
--   DROP FUNCTION IF EXISTS public.admin_purge_in_progress(uuid, uuid);
--   DROP TABLE IF EXISTS public.admin_purge_context;
--   COMMIT;
-- =============================================================================
