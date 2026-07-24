-- =============================================================================
-- 20260807000000_hd_canonical_store.sql
--
-- HUMAN DESIGN — HD-2C · ADMIN CANONICAL STORE (born-locked, tenant'sız)
--
-- AMAÇ:
--   Profesyonel Human Design Bilgi Sistemi'nin merkezî, tenant'sız canonical
--   KİMLİK iskeletini kurar: ortak registry + dört typed extension tablo.
--   İçerik (açıklama/rapor metni/strateji/kaynak) BU FAZDA YOKTUR — yalnız
--   kanonik kimlik + yapısal alanlar. İçerik ve kaynak katmanları sonraki
--   fazlarda (HD-2D kaynak/çeviri/editoryal + HD-2F/G/H içerik) fiziksel olarak
--   ayrı kurulur.
--
-- FİZİKSEL MODEL (7):
--   public.hd_canonical_entities        — ortak canonical kimlik registry'si
--   public.hd_canonical_types           — 5 Tip (extension)
--   public.hd_canonical_authorities     — 7 Otorite (extension)
--   public.hd_canonical_gates           — 64 Kapı (extension)
--   public.hd_canonical_channels        — 36 resmî Kanal (extension)
--
-- KİMLİK BÜTÜNLÜĞÜ (trigger YOK):
--   Extension'larda entity_kind ve canonical_key GENERATED ALWAYS ... STORED'dır;
--   composite FK (entity_id, entity_kind, canonical_key) → registry(id,
--   entity_kind, canonical_key) ON DELETE RESTRICT ile her extension yalnız
--   KENDİ türündeki registry satırına bağlanabilir. canonical_key↔typed identity
--   uyumu GENERATED + UNIQUE ile DB-garantilidir (uygulama katmanına bırakılmaz).
--
-- STRATEJİ: ayrı entity/tablo/anahtar DEĞİLDİR — ileride Tip'e bağlı içerik alanı.
-- KAPI ÇİZGİSİ (line): bu fazda YOKTUR (kolon/tablo/seed yok).
-- MERKEZ: ayrı tablo YOK; dokuz merkez kodu CHECK ile korunur. gate→center ve
--   channel→center EŞLEMESİ repo'da yalnız FROZEN engine'de FARKLI bir merkez
--   sözlüğüyle (Head/G/Heart/SolarPlexus) bulunduğundan ve HdCenterCode
--   (head/g_identity/heart_ego/solar_plexus) sözlüğüne köprü uydurulmadığından
--   center_key/center_a/center_b bu seed'de NULL bırakılır (kaynak yoksa NULL).
--   opposite_gate_number ve circuit_key için de repo'da açık eşleme yok → NULL.
--
-- GÜVENLİK (born-locked): beş tablo da RLS ENABLE (FORCE YOK, policy 0),
--   PUBLIC/anon/authenticated REVOKE ALL, service_role yalnız SELECT/INSERT/UPDATE
--   (DELETE YOK). Erişim yalnız gelecekte verifyAdminRequest → server-only route
--   → service_role zincirinden olacaktır. Uzman erişimi HD-2I entitlement'a kadar YOK.
--
-- ATOMİKLİK: tek dosya, açık BEGIN;...COMMIT; (repo precedent:
--   20260726000000_lock_human_design_tables_anon.sql). Fail-fast: düz CREATE
--   (IF NOT EXISTS YOK), DO/EXCEPTION YOK, ON CONFLICT YOK, ENUM YOK (text+CHECK),
--   destructive DOWN YOK. Hata halinde tüm HD-2C yapıları geri alınır.
--
-- MEVCUT YAPILARA DOKUNULMAZ: human_design_clients/charts/reports/
--   knowledge_records/knowledge (legacy) ve diğer modül tabloları bu migration'da
--   ALTER/DROP/RENAME/GRANT/REVOKE/INSERT edilmez. Ortak public.set_updated_at()
--   yalnız trigger'da REUSE edilir (yeniden tanımlanmaz).
--
-- SEED değerleri lib/human-design/constants.ts (HUMAN_DESIGN_TYPES/AUTHORITIES/
--   CHANNELS) ile BİREBİR; scripts/hd2c-canonical-store-migration-check.mjs
--   statik olarak doğrular.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) ORTAK REGISTRY — public.hd_canonical_entities
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_canonical_entities (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind    text        NOT NULL,
  canonical_key  text        NOT NULL,
  name_tr        text        NOT NULL,
  name_original  text,
  status         text        NOT NULL DEFAULT 'draft',
  version        integer     NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hd_canonical_entities_entity_kind_check
    CHECK (entity_kind IN ('tip', 'otorite', 'kapi', 'kanal')),
  CONSTRAINT hd_canonical_entities_status_check
    CHECK (status IN ('draft', 'published')),
  CONSTRAINT hd_canonical_entities_version_check
    CHECK (version > 0),
  CONSTRAINT hd_canonical_entities_canonical_key_notblank_check
    CHECK (btrim(canonical_key) <> ''),
  CONSTRAINT hd_canonical_entities_name_tr_notblank_check
    CHECK (btrim(name_tr) <> ''),

  -- Global kanonik kimlik tekilliği.
  CONSTRAINT hd_canonical_entities_canonical_key_key
    UNIQUE (canonical_key),
  -- Composite FK hedefi: extension'ların (id, entity_kind, canonical_key) bağı.
  CONSTRAINT hd_canonical_entities_id_kind_key_key
    UNIQUE (id, entity_kind, canonical_key)
);

