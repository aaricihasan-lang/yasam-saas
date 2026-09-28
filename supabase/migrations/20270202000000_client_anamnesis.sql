-- =============================================================================
-- 20270202000000_client_anamnesis.sql   [ADDITIVE — 2 NEW TABLES + TRIGGERS]
--
-- DANIŞAN YOLCULUĞU — ANAMNEZ V1 (tarihçeli, danışana özel, snapshot anamnez).
--
-- AMAÇ:
--   client_anamneses              → her satır bir anamnez SÜRÜMÜ (tarihsel snapshot).
--     * Kanonik şablon KODDADIR (lib/danisan/anamnez/template/stdV1.ts, sürüm `std-v1`);
--       DB yalnız sürüm anahtarını + danışana özel FARKI (form_custom) + cevapları tutar.
--     * status 'completed' olan satır DB SEVİYESİNDE KİLİTLİDİR (UPDATE engellenir).
--       Düzeltme/güncelleme YENİ satırla yapılır (based_on_anamnesis_id bilgi amaçlı).
--     * Danışan başına en fazla 1 açık taslak (partial unique).
--   client_anamnesis_attachments  → private Storage (client-anamnesis-files) PDF metadata'sı.
--     * storage_path CHECK ile tenant/danışan/anamnez önekine BAĞLIDIR (DB seviyesinde).
--     * UPDATE engellenir (ek yalnız eklenir/silinir); anamnez başına en fazla 5 ek (trigger).
--
-- GÜVENLİK MODELİ (client_consents deseni):
--   * REVOKE ALL FROM PUBLIC, anon, authenticated, service_role → sonra service_role'e AÇIK
--     allowlist GRANT. Yeni tablolar Supabase varsayılan yetkilerine (default privileges /
--     Data API otomatik GRANT davranışı) DAYANMAZ → platform davranışı değişse de aynı sonuç.
--   * RLS açık + yalnız service_role policy → tarayıcı/publishable anahtar erişimi YOK.
--   * tenant_id / client_id / *_by_user_id İSTEMCİDEN GELMEZ: API (app/api/clients/[id]/anamnez)
--     requireModuleAccess guard'ından yazar. Composite FK'ler çapraz-tenant eşleşmeyi DB'de reddeder.
--
-- SİLME: clients satırı silinince composite FK CASCADE anamnez + ek satırlarını siler (KVKK
--   silme hakkı; client_consents ile aynı). Storage nesneleri DB dışıdır → cascade-delete route
--   dosyaları DB silmesinden ÖNCE temizler (bkz. app/api/clients/[id]/cascade-delete).
--
-- PRECONDITION: public.clients (tenant_id, id). Composite FK hedefi clients_tenant_id_id_key
--   prod'da VAR (20260923000000 / 20270129000900); yoksa aynı adla idempotent eklenir.
--
-- VERİ-YIKICI MI: HAYIR (yalnız yeni tablo/fonksiyon/trigger/policy; mevcut veri değişmez).
-- İDEMPOTENT: EVET (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply sırası: bu migration → 20270202000100 (bucket) → kod deploy.
--   (API tablo yoksa 503 ANAMNEZ_NOT_READY döner; kod önce gelse de kırılmaz.)
--
-- ROLLBACK (veri kaybı: TÜM anamnez kayıtları silinir — yalnız bilinçli karar ile, veri girilmeden):
--   DROP TABLE IF EXISTS public.client_anamnesis_attachments;
--   DROP TABLE IF EXISTS public.client_anamneses;
--   DROP FUNCTION IF EXISTS public.client_anamneses_guard();
--   DROP FUNCTION IF EXISTS public.client_anamnesis_attachments_guard();
-- =============================================================================

BEGIN;

-- ─── 0) Precondition ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'client_anamneses: public.clients bulunamadı (precondition)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND contype IN ('u', 'p')
      AND conname = 'clients_tenant_id_id_key'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

