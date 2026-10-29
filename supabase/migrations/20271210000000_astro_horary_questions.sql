-- =============================================================================
-- 20271210000000_astro_horary_questions.sql
--
-- GÖKYÜZÜ ATLASI — William Lilly Horary soru kayıtları (Owner onayı 2026-10-29; yalnız YEREL geçici veritabanında
-- çalıştırıldı — production / staging'e uygulanması AYRI Owner onayı ister).
--
-- Neden yeni tablo: astro_analyses profile_id / profile_revision NOT NULL + doğum profili FK'leri taşır; Horary sorusu
-- doğum profiline bağlı değildir. Kaynak öneri: docs/astrology/horary/kayit-arsiv-veri-modeli-onerisi.md
--
-- GÜVENLİK (mevcut astro_* deseni):
--   * RLS açık, politika YOK; PUBLIC / anon / authenticated için hiçbir yetki yok.
--   * service_role: SELECT, INSERT, yalnız (title, client_id, updated_at) UPDATE. DELETE YETKİSİ YOK (silme API'si yok).
--     service_role RLS'yi aşar → sahiplik her sorguda servis katmanında (tenant_id + owner_user_id) ayrıca uygulanır.
--   * Değişmezlik: BEFORE UPDATE tetikleyicisi title / client_id / updated_at DIŞINDAKİ her kolonun değişmesini reddeder
--     (rol fark etmeksizin; hesap temizleme SECURITY DEFINER DELETE'i etkilenmez).
--   * Danışan: (tenant_id, client_id) → clients(tenant_id, id) ON DELETE SET NULL (client_id) → başka tenant'ın danışanı
--     bağlanamaz; danışan silinirse kayıt korunur, yalnız client_id boşalır.
--   * Kayıt tavanı: mevcut atomik public.astro_enforce_record_cap (uzman başına advisory kilit) — 3000.
--   * İdempotency: UNIQUE (tenant_id, save_request_id).
--
-- Mevcut tablo / politika / veri DEĞİŞMEZ. IDEMPOTENT (iki kez çalıştırılabilir).
-- Geri dönüş: tablo başka hiçbir tabloca referans edilmez. Veri oluştuktan sonra kaldırma ancak YEDEK + Owner kararıyla
-- yapılır (otomatik DROP yok).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.astro_horary_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  client_id uuid NULL,
  title text NOT NULL,
  question_text text NULL,
  question_local_date date NOT NULL,
  question_local_time time NOT NULL,
  timezone text NOT NULL,
  utc_offset_seconds integer NOT NULL,
  dst_choice text NOT NULL DEFAULT 'auto',
  question_utc timestamptz NOT NULL,
  location_id text NOT NULL,
  location_label text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  quesited_house smallint NOT NULL,
  school text NOT NULL,
  methodology_version text NOT NULL,
  orb_variant text NOT NULL,
  snapshot_schema smallint NOT NULL,
  result_snapshot jsonb NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  save_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT astro_hq_title_chk CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT astro_hq_question_chk CHECK (question_text IS NULL OR char_length(question_text) BETWEEN 1 AND 500),
  CONSTRAINT astro_hq_tz_chk CHECK (char_length(timezone) BETWEEN 1 AND 64),
  CONSTRAINT astro_hq_offset_chk CHECK (utc_offset_seconds BETWEEN -64800 AND 64800),
  CONSTRAINT astro_hq_dst_chk CHECK (dst_choice IN ('auto', 'earlier', 'later')),
  CONSTRAINT astro_hq_loc_chk CHECK (char_length(location_id) BETWEEN 2 AND 64 AND char_length(location_label) BETWEEN 1 AND 200),
  CONSTRAINT astro_hq_coord_chk CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),
  CONSTRAINT astro_hq_house_chk CHECK (quesited_house BETWEEN 2 AND 12),
  CONSTRAINT astro_hq_school_chk CHECK (school IN ('lilly_1647')),
  CONSTRAINT astro_hq_version_chk CHECK (char_length(methodology_version) BETWEEN 1 AND 120 AND char_length(orb_variant) BETWEEN 1 AND 64),
  CONSTRAINT astro_hq_schema_chk CHECK (snapshot_schema >= 1),
  CONSTRAINT astro_hq_snapshot_chk CHECK (jsonb_typeof(result_snapshot) = 'object' AND pg_column_size(result_snapshot) <= 524288),
  CONSTRAINT astro_hq_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT astro_hq_save_request_uq UNIQUE (tenant_id, save_request_id),
  CONSTRAINT astro_hq_client_fk FOREIGN KEY (tenant_id, client_id) REFERENCES public.clients (tenant_id, id) ON DELETE SET NULL (client_id)
);

CREATE INDEX IF NOT EXISTS astro_hq_owner_time_idx ON public.astro_horary_questions (tenant_id, owner_user_id, question_utc DESC, id);
CREATE INDEX IF NOT EXISTS astro_hq_client_time_idx ON public.astro_horary_questions (tenant_id, client_id, question_utc DESC) WHERE client_id IS NOT NULL;

-- ─── Değişmezlik: yalnız başlık, danışan bağlantısı ve güncelleme zamanı değişebilir ──────────────────────────────
CREATE OR REPLACE FUNCTION public.astro_horary_questions_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'title' - 'client_id' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'title' - 'client_id' - 'updated_at') THEN
    RAISE EXCEPTION 'ASTRO_HORARY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.astro_horary_questions_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_astro_horary_questions_guard ON public.astro_horary_questions;
CREATE TRIGGER trg_astro_horary_questions_guard BEFORE UPDATE ON public.astro_horary_questions
  FOR EACH ROW EXECUTE FUNCTION public.astro_horary_questions_guard();

-- ─── Kayıt tavanı (mevcut atomik fonksiyon; uzman başına 3000) ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_astro_cap_horary ON public.astro_horary_questions;
CREATE TRIGGER trg_astro_cap_horary BEFORE INSERT ON public.astro_horary_questions
  FOR EACH ROW EXECUTE FUNCTION public.astro_enforce_record_cap('3000');

-- ─── Erişim: RLS + açık allowlist ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.astro_horary_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.astro_horary_questions FROM PUBLIC;
REVOKE ALL ON TABLE public.astro_horary_questions FROM anon;
REVOKE ALL ON TABLE public.astro_horary_questions FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.astro_horary_questions FROM service_role;
GRANT SELECT, INSERT ON TABLE public.astro_horary_questions TO service_role;
GRANT UPDATE (title, client_id, updated_at) ON TABLE public.astro_horary_questions TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