CREATE INDEX hd_canonical_entities_status_idx
  ON public.hd_canonical_entities (status);
CREATE INDEX hd_canonical_entities_entity_kind_idx
  ON public.hd_canonical_entities (entity_kind);

-- updated_at trigger — ortak public.set_updated_at() yalnız REUSE.
CREATE TRIGGER trg_hd_canonical_entities_updated_at
  BEFORE UPDATE ON public.hd_canonical_entities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.hd_canonical_entities IS
  'HD-2C ortak canonical kimlik registry''si (tenant''sız, born-locked). Tip/Otorite/Kapı/Kanal için stabil kimlik + ad + status + version. İçerik/kaynak alanı YOK.';
COMMENT ON COLUMN public.hd_canonical_entities.entity_kind IS
  'tip | otorite | kapi | kanal (CHECK). Extension türünü belirler.';
COMMENT ON COLUMN public.hd_canonical_entities.canonical_key IS
  'HD-2B canonical anahtar (global UNIQUE). Extension GENERATED canonical_key ile birebir eşleşir.';
COMMENT ON COLUMN public.hd_canonical_entities.status IS
  'Yalnız draft | published (HD-2B sözleşmesi). published geçişi ileride server-side.';
COMMENT ON COLUMN public.hd_canonical_entities.version IS
  'Pozitif tam sayı; içerik revizyonu. Otomatik artış trigger''ı YOK (ileride server sorumluluğu).';

