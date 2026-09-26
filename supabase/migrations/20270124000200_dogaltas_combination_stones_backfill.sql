-- =============================================================================
-- 20270124000200_dogaltas_combination_stones_backfill.sql
--
-- DOĞALTAŞ FAZ 2 — legacy stones_text → combination_stones FAIL-SAFE backfill (F-02).
--
-- HEDEF: mevcut ~196 variant / ~140 başlık kombinasyonun stones_text CSV'sini
-- ilişkisel junction'a taşımak — VERİ KAYBI OLMADAN.
--
-- GÜVENLİK / FAIL-SAFE İLKELERİ:
--   - stones_text KOLONU KORUNUR (silinmez, değiştirilmez). Bu geriye-uyum aynasıdır.
--   - Her token için snapshot_name DAİMA saklanır (eşleşme olmasa bile veri kaybı yok).
--   - Ambiguous (isim → >1 taş) veya unmatched (isim → 0 taş) tahmin EDİLMEZ:
--       stone_id = NULL bırakılır, snapshot_name korunur, audit tablosuna yazılır.
--   - IDEMPOTENT: yalnızca HENÜZ junction satırı OLMAYAN kombinasyonlar işlenir.
--       Tekrar apply → NOT EXISTS ile atlanır (duplicate yok).
--   - Migration ABORT ETMEZ: unmatched/ambiguous normal akış (audit'e düşer).
--
-- ⚠️ ÖN KOŞUL: 20270124000000 (combination_stones + updated_at) apply edilmiş olmalı.
-- ⚠️ APPLY POLİTİKASI: DOSYA. PRODUCTION'A UYGULANMADI. Apply öncesi READ-ONLY
--    preflight (scripts/dogaltas-presale-f2/legacy-backfill-preflight.sql) çalıştırılıp
--    exact/unmatched/ambiguous sayıları Hasan Hoca'ya raporlanmalıdır (final gate).
-- =============================================================================

BEGIN;

-- public.dogaltas_normalize_name 20270124000000'de tanımlıdır (bu migration ondan
-- SONRA çalışır). Türkçe-duyarlı isim normalizasyonu app normalizeTr ile hizalıdır.

-- ── Audit tablosu (token bazında çözüm izi) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.combination_stones_backfill_audit (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  combination_id uuid        NOT NULL,
  tenant_id      uuid        NOT NULL,
  token          text        NOT NULL,
  match_count    integer     NOT NULL,
  resolved_stone_id uuid,
  status         text        NOT NULL,   -- 'matched' | 'unmatched' | 'ambiguous'
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.combination_stones_backfill_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.combination_stones_backfill_audit FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS csb_audit_status_idx
  ON public.combination_stones_backfill_audit (status);

-- ── 1) Junction backfill (yalnız junction'ı BOŞ kombinasyonlar) ───────────────
INSERT INTO public.combination_stones
  (combination_id, stone_id, snapshot_name, tenant_id, sort_order)
SELECT
  c.id,
  m.stone_id,                         -- tam-tek eşleşmede id, aksi halde NULL
  tok.name,                           -- snapshot_name DAİMA korunur
  c.tenant_id,
  (tok.ord - 1)::integer
FROM public.combinations c
CROSS JOIN LATERAL (
  SELECT btrim(t.tok) AS name, t.ord
  FROM regexp_split_to_table(COALESCE(c.stones_text, ''), ',') WITH ORDINALITY AS t(tok, ord)
  WHERE btrim(t.tok) <> ''
) tok
LEFT JOIN LATERAL (
  SELECT
    CASE WHEN count(*) = 1 THEN max(s.id) ELSE NULL END AS stone_id
  FROM public.stones s
  WHERE s.tenant_id = c.tenant_id
    AND public.dogaltas_normalize_name(s.stone_name) = public.dogaltas_normalize_name(tok.name)
) m ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.combination_stones cs WHERE cs.combination_id = c.id
);

-- ── 2) Audit izi (aynı token seti; yalnız audit'i olmayan kombinasyonlar) ──────
INSERT INTO public.combination_stones_backfill_audit
  (combination_id, tenant_id, token, match_count, resolved_stone_id, status)
SELECT
  c.id, c.tenant_id, tok.name, m.n,
  CASE WHEN m.n = 1 THEN m.stone_id ELSE NULL END,
  CASE WHEN m.n = 1 THEN 'matched' WHEN m.n = 0 THEN 'unmatched' ELSE 'ambiguous' END
FROM public.combinations c
CROSS JOIN LATERAL (
  SELECT btrim(t.tok) AS name, t.ord
  FROM regexp_split_to_table(COALESCE(c.stones_text, ''), ',') WITH ORDINALITY AS t(tok, ord)
  WHERE btrim(t.tok) <> ''
) tok
LEFT JOIN LATERAL (
  SELECT count(*) AS n, CASE WHEN count(*) = 1 THEN max(s.id) ELSE NULL END AS stone_id
  FROM public.stones s
  WHERE s.tenant_id = c.tenant_id
    AND public.dogaltas_normalize_name(s.stone_name) = public.dogaltas_normalize_name(tok.name)
) m ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.combination_stones_backfill_audit a WHERE a.combination_id = c.id
);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT status, count(*) FROM public.combination_stones_backfill_audit GROUP BY status;
--   -- matched / unmatched / ambiguous dağılımı
--   SELECT count(*) FROM public.combination_stones;         -- toplam junction satırı
--   SELECT count(*) FROM public.combination_stones WHERE stone_id IS NULL;  -- fallback-only
--   -- stones_text HÂLÂ mevcut ve dokunulmamış:
--   SELECT count(*) FROM public.combinations WHERE COALESCE(stones_text,'') <> '';
--
-- NOT: unmatched/ambiguous satırlar snapshot_name ile GÖRÜNÜR kalır; UI "silinmiş/
--   eşleşmemiş taş" göstergesiyle sunar. İleride manuel/otomatik yeniden-eşleştirme
--   audit tablosundan yürütülebilir. stones_text DROP'u AYRI kontrollü migration.
-- =============================================================================
