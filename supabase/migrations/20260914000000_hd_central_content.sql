-- =============================================================================
-- 20260914000000_hd_central_content.sql
--
-- HUMAN DESIGN — FAZ-2 · MERKEZÎ İÇERİK / SADIK ÇEVİRİ / EVIDENCE + HD-ÖZEL AUDIT
--
-- AMAÇ (tenant'sız, born-locked, admin-only):
--   Gerçek HD içeriğinin Admin Panelinden girilebilmesi için merkezî içerik
--   tabakasını kurar. YALNIZ altyapı; bu migration İÇERİK SEED ETMEZ (Manifestör
--   pilotu yok). Erişim yalnız verifyAdminRequest → server-only → service_role.
--
-- FİZİKSEL NESNELER:
--   1) public.hd_source_passages           — additif kolon: source_specific_note
--   2) public.hd_faithful_translations      — sadık TR çeviri (özgün-metin sürümüne pin)
--   3) public.hd_canonical_content          — Kaynaklandırılmış Ana Metin + tür alanları
--   4) public.hd_content_evidence           — içerik ↔ kaynak pasajı kanıt bağı
--   5) public.hd_content_audit_events        — HD'ye özel append-only audit (Seçenek B)
--
-- KATMAN AYRIMI (bağlayıcı):
--   * Kaynağa Özgü Not (pasaj-genel) = hd_source_passages.source_specific_note
--     — hd_source_passages.rights_note (hak notu) ile KARIŞTIRILMAZ.
--   * İçerik-pasaj ilişkisine özgü not = hd_content_evidence.editorial_note.
--   * Uzman Notu bu tabakada YOK (tenant/overlay katmanına aittir).
--
-- GERÇEK SİLME (ürün kararı): içerik/kaynak/çeviri/evidence gerçekten silinebilir
--   (service_role DELETE açık). CANONICAL KİMLİK tabloları (hd_canonical_entities +
--   4 extension) KALICIDIR — bu migration onlara DOKUNMAZ, DELETE kapalı kalır.
--   Bağımlı kaynak/pasaj/özgün-metin FK ON DELETE RESTRICT ile korunur (kullanımdayken
--   silinemez → server katmanı 409). Yalnız content→evidence ON DELETE CASCADE.
--
-- AUDIT (Seçenek B — HD'ye özel, append-only): public.hd_content_audit_events.
--   Paylaşılan public.admin_audit_log / lib/admin/adminAudit.ts DEĞİŞTİRİLMEZ.
--   actor_admin_id'ye users FK YOK; resource_id'ye içerik tablolarına FK YOK
--   (silme sonrası audit geçmişi KALIR). service_role yalnız SELECT/INSERT
--   (UPDATE/DELETE/TRUNCATE YOK → append-only). Tam metin (özgün/çeviri/rapor)
--   audit'e YAZILMAZ (yalnız UUID/key/status/hash/changed_fields/kısa kod).
--
-- GÜVENLİK: yeni içerik tabloları RLS ENABLE (FORCE yok, policy 0),
--   PUBLIC/anon/authenticated REVOKE ALL, service_role REVOKE-ALL-ÖNCE → allowlist.
--   İçerik/kaynak tabloları: S/I/U/D. Audit tablosu: yalnız S/I.
--
-- ATOMİKLİK: tek BEGIN;...COMMIT;. Fail-fast: düz CREATE (IF NOT EXISTS content
--   tablolarında yok; yalnız additif kolonda IF NOT EXISTS), DO/EXCEPTION yok,
--   ON CONFLICT yok, ENUM yok (text+CHECK), destructive DOWN yok, SEED yok.
--   Ortak public.set_updated_at() yalnız REUSE (yeniden tanımlanmaz).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) hd_source_passages — additif: source_specific_note (rights_note DEĞİL)
-- -----------------------------------------------------------------------------
ALTER TABLE public.hd_source_passages
  ADD COLUMN IF NOT EXISTS source_specific_note text;