-- -----------------------------------------------------------------------------
-- 2) TIP EXTENSION — public.hd_canonical_types (5)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_canonical_types (
  entity_id     uuid PRIMARY KEY,
  type_code     text NOT NULL,
  entity_kind   text GENERATED ALWAYS AS ('tip') STORED,
  canonical_key text GENERATED ALWAYS AS ('tip_' || type_code) STORED,

  CONSTRAINT hd_canonical_types_type_code_check
    CHECK (type_code IN ('generator', 'manifesting_generator', 'projector', 'manifestor', 'reflector')),
  CONSTRAINT hd_canonical_types_type_code_key
    UNIQUE (type_code),
  CONSTRAINT hd_canonical_types_canonical_key_key
    UNIQUE (canonical_key),
  CONSTRAINT hd_canonical_types_entity_fk
    FOREIGN KEY (entity_id, entity_kind, canonical_key)
    REFERENCES public.hd_canonical_entities (id, entity_kind, canonical_key)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.hd_canonical_types IS
  'HD-2C Tip extension (5). Strateji AYRI entity/tablo DEĞİL; ileride Tip içeriğine bağlanır.';
COMMENT ON COLUMN public.hd_canonical_types.type_code IS
  'HUMAN_DESIGN_TYPES kodu (CHECK, UNIQUE). canonical_key = tip_<type_code> (GENERATED).';

-- -----------------------------------------------------------------------------
-- 3) OTORİTE EXTENSION — public.hd_canonical_authorities (7)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_canonical_authorities (
  entity_id      uuid PRIMARY KEY,
  authority_code text NOT NULL,
  entity_kind    text GENERATED ALWAYS AS ('otorite') STORED,
  canonical_key  text GENERATED ALWAYS AS ('otorite_' || authority_code) STORED,

  CONSTRAINT hd_canonical_authorities_authority_code_check
    CHECK (authority_code IN ('sacral', 'emotional', 'splenic', 'ego_heart', 'self_projected', 'mental_environmental', 'lunar')),
  CONSTRAINT hd_canonical_authorities_authority_code_key
    UNIQUE (authority_code),
  CONSTRAINT hd_canonical_authorities_canonical_key_key
    UNIQUE (canonical_key),
  CONSTRAINT hd_canonical_authorities_entity_fk
    FOREIGN KEY (entity_id, entity_kind, canonical_key)
    REFERENCES public.hd_canonical_entities (id, entity_kind, canonical_key)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.hd_canonical_authorities IS
  'HD-2C Otorite extension (7). canonical_key = otorite_<authority_code> (GENERATED).';
COMMENT ON COLUMN public.hd_canonical_authorities.authority_code IS
  'HUMAN_DESIGN_AUTHORITIES kodu (CHECK, UNIQUE).';

-- -----------------------------------------------------------------------------
-- 4) KAPI EXTENSION — public.hd_canonical_gates (64)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_canonical_gates (
  entity_id            uuid    PRIMARY KEY,
  gate_number          integer NOT NULL,
  entity_kind          text    GENERATED ALWAYS AS ('kapi') STORED,
  canonical_key        text    GENERATED ALWAYS AS ('kapi_' || gate_number::text) STORED,
  center_key           text,
  opposite_gate_number integer,
  circuit_key          text,

  CONSTRAINT hd_canonical_gates_gate_number_check
    CHECK (gate_number BETWEEN 1 AND 64),
  CONSTRAINT hd_canonical_gates_gate_number_key
    UNIQUE (gate_number),
  CONSTRAINT hd_canonical_gates_canonical_key_key
    UNIQUE (canonical_key),
  CONSTRAINT hd_canonical_gates_opposite_check
    CHECK (opposite_gate_number IS NULL
           OR (opposite_gate_number BETWEEN 1 AND 64 AND opposite_gate_number <> gate_number)),
  CONSTRAINT hd_canonical_gates_center_key_check
    CHECK (center_key IS NULL
           OR center_key IN ('head', 'ajna', 'throat', 'g_identity', 'heart_ego', 'solar_plexus', 'sacral', 'spleen', 'root')),
  CONSTRAINT hd_canonical_gates_circuit_key_check
    CHECK (circuit_key IS NULL OR circuit_key IN ('individual', 'tribal', 'collective')),
  CONSTRAINT hd_canonical_gates_entity_fk
    FOREIGN KEY (entity_id, entity_kind, canonical_key)
    REFERENCES public.hd_canonical_entities (id, entity_kind, canonical_key)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.hd_canonical_gates IS
  'HD-2C Kapı extension (64). canonical_key = kapi_<gate_number> (GENERATED). Çizgi (line) alanı/seed YOK. center_key/opposite/circuit repo''da güvenilir eşleme olmadığından NULL.';
COMMENT ON COLUMN public.hd_canonical_gates.gate_number IS
  '1..64 (CHECK, UNIQUE).';
COMMENT ON COLUMN public.hd_canonical_gates.center_key IS
  'NULL veya dokuz HdCenterCode değerinden biri (CHECK). Bu fazda NULL (eşleme HD-2F+).';

-- -----------------------------------------------------------------------------
-- 5) KANAL EXTENSION — public.hd_canonical_channels (36 resmî)
-- -----------------------------------------------------------------------------
CREATE TABLE public.hd_canonical_channels (
  entity_id     uuid    PRIMARY KEY,
  channel_code  text    NOT NULL,
  gate_a        integer NOT NULL,
  gate_b        integer NOT NULL,
  entity_kind   text    GENERATED ALWAYS AS ('kanal') STORED,
  canonical_key text    GENERATED ALWAYS AS ('kanal_' || replace(channel_code, '-', '_')) STORED,
  center_a      text,
  center_b      text,
  circuit_key   text,

  CONSTRAINT hd_canonical_channels_channel_code_check
    CHECK (channel_code IN (
      '1-8','2-14','3-60','4-63','5-15','6-59','7-31','9-52','10-20','10-34',
      '10-57','11-56','12-22','13-33','16-48','17-62','18-58','19-49','20-34','20-57',
      '21-45','23-43','24-61','25-51','26-44','27-50','28-38','29-46','30-41','32-54',
      '34-57','35-36','37-40','39-55','42-53','47-64'
    )),
  CONSTRAINT hd_canonical_channels_channel_code_key
    UNIQUE (channel_code),
  CONSTRAINT hd_canonical_channels_canonical_key_key
    UNIQUE (canonical_key),
  CONSTRAINT hd_canonical_channels_gate_a_check
    CHECK (gate_a BETWEEN 1 AND 64),
  CONSTRAINT hd_canonical_channels_gate_b_check
    CHECK (gate_b BETWEEN 1 AND 64),
  CONSTRAINT hd_canonical_channels_gate_pair_check
    CHECK (gate_a <> gate_b),
  -- channel_code resmî yönünü gate_a/gate_b'ye bağlar (ters yön kümede yok → CHECK ihlali).
  CONSTRAINT hd_canonical_channels_code_pair_check
    CHECK (channel_code = gate_a::text || '-' || gate_b::text),
  CONSTRAINT hd_canonical_channels_center_a_check
    CHECK (center_a IS NULL
           OR center_a IN ('head', 'ajna', 'throat', 'g_identity', 'heart_ego', 'solar_plexus', 'sacral', 'spleen', 'root')),
  CONSTRAINT hd_canonical_channels_center_b_check
    CHECK (center_b IS NULL
           OR center_b IN ('head', 'ajna', 'throat', 'g_identity', 'heart_ego', 'solar_plexus', 'sacral', 'spleen', 'root')),
  CONSTRAINT hd_canonical_channels_center_distinct_check
    CHECK (center_a IS NULL OR center_b IS NULL OR center_a <> center_b),
  CONSTRAINT hd_canonical_channels_circuit_key_check
    CHECK (circuit_key IS NULL OR circuit_key IN ('individual', 'tribal', 'collective')),
  CONSTRAINT hd_canonical_channels_entity_fk
    FOREIGN KEY (entity_id, entity_kind, canonical_key)
    REFERENCES public.hd_canonical_entities (id, entity_kind, canonical_key)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.hd_canonical_channels IS
  'HD-2C Kanal extension (36 resmî). channel_code CHECK 36 resmî kod; resmî yön korunur (34-57 geçerli, 57-34/1-2/01-08 geçersiz). canonical_key = kanal_<a>_<b> (GENERATED). center_a/b bu fazda NULL.';
COMMENT ON COLUMN public.hd_canonical_channels.channel_code IS
  'Resmî 36 kanal kodu (CHECK, UNIQUE). channel_code = gate_a-gate_b (CHECK).';

-- -----------------------------------------------------------------------------
-- 6) IDENTITY SEED — registry + extension aynı transaction'da (join = canonical_key)
--    Toplam registry: 112 (5 + 7 + 64 + 36). status=draft, version=1.
--    name_tr = constants label; Kapı için deterministik 'Kapı N' (I Ching adı YOK).
-- -----------------------------------------------------------------------------

