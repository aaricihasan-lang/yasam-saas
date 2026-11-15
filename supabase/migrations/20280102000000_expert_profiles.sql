-- =============================================================================
-- 20280102000000_expert_profiles.sql
--
-- UZMAN PROFİLİ — F1 güvenli veri altyapısı (Owner talimatı 2026-11-10; yalnız YEREL geçici veritabanında
-- çalıştırıldı — production / staging'e uygulanması AYRI Owner onayı ister).
--
-- Tek tablo: public.expert_profiles — uzman başına TEK satır (UNIQUE tenant_id, user_id). Mesleki bilgiler (unvan,
-- kurum, telefon, iletişim e-postası, internet sitesi, kısa biyografi), rapor dipnotu ve rapor kimliği tercihleri.
-- Ad soyad / giriş e-postası BURADA DEĞİL: public.users'ta kalır ve yalnız yönetici değiştirir (bu migration users'a
-- DOKUNMAZ). Satır yoksa uzman için hiçbir şey değişmez; report_branding_enabled varsayılanı false → mevcut raporlar
-- birebir aynı kalır. logo_asset_id / logo_source F2 içindir (F1 arayüzü ve F1 API'si bu kolonları YAZMAZ).
--
-- GÜVENLİK (expert_workspace_* deseni):
--   * RLS açık, politika YOK; PUBLIC / anon / authenticated için hiçbir yetki yok.
--   * service_role: SELECT, INSERT ve yalnız içerik kolonlarında UPDATE. DELETE / TRUNCATE YETKİSİ YOK (silme API'si yok).
--     service_role RLS'yi aştığı için sahiplik her sorguda servis katmanında (tenant_id + user_id) ayrıca uygulanır.
--   * Kimlik kolonları (id, tenant_id, user_id, created_at) için UPDATE yetkisi verilmez; tetikleyici rol fark etmeksizin
--     değişmelerini de reddeder. version her UPDATE'te TAM OLARAK 1 artar (iyimser eşzamanlılık → API 409).
--   * Metin sınırları uygulamadaki (lib/profile/schema.ts) sınırlarla AYNIDIR; kontrol karakterleri, görünmez yön işaretleri
--     ve etiket başlangıcı ("<harf", "</", "<!", "<?") veritabanında da reddedilir. İnternet sitesi yalnız https://.
--
-- SİLME: user_id → users(id) ON DELETE CASCADE (son migration'lardaki kullanıcıya bağlı tablo deseni). Hesap kalıcı
-- silmede (admin_purge_archived_expert) tablo tenant_id (uuid) keşfiyle zaten temizlenir; FK yalnız ek güvencedir.
--
-- VERİ KORUMA: Mevcut tablo / politika / veri DEĞİŞMEZ; veri taşıma YOK. IDEMPOTENT (iki kez çalıştırılabilir).
-- Geri alma = kod geri alma (tablo boş kalabilir). Veri silen geri alma migration'ı bu klasöre KONMAZ; prova betiği:
-- scripts/profile/pg/expert-profiles-rollback.sql (yalnız yerel geçici veritabanında sınanır).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.expert_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NULL,
  organization text NULL,
  phone text NULL,
  contact_email text NULL,
  website text NULL,
  bio text NULL,
  report_note text NULL,
  logo_asset_id uuid NULL,
  logo_source text NOT NULL DEFAULT 'none',
  report_branding_enabled boolean NOT NULL DEFAULT false,
  report_show_title boolean NOT NULL DEFAULT true,
  report_show_organization boolean NOT NULL DEFAULT true,
  report_show_contact boolean NOT NULL DEFAULT true,
  report_show_note boolean NOT NULL DEFAULT true,
  schema_version smallint NOT NULL DEFAULT 1,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expert_profiles_user_uq UNIQUE (tenant_id, user_id),
  CONSTRAINT expert_profiles_tenant_id_uq UNIQUE (tenant_id, id),
  -- Tek satırlı metinler: boş değil, sınır içinde, kontrol / yön karakteri ve etiket başlangıcı yok (satır sonu da yok).
  CONSTRAINT expert_profiles_title_chk CHECK (title IS NULL OR (
    char_length(title) BETWEEN 1 AND 80 AND title !~ '[\x01-\x1F\x7F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]' AND title !~ '<[A-Za-z/!?]')),
  CONSTRAINT expert_profiles_organization_chk CHECK (organization IS NULL OR (
    char_length(organization) BETWEEN 1 AND 120 AND organization !~ '[\x01-\x1F\x7F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]' AND organization !~ '<[A-Za-z/!?]')),
  CONSTRAINT expert_profiles_phone_chk CHECK (phone IS NULL OR (
    char_length(phone) BETWEEN 1 AND 32 AND phone ~ '^[0-9+() -]+$' AND phone ~ '[0-9]')),
  CONSTRAINT expert_profiles_contact_email_chk CHECK (contact_email IS NULL OR (
    char_length(contact_email) BETWEEN 3 AND 254 AND contact_email ~ '^[^@[:space:]<>"]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$')),
  CONSTRAINT expert_profiles_website_chk CHECK (website IS NULL OR (
    char_length(website) BETWEEN 12 AND 200 AND website ~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?([/?#][^[:space:]<>"\\]*)?$')),
  -- Çok satırlı metinler: yalnız satır sonu (\n) serbest.
  CONSTRAINT expert_profiles_bio_chk CHECK (bio IS NULL OR (
    char_length(bio) BETWEEN 1 AND 1000 AND bio !~ '[\x01-\x09\x0B-\x1F\x7F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]' AND bio !~ '<[A-Za-z/!?]')),
  CONSTRAINT expert_profiles_report_note_chk CHECK (report_note IS NULL OR (
    char_length(report_note) BETWEEN 1 AND 300 AND report_note !~ '[\x01-\x09\x0B-\x1F\x7F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]' AND report_note !~ '<[A-Za-z/!?]')),
  CONSTRAINT expert_profiles_logo_source_chk CHECK (logo_source IN ('none', 'workspace', 'custom')),
  CONSTRAINT expert_profiles_logo_custom_chk CHECK (logo_source <> 'custom' OR logo_asset_id IS NOT NULL),
  CONSTRAINT expert_profiles_schema_chk CHECK (schema_version BETWEEN 1 AND 100),
  CONSTRAINT expert_profiles_version_chk CHECK (version >= 1)
);

-- ── Kimlik değişmezliği + sürüm artışı (rol fark etmeksizin) ─────────────────
CREATE OR REPLACE FUNCTION public.expert_profile_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'EXPERT_PROFILE_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'EXPERT_PROFILE_VERSION_STEP' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.expert_profile_row_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expert_profile_row_guard() FROM anon;
REVOKE ALL ON FUNCTION public.expert_profile_row_guard() FROM authenticated;

DROP TRIGGER IF EXISTS expert_profiles_row_guard ON public.expert_profiles;
CREATE TRIGGER expert_profiles_row_guard
  BEFORE UPDATE ON public.expert_profiles
  FOR EACH ROW EXECUTE FUNCTION public.expert_profile_row_guard();

-- ── RLS + yetkiler ───────────────────────────────────────────────────────────
ALTER TABLE public.expert_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.expert_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.expert_profiles FROM anon;
REVOKE ALL ON TABLE public.expert_profiles FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.expert_profiles FROM service_role;
GRANT SELECT, INSERT ON TABLE public.expert_profiles TO service_role;
GRANT UPDATE (
  title, organization, phone, contact_email, website, bio, report_note,
  logo_asset_id, logo_source,
  report_branding_enabled, report_show_title, report_show_organization, report_show_contact, report_show_note,
  schema_version, version, updated_at
) ON TABLE public.expert_profiles TO service_role;

COMMENT ON TABLE public.expert_profiles IS 'Uzman profili: mesleki bilgiler + rapor kimliği tercihleri (uzman başına tek satır). Ad soyad / giriş e-postası users tablosundadır; yetki bilgisi içermez.';

COMMIT;

NOTIFY pgrst, 'reload schema';
