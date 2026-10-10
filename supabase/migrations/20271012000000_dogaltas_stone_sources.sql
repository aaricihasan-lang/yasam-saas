-- =============================================================================
-- 20271012000000_dogaltas_stone_sources.sql
--
-- feat(dogaltas): taş başına ÇOKLU KAYNAK (WT9)
--
-- AMAÇ:
--   Aynı taş için farklı bilgi kaynakları (ör. "Kristal Şifa Kitabı", "Ahmet Hoca Eğitim Notu")
--   birbirine karışmadan ayrı ayrı tutulsun; uzman hangi metnin hangi kaynaktan geldiğini görsün.
--
-- MODEL (minimum güvenli — mevcut okuyucuları bozmadan):
--   * public.stones satırı = taşın BİRİNCİL kaynağı. İçerik kolonları (short_description,
--     general_info, physical_effects, … chakras) YERİNDE kalır; yalnız kaynağın ADI eklenir:
--       stones.primary_source_name  (NULL = "Kaynak belirtilmemiş" — eski kayıt)
--     → mevcut liste/arama/koşul araması/RPC/Yaşam Hafızası/Word/yedek/aktarım okuyucuları
--       birincil kaynak için AYNEN çalışır; veri TAŞINMAZ (kayıp riski yok).
--   * public.stone_sources = EK kaynaklar (her biri aynı içerik alanlarının kendi kopyası).
--       Taşa ve tenant'a bağlı; (tenant_id, stone_id, normalize ad) TEKİL → aynı kaynak iki kez yok;
--       birincil kaynak adıyla da çakışamaz (iki yönlü tetikleyici).
--   * stones.extra_sources_text = ek kaynakların "Kaynak: ad + alanlar" metni (TÜRETİLMİŞ; yalnız
--       tetikleyici yazar). Böylece mevcut içerik araması ve mevcut YH outbox/indexer deseni
--       (stones satırı UPDATE → yh_outbox_stones_enqueue_trg → yeniden indeks) yeni altyapı
--       icat etmeden ek kaynakları kapsar; taş başına TEK indeks belgesi (duplicate yok).
--
-- GÜVENLİK / TENANT:
--   * Merkezî kütüphane YOK: kaynak satırı taşın tenant'ına bağlıdır (tetikleyici doğrular;
--     taş/tenant sonradan değiştirilemez). RLS açık + politika yok + anon/authenticated'a grant YOK
--     (stones ile aynı: yalnız service_role API, tenant filtresi API'de).
--
-- VERİ:
--   * Bu migration MEVCUT VERİYİ DEĞİŞTİRMEZ (yalnız ek kolon + tablo + fonksiyon + tetikleyici).
--     "Kristal Şifa Kitabı" ataması AYRI, owner onaylı veri adımıdır (scripts/wt9/sql/backfill_kristal_sifa.sql).
--
-- DEPLOY SIRASI:
--   1) Bu migration → 2) uygulama deploy (YH indexer stones'tan yeni kolonları seçer).
--   Eski uygulama yeni kolonları/tabloyu bilmez (select("*") fazladan alanı yok sayar) → güvenli.
--
-- ROLLBACK: scripts/wt9/sql/ROLLBACK_20271012000000.sql (önce ek kaynakları yedekler).
-- =============================================================================

BEGIN;

-- ─── 1) stones: birincil kaynak adı + türetilmiş ek kaynak metni ──────────────
ALTER TABLE public.stones ADD COLUMN IF NOT EXISTS primary_source_name text;
ALTER TABLE public.stones ADD COLUMN IF NOT EXISTS extra_sources_text text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stones_primary_source_name_chk' AND conrelid = 'public.stones'::regclass
  ) THEN
    ALTER TABLE public.stones
      ADD CONSTRAINT stones_primary_source_name_chk
      CHECK (primary_source_name IS NULL OR char_length(btrim(primary_source_name)) BETWEEN 1 AND 200);
  END IF;
END
$$;

COMMENT ON COLUMN public.stones.primary_source_name IS
  'WT9: taşın birincil kaynağının adı (içerik kolonları bu kaynağa aittir). NULL = Kaynak belirtilmemiş.';
COMMENT ON COLUMN public.stones.extra_sources_text IS
  'WT9: TÜRETİLMİŞ — ek kaynakların (stone_sources) arama/indeks metni. Yalnız tetikleyici yazar.';

-- ─── 2) Kaynak adı anahtarı (Türkçe büyük/küçük harf + boşluk normalize) ──────
CREATE OR REPLACE FUNCTION public.dogaltas_source_name_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(translate(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), 'İIŞĞÜÖÇ', 'iışğüöç'))
$$;

