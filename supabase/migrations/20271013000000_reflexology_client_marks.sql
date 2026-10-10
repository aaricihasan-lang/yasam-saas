-- =============================================================================
-- 20271013000000_reflexology_client_marks.sql   [ADDITIVE — 2 NEW TABLES + TRIGGER]
--
-- REFLEKSOLOJİ — DANIŞAN İŞARET HARİTASI (ayak / avuç içi / el sırtı / yüz noktaları).
--
-- AMAÇ:
--   reflexology_mark_sessions → danışana bağlı işaret SEANSI (tarih + başlık + mesleki not).
--   reflexology_marks         → seansa ait tek nokta: yüzey + sağ/sol + normalize x/y +
--                               boyut + (ops.) yoğunluk + (ops.) kısa not.
--
-- MEVCUT REFLEKSOLOJİ VERİSİNE DOKUNMAZ: reflexology_atlas / reflexology_protocols /
--   reflexology_notes DEĞİŞMEZ (tenant düzeyi mesleki kütüphane olarak kalır). Bu tablolar
--   AYRI, danışana bağlı yeni katmandır → eski kayıtlarda kayma/veri kaybı imkânsız.
--
-- KOORDİNAT: x,y ∈ [0,1] yüzeyin SABİT viewBox'ına göre (lib/refleksoloji/markSurfaces.ts).
--   Piksel saklanmaz → mobil/web aynı nokta.
--
-- GÜVENLİK (client_anamneses deseni):
--   * REVOKE ALL FROM PUBLIC, anon, authenticated, service_role → service_role'e AÇIK allowlist.
--   * RLS açık + yalnız service_role policy → tarayıcı/publishable anahtar erişimi YOK.
--   * tenant_id / client_id / created_by_user_id İSTEMCİDEN GELMEZ: API
--     (app/api/refleksoloji/marks/**) requireModuleAccess("reflexology") + requireClientInTenant
--     ile sunucuda yazar.
--   * Composite FK'ler: seans→danışan (tenant_id, client_id) ; nokta→seans
--     (tenant_id, client_id, session_id) → bir nokta başka tenant'ın ya da başka danışanın
--     seansına DB seviyesinde bağlanamaz.
--   * Yüzey/taraf/konum kolonları DEĞİŞTİRİLEMEZ (trigger) → nokta yüzeyler arası taşınamaz.
--
-- SİLME: danışan silinince (hard delete) composite FK CASCADE seans + noktaları siler
--   (mevcut danışan silme politikası: diğer danışan tabloları ile aynı; önizleme listesine eklendi).
--   Seans silinince noktaları CASCADE.
--
-- YAŞAM HAFIZASI: bu migration CDC trigger EKLEMEZ. Koordinatlar indekslenmez (gürültü);
--   danışan-scoped hafıza kaynağı eklemek Private Memory Politika Kilidi (6 kaynak) kararıdır →
--   ayrı owner onayı (bkz. lib/yasam-hafizasi/moduleSourceMatrix.ts refleksoloji satırı).
--
-- VERİ-YIKICI MI: HAYIR. İDEMPOTENT: EVET (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- Kod önce deploy edilirse API tablo yokken 503 MARKS_NOT_READY döner (kırılmaz).
--
-- ROLLBACK (veri kaybı: TÜM danışan işaretleri silinir — yalnız bilinçli karar ile):
--   DROP TABLE IF EXISTS public.reflexology_marks;
--   DROP TABLE IF EXISTS public.reflexology_mark_sessions;
--   DROP FUNCTION IF EXISTS public.reflexology_marks_guard();
--   DROP FUNCTION IF EXISTS public.reflexology_mark_sessions_guard();
-- =============================================================================

BEGIN;

-- ─── 0) Precondition ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'reflexology_mark_sessions: public.clients bulunamadı (precondition)';
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

-- ─── 1) Seanslar ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reflexology_mark_sessions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  client_id           uuid        NOT NULL,
  session_date        date        NOT NULL,
  title               text,
  note                text,
  -- İstemci üretimli idempotency anahtarı (çift tık / yeniden deneme → tek satır).
  source_uid          text,
  created_by_user_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reflexology_mark_sessions_title_len_chk CHECK (title IS NULL OR char_length(title) <= 120),
  CONSTRAINT reflexology_mark_sessions_note_len_chk CHECK (note IS NULL OR char_length(note) <= 4000),
  CONSTRAINT reflexology_mark_sessions_uid_len_chk CHECK (source_uid IS NULL OR char_length(source_uid) BETWEEN 8 AND 80),
  CONSTRAINT reflexology_mark_sessions_tenant_client_id_key UNIQUE (tenant_id, client_id, id),
  CONSTRAINT reflexology_mark_sessions_client_fk FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.reflexology_mark_sessions IS
  'Refleksoloji danışan işaret seansları (danışana bağlı). Yalnız service_role (API /api/refleksoloji/marks).';

CREATE INDEX IF NOT EXISTS idx_reflexology_mark_sessions_client
  ON public.reflexology_mark_sessions (tenant_id, client_id, session_date DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS reflexology_mark_sessions_tenant_uid_key
  ON public.reflexology_mark_sessions (tenant_id, source_uid) WHERE source_uid IS NOT NULL;

-- ─── 2) Noktalar ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reflexology_marks (
  id                  uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid             NOT NULL,
  client_id           uuid             NOT NULL,
  session_id          uuid             NOT NULL,
  surface             text             NOT NULL,
  side                text             NOT NULL,
  x                   double precision NOT NULL,
  y                   double precision NOT NULL,
  size                text             NOT NULL DEFAULT 'medium',
  intensity           text,
  note                text,
  source_uid          text,
  created_by_user_id  uuid,
  created_at          timestamptz      NOT NULL DEFAULT now(),
  updated_at          timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT reflexology_marks_surface_chk CHECK (
    surface IN ('foot_sole', 'foot_inner', 'foot_outer', 'hand_palm', 'hand_dorsum', 'face')
  ),
  CONSTRAINT reflexology_marks_side_chk CHECK (
    (surface = 'face' AND side = 'none')
    OR (surface <> 'face' AND side IN ('right', 'left'))
  ),
  CONSTRAINT reflexology_marks_xy_chk CHECK (x >= 0 AND x <= 1 AND y >= 0 AND y <= 1),
  CONSTRAINT reflexology_marks_size_chk CHECK (size IN ('small', 'medium', 'large')),
  CONSTRAINT reflexology_marks_intensity_chk CHECK (intensity IS NULL OR intensity IN ('light', 'medium', 'strong')),
  CONSTRAINT reflexology_marks_note_len_chk CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT reflexology_marks_uid_len_chk CHECK (source_uid IS NULL OR char_length(source_uid) BETWEEN 8 AND 80),
  -- Nokta, AYNI tenant + AYNI danışanın seansına bağlıdır (çapraz danışan/tenant imkânsız).
  CONSTRAINT reflexology_marks_session_fk FOREIGN KEY (tenant_id, client_id, session_id)
    REFERENCES public.reflexology_mark_sessions (tenant_id, client_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.reflexology_marks IS
  'Refleksoloji danışan işaretleri: yüzey + sağ/sol + normalize x/y (0..1). Yalnız service_role (API).';

CREATE INDEX IF NOT EXISTS idx_reflexology_marks_session
  ON public.reflexology_marks (tenant_id, session_id, surface, side);

CREATE INDEX IF NOT EXISTS idx_reflexology_marks_client
  ON public.reflexology_marks (tenant_id, client_id);

CREATE UNIQUE INDEX IF NOT EXISTS reflexology_marks_tenant_uid_key
  ON public.reflexology_marks (tenant_id, source_uid) WHERE source_uid IS NOT NULL;

-- ─── 3) Değişmez kolon + updated_at + seans başı üst sınır ───────────────────
CREATE OR REPLACE FUNCTION public.reflexology_mark_sessions_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.source_uid IS DISTINCT FROM OLD.source_uid
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'reflexology_mark_sessions: değiştirilemez kolon güncellenemez'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reflexology_mark_sessions_guard_trg ON public.reflexology_mark_sessions;
CREATE TRIGGER reflexology_mark_sessions_guard_trg
  BEFORE UPDATE ON public.reflexology_mark_sessions
  FOR EACH ROW EXECUTE FUNCTION public.reflexology_mark_sessions_guard();

CREATE OR REPLACE FUNCTION public.reflexology_marks_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Seans başına en fazla 400 nokta (yanlışlıkla/otomasyonla şişmeyi engeller).
    SELECT count(*) INTO n FROM public.reflexology_marks
      WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id;
    IF n >= 400 THEN
      RAISE EXCEPTION 'reflexology_marks: seans nokta sınırı (400) aşıldı'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.surface IS DISTINCT FROM OLD.surface
     OR NEW.side IS DISTINCT FROM OLD.side
     OR NEW.source_uid IS DISTINCT FROM OLD.source_uid
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'reflexology_marks: değiştirilemez kolon güncellenemez (yüzey/taraf/sahiplik)'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reflexology_marks_guard_trg ON public.reflexology_marks;
CREATE TRIGGER reflexology_marks_guard_trg
  BEFORE INSERT OR UPDATE ON public.reflexology_marks
  FOR EACH ROW EXECUTE FUNCTION public.reflexology_marks_guard();

REVOKE ALL ON FUNCTION public.reflexology_mark_sessions_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reflexology_marks_guard() FROM PUBLIC, anon, authenticated;

-- ─── 4) Grant + RLS ──────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.reflexology_mark_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reflexology_mark_sessions TO service_role;

REVOKE ALL ON TABLE public.reflexology_marks FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reflexology_marks TO service_role;

ALTER TABLE public.reflexology_mark_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reflexology_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_reflexology_mark_sessions" ON public.reflexology_mark_sessions;
CREATE POLICY "service_role_reflexology_mark_sessions"
  ON public.reflexology_mark_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_reflexology_marks" ON public.reflexology_marks;
CREATE POLICY "service_role_reflexology_marks"
  ON public.reflexology_marks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- DOĞRULAMA (salt-okunur):
--   SELECT relrowsecurity FROM pg_class WHERE oid IN ('public.reflexology_mark_sessions'::regclass,
--          'public.reflexology_marks'::regclass);                                         -- true, true
--   SELECT has_table_privilege('anon','public.reflexology_marks','SELECT');               -- false
--   SELECT has_table_privilege('authenticated','public.reflexology_mark_sessions','SELECT'); -- false
-- =============================================================================
