-- =============================================================================
-- 20261221000000_hd_report_snapshot.sql
--
-- HUMAN DESIGN — FAZ 2 · PROFESYONEL WORD/DOCX RAPORU · ADDITIVE SNAPSHOT KOLONLARI
--
-- AMAÇ: Mevcut public.human_design_reports tablosunu, DONDURULMUŞ (immutable)
--   profesyonel canonical raporu taşıyacak biçimde ADDITIVE olarak genişletir.
--   Yeni paralel tablo OLUŞTURULMAZ (AŞAMA 1 kilitli kararı #4).
--
-- KİLİTLİ KARAR (snapshot): profesyonel rapor oluşturulduğu anda canonical içerik
--   DONDURULUR. Canonical bilgi bankası sonradan değişse bile eski raporun içeriği
--   DEĞİŞMEZ. DOCX her indirişte LIVE canonical lookup'tan DEĞİL, kaydedilmiş
--   snapshot'tan üretilir.
--
-- ADDITIVE / GERİYE-UYUMLU:
--   • Yeni kolonlar NULLABLE (legacy satırlar kırılmaz).
--   • report_kind DEFAULT 'legacy' → mevcut TÜM satırlar otomatik 'legacy'.
--   • DROP / RENAME / veri-yıkıcı işlem YOK. Backfill ZORUNLU değil.
--   • Legacy CRUD (/api/hd/reports) davranışı DEĞİŞMEZ.
--
-- KAPSAM DIŞI (KESİN): tablo/kolon silme, kolon yeniden adlandırma, tip daraltma,
--   mevcut kolon DEFAULT/NOT NULL değişikliği, RLS/policy/grant değişikliği,
--   trigger değişikliği, veri/seed/DML (backfill), başka tabloya dokunma.
--
-- PRODUCTION APPLY: BU MİGRASYON YALNIZ REPOSITORY ARTIFACT'IDIR. AŞAMA 2'de
--   production apply YOKTUR (ayrı, kontrollü onayla uygulanır).
-- =============================================================================

BEGIN;

-- report_kind: 'legacy' (mevcut editable Word akışı) | 'canonical' (donmuş profesyonel).
-- Mevcut satırlar DEFAULT ile 'legacy' olur; NOT NULL güvenli (default var).
ALTER TABLE public.human_design_reports
  ADD COLUMN IF NOT EXISTS report_kind text NOT NULL DEFAULT 'legacy';

-- Kabul edilen değerler contract'ı (düşük-risk; yalnız iki değer). NOT VALID DEĞİL —
-- yeni kolon default'u zaten geçerli; mevcut satırlar da 'legacy' (geçerli).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'human_design_reports_report_kind_chk'
      AND conrelid = 'public.human_design_reports'::regclass
  ) THEN
    ALTER TABLE public.human_design_reports
      ADD CONSTRAINT human_design_reports_report_kind_chk
      CHECK (report_kind IN ('legacy', 'canonical'));
  END IF;
END$$;

-- Donmuş rapor payload'ı (frozen canonical içerik + yapı). Legacy satırlarda NULL.
ALTER TABLE public.human_design_reports
  ADD COLUMN IF NOT EXISTS snapshot jsonb;

-- Canonical provenance (canonical_key → {contentId, entityId, entityKind, version, hash}).
-- Snapshot içinde de normalize edilir; ayrıca sorgulanabilir/denetlenebilir olsun diye kolon.
ALTER TABLE public.human_design_reports
  ADD COLUMN IF NOT EXISTS canonical_provenance jsonb;

-- Rapor sürümü (içerik/yapı iterasyonu). Canonical V1 = 1. Legacy satırlarda NULL.
ALTER TABLE public.human_design_reports
  ADD COLUMN IF NOT EXISTS report_version integer;

-- Snapshot şema sürümü (parser/kontrat evrimi için). Canonical V1 = 'hd-report-1'.
ALTER TABLE public.human_design_reports
  ADD COLUMN IF NOT EXISTS schema_version text;

-- Sık filtre (Kayıtlı Raporlar canonical/legacy ayrımı) için hafif indeks.
CREATE INDEX IF NOT EXISTS hd_reports_report_kind_idx
  ON public.human_design_reports (report_kind);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma; beklenen):
--   • information_schema.columns: report_kind (text, NOT NULL, default 'legacy'),
--     snapshot (jsonb), canonical_provenance (jsonb), report_version (integer),
--     schema_version (text) MEVCUT.
--   • Mevcut (legacy) satırların HEPSİ report_kind='legacy'.
--   • CHECK human_design_reports_report_kind_chk MEVCUT.
-- GERİ ALMA: destructive DOWN YOK. Manuel geri alma gerekirse (İSTENMEZ):
--   DROP INDEX IF EXISTS public.hd_reports_report_kind_idx;
--   ALTER TABLE public.human_design_reports
--     DROP CONSTRAINT IF EXISTS human_design_reports_report_kind_chk,
--     DROP COLUMN IF EXISTS schema_version,
--     DROP COLUMN IF EXISTS report_version,
--     DROP COLUMN IF EXISTS canonical_provenance,
--     DROP COLUMN IF EXISTS snapshot,
--     DROP COLUMN IF EXISTS report_kind;
-- =============================================================================
