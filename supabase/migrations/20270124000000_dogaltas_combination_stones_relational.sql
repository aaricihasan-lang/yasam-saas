-- =============================================================================
-- 20270124000000_dogaltas_combination_stones_relational.sql
--
-- DOĞALTAŞ FAZ 2 — Kombinasyon ↔ Taş İLİŞKİSEL MODEL (F-02) + OPTIMISTIC
-- CONCURRENCY (F-03) temeli.
--
-- BU MIGRATION ADDITIVE + GERİYE UYUMLUDUR:
--   1) public.combination_stones junction tablosu (yeni):
--        combination_id -> combinations.id  ON DELETE CASCADE
--        stone_id       -> stones.id        ON DELETE SET NULL   (veri kaybı YOK;
--                          taş silinse de snapshot_name ile geçmiş korunur)
--        snapshot_name  NOT NULL  (oluşturma anındaki taş adı — tarihsel/fallback)
--        tenant_id, sort_order, created_at
--   2) combinations + minerals tablolarına updated_at (F-03 optimistic concurrency).
--      (stones'ta updated_at zaten var.) set_updated_at trigger'ı bağlanır.
--   3) Transactional RPC'ler (service_role-only):
--        create_combination_with_stones(...)  → parent + N junction tek transaction
--        update_combination_with_stones(...)   → concurrency guard + parent + junction replace
--      stones_text kolonu KALDIRILMAZ: RPC'ler snapshot_name'lerden türetilmiş CSV'yi
--      denormalize mirror olarak yazmaya devam eder → legacy okuyucular (word-report,
--      indexer) kırılmaz. Canonical model junction'dır; stones_text geriye-uyum aynasıdır.
--
-- ⛔ YAPILMAYANLAR: combinations/minerals base DDL bu repoda yok (legacy); yalnız
--    ADD COLUMN IF NOT EXISTS ile additive. stones_text DROP edilmez. Veri rewrite yok
--    (legacy backfill AYRI migration + preflight'tadır).
--
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--   DROP TRIGGER IF EXISTS + CREATE, CREATE OR REPLACE FUNCTION.
--
-- ⚠️ APPLY POLİTİKASI: DOSYA. PRODUCTION'A UYGULANMADI. Apply ayrı onay kapısıdır.
-- =============================================================================

BEGIN;

-- set_updated_at zaten tanımlı olabilir; güvenle yeniden tanımla (proje standardı).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Türkçe-duyarlı isim normalizasyonu (app normalizeTr ile hizalı). RPC'lerin
-- snapshot_name → stone_id çözümünde ve legacy backfill'de kullanılır.
-- I/İ/ı → i ; Ç/ç→c ; Ğ/ğ→g ; Ö/ö→o ; Ş/ş→s ; Ü/ü→u ; sonra lower() + ws collapse.
CREATE OR REPLACE FUNCTION public.dogaltas_normalize_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(COALESCE(p, ''), 'IİıÇçĞğÖöŞşÜü', 'iiiccggoossuu')),
    '\s+', ' ', 'g'
  ));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Junction tablosu
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.combination_stones (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  combination_id uuid        NOT NULL REFERENCES public.combinations(id) ON DELETE CASCADE,
  stone_id       uuid        REFERENCES public.stones(id) ON DELETE SET NULL,
  snapshot_name  text        NOT NULL,
  tenant_id      uuid        NOT NULL,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- İlişkisel + tenant sorgu indexleri
CREATE INDEX IF NOT EXISTS combination_stones_combination_idx
  ON public.combination_stones (combination_id, sort_order);
CREATE INDEX IF NOT EXISTS combination_stones_stone_idx
  ON public.combination_stones (stone_id);
CREATE INDEX IF NOT EXISTS combination_stones_tenant_idx
  ON public.combination_stones (tenant_id);

-- Güvenlik: Doğaltaş server-only modeli (FAZ 1 ile tutarlı) — anon/authenticated
-- doğrudan erişim YOK; yalnız service_role (sunucu API/RPC). RLS ENABLE + policy yok
-- + REVOKE (deny-backstop). FORCE RLS KULLANILMAZ (service_role/SECURITY DEFINER akışı).
ALTER TABLE public.combination_stones ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.combination_stones FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) updated_at (optimistic concurrency — F-03)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.combinations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.minerals     ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_combinations_updated_at ON public.combinations;
CREATE TRIGGER trg_combinations_updated_at
  BEFORE UPDATE ON public.combinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_minerals_updated_at ON public.minerals;
CREATE TRIGGER trg_minerals_updated_at
  BEFORE UPDATE ON public.minerals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3a) create_combination_with_stones — parent + N junction, tek transaction