-- 6.1) Tip seed (5) — name_tr = HUMAN_DESIGN_TYPES.label
WITH t (type_code, name_tr) AS (
  VALUES
    ('generator',             'Generator'),
    ('manifesting_generator', 'Manifesting Generator'),
    ('projector',             'Projector'),
    ('manifestor',            'Manifestor'),
    ('reflector',             'Reflector')
),
reg AS (
  INSERT INTO public.hd_canonical_entities (entity_kind, canonical_key, name_tr, name_original, status, version)
  SELECT 'tip', 'tip_' || t.type_code, t.name_tr, NULL, 'draft', 1 FROM t
  RETURNING id, canonical_key
)
INSERT INTO public.hd_canonical_types (entity_id, type_code)
SELECT reg.id, t.type_code
FROM t JOIN reg ON reg.canonical_key = 'tip_' || t.type_code;

-- 6.2) Otorite seed (7) — name_tr = HUMAN_DESIGN_AUTHORITIES.label
WITH a (authority_code, name_tr) AS (
  VALUES
    ('sacral',               'Sacral Otorite'),
    ('emotional',            'Emotional / Solar Plexus'),
    ('splenic',              'Splenic (Dalak)'),
    ('ego_heart',            'Ego / Heart'),
    ('self_projected',       'Self-Projected'),
    ('mental_environmental', 'Mental / Environmental'),
    ('lunar',                'Lunar (Ay)')
),
reg AS (
  INSERT INTO public.hd_canonical_entities (entity_kind, canonical_key, name_tr, name_original, status, version)
  SELECT 'otorite', 'otorite_' || a.authority_code, a.name_tr, NULL, 'draft', 1 FROM a
  RETURNING id, canonical_key
)
INSERT INTO public.hd_canonical_authorities (entity_id, authority_code)
SELECT reg.id, a.authority_code
FROM a JOIN reg ON reg.canonical_key = 'otorite_' || a.authority_code;

