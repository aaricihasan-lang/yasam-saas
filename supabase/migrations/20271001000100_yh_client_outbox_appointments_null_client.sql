-- =============================================================================
-- 20271001000100_yh_client_outbox_appointments_null_client.sql
--
-- YAŞAM HAFIZASI™ — CLIENT CDC ENQUEUE: AJANDA "GENEL" (danışansız) RANDEVU DÜZELTMESİ
--   (P1-1 · AŞAMA 2 · M2)
--
-- SORUN (canlı, P1-1):
--   Ajanda'da danışan seçilmeden ("Genel") randevu oluşturma/düzenleme/silme 500 döner.
--   Kök neden: ortak CDC trigger fn public.yh_client_outbox_enqueue() (son tanım
--   20261220000000_yh_client_outbox_activation_boundary.sql) `client_id IS NULL` iken
--   RAISE EXCEPTION → kaynak CRUD ROLLBACK. appointments.client_id kolonu NULLABLE
--   (tasarım gereği "Genel" randevu danışansızdır); diğer 5 cohort tablosunda client_id
--   anlamsal olarak zorunludur.
--
-- ÇÖZÜM (yalnız appointments; gövde 20261220000000 ile BİREBİR, yalnız erken dallar eklendi):
--   * INSERT  NEW.client_id NULL                → outbox kaydı YOK, RETURN NEW (no-op).
--   * DELETE  OLD.client_id NULL                → outbox kaydı YOK, RETURN OLD (no-op).
--   * UPDATE  NULL → NULL                       → outbox kaydı YOK, RETURN NEW (no-op).
--   * UPDATE  non-NULL → NULL (danışandan ayrıldı)→ operation='delete' + OLD.client_id /
--                                                 OLD.tenant_id (YH deindex; sızıntı YOK).
--   * UPDATE  NULL → non-NULL                   → normal upsert (NEW.client_id).
--   Diğer 5 tablo (client_combinations, client_homeworks, client_notes, client_sessions,
--   client_stones): client_id NULL → RAISE davranışı AYNEN (fail-closed KORUNUR).
--
-- DEĞİŞMEYENLER: SECURITY DEFINER, sabit search_path (public, pg_catalog), enqueued_active
--   event-time damgası, ON CONFLICT coalescing bloğu, return tipi (trigger), 6 trigger
--   bağlantısı (isimle bağlı; CREATE OR REPLACE hepsini günceller), professional outbox
--   (yasam_hafizasi_outbox / yh_cdc_enqueue) — bu dosyada DOKUNULMAZ.
--
-- ACL: CREATE OR REPLACE mevcut fonksiyon ACL'sini KORUR. Aşağıdaki REVOKE önceki
--   migration'larla birebir aynıdır (idempotent); yeni GRANT YOK.
--
-- IDEMPOTENT: CREATE OR REPLACE + tekrar çalıştırılabilir REVOKE. Tek transaction.
-- ÖNKOŞUL: 20261218000200 + 20261220000000 (enqueued_active kolonu) + 20260927000000.
--
-- Rollback: 20261220000000_yh_client_outbox_activation_boundary.sql içindeki
--   `CREATE OR REPLACE FUNCTION public.yh_client_outbox_enqueue()` bloğunu (yalnız o blok +
--   REVOKE satırı) yeniden çalıştırmak önceki (appointments null → RAISE) davranışa döner.
--   Veri/şema değişikliği olmadığından başka geri alma adımı gerekmez.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.yh_client_outbox_enqueue()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key      text := TG_ARGV[0];
  v_expect_table    text := TG_ARGV[1];
  v_operation       text;
  v_source_id       uuid;
  v_tenant_id       uuid;
  v_client_id       uuid;
  v_active          boolean;   -- aktivasyon-anı okuması (yh_source_activation.is_active)
  v_enqueued_active boolean;   -- damga: yalnız IS TRUE iken true (FAIL-CLOSED)
