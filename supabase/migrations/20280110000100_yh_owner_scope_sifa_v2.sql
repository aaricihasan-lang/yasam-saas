-- =============================================================================
-- Şifa Rehberi V2 — YAŞAM HAFIZASI UZMAN SAHİPLİĞİ (10. aşama) · ÜRETİLMİŞ DOSYA
--   Üretici: scripts/sifa-rehberi-v2/yh/gen-migration.mjs (v1/v2 gövdeleri gerçek migration'lardan birebir).
--
-- ⚠️ PRODUCTION'A UYGULANMASI AYRI OWNER ONAYI GEREKTİRİR. 20280110000000 (V2 çekirdeği) SONRASINDA uygulanır.
-- Ön koşul: YH çekirdeği (yasam_hafizasi_index, yasam_hafizasi_outbox + event_version dizisi, yh_source_activation,
--           yh_search_candidates) + Şifa V2 çekirdeği (20280110000000). Eksikse BLOCKER ile durur.
--
-- MODEL
--  * yasam_hafizasi_index.owner_user_id (NULL = bugünkü tenant geneli satır; dolu = YALNIZ o uzman).
--    CHECK: sahipli satır tenant'sız (shared) olamaz.
--  * yh_search_candidates (v1) ve _v2: TEK değişiklik "AND i.owner_user_id IS NULL" → eski çağıranlar
--    (kullanıcı kimliği taşımayanlar) kişisel notu ASLA göremez (fail-closed). Mevcut satırlar NULL →
--    bugünkü sonuçlar birebir aynı.
--  * yh_search_candidates_v3: v2 + p_session_user; sahipli satır yalnız owner = p_session_user VE kullanıcı
--    bu tenant'ın AKTİF üyesi ise. Yalnız service_role (anon/authenticated EXECUTE yok).
--  * CDC: sifa_topic_blocks AFTER INSERT/UPDATE (WHEN scope='kisisel') + AFTER DELETE (WHEN OLD.scope='kisisel')
--    → V2'ye ÖZEL yh_cdc_enqueue_sifa_v2() (aktivasyon kapılı; kapalıysa no-op). Genel yh_cdc_enqueue()
--    ve ona bağlı mevcut tetikleyiciler DEĞİŞTİRİLMEZ / KULLANILMAZ (production gövdesi repo dışı; Owner 22.11).
--    Kurum ortak kayıtları (scope='kurum') HİÇ kuyruğa girmez (V1 kaynağının türevi → mükerrer önlenir).
--  * Çöp: konu (veya üstü) çöpe atılır/geri alınırsa alt ağaçtaki kişisel kutular kuyruğa girer; worker
--    okuyucusu kutu + TÜM üst konular çöpte değilse indeksler, aksi defensive deindex.
--  * Tarihsel kayıt: yh_sifa_v2_replay_enqueue(p_tenant) (service_role; aktivasyon kapılı; idempotent).
--
-- GERİ DÖNÜŞ (yalnız bu migration'ın eklediklerini kaldırır; başka YH verisine dokunmaz):
--   DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_blocks_upsert_trg ON public.sifa_topic_blocks;
--   DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_blocks_delete_trg ON public.sifa_topic_blocks;
--   DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_topic_trash_trg  ON public.sifa_topics;
--   DROP FUNCTION IF EXISTS public.yh_cdc_enqueue_sifa_v2();
--   DROP FUNCTION IF EXISTS public.yh_sifa_v2_topic_trash_enqueue();
--   DROP FUNCTION IF EXISTS public.yh_sifa_v2_replay_enqueue(uuid);
--   DROP FUNCTION IF EXISTS public.yh_search_candidates_v3(text, uuid, uuid, float4[], integer, text[]);
--   DELETE FROM public.yasam_hafizasi_index WHERE owner_user_id IS NOT NULL;      -- yalnız V2 kişisel satırlar
--   DELETE FROM public.yasam_hafizasi_outbox WHERE source_key = 'sifa_rehberi_v2:notes';
--   (v1/v2'yi özgün migration'lardaki tanımla yeniden kur; ardından isteğe bağlı)
--   ALTER TABLE public.yasam_hafizasi_index DROP CONSTRAINT IF EXISTS yhi_owner_requires_tenant;
--   ALTER TABLE public.yasam_hafizasi_index DROP COLUMN IF EXISTS owner_user_id;
-- DROP / TRUNCATE / toplu silme YOK (yukarıdaki geri dönüş blok yorumdur).
-- =============================================================================
BEGIN;

DO $blk$
BEGIN
  IF to_regclass('public.yasam_hafizasi_index') IS NULL THEN RAISE EXCEPTION 'SIFA-V2-YH BLOCKER: yasam_hafizasi_index yok'; END IF;
  IF to_regclass('public.yasam_hafizasi_outbox') IS NULL THEN RAISE EXCEPTION 'SIFA-V2-YH BLOCKER: yasam_hafizasi_outbox yok'; END IF;
  IF to_regclass('public.yh_source_activation') IS NULL THEN RAISE EXCEPTION 'SIFA-V2-YH BLOCKER: yh_source_activation yok'; END IF;
  IF to_regclass('public.yasam_hafizasi_outbox_event_version_seq') IS NULL THEN RAISE EXCEPTION 'SIFA-V2-YH BLOCKER: outbox event_version dizisi yok'; END IF;
  IF to_regclass('public.sifa_topic_blocks') IS NULL OR to_regclass('public.sifa_topics') IS NULL THEN
    RAISE EXCEPTION 'SIFA-V2-YH BLOCKER: Şifa V2 çekirdeği (20280110000000) uygulanmamış';
  END IF;
END
$blk$;

-- ── 1) Sahiplik kolonu (ADD-ONLY; mevcut satırlar NULL = bugünkü davranış) ──────
ALTER TABLE public.yasam_hafizasi_index ADD COLUMN IF NOT EXISTS owner_user_id uuid;
DO $blk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'yhi_owner_requires_tenant'
                   AND conrelid = 'public.yasam_hafizasi_index'::regclass) THEN
    ALTER TABLE public.yasam_hafizasi_index
      ADD CONSTRAINT yhi_owner_requires_tenant CHECK (owner_user_id IS NULL OR tenant_id IS NOT NULL);
  END IF;