-- 6.3) Kapı seed (64) — name_tr = 'Kapı N' (deterministik sistem etiketi)
WITH g AS (
  SELECT gs AS gate_number FROM generate_series(1, 64) AS gs
),
reg AS (
  INSERT INTO public.hd_canonical_entities (entity_kind, canonical_key, name_tr, name_original, status, version)
  SELECT 'kapi', 'kapi_' || g.gate_number::text, 'Kapı ' || g.gate_number::text, NULL, 'draft', 1 FROM g
  RETURNING id, canonical_key
)
INSERT INTO public.hd_canonical_gates (entity_id, gate_number)
SELECT reg.id, g.gate_number
FROM g JOIN reg ON reg.canonical_key = 'kapi_' || g.gate_number::text;

-- 6.4) Kanal seed (36) — name_tr = HUMAN_DESIGN_CHANNELS.label; gate_a/gate_b resmî koddan
WITH ch (channel_code, gate_a, gate_b, name_tr) AS (
  VALUES
    ('1-8',   1,  8,  '1-8 İlham Kanalı'),
    ('2-14',  2,  14, '2-14 Ritim Kanalı'),
    ('3-60',  3,  60, '3-60 Mutasyon Kanalı'),
    ('4-63',  4,  63, '4-63 Mantık Kanalı'),
    ('5-15',  5,  15, '5-15 Ritim Kanalı'),
    ('6-59',  6,  59, '6-59 Yakınlık Kanalı'),
    ('7-31',  7,  31, '7-31 Alfa Kanalı'),
    ('9-52',  9,  52, '9-52 Konsantrasyon Kanalı'),
    ('10-20', 10, 20, '10-20 Uyanış Kanalı'),
    ('10-34', 10, 34, '10-34 Keşif Kanalı'),
    ('10-57', 10, 57, '10-57 Mükemmel Form Kanalı'),
    ('11-56', 11, 56, '11-56 Merak Kanalı'),
    ('12-22', 12, 22, '12-22 Açıklık Kanalı'),
    ('13-33', 13, 33, '13-33 Tanıklık Kanalı'),
    ('16-48', 16, 48, '16-48 Yetenek Kanalı'),
    ('17-62', 17, 62, '17-62 Kabul Kanalı'),
    ('18-58', 18, 58, '18-58 Yargı Kanalı'),
    ('19-49', 19, 49, '19-49 Sentez Kanalı'),
    ('20-34', 20, 34, '20-34 Karizma Kanalı'),
    ('20-57', 20, 57, '20-57 Beyin Dalgası Kanalı'),
    ('21-45', 21, 45, '21-45 Para Kanalı'),
    ('23-43', 23, 43, '23-43 Yapılandırma Kanalı'),
    ('24-61', 24, 61, '24-61 Farkındalık Kanalı'),
    ('25-51', 25, 51, '25-51 Başlatma Kanalı'),
    ('26-44', 26, 44, '26-44 Teslimiyet Kanalı'),
    ('27-50', 27, 50, '27-50 Koruma Kanalı'),
    ('28-38', 28, 38, '28-38 Mücadele Kanalı'),
    ('29-46', 29, 46, '29-46 Keşif Kanalı'),
    ('30-41', 30, 41, '30-41 Tanıma Kanalı'),
    ('32-54', 32, 54, '32-54 Dönüşüm Kanalı'),
    ('34-57', 34, 57, '34-57 Güç Kanalı'),
    ('35-36', 35, 36, '35-36 Geçicilik Kanalı'),
    ('37-40', 37, 40, '37-40 Topluluk Kanalı'),
    ('39-55', 39, 55, '39-55 Duygusallık Kanalı'),
    ('42-53', 42, 53, '42-53 Olgunlaşma Kanalı'),
    ('47-64', 47, 64, '47-64 Soyutlama Kanalı')
),
reg AS (
  INSERT INTO public.hd_canonical_entities (entity_kind, canonical_key, name_tr, name_original, status, version)
  SELECT 'kanal', 'kanal_' || replace(ch.channel_code, '-', '_'), ch.name_tr, NULL, 'draft', 1 FROM ch
  RETURNING id, canonical_key
)
INSERT INTO public.hd_canonical_channels (entity_id, channel_code, gate_a, gate_b)
SELECT reg.id, ch.channel_code, ch.gate_a, ch.gate_b
FROM ch JOIN reg ON reg.canonical_key = 'kanal_' || replace(ch.channel_code, '-', '_');

