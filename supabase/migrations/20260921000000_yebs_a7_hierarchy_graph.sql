-- ============================================================
-- 20260921000000_yebs_a7_hierarchy_graph.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ A7 (A7-G) HİYERARŞİK GRAF TEMELİ
--
-- Amaç: Concept Relations publish gate'inin (A7-Q, sonraki migration) çağıracağı
--   BİRLEŞİK hiyerarşik döngü (cycle) yardımcı fonksiyonu + destekleyici partial
--   index. Bu migration ÖNCE gelir (foundation → quality); böylece yalnız-bu-migration
--   uygulanınca fonksiyon VAR ama kullanılmaz (güvenli ara-state); A7-Q sonrası tam.
--
-- KRİTİK NORMALİZASYON (§10): broader_than ve part_of AYNI hiyerarşinin ters yönlü
--   ifadeleridir. Tek yönlü canonical graf:
--     broader_than(A,B)  => canonical edge  A -> B   (A daha genel/üst)
--     part_of(A,B)       => canonical edge  B -> A   (B, A'yı kapsar/üst)
--   İki tip ayrı graf olarak DEĞİL, tek normalize graf olarak değerlendirilir;
--   mixed-type transitif döngü böylece yakalanır.
--
-- Kapsam: yalnız broader_than + part_of. related_to/contrasted_with/corresponds_to
--   döngü kontrolüne GİRMEZ. Yalnız status='published' kenarlar + aday kenar.
--   draft/under_review/needs_verification/verified/approved/archived HARİÇ.
--
-- Cycle-safe: recursive CTE `UNION` (node dedup = visited-set) → mevcut grafta döngü
--   olsa bile sonlanır; ayrıca açık derinlik guard'ı (depth<100000). Yön: aday kenar
--   from->to eklenince, mevcut published grafta to -> ... -> from ulaşılabiliyorsa döngü.
--
-- Güvenlik: SET search_path = pg_catalog, public. Salt-okunur (STABLE). Yazma/DELETE yok.
--   EXECUTE PUBLIC/anon/authenticated tam REVOKE; yalnız service_role GRANT.
--   (A7-Q'daki SECURITY DEFINER RPC'ler owner olarak da çağırabilir.)
--
-- A0–A5 ve API-TX migration/RPC gövdeleri DEĞİŞTİRİLMEZ (additive).
-- ============================================================

BEGIN;

-- Destekleyici partial index — yalnız published hiyerarşik kenarlar.
-- Recursive traversal broader_than dalını (relation_type, source_concept_id) ile;
-- part_of dalını relation_type='part_of' daraltması + target lookup ile kullanır.
CREATE INDEX yebs_concept_relations_a7_hierarchy_pub_idx
  ON public.yebs_concept_relations (relation_type, source_concept_id, target_concept_id)
  WHERE status = 'published' AND relation_type IN ('broader_than', 'part_of');

-- Birleşik normalize hiyerarşik döngü kontrolü.
-- Çağıran (A7-Q relation publish RPC) aday kenarı ZATEN canonical yöne normalize
-- ederek (p_from_node -> p_to_node) geçirir. Döner: aday kenar eklenince döngü oluşur mu.
CREATE FUNCTION public.yebs_a7_hierarchy_cycle_exists(
  p_from_node uuid,
  p_to_node   uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE norm(f, t) AS (
    -- broader_than(A,B) => A -> B
    SELECT r.source_concept_id, r.target_concept_id
      FROM public.yebs_concept_relations r
      WHERE r.status = 'published' AND r.relation_type = 'broader_than'
    UNION ALL
    -- part_of(A,B) => B -> A
    SELECT r.target_concept_id, r.source_concept_id
      FROM public.yebs_concept_relations r
      WHERE r.status = 'published' AND r.relation_type = 'part_of'
  ),
  walk(node, depth) AS (
    SELECT p_to_node, 0
    UNION            -- node-dedup (visited-set) → mevcut döngüde bile sonlanır
    SELECT n.t, w.depth + 1
      FROM walk w
      JOIN norm n ON n.f = w.node
      WHERE w.depth < 100000
  )
  -- Aday from->to eklenince to, from'a ulaşabiliyorsa döngü. Kendine-kenar (from=to)
  -- zaten no_self_relation CHECK ile engelli; yine de defensive true döneriz.
  SELECT (p_from_node = p_to_node)
      OR EXISTS (SELECT 1 FROM walk WHERE node = p_from_node);
$$;

REVOKE ALL ON FUNCTION public.yebs_a7_hierarchy_cycle_exists(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_a7_hierarchy_cycle_exists(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.yebs_a7_hierarchy_cycle_exists(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_a7_hierarchy_cycle_exists(uuid, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.yebs_a7_hierarchy_cycle_exists(uuid, uuid) TO service_role;

COMMIT;
