-- ============================================================
-- 20260826000000_yebs_source_mutations.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-A3 (Sources)
-- Şema genişletmesi (additif) + write-gate + atomik CREATE/UPDATE + AUDIT
-- (public.yebs_sources)
--
-- Kapsam:
--   A. Additif şema: `accessed_on date NULL` kolonu + source_type CHECK'in
--      SUPERSET genişletmesi (11 → 17 değer; hiçbir değer kaldırılmaz/yeniden
--      adlandırılmaz). D5 migration (20260728000000) DEĞİŞTİRİLMEZ; tablo
--      drop/recreate YOK; veri kaybı YOK; FK/index/trigger'a dokunulmaz.
--   B. Write-gate: service_role yalnız SELECT (A1/A2 kalıbı). RLS enabled kalır;
--      policy eklenmez; FORCE RLS açılmaz.
--   C. yebs_create_source_with_audit — SECURITY DEFINER, EXECUTE yalnız service_role.
--   D. yebs_update_source_with_audit — partial JSONB patch; yalnız status='draft';
--      expected_updated_at optimistic concurrency; status/id/timestamps immutable.
--
-- Source = SAF belge-düzeyi künye. Pasaj/özgün-metin/transliterasyon/çeviri/
--   locator/editöryal-yorum BURADA TUTULMAZ (D7/D9 junction'larda). Bu migration
--   claim_sources/relation_sources/audit CHECK'e DOKUNMAZ; DELETE/remove YOK
--   (kanıt zinciri korunur; arşivleme ileride API-TX transition'ı).
--
-- Normalizasyon (bağlayıcı A3 kararı; A2'nin ham-fidelity'sinden bilinçli sapma):
--   - Makine tanımlayıcıları: doi=lower(btrim); pmid=btrim; isbn=boşluk/tire sıyır
--     + x→X, boşsa NULL; url=yalnız dış btrim.
--   - İnsan künye alanları: dış boşluk btrim (iç boşluk/noktalama/diakritik/case
--     korunur); opsiyonel boş → NULL.
--   - reason: HAM (trim edilmez); yalnız btrim boşluk denetimi + ≤2000.
--
-- Deterministik/fail-fast: düz ifadeler; IF NOT EXISTS/OR REPLACE/DO/dynamic SQL
--   YOK. accessed_on zaten varsa ADD COLUMN hata verir (fail-closed). Explicit
--   BEGIN/COMMIT.
--
-- Kararlı hata kodları (ham DB/kullanıcı verisi SIZDIRILMAZ; tümü P0001):
--   YEBS_REQUEST_ID_REQUIRED, YEBS_OPERATION_ID_REQUIRED, YEBS_SOURCE_ID_REQUIRED,
--   YEBS_EXPECTED_UPDATED_AT_REQUIRED, YEBS_REASON_INVALID, YEBS_INVALID_SOURCE_INPUT,
--   YEBS_INVALID_PATCH, YEBS_ADMIN_NOT_FOUND, YEBS_ADMIN_NOT_ACTIVE,
--   YEBS_SOURCE_TRADITION_NOT_FOUND, YEBS_SOURCE_NOT_FOUND, YEBS_SOURCE_STATUS_LOCKED,
--   YEBS_SOURCE_STALE_UPDATE, YEBS_SOURCE_NO_CHANGES, YEBS_SOURCE_DOI_DUPLICATE,
--   YEBS_SOURCE_PMID_DUPLICATE.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- A) ADDİTİF ŞEMA GENİŞLETMESİ
-- ------------------------------------------------------------
-- accessed_on: web/arşiv kaynakları için erişim tarihi (opsiyonel, künye alanı).
-- IF NOT EXISTS YOK → kolon zaten varsa migration fail-closed durur.
ALTER TABLE public.yebs_sources
  ADD COLUMN accessed_on date;

-- source_type CHECK: SUPERSET genişletme (11 → 17). Mevcut değerler korunur;
-- 6 yeni değer eklenir. Constraint adı D5 ile birebir: yebs_sources_source_type_chk.
ALTER TABLE public.yebs_sources
  DROP CONSTRAINT yebs_sources_source_type_chk;

ALTER TABLE public.yebs_sources
  ADD CONSTRAINT yebs_sources_source_type_chk CHECK (
    source_type IN (
      'classical_text',
      'book',
      'journal_article',
      'regulatory_document',
      'monograph',
      'standard',
      'database_record',
      'thesis',
      'website',
      'oral_tradition_record',
      'other',
      'institutional_report',
      'archival_document',
      'media_recording',
      'interview_record',
      'field_observation_record',
      'experiential_record'
    )
  );

-- ------------------------------------------------------------
-- B) WRITE-GATE (A1/A2 birebir): service_role SELECT-only.
-- ------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.yebs_sources FROM service_role;
GRANT SELECT ON TABLE public.yebs_sources TO service_role;