-- ─── 1) Anamnez sürümleri ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_anamneses (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL,
  client_id              uuid        NOT NULL,
  kind                   text        NOT NULL,
  title                  text,
  assessment_date        date        NOT NULL,
  status                 text        NOT NULL DEFAULT 'draft',
  template_key           text        NOT NULL DEFAULT 'standard',
  template_version       text        NOT NULL,
  -- Kanonik şablona göre danışana özel FARK (gizlenen/eklenen/başlığı düzenlenen sorular).
  form_custom            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- fieldKey → cevap.
  answers                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Danışan Detayı kaynaklarından aktarım / "mevcudu koru" kayıtları (değer karşılaştırması).
  source_links           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Oluşturma anındaki danışan kimlik bilgisi (ad, soyad, dogum) — tarihsel başlık.
  client_snapshot        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Güncellemenin kopyalandığı önceki anamnez (bilgi amaçlı; canlı bağ YOK).
  based_on_anamnesis_id  uuid,
  -- Optimistic concurrency (API koşullu UPDATE ... WHERE revision = base).
  revision               integer     NOT NULL DEFAULT 1,
  -- Çift gönderim idempotency anahtarı.
  create_request_id      uuid,
  created_by_user_id     uuid        NOT NULL,
  updated_by_user_id     uuid,
  completed_by_user_id   uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  completed_at           timestamptz,

  CONSTRAINT client_anamneses_kind_chk CHECK (kind IN ('initial', 'update')),
  CONSTRAINT client_anamneses_status_chk CHECK (status IN ('draft', 'completed')),
  CONSTRAINT client_anamneses_title_chk CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT client_anamneses_template_key_chk CHECK (template_key = 'standard'),
  CONSTRAINT client_anamneses_template_version_chk CHECK (template_version ~ '^std-v[0-9]{1,3}$'),
  CONSTRAINT client_anamneses_json_shape_chk CHECK (
    jsonb_typeof(form_custom) = 'object'
    AND jsonb_typeof(answers) = 'object'
    AND jsonb_typeof(source_links) = 'object'
    AND jsonb_typeof(client_snapshot) = 'object'
  ),
  CONSTRAINT client_anamneses_json_size_chk CHECK (
    pg_column_size(answers) <= 262144
    AND pg_column_size(form_custom) <= 65536
    AND pg_column_size(source_links) <= 65536
    AND pg_column_size(client_snapshot) <= 4096
  ),
  CONSTRAINT client_anamneses_revision_chk CHECK (revision >= 1),
  CONSTRAINT client_anamneses_completed_chk CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL)
    OR (status = 'draft' AND completed_at IS NULL AND completed_by_user_id IS NULL)
  ),
  CONSTRAINT client_anamneses_based_on_self_chk CHECK (based_on_anamnesis_id IS NULL OR based_on_anamnesis_id <> id),
  CONSTRAINT client_anamneses_tenant_client_id_key UNIQUE (tenant_id, client_id, id),
  CONSTRAINT client_anamneses_client_fk FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE CASCADE,
  -- Aynı danışanın önceki anamnezi; o silinirse yalnız bu kolon NULL olur (PG15+ kolon listesi).
  CONSTRAINT client_anamneses_based_on_fk FOREIGN KEY (tenant_id, client_id, based_on_anamnesis_id)
    REFERENCES public.client_anamneses (tenant_id, client_id, id) ON DELETE SET NULL (based_on_anamnesis_id)
);

COMMENT ON TABLE public.client_anamneses IS
  'Danışan anamnez sürümleri (tarihsel snapshot). Kanonik şablon kodda (template_version). completed = DB kilidi. Yalnız service_role (API).';

CREATE INDEX IF NOT EXISTS idx_client_anamneses_client_date
  ON public.client_anamneses (tenant_id, client_id, assessment_date DESC, created_at DESC);

-- Danışan başına en fazla 1 açık taslak (hangi taslağın güncel olduğu belirsizliği olmaz).
CREATE UNIQUE INDEX IF NOT EXISTS client_anamneses_one_draft_per_client
  ON public.client_anamneses (tenant_id, client_id) WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS client_anamneses_tenant_request_key
  ON public.client_anamneses (tenant_id, create_request_id) WHERE create_request_id IS NOT NULL;

-- ─── 2) Tamamlanmış anamnez kilidi + değişmez kolonlar ───────────────────────
-- completed satır: HİÇBİR alan değişemez. TEK istisna: referans verdiği önceki anamnez
--   silindiğinde FK'nin `SET NULL (based_on_anamnesis_id)` yan etkisi (başka alan değişmeden).
-- draft satır: kimlik/sahiplik/şablon/snapshot kolonları değişmez; completed→draft geri dönüş yok.
CREATE OR REPLACE FUNCTION public.client_anamneses_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    IF NEW.based_on_anamnesis_id IS NULL
       AND (to_jsonb(NEW) - 'based_on_anamnesis_id') = (to_jsonb(OLD) - 'based_on_anamnesis_id') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'client_anamneses: tamamlanmış anamnez kilitli (yeni anamnez oluşturun)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.template_key IS DISTINCT FROM OLD.template_key
     OR NEW.template_version IS DISTINCT FROM OLD.template_version
     OR NEW.client_snapshot IS DISTINCT FROM OLD.client_snapshot
     OR NEW.create_request_id IS DISTINCT FROM OLD.create_request_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (NEW.based_on_anamnesis_id IS DISTINCT FROM OLD.based_on_anamnesis_id AND NEW.based_on_anamnesis_id IS NOT NULL) THEN
    RAISE EXCEPTION 'client_anamneses: değiştirilemez kolon güncellenemez'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.client_anamneses_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_anamneses_guard ON public.client_anamneses;
