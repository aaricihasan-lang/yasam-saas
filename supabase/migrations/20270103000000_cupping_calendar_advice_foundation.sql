-- =============================================================================
-- 20270103000000_cupping_calendar_advice_foundation.sql
--
-- KUPA & HACAMAT — FAZ 5 / AŞAMA 2 — HACAMAT TAKVİMİ + BİLGİLENDİRME VERİ TEMELİ.
--
-- AMAÇ: Profesyonelin KENDİ hacamat takvimini oluşturması + genel/danışana-özel
--   bilgilendirme metinleri için DÖRT additive tablo (+ 1 dar-kapsamlı atomik RPC).
--   UI, Word ve toplu-seçim FAZ 5'in ilerideki aşamalarında; bu migration yalnız
--   veri/ilişki temelidir.
--
-- ÜRÜN İLKESİ: "Doğru hacamat günleri" sistemce EMPOZE EDİLMEZ. Kaydedilen kanonik
--   veri, profesyonelin manuel seçtiği somut GREGORYEN tarihler kümesidir. Hicrî
--   tarih TÜRETİLİR (lib/cupping/hijri.ts) — plan-gün satırında SAKLANMAZ.
--
-- KOZMİK SINIR: Kozmik Hacamat (lib/cosmic/hacamat.ts, public.hacamat_rules,
--   app/cosmic-calendar/**, app/api/hacamat/**) SALT REFERANS'tır. Buraya
--   17/19/21 / altın / sünnet / uygun / yasaklı sabitleri KOPYALANMAZ; otomatik
--   içe-aktarma / senkron / varsayılan seçim YOKTUR. Bu migration Kozmik'e
--   DOKUNMAZ.
--
-- KAPSAM (hepsi ADDITIVE — DROP/TRUNCATE/DELETE/UPDATE-backfill YOK; seed satır YOK):
--   A. cupping_advice_templates      — profesyonelin YENİDEN KULLANILABİLİR genel
--        bilgilendirme şablonu (öncesi/sonrası/genel not). Tenant başına EN FAZLA
--        1 aktif varsayılan (partial unique + atomik RPC).
--   B. cupping_calendar_plans        — yıllık hacamat takvim planı (profesyonel-sahipli).
--   C. cupping_calendar_plan_days    — plana ait somut GREGORYEN günler (DATE). Hicrî
--        kolon YOK, zaman-dilimi YOK, tekrar-kuralı YOK.
--   D. cupping_client_advice         — danışana-özel bilgilendirme SNAPSHOT'ı (şablondan
--        KOPYA; canlı miras DEĞİL). source_template_id yalnız provenance.
--
-- GÜVENLİK: cupping_schema/protocols_v2/technique_workspace deseniyle BİREBİR —
--   PUBLIC/anon/authenticated REVOKE ALL + ENABLE ROW LEVEL SECURITY (FORCE YOK,
--   permissive policy YOK) → erişim yalnız service-role /api/kupa/*. Doğrudan client
--   DB erişimi YOK. Tüm FK'ler tenant-safe composite (cross-tenant enjeksiyon backstop).
--
-- İDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS; koşullu constraint DO-blokları;
--   CREATE OR REPLACE FUNCTION; REVOKE tekrar no-op.
--
-- BAĞIMLILIK: public.clients (id uuid PK, tenant_id uuid). Composite FK hedefi için
--   clients_tenant_id_id_key UNIQUE(tenant_id, id) gerekir (20260923000000 ile aynı
--   idempotent guard burada da tekrarlanır → sıralamadan bağımsız güvenli).
-- =============================================================================

BEGIN;

-- ─── 0) clients composite unique (tenant_id, id) — composite FK hedefi ────────
--   (20260923000000_yasam_hafizasi_client_memory_core.sql ile AYNI idempotent guard.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND contype = 'u'
      AND conname = 'clients_tenant_id_id_key'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

-- ─── A) cupping_advice_templates (genel, yeniden kullanılabilir) ──────────────
CREATE TABLE IF NOT EXISTS public.cupping_advice_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  title         text        NOT NULL,
  before_text   text        NOT NULL DEFAULT '',
  after_text    text        NOT NULL DEFAULT '',
  general_note  text,
  is_default    boolean     NOT NULL DEFAULT false,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_advice_templates_tenant_id_key UNIQUE (tenant_id, id)
);

-- Tenant başına EN FAZLA 1 aktif varsayılan şablon (DB seviyesinde; app-only DEĞİL).
-- Sıfır varsayılan GEÇERLİDİR. Sistem seed YOK.
CREATE UNIQUE INDEX IF NOT EXISTS cupping_advice_templates_one_default_idx
  ON public.cupping_advice_templates (tenant_id)
  WHERE is_default = true AND is_active = true;

CREATE INDEX IF NOT EXISTS cupping_advice_templates_tenant_active_idx
  ON public.cupping_advice_templates (tenant_id, is_active, updated_at DESC);

REVOKE ALL PRIVILEGES ON TABLE public.cupping_advice_templates FROM PUBLIC, anon, authenticated;
ALTER TABLE public.cupping_advice_templates ENABLE ROW LEVEL SECURITY;

-- ─── B) cupping_calendar_plans (yıllık plan; profesyonel-sahipli) ─────────────
CREATE TABLE IF NOT EXISTS public.cupping_calendar_plans (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL,
  name               text        NOT NULL,
  year               integer     NOT NULL,
  description        text,
  advice_template_id uuid,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_calendar_plans_tenant_id_key UNIQUE (tenant_id, id),
  -- Yapısal yıl aralığı (belgelenmiş güvenli sınır). Tıbbi/gün doğrulaması YOK.
  CONSTRAINT cupping_calendar_plans_year_chk CHECK (year BETWEEN 1900 AND 2200),
  -- Plan, şablon silinse de yaşar. KOLON-KAPSAMLI SET NULL (PostgreSQL 15+): şablon
  -- silinince YALNIZ advice_template_id NULL'lanır; tenant_id ASLA temizlenmez (NOT NULL
  -- ihlali/silme hatası olmaz). Composite FK cross-tenant güvenliğini KORUR.
  CONSTRAINT cupping_calendar_plans_template_fk
    FOREIGN KEY (tenant_id, advice_template_id)
    REFERENCES public.cupping_advice_templates (tenant_id, id) ON DELETE SET NULL (advice_template_id)
);

CREATE INDEX IF NOT EXISTS cupping_calendar_plans_tenant_year_idx
  ON public.cupping_calendar_plans (tenant_id, year, created_at DESC);

REVOKE ALL PRIVILEGES ON TABLE public.cupping_calendar_plans FROM PUBLIC, anon, authenticated;
ALTER TABLE public.cupping_calendar_plans ENABLE ROW LEVEL SECURITY;

-- ─── C) cupping_calendar_plan_days (somut GREGORYEN günler) ───────────────────
--   Hicrî kolon YOK (türetilir). timestamptz DEĞİL, DATE (sivil gün kaymaz).
CREATE TABLE IF NOT EXISTS public.cupping_calendar_plan_days (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  plan_id        uuid        NOT NULL,
  gregorian_date date        NOT NULL,
  user_label     text,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_calendar_plan_days_tenant_id_key UNIQUE (tenant_id, id),
  -- Plan silinince günleri de temizlenir (CASCADE); AYNI tarih FARKLI planda olabilir.
  CONSTRAINT cupping_calendar_plan_days_plan_fk
    FOREIGN KEY (tenant_id, plan_id)
    REFERENCES public.cupping_calendar_plans (tenant_id, id) ON DELETE CASCADE,
  -- Aynı plan içinde aynı gün iki kez seçilemez (bulk idempotency temeli).
  CONSTRAINT cupping_calendar_plan_days_unique UNIQUE (tenant_id, plan_id, gregorian_date)
);

CREATE INDEX IF NOT EXISTS cupping_calendar_plan_days_plan_date_idx
  ON public.cupping_calendar_plan_days (tenant_id, plan_id, gregorian_date);

REVOKE ALL PRIVILEGES ON TABLE public.cupping_calendar_plan_days FROM PUBLIC, anon, authenticated;
ALTER TABLE public.cupping_calendar_plan_days ENABLE ROW LEVEL SECURITY;

-- ─── D) cupping_client_advice (danışana-özel SNAPSHOT) ────────────────────────
--   Şablondan KOPYA metin; source_template_id yalnız provenance (canlı miras DEĞİL).
--   Bir danışanın BİRDEN FAZLA bilgilendirme kaydı olabilir (hard-unique YOK).
CREATE TABLE IF NOT EXISTS public.cupping_client_advice (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL,
  client_id          uuid        NOT NULL,
  source_template_id uuid,
  title              text        NOT NULL,
  before_text        text        NOT NULL DEFAULT '',
  after_text         text        NOT NULL DEFAULT '',
  general_note       text,
  is_active          boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_client_advice_tenant_id_key UNIQUE (tenant_id, id),
  -- Danışan silinince danışana-özel bilgilendirme de silinir (repo client-bağımlı
  -- veri kuralı: ON DELETE CASCADE — bkz. 20261219000000 + nutrition_client_*).
  CONSTRAINT cupping_client_advice_client_fk
    FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE CASCADE,
  -- Kaynak şablon silinse de snapshot metin yaşar. KOLON-KAPSAMLI SET NULL (PostgreSQL
  -- 15+): YALNIZ source_template_id (provenance) NULL'lanır; tenant_id ASLA temizlenmez.
  -- Composite FK cross-tenant güvenliğini KORUR.
  CONSTRAINT cupping_client_advice_template_fk
    FOREIGN KEY (tenant_id, source_template_id)
    REFERENCES public.cupping_advice_templates (tenant_id, id) ON DELETE SET NULL (source_template_id)
);

CREATE INDEX IF NOT EXISTS cupping_client_advice_tenant_client_idx
  ON public.cupping_client_advice (tenant_id, client_id, created_at DESC);

REVOKE ALL PRIVILEGES ON TABLE public.cupping_client_advice FROM PUBLIC, anon, authenticated;
ALTER TABLE public.cupping_client_advice ENABLE ROW LEVEL SECURITY;

-- ─── E) Varsayılan şablon geçişi — TENANT-KAPSAMLI SERİLEŞTİRME (atomik) ───────
--   EŞ ZAMANLILIK: iki istek AYNI tenant'ta FARKLI hedefleri (B ve C) aynı anda
--   varsayılan yapmaya kalkarsa YALNIZ hedef-satır kilidi bunları serileştirMEZ
--   (farklı satırları kilitlerler). Bu nedenle önce TENANT-KAPSAMLI transaction
--   advisory lock alınır: aynı tenant'ın tüm varsayılan-geçişleri sıraya girer
--   (commit/rollback'te otomatik bırakılır; tek kilit anahtarı → normal kullanımda
--   deadlock YOK). Serileşme sonrası ÖNCE diğer varsayılanlar temizlenir, SONRA hedef
--   varsayılan yapılır → geçici iki-varsayılan durumu OLUŞMAZ, unique index'te yarış
--   YOK, sonuç deterministik (son yazan mantıksal kazanır). Partial unique index yine
--   NİHAİ DB invariant'ıdır (tenant başına ≤1 aktif varsayılan) ama yarışın 500'e
--   dönüşmesine GÜVENİLMEZ. Yalnız varsayılanı TRUE yapan yollar (POST/PATCH) bu RPC'yi
--   çağırır; düz UPDATE'ler yalnız is_default=FALSE yapar (invariant'ı ihlal edemez).
--
--   GÜVENLİK: SECURITY INVOKER (yetki yükseltmesi YOK; service-role çağırır),
--   sabit search_path, EXECUTE PUBLIC/anon/authenticated REVOKE + yalnız service_role.
--   tenant_id İSTEMCİDEN gelmez (API guard verir).
--   HATA: 45001 = şablon bu tenant'a ait değil (→404/400).
CREATE OR REPLACE FUNCTION public.cupping_advice_template_set_default_atomic(
  p_tenant_id   uuid,
  p_template_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  -- 1) TENANT-KAPSAMLI serileştirme (xact advisory lock; adanmış namespace + tenant).
  --    Aynı tenant'ın eşzamanlı varsayılan-geçişleri burada sıraya girer.
  PERFORM pg_advisory_xact_lock(hashtext('cupping_advice_default'), hashtext(p_tenant_id::text));

  -- 2) Hedef şablon AYNI tenant'a ait olmalı + satır kilidi (tutarlı anlık görüntü).
  PERFORM 1
  FROM public.cupping_advice_templates
  WHERE id = p_template_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cupping_advice_template_not_owned' USING ERRCODE = '45001';
  END IF;

  -- 3) Diğer TÜM varsayılanları önce kaldır (tek satır kalır → index çakışmaz).
  UPDATE public.cupping_advice_templates
  SET is_default = false, updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND id <> p_template_id
    AND is_default = true;

  -- 4) Hedefi varsayılan + aktif yap (arşivli bir şablon varsayılan yapılamaz →
  --    is_active = true birlikte set edilir; tek aktif-varsayılan invariantı korunur).
  UPDATE public.cupping_advice_templates
  SET is_default = true, is_active = true, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_template_id;

  SELECT to_jsonb(t) INTO v_result
  FROM public.cupping_advice_templates t
  WHERE t.id = p_template_id AND t.tenant_id = p_tenant_id;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cupping_advice_template_set_default_atomic(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cupping_advice_template_set_default_atomic(uuid, uuid)
  TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   4 tablo: cupping_advice_templates / cupping_calendar_plans /
--            cupping_calendar_plan_days / cupping_client_advice → hepsi RLS ENABLED.
--   SELECT has_table_privilege('anon','public.cupping_calendar_plans','SELECT'); -- false
--   Partial unique: aynı tenant'a 2. aktif-varsayılan INSERT → 23505 (unique_violation).
--   Composite FK: cross-tenant plan_id / client_id / template_id → 23503 (fk_violation).
--   plan_days.gregorian_date tipi = date (timestamptz DEĞİL).
--   KOLON-KAPSAMLI SET NULL: referanslı şablon DELETE → plan/clientAdvice satırı yaşar,
--     ref kolonu (advice_template_id / source_template_id) NULL, tenant_id DEĞİŞMEZ.
--   DEFAULT RPC: pg_advisory_xact_lock (namespace 'cupping_advice_default' + tenant) →
--     aynı tenant'ta eşzamanlı 2 varsayılan-geçişi serileşir; geçici çift-varsayılan yok.
--
-- ROLLBACK (gerekirse):
--   DROP FUNCTION IF EXISTS public.cupping_advice_template_set_default_atomic(uuid,uuid);
--   DROP TABLE IF EXISTS public.cupping_client_advice;
--   DROP TABLE IF EXISTS public.cupping_calendar_plan_days;
--   DROP TABLE IF EXISTS public.cupping_calendar_plans;
--   DROP TABLE IF EXISTS public.cupping_advice_templates;
--   -- clients_tenant_id_id_key: paylaşılan hedef — BIRAKILIR (başka modüller kullanır).
-- =============================================================================
