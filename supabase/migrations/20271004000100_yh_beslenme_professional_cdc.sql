-- =============================================================================
-- YAŞAM HAFIZASI™ — BESLENME MESLEKİ HAFIZA CDC (M2, ADD-ONLY)
-- =============================================================================
--
-- KAPSAM (ürün kararı 2026-10-03): Beslenme Mesleki Hafıza'ya YALNIZ 3 AGGREGATE kaynakla girer:
--   beslenme:foods     → nutrition_foods      (+ porsiyon / geleneksel / kaynak bağı çocukları)
--   beslenme:topics    → nutrition_topics     (+ bölüm / besin bağı / kaynak bağı çocukları)
--   beslenme:templates → nutrition_templates  (+ öğün / öğe çocukları)
-- Aggregate doküman worker'da (lib/yasam-hafizasi/indexer/beslenmeSource.ts) kurulur; burada
-- yalnız EBEVEYN kimliği kuyruğa alınır (çocuk değişikliği → ebeveyn upsert; coalescing tek satır).
--
-- KESİN DIŞARIDA: SYSTEM tenant (00000000-0000-4000-8000-000000000001) satırları ASLA kuyruğa
--   alınmaz (ortak katalog Mesleki Hafıza DEĞİLDİR); nutrition_client_*, nutrition_plans ailesi,
--   nutrition_plan_clients, besin değerleri (nutrients), global sözlükler, formüller, challenge
--   tabloları — bunlara HİÇBİR trigger bağlanmaz.
--
-- AKTİVASYON: yh_outbox_put_v2 aktivasyon-kapılıdır (is_active değilse sessiz no-op). Bu migration
--   aktivasyon AÇMAZ (M3 ayrı, sürüm kontrollü). Kaynak CRUD'u hiçbir koşulda engellenmez.
-- SQL INJECTION YÜZEYİ YOK: trigger argümanları migration'da sabit; ebeveyn kimliği NEW/OLD
--   kaydından to_jsonb ile okunur (dinamik SQL yok).
-- IDEMPOTENT: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- =============================================================================

BEGIN;

DO $pre$
DECLARE
  v_tbl text;
  v_tables text[] := ARRAY[
    'nutrition_foods','nutrition_food_portions','nutrition_food_traditional','nutrition_food_sources',
    'nutrition_topics','nutrition_topic_sections','nutrition_topic_foods','nutrition_topic_sources',
    'nutrition_templates','nutrition_template_meals','nutrition_template_items','nutrition_sources'
  ];
BEGIN
  IF to_regprocedure('public.yh_outbox_put_v2(text,text,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'M2 BLOCKER: yh_outbox_put_v2 yok (20261210000000)';
  END IF;
  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      RAISE EXCEPTION 'M2 BLOCKER: public.% yok', v_tbl;
    END IF;
  END LOOP;
END
$pre$;

-- ─── 1) Ebeveyn (foods / topics / templates) ──────────────────────────────────
-- TG_ARGV[0] = source_key. SYSTEM tenant → no-op.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_beslenme_parent()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  c_system     constant uuid := '00000000-0000-4000-8000-000000000001';
  v_source_key text := TG_ARGV[0];
BEGIN
  IF v_source_key IS NULL OR v_source_key NOT IN ('beslenme:foods', 'beslenme:topics', 'beslenme:templates') THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_beslenme_parent: gecersiz source_key';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS NOT NULL AND OLD.tenant_id <> c_system THEN
      PERFORM public.yh_outbox_put_v2(v_source_key, TG_TABLE_NAME, OLD.id, OLD.tenant_id, 'tenant', 'delete');
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> c_system THEN
    PERFORM public.yh_outbox_put_v2(v_source_key, TG_TABLE_NAME, NEW.id, NEW.tenant_id, 'tenant', 'upsert');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_beslenme_parent() FROM PUBLIC, anon, authenticated;

