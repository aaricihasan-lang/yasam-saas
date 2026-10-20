-- =============================================================================
-- 20271105000000_hd_chart_variables.sql
--
-- HUMAN DESIGN — DÖRT OK / VARIABLES / PHS KALICI SONUÇ DEPOSU · ADDITIVE
--
-- AMAÇ: Kayıtlı bireysel analizin Dört Ok (Roxy Variables) sonucu bir kez başarıyla hesaplandıktan
--   sonra kalıcı saklanır; aynı analiz + aynı doğum anı + aynı adapter/politika için sunucu yeniden
--   başlasa veya başka sunucu örneği yanıt verse de YENİ ÜCRETLİ ÇAĞRI YAPILMAZ.
--   Önceki durum: yalnız süreç içi bellek (Vercel örneği başına; soğuk başlangıçta kaybolur).
--
-- EKLENEN: public.human_design_chart_variables (YALNIZ bu tablo). Mevcut HD tabloları
--   (human_design_charts, human_design_clients, …) DEĞİŞMEZ; natal computed_result'a yazılmaz.
--
-- VERİ İLKELERİ:
--   • result: sağlayıcının, sözleşme + bağımsız yerel çapraz denetimden GEÇMİŞ ham yanıtı. Okumada
--     her seferinde aynı denetimlerden (sözleşme + yerel çapraz denetim + tarihsel ofset kesinlik
--     düşürmesi) yeniden geçirilir; geçmeyen kayıt kullanılmaz (fail-closed).
--   • Doğum verisi ÇOĞALTILMAZ: ad / tarih / saat / yer / UTC doğum anı YOK. Eşleşme kanıtı: cache_key (doğum anını
--     yalnız tek yönlü özet olarak içerir), chart_input_hash, utc_offset_seconds, adapter_version, node_type, lang.
--   • cache_key = sha256(adapter | node_type | lang | tenant | chart | chart_input_hash | UTC doğum anı).
--     Doğum bilgisi, adapter veya politika değişirse anahtar değişir → eski kayıt ASLA eşleşmez.
--   • Analiz silinirse sonuç da silinir (ON DELETE CASCADE); danışan ve diğer HD kayıtları etkilenmez.
--   • Tenant tutarlılığı DB seviyesinde: human_design_charts'ta UNIQUE (tenant_id, id) YOK (o tabloya
--     DOKUNULMAZ) → bileşik FK yerine BEFORE INSERT/UPDATE tetikleyicisi (ilişki analizleriyle aynı desen):
--     harita VAR ve haritanın tenant_id'si = satırın tenant_id'si. service_role dahil her yazımda.
--
-- GÜVENLİK: anon/authenticated için TÜM yetkiler kaldırılır, RLS etkin (policy YOK = deny-by-default).
--   Erişim yalnız service_role sunucu route'u (/api/hd/charts/variables). FORCE RLS kullanılmaz.
--   tenant_id her zaman sunucudaki oturumdan gelir; istemciden alınmaz.
--
-- DEPLOY SIRASI: kod ve migration bağımsızdır. Kod bu migration'dan ÖNCE yayına çıkarsa tablo yok
--   hatası tanınır ve servis bugünkü davranışla (süreç içi önbellek + DB kilidi + ortak kota) çalışır;
--   migration uygulanınca kalıcı depo kendiliğinden devreye girer. Geri dönüş: tabloyu DROP etmek
--   yeterlidir (kod yine bugünkü davranışa düşer); başka tablo etkilenmez.
-- SIRA: 20271104000000…000700 zaman damgaları Satış Öncesi AŞAMA 1 serisine (henüz main'de değil) ayrılmıştır; bu dosya
--   çakışmasın diye 20271105000000'a konuldu. Yalnız human_design_charts'a bağımlıdır; AŞAMA 1'den önce veya sonra
--   uygulanması sonucu değiştirmez (tablo yetkileri burada açıkça REVOKE / GRANT edilir).
-- NOT: Bu dosyanın repo'da olması PROD'A UYGULANDIĞI anlamına GELMEZ (owner onayı gerekir).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.human_design_chart_variables (
  tenant_id          uuid        NOT NULL,
  chart_id           uuid        NOT NULL REFERENCES public.human_design_charts(id) ON DELETE CASCADE,
  cache_key          text        NOT NULL CHECK (cache_key ~ '^[0-9a-f]{64}$'),
  provider           text        NOT NULL DEFAULT 'roxyapi',
  endpoint           text        NOT NULL,
  adapter_version    text        NOT NULL CHECK (char_length(adapter_version) BETWEEN 1 AND 64),
  node_type          text        NOT NULL CHECK (node_type IN ('true', 'mean')),
  lang               text        NOT NULL CHECK (char_length(lang) BETWEEN 2 AND 8),
  chart_input_hash   text,
  utc_offset_seconds integer     NOT NULL CHECK (utc_offset_seconds BETWEEN -86400 AND 86400),
  result             jsonb       NOT NULL CHECK (jsonb_typeof(result) = 'object' AND pg_column_size(result) <= 262144),
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_chart_variables_pkey PRIMARY KEY (tenant_id, chart_id, cache_key)
);

-- Analiz silmede CASCADE ve analiz bazlı temizlik için.
CREATE INDEX IF NOT EXISTS hd_chart_variables_chart_idx
  ON public.human_design_chart_variables (chart_id);

-- ── Tenant bütünlüğü (DB seviyesi) ─────────────────────────────────────────────
-- (1) harita VAR, (2) haritanın tenant_id'si = satırın tenant_id'si (NULL tenant'lı eski harita REDDEDİLİR).
-- Kontrol satırı FOR SHARE ile kilitlenir → eşzamanlı tenant değişikliği yarışı kapanır.
-- SECURITY INVOKER (varsayılan): ek yetki vermez.
CREATE OR REPLACE FUNCTION public.hd_chart_variables_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  h_tenant uuid;
  found_h boolean;
BEGIN
  SELECT true, h.tenant_id INTO found_h, h_tenant
    FROM public.human_design_charts h WHERE h.id = NEW.chart_id FOR SHARE;
  IF found_h IS NOT TRUE THEN
    RAISE EXCEPTION 'hd_chart_variables: analiz bulunamadı' USING ERRCODE = '23503';
  END IF;
  IF h_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'hd_chart_variables: analiz başka tenant''a ait' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.hd_chart_variables_integrity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hd_chart_variables_integrity ON public.human_design_chart_variables;
CREATE TRIGGER trg_hd_chart_variables_integrity
  BEFORE INSERT OR UPDATE OF tenant_id, chart_id
  ON public.human_design_chart_variables
  FOR EACH ROW EXECUTE FUNCTION public.hd_chart_variables_integrity();

-- Erişim kilidi (yalnız service_role).
REVOKE ALL PRIVILEGES ON public.human_design_chart_variables FROM anon, authenticated;
ALTER TABLE public.human_design_chart_variables ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.human_design_chart_variables TO service_role;

COMMIT;