REVOKE ALL ON TABLE public.yebs_sources FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_sources FROM anon;
REVOKE ALL ON TABLE public.yebs_sources FROM authenticated;

-- ------------------------------------------------------------
-- C) CREATE RPC
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_create_source_with_audit(
  p_actor_admin_id       uuid,
  p_request_id           uuid,
  p_operation_id         uuid,
  p_source_type          text,
  p_title                text,
  p_language_tag         text,
  p_script_code          text    DEFAULT NULL,
  p_authors              text    DEFAULT NULL,
  p_organization         text    DEFAULT NULL,
  p_publisher            text    DEFAULT NULL,
  p_publication_year     integer DEFAULT NULL,
  p_dating_note          text    DEFAULT NULL,
  p_edition              text    DEFAULT NULL,
  p_doi                  text    DEFAULT NULL,
  p_pmid                 text    DEFAULT NULL,
  p_isbn                 text    DEFAULT NULL,
  p_url                  text    DEFAULT NULL,
  p_document_no          text    DEFAULT NULL,
  p_tradition_context_id uuid    DEFAULT NULL,
  p_accessed_on          date    DEFAULT NULL,
  p_notes                text    DEFAULT NULL,
  p_reason               text    DEFAULT NULL
)
RETURNS public.yebs_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_created      public.yebs_sources;
  v_constraint   text;
  -- Normalize edilmiş değerler.
  v_title        text;
  v_lang         text;
  v_script       text;
  v_authors      text;
  v_org          text;
  v_publisher    text;
  v_dating_note  text;
  v_edition      text;
  v_doi          text;
  v_pmid         text;
  v_isbn         text;
  v_url          text;
  v_document_no  text;
  v_notes        text;
