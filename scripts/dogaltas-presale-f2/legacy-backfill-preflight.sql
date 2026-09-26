-- =============================================================================
-- Doğaltaş FAZ 2 — stones_text → combination_stones LEGACY BACKFILL PREFLIGHT
-- SALT-OKUMA. Hiçbir mutation yapmaz. Backfill migration'ı (20270124000200)
-- PRODUCTION'A APPLY EDİLMEDEN ÖNCE Supabase SQL editöründe çalıştırılıp
-- sonuçlar (exact/unmatched/ambiguous) rapor edilmelidir (final apply gate).
--
-- ÖN KOŞUL: dogaltas_normalize_name fonksiyonu mevcut olmalı. Eğer henüz apply
-- edilmediyse, aşağıdaki inline normalize (translate+lower) ile aynı sonucu verir;
-- fonksiyon varsa public.dogaltas_normalize_name(...) tercih edilir.
-- =============================================================================

-- (0) Genel sayımlar
SELECT
  (SELECT count(*) FROM public.combinations)                                   AS total_combinations,
  (SELECT count(*) FROM public.combinations WHERE COALESCE(stones_text,'')<>'') AS combinations_with_text;

-- (1) Token bazında çözüm dağılımı (exact / unmatched / ambiguous)
WITH tokens AS (
  SELECT
    c.id AS combination_id,
    c.tenant_id,
    btrim(t.tok) AS token
  FROM public.combinations c
  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(c.stones_text,''), ',') AS t(tok)
  WHERE btrim(t.tok) <> ''
),
norm AS (
  SELECT
    tk.*,
    btrim(regexp_replace(lower(translate(tk.token, 'IİıÇçĞğÖöŞşÜü','iiiccggoossuu')), '\s+',' ','g')) AS ntoken
  FROM tokens tk
),
matched AS (
  SELECT
    n.combination_id, n.tenant_id, n.token,
    (SELECT count(*) FROM public.stones s
       WHERE s.tenant_id = n.tenant_id
         AND btrim(regexp_replace(lower(translate(s.stone_name,'IİıÇçĞğÖöŞşÜü','iiiccggoossuu')),'\s+',' ','g')) = n.ntoken
    ) AS match_count
  FROM norm n
)
SELECT
  count(*)                                        AS total_tokens,
  count(*) FILTER (WHERE match_count = 1)          AS exact_unique_match,
  count(*) FILTER (WHERE match_count = 0)          AS unmatched,
  count(*) FILTER (WHERE match_count > 1)          AS ambiguous
FROM matched;

-- (2) Örnek unmatched tokenlar (ilk 50) — manuel inceleme için
WITH tokens AS (
  SELECT c.id AS combination_id, c.tenant_id, btrim(t.tok) AS token
  FROM public.combinations c
  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(c.stones_text,''), ',') AS t(tok)
  WHERE btrim(t.tok) <> ''
)
SELECT tk.token, count(*) AS occurrences
FROM tokens tk
WHERE (SELECT count(*) FROM public.stones s
         WHERE s.tenant_id = tk.tenant_id
           AND btrim(regexp_replace(lower(translate(s.stone_name,'IİıÇçĞğÖöŞşÜü','iiiccggoossuu')),'\s+',' ','g'))
             = btrim(regexp_replace(lower(translate(tk.token,'IİıÇçĞğÖöŞşÜü','iiiccggoossuu')),'\s+',' ','g'))
      ) = 0
GROUP BY tk.token
ORDER BY occurrences DESC, tk.token
LIMIT 50;

-- (3) Ambiguous örnekleri (isim → birden fazla taş)
WITH tokens AS (
  SELECT c.id AS combination_id, c.tenant_id, btrim(t.tok) AS token
  FROM public.combinations c
  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(c.stones_text,''), ',') AS t(tok)
  WHERE btrim(t.tok) <> ''
)
SELECT tk.token, tk.tenant_id,
  (SELECT count(*) FROM public.stones s
     WHERE s.tenant_id = tk.tenant_id
       AND btrim(regexp_replace(lower(translate(s.stone_name,'IİıÇçĞğÖöŞşÜü','iiiccggoossuu')),'\s+',' ','g'))
         = btrim(regexp_replace(lower(translate(tk.token,'IİıÇçĞğÖöŞşÜü','iiiccggoossuu')),'\s+',' ','g'))
  ) AS match_count
FROM tokens tk
WHERE (SELECT count(*) FROM public.stones s
         WHERE s.tenant_id = tk.tenant_id
           AND btrim(regexp_replace(lower(translate(s.stone_name,'IİıÇçĞğÖöŞşÜü','iiiccggoossuu')),'\s+',' ','g'))
             = btrim(regexp_replace(lower(translate(tk.token,'IİıÇçĞğÖöŞşÜü','iiiccggoossuu')),'\s+',' ','g'))
      ) > 1
GROUP BY tk.token, tk.tenant_id
ORDER BY match_count DESC
LIMIT 50;
