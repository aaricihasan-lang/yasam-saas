-- =============================================================================
-- 20271016000000_dogaltas_stone_entries.sql
--
-- feat(dogaltas): BİLGİ KAYDI BAZLI KAYNAK modeli (taş → bilgi alanı → bilgi kaydı → kaynak)
--
-- AMAÇ:
--   Aynı taşın aynı bilgi alanında (ör. Fiziksel Etkiler) BİRDEN ÇOK AYRI bilgi kaydı tutulsun;
--   her kaydın KENDİ kaynağı, kimliği ve sırası olsun. Bir kaydı düzenlemek/silmek diğerlerine dokunmaz.
--
-- MODEL (additive — mevcut okuyucular bozulmaz):
--   * public.stone_entries = yeni bilgi kayıtları (id, taş, alan, metin, kaynak, sıra).
--   * ESKİ metinler (stones.<alan> + stone_sources.<alan>) YERİNDE kalır ve uygulamada "eski bilgi kaydı"
--     olarak gösterilir (kaynağı: primary_source_name / stone_sources.source_name). Metin BÖLÜNMEZ.
--   * Eski bir kayıt düzenlenince dogaltas_stone_legacy_entry() TEK işlemde onu stone_entries satırına
--     dönüştürür (aynı sıra) ve eski kolonu boşaltır → kayıp/çift kayıt yok.
--   * stones.entries_text = kayıtların "Alan / Kaynak: ad / metin" arama-indeks metni (TÜRETİLMİŞ; yalnız
--     tetikleyici yazar) → mevcut içerik araması + Yaşam Hafızası outbox/indexer deseni (WT9 ile aynı).
--
-- GÜVENLİK / TENANT:
--   * Merkezî/global katalog YOK. Kayıt taşın tenant'ına bağlı (tetikleyici doğrular; taş/tenant
--     sonradan değiştirilemez). RLS açık + politika yok + anon/authenticated grant YOK (yalnız service_role).
--
-- VERİ:
--   * Bu migration MEVCUT VERİYİ DEĞİŞTİRMEZ (yalnız tablo + kolon + fonksiyon + tetikleyici).
--
-- DEPLOY SIRASI: 1) bu migration → 2) uygulama deploy (indexer/arama entries_text'i seçer).
--   Eski uygulama yeni tabloyu/kolonu bilmez (select("*") fazladan alanı yok sayar) → güvenli.
-- ROLLBACK: scripts/stone-entries/sql/ROLLBACK_20271016000000.sql (önce kayıtları yedekler).
-- =============================================================================

BEGIN;

ALTER TABLE public.stones ADD COLUMN IF NOT EXISTS entries_text text;
COMMENT ON COLUMN public.stones.entries_text IS
  'Bilgi kaydı modeli: TÜRETİLMİŞ — stone_entries arama/indeks metni (alan + kaynak + metin). Yalnız tetikleyici yazar.';

-- ─── 1) Bilgi alanı allowlist'i (stones'taki gerçek serbest metin kolonları) ──
CREATE OR REPLACE FUNCTION public.dogaltas_entry_field_label(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE p
    WHEN 'short_description' THEN 'Kısa Açıklama'
    WHEN 'general_info'      THEN 'Genel Bilgi'
    WHEN 'source_note'       THEN 'Kaynak Notu'
    WHEN 'physical_effects'  THEN 'Fiziksel Etkiler'
    WHEN 'spiritual_effects' THEN 'Ruhsal Etkiler'
    WHEN 'other_effects'     THEN 'Diğer Etkiler'
    WHEN 'warning_text'      THEN 'Uyarılar'
    WHEN 'feng_shui'         THEN 'Feng Shui'
    WHEN 'meditation'        THEN 'Meditasyon'
    WHEN 'care'              THEN 'Bakım'
    WHEN 'application'       THEN 'Uygulama'
  END
$$;

CREATE OR REPLACE FUNCTION public.dogaltas_entry_field_rank(p text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT array_position(ARRAY['short_description','general_info','source_note','physical_effects','spiritual_effects',
    'other_effects','warning_text','feng_shui','meditation','care','application']::text[], p)
$$;

-- ─── 2) Bilgi kayıtları ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  stone_id         uuid NOT NULL REFERENCES public.stones(id) ON DELETE CASCADE,
  field_key        text NOT NULL,
  content          text NOT NULL,
  source_name      text,
  source_name_key  text GENERATED ALWAYS AS (public.dogaltas_source_name_key(source_name)) STORED,
  sort_order       integer NOT NULL DEFAULT 0,
  -- Eski metinden dönüştürüldüyse kökeni ('primary' | stone_sources.id) — denetim izi; davranışı etkilemez.
  legacy_origin    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stone_entries_field_chk CHECK (public.dogaltas_entry_field_label(field_key) IS NOT NULL),
  CONSTRAINT stone_entries_content_chk CHECK (char_length(content) BETWEEN 1 AND 150000 AND btrim(content) <> ''),
  CONSTRAINT stone_entries_source_chk CHECK (source_name IS NULL OR char_length(btrim(source_name)) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS stone_entries_stone_idx ON public.stone_entries (tenant_id, stone_id, field_key, sort_order);
CREATE INDEX IF NOT EXISTS stone_entries_tenant_source_idx ON public.stone_entries (tenant_id, source_name_key);

COMMENT ON TABLE public.stone_entries IS
  'Doğaltaş bilgi kayıtları: her kayıt = taş + bilgi alanı + metin + KENDİ kaynağı + sıra. Tenant-izole; merkezî katalog değil.';

-- ─── 3) Koruma: tenant tutarlılığı, taş/tenant/alan değişmez, kaynak normalize ──
CREATE OR REPLACE FUNCTION public.stone_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.stone_id IS DISTINCT FROM OLD.stone_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
                           OR NEW.field_key IS DISTINCT FROM OLD.field_key) THEN
    RAISE EXCEPTION 'stone_entries: kaydın taşı/tenantı/alanı değiştirilemez' USING ERRCODE = '42501';
  END IF;
  SELECT s.tenant_id INTO v_tenant FROM public.stones s WHERE s.id = NEW.stone_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stone_entries: taş bulunamadı' USING ERRCODE = '23503';
  END IF;
  IF v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'stone_entries: tenant uyuşmazlığı' USING ERRCODE = '42501';
  END IF;
  IF NEW.source_name IS NOT NULL THEN
    NEW.source_name := regexp_replace(btrim(NEW.source_name), '\s+', ' ', 'g');
    IF NEW.source_name = '' THEN NEW.source_name := NULL; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS stone_entries_guard_trg ON public.stone_entries;
