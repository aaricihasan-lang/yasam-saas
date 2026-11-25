-- =============================================================================
-- 20280126000000_user_locale_prefs.sql
--
-- I18N-F1 — UZMANIN KALICI ARAYÜZ DİLİ TERCİHİ (Owner kararı A7, 2026-11-24).
-- YALNIZ yerel geçici (sentetik) veritabanında sınandı; production / staging'e uygulanması AYRI Owner
-- onayı ister. Uygulanmadığı ortamda uygulama "tercih okunamıyor" durumuna düşer ve dil yalnız cihaz
-- çereziyle çalışır (hiçbir ekran bozulmaz — lib/i18n/localePreferenceStore.ts).
--
-- Tek tablo: public.user_locale_prefs — uzman başına TEK satır (UNIQUE tenant_id, user_id).
-- public.users tablosuna DOKUNULMAZ (oturum / hesap güvenliği çalışmalarıyla çakışmaz; user_location_prefs deseni).
--
-- GÜVENLİK:
--   * RLS açık; anon / authenticated için deny-all politika + hiçbir tablo yetkisi yok.
--   * service_role: SELECT, INSERT ve yalnız (preferred_locale, updated_at) kolonlarında UPDATE.
--     DELETE / TRUNCATE yetkisi YOK (satır yalnız kullanıcı silinince FK CASCADE ile gider).
--     service_role RLS'yi aştığı için sahiplik her sorguda servis katmanında (tenant_id + user_id) uygulanır.
--   * preferred_locale yalnız kodda tanımlı dil kodları: tr, en, de (Owner kararı A9 — FR/NL/ES henüz yok;
--     eklenmeleri yeni migration ister). Biçim dışı değer veritabanında da reddedilir.
--   * Kimlik kolonları değiştirilemez (tetikleyici); updated_at her güncellemede yenilenir.
--
-- VERİ KORUMA: Mevcut tablo / politika / veri DEĞİŞMEZ; veri taşıma YOK. IDEMPOTENT (iki kez çalıştırılabilir).
-- Geri alma = kod geri alma (tablo boş kalabilir). Veri silen geri alma migration'ı bu klasöre KONMAZ.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_locale_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  preferred_locale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_locale_prefs_user_uq UNIQUE (tenant_id, user_id),
  CONSTRAINT user_locale_prefs_locale_chk CHECK (preferred_locale IN ('tr', 'en', 'de'))
);

CREATE INDEX IF NOT EXISTS idx_user_locale_prefs_user_id ON public.user_locale_prefs (user_id);

-- ── Kimlik değişmezliği + updated_at (rol fark etmeksizin) ─────────────────────
CREATE OR REPLACE FUNCTION public.user_locale_prefs_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'user_locale_prefs: kimlik kolonları değiştirilemez' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_locale_prefs_row_guard ON public.user_locale_prefs;
CREATE TRIGGER trg_user_locale_prefs_row_guard
  BEFORE UPDATE ON public.user_locale_prefs
  FOR EACH ROW EXECUTE FUNCTION public.user_locale_prefs_row_guard();

-- ── RLS + yetkiler ───────────────────────────────────────────────────────────
ALTER TABLE public.user_locale_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_locale_prefs_deny_direct ON public.user_locale_prefs;
CREATE POLICY user_locale_prefs_deny_direct
  ON public.user_locale_prefs
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.user_locale_prefs FROM PUBLIC;
REVOKE ALL ON TABLE public.user_locale_prefs FROM anon;
REVOKE ALL ON TABLE public.user_locale_prefs FROM authenticated;
REVOKE ALL ON TABLE public.user_locale_prefs FROM service_role;
GRANT SELECT, INSERT ON TABLE public.user_locale_prefs TO service_role;
GRANT UPDATE (preferred_locale, updated_at) ON TABLE public.user_locale_prefs TO service_role;

REVOKE ALL ON FUNCTION public.user_locale_prefs_row_guard() FROM PUBLIC;

COMMIT;

NOTIFY pgrst, 'reload schema';