-- ─── 1b) Ebeveyn hâlâ var mı? (sabit allowlist; dinamik SQL yok) ──────────────
-- Cascade silmede ebeveyn satırı çocuk trigger'ı çalışırken ZATEN silinmiştir → çocuk ebeveyni
-- yeniden kuyruğa ALMAZ (ebeveynin kendi DELETE olayı coalescing'de son söz olarak kalır).
CREATE OR REPLACE FUNCTION public.yh_beslenme_parent_exists(p_table text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT CASE p_table
    WHEN 'nutrition_foods'     THEN EXISTS (SELECT 1 FROM public.nutrition_foods     WHERE id = p_id)
    WHEN 'nutrition_topics'    THEN EXISTS (SELECT 1 FROM public.nutrition_topics    WHERE id = p_id)
    WHEN 'nutrition_templates' THEN EXISTS (SELECT 1 FROM public.nutrition_templates WHERE id = p_id)
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.yh_beslenme_parent_exists(text, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 2) Çocuk → ebeveyn upsert ────────────────────────────────────────────────
-- TG_ARGV[0] = ebeveyn source_key, TG_ARGV[1] = ebeveyn FK kolon adı, TG_ARGV[2] = ebeveyn tablo.
-- Çocuğun tenant_id'si (NOT NULL) kullanılır. FK değişirse eski + yeni ebeveyn kuyruğa alınır.
-- Çocuk silinmesi de ebeveyn UPSERT'tür (ebeveyn dokümanı yeniden kurulur). Ebeveyn cascade ile
-- silinmişse çocuk hiçbir şey kuyruğa almaz → ebeveynin kendi DELETE olayı korunur.
CREATE OR REPLACE FUNCTION public.yh_cdc_enqueue_beslenme_child()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  c_system     constant uuid := '00000000-0000-4000-8000-000000000001';
  v_parent_key text := TG_ARGV[0];
  v_fk         text := TG_ARGV[1];
  v_parent_tbl text := TG_ARGV[2];
  v_new_parent uuid;
  v_old_parent uuid;
BEGIN
  IF v_parent_key IS NULL OR v_parent_key NOT IN ('beslenme:foods', 'beslenme:topics', 'beslenme:templates') THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_beslenme_child: gecersiz parent source_key';
  END IF;
  IF v_parent_tbl IS NULL OR v_parent_tbl NOT IN ('nutrition_foods', 'nutrition_topics', 'nutrition_templates') THEN
    RAISE EXCEPTION 'yh_cdc_enqueue_beslenme_child: gecersiz parent tablo';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_parent := nullif(to_jsonb(NEW) ->> v_fk, '')::uuid;
    IF v_new_parent IS NOT NULL AND NEW.tenant_id IS NOT NULL AND NEW.tenant_id <> c_system THEN
      PERFORM public.yh_outbox_put_v2(v_parent_key, v_parent_tbl, v_new_parent, NEW.tenant_id, 'tenant', 'upsert');
    END IF;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_parent := nullif(to_jsonb(OLD) ->> v_fk, '')::uuid;
    IF v_old_parent IS NOT NULL AND OLD.tenant_id IS NOT NULL AND OLD.tenant_id <> c_system
       AND (TG_OP = 'DELETE' OR v_old_parent IS DISTINCT FROM v_new_parent)
       AND public.yh_beslenme_parent_exists(v_parent_tbl, v_old_parent) THEN
      PERFORM public.yh_outbox_put_v2(v_parent_key, v_parent_tbl, v_old_parent, OLD.tenant_id, 'tenant', 'upsert');
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_enqueue_beslenme_child() FROM PUBLIC, anon, authenticated;

-- ─── 3) Ad/başlık yayılımı (bağlı ebeveyn dokümanlarında metin olarak geçer) ────
-- Besin adı/alias/aktiflik değişimi → bu besine bağlı KONU dokümanları yenilenir (bounded).
CREATE OR REPLACE FUNCTION public.yh_cdc_beslenme_food_fanout()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  c_system constant uuid := '00000000-0000-4000-8000-000000000001';
  v_row    record;
BEGIN
  IF NEW.tenant_id = c_system THEN
    RETURN NEW;  -- SYSTEM besini tenant konusuna bağlanamaz (fork zorunlu); yine de no-op.
  END IF;
  FOR v_row IN
    SELECT DISTINCT tf.topic_id, tf.tenant_id
    FROM public.nutrition_topic_foods AS tf
    WHERE tf.food_id = NEW.id AND tf.tenant_id = NEW.tenant_id
  LOOP
    PERFORM public.yh_outbox_put_v2('beslenme:topics', 'nutrition_topics', v_row.topic_id, v_row.tenant_id, 'tenant', 'upsert');
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_beslenme_food_fanout() FROM PUBLIC, anon, authenticated;

-- Kaynak (kaynakça) başlığı değişimi → bu kaynağa bağlı besin + konu dokümanları yenilenir.
CREATE OR REPLACE FUNCTION public.yh_cdc_beslenme_source_fanout()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  c_system constant uuid := '00000000-0000-4000-8000-000000000001';
  v_row    record;
BEGIN
  IF NEW.tenant_id = c_system THEN
    RETURN NEW;
  END IF;
  FOR v_row IN
    SELECT DISTINCT fs.food_id, fs.tenant_id FROM public.nutrition_food_sources AS fs
    WHERE fs.source_id = NEW.id AND fs.tenant_id = NEW.tenant_id
  LOOP
    PERFORM public.yh_outbox_put_v2('beslenme:foods', 'nutrition_foods', v_row.food_id, v_row.tenant_id, 'tenant', 'upsert');
  END LOOP;
  FOR v_row IN
    SELECT DISTINCT ts.topic_id, ts.tenant_id FROM public.nutrition_topic_sources AS ts
    WHERE ts.source_id = NEW.id AND ts.tenant_id = NEW.tenant_id
  LOOP
    PERFORM public.yh_outbox_put_v2('beslenme:topics', 'nutrition_topics', v_row.topic_id, v_row.tenant_id, 'tenant', 'upsert');
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.yh_cdc_beslenme_source_fanout() FROM PUBLIC, anon, authenticated;

-- ─── 4) Trigger bağlama ───────────────────────────────────────────────────────
-- Ebeveynler
DROP TRIGGER IF EXISTS yh_cdc_nutrition_foods_trg ON public.nutrition_foods;
CREATE TRIGGER yh_cdc_nutrition_foods_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_foods
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_parent('beslenme:foods');
DROP TRIGGER IF EXISTS yh_cdc_nutrition_topics_trg ON public.nutrition_topics;
CREATE TRIGGER yh_cdc_nutrition_topics_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_topics
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_parent('beslenme:topics');
DROP TRIGGER IF EXISTS yh_cdc_nutrition_templates_trg ON public.nutrition_templates;
CREATE TRIGGER yh_cdc_nutrition_templates_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_templates
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_parent('beslenme:templates');