CREATE TRIGGER stone_entries_guard_trg
  BEFORE INSERT OR UPDATE ON public.stone_entries
  FOR EACH ROW EXECUTE FUNCTION public.stone_entries_guard();

-- ─── 4) Türetilmiş arama/indeks metni (stones.entries_text) ──────────────────
CREATE OR REPLACE FUNCTION public.stone_entries_text(p_stone_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT string_agg(
           concat_ws(E'\n',
             public.dogaltas_entry_field_label(e.field_key),
             'Kaynak: ' || coalesce(e.source_name, 'Kaynak belirtilmemiş'),
             e.content),
           E'\n\n' ORDER BY public.dogaltas_entry_field_rank(e.field_key), e.sort_order, e.created_at, e.id)
    FROM public.stone_entries e
   WHERE e.stone_id = p_stone_id
$$;

CREATE OR REPLACE FUNCTION public.stone_entries_refresh_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stone uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.stone_id ELSE NEW.stone_id END;
  v_text  text;
BEGIN
  v_text := public.stone_entries_text(v_stone);
  UPDATE public.stones s
     SET entries_text = v_text,
         updated_at = now()
   WHERE s.id = v_stone
     AND s.entries_text IS DISTINCT FROM v_text;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS stone_entries_refresh_text_trg ON public.stone_entries;
CREATE TRIGGER stone_entries_refresh_text_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.stone_entries
  FOR EACH ROW EXECUTE FUNCTION public.stone_entries_refresh_text();

-- ─── 5) Eski (legacy) bilgi kaydını dönüştür / sil — ATOMİK ───────────────────
-- p_legacy: 'primary' (stones.<alan>) | stone_sources.id (metin olarak).
-- p_expected: istemcinin gördüğü eski metin; DB'deki değer farklıysa (başka oturum değiştirdi) hiçbir şey
--   yazılmaz → 'conflict'. 'convert': yeni kayıt (verilen metin + kaynak + sıra) eklenir, eski kolon NULL.
--   'delete': eski kolon NULL. Diğer alanlar/kaynaklar/kayıtlar DEĞİŞMEZ.
CREATE OR REPLACE FUNCTION public.dogaltas_stone_legacy_entry(
  p_tenant_id uuid, p_stone_id uuid, p_legacy text, p_field text, p_expected text,
  p_action text, p_content text, p_source_name text, p_sort_order integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cur   text;
  v_src   uuid;
  v_entry public.stone_entries%ROWTYPE;
BEGIN
  IF public.dogaltas_entry_field_label(p_field) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_field');
  END IF;
  IF p_action NOT IN ('convert', 'delete') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_action');
  END IF;
  PERFORM 1 FROM public.stones WHERE id = p_stone_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stone_not_found');
  END IF;

  IF p_legacy = 'primary' THEN
    EXECUTE format('SELECT %I FROM public.stones WHERE id = $1', p_field) INTO v_cur USING p_stone_id;
  ELSE
    BEGIN
      v_src := p_legacy::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'source_not_found');
    END;
    PERFORM 1 FROM public.stone_sources WHERE id = v_src AND stone_id = p_stone_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'source_not_found');
    END IF;
    EXECUTE format('SELECT %I FROM public.stone_sources WHERE id = $1', p_field) INTO v_cur USING v_src;
  END IF;

  IF v_cur IS NULL OR btrim(v_cur) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'legacy_not_found');
  END IF;
  IF v_cur IS DISTINCT FROM p_expected THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conflict');
  END IF;

  IF p_action = 'convert' THEN
    INSERT INTO public.stone_entries (tenant_id, stone_id, field_key, content, source_name, sort_order, legacy_origin)
    VALUES (p_tenant_id, p_stone_id, p_field, p_content, p_source_name, p_sort_order, p_legacy)
    RETURNING * INTO v_entry;
  END IF;

  IF p_legacy = 'primary' THEN
    EXECUTE format('UPDATE public.stones SET %I = NULL, updated_at = now() WHERE id = $1', p_field) USING p_stone_id;
  ELSE
    EXECUTE format('UPDATE public.stone_sources SET %I = NULL WHERE id = $1', p_field) USING v_src;
  END IF;

  IF p_action = 'convert' THEN
    RETURN jsonb_build_object('ok', true, 'entry', to_jsonb(v_entry));
  END IF;
  RETURN jsonb_build_object('ok', true);
END
$$;

-- ─── 6) Grant + RLS (stones ile aynı: yalnız service_role) ────────────────────
REVOKE ALL ON TABLE public.stone_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stone_entries TO service_role;
ALTER TABLE public.stone_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.dogaltas_entry_field_label(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dogaltas_entry_field_label(text) TO service_role;
REVOKE ALL ON FUNCTION public.dogaltas_entry_field_rank(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dogaltas_entry_field_rank(text) TO service_role;
REVOKE ALL ON FUNCTION public.stone_entries_text(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stone_entries_text(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.stone_entries_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stone_entries_refresh_text() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dogaltas_stone_legacy_entry(uuid, uuid, text, text, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dogaltas_stone_legacy_entry(uuid, uuid, text, text, text, text, text, text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- DOĞRULAMA (salt-okuma)
--   SELECT to_regclass('public.stone_entries');                                       -- stone_entries
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.stone_entries'::regclass;    -- true
--   SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='stone_entries'
--     AND grantee IN ('anon','authenticated');                                        -- 0
--   SELECT count(*) FILTER (WHERE entries_text IS NOT NULL), count(*) FROM public.stones; -- 0 / N (veri değişmedi)
-- =============================================================================
