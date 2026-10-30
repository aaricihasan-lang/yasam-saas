-- HD Eğitim Merkezi — OWNER KONTROLLÜ YAYIN KATMANI (owner kararı 31.10.2026)
--
-- Amaç: hukuki süreç sonrasında owner, SQL / Vercel / yeniden deploy olmadan yalnız yönetim ekranından
--   (a) global uzman kataloğunu açıp kapatabilsin,
--   (b) bir kişiyi aktif envanterden "kapsam dışı" bırakabilsin / geri alabilsin (FİZİKSEL SİLME YOK).
--
-- YALNIZ EKLEME: mevcut tablo, tetikleyici, kısıt, RLS ve yetkilerin HİÇBİRİ değiştirilmez.
--   • hd_education_catalog_control  — tek satır; catalog_open varsayılan FALSE (açılış owner kararı).
--   • hd_education_subject_scope    — kapsam dışı kişiler (satır var = kapsam dışı). Kişi verisi aynen kalır.
--   • hd_education_control_events   — append-only yönetim geçmişi (UPDATE / DELETE tetikleyiciyle yasak).
--   • RPC'ler SECURITY DEFINER; aktör her çağrıda DB'de yeniden owner doğrulanır (hd_edu_actor_is_owner).
--   • Ek tetikleyici: kapsam dışı kişinin yayın kaydı 'approved' / 'published' olamaz (mevcut yayın kilidine EK).
--   • RLS açık, politika yok; anon / authenticated hiçbir yetki almaz; service_role yalnız SELECT + RPC EXECUTE.
-- Geri alma (yalnız hiç kullanılmadıysa): ilgili 3 tablo + 3 fonksiyon + 1 tetikleyici DROP edilir; mevcut veri etkilenmez.

-- ─── 1) Global katalog anahtarı ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_catalog_control (
  id            smallint    PRIMARY KEY CHECK (id = 1),
  catalog_open  boolean     NOT NULL DEFAULT false,
  changed_by    uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  reason        text        CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 2000)
);
INSERT INTO public.hd_education_catalog_control (id, catalog_open) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

-- ─── 2) Kapsam dışı kişiler (arşiv; silme değil) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_subject_scope (
  subject_id    uuid        PRIMARY KEY REFERENCES public.hd_education_subjects(id) ON DELETE RESTRICT,
  archived_by   uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  archived_at   timestamptz NOT NULL DEFAULT now(),
  reason        text        NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 2000)
);

-- ─── 3) Append-only yönetim geçmişi ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hd_education_control_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  actor_user_id  uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action         text        NOT NULL CHECK (action IN ('catalog_opened', 'catalog_closed', 'subject_archived', 'subject_restored')),
  subject_id     uuid        REFERENCES public.hd_education_subjects(id) ON DELETE RESTRICT,
  reason         text        CHECK (reason IS NULL OR char_length(reason) <= 2000)
);
CREATE INDEX IF NOT EXISTS hd_education_control_events_created_idx ON public.hd_education_control_events (created_at DESC);

CREATE OR REPLACE FUNCTION public.hd_edu_control_events_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'hd_education_control_events: değiştirilemez / silinemez (append-only)' USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_control_events_guard ON public.hd_education_control_events;
CREATE TRIGGER trg_hd_edu_control_events_guard BEFORE UPDATE OR DELETE ON public.hd_education_control_events
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_control_events_guard();

-- ─── 4) Ek yayın kilidi: kapsam dışı kişi onaylanamaz / yayımlanamaz ───────────────────────────────
CREATE OR REPLACE FUNCTION public.hd_edu_publication_scope_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.status IN ('approved', 'published') AND EXISTS (SELECT 1 FROM public.hd_education_subject_scope s WHERE s.subject_id = NEW.subject_id) THEN
    RAISE EXCEPTION 'hd_education_publications: kapsam dışı kişi onaylanamaz / yayımlanamaz' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hd_edu_publication_scope_guard ON public.hd_education_publications;
CREATE TRIGGER trg_hd_edu_publication_scope_guard BEFORE INSERT OR UPDATE ON public.hd_education_publications
  FOR EACH ROW EXECUTE FUNCTION public.hd_edu_publication_scope_guard();