END
$blk$;
CREATE INDEX IF NOT EXISTS yhi_tenant_owner_idx
  ON public.yasam_hafizasi_index (tenant_id, owner_user_id) WHERE owner_user_id IS NOT NULL;

-- ── 2) v1 arama (özgün: 20260724000000_yh_search_candidates_rpc.sql) + sahipli satır HARİÇ ──
CREATE OR REPLACE FUNCTION public.yh_search_candidates(
  p_tsquery        text,
  p_session_tenant uuid,
  p_allow_shared   boolean,
  p_weights        float4[],
  p_limit          integer
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  source_module     text,
  source_table      text,
  source_id         uuid,
  unit_type         text,
  section_ref       text,
  group_key         text,
  title             text,
  snippet           text,
  evidence_fields   jsonb,
  topic_tags        text[],
  expert_relations  jsonb,
  is_client_pii     boolean,
  source_updated_at timestamptz,
  rank              real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
-- Ambiguïte durumunda bareword → kolon (OUT parametre adları sorguyu gölgeleyemez).
#variable_conflict use_column
DECLARE
  -- Demo tenant (mevcut modül RLS deseniyle aynı sabit; config.YH_DEMO_TENANT_ID).
  c_demo_tenant  constant uuid    := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  -- Doğal taş kaynağı (stone_exclusions yalnız bu modül için sorgulanır; §9).
  c_stone_module constant text    := 'dogaltas';
  -- Aday tavanı mutlak DoS güvenlik korkuluğu (iş limiti 150 descriptor'dan gelir).
  c_limit_cap    constant integer := 500;
  v_limit        integer;
  v_tsq          tsquery;
  v_rank_weights float4[];
BEGIN
  -- 1) Fail-closed sınır guard'ları (beklenen geçersiz girdi → 0 satır; throw YOK).
  --    (Boş/geçersiz tsquery zaten S2.18'de kind='noop' → RPC çağrılmaz; bu savunma.)
  IF p_session_tenant IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;

  -- 2) p_weights FAIL-LOUD doğrulaması (sessiz varsayılan YOK — sözleşme hatası).
  IF p_weights IS NULL THEN
    RAISE EXCEPTION 'yh_search_candidates: p_weights NULL';
  END IF;
  IF array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_candidates: p_weights uzunlugu 4 degil';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL
       OR w < 0::float4
       OR w = 'NaN'::float4
       OR w = 'Infinity'::float4
       OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_candidates: p_weights gecersiz eleman (null/negatif/sonsuz/NaN)';
  END IF;

  -- 3) p_limit güvenli clamp (DoS korkuluğu; geçersiz/NULL → 150 varsayılan, üst sınır c_limit_cap).
  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);

  -- 4) tsquery (S2.17 zaten güvenli/lexeme-allowlist üretir; config 'simple' ile simetrik).
  --    Bozuk girdi throw ederse yüzeye çıkar (programlama hatası yutulmaz; adapter fail-closed).
  v_tsq := to_tsquery('simple', p_tsquery);

  -- 5) ts_rank ağırlık sırası dönüşümü: [A,B,C,D] → PostgreSQL beklediği {D,C,B,A}.
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  -- 6) Görünürlük + eşleşme + weighted ranking + tavan.
  --    Görünürlük filtreleri (tenant/shared/PII/demo/stone) ORDER BY / LIMIT'ten ÖNCE.
  RETURN QUERY
  SELECT
    i.id,
    i.tenant_id,
    i.source_module,
    i.source_table,
    i.source_id,
    i.unit_type,
    i.section_ref,
    i.group_key,
    i.title,
    i.snippet,
    i.evidence_fields,
    i.topic_tags,
    i.expert_relations,
    i.is_client_pii,
    i.source_updated_at,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_index AS i
  WHERE
    -- tenant / shared görünürlüğü (§9)
    ( i.tenant_id = p_session_tenant
      OR (i.tenant_id IS NULL AND p_allow_shared IS TRUE) )
    -- PII kapısı (ana indekste CHECK ile zaten false; savunma derinliği)
    AND i.is_client_pii = false
    AND i.owner_user_id IS NULL  -- Şifa V2 (10. aşama): uzman sahipli satır v1/v2'den ASLA dönmez
    -- demo tenant hariç (NULL shared demo değildir → IS DISTINCT FROM ile korunur)
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    -- doğal taş exclusion (yalnız dogaltas; source_id = stone_exclusions.stone_id)
    AND NOT (
      i.source_module = c_stone_module
      AND EXISTS (
        SELECT 1
        FROM public.stone_exclusions AS se
        WHERE se.tenant_id = p_session_tenant::text
          AND se.stone_id = i.source_id
      )
    )
    -- lexical eşleşme
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_search_candidates(text, uuid, boolean, float4[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_candidates(text, uuid, boolean, float4[], integer) TO service_role;

-- ── 3) v2 arama (özgün: 20271004000000_yh_presale_final_infra.sql) + sahipli satır HARİÇ ──
CREATE OR REPLACE FUNCTION public.yh_search_candidates_v2(
  p_tsquery        text,
  p_session_tenant uuid,
  p_weights        float4[],
  p_limit          integer,
  p_modules        text[]
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  source_module     text,
  source_table      text,
  source_id         uuid,
  unit_type         text,
  section_ref       text,
  group_key         text,
  title             text,
  snippet           text,
  evidence_fields   jsonb,
  topic_tags        text[],
  expert_relations  jsonb,
  is_client_pii     boolean,
  source_updated_at timestamptz,
  rank              real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  c_demo_tenant  constant uuid    := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_stone_module constant text    := 'dogaltas';
  c_limit_cap    constant integer := 500;
  v_limit        integer;
  v_tsq          tsquery;
  v_rank_weights float4[];
BEGIN
  IF p_session_tenant IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;
  IF p_weights IS NULL THEN
    RAISE EXCEPTION 'yh_search_candidates_v2: p_weights NULL';
  END IF;
  IF array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_candidates_v2: p_weights uzunlugu 4 degil';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL OR w < 0::float4 OR w = 'NaN'::float4
       OR w = 'Infinity'::float4 OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_candidates_v2: p_weights gecersiz eleman';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);
  v_tsq := to_tsquery('simple', p_tsquery);
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  RETURN QUERY
  SELECT
    i.id, i.tenant_id, i.source_module, i.source_table, i.source_id, i.unit_type,
    i.section_ref, i.group_key, i.title, i.snippet, i.evidence_fields, i.topic_tags,
    i.expert_relations, i.is_client_pii, i.source_updated_at,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_index AS i
  WHERE
    i.tenant_id = p_session_tenant
    AND i.is_client_pii = false
    AND i.owner_user_id IS NULL  -- Şifa V2 (10. aşama): uzman sahipli satır v1/v2'den ASLA dönmez
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    AND (p_modules IS NULL OR i.source_module = ANY (p_modules))
    AND NOT (
      i.source_module = c_stone_module
      AND EXISTS (
        SELECT 1 FROM public.stone_exclusions AS se
        WHERE se.tenant_id = p_session_tenant::text AND se.stone_id = i.source_id
      )
    )
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_search_candidates_v2(text, uuid, float4[], integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_candidates_v2(text, uuid, float4[], integer, text[]) TO service_role;

-- ── 4) v3 arama: v2 + uzman sahipliği ──
CREATE OR REPLACE FUNCTION public.yh_search_candidates_v3(
  p_tsquery        text,
  p_session_tenant uuid,
  p_session_user   uuid,
  p_weights        float4[],
  p_limit          integer,
  p_modules        text[]
)
RETURNS TABLE (
  id                uuid,
  tenant_id         uuid,
  source_module     text,
  source_table      text,
  source_id         uuid,
  unit_type         text,
  section_ref       text,
  group_key         text,
  title             text,
  snippet           text,
  evidence_fields   jsonb,
  topic_tags        text[],
  expert_relations  jsonb,
  is_client_pii     boolean,
  source_updated_at timestamptz,
  owner_user_id     uuid,
  rank              real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  c_demo_tenant  constant uuid    := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_stone_module constant text    := 'dogaltas';
  c_limit_cap    constant integer := 500;
  v_limit        integer;
  v_tsq          tsquery;
  v_rank_weights float4[];
  v_user_ok      boolean := false;
BEGIN
  IF p_session_tenant IS NULL THEN
    RETURN;
  END IF;
  IF p_tsquery IS NULL OR btrim(p_tsquery) = '' THEN
    RETURN;
  END IF;
  IF p_weights IS NULL THEN
    RAISE EXCEPTION 'yh_search_candidates_v3: p_weights NULL';
  END IF;
  IF array_length(p_weights, 1) IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'yh_search_candidates_v3: p_weights uzunlugu 4 degil';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_weights) AS w
    WHERE w IS NULL OR w < 0::float4 OR w = 'NaN'::float4
       OR w = 'Infinity'::float4 OR w = '-Infinity'::float4
  ) THEN
    RAISE EXCEPTION 'yh_search_candidates_v3: p_weights gecersiz eleman';
  END IF;

  -- Savunma derinliği: kullanıcı bu tenant'ın aktif üyesi mi? (service_role da başka tenant'ın
  -- kullanıcısıyla kişisel satır okuyamaz.)
  IF p_session_user IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_session_user AND u.tenant_id = p_session_tenant AND u.active IS TRUE)
      INTO v_user_ok;
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 150), 1), c_limit_cap);
  v_tsq := to_tsquery('simple', p_tsquery);
  v_rank_weights := ARRAY[p_weights[4], p_weights[3], p_weights[2], p_weights[1]]::float4[];

  RETURN QUERY
  SELECT
    i.id, i.tenant_id, i.source_module, i.source_table, i.source_id, i.unit_type,
    i.section_ref, i.group_key, i.title, i.snippet, i.evidence_fields, i.topic_tags,
    i.expert_relations, i.is_client_pii, i.source_updated_at, i.owner_user_id,
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) AS rank
  FROM public.yasam_hafizasi_index AS i
  WHERE
    i.tenant_id = p_session_tenant
    AND i.is_client_pii = false
    -- Uzman sahipliği: tenant geneli satır (NULL) VEYA yalnız oturum kullanıcısının kendi satırı.
    -- p_session_user NULL → yalnız tenant geneli. Kullanıcı bu tenant'ın AKTİF üyesi değilse → yalnız tenant geneli.
    AND (i.owner_user_id IS NULL OR (i.owner_user_id = p_session_user AND v_user_ok))
    AND i.tenant_id IS DISTINCT FROM c_demo_tenant
    AND (p_modules IS NULL OR i.source_module = ANY (p_modules))
    AND NOT (
      i.source_module = c_stone_module
      AND EXISTS (
        SELECT 1 FROM public.stone_exclusions AS se
        WHERE se.tenant_id = p_session_tenant::text AND se.stone_id = i.source_id
      )
    )
    AND i.search_tsv @@ v_tsq
  ORDER BY
    ts_rank(v_rank_weights, i.search_tsv, v_tsq) DESC,
    i.source_updated_at DESC NULLS LAST,
    i.id ASC
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_search_candidates_v3(text, uuid, uuid, float4[], integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_search_candidates_v3(text, uuid, uuid, float4[], integer, text[]) TO service_role;

-- ── 5) CDC: yalnız KİŞİSEL kutular — V2'ye ÖZEL yh_cdc_enqueue_sifa_v2() (aktivasyon kapılı) ──
-- Owner kararı (22.11): production'daki genel yh_cdc_enqueue() repo dışında değişmiş (162 satır; repo 84) ve
-- 22 tetikleyiciye bağlı → ona DOKUNULMAZ, V2 ona BAĞLANMAZ. Bu fonksiyon repo yh_cdc_enqueue (20260927)
-- sözleşmesinin V2'ye sabitlenmiş kopyasıdır: kaynak/tablo SABİT (TG_ARGV yok), yalnız kişisel satır,
-- aktivasyon kapısı, OLD ile delete tombstone, UNIQUE(source_key, source_id) birleştirme, processing korunur.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_sifa_v2()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  c_source_key CONSTANT text := 'sifa_rehberi_v2:notes';
  v_active    boolean;
  v_operation text;
  v_source_id uuid;
  v_tenant_id uuid;
  v_scope     text;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public' OR TG_TABLE_NAME IS DISTINCT FROM 'sifa_topic_blocks' THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_sifa_v2: yalniz public.sifa_topic_blocks (% . %)', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_operation := 'upsert';
    v_source_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
    v_scope     := NEW.scope;
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'delete';
    v_source_id := OLD.id;
    v_tenant_id := OLD.tenant_id;
    v_scope     := OLD.scope;
  ELSE
    RAISE EXCEPTION 'yh_cdc_enqueue_sifa_v2: desteklenmeyen TG_OP %', TG_OP;
  END IF;

  -- Kurum ortak kayıtları ASLA kuyruğa girmez (tetikleyici WHEN'e ek savunma).
  IF v_scope IS DISTINCT FROM 'kisisel' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- AKTİVASYON KAPISI: kaynak aktif değilse sessiz no-op (kullanıcı işlemi bozulmaz).
  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = c_source_key;
  IF v_active IS DISTINCT FROM true THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF v_source_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_sifa_v2: source_id/tenant_id null';
  END IF;

  INSERT INTO public.yasam_hafizasi_outbox AS o (source_key, source_table, source_id, tenant_id, operation)
  VALUES (c_source_key, 'sifa_topic_blocks', v_source_id, v_tenant_id, v_operation)
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at    ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by    ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error   ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at ELSE NULL      END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_sifa_v2() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_blocks_upsert_trg ON public.sifa_topic_blocks;
CREATE TRIGGER yh_cdc_sifa_v2_blocks_upsert_trg
  AFTER INSERT OR UPDATE ON public.sifa_topic_blocks
  FOR EACH ROW WHEN (NEW.scope = 'kisisel')
  EXECUTE FUNCTION public.yh_cdc_enqueue_sifa_v2();
DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_blocks_delete_trg ON public.sifa_topic_blocks;
CREATE TRIGGER yh_cdc_sifa_v2_blocks_delete_trg
  AFTER DELETE ON public.sifa_topic_blocks
  FOR EACH ROW WHEN (OLD.scope = 'kisisel')
  EXECUTE FUNCTION public.yh_cdc_enqueue_sifa_v2();

-- ── 6) Konu çöpe atıldı / geri alındı → alt ağaçtaki kişisel kutular kuyruğa (aktivasyon kapılı) ──
CREATE OR REPLACE FUNCTION public.yh_sifa_v2_topic_trash_enqueue()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_active boolean;
BEGIN
  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = 'sifa_rehberi_v2:notes';
  IF v_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.yasam_hafizasi_outbox AS o (source_key, source_table, source_id, tenant_id, operation)
  SELECT 'sifa_rehberi_v2:notes', 'sifa_topic_blocks', b.id, b.tenant_id, 'upsert'
  FROM (
    WITH RECURSIVE sub AS (
      SELECT t.id, 0 AS d FROM public.sifa_topics t
       WHERE t.id = NEW.id AND t.tenant_id = NEW.tenant_id AND t.owner_key = NEW.owner_key
      UNION ALL
      SELECT c.id, sub.d + 1 FROM public.sifa_topics c JOIN sub ON c.parent_id = sub.id
       WHERE c.tenant_id = NEW.tenant_id AND c.owner_key = NEW.owner_key AND sub.d < 25
    )
    SELECT x.id, x.tenant_id FROM public.sifa_topic_blocks x
     WHERE x.topic_id IN (SELECT id FROM sub) AND x.tenant_id = NEW.tenant_id AND x.owner_key = NEW.owner_key
       AND x.scope = 'kisisel'
  ) b
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET operation     = EXCLUDED.operation,
      source_table  = EXCLUDED.source_table,
      tenant_id     = EXCLUDED.tenant_id,
      event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status       ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts     ELSE 0         END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at ELSE now()     END,
      locked_at     = CASE WHEN o.status = 'processing' THEN o.locked_at    ELSE NULL      END,
      locked_by     = CASE WHEN o.status = 'processing' THEN o.locked_by    ELSE NULL      END,
      last_error    = CASE WHEN o.status = 'processing' THEN o.last_error   ELSE NULL      END,
      processed_at  = CASE WHEN o.status = 'processing' THEN o.processed_at ELSE NULL      END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_sifa_v2_topic_trash_enqueue() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS yh_cdc_sifa_v2_topic_trash_trg ON public.sifa_topics;
