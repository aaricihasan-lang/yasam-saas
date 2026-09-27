-- ─────────────────────────────────────────────────────────────────────────────
-- Doğaltaş HOTFIX — combination RPC'lerinde `max(uuid)` çalışma-anı hatası
--
-- Sorun (prod, 2026-09-27 final UAT): 20270124000000 ile gelen
--   create_combination_with_stones / update_combination_with_stones
-- LATERAL alt sorgusunda `max(s.id)` kullanıyor. PostgreSQL'de uuid için max()
-- aggregate YOKTUR → her çağrı `42883 function max(uuid) does not exist` ile
-- düşer (plpgsql gövdesi apply anında değil, ilk çağrıda planlandığı için
-- migration başarıyla uygulanmıştı). Sonuç: Kombinasyon Sepeti "Kaydet" 500.
--
-- Düzeltme: `max(s.id)` → `(array_agg(s.id))[1]`. Yalnız count(*) = 1 dalında
-- kullanıldığı için anlam birebir aynı (tek eşleşmenin id'si). Başka HİÇBİR
-- satır değişmez: imza, SECURITY DEFINER, search_path = '', grant'lar aynı.
--
-- Kapsam: yalnız bu iki fonksiyonun gövdesi (CREATE OR REPLACE). Tablo/veri/
-- index/RLS değişikliği YOK. Veri mutasyonu YOK. Idempotent.
-- Geri alma: 20270124000000'deki tanım (zaten kırık) — geri almaya gerek yok.
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
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(s.id))[1] END AS rid
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
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(s.id))[1] END AS rid
    FROM public.stones s
    WHERE s.tenant_id = p_tenant_id
      AND public.dogaltas_normalize_name(s.stone_name) = public.dogaltas_normalize_name(e->>'snapshot_name')
  ) r ON true;

  RETURN jsonb_build_object('id', p_combination_id, 'updated_at', v_new_updated);
END;
$$;


REVOKE ALL ON FUNCTION public.create_combination_with_stones(uuid,text,text,text,text,integer,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_combination_with_stones(uuid,text,text,text,text,integer,text,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.update_combination_with_stones(uuid,uuid,text,text,text,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_combination_with_stones(uuid,uuid,text,text,text,jsonb,timestamptz) TO service_role;
