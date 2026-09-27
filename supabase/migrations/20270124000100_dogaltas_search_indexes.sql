-- =============================================================================
-- 20270124000100_dogaltas_search_indexes.sql
--
-- DOĞALTAŞ FAZ 2 — server-side arama için index desteği (F-01 / DT-S1).
--
-- BAĞLAM: Arama artık SERVER-SIDE ilike (%term%) + tenant-scoped + sıralı
-- pagination ile çalışır (client full-corpus fetch KALDIRILDI). Gerçek sorgu
-- desenleri:
--   stones:   WHERE tenant_id = ? AND stone_name ILIKE '%q%'  ORDER BY stone_name
--             (content modunda short_description de aranır)
--   minerals: WHERE tenant_id = ? AND (name/aciklama/kategori ILIKE '%q%') ORDER BY name
--
-- Bu yüzden index seçimi ÖLÇÜLÜ (rastgele "index iyidir" DEĞİL):
--   - pg_trgm GIN trigram → leading-wildcard ILIKE '%q%' hızlandırır (asıl darboğaz).
--   - (tenant_id, <order_col>) btree → tenant filtresi + sıralı range (pagination).
-- Yalnız GERÇEKTEN aranan/ sıralanan alanlara index eklenir.
--
-- IDEMPOTENT: CREATE EXTENSION/INDEX IF NOT EXISTS. Veri değişmez.
-- ⚠️ APPLY POLİTİKASI: DOSYA. PRODUCTION'A UYGULANMADI. Apply ayrı onay kapısıdır.
-- NOT: CONCURRENTLY KULLANILMADI (transaction içinde çalışamaz; apply penceresinde
--      tablo küçük — ~291 taş / ~39 mineral — kısa lock kabul edilebilir. Büyük
--      tabloda apply gerekirse CONCURRENTLY'ye elle çevrilebilir, BEGIN/COMMIT dışında.)
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── stones: isim araması (en sık) + içerik araması ikincil alanı ──────────────
CREATE INDEX IF NOT EXISTS stones_stone_name_trgm_idx
  ON public.stones USING gin (stone_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS stones_short_description_trgm_idx
  ON public.stones USING gin (short_description gin_trgm_ops);
-- tenant + sıralı pagination (ORDER BY stone_name, tenant filtresi)
CREATE INDEX IF NOT EXISTS stones_tenant_name_idx
  ON public.stones (tenant_id, stone_name);

-- ── minerals: F-05 çekirdek arama alanları (name / aciklama / kategori) ────────
CREATE INDEX IF NOT EXISTS minerals_name_trgm_idx
  ON public.minerals USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS minerals_aciklama_trgm_idx
  ON public.minerals USING gin (aciklama gin_trgm_ops);
CREATE INDEX IF NOT EXISTS minerals_kategori_trgm_idx
  ON public.minerals USING gin (kategori gin_trgm_ops);
CREATE INDEX IF NOT EXISTS minerals_tenant_name_idx
  ON public.minerals (tenant_id, name);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma — beklenen):
--   SELECT extname FROM pg_extension WHERE extname='pg_trgm';                  -- 1 satır
--   SELECT indexname FROM pg_indexes WHERE tablename IN ('stones','minerals')
--     AND indexname LIKE '%trgm%';                                             -- 4 satır
--   EXPLAIN ANALYZE SELECT id FROM stones WHERE tenant_id='...'
--     AND stone_name ILIKE '%kuvars%';   -- Bitmap Index Scan (trgm) beklenir (yeterli satırda)
--
-- ROLLBACK (acil):
--   DROP INDEX IF EXISTS public.stones_stone_name_trgm_idx, public.stones_short_description_trgm_idx,
--     public.stones_tenant_name_idx, public.minerals_name_trgm_idx, public.minerals_aciklama_trgm_idx,
--     public.minerals_kategori_trgm_idx, public.minerals_tenant_name_idx;
-- =============================================================================
