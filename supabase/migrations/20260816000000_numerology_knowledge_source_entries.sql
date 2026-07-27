-- ============================================================
-- 20260816000000_numerology_knowledge_source_entries.sql
--
-- NKB-V2-L3 — Numeroloji "kaynak başına ayrı not" mimarisi: ADDITIVE yeni tablo
--   public.numerology_knowledge_source_entries.
--
-- Kapsam (ADDITİF, geri-uyumlu):
--   Her kanonik knowledge kaydına (tenant+analysis_type+value başına TEK kayıt)
--   bağlı 0..N "kaynak başına ayrı not" tutar. source_id doluysa not seçilmiş
--   kaynağa bağlıdır; source_id NULL ise "Uzmanın Kendi Notu"dur (sahte kaynak
--   kaydı OLUŞTURULMAZ). Kanonik ana açıklama numerology_knowledge_records.description
--   üzerinde TEK kalır; buraya KOPYALANMAZ.
--
-- Doğuştan-kilitli güvenlik: RLS açık + anon/authenticated/PUBLIC REVOKE + yalnız
--   service_role GRANT (mevcut Numeroloji server-only deseni; policy YOK, FORCE YOK).
-- Tenant-safe: İKİ kompozit yabancı anahtar → çapraz-tenant bağ DB düzeyinde imkânsız.
--   source_id nullable + MATCH SIMPLE: source_id NULL iken FK sorgulanmaz (uzman notu).
--
-- FAIL-CLOSED: parent tablolar + (tenant_id, id) UNIQUE'ler + public.set_updated_at()
--   yoksa VEYA yeni tablo zaten varsa RAISE EXCEPTION ile DURUR (IF NOT EXISTS yok).
--   Parent UNIQUE doğrulaması constraint ADINA değil, gerçek kolon kimliklerine dayanır.
--
-- KESİNLİKLE YAPILMAYANLAR: backfill / INSERT / UPDATE / DELETE / MERGE / seed;
--   mevcut tablo ALTER'ı; set_updated_at yeniden tanımı; SECURITY DEFINER / yeni RPC;
--   audit tablosu; policy; FORCE RLS; entry_kind / soft-delete kolonları; COMMENT ON.
--   Yeni tablo BOŞ başlar.
--
-- ATOMİKLİK: tüm migration TEK transaction (BEGIN … COMMIT). Herhangi bir adım
--   hata verirse COMMIT rollback'e döner ve hiçbir şema değişikliği kalmaz.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) FAIL-CLOSED ÖN KOŞUL DOĞRULAMASI
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Parent tablolar mevcut mu?
  IF to_regclass('public.numerology_knowledge_records') IS NULL THEN
    RAISE EXCEPTION 'NKB-V2-L3 durdu: public.numerology_knowledge_records tablosu yok.'; END IF;
  IF to_regclass('public.numerology_sources') IS NULL THEN
    RAISE EXCEPTION 'NKB-V2-L3 durdu: public.numerology_sources tablosu yok.'; END IF;
  IF to_regclass('public.numerology_record_sources') IS NULL THEN
    RAISE EXCEPTION 'NKB-V2-L3 durdu: public.numerology_record_sources tablosu yok.'; END IF;

  -- Yeni tablo zaten var mı? (idempotent-güvenlik: sessizce geçme)
  IF to_regclass('public.numerology_knowledge_source_entries') IS NOT NULL THEN
    RAISE EXCEPTION 'NKB-V2-L3 durdu: numerology_knowledge_source_entries zaten mevcut.'; END IF;

  -- knowledge_records üzerinde (tenant_id, id) UNIQUE — kolon KİMLİĞİ ile (ad tahmini yok)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname = 'numerology_knowledge_records'
      AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM unnest(c.conkey) AS k(attnum)
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
          = ARRAY['id','tenant_id']::text[]
  ) THEN
    RAISE EXCEPTION 'NKB-V2-L3 durdu: numerology_knowledge_records UNIQUE (tenant_id, id) yok — kompozit FK hedefi hazır degil.'; END IF;

  -- sources üzerinde (tenant_id, id) UNIQUE
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND cl.relname = 'numerology_sources'
      AND c.contype = 'u'
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM unnest(c.conkey) AS k(attnum)
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
          = ARRAY['id','tenant_id']::text[]
  ) THEN
    RAISE EXCEPTION 'NKB-V2-L3 durdu: numerology_sources UNIQUE (tenant_id, id) yok — kompozit FK hedefi hazir degil.'; END IF;

  -- Ortak updated_at trigger fonksiyonu mevcut mu? (yeniden tanımlanmaz)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    RAISE EXCEPTION 'NKB-V2-L3 durdu: public.set_updated_at() fonksiyonu yok.'; END IF;
