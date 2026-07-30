-- ============================================================
-- 20260905000000_aromatherapy_tombstone_index_name_fix.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C3D-A forward-fix (index adı normalizasyonu)
--
-- SORUN: 20260830000000_aromatherapy_content_audit_foundation.sql içindeki
--   tombstone index'i için istenen ad 65 karakterdi:
--     aromatherapy_content_delete_tombstones_tenant_entity_occurred_idx
--   PostgreSQL max_identifier_length = 63 olduğundan ad otomatik 63 karaktere
--   kısaltıldı (gerçek production adı):
--     aromatherapy_content_delete_tombstones_tenant_entity_occurred_i
--   Index VALID + READY ve doğru kolonlarda (tenant_id, entity_type, entity_id,
--   occurred_at); yalnız adı kararsız/kısaltılmış durumda.
--
-- ÇÖZÜM: Mevcut index'i SİLMEDEN/YENİDEN OLUŞTURMADAN yalnız metadata adını
--   açık, kısa (58 karakter) ve kararlı bir ada çevir. Tek ALTER INDEX RENAME TO.
--
-- BAĞLAYICI SINIRLAR:
--   * DROP INDEX / CREATE INDEX / REINDEX YOK (rebuild yok → kilit/maliyet yok).
--   * Tablo/kolon/constraint/function/trigger/RLS/privilege değişikliği YOK.
--   * GRANT/REVOKE YOK. Veri DML YOK. IF EXISTS/IF NOT EXISTS YOK. DO YOK.
--   * Orijinal 20260830000000 migration'ı DEĞİŞTİRİLMEZ (tarihsel/immutable kalır).
--   * fail-fast, tek transaction.
-- ============================================================

BEGIN;

ALTER INDEX
  public.aromatherapy_content_delete_tombstones_tenant_entity_occurred_i
RENAME TO
  aromatherapy_content_tombstones_tenant_entity_occurred_idx;

COMMIT;