BEGIN
  -- --- Operasyon parametreleri ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- --- source_type: exact 17 enum (normalize YOK) ---
  IF p_source_type IS NULL OR p_source_type NOT IN (
    'classical_text','book','journal_article','regulatory_document','monograph',
    'standard','database_record','thesis','website','oral_tradition_record','other',
    'institutional_report','archival_document','media_recording','interview_record',
    'field_observation_record','experiential_record'
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- title (zorunlu): dış btrim, nonblank ---
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END IF;
  v_title := btrim(p_title);

  -- --- language_tag (zorunlu): dış btrim + BCP-47 ---
  v_lang := btrim(coalesce(p_language_tag, ''));
  IF v_lang = '' OR v_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- script_code (opsiyonel): btrim→NULL; varsa ISO-15924 ---
  v_script := nullif(btrim(coalesce(p_script_code, '')), '');
  IF v_script IS NOT NULL AND v_script !~ '^[A-Z][a-z]{3}$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- opsiyonel insan künye alanları: dış btrim, boş → NULL ---
  v_authors     := nullif(btrim(coalesce(p_authors, '')), '');
  v_org         := nullif(btrim(coalesce(p_organization, '')), '');
  v_publisher   := nullif(btrim(coalesce(p_publisher, '')), '');
  v_dating_note := nullif(btrim(coalesce(p_dating_note, '')), '');
  v_edition     := nullif(btrim(coalesce(p_edition, '')), '');
  v_document_no := nullif(btrim(coalesce(p_document_no, '')), '');
  v_notes       := nullif(btrim(coalesce(p_notes, '')), '');

  -- --- publication_year: NULL veya -3000..2100 ---
  IF p_publication_year IS NOT NULL
     AND (p_publication_year < -3000 OR p_publication_year > 2100) THEN
    RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- doi: lower(btrim), boş → NULL; varsa 10.% ---
  v_doi := nullif(lower(btrim(coalesce(p_doi, ''))), '');
  IF v_doi IS NOT NULL AND v_doi NOT LIKE '10.%' THEN
    RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- pmid: btrim, boş → NULL; varsa yalnız rakam (sıfırsız) ---
  v_pmid := nullif(btrim(coalesce(p_pmid, '')), '');
  IF v_pmid IS NOT NULL AND v_pmid !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- isbn: boşluk/tire sıyır + x→X, boş → NULL (duplicate kontrolü YOK) ---
  v_isbn := nullif(translate(regexp_replace(coalesce(p_isbn, ''), '[[:space:]-]', '', 'g'), 'x', 'X'), '');

  -- --- url: dış btrim, boş → NULL; varsa http(s):// ---
  v_url := nullif(btrim(coalesce(p_url, '')), '');
  IF v_url IS NOT NULL AND v_url !~ '^https?://' THEN
    RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END IF;

  -- --- reason: HAM fidelity (btrim yalnız boşluk denetimi; length özgün değerde) ---
  IF p_reason IS NOT NULL THEN
    IF btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
      RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- Aktif admin ---
  SELECT u.role, u.active, u.email
    INTO v_role, v_active, v_email
    FROM public.users u
   WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  -- --- tradition_context_id varsa varlık kontrolü + kilit (status gate YOK) ---
  IF p_tradition_context_id IS NOT NULL THEN
    PERFORM 1 FROM public.yebs_traditions
      WHERE id = p_tradition_context_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'YEBS_SOURCE_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- --- Canonical INSERT (status/id/timestamps DB default; status=draft) ---
  BEGIN
    INSERT INTO public.yebs_sources (
      source_type, title, language_tag, script_code, authors, organization,
      publisher, publication_year, dating_note, edition, doi, pmid, isbn, url,
      document_no, tradition_context_id, accessed_on, notes
    )
    VALUES (
      p_source_type, v_title, v_lang, v_script, v_authors, v_org,
      v_publisher, p_publication_year, v_dating_note, v_edition, v_doi, v_pmid, v_isbn, v_url,
      v_document_no, p_tradition_context_id, p_accessed_on, v_notes
    )
    RETURNING * INTO v_created;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'yebs_sources_doi_key' THEN
        RAISE EXCEPTION 'YEBS_SOURCE_DOI_DUPLICATE' USING ERRCODE = 'P0001';
      ELSIF v_constraint = 'yebs_sources_pmid_key' THEN
        RAISE EXCEPTION 'YEBS_SOURCE_PMID_DUPLICATE' USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
      END IF;
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'YEBS_SOURCE_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit create ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'create', 'source', v_created.id,
    'committed', NULL, to_jsonb(v_created),
    ARRAY[
      'source_type','title','language_tag','script_code','authors','organization',
      'publisher','publication_year','dating_note','edition','doi','pmid','isbn','url',
      'document_no','tradition_context_id','accessed_on','notes'
    ]::text[],
    p_reason, p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_created;
END;
$$;

-- ------------------------------------------------------------
-- D) UPDATE RPC (partial JSONB patch; yalnız 18 mutable alan)
-- ------------------------------------------------------------
CREATE FUNCTION public.yebs_update_source_with_audit(
  p_actor_admin_id      uuid,
  p_request_id          uuid,
  p_operation_id        uuid,
  p_source_id           uuid,
  p_expected_updated_at timestamptz,
  p_patch               jsonb,
  p_reason              text
)
RETURNS public.yebs_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role         text;
  v_active       boolean;
  v_email        text;
  v_actor_label  text;
  v_existing     public.yebs_sources;
  v_updated      public.yebs_sources;
  v_constraint   text;
  v_changed      text[] := ARRAY[]::text[];
  -- Merged/normalize edilmiş değerler.
  v_source_type  text;
  v_title        text;
  v_lang         text;
  v_script       text;
  v_authors      text;
  v_org          text;
  v_publisher    text;
  v_pub_year     integer;
  v_dating_note  text;
  v_edition      text;
  v_doi          text;
  v_pmid         text;
  v_isbn         text;
  v_url          text;
  v_document_no  text;
  v_trad_ctx     uuid;
  v_accessed_on  date;
  v_notes        text;
