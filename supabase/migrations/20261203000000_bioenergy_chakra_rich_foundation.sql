-- =============================================================================
-- 20261202000000_bioenergy_chakra_rich_foundation.sql
--
-- BİYOENERJİ FAZ 3.2C — Kök Çakra ZENGİN İÇERİK TEMELİ (DORMANT FOUNDATION).
--
-- Locked schema contract (FAZ 3.2B) implementasyonu. Bu migration YALNIZ yapı
-- kurar; İÇERİK YAZMAZ, legacy satır DEĞİŞTİRMEZ, veri REWRITE etmez.
--
-- 1) PARENT additive quick-fact kolonları (bioenergy_chakras) — yalnız ADD;
--    mevcut legacy kolonlar (name/color/organs/glands/stones/causes/physical/
--    mental/notes) KORUNUR (rename/drop/overwrite YOK).
-- 2) YENİ tablo bioenergy_chakra_blocks — one row = one ordered content block.
-- 3) Güvenlik: FAZ 1 parity (20261001000000) — RLS ENABLED (FORCE değil),
--    anon+authenticated TÜM privilege REVOKE, permissive policy YOK,
--    service_role/postgres DOKUNULMAZ.
--
-- COMPOSITE TENANT FK SAPMASI (bilinçli):
--   Locked contract'ta SHOULD olan `UNIQUE(id, tenant_id)` + composite FK
--   `(chakra_id, tenant_id) → bioenergy_chakras(id, tenant_id)` UYGULANMADI.
--   Neden: bioenergy_chakras'ın CREATE TABLE tanımı repo migration'larında YOK
--   (base/prod şema dışarıda); tenant_id'nin NOT NULL olduğu ve UNIQUE(id,
--   tenant_id) eklemenin prod veride güvenli olduğu repo'dan DOĞRULANAMADI.
--   Görülmeyen bir prod tablosuna UNIQUE constraint eklemek riskli olduğundan
--   minimal-FK fallback seçildi: chakra_id → bioenergy_chakras(id) + child
--   tenant_id kolonu (defense-in-depth) + SERVER-SIDE tenant/ownership doğrulaması
--   (write/read route'larında). IDOR koruması sunucu katmanında zorunludur.
--
-- İÇERİK / TRANSFER / CRUD / WORD: bu migration'da YOK (sonraki fazlar).
-- PRODUCTION APPLY: bu tur YOK (dormant).
--
-- GERİ ALMA (gerekirse): DROP TABLE public.bioenergy_chakra_blocks;
--   ALTER TABLE public.bioenergy_chakras DROP COLUMN sanskrit_name, ... (additive).
-- =============================================================================

-- 1) PARENT ADDITIVE QUICK FACTS (nullable text; idempotent additive) ----------
ALTER TABLE public.bioenergy_chakras ADD COLUMN IF NOT EXISTS sanskrit_name text;
ALTER TABLE public.bioenergy_chakras ADD COLUMN IF NOT EXISTS element       text;
ALTER TABLE public.bioenergy_chakras ADD COLUMN IF NOT EXISTS location      text;
ALTER TABLE public.bioenergy_chakras ADD COLUMN IF NOT EXISTS bija_mantra   text;

-- 2) YENİ TABLO: bioenergy_chakra_blocks (one row = one ordered content block) --
CREATE TABLE IF NOT EXISTS public.bioenergy_chakra_blocks (
  -- kimlik / kapsam
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL,
  chakra_id  uuid        NOT NULL,

  -- section / sıralama
  section_key text       NOT NULL,
  block_type  text       NULL,          -- SOFT convention (hard enum YOK): text|state|application|supporter-note|source|overview
  block_title text       NULL,
  sort_order  integer    NOT NULL DEFAULT 0,

  -- içerik katmanları (hepsi nullable; boş-block engeli SERVER-layer'da, DB CHECK YOK)
  source_excerpt           text NULL,   -- kaynağın kendi dilindeki verbatim pasaj
  source_translation       text NULL,   -- sadık TR çeviri (yalnız yabancı excerpt)
  editorial_explanation    text NULL,   -- yorumdan arındırılmış açıklama
  editorial_interpretation text NULL,   -- yorumlayıcı çıkarım
  expert_note              text NULL,   -- uzman serbest notu

  -- inline citation (ayrı sources tablosu FAZ 3.4)
  source_title    text NULL,
  source_author   text NULL,
  source_ref      text NULL,            -- insan-okur konum (bölüm/sayfa)
  source_url      text NULL,
  tradition_frame text NULL,            -- SOFT: traditional|academic|modern|popular|unclear (kaynak yoksa NULL)

  -- transfer provenance mirror (gelecek admin→uzman child-copy; şimdi yalnız kolon)
  origin_type              text NULL,
  origin_label             text NULL,
  origin_source_id         uuid NULL,
  origin_transfer_batch_id uuid NULL,

  -- zaman
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bioenergy_chakra_blocks_pkey PRIMARY KEY (id),
  CONSTRAINT bioenergy_chakra_blocks_chakra_fk
    FOREIGN KEY (chakra_id) REFERENCES public.bioenergy_chakras (id) ON DELETE CASCADE,
  CONSTRAINT bioenergy_chakra_blocks_section_key_chk
    CHECK (section_key IN (
      'genel-bakis',
      'enerji-anatomisi',
      'nedenler-blokajlar',
      'beden-sistem',
      'duygusal-zihinsel',
      'uygulamalar',
      'taslar-destekleyiciler',
      'notlar-kaynaklar'
    )),
  CONSTRAINT bioenergy_chakra_blocks_origin_type_chk
    CHECK (origin_type IS NULL OR origin_type IN ('admin_transfer', 'expert_created', 'legacy'))
);

-- İndeksler (minimum; sort_order UNIQUE YOK — reorder çatışmasını önler) --------
CREATE INDEX IF NOT EXISTS bioenergy_chakra_blocks_chakra_idx
  ON public.bioenergy_chakra_blocks (chakra_id);
CREATE INDEX IF NOT EXISTS bioenergy_chakra_blocks_order_idx
  ON public.bioenergy_chakra_blocks (tenant_id, chakra_id, section_key, sort_order);

-- 3) GÜVENLİK — FAZ 1 parity (RLS ENABLED; anon/authenticated deny-by-default) --
ALTER TABLE public.bioenergy_chakra_blocks ENABLE ROW LEVEL SECURITY;
-- RLS FORCE durumu DEĞİŞTİRİLMEZ (mevcut Biyoenerji parity: false).
-- Permissive policy OLUŞTURULMAZ → anon/authenticated için deny-by-default.
-- Tarayıcı yüzeyini kesin kapat: tüm table privilege'ları REVOKE.
REVOKE ALL PRIVILEGES ON TABLE public.bioenergy_chakra_blocks FROM anon, authenticated;
-- service_role (BYPASSRLS) ve postgres DOKUNULMAZ (server erişimi korunur).

-- =============================================================================
-- Doğrulama (salt-okunur) — apply sonrası beklenen:
--   (A) bioenergy_chakra_blocks üzerinde HİÇBİR policy olmamalı (0 satır).
--   (B) anon/authenticated için HİÇBİR grant olmamalı (0 satır).
--   (C) parent 4 additive kolon mevcut olmalı.
-- =============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'bioenergy_chakra_blocks';

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'bioenergy_chakra_blocks'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bioenergy_chakras'
  AND column_name IN ('sanskrit_name', 'element', 'location', 'bija_mantra')
ORDER BY column_name;