CREATE TRIGGER trg_client_anamneses_guard
  BEFORE UPDATE ON public.client_anamneses
  FOR EACH ROW EXECUTE FUNCTION public.client_anamneses_guard();

-- ─── 3) PDF ek metadata'sı ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_anamnesis_attachments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  client_id            uuid        NOT NULL,
  anamnesis_id         uuid        NOT NULL,
  storage_path         text        NOT NULL,
  original_name        text        NOT NULL,
  size_bytes           integer     NOT NULL,
  mime_type            text        NOT NULL DEFAULT 'application/pdf',
  sha256               text        NOT NULL,
  uploaded_by_user_id  uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_anamnesis_attachments_path_key UNIQUE (storage_path),
  -- Yol DB seviyesinde bu satırın tenant/danışan/anamnez önekine bağlı (sunucu biçimi).
  CONSTRAINT client_anamnesis_attachments_path_chk CHECK (
    storage_path ~ ('^' || tenant_id::text || '/' || client_id::text || '/' || anamnesis_id::text
                    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$')
  ),
  CONSTRAINT client_anamnesis_attachments_name_chk CHECK (char_length(original_name) BETWEEN 1 AND 180),
  CONSTRAINT client_anamnesis_attachments_size_chk CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT client_anamnesis_attachments_mime_chk CHECK (mime_type = 'application/pdf'),
  CONSTRAINT client_anamnesis_attachments_sha_chk CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT client_anamnesis_attachments_anamnesis_fk FOREIGN KEY (tenant_id, client_id, anamnesis_id)
    REFERENCES public.client_anamneses (tenant_id, client_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.client_anamnesis_attachments IS
  'Anamnez PDF ekleri (private bucket client-anamnesis-files). UPDATE yok; anamnez başına ≤5. Yalnız service_role (API).';

CREATE INDEX IF NOT EXISTS idx_client_anamnesis_attachments_anamnesis
  ON public.client_anamnesis_attachments (tenant_id, anamnesis_id, created_at);

CREATE INDEX IF NOT EXISTS idx_client_anamnesis_attachments_client
  ON public.client_anamnesis_attachments (tenant_id, client_id);

-- UPDATE: her zaman red. INSERT: anamnez başına en fazla 5 (ebeveyn satır kilidiyle yarışsız).
CREATE OR REPLACE FUNCTION public.client_anamnesis_attachments_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'client_anamnesis_attachments: ek güncellenemez (sil + yeniden yükle)'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.client_anamneses a
   WHERE a.tenant_id = NEW.tenant_id AND a.client_id = NEW.client_id AND a.id = NEW.anamnesis_id
   FOR UPDATE;

  SELECT count(*) INTO v_count
    FROM public.client_anamnesis_attachments t
   WHERE t.tenant_id = NEW.tenant_id AND t.anamnesis_id = NEW.anamnesis_id;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'client_anamnesis_attachments: anamnez başına en fazla 5 PDF'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.client_anamnesis_attachments_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_anamnesis_attachments_guard ON public.client_anamnesis_attachments;
CREATE TRIGGER trg_client_anamnesis_attachments_guard
  BEFORE INSERT OR UPDATE ON public.client_anamnesis_attachments
  FOR EACH ROW EXECUTE FUNCTION public.client_anamnesis_attachments_guard();

-- ─── 4) Grant + RLS ──────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.client_anamneses FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_anamneses TO service_role;

REVOKE ALL ON TABLE public.client_anamnesis_attachments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.client_anamnesis_attachments TO service_role;

ALTER TABLE public.client_anamneses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_anamnesis_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_client_anamneses" ON public.client_anamneses;
CREATE POLICY "service_role_client_anamneses"
  ON public.client_anamneses FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_client_anamnesis_attachments" ON public.client_anamnesis_attachments;
CREATE POLICY "service_role_client_anamnesis_attachments"
  ON public.client_anamnesis_attachments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (salt-okunur):
--   SELECT relrowsecurity FROM pg_class WHERE oid IN ('public.client_anamneses'::regclass,
--          'public.client_anamnesis_attachments'::regclass);                                   -- true, true
--   SELECT has_table_privilege('anon','public.client_anamneses','SELECT');                      -- false
--   SELECT has_table_privilege('authenticated','public.client_anamnesis_attachments','SELECT'); -- false
--   SELECT has_table_privilege('service_role','public.client_anamnesis_attachments','UPDATE');  -- false
-- =============================================================================