END
$$;

-- ------------------------------------------------------------
-- 1) TABLO — kolonlar + inline PK + inline CHECK'ler
-- ------------------------------------------------------------
CREATE TABLE public.numerology_knowledge_source_entries (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  knowledge_record_id  uuid        NOT NULL,
  source_id            uuid,                       -- NULL = "Uzmanın Kendi Notu"
  body                 text        NOT NULL,       -- uzmanın eklediği not metni
  display_order        integer     NOT NULL DEFAULT 0,
  include_in_analysis  boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT numerology_knowledge_source_entries_pkey PRIMARY KEY (id),
  CONSTRAINT numerology_knowledge_source_entries_body_chk CHECK (btrim(body) <> ''),
  CONSTRAINT numerology_knowledge_source_entries_display_order_chk CHECK (display_order >= 0)
);

-- ------------------------------------------------------------
-- 2) TENANT-SAFE aday anahtar (ileride kompozit FK hedefi + desen uyumu)
-- ------------------------------------------------------------
ALTER TABLE public.numerology_knowledge_source_entries
  ADD CONSTRAINT numerology_knowledge_source_entries_tenant_id_unique UNIQUE (tenant_id, id);

-- ------------------------------------------------------------
-- 3) KNOWLEDGE kompozit FK — kanonik kayıt silinince notlar da silinir
-- ------------------------------------------------------------
ALTER TABLE public.numerology_knowledge_source_entries
  ADD CONSTRAINT numerology_knowledge_source_entries_record_fk
  FOREIGN KEY (tenant_id, knowledge_record_id)
  REFERENCES public.numerology_knowledge_records (tenant_id, id)
  ON DELETE CASCADE;

-- ------------------------------------------------------------
-- 4) SOURCE kompozit FK — atıflı kaynak silinemez (RESTRICT); source_id NULL iken
--    MATCH SIMPLE gereği FK sorgulanmaz ("Uzmanın Kendi Notu").
-- ------------------------------------------------------------
ALTER TABLE public.numerology_knowledge_source_entries
  ADD CONSTRAINT numerology_knowledge_source_entries_source_fk
  FOREIGN KEY (tenant_id, source_id)
  REFERENCES public.numerology_sources (tenant_id, id)
  ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- 5) INDEX — kayıt-bazlı sıralı listeleme
-- ------------------------------------------------------------
CREATE INDEX numerology_knowledge_source_entries_record_idx
  ON public.numerology_knowledge_source_entries (tenant_id, knowledge_record_id, display_order, id);

-- ------------------------------------------------------------
-- 6) INDEX (partial) — kaynağa bağlı notlar + source-delete RESTRICT kontrolü
-- ------------------------------------------------------------
CREATE INDEX numerology_knowledge_source_entries_source_idx
  ON public.numerology_knowledge_source_entries (tenant_id, source_id)
  WHERE source_id IS NOT NULL;

-- ------------------------------------------------------------
-- 7) RLS + doğuştan-kilitli yetkiler (policy YOK, FORCE YOK; server-only)
-- ------------------------------------------------------------
ALTER TABLE public.numerology_knowledge_source_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.numerology_knowledge_source_entries FROM anon, authenticated, PUBLIC;
GRANT  ALL ON TABLE public.numerology_knowledge_source_entries TO service_role;

-- ------------------------------------------------------------
-- 8) updated_at trigger — mevcut ortak fonksiyona yalnız BAĞLANIR
-- ------------------------------------------------------------
CREATE TRIGGER trg_numerology_knowledge_source_entries_updated_at
  BEFORE UPDATE ON public.numerology_knowledge_source_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMIT;
