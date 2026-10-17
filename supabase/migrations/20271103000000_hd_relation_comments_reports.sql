-- =============================================================================
-- 20271103000000_hd_relation_comments_reports.sql
--
-- HUMAN DESIGN — İLİŞKİ VE GRUP ANALİZLERİ · UZMAN YORUMU + KAYITLI RAPORLAR · ADDITIVE
--
-- EKLENENLER:
--   human_design_relation_analyses  + expert_comment (≤ 10.000 karakter düz metin)
--                                   + expert_comment_updated_at / expert_comment_updated_by
--     Uzman Yorumu: analize özel, tenant-scoped; Word'e YALNIZ rapor hazırlanırken açıkça seçilirse girer.
--     (Bireysel HD "Özel Çalışma Notları" kuralı DEĞİŞMEZ; bu alan onlardan ayrıdır.)
--   human_design_relation_reports    — hazırlanmış raporun DONMUŞ içeriği (snapshot). Yorum/kayıt sonradan
--     değişse de kayıtlı rapor değişmez; yeni içerik için yeni rapor hazırlanır. Görsel saklanmaz:
--     birleşik harita / Penta şeması snapshot'taki kayıtlı veriden indirmede yeniden çizilir.
--
-- GÜVENLİK: rapor (tenant_id, analysis_id) → analiz (tenant_id, id) bileşik FK (başka tenant'a bağlanamaz);
--   analiz silinince raporları da silinir (danışan/BodyGraph etkilenmez). anon/authenticated yetkisi YOK,
--   RLS etkin, policy YOK (yalnız service_role). Mevcut satırlar DEĞİŞMEZ (yeni kolonlar NULL).
-- ÖN KOŞUL: 20271102000000_hd_relation_analyses (prod'da uygulandı, 2026-10-17).
-- DEPLOY SIRASI: önce bu migration (owner onayı), sonra kod. Kod önce çıkarsa yorum/rapor uçları
--   503 "henüz etkin değil" döner; analiz görüntüleme etkilenmez.
-- NOT: Bu dosyanın repo'da olması PROD'A UYGULANDIĞI anlamına GELMEZ.
-- =============================================================================

BEGIN;

ALTER TABLE public.human_design_relation_analyses
  ADD COLUMN IF NOT EXISTS expert_comment            text,
  ADD COLUMN IF NOT EXISTS expert_comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS expert_comment_updated_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hd_relation_analyses_expert_comment_len') THEN
    ALTER TABLE public.human_design_relation_analyses
      ADD CONSTRAINT hd_relation_analyses_expert_comment_len
      CHECK (expert_comment IS NULL OR char_length(expert_comment) <= 10000);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.human_design_relation_reports (
  id           uuid PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  analysis_id  uuid NOT NULL,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  snapshot     jsonb NOT NULL,
  CONSTRAINT hd_relation_reports_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT hd_relation_reports_analysis_fk
    FOREIGN KEY (tenant_id, analysis_id)
    REFERENCES public.human_design_relation_analyses (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT hd_relation_reports_snapshot_size CHECK (pg_column_size(snapshot) <= 2000000)
);

CREATE INDEX IF NOT EXISTS hd_relation_reports_tenant_analysis_idx
  ON public.human_design_relation_reports (tenant_id, analysis_id, created_at DESC);

REVOKE ALL PRIVILEGES ON public.human_design_relation_reports FROM anon, authenticated;
ALTER TABLE public.human_design_relation_reports ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.human_design_relation_reports TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (salt-okuma):
--   SELECT column_name FROM information_schema.columns WHERE table_name='human_design_relation_analyses' AND column_name LIKE 'expert_comment%'; -- 3
--   SELECT to_regclass('public.human_design_relation_reports');
--   SELECT has_table_privilege('anon','public.human_design_relation_reports','SELECT'); -- false
-- ROLLBACK (owner onayı): DROP TABLE public.human_design_relation_reports;
--   ALTER TABLE public.human_design_relation_analyses DROP CONSTRAINT hd_relation_analyses_expert_comment_len,
--     DROP COLUMN expert_comment, DROP COLUMN expert_comment_updated_at, DROP COLUMN expert_comment_updated_by;
--   ⚠️ Uzman yorumlarını ve kayıtlı ilişki raporlarını KALICI siler.
-- =============================================================================
