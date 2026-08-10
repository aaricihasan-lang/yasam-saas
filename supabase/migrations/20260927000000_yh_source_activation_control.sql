-- =============================================================================
-- 20260927000000_yh_source_activation_control.sql
--
-- YAŞAM HAFIZASI™ — BF-11E: KONTROLLÜ KAYNAK AKTİVASYON KONTROL DÜZLEMİ (FOUNDATION)
--
-- AMAÇ: Dormant kaynakların production'da GÜVENLİ + KONTROLLÜ aktive edilebilmesi için
--   MERGE-SAFE / APPLY-SAFE aktivasyon altyapısını kurar. Uygulanması hiçbir kaynağı
--   aktive ETMEZ, hiçbir olay üretmez, hiçbir veriyi indexlemez.
--
-- KAPSAM (yalnız additive foundation):
--   1. public.yh_source_activation                → kaynak-başına aktivasyon durum kaydı
--                                                    (DEFAULT is_active=false, backfill_allowed=false)
--   2. public.yh_cdc_enqueue()                     → AKTİVASYON-KAPILI generic CDC enqueue trigger
--                                                    fonksiyonu (kurulur ama HİÇBİR tabloya bağlanmaz)
--   3. yh_source_activation_set / _deactivate RPC  → explicit activation / kill-switch (service_role)
--   4. RLS ENABLE + anon/authenticated REVOKE → service_role only
--
-- KAPSAM DIŞI (BİLİNÇLİ — AYRI PRODUCTION KAPILARI):
--   * Kaynak tablolara TRIGGER bağlama            → explicit aktivasyon SQL'i (bu migration'da YOK)
--   * `is_active=true` / `backfill_allowed=true`   → explicit activation statement (ayrı onay)
--   * Historical backfill / reconcile-all          → ayrı komut (backfill DEFAULT false)
--   * Worker v1 kapsam genişletmesi (global-canonical / join / client index) → ayrı iş
--   * HİÇBİR INSERT/UPDATE/DELETE veri operasyonu (backfill) yok; test verisi indexlenmez.
--
-- MERGE-SAFE / APPLY-SAFE İNVARYANTI (KİLİTLİ):
--   CODE MERGED ≠ SOURCE ACTIVATED ≠ MIGRATION APPLIED.
--   - Bu migration uygulansa dahi yh_source_activation'da HİÇBİR satır INSERT edilmez →
--     her kaynak default INACTIVE (kod-tarafı evaluateProcessingGate: runtime === null → inactive).
--   - yh_cdc_enqueue KURULUR ama hiçbir tabloya BAĞLANMAZ → olay üretmez.
--   - Bir kaynak yalnız (kod enabled:true) VE (yh_source_activation.is_active=true) birlikte
--     olduğunda işlenir; ikisi de AYRI, explicit production kapısıdır.
--
-- GÜVENLİK:
--   - RLS ENABLE (service_role bypass) + PUBLIC/anon/authenticated REVOKE.
--   - Tüm fonksiyonlar SECURITY DEFINER + sabit search_path + schema-qualified adlar.
--   - Trigger fonksiyonu ham PII / source text / payload snapshot YAZMAZ (yalnız identifier + minimal meta).
--   - Aktivasyon kapalıyken trigger kaynak CRUD'unu ENGELLEMEZ (sessiz no-op; fail-open YALNIZ
--     "olay üretme" için — güvenlik kararı: kapalı kaynak olay üretmemeli, CRUD'u bozmamalı).
--
-- UYGULAMA: Supabase Dashboard SQL Editor. AYRI ONAY. Production apply bu paketin DIŞINDA.
-- IDEMPOTENT: CREATE ... IF NOT EXISTS / CREATE OR REPLACE / guard'lı REVOKE/GRANT/POLICY.
-- ROLLBACK-ONLY: tek transaction; herhangi bir adım hata verirse tümü geri alınır.
-- =============================================================================