--     p_stones: jsonb array [{ "stone_id": uuid|null, "snapshot_name": text }]
--     stone_id NULL olabilir (isim eşleşmedi) → snapshot_name yeterli.
--     stone_id verilmişse aynı tenant'a ait olmalı (cross-tenant reddi).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_combination_with_stones(
  p_tenant_id     uuid,
  p_issue         text,
  p_description   text,
  p_source        text,
  p_source_id     text,
  p_variant_index integer,
  p_notes_text    text,
  p_notes_text_2  text,
  p_notes_text_3  text,
  p_stones        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_combination_id uuid;
  v_stones_csv     text;
  v_inserted       integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  IF p_issue IS NULL OR btrim(p_issue) = '' THEN
    RAISE EXCEPTION 'issue_required';
  END IF;
  IF p_stones IS NULL OR jsonb_typeof(p_stones) <> 'array' THEN
    RAISE EXCEPTION 'stones_must_be_array';
  END IF;

  -- Her öğe snapshot_name içermeli (mutasyondan ÖNCE doğrula → fail → hiç dokunma).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_stones) e
    WHERE COALESCE(btrim(e->>'snapshot_name'), '') = ''
  ) THEN
    RAISE EXCEPTION 'snapshot_name_required';
  END IF;

  -- stone_id verilenler aynı tenant'a ait olmalı (cross-tenant sızıntı yok).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_stones) e
    WHERE (e->>'stone_id') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.stones s
        WHERE s.id = (e->>'stone_id')::uuid AND s.tenant_id = p_tenant_id
      )
  ) THEN
    RAISE EXCEPTION 'stone_not_found_for_tenant';
  END IF;

  -- Geriye-uyum aynası: stones_text = snapshot_name'lerin CSV'si (sıra korunur).
  SELECT string_agg(e->>'snapshot_name', ', ' ORDER BY ord)
    INTO v_stones_csv
  FROM jsonb_array_elements(p_stones) WITH ORDINALITY AS t(e, ord);

  INSERT INTO public.combinations
    (tenant_id, issue, description, source, source_id, variant_index,
     stones_text, notes_text, notes_text_2, notes_text_3)
  VALUES
    (p_tenant_id, btrim(p_issue), NULLIF(btrim(COALESCE(p_description,'')), ''),
     NULLIF(btrim(COALESCE(p_source,'')), ''),
     COALESCE(NULLIF(btrim(COALESCE(p_source_id,'')), ''), 'cart-' || gen_random_uuid()::text),
     COALESCE(p_variant_index, 1),
     COALESCE(v_stones_csv, ''),
     NULLIF(COALESCE(p_notes_text,''), ''),
     NULLIF(COALESCE(p_notes_text_2,''), ''),
     NULLIF(COALESCE(p_notes_text_3,''), ''))
  RETURNING id INTO v_combination_id;

  -- stone_id: caller verdiyse onu kullan; yoksa snapshot_name'i tenant içinde
  -- normalize eşleştir (yalnız TEK eşleşmede id, aksi halde NULL → snapshot_name fallback).
  INSERT INTO public.combination_stones
    (combination_id, stone_id, snapshot_name, tenant_id, sort_order)
  SELECT
    v_combination_id,
    COALESCE(NULLIF(e->>'stone_id','')::uuid, r.rid),
    btrim(e->>'snapshot_name'),
    p_tenant_id,
    (ord - 1)::integer
  FROM jsonb_array_elements(p_stones) WITH ORDINALITY AS t(e, ord)
  LEFT JOIN LATERAL (
    SELECT CASE WHEN count(*) = 1 THEN max(s.id) END AS rid
    FROM public.stones s
    WHERE s.tenant_id = p_tenant_id
      AND public.dogaltas_normalize_name(s.stone_name) = public.dogaltas_normalize_name(e->>'snapshot_name')
  ) r ON true;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('id', v_combination_id, 'stones', v_inserted);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b) update_combination_with_stones — concurrency guard + parent + junction replace
