-- =============================================================================
-- 20270201000400 — nutrition_foods_origin_guard: sabit search_path (hardening)
--
-- Supabase Security Advisor "Function Search Path Mutable" bulgusunu kapatır.
-- 20270201000100 production'a uygulanmıştır; o dosya DEĞİŞTİRİLMEZ. Bu migration
-- yalnız fonksiyon ayarını ekler: gövde, trigger ve davranış aynen korunur
-- (origin_food_id yine yalnız NULL'a düşebilir; başka değere çevrilemez → 23514).
--
-- Additive + idempotent: tekrar çalıştırılması zararsızdır. Veri değişikliği yok.
-- ALTER FUNCTION tablo kilidi almaz (yalnız pg_proc satırı).
-- =============================================================================

BEGIN;

ALTER FUNCTION public.nutrition_foods_origin_guard()
  SECURITY INVOKER
  SET search_path = pg_catalog, public;

-- Trigger fonksiyonu doğrudan çağrılamaz; istemci rollerinde EXECUTE kapalı kalır.
REVOKE ALL ON FUNCTION public.nutrition_foods_origin_guard() FROM PUBLIC, anon, authenticated;

COMMIT;
