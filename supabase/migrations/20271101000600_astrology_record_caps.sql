-- Astroloji Aşama 9B-P3-01 — uzman başına ATOMİK kayıt tavanı.
--
-- Uygulama katmanındaki sayım ("say → ekle") eşzamanlı isteklerle ≤119 kayıt aşılabiliyordu (9B ölçümü). Bu trigger
-- sayımı EKLEMEYLE AYNI işlemde ve (tablo, tenant, uzman) başına advisory kilit altında yapar → eşzamanlı istekler
-- sıraya girer, tavan aşılamaz. Yalnız INSERT etkilenir: okuma, güncelleme ve SİLME serbesttir (uzman yer açabilir).
-- Başka uzman / tenant aynı kilidi paylaşmaz. Tavan değerleri lib/astrology/limits.ts ASTRO_RECORD_CAPS ile aynıdır
-- (statik test denetler). Hata: SQLSTATE P0001, mesaj 'ASTRO_RECORD_CAP:<tablo>:<tavan>' → uygulama 409'a çevirir.
--
-- Yalnız YEREL hazırlandı; production'a owner onayıyla uygulanır. İdempotent (iki kez çalıştırılabilir).

CREATE OR REPLACE FUNCTION public.astro_enforce_record_cap() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  cap integer := TG_ARGV[0]::integer;
  n integer;
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.owner_user_id IS NULL THEN
    RETURN NEW; -- sahipsiz satır yok (NOT NULL / FK ayrıca korur); kilit anahtarı kurulamaz
  END IF;
  -- İşlem sonuna kadar tutulan kilit: aynı uzmanın aynı tablodaki eşzamanlı eklemeleri sıraya girer.
  PERFORM pg_advisory_xact_lock(hashtextextended(TG_TABLE_NAME || ':' || NEW.tenant_id::text || ':' || NEW.owner_user_id::text, 0));
  -- READ COMMITTED: kilit alındıktan sonraki sorgu, kilidi bırakan (commit eden) işlemin satırlarını görür.
  EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1 AND owner_user_id = $2', TG_TABLE_NAME)
    INTO n USING NEW.tenant_id, NEW.owner_user_id;
  IF n >= cap THEN
    RAISE EXCEPTION 'ASTRO_RECORD_CAP:%:%', TG_TABLE_NAME, cap USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.astro_enforce_record_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_astro_cap_profiles ON public.astro_birth_profiles;
CREATE TRIGGER trg_astro_cap_profiles BEFORE INSERT ON public.astro_birth_profiles
  FOR EACH ROW EXECUTE FUNCTION public.astro_enforce_record_cap('2000');

DROP TRIGGER IF EXISTS trg_astro_cap_analyses ON public.astro_analyses;
CREATE TRIGGER trg_astro_cap_analyses BEFORE INSERT ON public.astro_analyses
  FOR EACH ROW EXECUTE FUNCTION public.astro_enforce_record_cap('3000');

DROP TRIGGER IF EXISTS trg_astro_cap_kb ON public.astro_kb_entries;
CREATE TRIGGER trg_astro_cap_kb BEFORE INSERT ON public.astro_kb_entries
  FOR EACH ROW EXECUTE FUNCTION public.astro_enforce_record_cap('1000');

DROP TRIGGER IF EXISTS trg_astro_cap_notes ON public.astro_expert_notes;
CREATE TRIGGER trg_astro_cap_notes BEFORE INSERT ON public.astro_expert_notes
  FOR EACH ROW EXECUTE FUNCTION public.astro_enforce_record_cap('10000');