COMMENT ON COLUMN public.hd_source_passages.source_specific_note IS
  'Kaynağa Özgü Not (pasaj-genel editöryal not). rights_note (hak/telif notu) ile KARIŞTIRILMAZ. İçerik-pasaj ilişkisine özgü not için hd_content_evidence.editorial_note kullanılır.';

-- -----------------------------------------------------------------------------
-- 2) public.hd_faithful_translations — sadık TR çeviri (özgün-metin sürümüne pin)
--    hd_original_texts version-pin anahtarı: UNIQUE (id, content_hash,
--    language_tag, script_code) → composite FK ile birebir pinlenir.
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_faithful_translations (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  original_text_id            uuid        NOT NULL,
  source_content_hash         text        NOT NULL,
  source_language_tag         text        NOT NULL,
  source_script_code          text        NOT NULL,
  target_language_tag         text        NOT NULL DEFAULT 'tr',
  translation_text            text        NOT NULL,
  translation_hash            text        NOT NULL,
  status                      text        NOT NULL DEFAULT 'draft',
  revision                    integer     NOT NULL DEFAULT 1,
  supersedes_translation_id   uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_faithful_translations_status_chk
    CHECK (status IN ('draft', 'verified', 'archived')),
  CONSTRAINT hd_faithful_translations_target_lang_chk
    CHECK (target_language_tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT hd_faithful_translations_source_lang_chk
    CHECK (source_language_tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT hd_faithful_translations_source_script_chk
    CHECK (source_script_code ~ '^[A-Z][a-z]{3}$'),
  CONSTRAINT hd_faithful_translations_source_hash_chk
    CHECK (source_content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT hd_faithful_translations_translation_hash_chk
    CHECK (translation_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT hd_faithful_translations_translation_text_chk
    CHECK (btrim(translation_text) <> ''),
  CONSTRAINT hd_faithful_translations_revision_chk
    CHECK (revision > 0),
  CONSTRAINT hd_faithful_translations_supersedes_not_self_chk
    CHECK (supersedes_translation_id IS NULL OR supersedes_translation_id <> id),
  CONSTRAINT hd_faithful_translations_revision_supersedes_chk
    CHECK ((revision = 1 AND supersedes_translation_id IS NULL)
           OR (revision > 1 AND supersedes_translation_id IS NOT NULL)),

  -- Özgün-metin SÜRÜMÜNE composite pin (hash/dil/script birlikte → bayat çeviri tespiti).
  CONSTRAINT hd_faithful_translations_original_pin_fk
    FOREIGN KEY (original_text_id, source_content_hash, source_language_tag, source_script_code)
    REFERENCES public.hd_original_texts (id, content_hash, language_tag, script_code)
    ON DELETE RESTRICT,
  CONSTRAINT hd_faithful_translations_supersedes_fk
    FOREIGN KEY (supersedes_translation_id)
    REFERENCES public.hd_faithful_translations (id) ON DELETE RESTRICT,

  -- Aynı özgün metin + hedef dil için revision tekilliği.
  CONSTRAINT hd_faithful_translations_revision_key
    UNIQUE (original_text_id, target_language_tag, revision)
);

-- Aynı özgün metin + hedef dil için EN FAZLA BİR verified (current) çeviri.
CREATE UNIQUE INDEX hd_faithful_translations_one_verified_uidx
  ON public.hd_faithful_translations (original_text_id, target_language_tag)
  WHERE status = 'verified';

CREATE INDEX hd_faithful_translations_original_idx
  ON public.hd_faithful_translations (original_text_id);
CREATE INDEX hd_faithful_translations_status_idx
  ON public.hd_faithful_translations (status);
CREATE INDEX hd_faithful_translations_supersedes_idx
  ON public.hd_faithful_translations (supersedes_translation_id);

CREATE TRIGGER trg_hd_faithful_translations_updated_at
  BEFORE UPDATE ON public.hd_faithful_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hd_faithful_translations IS
  'HD-2D2 sadık TR çeviri (born-locked). Belirli hd_original_texts SÜRÜMÜNE composite FK ile pinlenir; özgün metin değişince hash değişir → bayat çeviri. Hak izni kaynak (hd_sources) haklarından server publish kapısında çözülür.';

-- -----------------------------------------------------------------------------
-- 3) public.hd_canonical_content — Kaynaklandırılmış Ana Metin + tür alanları
--    Entity başına TEK içerik kaydı (UNIQUE entity_id). Canonical kimlik/tür/anahtar
--    uyumu composite FK ile DB-garantili (ON DELETE RESTRICT).
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_canonical_content (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           uuid        NOT NULL,
  entity_kind         text        NOT NULL,
  canonical_key       text        NOT NULL,

  general_description text        NOT NULL DEFAULT '',
  report_text         text        NOT NULL DEFAULT '',
  status              text        NOT NULL DEFAULT 'draft',
  version             integer     NOT NULL DEFAULT 1,
  is_ai_generated     boolean     NOT NULL DEFAULT false,
  human_approved_at   timestamptz,

  -- Tip alanları
  strategy_text       text,
  signature_text      text,
  not_self_text       text,
  -- Otorite alanları
  decision_mechanism  text,
  application_text    text,
  caution_notes       text,
  -- Kapı alanı
  general_theme       text,
  -- Kanal alanları
  full_channel_text   text,
  hanging_gate_context text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_canonical_content_entity_kind_chk
    CHECK (entity_kind IN ('tip', 'otorite', 'kapi', 'kanal')),
  CONSTRAINT hd_canonical_content_status_chk
    CHECK (status IN ('draft', 'published')),
  CONSTRAINT hd_canonical_content_version_chk
    CHECK (version > 0),

  -- Entity başına tek içerik.
  CONSTRAINT hd_canonical_content_entity_id_key UNIQUE (entity_id),

  -- Canonical kimlik + tür + anahtar uyumu (composite FK; ON DELETE RESTRICT).
  CONSTRAINT hd_canonical_content_entity_fk
    FOREIGN KEY (entity_id, entity_kind, canonical_key)
    REFERENCES public.hd_canonical_entities (id, entity_kind, canonical_key)
    ON DELETE RESTRICT,

  -- Tür DIŞI alanların dolmasını engelle (her tür yalnız kendi alanlarını taşır).
  CONSTRAINT hd_canonical_content_type_fields_exclusive_chk CHECK (
    (entity_kind = 'tip'     AND decision_mechanism IS NULL AND application_text IS NULL AND caution_notes IS NULL AND general_theme IS NULL AND full_channel_text IS NULL AND hanging_gate_context IS NULL)
    OR (entity_kind = 'otorite' AND strategy_text IS NULL AND signature_text IS NULL AND not_self_text IS NULL AND general_theme IS NULL AND full_channel_text IS NULL AND hanging_gate_context IS NULL)
    OR (entity_kind = 'kapi'    AND strategy_text IS NULL AND signature_text IS NULL AND not_self_text IS NULL AND decision_mechanism IS NULL AND application_text IS NULL AND caution_notes IS NULL AND full_channel_text IS NULL AND hanging_gate_context IS NULL)
    OR (entity_kind = 'kanal'   AND strategy_text IS NULL AND signature_text IS NULL AND not_self_text IS NULL AND decision_mechanism IS NULL AND application_text IS NULL AND caution_notes IS NULL AND general_theme IS NULL)
  ),

  -- Published ortak + tür bazlı zorunlu alan kontrolü (draft gevşek).
  CONSTRAINT hd_canonical_content_published_common_chk CHECK (
    status <> 'published'
    OR (btrim(general_description) <> '' AND btrim(report_text) <> '' AND human_approved_at IS NOT NULL)
  ),
  CONSTRAINT hd_canonical_content_published_typed_chk CHECK (
    status <> 'published'
    OR (entity_kind = 'tip'     AND btrim(coalesce(strategy_text, '')) <> '')
    OR (entity_kind = 'otorite' AND btrim(coalesce(decision_mechanism, '')) <> '')
    OR (entity_kind = 'kapi'    AND btrim(coalesce(general_theme, '')) <> '')
    OR (entity_kind = 'kanal'   AND btrim(coalesce(full_channel_text, '')) <> '')
  )
);

CREATE INDEX hd_canonical_content_status_idx
  ON public.hd_canonical_content (status);
CREATE INDEX hd_canonical_content_entity_kind_idx
  ON public.hd_canonical_content (entity_kind);

CREATE TRIGGER trg_hd_canonical_content_updated_at
  BEFORE UPDATE ON public.hd_canonical_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hd_canonical_content IS
  'HD-2D3 merkezî Kaynaklandırılmış Ana Metin (report_text) + genel açıklama + tür alanları (born-locked). Entity başına tek kayıt; canonical kimlik composite FK ON DELETE RESTRICT. Uzman Notu YOK. tenant_id YOK.';
COMMENT ON COLUMN public.hd_canonical_content.report_text IS
  'Kaynaklandırılmış Ana Metin (kullanıcı etiketi). Özet değildir; her önemli ifadesi hd_content_evidence ile kaynağa izlenebilir olmalıdır.';

-- -----------------------------------------------------------------------------
-- 4) public.hd_content_evidence — içerik ↔ kaynak pasajı kanıt bağı
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_content_evidence (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id       uuid        NOT NULL,
  passage_id       uuid        NOT NULL,
  relation_type    text        NOT NULL,
  is_primary       boolean     NOT NULL DEFAULT false,
  is_single_source boolean     NOT NULL DEFAULT false,
  sort_order       integer     NOT NULL DEFAULT 0,
  editorial_note   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_content_evidence_relation_type_chk
    CHECK (relation_type IN ('supports', 'contradicts', 'school_specific', 'background')),
  CONSTRAINT hd_content_evidence_sort_order_chk
    CHECK (sort_order >= 0),

  CONSTRAINT hd_content_evidence_content_fk
    FOREIGN KEY (content_id) REFERENCES public.hd_canonical_content (id) ON DELETE CASCADE,
  CONSTRAINT hd_content_evidence_passage_fk
    FOREIGN KEY (passage_id) REFERENCES public.hd_source_passages (id) ON DELETE RESTRICT,

  CONSTRAINT hd_content_evidence_content_passage_key
    UNIQUE (content_id, passage_id)
);

CREATE INDEX hd_content_evidence_content_idx
  ON public.hd_content_evidence (content_id);
CREATE INDEX hd_content_evidence_passage_idx
  ON public.hd_content_evidence (passage_id);

CREATE TRIGGER trg_hd_content_evidence_updated_at
  BEFORE UPDATE ON public.hd_content_evidence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hd_content_evidence IS
  'HD-2D3 içerik ↔ kaynak pasajı kanıt bağı (born-locked). relation_type: supports/contradicts/school_specific/background (anayasa: çelişki korunur, ortalanmaz). is_single_source: tek-kaynak işareti (silinmez, işaretlenir). editorial_note = ilişkiye özgü not (pasaj-genel source_specific_note ile karıştırılmaz).';

-- -----------------------------------------------------------------------------
-- 5) public.hd_content_audit_events — HD'ye özel APPEND-ONLY audit (Seçenek B)
--    users FK YOK; içerik tablolarına FK YOK (silme sonrası geçmiş kalır).
--    canonical_entity_id: silinemez registry'ye ON DELETE RESTRICT (kimlik kalıcı).
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_content_audit_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_admin_id      uuid        NOT NULL,
  action              text        NOT NULL,
  resource_kind       text        NOT NULL,
  resource_id         uuid        NOT NULL,
  canonical_entity_id uuid,
  canonical_key       text,
  changed_fields      text[]      NOT NULL DEFAULT '{}'::text[],
  context             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_content_audit_action_chk
    CHECK (action IN ('created', 'updated', 'deleted', 'published')),
  CONSTRAINT hd_content_audit_resource_kind_chk
    CHECK (resource_kind IN (
      'canonical_content', 'source', 'source_passage',
      'original_text', 'faithful_translation', 'content_evidence'
    )),
  CONSTRAINT hd_content_audit_changed_fields_no_null_chk
    CHECK (cardinality(changed_fields) = cardinality(array_remove(changed_fields, NULL))),
  CONSTRAINT hd_content_audit_context_obj_chk
    CHECK (jsonb_typeof(context) = 'object'),

  -- canonical_entity_id snapshot değil; silinemez registry'ye RESTRICT bağ.
  CONSTRAINT hd_content_audit_canonical_entity_fk
    FOREIGN KEY (canonical_entity_id)
    REFERENCES public.hd_canonical_entities (id) ON DELETE RESTRICT
);

