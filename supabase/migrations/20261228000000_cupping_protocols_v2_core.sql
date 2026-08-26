-- =============================================================================
-- 20261228000000_cupping_protocols_v2_core.sql
--
-- KUPA & HACAMAT V2 — CLEAN CORE (Hacamat Protokolleri).
--
-- AMAÇ: V2'nin merkezi entity'si = HACAMAT PROTOKOLÜ (uygulayıcı çalışma dosyası).
--   "Bir rahatsızlık/amaç = bir protokol dosyası = uzmanın o uygulamada ihtiyaç
--   duyduğu HER ŞEY". Bu TAMAMEN YENİ, ADDITIVE bir ağaçtır; legacy V1 ağacına
--   (cupping_topics / cupping_point_topics / cupping_topic_notes) DOKUNMAZ.
--
-- KAPSAM (hepsi ADDITIVE — destructive DDL YOK: DROP/RENAME/legacy ALTER YOK):
--   A. cupping_protocols              — ROOT (protokol dosyası temel bilgisi)
--   B. cupping_protocol_points        — protokol ↔ master point (Bölüm 2)
--   C. cupping_protocol_techniques    — protokol ↔ master technique (Bölüm 3)
--   D. cupping_protocol_safety        — protokol ↔ master safety note (Bölüm 5)
--   E. cupping_protocol_steps         — sıralı uygulama akışı (Bölüm 4)
--   F. cupping_protocol_entries       — UNIFIED "Bilgiler" (Bölüm 7; source opsiyonel)
--   G. cupping_protocol_entry_points  — bilgi ↔ master point (M:N)
--   H. cupping_protocol_sources       — protokol-seviye kaynak künyeleri (Bölüm 8)
--   I. cupping_sources.is_active      — master source SOFT-ARCHIVE için additive kolon
--
-- GÜVENLİK deseni cupping_schema (20261216000000) / content_foundation (20261217000000)
-- ile BİREBİR:
--   - tenant_id uuid NOT NULL (server yazar; body'den GÜVENİLMEZ),
--   - composite tenant-safe FK (tenant_id, x_id) → parent(tenant_id, id),
--   - REVOKE ALL anon/authenticated + ENABLE RLS (FORCE YOK, policy YOK) → erişim
--     yalnız service-role /api/kupa/*,
--   - master FK'ler ON DELETE RESTRICT (referanslı master SERT silinemez → SOFT-archive),
--   - protokol-sahipli çocuklar ON DELETE CASCADE (protokol silinince temizlenir).
--
-- LIFECYCLE KARARI: TEK lifecycle = is_active boolean. `status` üretilmez (draft/publish
--   iş akışı FAZ 1 kapsamında değil; gerekirse ileride additive eklenir).
--
-- STEP REFERENTIAL INTEGRITY (DB-level, yalnız API assertion DEĞİL):
--   Bir step ref_point_id/ref_technique_id verdiğinde, o point/technique AYNI protokolün
--   cupping_protocol_points / cupping_protocol_techniques setinde bulunmak ZORUNDA.
--   → composite FK (tenant_id, protocol_id, ref_*_id) → child(tenant_id, protocol_id, *_id).
--   Bu FK'ler ON DELETE NO ACTION (RESTRICT DEĞİL). GEREKÇE: RESTRICT anında kontrol
--   eder ve protokol silme cascade'ini (step + protocol_point aynı parent'tan cascade)
--   KIRARDI; NO ACTION (statement sonu kontrol) manuel DETACH'ı (step hâlâ referanslıyken
--   protocol_point silme) 23503 ile ENGELLER ama tam protokol cascade'ine izin verir.
--   Nullable ref alanlarında PostgreSQL MATCH SIMPLE (default): ref NULL → FK atlanır.
--
-- TRANSFER/PROVENANCE: Bu fazda YOK (transfer ayrı faz). origin_* kolonları eklenmez;
--   gerekince transfer fazında additive eklenir (content_foundation citation deseni gibi).
-- YAŞAM HAFIZASI / CDC: Bu fazda YOK. Yeni trigger eklenmez; legacy CDC'ye dokunulmaz.
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / conname guard /
--   INDEX IF NOT EXISTS. Mevcut prod için INERT (yeni tablolar; is_active default true).
-- Bağımlılık: content_foundation'ın eklediği UNIQUE(tenant_id,id) — cupping_sources,
--   cupping_points, cupping_techniques, cupping_safety_notes üzerinde (composite FK hedefi).
-- =============================================================================

BEGIN;

-- ─── I. Master source SOFT-ARCHIVE kolonu (additive; mevcut 9 source otomatik true) ──
--   NOT: SOURCE_WRITABLE'a EKLENMEZ (FAZ 1); arşiv UI/UX FAZ 3. Regresyon üretmez.
ALTER TABLE public.cupping_sources
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ─── A. cupping_protocols (ROOT) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_protocols (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  title            text        NOT NULL,
  category         text,
  summary          text,
  tags             text[]      NOT NULL DEFAULT '{}',
  preparation_note text,
  aftercare_note   text,
  follow_up_note   text,
  sort_order       integer     NOT NULL DEFAULT 0,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_protocols_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS cupping_protocols_tenant_active_idx
  ON public.cupping_protocols (tenant_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS cupping_protocols_tenant_updated_idx
  ON public.cupping_protocols (tenant_id, updated_at DESC);

-- ─── B. cupping_protocol_points (protokol ↔ master point) ─────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_protocol_points (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  protocol_id   uuid        NOT NULL,
  point_id      uuid        NOT NULL,
  protocol_note text,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_protocol_points_protocol_fk
    FOREIGN KEY (tenant_id, protocol_id) REFERENCES public.cupping_protocols (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cupping_protocol_points_point_fk
    FOREIGN KEY (tenant_id, point_id) REFERENCES public.cupping_points (tenant_id, id) ON DELETE RESTRICT,
  -- natural key + step ref_point composite FK hedefi
  CONSTRAINT cupping_protocol_points_unique UNIQUE (tenant_id, protocol_id, point_id)
);
CREATE INDEX IF NOT EXISTS cupping_protocol_points_protocol_idx
  ON public.cupping_protocol_points (tenant_id, protocol_id, sort_order);

-- ─── C. cupping_protocol_techniques (protokol ↔ master technique) ─────────────
CREATE TABLE IF NOT EXISTS public.cupping_protocol_techniques (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  protocol_id   uuid        NOT NULL,
  technique_id  uuid        NOT NULL,
  protocol_note text,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_protocol_techniques_protocol_fk
    FOREIGN KEY (tenant_id, protocol_id) REFERENCES public.cupping_protocols (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cupping_protocol_techniques_technique_fk
    FOREIGN KEY (tenant_id, technique_id) REFERENCES public.cupping_techniques (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT cupping_protocol_techniques_unique UNIQUE (tenant_id, protocol_id, technique_id)
);
CREATE INDEX IF NOT EXISTS cupping_protocol_techniques_protocol_idx
  ON public.cupping_protocol_techniques (tenant_id, protocol_id, sort_order);

-- ─── D. cupping_protocol_safety (protokol ↔ master safety note) ───────────────
CREATE TABLE IF NOT EXISTS public.cupping_protocol_safety (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL,
  protocol_id   uuid        NOT NULL,
  safety_id     uuid        NOT NULL,
  protocol_note text,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_protocol_safety_protocol_fk
    FOREIGN KEY (tenant_id, protocol_id) REFERENCES public.cupping_protocols (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cupping_protocol_safety_safety_fk
    FOREIGN KEY (tenant_id, safety_id) REFERENCES public.cupping_safety_notes (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT cupping_protocol_safety_unique UNIQUE (tenant_id, protocol_id, safety_id)
);
CREATE INDEX IF NOT EXISTS cupping_protocol_safety_protocol_idx
  ON public.cupping_protocol_safety (tenant_id, protocol_id, sort_order);

-- ─── E. cupping_protocol_steps (sıralı uygulama akışı) ────────────────────────
CREATE TABLE IF NOT EXISTS public.cupping_protocol_steps (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL,
  protocol_id      uuid        NOT NULL,
  title            text,
  body             text        NOT NULL,
  stage_label      text,                       -- serbest/nullable (klinik enum İCAT EDİLMEZ)
  ref_point_id     uuid,                        -- opsiyonel; verilirse protokolün point setinde OLMALI
  ref_technique_id uuid,                        -- opsiyonel; verilirse protokolün technique setinde OLMALI
  sort_order       integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_protocol_steps_body_chk CHECK (btrim(body) <> ''),
  CONSTRAINT cupping_protocol_steps_protocol_fk
    FOREIGN KEY (tenant_id, protocol_id) REFERENCES public.cupping_protocols (tenant_id, id) ON DELETE CASCADE,
  -- ref bütünlüğü: ref_point AYNI protokolün protocol_points setinde olmalı.
  -- NO ACTION (statement sonu) → manuel detach'ı ENGELLER, protokol cascade'ine izin verir.
  -- Nullable ref → MATCH SIMPLE (default): ref NULL iken FK atlanır.
  CONSTRAINT cupping_protocol_steps_ref_point_fk
    FOREIGN KEY (tenant_id, protocol_id, ref_point_id)
    REFERENCES public.cupping_protocol_points (tenant_id, protocol_id, point_id) ON DELETE NO ACTION,
  CONSTRAINT cupping_protocol_steps_ref_technique_fk
    FOREIGN KEY (tenant_id, protocol_id, ref_technique_id)
    REFERENCES public.cupping_protocol_techniques (tenant_id, protocol_id, technique_id) ON DELETE NO ACTION
);
CREATE INDEX IF NOT EXISTS cupping_protocol_steps_protocol_idx
  ON public.cupping_protocol_steps (tenant_id, protocol_id, sort_order);

-- ─── F. cupping_protocol_entries (UNIFIED "Bilgiler") ─────────────────────────
--   İlk gün eklenen bilgi ile 6 ay sonra eklenen bilgi AYNI tablo/AYNI sınıf.
--   source_id NULL iken kayıt TAMAMEN geçerli (kaynaksız uzman bilgisi).
--   formal/personal ayrımı YOK — tek unified stream.
CREATE TABLE IF NOT EXISTS public.cupping_protocol_entries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  protocol_id  uuid        NOT NULL,
  title        text,
  content      text        NOT NULL,
  source_id    uuid,                            -- opsiyonel; verilirse AYNI tenant source
  source_label text,                            -- kaynaksız serbest "kimden öğrendim"
  locator      text,
  sort_order   integer     NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_protocol_entries_content_chk CHECK (btrim(content) <> ''),
  CONSTRAINT cupping_protocol_entries_protocol_fk
    FOREIGN KEY (tenant_id, protocol_id) REFERENCES public.cupping_protocols (tenant_id, id) ON DELETE CASCADE,
  -- tenant-safe source FK; nullable (MATCH SIMPLE) + ON DELETE RESTRICT (SET NULL DEĞİL,
  -- çünkü composite FK tenant_id'yi de null'lardı → NOT NULL ihlali). Master source SOFT-archive.
  CONSTRAINT cupping_protocol_entries_source_fk
    FOREIGN KEY (tenant_id, source_id) REFERENCES public.cupping_sources (tenant_id, id) ON DELETE RESTRICT,
  -- entry_points composite FK hedefi
  CONSTRAINT cupping_protocol_entries_tenant_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS cupping_protocol_entries_protocol_idx
  ON public.cupping_protocol_entries (tenant_id, protocol_id, sort_order);

-- ─── G. cupping_protocol_entry_points (bilgi ↔ master point, M:N) ─────────────
CREATE TABLE IF NOT EXISTS public.cupping_protocol_entry_points (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  protocol_entry_id uuid        NOT NULL,
  point_id          uuid        NOT NULL,
  sort_order        integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_protocol_entry_points_entry_fk
    FOREIGN KEY (tenant_id, protocol_entry_id) REFERENCES public.cupping_protocol_entries (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cupping_protocol_entry_points_point_fk
    FOREIGN KEY (tenant_id, point_id) REFERENCES public.cupping_points (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT cupping_protocol_entry_points_unique UNIQUE (tenant_id, protocol_entry_id, point_id)
);
CREATE INDEX IF NOT EXISTS cupping_protocol_entry_points_entry_idx
  ON public.cupping_protocol_entry_points (tenant_id, protocol_entry_id);
CREATE INDEX IF NOT EXISTS cupping_protocol_entry_points_point_idx
  ON public.cupping_protocol_entry_points (tenant_id, point_id);

-- ─── H. cupping_protocol_sources (protokol-seviye künyeler; Bölüm 8) ──────────
--   Cardinality: AYNI source protokolde FARKLI locator ile birden fazla kullanılabilir
--   → kör (tenant,protocol,source) unique YOK; locator dahil. (citation junction deseni.)
CREATE TABLE IF NOT EXISTS public.cupping_protocol_sources (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL,
  protocol_id uuid        NOT NULL,
  source_id   uuid        NOT NULL,
  locator     text,
  note        text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cupping_protocol_sources_protocol_fk
    FOREIGN KEY (tenant_id, protocol_id) REFERENCES public.cupping_protocols (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT cupping_protocol_sources_source_fk
    FOREIGN KEY (tenant_id, source_id) REFERENCES public.cupping_sources (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT cupping_protocol_sources_unique UNIQUE (tenant_id, protocol_id, source_id, locator)
);
CREATE INDEX IF NOT EXISTS cupping_protocol_sources_protocol_idx
  ON public.cupping_protocol_sources (tenant_id, protocol_id, sort_order);

-- ─── Kilit: cupping_schema deseni (policy YOK, FORCE YOK, anon/auth REVOKE) ─────
REVOKE ALL PRIVILEGES ON TABLE public.cupping_protocols             FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cupping_protocol_points       FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cupping_protocol_techniques   FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cupping_protocol_safety       FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cupping_protocol_steps        FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cupping_protocol_entries      FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cupping_protocol_entry_points FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cupping_protocol_sources      FROM anon, authenticated;

ALTER TABLE public.cupping_protocols             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupping_protocol_points       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupping_protocol_techniques   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupping_protocol_safety       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupping_protocol_steps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupping_protocol_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupping_protocol_entry_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupping_protocol_sources      ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, beklenen):
--   -- 8 tablo + RLS on, force off:
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE relname LIKE 'cupping_protocol%';                         -- 8 satır t,f
--   -- anon/authenticated yetkisiz:
--   SELECT has_table_privilege('anon','public.cupping_protocols','SELECT');            -- false
--   SELECT has_table_privilege('authenticated','public.cupping_protocol_entries','INSERT'); -- false
--   -- master source is_active eklendi (mevcut satırlar true):
--   SELECT count(*) FROM public.cupping_sources WHERE is_active IS NULL;               -- 0
--   -- FK davranışı (beklenen): master RESTRICT, protokol-child CASCADE, step-ref NO ACTION.
--   SELECT conname, confdeltype FROM pg_constraint WHERE conname LIKE 'cupping_protocol%_fk'
--     ORDER BY conname;   -- *_point_fk/_technique_fk/_safety_fk/_source_fk = r; *_protocol_fk/_entry_fk = c;
--                         -- steps *_ref_point_fk/_ref_technique_fk = a (NO ACTION)
--
-- STEP INTEGRITY (beklenen):
--   -- protokolde SEÇİLİ OLMAYAN point'i step'e ref vermek → 23503 (foreign_key_violation).
--   -- step referanslıyken protocol_point manuel silme → 23503 (detach blocked → API 409).
--   -- tam protokol silme → step + protocol_point CASCADE (NO ACTION statement-sonu OK).
--
-- ROLLBACK (gerekirse; ters bağımlılık sırası):
--   DROP TABLE IF EXISTS
--     public.cupping_protocol_sources, public.cupping_protocol_entry_points,
--     public.cupping_protocol_entries, public.cupping_protocol_steps,
--     public.cupping_protocol_safety, public.cupping_protocol_techniques,
--     public.cupping_protocol_points, public.cupping_protocols CASCADE;
--   -- cupping_sources.is_active additive kolonu bırakılabilir (zararsız) veya:
--   -- ALTER TABLE public.cupping_sources DROP COLUMN IF EXISTS is_active;
-- =============================================================================