-- -----------------------------------------------------------------------------
-- 7) BORN-LOCKED RLS + GRANT (5 tablo)
--    RLS ENABLE (FORCE YOK, policy YOK); PUBLIC/anon/authenticated REVOKE ALL;
--    service_role yalnız SELECT/INSERT/UPDATE (DELETE YOK, GRANT ALL YOK).
-- -----------------------------------------------------------------------------

ALTER TABLE public.hd_canonical_entities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_canonical_entities FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_canonical_entities FROM anon;
REVOKE ALL ON TABLE public.hd_canonical_entities FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_entities TO service_role;

ALTER TABLE public.hd_canonical_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_canonical_types FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_canonical_types FROM anon;
REVOKE ALL ON TABLE public.hd_canonical_types FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_types TO service_role;

ALTER TABLE public.hd_canonical_authorities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_canonical_authorities FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_canonical_authorities FROM anon;
REVOKE ALL ON TABLE public.hd_canonical_authorities FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_authorities TO service_role;

ALTER TABLE public.hd_canonical_gates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_canonical_gates FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_canonical_gates FROM anon;
REVOKE ALL ON TABLE public.hd_canonical_gates FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_gates TO service_role;

ALTER TABLE public.hd_canonical_channels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hd_canonical_channels FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_canonical_channels FROM anon;
REVOKE ALL ON TABLE public.hd_canonical_channels FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hd_canonical_channels TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — canlı DB'de ileri fazda; beklenen):
--   SELECT count(*) FROM public.hd_canonical_entities;                     -- 112
--   SELECT entity_kind, count(*) FROM public.hd_canonical_entities
--     GROUP BY entity_kind;   -- tip=5, otorite=7, kapi=64, kanal=36
--   SELECT count(*) FROM public.hd_canonical_types;        -- 5
--   SELECT count(*) FROM public.hd_canonical_authorities;  -- 7
--   SELECT count(*) FROM public.hd_canonical_gates;        -- 64
--   SELECT count(*) FROM public.hd_canonical_channels;     -- 36
--   SELECT count(*) FROM pg_policies WHERE schemaname='public'
--     AND tablename LIKE 'hd_canonical_%';                 -- 0
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace AND relname LIKE 'hd_canonical_%';
--     -- relrowsecurity=true, relforcerowsecurity=false (5 tablo)
--   SELECT has_table_privilege('anon','public.hd_canonical_entities','SELECT');  -- false
--   SELECT has_table_privilege('service_role','public.hd_canonical_entities','DELETE'); -- false
-- ROLLBACK: destructive DOWN YOK (fail-fast; hata → tüm BEGIN...COMMIT geri alınır).
-- =============================================================================
