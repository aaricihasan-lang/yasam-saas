-- =============================================================================
-- 20271008000000_hd_client_birth_location.sql
--
-- HUMAN DESIGN — DANIŞAN DOĞUM YERİ (YAPILANDIRILMIŞ) · ADDITIVE KOLONLAR
--
-- AMAÇ: Uzmanın listeden seçtiği doğum yerinin (il / ilçe / dünya şehri; RoxyAPI Location dahil)
--   SUNUCUNUN ÇÖZDÜĞÜ değerlerini danışanda kalıcı tutmak → danışan tekrar açıldığında aynı yer
--   seçili gelir, yeniden hesap için tekrar ilçe seçilmez. Aynı doğum verisi + aynı konum →
--   aynı input_hash → kayıtlı harita açılır (yeni Roxy Bodygraph çağrısı YOK).
--
-- EKLENENLER (hepsi NULLABLE, default yok → metadata-only, tablo yeniden yazılmaz):
--   birth_location_id     text              — kararlı konum kimliği (ör. tr-42-konya, rx-tr-konya-selcuklu)
--   birth_location_label  text              — seçim anındaki etiket (birth_place ile eşleştirme için)
--   birth_timezone        text              — IANA saat dilimi (sunucuda çözüldü)
--   birth_latitude        double precision  — sunucuda çözüldü
--   birth_longitude       double precision  — sunucuda çözüldü
--
-- YAZMA KURALI (uygulama): bu kolonlar istemciden DOĞRUDAN kabul edilmez; istemci yalnız konum
--   referansı gönderir (yerel kimlik veya sunucu-imzalı Roxy ref), sunucu doğrulayıp yazar.
--
-- GERİYE UYUM / GÜVENLİK:
--   • DROP / RENAME / tip daraltma / DEFAULT / NOT NULL YOK. birth_place DOKUNULMAZ.
--   • Mevcut satırlar değişmez (yeni kolonlar NULL). Index/constraint YOK.
--   • RLS / policy / grant DEĞİŞMEZ (tablo anon/authenticated'a kapalı; erişim service_role route).
--   • Idempotent: IF NOT EXISTS.
--
-- DEPLOY SIRASI: önce bu migration, sonra kod. Kod önce çıkarsa: danışan kaydı konum kolonları
--   olmadan yine KAYDEDİLİR (sunucu kolon-yok hatasında konum alanlarını atlayıp yeniden dener);
--   yalnız konum kalıcılığı devreye girmez.
--
-- NOT: Bu dosyanın repo'da olması PROD'A UYGULANDIĞI anlamına GELMEZ.
-- =============================================================================

BEGIN;

ALTER TABLE public.human_design_clients
  ADD COLUMN IF NOT EXISTS birth_location_id    text,
  ADD COLUMN IF NOT EXISTS birth_location_label text,
  ADD COLUMN IF NOT EXISTS birth_timezone       text,
  ADD COLUMN IF NOT EXISTS birth_latitude       double precision,
  ADD COLUMN IF NOT EXISTS birth_longitude      double precision;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='human_design_clients'
--      AND column_name LIKE 'birth_%' ORDER BY 1;          -- 5 yeni kolon, YES
--   SELECT count(*) FROM public.human_design_clients WHERE birth_location_id IS NOT NULL;  -- 0
--   SELECT has_table_privilege('anon','public.human_design_clients','SELECT');           -- false
--
-- ROLLBACK:
--   ALTER TABLE public.human_design_clients
--     DROP COLUMN IF EXISTS birth_longitude, DROP COLUMN IF EXISTS birth_latitude,
--     DROP COLUMN IF EXISTS birth_timezone, DROP COLUMN IF EXISTS birth_location_label,
--     DROP COLUMN IF EXISTS birth_location_id;
--   (Kayıtlı yapılandırılmış konumlar silinir; birth_place ve haritalar etkilenmez.)
-- =============================================================================
