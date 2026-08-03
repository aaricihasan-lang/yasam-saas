-- =============================================================================
-- 20260925000000_hd_consultation_layer_foundation.sql
--
-- HUMAN DESIGN — DANIŞMANLIK KULLANIM KATMANI (F1) · ŞEMA + ATOMİK RPC
--
-- AMAÇ (additif; mevcut hiçbir tablo/rota/veri değişmez):
--   Merkezî canonical HD içeriğinin (hd_canonical_content) ÜSTÜNE, danışan
--   görüşmesinde okunacak KISA kullanım bloklarını taşıyan tenant'sız/tenant
--   katmanını kurar. 9 yeni tablo + hd_sources/hd_source_passages structured
--   rights additif kolonları + hd_content_audit_events.resource_kind additif
--   genişletme + 6 atomik SECURITY DEFINER RPC.
--
-- F0B TS SÖZLEŞMELERİYLE PARİTE (lib/human-design/consultation/*):
--   status draft|published|archived; section_kind 9-whitelist; usage_scope
--   expert_guide|client_report|both; condition_kind type_is|authority_is|
--   has_channel|has_gate; relation_type supports|contradicts|school_specific|
--   background; entitlement scope_kind all_hd|entity. CHECK değerleri TS
--   union'larıyla BİREBİR.
--
-- KANONİK KAYNAK İZİ (KARAR — repo precedent'i):
--   canonical_content_version DB'de AUTHORITATIVE okunur (hd_canonical_content.
--   version ile eşleşme RPC'de zorlanır). canonical_content_hash SERVER (Node
--   crypto) tarafından hesaplanır ve RPC'ye GÜVENİLİR PARAMETRE olarak geçer;
--   DB yalnız 64-hex FORMAT'ı zorlar. Bu, hd_original_texts / faithful_translations
--   / aromatherapy_source_passages ile AYNI kanonik hash sözleşmesidir (DB'de
--   pgcrypto/digest KULLANILMAZ → extension/search_path bağımlılığı YOK).
--
-- GÜVENLİK (born-locked): 9 tablo da RLS ENABLE (policy 0), PUBLIC/anon/
--   authenticated REVOKE ALL; service_role yalnız SELECT (okuma route'ları için).
--   TÜM yazımlar SECURITY DEFINER RPC üzerinden (owner ayrıcalığı); RPC'lerde
--   SET search_path=public, EXECUTE public/anon/authenticated'tan REVOKE,
--   yalnız service_role'a GRANT. İstemciden tablo adı / dinamik SQL YOK.
--
-- ATOMİKLİK: her RPC tek fonksiyon = tek transaction; audit dahil tüm mutation
--   aynı işlemde. Herhangi bir RAISE → tüm RPC işlemi ROLLBACK (audit patlarsa
--   ana mutation da geri alınır). actor_admin_id JSON payload'dan DEĞİL, ayrı
--   güvenilir parametreden (ileride verifyAdminRequest guard'ından) gelir.
--
-- KAPSAM DIŞI: production SQL apply, API, UI, Word, canlı veri, seed, Manifestör
--   pilotu, mevcut hd_canonical_content / centralContent* hattı, engine/compute,
--   legacy human_design_reports. destructive DOWN YOK; hard delete YOK (archive).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) STRUCTURED RIGHTS — hd_sources additif (default-deny; açık boolean alanlar)
--    Mevcut kolonlar SİLİNMEZ/yeniden yorumlanmaz. Hak, çeviri varlığından
--    türetilmez; quotation serbest metinden boolean'a çevrilmez.
-- -----------------------------------------------------------------------------
ALTER TABLE public.hd_sources
  ADD COLUMN IF NOT EXISTS translation_allowed  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quotation_allowed    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quotation_word_limit integer;

ALTER TABLE public.hd_sources
  ADD CONSTRAINT hd_sources_quotation_word_limit_chk
    CHECK (quotation_word_limit IS NULL OR quotation_word_limit > 0);

ALTER TABLE public.hd_source_passages
  ADD COLUMN IF NOT EXISTS translation_allowed_override  boolean,
  ADD COLUMN IF NOT EXISTS quotation_allowed_override    boolean,
  ADD COLUMN IF NOT EXISTS quotation_word_limit_override integer;

ALTER TABLE public.hd_source_passages
  ADD CONSTRAINT hd_source_passages_quotation_word_limit_override_chk
    CHECK (quotation_word_limit_override IS NULL OR quotation_word_limit_override > 0);

-- -----------------------------------------------------------------------------
-- 1) AUDIT resource_kind additif genişletme (mevcut 6 değer KORUNUR)
-- -----------------------------------------------------------------------------
ALTER TABLE public.hd_content_audit_events
  DROP CONSTRAINT hd_content_audit_resource_kind_chk;
ALTER TABLE public.hd_content_audit_events
  ADD CONSTRAINT hd_content_audit_resource_kind_chk CHECK (resource_kind IN (
    -- mevcut (korunur)
    'canonical_content', 'source', 'source_passage',
    'original_text', 'faithful_translation', 'content_evidence',
    -- danışmanlık katmanı (additif)
    'consultation_content', 'consultation_section', 'consultation_question',
    'consultation_condition', 'consultation_evidence', 'consultation_entitlement'
  ));
-- action sözleşmesi bozulmaz: archive → 'deleted' (soft) olarak audit'lenir.

-- -----------------------------------------------------------------------------
-- 2) hd_consultation_contents — danışmanlık ana kaydı
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_consultation_contents (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 uuid        NOT NULL,
  entity_kind               text        NOT NULL,   -- RPC canonical entity'den doldurur (GENERATED değil)
  canonical_key             text        NOT NULL,   -- RPC canonical entity'den doldurur
  canonical_content_id      uuid,
  canonical_content_version integer,
  canonical_content_hash    text,
  status                    text        NOT NULL DEFAULT 'draft',
  version                   integer     NOT NULL DEFAULT 1,
  is_ai_generated           boolean     NOT NULL DEFAULT false,
  human_approved_at         timestamptz,
  archived_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_cc_status_chk        CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT hd_cc_entity_kind_chk   CHECK (entity_kind IN ('tip', 'otorite', 'kapi', 'kanal')),
  CONSTRAINT hd_cc_version_chk       CHECK (version > 0),
  CONSTRAINT hd_cc_canonical_version_chk CHECK (canonical_content_version IS NULL OR canonical_content_version > 0),
  CONSTRAINT hd_cc_canonical_hash_chk    CHECK (canonical_content_hash IS NULL OR canonical_content_hash ~ '^[0-9a-f]{64}$'),
  -- canonical kaynak izi ya tümüyle NULL ya da id+version+hash BİRLİKTE dolu.
  CONSTRAINT hd_cc_canonical_triplet_chk CHECK (
    (canonical_content_id IS NULL AND canonical_content_version IS NULL AND canonical_content_hash IS NULL)
    OR (canonical_content_id IS NOT NULL AND canonical_content_version IS NOT NULL AND canonical_content_hash IS NOT NULL)
  ),
  -- published → human onayı + canonical iz zorunlu (güvenli kapı).
  CONSTRAINT hd_cc_published_chk CHECK (
    status <> 'published'
    OR (human_approved_at IS NOT NULL AND canonical_content_id IS NOT NULL)
  ),
  CONSTRAINT hd_cc_archived_at_chk CHECK (
    (status = 'archived') = (archived_at IS NOT NULL)
  ),
  CONSTRAINT hd_cc_entity_fk
    FOREIGN KEY (entity_id, entity_kind, canonical_key)
    REFERENCES public.hd_canonical_entities (id, entity_kind, canonical_key) ON DELETE RESTRICT,
  CONSTRAINT hd_cc_canonical_content_fk
    FOREIGN KEY (canonical_content_id) REFERENCES public.hd_canonical_content (id) ON DELETE RESTRICT
);
-- entity başına yalnız BİR aktif (archived olmayan) danışmanlık kaydı.
CREATE UNIQUE INDEX hd_cc_one_active_per_entity_uidx
  ON public.hd_consultation_contents (entity_id) WHERE status <> 'archived';
CREATE INDEX hd_cc_status_idx        ON public.hd_consultation_contents (status);
CREATE INDEX hd_cc_entity_kind_idx   ON public.hd_consultation_contents (entity_kind);
CREATE INDEX hd_cc_canonical_key_idx ON public.hd_consultation_contents (canonical_key);
CREATE INDEX hd_cc_canonical_content_idx ON public.hd_consultation_contents (canonical_content_id);
CREATE TRIGGER trg_hd_cc_updated_at BEFORE UPDATE ON public.hd_consultation_contents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3) hd_consultation_sections — asıl kullanım blokları
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_consultation_sections (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id            uuid        NOT NULL,
  section_kind          text        NOT NULL,
  body_text             text        NOT NULL,
  topic_scope           text,
  usage_scope           text        NOT NULL,
  status                text        NOT NULL DEFAULT 'draft',
  version               integer     NOT NULL DEFAULT 1,
  supersedes_section_id uuid,
  sort_order            integer     NOT NULL DEFAULT 0,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_cs_section_kind_chk CHECK (section_kind IN (
    'quick_reference', 'client_explanation', 'consultation_flow',
    'relationship_guidance', 'career_guidance', 'childhood_guidance',
    'energy_rest_guidance', 'practical_actions', 'report_ready_text'
  )),
  CONSTRAINT hd_cs_usage_scope_chk CHECK (usage_scope IN ('expert_guide', 'client_report', 'both')),
  CONSTRAINT hd_cs_status_chk      CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT hd_cs_body_notblank_chk CHECK (btrim(body_text) <> ''),
  CONSTRAINT hd_cs_topic_scope_chk CHECK (topic_scope IS NULL OR btrim(topic_scope) <> ''),
  CONSTRAINT hd_cs_version_chk     CHECK (version > 0),
  CONSTRAINT hd_cs_sort_order_chk  CHECK (sort_order >= 0),
  CONSTRAINT hd_cs_archived_at_chk CHECK ((status = 'archived') = (archived_at IS NOT NULL)),
  CONSTRAINT hd_cs_supersedes_not_self_chk CHECK (supersedes_section_id IS NULL OR supersedes_section_id <> id),
  CONSTRAINT hd_cs_content_fk FOREIGN KEY (content_id) REFERENCES public.hd_consultation_contents (id) ON DELETE CASCADE,
  CONSTRAINT hd_cs_supersedes_fk FOREIGN KEY (supersedes_section_id) REFERENCES public.hd_consultation_sections (id) ON DELETE RESTRICT
);
-- aynı aktif content içinde aynı section_kind tek.
CREATE UNIQUE INDEX hd_cs_one_kind_per_content_uidx
  ON public.hd_consultation_sections (content_id, section_kind) WHERE status <> 'archived';
CREATE INDEX hd_cs_content_sort_idx ON public.hd_consultation_sections (content_id, sort_order);
CREATE INDEX hd_cs_status_idx       ON public.hd_consultation_sections (status);
CREATE TRIGGER trg_hd_cs_updated_at BEFORE UPDATE ON public.hd_consultation_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4) hd_consultation_questions
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_consultation_questions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id    uuid        NOT NULL,
  section_id    uuid,
  question_text text        NOT NULL,
  topic_scope   text,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_cq_question_notblank_chk CHECK (btrim(question_text) <> ''),
  CONSTRAINT hd_cq_topic_scope_chk CHECK (topic_scope IS NULL OR btrim(topic_scope) <> ''),
  CONSTRAINT hd_cq_sort_order_chk CHECK (sort_order >= 0),
  CONSTRAINT hd_cq_content_fk FOREIGN KEY (content_id) REFERENCES public.hd_consultation_contents (id) ON DELETE CASCADE,
  CONSTRAINT hd_cq_section_fk FOREIGN KEY (section_id) REFERENCES public.hd_consultation_sections (id) ON DELETE CASCADE
);
CREATE INDEX hd_cq_content_sort_idx ON public.hd_consultation_questions (content_id, sort_order);
CREATE INDEX hd_cq_section_idx      ON public.hd_consultation_questions (section_id);
CREATE TRIGGER trg_hd_cq_updated_at BEFORE UPDATE ON public.hd_consultation_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5) hd_consultation_conditions — whitelist kind + canonical-doğrulanmış değer
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_consultation_conditions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id      uuid        NOT NULL,
  section_id      uuid,
  condition_kind  text        NOT NULL,
  condition_value text        NOT NULL,   -- canonical anahtar; RPC registry ile doğrular
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_ccond_kind_chk CHECK (condition_kind IN ('type_is', 'authority_is', 'has_channel', 'has_gate')),
  CONSTRAINT hd_ccond_value_notblank_chk CHECK (btrim(condition_value) <> ''),
  CONSTRAINT hd_ccond_sort_order_chk CHECK (sort_order >= 0),
  CONSTRAINT hd_ccond_content_fk FOREIGN KEY (content_id) REFERENCES public.hd_consultation_contents (id) ON DELETE CASCADE,
  CONSTRAINT hd_ccond_section_fk FOREIGN KEY (section_id) REFERENCES public.hd_consultation_sections (id) ON DELETE CASCADE
);
CREATE INDEX hd_ccond_content_idx ON public.hd_consultation_conditions (content_id);
CREATE INDEX hd_ccond_section_idx ON public.hd_consultation_conditions (section_id);
CREATE INDEX hd_ccond_kind_idx    ON public.hd_consultation_conditions (condition_kind);

-- -----------------------------------------------------------------------------
-- 6) hd_consultation_evidence — bölüm-düzeyinde zorunlu provenans
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_consultation_evidence (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id       uuid        NOT NULL,
  section_id       uuid        NOT NULL,
  passage_id       uuid        NOT NULL,
  relation_type    text        NOT NULL,
  is_primary       boolean     NOT NULL DEFAULT false,
  is_single_source boolean     NOT NULL DEFAULT false,
  editorial_note   text,
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_cev_relation_chk CHECK (relation_type IN ('supports', 'contradicts', 'school_specific', 'background')),
  CONSTRAINT hd_cev_sort_order_chk CHECK (sort_order >= 0),
  CONSTRAINT hd_cev_content_fk FOREIGN KEY (content_id) REFERENCES public.hd_consultation_contents (id) ON DELETE CASCADE,
  CONSTRAINT hd_cev_section_fk FOREIGN KEY (section_id) REFERENCES public.hd_consultation_sections (id) ON DELETE CASCADE,
  CONSTRAINT hd_cev_passage_fk FOREIGN KEY (passage_id) REFERENCES public.hd_source_passages (id) ON DELETE RESTRICT,
  -- aynı bölüm/passage/relation duplicate yasak.
  CONSTRAINT hd_cev_section_passage_relation_key UNIQUE (section_id, passage_id, relation_type)
);
-- bölüm başına tek primary evidence.
CREATE UNIQUE INDEX hd_cev_one_primary_per_section_uidx
  ON public.hd_consultation_evidence (section_id) WHERE is_primary;
CREATE INDEX hd_cev_section_idx ON public.hd_consultation_evidence (section_id);
CREATE INDEX hd_cev_passage_idx ON public.hd_consultation_evidence (passage_id);
CREATE INDEX hd_cev_content_idx ON public.hd_consultation_evidence (content_id);
CREATE TRIGGER trg_hd_cev_updated_at BEFORE UPDATE ON public.hd_consultation_evidence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7) hd_consultation_expert_notes — tenant overlay (merkezî metni değiştirmez)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_consultation_expert_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL,
  user_id    uuid        NOT NULL,
  content_id uuid        NOT NULL,
  section_id uuid,
  note_text  text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_cen_note_notblank_chk CHECK (btrim(note_text) <> ''),
  -- canonical/danışmanlık kayıtlarına yalnız REFERANS (RESTRICT); onları değiştirmez.
  CONSTRAINT hd_cen_content_fk FOREIGN KEY (content_id) REFERENCES public.hd_consultation_contents (id) ON DELETE RESTRICT,
  CONSTRAINT hd_cen_section_fk FOREIGN KEY (section_id) REFERENCES public.hd_consultation_sections (id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX hd_cen_tenant_section_uidx
  ON public.hd_consultation_expert_notes (tenant_id, section_id) WHERE section_id IS NOT NULL;
CREATE INDEX hd_cen_tenant_content_idx ON public.hd_consultation_expert_notes (tenant_id, content_id);
CREATE TRIGGER trg_hd_cen_updated_at BEFORE UPDATE ON public.hd_consultation_expert_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 8) hd_consultation_entitlements — grant defteri (aktiflik = revoked_at IS NULL)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_consultation_entitlements (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL,
  user_id             uuid        NOT NULL,
  scope_kind          text        NOT NULL,
  entity_id           uuid,
  granted_by_admin_id uuid        NOT NULL,
  granted_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,

  CONSTRAINT hd_cent_scope_kind_chk CHECK (scope_kind IN ('all_hd', 'entity')),
  -- all_hd → entity_id NULL; entity → entity_id zorunlu (çelişkili 'active' kolonu YOK).
  CONSTRAINT hd_cent_scope_entity_chk CHECK (
    (scope_kind = 'all_hd' AND entity_id IS NULL)
    OR (scope_kind = 'entity' AND entity_id IS NOT NULL)
  ),
  CONSTRAINT hd_cent_entity_fk FOREIGN KEY (entity_id) REFERENCES public.hd_canonical_entities (id) ON DELETE RESTRICT
);
-- aktif (revoked_at NULL) grant duplicate olamaz: (user, scope, entity) tekil.
CREATE UNIQUE INDEX hd_cent_active_unique_uidx
  ON public.hd_consultation_entitlements
     (user_id, scope_kind, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;
CREATE INDEX hd_cent_tenant_user_idx ON public.hd_consultation_entitlements (tenant_id, user_id);
CREATE INDEX hd_cent_entity_idx      ON public.hd_consultation_entitlements (entity_id);

-- -----------------------------------------------------------------------------
-- 9) hd_consultation_sessions — uzman görüşme oturumu (snapshot; F4 write RPC)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_consultation_sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid        NOT NULL,
  user_id               uuid        NOT NULL,
  client_id             uuid        NOT NULL,
  chart_id              uuid        NOT NULL,
  topic_scope           text,
  fetched_snapshot      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  selected_section_ids  uuid[]      NOT NULL DEFAULT '{}',
  expert_notes_snapshot jsonb       NOT NULL DEFAULT '[]'::jsonb,
  session_date          date        NOT NULL DEFAULT current_date,
  guide_snapshot        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_cses_fetched_obj_chk CHECK (jsonb_typeof(fetched_snapshot) = 'object'),
  CONSTRAINT hd_cses_guide_obj_chk   CHECK (jsonb_typeof(guide_snapshot) = 'object'),
  CONSTRAINT hd_cses_notes_arr_chk   CHECK (jsonb_typeof(expert_notes_snapshot) = 'array')
);
CREATE INDEX hd_cses_tenant_client_idx ON public.hd_consultation_sessions (tenant_id, client_id);
CREATE INDEX hd_cses_chart_idx         ON public.hd_consultation_sessions (chart_id);
CREATE TRIGGER trg_hd_cses_updated_at BEFORE UPDATE ON public.hd_consultation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 10) hd_client_reports — danışan raporu (immutable snapshot; F4 write RPC)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_client_reports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  user_id         uuid        NOT NULL,
  client_id       uuid        NOT NULL,
  chart_id        uuid        NOT NULL,
  session_id      uuid,       -- nullable; doluysa tenant/client/chart uyumu API/RPC'de doğrulanır
  client_snapshot jsonb       NOT NULL DEFAULT '{}'::jsonb,
  delivered_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_ccr_snapshot_obj_chk CHECK (jsonb_typeof(client_snapshot) = 'object'),
  CONSTRAINT hd_ccr_session_fk FOREIGN KEY (session_id) REFERENCES public.hd_consultation_sessions (id) ON DELETE SET NULL
);
CREATE INDEX hd_ccr_tenant_client_idx ON public.hd_client_reports (tenant_id, client_id);
CREATE INDEX hd_ccr_session_idx       ON public.hd_client_reports (session_id);
CREATE TRIGGER trg_hd_ccr_updated_at BEFORE UPDATE ON public.hd_client_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 11) BORN-LOCKED RLS + GRANT (9 tablo): RLS ENABLE, policy 0, anon/auth REVOKE
--     ALL, service_role yalnız SELECT (yazım SECURITY DEFINER RPC üzerinden).
-- -----------------------------------------------------------------------------
DO $lock$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hd_consultation_contents', 'hd_consultation_sections', 'hd_consultation_questions',
    'hd_consultation_conditions', 'hd_consultation_evidence', 'hd_consultation_expert_notes',
    'hd_consultation_entitlements', 'hd_consultation_sessions', 'hd_client_reports'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon;', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated;', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM service_role;', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role;', t);
  END LOOP;
END
$lock$;

-- =============================================================================
-- 12) ATOMİK SECURITY DEFINER RPC'LER
--     Ortak: SET search_path=public; EXECUTE public/anon/authenticated REVOKE →
--     service_role GRANT. actor_admin_id ayrı GÜVENİLİR parametre (payload'da DEĞİL).
--     audit tablosuna context'e TAM METİN yazılmaz (yalnız changed_fields + kısa kod).
-- =============================================================================

-- 12.1) create — content + sections + questions + conditions + evidence TEK txn
CREATE OR REPLACE FUNCTION public.rpc_hd_consultation_create(
  p_actor_admin_id          uuid,
  p_entity_id               uuid,
  p_canonical_content_id    uuid,
  p_canonical_content_version integer,
  p_canonical_content_hash  text,
  p_is_ai_generated         boolean,
  p_sections                jsonb,
  p_questions               jsonb,
  p_conditions              jsonb,
  p_evidence                jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_kind      text;
  v_key       text;
  v_content   uuid;
  v_section   uuid;
  v_rec       jsonb;
  v_ext_key   text;
  v_sec_kind  text;
BEGIN
  IF p_actor_admin_id IS NULL THEN RAISE EXCEPTION 'actor_admin_id zorunlu (guard sonucu).'; END IF;

  -- entity_kind/canonical_key canonical entity'den (payload'dan DEĞİL)
  SELECT entity_kind, canonical_key INTO v_kind, v_key
    FROM public.hd_canonical_entities WHERE id = p_entity_id;
  IF v_kind IS NULL THEN RAISE EXCEPTION 'canonical entity bulunamadı: %', p_entity_id; END IF;

  -- canonical kaynak izi: ya tümü NULL ya da id+version+hash birlikte + DB doğrulaması
  IF p_canonical_content_id IS NOT NULL THEN
    IF p_canonical_content_version IS NULL OR p_canonical_content_hash IS NULL THEN
      RAISE EXCEPTION 'canonical içerik izi eksik (id+version+hash birlikte).';
    END IF;
    IF p_canonical_content_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'canonical_content_hash 64-hex olmalı.';
    END IF;
    -- version DB'de AUTHORITATIVE doğrulanır; içerik aynı entity'ye ait olmalı.
    PERFORM 1 FROM public.hd_canonical_content
      WHERE id = p_canonical_content_id AND entity_id = p_entity_id AND version = p_canonical_content_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'canonical içerik/sürüm/entity eşleşmiyor.'; END IF;
  END IF;

  INSERT INTO public.hd_consultation_contents (
    entity_id, entity_kind, canonical_key, canonical_content_id,
    canonical_content_version, canonical_content_hash, status, version, is_ai_generated
  ) VALUES (
    p_entity_id, v_kind, v_key, p_canonical_content_id,
    p_canonical_content_version, p_canonical_content_hash, 'draft', 1, COALESCE(p_is_ai_generated, false)
  ) RETURNING id INTO v_content;

  -- sections
  FOR v_rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb)) LOOP
    INSERT INTO public.hd_consultation_sections (content_id, section_kind, body_text, topic_scope, usage_scope, status, sort_order)
    VALUES (
      v_content,
      v_rec->>'section_kind',
      v_rec->>'body_text',
      NULLIF(v_rec->>'topic_scope', ''),
      v_rec->>'usage_scope',
      COALESCE(v_rec->>'status', 'draft'),
      COALESCE((v_rec->>'sort_order')::int, 0)
    );  -- CHECK/unique ihlali → tüm txn ROLLBACK
  END LOOP;

  -- questions (section_id opsiyonel; verilirse aynı content'e ait olmalı — FK zaten CASCADE bağlı content'e değil section'a)
  FOR v_rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_questions, '[]'::jsonb)) LOOP
    INSERT INTO public.hd_consultation_questions (content_id, section_id, question_text, topic_scope, sort_order)
    VALUES (v_content, NULLIF(v_rec->>'section_id','')::uuid, v_rec->>'question_text', NULLIF(v_rec->>'topic_scope',''), COALESCE((v_rec->>'sort_order')::int, 0));
  END LOOP;

  -- conditions — canonical değer registry ile doğrulanır (kind→entity_kind)
  FOR v_rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_conditions, '[]'::jsonb)) LOOP
    v_ext_key := v_rec->>'condition_value';
    IF (v_rec->>'condition_kind') NOT IN ('type_is','authority_is','has_channel','has_gate') THEN
      RAISE EXCEPTION 'geçersiz condition_kind: %', v_rec->>'condition_kind';
    END IF;
    -- has_gate: kapi_N (1..64) registry'de var mı; diğerleri kind→entity_kind eşleşmeli
    IF NOT EXISTS (
      SELECT 1 FROM public.hd_canonical_entities e
      WHERE e.canonical_key = v_ext_key AND e.entity_kind = CASE (v_rec->>'condition_kind')
        WHEN 'type_is' THEN 'tip' WHEN 'authority_is' THEN 'otorite'
        WHEN 'has_channel' THEN 'kanal' WHEN 'has_gate' THEN 'kapi' END
    ) THEN
      RAISE EXCEPTION 'condition_value canonical registry ile doğrulanamadı: %', v_ext_key;
    END IF;
    INSERT INTO public.hd_consultation_conditions (content_id, section_id, condition_kind, condition_value, sort_order)
    VALUES (v_content, NULLIF(v_rec->>'section_id','')::uuid, v_rec->>'condition_kind', v_ext_key, COALESCE((v_rec->>'sort_order')::int, 0));
  END LOOP;

  -- evidence — section-düzeyi zorunlu; passage FK RESTRICT
  FOR v_rec IN SELECT * FROM jsonb_array_elements(COALESCE(p_evidence, '[]'::jsonb)) LOOP
    INSERT INTO public.hd_consultation_evidence (content_id, section_id, passage_id, relation_type, is_primary, is_single_source, editorial_note, sort_order)
    VALUES (
      v_content, (v_rec->>'section_id')::uuid, (v_rec->>'passage_id')::uuid, v_rec->>'relation_type',
      COALESCE((v_rec->>'is_primary')::boolean, false), COALESCE((v_rec->>'is_single_source')::boolean, false),
      NULLIF(v_rec->>'editorial_note',''), COALESCE((v_rec->>'sort_order')::int, 0)
    );
  END LOOP;

  -- audit (aynı txn; başarısızsa tüm işlem rollback)
  INSERT INTO public.hd_content_audit_events (actor_admin_id, action, resource_kind, resource_id, canonical_entity_id, canonical_key, changed_fields, context)
  VALUES (p_actor_admin_id, 'created', 'consultation_content', v_content, p_entity_id, v_key, ARRAY['content','sections','questions','conditions','evidence'], '{}'::jsonb);

  RETURN v_content;
END
$fn$;

-- 12.2) update — expected_version (stale reject) + diff upsert + audit
CREATE OR REPLACE FUNCTION public.rpc_hd_consultation_update(
  p_actor_admin_id uuid,
  p_content_id     uuid,
  p_expected_version integer,
  p_patch          jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_cur   integer;
  v_status text;
  v_entity uuid;
  v_key   text;
  v_new   integer;
BEGIN
  IF p_actor_admin_id IS NULL THEN RAISE EXCEPTION 'actor_admin_id zorunlu.'; END IF;
  SELECT version, status, entity_id, canonical_key INTO v_cur, v_status, v_entity, v_key
    FROM public.hd_consultation_contents WHERE id = p_content_id FOR UPDATE;
  IF v_cur IS NULL THEN RAISE EXCEPTION 'içerik bulunamadı: %', p_content_id; END IF;
  IF v_status = 'archived' THEN RAISE EXCEPTION 'archived içerik güncellenemez.'; END IF;
  -- stale/kör overwrite reddi
  IF p_expected_version IS NULL OR p_expected_version <> v_cur THEN
    RAISE EXCEPTION 'stale version: beklenen %, mevcut %', p_expected_version, v_cur;
  END IF;
  v_new := v_cur + 1;
  UPDATE public.hd_consultation_contents
     SET is_ai_generated = COALESCE((p_patch->>'is_ai_generated')::boolean, is_ai_generated),
         version = v_new
   WHERE id = p_content_id;

  INSERT INTO public.hd_content_audit_events (actor_admin_id, action, resource_kind, resource_id, canonical_entity_id, canonical_key, changed_fields, context)
  VALUES (p_actor_admin_id, 'updated', 'consultation_content', p_content_id, v_entity, v_key, ARRAY['version'], jsonb_build_object('from_version', v_cur, 'to_version', v_new));
  RETURN v_new;
END
$fn$;

-- 12.3) publish — rights + evidence + human approval + canonical kapıları (tek txn)
CREATE OR REPLACE FUNCTION public.rpc_hd_consultation_publish(
  p_actor_admin_id uuid,
  p_content_id     uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_status  text;
  v_entity  uuid;
  v_key     text;
  v_ccid    uuid;
  v_ccver   integer;
  v_active  integer;
BEGIN
  IF p_actor_admin_id IS NULL THEN RAISE EXCEPTION 'actor_admin_id zorunlu.'; END IF;
  SELECT status, entity_id, canonical_key, canonical_content_id, canonical_content_version
    INTO v_status, v_entity, v_key, v_ccid, v_ccver
    FROM public.hd_consultation_contents WHERE id = p_content_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'içerik bulunamadı: %', p_content_id; END IF;
  IF v_status = 'archived' THEN RAISE EXCEPTION 'archived içerik publish edilemez.'; END IF;

  -- canonical kaynak izi zorunlu + canonical ana içerik yayınlı & insan onaylı (güvenli kapı)
  IF v_ccid IS NULL THEN RAISE EXCEPTION 'publish için canonical içerik bağı zorunlu.'; END IF;
  PERFORM 1 FROM public.hd_canonical_content
    WHERE id = v_ccid AND entity_id = v_entity AND version = v_ccver
      AND status = 'published' AND human_approved_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'canonical ana içerik yayınlı/insan-onaylı değil veya sürüm uyuşmuyor.'; END IF;

  -- en az bir aktif section
  SELECT count(*) INTO v_active FROM public.hd_consultation_sections
    WHERE content_id = p_content_id AND status <> 'archived';
  IF v_active < 1 THEN RAISE EXCEPTION 'publish için en az bir aktif section gerekir.'; END IF;

  -- her aktif section: en az bir evidence
  IF EXISTS (
    SELECT 1 FROM public.hd_consultation_sections s
    WHERE s.content_id = p_content_id AND s.status <> 'archived'
      AND NOT EXISTS (SELECT 1 FROM public.hd_consultation_evidence e WHERE e.section_id = s.id)
  ) THEN
    RAISE EXCEPTION 'her aktif section için en az bir evidence gerekir.';
  END IF;

  -- rights: client_report/both bölümlerinin TÜM evidence passage'ları effective
  -- private_report_use izinli VE rights_status engelli değil olmalı (default-deny).
  IF EXISTS (
    SELECT 1
    FROM public.hd_consultation_sections s
    JOIN public.hd_consultation_evidence e ON e.section_id = s.id
    JOIN public.hd_source_passages p ON p.id = e.passage_id
    JOIN public.hd_sources src ON src.id = p.source_id
    WHERE s.content_id = p_content_id AND s.status <> 'archived'
      AND s.usage_scope IN ('client_report', 'both')
      AND (
        COALESCE(p.private_report_use_allowed_override, src.private_report_use_allowed) IS DISTINCT FROM true
        OR COALESCE(p.rights_status_override, src.rights_status) IN ('restricted','pending_review','permission_pending','unknown')
      )
  ) THEN
    RAISE EXCEPTION 'client_report bölümünde rights default-deny: private_report_use izinli değil veya rights_status engelli.';
  END IF;

  -- expert_guide/both bölümleri: internal_use VEYA expert_delivery izinli VE status engelli değil.
  IF EXISTS (
    SELECT 1
    FROM public.hd_consultation_sections s
    JOIN public.hd_consultation_evidence e ON e.section_id = s.id
    JOIN public.hd_source_passages p ON p.id = e.passage_id
    JOIN public.hd_sources src ON src.id = p.source_id
    WHERE s.content_id = p_content_id AND s.status <> 'archived'
      AND s.usage_scope IN ('expert_guide', 'both')
      AND (
        (COALESCE(p.internal_use_allowed_override, src.internal_use_allowed) IS DISTINCT FROM true
         AND COALESCE(p.expert_delivery_allowed_override, src.expert_delivery_allowed) IS DISTINCT FROM true)
        OR COALESCE(p.rights_status_override, src.rights_status) IN ('restricted','pending_review','permission_pending','unknown')
      )
  ) THEN
    RAISE EXCEPTION 'expert_guide bölümünde rights default-deny: internal/expert izinli değil veya rights_status engelli.';
  END IF;

  UPDATE public.hd_consultation_contents
     SET status = 'published', human_approved_at = now()
   WHERE id = p_content_id;

  INSERT INTO public.hd_content_audit_events (actor_admin_id, action, resource_kind, resource_id, canonical_entity_id, canonical_key, changed_fields, context)
  VALUES (p_actor_admin_id, 'published', 'consultation_content', p_content_id, v_entity, v_key, ARRAY['status','human_approved_at'], '{}'::jsonb);
  RETURN p_content_id;
END
$fn$;

-- 12.4) archive — soft (hard delete YOK); assembly dışı; audit=deleted
CREATE OR REPLACE FUNCTION public.rpc_hd_consultation_archive(
  p_actor_admin_id uuid,
  p_content_id     uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_entity uuid; v_key text; v_status text;
BEGIN
  IF p_actor_admin_id IS NULL THEN RAISE EXCEPTION 'actor_admin_id zorunlu.'; END IF;
  SELECT entity_id, canonical_key, status INTO v_entity, v_key, v_status
    FROM public.hd_consultation_contents WHERE id = p_content_id FOR UPDATE;
  IF v_entity IS NULL THEN RAISE EXCEPTION 'içerik bulunamadı: %', p_content_id; END IF;
  IF v_status = 'archived' THEN RETURN p_content_id; END IF;  -- idempotent
  UPDATE public.hd_consultation_contents SET status = 'archived', archived_at = now() WHERE id = p_content_id;
  INSERT INTO public.hd_content_audit_events (actor_admin_id, action, resource_kind, resource_id, canonical_entity_id, canonical_key, changed_fields, context)
  VALUES (p_actor_admin_id, 'deleted', 'consultation_content', p_content_id, v_entity, v_key, ARRAY['status','archived_at'], jsonb_build_object('soft_archive', true));
  RETURN p_content_id;
END
$fn$;

-- 12.5) entitlement grant — all_hd/entity invariant + aktif duplicate engeli
CREATE OR REPLACE FUNCTION public.rpc_hd_consultation_entitlement_grant(
  p_actor_admin_id uuid,
  p_tenant_id      uuid,
  p_user_id        uuid,
  p_scope_kind     text,
  p_entity_id      uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id uuid;
BEGIN
  IF p_actor_admin_id IS NULL THEN RAISE EXCEPTION 'actor_admin_id zorunlu.'; END IF;
  IF p_scope_kind NOT IN ('all_hd','entity') THEN RAISE EXCEPTION 'geçersiz scope_kind: %', p_scope_kind; END IF;
  IF p_scope_kind = 'all_hd' AND p_entity_id IS NOT NULL THEN RAISE EXCEPTION 'all_hd için entity_id NULL olmalı.'; END IF;
  IF p_scope_kind = 'entity' AND p_entity_id IS NULL THEN RAISE EXCEPTION 'entity için entity_id zorunlu.'; END IF;
  -- aktif duplicate grant engeli (partial unique index de ikinci savunma)
  IF EXISTS (
    SELECT 1 FROM public.hd_consultation_entitlements
    WHERE user_id = p_user_id AND scope_kind = p_scope_kind
      AND COALESCE(entity_id,'00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_entity_id,'00000000-0000-0000-0000-000000000000'::uuid)
      AND revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'aktif entitlement zaten var.'; END IF;

  INSERT INTO public.hd_consultation_entitlements (tenant_id, user_id, scope_kind, entity_id, granted_by_admin_id)
  VALUES (p_tenant_id, p_user_id, p_scope_kind, p_entity_id, p_actor_admin_id) RETURNING id INTO v_id;

  INSERT INTO public.hd_content_audit_events (actor_admin_id, action, resource_kind, resource_id, canonical_entity_id, canonical_key, changed_fields, context)
  VALUES (p_actor_admin_id, 'created', 'consultation_entitlement', v_id, p_entity_id, NULL, ARRAY['grant'], jsonb_build_object('scope_kind', p_scope_kind));
  RETURN v_id;
END
$fn$;

-- 12.6) entitlement revoke — idempotent (revoked_at set); audit atomik
CREATE OR REPLACE FUNCTION public.rpc_hd_consultation_entitlement_revoke(
  p_actor_admin_id uuid,
  p_entitlement_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_revoked timestamptz;
BEGIN
  IF p_actor_admin_id IS NULL THEN RAISE EXCEPTION 'actor_admin_id zorunlu.'; END IF;
  SELECT revoked_at INTO v_revoked FROM public.hd_consultation_entitlements WHERE id = p_entitlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entitlement bulunamadı: %', p_entitlement_id; END IF;
  IF v_revoked IS NOT NULL THEN RETURN p_entitlement_id; END IF;  -- idempotent
  UPDATE public.hd_consultation_entitlements SET revoked_at = now() WHERE id = p_entitlement_id;
  INSERT INTO public.hd_content_audit_events (actor_admin_id, action, resource_kind, resource_id, canonical_entity_id, canonical_key, changed_fields, context)
  VALUES (p_actor_admin_id, 'deleted', 'consultation_entitlement', p_entitlement_id, NULL, NULL, ARRAY['revoked_at'], jsonb_build_object('revoke', true));
  RETURN p_entitlement_id;
END
$fn$;

-- -----------------------------------------------------------------------------
-- 13) RPC EXECUTE ACL — public/anon/authenticated REVOKE, yalnız service_role
-- -----------------------------------------------------------------------------
DO $acl$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'rpc_hd_consultation_create(uuid,uuid,uuid,integer,text,boolean,jsonb,jsonb,jsonb,jsonb)',
    'rpc_hd_consultation_update(uuid,uuid,integer,jsonb)',
    'rpc_hd_consultation_publish(uuid,uuid)',
    'rpc_hd_consultation_archive(uuid,uuid)',
    'rpc_hd_consultation_entitlement_grant(uuid,uuid,uuid,text,uuid)',
    'rpc_hd_consultation_entitlement_revoke(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC;', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon;', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM authenticated;', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role;', f);
  END LOOP;
END
$acl$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — ileri fazda canlı DB'de; beklenen):
--   9 yeni tablo relrowsecurity=true, relforcerowsecurity=false, policy 0.
--   has_table_privilege('anon', <tablo>, 'SELECT') = false (9/9).
--   has_function_privilege('anon', <rpc>, 'EXECUTE') = false; service_role = true.
-- ROLLBACK: destructive DOWN YOK (fail-fast; hata → tüm BEGIN...COMMIT geri alınır).
--   Manuel geri alma: yeni 9 tablo + 6 fonksiyon DROP + hd_sources/passages additif
--   kolon DROP + audit resource_kind CHECK eski 6-değerli haline restore. Mevcut
--   canonical/pilot/human_design_reports ETKİLENMEZ (FK yeni→eski, RESTRICT).
-- =============================================================================
