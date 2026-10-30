-- HD Eğitim Merkezi — YAŞAYAN 5 KİŞİNİN KONTROLLÜ KALDIRILMASI (owner kararı 31.10.2026) · v1
--
-- KAPSAM: yalnız Hazır Eğitim Haritaları merkezî tabloları (hd_education_*). Danışan / kişisel HD / özel arşiv / diğer modüller
-- ETKİLENMEZ. Ürün kodu değişmez (kişi sayısı her yerde DB'den okunur).
-- ÇALIŞTIRMA: bu dosya BEGIN/COMMIT İÇERMEZ. Çalıştıran sarar:
--   kuru çalıştırma : BEGIN; <bu dosya>; ROLLBACK;
--   uygulama        : BEGIN; <bu dosya>; COMMIT;     (ayrı owner onayı olmadan production'da UYGULANMAZ)
-- Rol: tablo sahibi (postgres). Uygulama rolleri (service_role) bu tablolarda DELETE yetkisine SAHİP DEĞİLDİR (tasarım).
--
-- SIRA: ön koşullar → kalan 45 kişinin özeti → kişi başına kalıcı kaldırma kaydı (audit 'takedown_handled', subject_id NULL,
-- yalnız kimlik + satır sayıları + SHA-256; kişi içeriği YOK) → yalnız iki append-only korumasını bu işlem içinde kapat →
-- biyografi revizyonları → biyografiler → yayın kayıtları → snapshot'lar → kaynaklar → kişiye bağlı eski denetim satırları →
-- kişiler → korumaları geri aç → son koşullar (kalan 45 kişinin özeti BİREBİR aynı, korumalar etkin, yaşayan kişi yok).
-- Herhangi bir sapma RAISE EXCEPTION → işlemin TAMAMI geri alınır (DDL dahil).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $hd_edu_remove_living$
DECLARE
  k_keys constant text[] := ARRAY[
    'angelina-jolie-1975-06-04', 'aras-oren-1939-11-01', 'barack-obama-1961-08-04', 'donald-j-trump-1946-06-14', 'tarkan-1972-10-17'];
  v_owner uuid;
  v_n int;
  v_ids uuid[];
  v_bio_ids uuid[];
  v_new_audit uuid[] := '{}';
  v_before text;
  v_after text;
  r record;
  v_counts jsonb;
  v_sha jsonb;
  v_id uuid;
  v_tot jsonb;
BEGIN
  -- ── 1) Ön koşullar ──────────────────────────────────────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.users WHERE is_super_admin IS TRUE AND lower(role) = 'admin' AND active IS TRUE AND coalesce(is_demo_account, false) = false;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ön koşul: tam 1 platform owner beklenir, bulunan %', v_n; END IF;
  SELECT id INTO v_owner FROM public.users WHERE is_super_admin IS TRUE AND lower(role) = 'admin' AND active IS TRUE AND coalesce(is_demo_account, false) = false;

  SELECT array_agg(id ORDER BY natural_key), count(*) INTO v_ids, v_n FROM public.hd_education_subjects WHERE natural_key = ANY (k_keys);
  IF v_n <> 5 THEN RAISE EXCEPTION 'ön koşul: 5 kişi beklenir, bulunan % (zaten kaldırılmış olabilir — işlem yapılmadı)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_subjects WHERE id = ANY (v_ids) AND is_living IS NOT TRUE) THEN
    RAISE EXCEPTION 'ön koşul: listedeki herkes yaşayan kişi (is_living) olmalı';
  END IF;
  IF (SELECT count(*) FROM public.hd_education_subjects WHERE is_living) <> 5 THEN
    RAISE EXCEPTION 'ön koşul: yaşayan kişi kümesi listeyle birebir aynı olmalı (beklenmeyen yaşayan kayıt)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_publications WHERE subject_id = ANY (v_ids) AND status IN ('approved', 'published')) THEN
    RAISE EXCEPTION 'ön koşul: onaylı / yayımlı kişi kaldırılmaz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_takedown_requests WHERE subject_id = ANY (v_ids)) THEN
    RAISE EXCEPTION 'ön koşul: açık kaldırma talebi var — önce owner değerlendirmesi';
  END IF;
  IF to_regclass('public.hd_edu_annotation_layers') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.hd_edu_annotation_layers WHERE central_subject_id = ANY ($1)' INTO v_n USING v_ids;
    IF v_n <> 0 THEN RAISE EXCEPTION 'ön koşul: bu kişilere bağlı eğitmen çizim katmanı var (%)', v_n; END IF;
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO v_bio_ids FROM public.hd_education_biographies WHERE subject_id = ANY (v_ids);

  -- ── 2) Kalan 45 kişinin özeti (önce) ────────────────────────────────────────────────────────────
  SELECT md5(concat_ws('#',
    (SELECT string_agg(md5(to_jsonb(s)::text), ',' ORDER BY s.id) FROM public.hd_education_subjects s WHERE s.id <> ALL (v_ids)),
    (SELECT string_agg(md5(to_jsonb(x)::text), ',' ORDER BY x.id) FROM public.hd_education_sources x WHERE x.subject_id <> ALL (v_ids)),
    (SELECT string_agg(md5(to_jsonb(c)::text), ',' ORDER BY c.id) FROM public.hd_education_charts c WHERE c.subject_id <> ALL (v_ids)),
    (SELECT string_agg(md5(to_jsonb(p)::text), ',' ORDER BY p.subject_id) FROM public.hd_education_publications p WHERE p.subject_id <> ALL (v_ids)),
    (SELECT string_agg(md5(to_jsonb(b)::text), ',' ORDER BY b.id) FROM public.hd_education_biographies b WHERE b.id <> ALL (v_bio_ids)),
    (SELECT string_agg(md5(to_jsonb(v)::text), ',' ORDER BY v.id) FROM public.hd_education_biography_revisions v WHERE v.biography_id <> ALL (v_bio_ids)),
    (SELECT string_agg(md5(to_jsonb(a)::text), ',' ORDER BY a.id) FROM public.hd_education_audit_events a WHERE a.subject_id IS NULL OR a.subject_id <> ALL (v_ids)),
    (SELECT string_agg(md5(to_jsonb(g)::text), ',' ORDER BY g.id) FROM public.hd_education_access_grants g)
  )) INTO v_before;

  -- ── 3) Kişi başına KALICI kaldırma kaydı (içerik yok: kimlik + satır sayıları + SHA-256) ───────────
  FOR r IN SELECT id, natural_key, display_name FROM public.hd_education_subjects WHERE id = ANY (v_ids) ORDER BY natural_key LOOP
    SELECT jsonb_build_object(
      'kaynak', (SELECT count(*) FROM public.hd_education_sources WHERE subject_id = r.id),
      'snapshot', (SELECT count(*) FROM public.hd_education_charts WHERE subject_id = r.id),
      'yayin_kaydi', (SELECT count(*) FROM public.hd_education_publications WHERE subject_id = r.id),
      'biyografi', (SELECT count(*) FROM public.hd_education_biographies WHERE subject_id = r.id),
      'biyografi_revizyonu', (SELECT count(*) FROM public.hd_education_biography_revisions WHERE biography_id IN (SELECT id FROM public.hd_education_biographies WHERE subject_id = r.id)),
      'denetim_satiri', (SELECT count(*) FROM public.hd_education_audit_events WHERE subject_id = r.id)) INTO v_counts;
    SELECT jsonb_build_object(
      'kisi', encode(sha256(convert_to((SELECT to_jsonb(s)::text FROM public.hd_education_subjects s WHERE s.id = r.id), 'UTF8')), 'hex'),
      'kaynak', encode(sha256(convert_to(coalesce((SELECT string_agg(to_jsonb(x)::text, ',' ORDER BY x.id) FROM public.hd_education_sources x WHERE x.subject_id = r.id), ''), 'UTF8')), 'hex'),
      'snapshot', encode(sha256(convert_to(coalesce((SELECT string_agg(to_jsonb(c)::text, ',' ORDER BY c.id) FROM public.hd_education_charts c WHERE c.subject_id = r.id), ''), 'UTF8')), 'hex'),
      'biyografi', encode(sha256(convert_to(coalesce((SELECT string_agg(to_jsonb(b)::text, ',' ORDER BY b.id) FROM public.hd_education_biographies b WHERE b.subject_id = r.id), ''), 'UTF8')), 'hex'),
      'denetim', encode(sha256(convert_to(coalesce((SELECT string_agg(to_jsonb(a)::text, ',' ORDER BY a.id) FROM public.hd_education_audit_events a WHERE a.subject_id = r.id), ''), 'UTF8')), 'hex')) INTO v_sha;
    INSERT INTO public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail)
    VALUES ('owner', v_owner, 'takedown_handled', NULL, jsonb_build_object(
      'islem', 'egitim_merkezinden_kaldirma', 'gerekce', 'Yaşayan kişi — owner kararı 31.10.2026 (Eğitim Merkezi 45 kişi)',
      'natural_key', r.natural_key, 'kisi', r.display_name, 'kaldirilan_satir', v_counts, 'sha256', v_sha,
      'betik', 'scripts/hd-education/removal/remove-living-5.sql v1'))
    RETURNING id INTO v_id;
    v_new_audit := v_new_audit || v_id;
  END LOOP;

  -- ── 4) Yalnız bu işlem içinde iki append-only korumasını kapat (DDL işlemle birlikte geri alınır) ──
  ALTER TABLE public.hd_education_audit_events DISABLE TRIGGER trg_hd_edu_audit_guard;
  ALTER TABLE public.hd_education_biography_revisions DISABLE TRIGGER hd_edu_bio_rev_append_only;

  -- ── 5) Bağımlı satırlar → kişi (FK sırası) ─────────────────────────────────────────────────────
  DELETE FROM public.hd_education_biography_revisions WHERE biography_id = ANY (v_bio_ids);
  DELETE FROM public.hd_education_biographies WHERE id = ANY (v_bio_ids);
  DELETE FROM public.hd_education_publications WHERE subject_id = ANY (v_ids);
  DELETE FROM public.hd_education_charts WHERE subject_id = ANY (v_ids);
  DELETE FROM public.hd_education_sources WHERE subject_id = ANY (v_ids);
  DELETE FROM public.hd_education_audit_events WHERE subject_id = ANY (v_ids);
  DELETE FROM public.hd_education_subjects WHERE id = ANY (v_ids);

  -- ── 6) Korumaları geri aç ──────────────────────────────────────────────────────────────────────
  ALTER TABLE public.hd_education_audit_events ENABLE TRIGGER trg_hd_edu_audit_guard;
  ALTER TABLE public.hd_education_biography_revisions ENABLE TRIGGER hd_edu_bio_rev_append_only;

  -- ── 7) Son koşullar ────────────────────────────────────────────────────────────────────────────
  SELECT md5(concat_ws('#',
    (SELECT string_agg(md5(to_jsonb(s)::text), ',' ORDER BY s.id) FROM public.hd_education_subjects s),
    (SELECT string_agg(md5(to_jsonb(x)::text), ',' ORDER BY x.id) FROM public.hd_education_sources x),
    (SELECT string_agg(md5(to_jsonb(c)::text), ',' ORDER BY c.id) FROM public.hd_education_charts c),
    (SELECT string_agg(md5(to_jsonb(p)::text), ',' ORDER BY p.subject_id) FROM public.hd_education_publications p),
    (SELECT string_agg(md5(to_jsonb(b)::text), ',' ORDER BY b.id) FROM public.hd_education_biographies b),
    (SELECT string_agg(md5(to_jsonb(v)::text), ',' ORDER BY v.id) FROM public.hd_education_biography_revisions v),
    (SELECT string_agg(md5(to_jsonb(a)::text), ',' ORDER BY a.id) FROM public.hd_education_audit_events a WHERE a.id <> ALL (v_new_audit)),
    (SELECT string_agg(md5(to_jsonb(g)::text), ',' ORDER BY g.id) FROM public.hd_education_access_grants g)
  )) INTO v_after;
  IF v_after IS DISTINCT FROM v_before THEN RAISE EXCEPTION 'son koşul: kalan kişilerin verisi değişti (özet uyuşmuyor) — geri alındı'; END IF;
  IF EXISTS (SELECT 1 FROM public.hd_education_subjects WHERE is_living OR natural_key = ANY (k_keys)) THEN RAISE EXCEPTION 'son koşul: yaşayan / listedeki kişi kaldı'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('trg_hd_edu_audit_guard', 'hd_edu_bio_rev_append_only') AND tgenabled <> 'O') THEN
    RAISE EXCEPTION 'son koşul: append-only korumaları yeniden etkin değil';
  END IF;
  IF (SELECT count(*) FROM public.hd_education_audit_events WHERE id = ANY (v_new_audit) AND action = 'takedown_handled' AND subject_id IS NULL) <> 5 THEN
    RAISE EXCEPTION 'son koşul: 5 kaldırma kaydı bulunamadı';
  END IF;
  SELECT jsonb_build_object('kisi', (SELECT count(*) FROM public.hd_education_subjects), 'snapshot', (SELECT count(*) FROM public.hd_education_charts),
    'kaynak', (SELECT count(*) FROM public.hd_education_sources), 'yayin_kaydi', (SELECT count(*) FROM public.hd_education_publications),
    'biyografi', (SELECT count(*) FROM public.hd_education_biographies), 'biyografi_revizyonu', (SELECT count(*) FROM public.hd_education_biography_revisions),
    'denetim', (SELECT count(*) FROM public.hd_education_audit_events)) INTO v_tot;
  RAISE NOTICE 'hd-edu kaldırma TAMAM: 5 yaşayan kişi kaldırıldı; kalan %; kalan kişilerin özeti değişmedi (%)', v_tot, v_after;
END
$hd_edu_remove_living$;
