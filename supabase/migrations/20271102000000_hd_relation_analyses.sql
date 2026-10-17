-- =============================================================================
-- 20271102000000_hd_relation_analyses.sql
--
-- HUMAN DESIGN — İLİŞKİ VE GRUP ANALİZLERİ (Connection 2 kişi · Penta 3–5 kişi) · ADDITIVE
--
-- AMAÇ: RoxyAPI Connection / Penta sonuçlarını, birden çok danışanla ilişkili TEK analiz olarak,
--   tenant-güvenli ve idempotent biçimde saklamak. Mevcut HD tabloları (human_design_charts,
--   human_design_clients, human_design_reports) DEĞİŞMEZ; başka modülün tablosu kullanılmaz.
--
-- EKLENENLER:
--   public.human_design_relation_analyses      — analiz başlığı + doğrulanmış sonuç
--   public.human_design_relation_participants  — katılımcılar (sıra = Roxy'ye gönderilen üye sırası)
--
-- VERİ İLKELERİ:
--   • Doğum verisi ÇOĞALTILMAZ: katılımcı doğum bilgisi bu tablolarda YOK. Kaynak, katılımcının
--     kayıtlı ve doğrulanmış Roxy BodyGraph analizidir (source_chart_id) + o analizin girdi
--     kimliği (source_input_hash; tarihsel provenans — veri sonradan değişirse fark görünür).
--   • client_name: yalnız tarihsel görünen ad (danışan profili silinse de analiz okunabilir).
--   • Analiz silinince yalnız katılımcı BAĞLARI silinir (ON DELETE CASCADE); danışan profilleri ve
--     bireysel BodyGraph analizleri ETKİLENMEZ. Danışan/analiz silinirse bağ NULL olur (SET NULL).
--   • Tenant tutarlılığı DB seviyesinde: katılımcı (tenant_id, analysis_id) → analiz (tenant_id, id).
--   • Idempotency: UNIQUE (tenant_id, input_hash) — aynı katılımcı kümesi + aynı kaynak analizler +
--     aynı sağlayıcı politikası ikinci kez ücretli çağrı/kayıt üretmez.
--
-- GÜVENLİK: anon/authenticated için TÜM yetkiler kaldırılır, RLS etkin (policy YOK) — diğer HD
--   tablolarıyla (20260726000000_lock_human_design_tables_anon) aynı desen. Erişim yalnız
--   service_role sunucu route'ları (/api/hd/relations*). FORCE RLS kullanılmaz.
--
-- DEPLOY SIRASI: önce bu migration (owner onayıyla), sonra kod. Kod önce yayına çıkarsa ilişki/grup
--   uçları Roxy'yi ÇAĞIRMADAN 503 "henüz etkin değil" döner; mevcut HD akışları etkilenmez.
-- NOT: Bu dosyanın repo'da olması PROD'A UYGULANDIĞI anlamına GELMEZ.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.human_design_relation_analyses (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  user_id         uuid,
  kind            text NOT NULL CHECK (kind IN ('connection', 'penta')),
  member_count    smallint NOT NULL CHECK (
                    (kind = 'connection' AND member_count = 2) OR
                    (kind = 'penta' AND member_count BETWEEN 3 AND 5)
                  ),
  relation_type   text CHECK (relation_type IS NULL OR relation_type IN
                    ('partner', 'spouse', 'mother_child', 'father_child', 'friends', 'business', 'family', 'team', 'other')),
  provider        text NOT NULL DEFAULT 'roxyapi',
  endpoint        text NOT NULL,
  adapter_version text NOT NULL,
  node_type       text NOT NULL,
  lang            text NOT NULL,
  input_hash      text NOT NULL,
  result          jsonb NOT NULL,
  provider_raw    jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_relation_analyses_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS hd_relation_analyses_tenant_input_hash_uidx
  ON public.human_design_relation_analyses (tenant_id, input_hash);
CREATE INDEX IF NOT EXISTS hd_relation_analyses_tenant_created_idx
  ON public.human_design_relation_analyses (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.human_design_relation_participants (
  analysis_id       uuid NOT NULL,
  tenant_id         uuid NOT NULL,
  position          smallint NOT NULL CHECK (position BETWEEN 0 AND 4),
  client_id         uuid REFERENCES public.human_design_clients(id) ON DELETE SET NULL,
  client_name       text NOT NULL,
  source_chart_id   uuid REFERENCES public.human_design_charts(id) ON DELETE SET NULL,
  source_input_hash text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (analysis_id, position),
  CONSTRAINT hd_relation_participants_analysis_fk
    FOREIGN KEY (tenant_id, analysis_id)
    REFERENCES public.human_design_relation_analyses (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT hd_relation_participants_client_uq UNIQUE (analysis_id, client_id)
);

CREATE INDEX IF NOT EXISTS hd_relation_participants_tenant_client_idx
  ON public.human_design_relation_participants (tenant_id, client_id);

-- Erişim kilidi (yalnız service_role).
REVOKE ALL PRIVILEGES ON public.human_design_relation_analyses FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON public.human_design_relation_participants FROM anon, authenticated;
ALTER TABLE public.human_design_relation_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.human_design_relation_participants ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.human_design_relation_analyses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.human_design_relation_participants TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT to_regclass('public.human_design_relation_analyses'), to_regclass('public.human_design_relation_participants');
--   SELECT has_table_privilege('anon','public.human_design_relation_analyses','SELECT');        -- false
--   SELECT has_table_privilege('authenticated','public.human_design_relation_participants','SELECT'); -- false
--   SELECT relrowsecurity FROM pg_class WHERE relname IN ('human_design_relation_analyses','human_design_relation_participants'); -- t, t
--
-- ROLLBACK (yalnız ilişki/grup analizi kaydı yoksa ya da bilinçli karar ile):
--   DROP TABLE IF EXISTS public.human_design_relation_participants;
--   DROP TABLE IF EXISTS public.human_design_relation_analyses;
--   ⚠️ Kayıtlı Connection/Penta sonuçlarını KALICI siler; danışanlar ve BodyGraph analizleri etkilenmez.
-- =============================================================================