BEGIN
  IF v_source_key IS NULL OR length(btrim(v_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: source_key argumani eksik';
  END IF;
  IF v_expect_table IS NULL OR length(btrim(v_expect_table)) = 0 THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: expected source_table argumani eksik';
  END IF;
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: beklenmeyen schema % (public bekleniyor)', TG_TABLE_SCHEMA;
  END IF;
  IF TG_TABLE_NAME IS DISTINCT FROM v_expect_table THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: source_table uyusmazligi (% <> %)', TG_TABLE_NAME, v_expect_table;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert';
    v_source_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
    v_client_id := NEW.client_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete';
    v_source_id := OLD.id;
    v_tenant_id := OLD.tenant_id;
    v_client_id := OLD.client_id;
  ELSE
    RAISE EXCEPTION 'yh_client_outbox_enqueue: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- ── P1-1: Ajanda "Genel" (danışansız) randevu — YALNIZ appointments ──────────────
  -- Danışansız randevu Yaşam Hafızası'na (client-scoped) ait değildir → enqueue YOK.
  -- Danışandan ayrılan randevu (non-null → null) eski danışanın hafızasından DEINDEX edilir.
  -- Diğer 5 cohort tablosu bu daldan geçmez → aşağıdaki client_id NULL RAISE AYNEN geçerli.
  IF v_expect_table = 'appointments' THEN
    IF TG_OP = 'INSERT' AND NEW.client_id IS NULL THEN
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' AND OLD.client_id IS NULL THEN
      RETURN OLD;
    ELSIF TG_OP = 'UPDATE' AND NEW.client_id IS NULL THEN
      IF OLD.client_id IS NULL THEN
        RETURN NEW;                     -- null → null: no-op
      END IF;
      v_operation := 'delete';          -- non-null → null: eski danışandan deindex
      v_source_id := OLD.id;
      v_tenant_id := OLD.tenant_id;
      v_client_id := OLD.client_id;
    END IF;
    -- null → non-null UPDATE ve client'lı INSERT/UPDATE/DELETE: normal akış (upsert/delete).
  END IF;

  -- Fail-closed: geçerli source_id + tenant_id + client_id zorunlu (null → kaynak CRUD ROLLBACK).
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: source_id null (%, %)', v_expect_table, v_source_key;
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: tenant_id null (%, %)', v_expect_table, v_source_key;
  END IF;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'yh_client_outbox_enqueue: client_id null (%, %)', v_expect_table, v_source_key;
  END IF;

  -- ── EVENT-TIME AKTİVASYON DAMGASI (BF-11E race hardening çekirdeği) ────────────
  -- Kaynağın OLAY ANINDAKİ aktivasyon durumu. Satır yok / NULL / false → false (FAIL-CLOSED).
  -- Kaynak CRUD'unu ENGELLEMEZ (yalnız damga; enqueue koşulsuz kalır — dormant kuyruk drain edilir).
  SELECT a.is_active INTO v_active
  FROM public.yh_source_activation AS a
  WHERE a.source_key = v_source_key;
  v_enqueued_active := (v_active IS TRUE);

  -- Atomik enqueue + coalescing (latest-event-wins; event_version monotonik).
  INSERT INTO public.yasam_hafizasi_client_outbox AS o
    (source_key, source_table, source_id, tenant_id, client_id, operation, enqueued_active)
  VALUES
    (v_source_key, TG_TABLE_NAME, v_source_id, v_tenant_id, v_client_id, v_operation, v_enqueued_active)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation       = EXCLUDED.operation,
      source_table    = EXCLUDED.source_table,
      tenant_id       = EXCLUDED.tenant_id,
      client_id       = EXCLUDED.client_id,
      -- Coalesce: HER YENİ EVENTTE aktivasyon damgasını yeniden yaz (pre→post flip; kayıp YOK).
      enqueued_active = EXCLUDED.enqueued_active,
      event_version   = nextval('public.yasam_hafizasi_client_outbox_event_version_seq'),
      updated_at      = now(),
      -- PROCESSING (in-flight worker claim) KORUNUR; aksi → pending reset.
      status          = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts        = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at    = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at       = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by       = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error      = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at    = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ACL: önceki migration'larla birebir (CREATE OR REPLACE mevcut ACL'yi korur; yeni GRANT YOK).
REVOKE ALL ON FUNCTION public.yh_client_outbox_enqueue() FROM PUBLIC, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   SELECT prosecdef, proconfig, proacl FROM pg_proc
--     WHERE oid = 'public.yh_client_outbox_enqueue()'::regprocedure;
--     -- t, {search_path=public, pg_catalog}, ACL uygulama ÖNCESİ ile aynı
--   SELECT has_function_privilege('anon','public.yh_client_outbox_enqueue()','EXECUTE');          -- false
--   SELECT has_function_privilege('authenticated','public.yh_client_outbox_enqueue()','EXECUTE'); -- false
--   SELECT tgrelid::regclass, tgname FROM pg_trigger
--     WHERE NOT tgisinternal AND tgname LIKE 'yh_client_outbox_%_trg';                           -- 6 satır
--   SELECT position('P1-1' IN prosrc) > 0 FROM pg_proc WHERE proname='yh_client_outbox_enqueue'; -- t
-- =============================================================================