-- ─── 3) Ek kaynaklar tablosu ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stone_sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  stone_id          uuid NOT NULL REFERENCES public.stones(id) ON DELETE CASCADE,
  source_name       text NOT NULL,
  source_name_key   text GENERATED ALWAYS AS (public.dogaltas_source_name_key(source_name)) STORED,
  sort_order        integer NOT NULL DEFAULT 0,
  short_description text,
  general_info      text,
  source_note       text,
  physical_effects  text,
  spiritual_effects text,
  other_effects     text,
  feng_shui         text,
  meditation        text,
  care              text,
  application       text,
  warning_text      text,
  chakras           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stone_sources_name_chk CHECK (char_length(btrim(source_name)) BETWEEN 1 AND 200),
  CONSTRAINT stone_sources_chakras_chk CHECK (chakras IS NULL OR jsonb_typeof(chakras) = 'array'),
  CONSTRAINT stone_sources_unique_name UNIQUE (tenant_id, stone_id, source_name_key)
);

CREATE INDEX IF NOT EXISTS stone_sources_stone_idx ON public.stone_sources (tenant_id, stone_id, sort_order);
-- Kaynak adı önerisi (autocomplete): YALNIZ aynı tenant'ın adları.
CREATE INDEX IF NOT EXISTS stone_sources_tenant_name_idx ON public.stone_sources (tenant_id, source_name_key);

COMMENT ON TABLE public.stone_sources IS
  'WT9: taşın EK bilgi kaynakları (birincil kaynak stones satırıdır). Tenant-izole; merkezî kütüphane değil.';

-- ─── 4) Koruma tetikleyicisi: tenant tutarlılığı + birincil adla çakışma ─────
CREATE OR REPLACE FUNCTION public.stone_sources_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant  uuid;
  v_primary text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.stone_id IS DISTINCT FROM OLD.stone_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    RAISE EXCEPTION 'stone_sources: kaynağın taşı/tenantı değiştirilemez' USING ERRCODE = '42501';
  END IF;
  SELECT s.tenant_id, s.primary_source_name INTO v_tenant, v_primary
    FROM public.stones s WHERE s.id = NEW.stone_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stone_sources: taş bulunamadı' USING ERRCODE = '23503';
  END IF;
  IF v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'stone_sources: tenant uyuşmazlığı' USING ERRCODE = '42501';
  END IF;
  NEW.source_name := regexp_replace(btrim(NEW.source_name), '\s+', ' ', 'g');
  IF v_primary IS NOT NULL
     AND public.dogaltas_source_name_key(v_primary) = public.dogaltas_source_name_key(NEW.source_name) THEN
    RAISE EXCEPTION 'stone_sources: bu kaynak adı bu taşta zaten var' USING ERRCODE = '23505';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS stone_sources_guard_trg ON public.stone_sources;
CREATE TRIGGER stone_sources_guard_trg
  BEFORE INSERT OR UPDATE ON public.stone_sources
  FOR EACH ROW EXECUTE FUNCTION public.stone_sources_guard();

-- Birincil kaynak adı ek kaynak adlarıyla çakışamaz; boş ad → NULL.
CREATE OR REPLACE FUNCTION public.stones_primary_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.primary_source_name IS NOT NULL THEN
    NEW.primary_source_name := regexp_replace(btrim(NEW.primary_source_name), '\s+', ' ', 'g');
    IF NEW.primary_source_name = '' THEN
      NEW.primary_source_name := NULL;
    ELSIF EXISTS (
      SELECT 1 FROM public.stone_sources ss
      WHERE ss.stone_id = NEW.id
        AND ss.source_name_key = public.dogaltas_source_name_key(NEW.primary_source_name)
    ) THEN
      RAISE EXCEPTION 'stones: bu kaynak adı bu taşta zaten var' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS stones_primary_source_guard_trg ON public.stones;
CREATE TRIGGER stones_primary_source_guard_trg
  BEFORE INSERT OR UPDATE OF primary_source_name ON public.stones
  FOR EACH ROW EXECUTE FUNCTION public.stones_primary_source_guard();