BEGIN
  -- --- Operasyon/hedef parametreleri ---
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_OPERATION_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'YEBS_SOURCE_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'YEBS_EXPECTED_UPDATED_AT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- --- reason ZORUNLU (HAM fidelity) ---
  IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'YEBS_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- --- patch: object, boş değil, yalnız 18 mutable anahtar ---
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS k
     WHERE k NOT IN (
       'source_type','title','language_tag','script_code','authors','organization',
       'publisher','publication_year','dating_note','edition','doi','pmid','isbn','url',
       'document_no','tradition_context_id','accessed_on','notes'
     )
  ) THEN
    RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
  END IF;

  -- --- Aktif admin ---
  SELECT u.role, u.active, u.email
    INTO v_role, v_active, v_email
    FROM public.users u
   WHERE u.id = p_actor_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_role IS DISTINCT FROM 'admin' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'YEBS_ADMIN_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  v_actor_label := nullif(btrim(coalesce(v_email, '')), '');
  IF v_actor_label IS NULL OR length(v_actor_label) > 320 THEN
    v_actor_label := 'admin';
  END IF;

  -- --- Hedef satırı kilitle ---
  SELECT * INTO v_existing FROM public.yebs_sources
    WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'YEBS_SOURCE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- --- Status gate: yalnız draft ---
  IF v_existing.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'YEBS_SOURCE_STATUS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  -- --- Optimistic concurrency ---
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'YEBS_SOURCE_STALE_UPDATE' USING ERRCODE = 'P0001';
  END IF;

  -- --- source_type (present: string, 17 enum) ---
  IF jsonb_exists(p_patch, 'source_type') THEN
    IF jsonb_typeof(p_patch -> 'source_type') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_source_type := p_patch ->> 'source_type';
    IF v_source_type NOT IN (
      'classical_text','book','journal_article','regulatory_document','monograph',
      'standard','database_record','thesis','website','oral_tradition_record','other',
      'institutional_report','archival_document','media_recording','interview_record',
      'field_observation_record','experiential_record'
    ) THEN
      RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_source_type := v_existing.source_type;
  END IF;

  -- --- title (present: string, btrim nonblank) ---
  IF jsonb_exists(p_patch, 'title') THEN
    IF jsonb_typeof(p_patch -> 'title') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_title := btrim(p_patch ->> 'title');
    IF v_title = '' THEN
      RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_title := v_existing.title;
  END IF;

  -- --- language_tag (present: string, btrim + BCP-47) ---
  IF jsonb_exists(p_patch, 'language_tag') THEN
    IF jsonb_typeof(p_patch -> 'language_tag') <> 'string' THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_lang := btrim(p_patch ->> 'language_tag');
    IF v_lang = '' OR v_lang !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_lang := v_existing.language_tag;
  END IF;

  -- --- script_code (present: string|null; btrim→NULL; varsa ISO-15924) ---
  IF jsonb_exists(p_patch, 'script_code') THEN
    IF jsonb_typeof(p_patch -> 'script_code') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_patch -> 'script_code') = 'null' THEN
      v_script := NULL;
    ELSE
      v_script := nullif(btrim(p_patch ->> 'script_code'), '');
    END IF;
    IF v_script IS NOT NULL AND v_script !~ '^[A-Z][a-z]{3}$' THEN
      RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_script := v_existing.script_code;
  END IF;

  -- --- opsiyonel insan künye alanları (present: string|null; btrim→NULL) ---
  -- authors
  IF jsonb_exists(p_patch, 'authors') THEN
    IF jsonb_typeof(p_patch -> 'authors') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_authors := CASE WHEN jsonb_typeof(p_patch -> 'authors') = 'null'
                      THEN NULL ELSE nullif(btrim(p_patch ->> 'authors'), '') END;
  ELSE
    v_authors := v_existing.authors;
  END IF;
  -- organization
  IF jsonb_exists(p_patch, 'organization') THEN
    IF jsonb_typeof(p_patch -> 'organization') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_org := CASE WHEN jsonb_typeof(p_patch -> 'organization') = 'null'
                  THEN NULL ELSE nullif(btrim(p_patch ->> 'organization'), '') END;
  ELSE
    v_org := v_existing.organization;
  END IF;
  -- publisher
  IF jsonb_exists(p_patch, 'publisher') THEN
    IF jsonb_typeof(p_patch -> 'publisher') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_publisher := CASE WHEN jsonb_typeof(p_patch -> 'publisher') = 'null'
                        THEN NULL ELSE nullif(btrim(p_patch ->> 'publisher'), '') END;
  ELSE
    v_publisher := v_existing.publisher;
  END IF;
  -- dating_note
  IF jsonb_exists(p_patch, 'dating_note') THEN
    IF jsonb_typeof(p_patch -> 'dating_note') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_dating_note := CASE WHEN jsonb_typeof(p_patch -> 'dating_note') = 'null'
                          THEN NULL ELSE nullif(btrim(p_patch ->> 'dating_note'), '') END;
  ELSE
    v_dating_note := v_existing.dating_note;
  END IF;
  -- edition
  IF jsonb_exists(p_patch, 'edition') THEN
    IF jsonb_typeof(p_patch -> 'edition') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_edition := CASE WHEN jsonb_typeof(p_patch -> 'edition') = 'null'
                      THEN NULL ELSE nullif(btrim(p_patch ->> 'edition'), '') END;
  ELSE
    v_edition := v_existing.edition;
  END IF;
  -- document_no
  IF jsonb_exists(p_patch, 'document_no') THEN
    IF jsonb_typeof(p_patch -> 'document_no') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_document_no := CASE WHEN jsonb_typeof(p_patch -> 'document_no') = 'null'
                          THEN NULL ELSE nullif(btrim(p_patch ->> 'document_no'), '') END;
  ELSE
    v_document_no := v_existing.document_no;
  END IF;
  -- notes
  IF jsonb_exists(p_patch, 'notes') THEN
    IF jsonb_typeof(p_patch -> 'notes') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    v_notes := CASE WHEN jsonb_typeof(p_patch -> 'notes') = 'null'
                    THEN NULL ELSE nullif(btrim(p_patch ->> 'notes'), '') END;
  ELSE
    v_notes := v_existing.notes;
  END IF;

  -- --- publication_year (present: number|null; integer -3000..2100) ---
  IF jsonb_exists(p_patch, 'publication_year') THEN
    IF jsonb_typeof(p_patch -> 'publication_year') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_patch -> 'publication_year') = 'null' THEN
      v_pub_year := NULL;
    ELSE
      -- Tam sayı olmalı (ondalık reddi): sayı = floor'u ise integer.
      IF (p_patch -> 'publication_year')::numeric <> floor((p_patch -> 'publication_year')::numeric) THEN
        RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
      END IF;
      v_pub_year := (p_patch ->> 'publication_year')::integer;
      IF v_pub_year < -3000 OR v_pub_year > 2100 THEN
        RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    v_pub_year := v_existing.publication_year;
  END IF;

  -- --- accessed_on (present: string 'YYYY-MM-DD'|null) ---
  IF jsonb_exists(p_patch, 'accessed_on') THEN
    IF jsonb_typeof(p_patch -> 'accessed_on') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_patch -> 'accessed_on') = 'null' THEN
      v_accessed_on := NULL;
    ELSE
      -- Katı biçim: YYYY-MM-DD (route ayrıca takvim doğrular).
      IF (p_patch ->> 'accessed_on') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
      END IF;
      BEGIN
        v_accessed_on := (p_patch ->> 'accessed_on')::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
      END;
    END IF;
  ELSE
    v_accessed_on := v_existing.accessed_on;
  END IF;

  -- --- doi (present: string|null; lower(btrim)→NULL; 10.%) ---
  IF jsonb_exists(p_patch, 'doi') THEN
    IF jsonb_typeof(p_patch -> 'doi') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_patch -> 'doi') = 'null' THEN
      v_doi := NULL;
    ELSE
      v_doi := nullif(lower(btrim(p_patch ->> 'doi')), '');
      IF v_doi IS NOT NULL AND v_doi NOT LIKE '10.%' THEN
        RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    v_doi := v_existing.doi;
  END IF;

  -- --- pmid (present: string|null; btrim→NULL; ^[1-9][0-9]*$) ---
  IF jsonb_exists(p_patch, 'pmid') THEN
    IF jsonb_typeof(p_patch -> 'pmid') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_patch -> 'pmid') = 'null' THEN
      v_pmid := NULL;
    ELSE
      v_pmid := nullif(btrim(p_patch ->> 'pmid'), '');
      IF v_pmid IS NOT NULL AND v_pmid !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    v_pmid := v_existing.pmid;
  END IF;

  -- --- isbn (present: string|null; boşluk/tire sıyır + x→X; duplicate YOK) ---
  IF jsonb_exists(p_patch, 'isbn') THEN
    IF jsonb_typeof(p_patch -> 'isbn') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_patch -> 'isbn') = 'null' THEN
      v_isbn := NULL;
    ELSE
      v_isbn := nullif(translate(regexp_replace(p_patch ->> 'isbn', '[[:space:]-]', '', 'g'), 'x', 'X'), '');
    END IF;
  ELSE
    v_isbn := v_existing.isbn;
  END IF;

  -- --- url (present: string|null; dış btrim→NULL; http(s)://) ---
  IF jsonb_exists(p_patch, 'url') THEN
    IF jsonb_typeof(p_patch -> 'url') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_patch -> 'url') = 'null' THEN
      v_url := NULL;
    ELSE
      v_url := nullif(btrim(p_patch ->> 'url'), '');
      IF v_url IS NOT NULL AND v_url !~ '^https?://' THEN
        RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    v_url := v_existing.url;
  END IF;

  -- --- tradition_context_id (present: string uuid|null; mutable) ---
  IF jsonb_exists(p_patch, 'tradition_context_id') THEN
    IF jsonb_typeof(p_patch -> 'tradition_context_id') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
    END IF;
    IF jsonb_typeof(p_patch -> 'tradition_context_id') = 'null' THEN
      v_trad_ctx := NULL;
    ELSE
      BEGIN
        v_trad_ctx := (p_patch ->> 'tradition_context_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'YEBS_INVALID_PATCH' USING ERRCODE = 'P0001';
      END;
    END IF;
    -- Yeni değer NULL değilse ve gerçekten değiştiyse varlık kontrolü.
    IF v_trad_ctx IS NOT NULL AND v_trad_ctx IS DISTINCT FROM v_existing.tradition_context_id THEN
      PERFORM 1 FROM public.yebs_traditions WHERE id = v_trad_ctx FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'YEBS_SOURCE_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    v_trad_ctx := v_existing.tradition_context_id;
  END IF;

  -- --- changed_fields: SABİT canonical sıra, IS DISTINCT FROM (null-safe) ---
  IF v_source_type IS DISTINCT FROM v_existing.source_type THEN v_changed := v_changed || 'source_type'; END IF;
  IF v_title       IS DISTINCT FROM v_existing.title THEN v_changed := v_changed || 'title'; END IF;
  IF v_lang        IS DISTINCT FROM v_existing.language_tag THEN v_changed := v_changed || 'language_tag'; END IF;
  IF v_script      IS DISTINCT FROM v_existing.script_code THEN v_changed := v_changed || 'script_code'; END IF;
  IF v_authors     IS DISTINCT FROM v_existing.authors THEN v_changed := v_changed || 'authors'; END IF;
  IF v_org         IS DISTINCT FROM v_existing.organization THEN v_changed := v_changed || 'organization'; END IF;
  IF v_publisher   IS DISTINCT FROM v_existing.publisher THEN v_changed := v_changed || 'publisher'; END IF;
  IF v_pub_year    IS DISTINCT FROM v_existing.publication_year THEN v_changed := v_changed || 'publication_year'; END IF;
  IF v_dating_note IS DISTINCT FROM v_existing.dating_note THEN v_changed := v_changed || 'dating_note'; END IF;
  IF v_edition     IS DISTINCT FROM v_existing.edition THEN v_changed := v_changed || 'edition'; END IF;
  IF v_doi         IS DISTINCT FROM v_existing.doi THEN v_changed := v_changed || 'doi'; END IF;
  IF v_pmid        IS DISTINCT FROM v_existing.pmid THEN v_changed := v_changed || 'pmid'; END IF;
  IF v_isbn        IS DISTINCT FROM v_existing.isbn THEN v_changed := v_changed || 'isbn'; END IF;
  IF v_url         IS DISTINCT FROM v_existing.url THEN v_changed := v_changed || 'url'; END IF;
  IF v_document_no IS DISTINCT FROM v_existing.document_no THEN v_changed := v_changed || 'document_no'; END IF;
  IF v_trad_ctx    IS DISTINCT FROM v_existing.tradition_context_id THEN v_changed := v_changed || 'tradition_context_id'; END IF;
  IF v_accessed_on IS DISTINCT FROM v_existing.accessed_on THEN v_changed := v_changed || 'accessed_on'; END IF;
  IF v_notes       IS DISTINCT FROM v_existing.notes THEN v_changed := v_changed || 'notes'; END IF;

  -- --- No-op reddi (normalize sonrası) ---
  IF cardinality(v_changed) = 0 THEN
    RAISE EXCEPTION 'YEBS_SOURCE_NO_CHANGES' USING ERRCODE = 'P0001';
  END IF;

  -- --- Canonical UPDATE (status/id/timestamps DEĞİŞMEZ; updated_at trigger) ---
  BEGIN
    UPDATE public.yebs_sources
       SET source_type          = v_source_type,
           title                = v_title,
           language_tag         = v_lang,
           script_code          = v_script,
           authors              = v_authors,
           organization         = v_org,
           publisher            = v_publisher,
           publication_year     = v_pub_year,
           dating_note          = v_dating_note,
           edition              = v_edition,
           doi                  = v_doi,
           pmid                 = v_pmid,
           isbn                 = v_isbn,
           url                  = v_url,
           document_no          = v_document_no,
           tradition_context_id = v_trad_ctx,
           accessed_on          = v_accessed_on,
           notes                = v_notes
     WHERE id = p_source_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'yebs_sources_doi_key' THEN
        RAISE EXCEPTION 'YEBS_SOURCE_DOI_DUPLICATE' USING ERRCODE = 'P0001';
      ELSIF v_constraint = 'yebs_sources_pmid_key' THEN
        RAISE EXCEPTION 'YEBS_SOURCE_PMID_DUPLICATE' USING ERRCODE = 'P0001';
      ELSE
        RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
      END IF;
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'YEBS_SOURCE_TRADITION_NOT_FOUND' USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'YEBS_INVALID_SOURCE_INPUT' USING ERRCODE = 'P0001';
  END;

  -- --- Audit update ---
  INSERT INTO public.yebs_audit_events (
    actor_admin_id, actor_label_snapshot, action, entity_type, entity_id,
    outcome, previous_state, new_state, changed_fields, reason,
    request_id, operation_id, error_code, metadata
  )
  VALUES (
    p_actor_admin_id, v_actor_label, 'update', 'source', v_updated.id,
    'committed', to_jsonb(v_existing), to_jsonb(v_updated), v_changed, p_reason,
    p_request_id, p_operation_id, NULL, '{}'::jsonb
  );

  RETURN v_updated;
END;
$$;

-- ------------------------------------------------------------
-- E) EXECUTE privilege modeli — tam signature ile kilitle.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.yebs_create_source_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, text, uuid, date, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_create_source_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, text, uuid, date, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_create_source_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, text, uuid, date, text, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_create_source_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, text, uuid, date, text, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_create_source_with_audit(
  uuid, uuid, uuid, text, text, text, text, text, text, text, integer, text, text,
  text, text, text, text, text, uuid, date, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.yebs_update_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_update_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_update_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_update_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_update_source_with_audit(
  uuid, uuid, uuid, uuid, timestamptz, jsonb, text
) TO service_role;

COMMIT;