CREATE INDEX hd_content_audit_actor_idx
  ON public.hd_content_audit_events (actor_admin_id, created_at DESC);
CREATE INDEX hd_content_audit_resource_idx
  ON public.hd_content_audit_events (resource_kind, resource_id, created_at DESC);
CREATE INDEX hd_content_audit_action_idx
  ON public.hd_content_audit_events (action, created_at DESC);

-- APPEND-ONLY: updated_at YOK, update trigger YOK.

COMMENT ON TABLE public.hd_content_audit_events IS
  'HD-2D4 HD''ye özel APPEND-ONLY audit (Seçenek B). Paylaşılan admin_audit_log''dan AYRI. actor_admin_id''ye users FK YOK; resource_id''ye içerik tablolarına FK YOK (silme sonrası geçmiş kalır). service_role yalnız SELECT/INSERT (UPDATE/DELETE YOK). Tam metin (özgün/çeviri/rapor) TUTULMAZ.';

-- -----------------------------------------------------------------------------
-- 6) BORN-LOCKED RLS + GRANT
--    İçerik/kaynak tabloları: service_role S/I/U/D. Audit: yalnız S/I.
--    Her tabloda REVOKE (PUBLIC/anon/authenticated + service_role) → GRANT.
-- -----------------------------------------------------------------------------