--     p_expected_updated_at NULL ise concurrency kontrolü atlanır (opsiyonel guard).
--     Uyuşmazlık → 'combination_conflict' (route 409'a çevirir).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_combination_with_stones(
  p_combination_id      uuid,
  p_tenant_id           uuid,
  p_issue               text,
  p_description         text,
  p_notes_text_3        text,
  p_stones              jsonb,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_updated timestamptz;
  v_stones_csv      text;
  v_new_updated     timestamptz;
BEGIN
  IF p_combination_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;
  IF p_stones IS NULL OR jsonb_typeof(p_stones) <> 'array' THEN
    RAISE EXCEPTION 'stones_must_be_array';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_stones) e
    WHERE COALESCE(btrim(e->>'snapshot_name'), '') = ''
  ) THEN
    RAISE EXCEPTION 'snapshot_name_required';
  END IF;

  -- Parent tenant binding + mevcut updated_at (satır kilidi ile).
  SELECT updated_at INTO v_current_updated
  FROM public.combinations
  WHERE id = p_combination_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'combination_not_found_for_tenant';
  END IF;

  -- Optimistic concurrency: beklenen updated_at verildiyse eşleşmeli.
  IF p_expected_updated_at IS NOT NULL AND v_current_updated IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'combination_conflict';
  END IF;

  -- stone_id verilenler aynı tenant'a ait olmalı.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_stones) e
    WHERE (e->>'stone_id') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.stones s
        WHERE s.id = (e->>'stone_id')::uuid AND s.tenant_id = p_tenant_id
      )
  ) THEN
    RAISE EXCEPTION 'stone_not_found_for_tenant';
  END IF;

  SELECT string_agg(e->>'snapshot_name', ', ' ORDER BY ord)
    INTO v_stones_csv
  FROM jsonb_array_elements(p_stones) WITH ORDINALITY AS t(e, ord);

  UPDATE public.combinations
  SET issue        = COALESCE(NULLIF(btrim(COALESCE(p_issue,'')), ''), issue),
      description  = CASE WHEN p_description IS NULL THEN description
                          ELSE NULLIF(btrim(p_description), '') END,
      notes_text_3 = CASE WHEN p_notes_text_3 IS NULL THEN notes_text_3
                          ELSE NULLIF(p_notes_text_3, '') END,
      stones_text  = COALESCE(v_stones_csv, '')
  WHERE id = p_combination_id AND tenant_id = p_tenant_id
  RETURNING updated_at INTO v_new_updated;   -- trigger updated_at'ı now() yapar

  DELETE FROM public.combination_stones WHERE combination_id = p_combination_id;
  INSERT INTO public.combination_stones
    (combination_id, stone_id, snapshot_name, tenant_id, sort_order)
  SELECT
    p_combination_id,
    COALESCE(NULLIF(e->>'stone_id','')::uuid, r.rid),
    btrim(e->>'snapshot_name'),
    p_tenant_id,
    (ord - 1)::integer
  FROM jsonb_array_elements(p_stones) WITH ORDINALITY AS t(e, ord)
  LEFT JOIN LATERAL (
    SELECT CASE WHEN count(*) = 1 THEN max(s.id) END AS rid
    FROM public.stones s
    WHERE s.tenant_id = p_tenant_id
      AND public.dogaltas_normalize_name(s.stone_name) = public.dogaltas_normalize_name(e->>'snapshot_name')
  ) r ON true;

  RETURN jsonb_build_object('id', p_combination_id, 'updated_at', v_new_updated);
END;
$$;

-- Least-privilege: yalnız service_role çağırır.
REVOKE ALL ON FUNCTION public.create_combination_with_stones(uuid,text,text,text,text,integer,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_combination_with_stones(uuid,text,text,text,text,integer,text,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.update_combination_with_stones(uuid,uuid,text,text,text,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_combination_with_stones(uuid,uuid,text,text,text,jsonb,timestamptz) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma — beklenen):
--   \d public.combination_stones  → FK'ler: combination_id CASCADE, stone_id SET NULL
--   SELECT has_table_privilege('anon','public.combination_stones','SELECT');   -- false
--   SELECT relrowsecurity FROM pg_class WHERE relname='combination_stones';    -- true
--   \df public.create_combination_with_stones / update_combination_with_stones -- SECURITY DEFINER
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name IN ('combinations','minerals') AND column_name='updated_at'; -- 2 satır
--
-- ROLLBACK (acil — yalnız kurtarma):
--   DROP FUNCTION IF EXISTS public.update_combination_with_stones(uuid,uuid,text,text,text,jsonb,timestamptz);
--   DROP FUNCTION IF EXISTS public.create_combination_with_stones(uuid,text,text,text,text,integer,text,text,text,jsonb);
--   DROP TABLE IF EXISTS public.combination_stones;
--   -- updated_at kolonları/trigger'ları bırakılabilir (zararsız) veya:
--   -- DROP TRIGGER IF EXISTS trg_combinations_updated_at ON public.combinations;
--   -- ALTER TABLE public.combinations DROP COLUMN IF EXISTS updated_at;  (dikkat: veri)
-- =============================================================================