BEGIN;

-- ─── 1) yh_source_activation — kaynak-başına aktivasyon durumu (DEFAULT OFF) ───
CREATE TABLE IF NOT EXISTS public.yh_source_activation (
  source_key        text        PRIMARY KEY,

  -- Runtime aktivasyon kapısı: DEFAULT false → apply-safe (satır olsa bile aktive değil).
  is_active         boolean     NOT NULL DEFAULT false,
  -- Historical backfill izni: DEFAULT false → activation ≠ backfill (INV-3).
  backfill_allowed  boolean     NOT NULL DEFAULT false,

  -- Bilgi/denetim alanları (davranışa etki etmez; kod tarafı source-of-truth activationMatrix).
  activation_class  text,
  scope             text,
  note              text,

  activated_at      timestamptz,
  deactivated_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT yhsa_source_key_chk  CHECK (length(btrim(source_key)) > 0),
  -- Backfill YALNIZ aktif kaynakta izinli olabilir (kapalı kaynakta backfill anlamsız + tehlikeli).
  CONSTRAINT yhsa_backfill_requires_active_chk CHECK (NOT backfill_allowed OR is_active),
  CONSTRAINT yhsa_scope_chk  CHECK (scope IS NULL OR scope IN ('professional', 'client'))
);

-- ─── 2) Kilit: RLS ENABLE + anon/authenticated REVOKE + service_role GRANT/POLICY ──
ALTER TABLE public.yh_source_activation ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.yh_source_activation FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yh_source_activation TO service_role;
DROP POLICY IF EXISTS service_role_yh_source_activation ON public.yh_source_activation;
CREATE POLICY service_role_yh_source_activation ON public.yh_source_activation
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3) yh_cdc_enqueue() — AKTİVASYON-KAPILI generic CDC enqueue trigger fonksiyonu ──
-- BF-11C `yh_outbox_enqueue`'in aktivasyon-kapılı genellemesi. YALNIZ column-tenant
-- (id uuid + tenant_id uuid NOT NULL) kaynaklar içindir (worker v1 kapsamı). Aktivasyon
-- KAPALIYSA (yh_source_activation.is_active değil) → sessiz no-op (kaynak CRUD ENGELLENMEZ).
-- Bu fonksiyon KURULUR ama bu migration'da HİÇBİR tabloya BAĞLANMAZ (merge/apply-safe).
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_source_key   text := TG_ARGV[0];
  v_expect_table text := TG_ARGV[1];
  v_active       boolean;
  v_operation    text;
  v_source_id    uuid;
  v_tenant_id    uuid;
