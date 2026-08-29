-- =============================================================================
-- 20270101000100_cupping_technique_workspace_foundation.sql
--
-- KUPA & HACAMAT — FAZ 4 / AŞAMA 2A — Kupa Teknikleri çalışma alanı VERİ TEMELİ.
--
-- AMAÇ: Teknik master'ını profesyonel çalışma alanına hazırlamak için İKİ additive
--   şema öğesi ekler. UI (reader-first) AŞAMA 2B'dedir; bu migration yalnız veri/ilişki
--   temelidir.
--
-- KAPSAM (hepsi ADDITIVE — destructive DDL YOK: DROP/RENAME/legacy ALTER YOK,
--         VERİ BACKFILL YOK, kind/description/application_info/source_note/safety_note
--         DOKUNULMAZ):
--   A. cupping_techniques.practitioner_note  — "Uzman Notum" (kişisel not; source_note
--        legacy'den AYRI, formal citation'dan AYRI). NULLABLE, additive.
--   B. cupping_technique_safety              — technique ↔ master safety note structured
--        ilişkisi (protocol_safety'den AYRI; teknik-geneli güvenlik bağlama). Tenant-safe
--        composite FK: technique CASCADE (master silinirse ilişki temizlenir), safety
--        RESTRICT (kullanılan safety sessizce silinemez). Natural unique + indexler.
--
-- GÜVENLİK: cupping_schema/protocols_v2 deseniyle BİREBİR — anon/authenticated REVOKE ALL
--   + ENABLE ROW LEVEL SECURITY (FORCE YOK, permissive policy YOK) → erişim yalnız
--   service-role /api/kupa/*. Doğrudan client DB erişimi YOK.
--
-- İDEMPOTENT: ADD COLUMN/CREATE TABLE/CREATE INDEX IF NOT EXISTS; REVOKE tekrar no-op.
--
-- NOT: FK hedefleri cupping_techniques ve cupping_safety_notes üzerindeki composite
--   UNIQUE(tenant_id, id) (20261217000000_cupping_content_foundation.sql) mevcuttur.
-- =============================================================================

BEGIN;

-- ─── A. cupping_techniques.practitioner_note (additive; "Uzman Notum") ─────────
--   source_note (legacy serbest kaynak notu) ve safety_note (kısa dikkat) KORUNUR;
--   bu kolon uzmanın kişisel notu içindir — anlam ÇAKIŞMAZ, backfill YOK.
ALTER TABLE public.cupping_techniques
  ADD COLUMN IF NOT EXISTS practitioner_note text;

-- ─── B. cupping_technique_safety (technique ↔ master safety note) ─────────────
CREATE TABLE IF NOT EXISTS public.cupping_technique_safety (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  technique_id  uuid        NOT NULL,
  safety_id     uuid        NOT NULL,
  note          text,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Technique silinirse ona ait technique-safety ilişkisi de temizlenir (CASCADE).
  CONSTRAINT cupping_technique_safety_technique_fk
    FOREIGN KEY (tenant_id, technique_id) REFERENCES public.cupping_techniques (tenant_id, id) ON DELETE CASCADE,
  -- Bir safety master bir teknik tarafından kullanılıyorsa sessizce silinmesin (RESTRICT).
  CONSTRAINT cupping_technique_safety_safety_fk
    FOREIGN KEY (tenant_id, safety_id) REFERENCES public.cupping_safety_notes (tenant_id, id) ON DELETE RESTRICT,
  -- Aynı safety aynı technique'e iki kez eklenmesin.
  CONSTRAINT cupping_technique_safety_unique UNIQUE (tenant_id, technique_id, safety_id)
);

CREATE INDEX IF NOT EXISTS cupping_technique_safety_technique_idx
  ON public.cupping_technique_safety (tenant_id, technique_id, sort_order);
CREATE INDEX IF NOT EXISTS cupping_technique_safety_safety_idx
  ON public.cupping_technique_safety (tenant_id, safety_id);

-- ─── C. Kilit: anon/authenticated REVOKE + RLS ENABLE (FORCE YOK, policy YOK) ──
REVOKE ALL PRIVILEGES ON TABLE public.cupping_technique_safety FROM anon, authenticated;
ALTER TABLE public.cupping_technique_safety ENABLE ROW LEVEL SECURITY;

COMMIT;
