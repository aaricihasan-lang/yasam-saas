-- =============================================================================
-- 20271113000000_hd_education_chart_provider_body.sql
--
-- HUMAN DESIGN — HAZIR EĞİTİM HARİTALARI · YALNIZ public.hd_education_charts · ADDITIVE
-- Önkoşul: 20271110000000 (B1) + 20271112000000 (B2). Başka tabloya / RLS'ye / role DOKUNULMAZ.
--
-- NEDEN: `provider_raw_sha256` = sha256(JSON.stringify(yanıt, sağlayıcı anahtar sırası)). `provider_raw` jsonb'dir ve
-- anahtar sırasını korumaz → DB'deki kopyadan bu özet YENİDEN ÜRETİLEMEZ (yanıtın birebir korunduğu kanıtlanamaz).
-- ÇÖZÜM (üç ayrı, açıkça adlandırılmış alan):
--   provider_body            — sağlayıcının HTTP yanıt gövdesi, parse EDİLMEDEN (UTF-8 metin; JSON zorunlu UTF-8).
--   provider_body_sha256     — sha256(gövde baytları). DB kısıtı ile ZORUNLU tutarlı (sha256(convert_to(...,'UTF8'))).
--   provider_canonical_sha256— anahtarları sıralı deterministik JSON'un özeti (uygulama hesaplar). jsonb gidiş-dönüşünde
--                              DEĞİŞMEZ → provider_raw'ın gövdeyle aynı veri olduğu her zaman yeniden doğrulanabilir.
-- Eski satırlar NULL kalır (geriye uyum; append-only satırlar güncellenmez). Gövde varsa: gövde özeti (DB hesaplar),
-- kanonik özet zorunlu ve `provider_body::jsonb = provider_raw` (gövde ile saklanan veri İÇERİK olarak aynı; DB denetler).
-- Kanonik özetin kendisi SQL'de yeniden hesaplanamaz (sayı biçimi JS'e özgü) → uygulama + araçlar doğrular.
-- Boyut sınırı 1 MB (gerçek yanıtlar ≈ 32–36 KB). İstemciye ASLA seçilmez (uygulama açık kolon listeleri kullanır).
-- DEPLOY: Bu dosyanın repoda olması HİÇBİR ORTAMA UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
-- =============================================================================

BEGIN;

-- Önkoşul (açık RED): B1 tablosu + B2 sürüm/denetim yapısı yoksa bu migration UYGULANMAZ.
DO $$
BEGIN
  IF to_regclass('public.hd_education_charts') IS NULL THEN
    RAISE EXCEPTION '20271113: önkoşul eksik — public.hd_education_charts yok (önce 20271110000000)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'hd_education_publications' AND column_name = 'chart_verified_at') THEN
    RAISE EXCEPTION '20271113: önkoşul eksik — B2 (20271112000000) uygulanmamış';
  END IF;
END $$;

ALTER TABLE public.hd_education_charts
  ADD COLUMN IF NOT EXISTS provider_body             text,
  ADD COLUMN IF NOT EXISTS provider_body_sha256      text,
  ADD COLUMN IF NOT EXISTS provider_canonical_sha256 text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hd_edu_charts_body_chk' AND conrelid = 'public.hd_education_charts'::regclass) THEN
    ALTER TABLE public.hd_education_charts ADD CONSTRAINT hd_edu_charts_body_chk CHECK (
      (provider_body IS NULL AND provider_body_sha256 IS NULL)
      OR (provider_body IS NOT NULL
          AND octet_length(provider_body) BETWEEN 2 AND 1048576
          AND provider_body_sha256 ~ '^[0-9a-f]{64}$'
          AND provider_body_sha256 = encode(sha256(convert_to(provider_body, 'UTF8')), 'hex')
          -- Gövde varsa kanonik özet de ZORUNLU ve gövde, saklanan jsonb ile AYNI veri olmalı (yalnız biçim değil, içerik).
          AND provider_canonical_sha256 IS NOT NULL
          AND provider_raw IS NOT NULL
          AND provider_body::jsonb = provider_raw)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hd_edu_charts_canonical_chk' AND conrelid = 'public.hd_education_charts'::regclass) THEN
    ALTER TABLE public.hd_education_charts ADD CONSTRAINT hd_edu_charts_canonical_chk CHECK (
      provider_canonical_sha256 IS NULL OR provider_canonical_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

COMMENT ON COLUMN public.hd_education_charts.provider_body IS 'Sağlayıcı HTTP yanıt gövdesi (parse öncesi, birebir). Yalnız sunucu; istemciye gönderilmez.';
COMMENT ON COLUMN public.hd_education_charts.provider_body_sha256 IS 'sha256(provider_body UTF-8 baytları) — DB kısıtı ile doğrulanır.';
COMMENT ON COLUMN public.hd_education_charts.provider_canonical_sha256 IS 'Anahtarları sıralı kanonik JSON özeti — jsonb gidiş-dönüşünde değişmez.';

COMMIT;