CREATE TRIGGER yh_cdc_sifa_v2_topic_trash_trg
  AFTER UPDATE OF deleted_at ON public.sifa_topics
  FOR EACH ROW WHEN (NEW.scope = 'kisisel' AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.yh_sifa_v2_topic_trash_enqueue();

-- ── 7) Tarihsel kişisel kutuları kuyruğa al (kör backfill DEĞİL: exact yoldan, aktivasyon kapılı, idempotent) ──
CREATE OR REPLACE FUNCTION public.yh_sifa_v2_replay_enqueue(p_tenant uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_active boolean;
  v_n integer;
BEGIN
  IF p_tenant IS NULL THEN RAISE EXCEPTION 'yh_sifa_v2_replay_enqueue: tenant zorunlu'; END IF;
  SELECT a.is_active INTO v_active FROM public.yh_source_activation AS a WHERE a.source_key = 'sifa_rehberi_v2:notes';
  IF v_active IS DISTINCT FROM true THEN RETURN 0; END IF;
  INSERT INTO public.yasam_hafizasi_outbox AS o (source_key, source_table, source_id, tenant_id, operation)
  SELECT 'sifa_rehberi_v2:notes', 'sifa_topic_blocks', b.id, b.tenant_id, 'upsert'
    FROM public.sifa_topic_blocks b
   WHERE b.tenant_id = p_tenant AND b.scope = 'kisisel'
  ON CONFLICT (source_key, source_id) DO UPDATE
  SET event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq'),
      updated_at    = now(),
      status        = CASE WHEN o.status = 'processing' THEN o.status ELSE 'pending' END,
      attempts      = CASE WHEN o.status = 'processing' THEN o.attempts ELSE 0 END,
      available_at  = CASE WHEN o.status = 'processing' THEN o.available_at ELSE now() END;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_sifa_v2_replay_enqueue(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yh_sifa_v2_replay_enqueue(uuid) TO service_role;

COMMIT;