-- Besin çocukları (besin değerleri BİLİNÇLİ OLARAK YOK — sayılar indekslenmez)
DROP TRIGGER IF EXISTS yh_cdc_nutrition_food_portions_trg ON public.nutrition_food_portions;
CREATE TRIGGER yh_cdc_nutrition_food_portions_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_food_portions
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_child('beslenme:foods', 'food_id', 'nutrition_foods');
DROP TRIGGER IF EXISTS yh_cdc_nutrition_food_traditional_trg ON public.nutrition_food_traditional;
CREATE TRIGGER yh_cdc_nutrition_food_traditional_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_food_traditional
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_child('beslenme:foods', 'food_id', 'nutrition_foods');
DROP TRIGGER IF EXISTS yh_cdc_nutrition_food_sources_trg ON public.nutrition_food_sources;
CREATE TRIGGER yh_cdc_nutrition_food_sources_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_food_sources
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_child('beslenme:foods', 'food_id', 'nutrition_foods');

-- Konu çocukları
DROP TRIGGER IF EXISTS yh_cdc_nutrition_topic_sections_trg ON public.nutrition_topic_sections;
CREATE TRIGGER yh_cdc_nutrition_topic_sections_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_topic_sections
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_child('beslenme:topics', 'topic_id', 'nutrition_topics');
DROP TRIGGER IF EXISTS yh_cdc_nutrition_topic_foods_trg ON public.nutrition_topic_foods;
CREATE TRIGGER yh_cdc_nutrition_topic_foods_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_topic_foods
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_child('beslenme:topics', 'topic_id', 'nutrition_topics');
DROP TRIGGER IF EXISTS yh_cdc_nutrition_topic_sources_trg ON public.nutrition_topic_sources;
CREATE TRIGGER yh_cdc_nutrition_topic_sources_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_topic_sources
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_child('beslenme:topics', 'topic_id', 'nutrition_topics');

-- Şablon çocukları (öğün/öğe NOTLARI dokümana GİRMEZ — composer hariç tutar; trigger yalnız yeniler)
DROP TRIGGER IF EXISTS yh_cdc_nutrition_template_meals_trg ON public.nutrition_template_meals;
CREATE TRIGGER yh_cdc_nutrition_template_meals_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_template_meals
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_child('beslenme:templates', 'template_id', 'nutrition_templates');
DROP TRIGGER IF EXISTS yh_cdc_nutrition_template_items_trg ON public.nutrition_template_items;
CREATE TRIGGER yh_cdc_nutrition_template_items_trg AFTER INSERT OR UPDATE OR DELETE ON public.nutrition_template_items
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue_beslenme_child('beslenme:templates', 'template_id', 'nutrition_templates');

-- Yayılım
DROP TRIGGER IF EXISTS yh_cdc_nutrition_foods_fanout_trg ON public.nutrition_foods;
CREATE TRIGGER yh_cdc_nutrition_foods_fanout_trg AFTER UPDATE OF name_tr, name_en, aliases, is_active ON public.nutrition_foods
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_beslenme_food_fanout();
DROP TRIGGER IF EXISTS yh_cdc_nutrition_sources_fanout_trg ON public.nutrition_sources;
CREATE TRIGGER yh_cdc_nutrition_sources_fanout_trg AFTER UPDATE OF title, authors, organization, publication_year, is_active ON public.nutrition_sources
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_beslenme_source_fanout();

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR):
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'yh_cdc_nutrition_%' AND NOT tgisinternal ORDER BY 1; -- 13
--   -- SYSTEM tenant'ta herhangi bir nutrition satırı değişse bile outbox'a 'beslenme:*' satırı YAZILMAZ.
-- =============================================================================