-- ─── 5) Türetilmiş arama metni (stones.extra_sources_text) ───────────────────
-- Ek kaynak eklenince/değişince/silinince taş satırı güncellenir → mevcut YH outbox tetikleyicisi
-- (yh_outbox_stones_enqueue_trg) taşı yeniden indeksler. Değişmeyen metin için UPDATE yapılmaz.
CREATE OR REPLACE FUNCTION public.stone_sources_text(p_stone_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT string_agg(
           concat_ws(E'\n',
             'Kaynak: ' || ss.source_name,
             'Kısa Açıklama: '   || nullif(btrim(coalesce(ss.short_description, '')), ''),
             'Genel Bilgi: '     || nullif(btrim(coalesce(ss.general_info, '')), ''),
             'Fiziksel Etkiler: ' || nullif(btrim(coalesce(ss.physical_effects, '')), ''),
             'Ruhsal Etkiler: '  || nullif(btrim(coalesce(ss.spiritual_effects, '')), ''),
             'Diğer Etkiler: '   || nullif(btrim(coalesce(ss.other_effects, '')), ''),
             'Feng Shui: '       || nullif(btrim(coalesce(ss.feng_shui, '')), ''),
             'Meditasyon: '      || nullif(btrim(coalesce(ss.meditation, '')), ''),
             'Bakım: '           || nullif(btrim(coalesce(ss.care, '')), ''),
             'Uygulama: '        || nullif(btrim(coalesce(ss.application, '')), ''),
             'Uyarı: '           || nullif(btrim(coalesce(ss.warning_text, '')), ''),
             'Kaynak Notu: '     || nullif(btrim(coalesce(ss.source_note, '')), ''),
             'Çakralar: '        || nullif((SELECT string_agg(c, ', ') FROM jsonb_array_elements_text(
                                      CASE WHEN jsonb_typeof(ss.chakras) = 'array' THEN ss.chakras ELSE '[]'::jsonb END) AS c), '')
           ),
           E'\n\n' ORDER BY ss.sort_order, ss.created_at, ss.id)
    FROM public.stone_sources ss
   WHERE ss.stone_id = p_stone_id
$$;

CREATE OR REPLACE FUNCTION public.stone_sources_refresh_text()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stone uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.stone_id ELSE NEW.stone_id END;
  v_text  text;
BEGIN
  v_text := public.stone_sources_text(v_stone);
  -- Taş silinirken (CASCADE) satır zaten görünmez → 0 satır; sorun değil.
  UPDATE public.stones s
     SET extra_sources_text = v_text,
         updated_at = now()
   WHERE s.id = v_stone
     AND s.extra_sources_text IS DISTINCT FROM v_text;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS stone_sources_refresh_text_trg ON public.stone_sources;
CREATE TRIGGER stone_sources_refresh_text_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.stone_sources
  FOR EACH ROW EXECUTE FUNCTION public.stone_sources_refresh_text();

-- ─── 6) Birincil kaynağı silme = bir ek kaynağı birincil yap (ATOMİK) ────────
-- Taşın kendisi ve diğer ek kaynaklar KORUNUR. Taşın tek kaynağı varsa çağıran (API) reddeder;
-- fonksiyon da ek kaynak bulamazsa hiçbir şey yazmaz.
CREATE OR REPLACE FUNCTION public.dogaltas_stone_source_promote(p_tenant_id uuid, p_stone_id uuid, p_source_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.stone_sources%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.stones WHERE id = p_stone_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stone_not_found');
  END IF;
  SELECT * INTO r FROM public.stone_sources
   WHERE id = p_source_id AND stone_id = p_stone_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_not_found');
  END IF;
  DELETE FROM public.stone_sources WHERE id = r.id;
  UPDATE public.stones SET
    primary_source_name = r.source_name,
    short_description   = r.short_description,
    general_info        = r.general_info,
    source_note         = r.source_note,
    physical_effects    = r.physical_effects,
    spiritual_effects   = r.spiritual_effects,
    other_effects       = r.other_effects,
    feng_shui           = r.feng_shui,
    meditation          = r.meditation,
    care                = r.care,
    application         = r.application,
    warning_text        = r.warning_text,
    chakras             = r.chakras,
    updated_at          = now()
  WHERE id = p_stone_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('ok', true, 'primary_source_name', r.source_name);
END
$$;

-- ─── 7) Grant + RLS (stones ile aynı: yalnız service_role) ────────────────────
REVOKE ALL ON TABLE public.stone_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stone_sources TO service_role;
ALTER TABLE public.stone_sources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.dogaltas_source_name_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dogaltas_source_name_key(text) TO service_role;
REVOKE ALL ON FUNCTION public.stone_sources_text(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stone_sources_text(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.stone_sources_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stones_primary_source_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stone_sources_refresh_text() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dogaltas_stone_source_promote(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dogaltas_stone_source_promote(uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- DOĞRULAMA (salt-okuma)
--   SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='stones'
--     AND column_name IN ('primary_source_name','extra_sources_text');            -- 2 satır
--   SELECT to_regclass('public.stone_sources');                                     -- stone_sources
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.stone_sources'::regclass;  -- true
--   SELECT count(*) FROM information_schema.role_table_grants WHERE table_name='stone_sources'
--     AND grantee IN ('anon','authenticated');                                      -- 0
--   SELECT count(*) FILTER (WHERE primary_source_name IS NOT NULL), count(*) FROM public.stones; -- 0 / N (veri değişmedi)
-- =============================================================================