-- ─── 5) RPC: global katalog aç / kapat ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hd_education_set_catalog_open(p_actor uuid, p_open boolean, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF p_actor IS NULL OR p_open IS NULL THEN RAISE EXCEPTION 'hd_edu_control: eksik parametre' USING ERRCODE = 'ED001'; END IF;
  IF NOT public.hd_edu_actor_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_control: yetkisiz aktör' USING ERRCODE = 'ED002'; END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN RAISE EXCEPTION 'hd_edu_control: gerekçe zorunlu' USING ERRCODE = 'ED010'; END IF;
  UPDATE public.hd_education_catalog_control
     SET catalog_open = p_open, changed_by = p_actor, changed_at = now(), reason = left(v_reason, 2000)
   WHERE id = 1;
  INSERT INTO public.hd_education_control_events (actor_user_id, action, reason)
  VALUES (p_actor, CASE WHEN p_open THEN 'catalog_opened' ELSE 'catalog_closed' END, left(v_reason, 2000));
  RETURN p_open;
END $$;

-- ─── 6) RPC: kişiyi kapsam dışı bırak / geri al (silme yok) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hd_education_set_subject_scope(p_actor uuid, p_subject uuid, p_archived boolean, p_reason text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF p_actor IS NULL OR p_subject IS NULL OR p_archived IS NULL THEN RAISE EXCEPTION 'hd_edu_control: eksik parametre' USING ERRCODE = 'ED001'; END IF;
  IF NOT public.hd_edu_actor_is_owner(p_actor) THEN RAISE EXCEPTION 'hd_edu_control: yetkisiz aktör' USING ERRCODE = 'ED002'; END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 5 THEN RAISE EXCEPTION 'hd_edu_control: gerekçe zorunlu' USING ERRCODE = 'ED010'; END IF;
  PERFORM 1 FROM public.hd_education_subjects WHERE id = p_subject FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hd_edu_control: kişi bulunamadı' USING ERRCODE = 'ED004'; END IF;
  IF p_archived THEN
    IF EXISTS (SELECT 1 FROM public.hd_education_publications WHERE subject_id = p_subject AND status IN ('approved', 'published')) THEN
      RAISE EXCEPTION 'hd_edu_control: onaylı / yayımlı kişi önce yayından kaldırılmalı' USING ERRCODE = 'ED011';
    END IF;
    IF EXISTS (SELECT 1 FROM public.hd_education_subject_scope WHERE subject_id = p_subject) THEN
      RAISE EXCEPTION 'hd_edu_control: kişi zaten kapsam dışı' USING ERRCODE = 'ED012';
    END IF;
    INSERT INTO public.hd_education_subject_scope (subject_id, archived_by, reason) VALUES (p_subject, p_actor, left(v_reason, 2000));
    INSERT INTO public.hd_education_control_events (actor_user_id, action, subject_id, reason) VALUES (p_actor, 'subject_archived', p_subject, left(v_reason, 2000));
  ELSE
    DELETE FROM public.hd_education_subject_scope WHERE subject_id = p_subject;
    IF NOT FOUND THEN RAISE EXCEPTION 'hd_edu_control: kişi zaten aktif envanterde' USING ERRCODE = 'ED013'; END IF;
    INSERT INTO public.hd_education_control_events (actor_user_id, action, subject_id, reason) VALUES (p_actor, 'subject_restored', p_subject, left(v_reason, 2000));
  END IF;
  RETURN p_archived;
END $$;

-- ─── 7) RLS + yetkiler (mevcut eğitim tablolarıyla aynı model) ──────────────────────────────────
ALTER TABLE public.hd_education_catalog_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hd_education_subject_scope   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hd_education_control_events  ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.hd_education_catalog_control FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON public.hd_education_subject_scope   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON public.hd_education_control_events  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.hd_education_catalog_control TO service_role;
GRANT SELECT ON public.hd_education_subject_scope   TO service_role;
GRANT SELECT ON public.hd_education_control_events  TO service_role;
REVOKE ALL ON FUNCTION public.hd_edu_control_events_guard()        FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hd_edu_publication_scope_guard()     FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hd_education_set_catalog_open(uuid, boolean, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hd_education_set_subject_scope(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hd_education_set_catalog_open(uuid, boolean, text)        TO service_role;
GRANT EXECUTE ON FUNCTION public.hd_education_set_subject_scope(uuid, uuid, boolean, text) TO service_role;