-- 6.1) Yeni içerik tabloları — S/I/U/D
ALTER TABLE public.hd_faithful_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_faithful_translations FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_faithful_translations FROM anon;
REVOKE ALL ON TABLE public.hd_faithful_translations FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hd_faithful_translations FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hd_faithful_translations TO service_role;

ALTER TABLE public.hd_canonical_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_canonical_content FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_canonical_content FROM anon;
REVOKE ALL ON TABLE public.hd_canonical_content FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hd_canonical_content FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hd_canonical_content TO service_role;

ALTER TABLE public.hd_content_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_content_evidence FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_content_evidence FROM anon;
REVOKE ALL ON TABLE public.hd_content_evidence FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hd_content_evidence FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hd_content_evidence TO service_role;

-- 6.2) Append-only audit — yalnız S/I (UPDATE/DELETE YOK)
ALTER TABLE public.hd_content_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_content_audit_events FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_content_audit_events FROM anon;
REVOKE ALL ON TABLE public.hd_content_audit_events FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hd_content_audit_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.hd_content_audit_events TO service_role;

-- 6.3) Mevcut kaynak tablolarında gerçek silme için service_role'a DELETE ekle
--     (REVOKE-önce-GRANT; RLS/policy/anon/authenticated'e dokunulmaz).
REVOKE ALL PRIVILEGES ON TABLE public.hd_sources FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hd_sources TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.hd_source_passages FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hd_source_passages TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.hd_original_texts FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hd_original_texts TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — ileri turda; beklenen):
--   3 yeni içerik tablosu + 1 audit tablosu mevcut; hd_source_passages'a
--   source_specific_note eklendi. RLS=true/FORCE=false/policy=0 (4 tablo).
--   service_role: içerik/kaynak tabloları S/I/U/D; audit yalnız S/I.
--   canonical kimlik tabloları DEĞİŞMEDİ (DELETE kapalı). Tüm içerik tabloları 0 satır.
-- ROLLBACK: destructive DOWN YOK (fail-fast; hata → tüm BEGIN...COMMIT geri alınır).
-- =============================================================================
