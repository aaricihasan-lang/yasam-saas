-- =============================================================================
-- 20271007000000_hd_roxy_autocalc.sql
--
-- HUMAN DESIGN — RoxyAPI OTOMATİK HESAPLAMA · ADDITIVE KOLONLAR (FAZ 1)
--
-- AMAÇ: Roxy ile hesaplanan haritayı mevcut human_design_charts tablosunda
--   (source='computed') sağlayıcısı AÇIKÇA ayırt edilebilir, idempotent ve ham sağlayıcı
--   yanıtı uzman içeriğinden İZOLE biçimde saklamak.
--
-- EKLENENLER (hepsi NULLABLE, default yok → metadata-only, tablo yeniden yazılmaz):
--   provider      text   — 'roxyapi' (NULL = manuel ya da eski dahili motor kaydı)
--   provider_raw  jsonb  — Roxy'nin HAM yanıtı (açıklama metinleri dahil). Yalnız sunucu
--                          tarafında saklanır; istemciye gönderilmez, uzman Bilgi Bankası'na
--                          ve Word raporuna KOPYALANMAZ.
--   input_hash    text   — idempotency anahtarı (sha256: tenant+danışan+tarih+saat+tz+
--                          koordinat+nodeType+lang+adaptör sürümü).
--   + kısmi UNIQUE index (tenant_id, input_hash) WHERE input_hash IS NOT NULL
--     → aynı girdinin eşzamanlı ikinci kaydı DB seviyesinde reddedilir (uygulama ayrıca
--       deterministik satır id'si kullanır; bu index ikinci emniyet kemeridir).
--
-- GERİYE UYUM / GÜVENLİK:
--   • DROP / RENAME / tip daraltma / DEFAULT değişikliği YOK. Mevcut satırlar DEĞİŞMEZ
--     (yeni kolonlar NULL; index yalnız input_hash dolu satırları kapsar → mevcut tüm
--     satırlar index dışında, çakışma imkânsız).
--   • RLS / policy / grant DEĞİŞMEZ (tablo anon/authenticated'a zaten kapalı; erişim
--     yalnız service_role sunucu route'ları).
--   • human_design_clients tablosuna DOKUNULMAZ (doğum yeri/tz hesap kaydında tutulur:
--     mevcut timezone + location_id + input kolonları).
--   • Idempotent: IF NOT EXISTS.
--
-- DEPLOY SIRASI (BAĞLAYICI): önce bu migration (Dashboard SQL Editor), sonra kod.
--   Kod migration'dan önce yayına çıkarsa: otomatik hesap ucu Roxy'yi ÇAĞIRMADAN
--   503 "henüz etkin değil" döner (kolon-yok tespiti); manuel HD akışı etkilenmez.
--
-- NOT: Bu dosyanın repo'da olması PROD'A UYGULANDIĞI anlamına GELMEZ.
-- =============================================================================

BEGIN;

ALTER TABLE public.human_design_charts
  ADD COLUMN IF NOT EXISTS provider     text,
  ADD COLUMN IF NOT EXISTS provider_raw jsonb,
  ADD COLUMN IF NOT EXISTS input_hash   text;

CREATE UNIQUE INDEX IF NOT EXISTS hd_charts_tenant_input_hash_uidx
  ON public.human_design_charts (tenant_id, input_hash)
  WHERE input_hash IS NOT NULL;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='human_design_charts'
--      AND column_name IN ('provider','provider_raw','input_hash');      -- 3 satır, YES
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname='public' AND indexname='hd_charts_tenant_input_hash_uidx'; -- 1
--   SELECT count(*) FROM public.human_design_charts WHERE input_hash IS NOT NULL; -- 0 (apply anında)
--   SELECT has_table_privilege('anon','public.human_design_charts','SELECT');    -- false (değişmedi)
--
-- ROLLBACK (yalnız Roxy kayıtları yoksa / bilinçli karar ile):
--   DROP INDEX IF EXISTS public.hd_charts_tenant_input_hash_uidx;
--   ALTER TABLE public.human_design_charts
--     DROP COLUMN IF EXISTS input_hash,
--     DROP COLUMN IF EXISTS provider_raw,
--     DROP COLUMN IF EXISTS provider;
--   ⚠️ DROP COLUMN Roxy ham yanıtlarını KALICI siler; Roxy satırları (computed_result) kalır.
-- =============================================================================