BEGIN
  -- Fail-closed argüman doğrulaması.
  IF v_source_key IS NULL OR length(btrim(v_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_cdc_enqueue: source_key argumani eksik';
  END IF;
  IF v_expect_table IS NULL OR length(btrim(v_expect_table)) = 0 THEN
    RAISE EXCEPTION 'yh_cdc_enqueue: expected source_table argumani eksik';
  END IF;
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue: beklenmeyen schema % (public bekleniyor)', TG_TABLE_SCHEMA;
  END IF;
  IF TG_TABLE_NAME IS DISTINCT FROM v_expect_table THEN
    RAISE EXCEPTION 'yh_cdc_enqueue: source_table uyusmazligi (% <> %)', TG_TABLE_NAME, v_expect_table;
  END IF;

  -- ── AKTİVASYON KAPISI (BF-11E çekirdeği): kapalı kaynak OLAY ÜRETMEZ ──────────
  -- is_active satırı yoksa (apply-safe default) veya false ise → sessiz no-op.
  -- Kaynak CRUD'unu ENGELLEMEZ (kapalı bir kaynak yüzünden kullanıcı işlemi bozulmaz).
  SELECT a.is_active INTO v_active
  FROM public.yh_source_activation AS a
  WHERE a.source_key = v_source_key;

  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- ── Aktif kaynak: BF-11C ile birebir enqueue akışı ───────────────────────────
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert';
    v_source_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete';
    v_source_id := OLD.id;          -- OLD korunur (kaynak satır artık yok)
    v_tenant_id := OLD.tenant_id;   -- DELETE tombstone için OLD tenant korunur
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- Fail-closed: geçerli source_id + tenant_id zorunlu (null → kaynak CRUD ROLLBACK).
  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'yh_cdc_enqueue: source_id null (%, %)', v_expect_table, v_source_key;
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'yh_cdc_enqueue: tenant_id null (%, %)', v_expect_table, v_source_key;
  END IF;

  -- Atomik enqueue + coalescing (BF-11A UNIQUE(source_key, source_id)); ham PII/text YAZILMAZ.
  INSERT INTO public.yasam_hafizasi_outbox AS o
    (source_key, source_table, source_id, tenant_id, operation)
  VALUES
    (v_source_key, TG_TABLE_NAME, v_source_id, v_tenant_id, v_operation)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      -- PROCESSING (in-flight worker claim/lease) KORUNUR → BF-11A stale-event sözleşmesi bozulmaz.
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at  ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at     ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by     ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error    ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at  ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger mekanizması EXECUTE gerektirmez; doğrudan çağrı yüzeyi kapatılır (defense-in-depth).
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue() FROM PUBLIC, anon, authenticated;

-- ─── 4) yh_source_activation_set — explicit activation (gerçek production kapısı) ──
-- Bu RPC'nin çağrılması aktivasyonun GERÇEK production kapısıdır (ayrı onay). Kod enabled:true
-- + trigger kurulumu ayrıca gereklidir. p_backfill_allowed default false (activation ≠ backfill).
CREATE OR REPLACE FUNCTION public.yh_source_activation_set(
  p_source_key       text,
  p_is_active        boolean,
  p_backfill_allowed boolean DEFAULT false,
  p_activation_class text    DEFAULT NULL,
  p_scope            text    DEFAULT NULL,
  p_note             text    DEFAULT NULL
)
RETURNS public.yh_source_activation
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row public.yh_source_activation%ROWTYPE;
BEGIN
  IF p_source_key IS NULL OR length(btrim(p_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_source_activation_set: p_source_key bos';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'yh_source_activation_set: p_is_active null';
  END IF;
  -- Backfill YALNIZ aktif kaynakta izinli (CHECK ile de zorlanır; burada erken fail-closed).
  IF COALESCE(p_backfill_allowed, false) AND NOT p_is_active THEN
    RAISE EXCEPTION 'yh_source_activation_set: backfill yalniz aktif kaynakta izinli';
  END IF;
  IF p_scope IS NOT NULL AND p_scope NOT IN ('professional', 'client') THEN
    RAISE EXCEPTION 'yh_source_activation_set: gecersiz scope %', p_scope;
  END IF;

  INSERT INTO public.yh_source_activation AS a
    (source_key, is_active, backfill_allowed, activation_class, scope, note,
     activated_at, deactivated_at, updated_at)
  VALUES
    (p_source_key, p_is_active, COALESCE(p_backfill_allowed, false), p_activation_class, p_scope, p_note,
     CASE WHEN p_is_active THEN now() ELSE NULL END,
     CASE WHEN p_is_active THEN NULL ELSE now() END,
     now())
  ON CONFLICT (source_key) DO UPDATE
  SET is_active        = EXCLUDED.is_active,
      backfill_allowed = EXCLUDED.backfill_allowed,
      activation_class = COALESCE(EXCLUDED.activation_class, a.activation_class),
      scope            = COALESCE(EXCLUDED.scope, a.scope),
      note             = EXCLUDED.note,
      activated_at     = CASE WHEN EXCLUDED.is_active AND NOT a.is_active THEN now() ELSE a.activated_at END,
      deactivated_at   = CASE WHEN NOT EXCLUDED.is_active AND a.is_active THEN now() ELSE a.deactivated_at END,
      updated_at       = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ─── 5) yh_source_deactivate — KILL-SWITCH (hızlı durdurma; index KORUNUR) ─────
-- Rollback-safe: yalnız processing'i durdurur (is_active=false, backfill_allowed=false).
-- Index satırlarını SİLMEZ; kaynak verisini SİLMEZ (ayrı explicit cleanup kararı gerekir).
CREATE OR REPLACE FUNCTION public.yh_source_deactivate(p_source_key text)
RETURNS public.yh_source_activation
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row public.yh_source_activation%ROWTYPE;
BEGIN
  IF p_source_key IS NULL OR length(btrim(p_source_key)) = 0 THEN
    RAISE EXCEPTION 'yh_source_deactivate: p_source_key bos';
  END IF;

  UPDATE public.yh_source_activation
  SET is_active = false, backfill_allowed = false, deactivated_at = now(), updated_at = now()
  WHERE source_key = p_source_key
  RETURNING * INTO v_row;

  -- Satır yoksa: kaynak zaten inactive (default) → idempotent no-op (hata değil).
  RETURN v_row;
END;
$$;

-- ─── 6) RPC EXECUTE kilidi (least privilege): yalnız service_role ──────────────
REVOKE ALL ON FUNCTION public.yh_source_activation_set(text, boolean, boolean, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_source_activation_set(text, boolean, boolean, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.yh_source_deactivate(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_source_deactivate(text) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR — beklenen):
--   -- 1) Tablo + RLS + default OFF (apply-safe):
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'yh_source_activation';           -- t
--   SELECT count(*) FROM public.yh_source_activation;                                     -- 0 (hiç satır yok)
--   SELECT has_table_privilege('anon','public.yh_source_activation','SELECT');            -- false
--   -- 2) CDC fonksiyonu kurulu, güvenli, HİÇBİR tabloya bağlı DEĞİL:
--   SELECT prosecdef FROM pg_proc WHERE proname = 'yh_cdc_enqueue';                       -- t
--   SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON t.tgfoid = p.oid
--     WHERE p.proname = 'yh_cdc_enqueue' AND NOT t.tgisinternal;                          -- 0 (bağlı trigger yok)
--   -- 3) Aktivasyon/kill-switch RPC'leri DEFINER + yalnız service_role:
--   SELECT has_function_privilege('anon',
--     'public.yh_source_activation_set(text,boolean,boolean,text,text,text)','EXECUTE');  -- false
--   -- 4) Bu migration HİÇBİR kaynak trigger'ı kurmaz, HİÇBİR veri DML'i / backfill yapmaz,
--   --    HİÇBİR is_active=true satırı yazmaz → uygulanması hiçbir kaynağı aktive etmez.
--
-- AKTİVASYON (bu migration'da DEĞİL; AYRI ONAY + preflight PASS sonrası, örnek şablon):
--   -- (a) column-tenant kaynak için CDC trigger'ı bağla (ör. numeroloji temiz-reset sonrası):
--   --   CREATE TRIGGER yh_cdc_numerology_sources_trg
--   --     AFTER INSERT OR UPDATE OR DELETE ON public.numerology_sources
--   --     FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('numeroloji:sources','numerology_sources');
--   -- (b) kaynağı aktive et (kod enabled:true ile birlikte; backfill DEFAULT false):
--   --   SELECT public.yh_source_activation_set('numeroloji:sources', true, false,
--   --                                          'FUTURE_ONLY_READY','professional','post-reset activation');
--   -- ROLLBACK / KILL-SWITCH (index KORUNUR):
--   --   SELECT public.yh_source_deactivate('numeroloji:sources');
--   --   DROP TRIGGER IF EXISTS yh_cdc_numerology_sources_trg ON public.numerology_sources;
-- =============================================================================
