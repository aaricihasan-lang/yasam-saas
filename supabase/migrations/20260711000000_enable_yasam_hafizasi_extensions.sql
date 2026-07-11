-- =============================================================================
-- 20260711000000_enable_yasam_hafizasi_extensions.sql
--
-- YAŞAM HAFIZASI™ — A6: EXTENSION AKTİVASYONU
--
-- KAPSAM:
--   - unaccent → Sprint 2 (Hızlı Tarama) tam metin arama config'i (simple + unaccent).
--   - vector   → Sprint 4 (Semantic) yh_embeddings + HNSW cosine KNN.
--
-- NOT:
--   - extensions şemasına kurulur (Supabase önerisi; public kirletilmez).
--   - IDEMPOTENT: IF NOT EXISTS → tekrar çalıştırmada no-op.
--   - Bu migration canlı DB'de MANUEL uygulanmış durumu kalıcılaştırır
--     (Dashboard SQL Editor'da çalıştırıldı; DB↔repo senkronu için kayıt).
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

COMMIT;
