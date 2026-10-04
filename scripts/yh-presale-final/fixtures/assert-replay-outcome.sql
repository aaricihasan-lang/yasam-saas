-- YH satış öncesi nihai — ASSERT: replay + tenant reddi + outcome + NULL tenant + reconcile (yerel PG).
-- Her blok başarısızlıkta RAISE EXCEPTION 'ASSERT <ad>: ...' ile durur.

-- Cupping CDC trigger (prod'da 20261222000000; fixture'da minimal tablo için burada bağlanır).
CREATE TRIGGER yh_cdc_cupping_points_trg AFTER INSERT OR UPDATE OR DELETE ON public.cupping_points
  FOR EACH ROW EXECUTE FUNCTION public.yh_cdc_enqueue('kupa_hacamat:points', 'cupping_points');

DO $a$
DECLARE
  c_owner constant uuid := 'aa8b960b-f4f1-4e5b-89f5-109bc030c147';
  c_a     constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  c_demo  constant uuid := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_leg   constant uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  IF NOT public.yh_replay_tenant_valid(c_owner) THEN RAISE EXCEPTION 'ASSERT tenant-owner: owner admin tenant gecerli olmali'; END IF;
  IF NOT public.yh_replay_tenant_valid(c_a) THEN RAISE EXCEPTION 'ASSERT tenant-expert: uzman tenant gecerli olmali'; END IF;
  IF public.yh_replay_tenant_valid(c_demo) THEN RAISE EXCEPTION 'ASSERT tenant-demo: demo reddedilmeli'; END IF;
  IF public.yh_replay_tenant_valid(c_leg) THEN RAISE EXCEPTION 'ASSERT tenant-userless: kullanicisiz tenant reddedilmeli'; END IF;
  IF public.yh_replay_tenant_valid(NULL) THEN RAISE EXCEPTION 'ASSERT tenant-null: NULL reddedilmeli'; END IF;
END
$a$;

-- Aktivasyon KAPALIYKEN oluşan kayıt olay üretmez (kök neden) → replay telafi eder.
DO $b$
DECLARE
  c_owner constant uuid := 'aa8b960b-f4f1-4e5b-89f5-109bc030c147';
  v_res jsonb; v_res2 jsonb; v_n int; v_last uuid;
BEGIN
  UPDATE public.yh_source_activation SET is_active = false WHERE source_key = 'kupa_hacamat:points';
  INSERT INTO public.cupping_points (tenant_id, name) VALUES (c_owner, 'ZZ nokta 1'), (c_owner, 'ZZ nokta 2'), (c_owner, 'ZZ nokta 3');
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_key = 'kupa_hacamat:points';
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT pre-activation: pasif kaynakta olay olusmamali (%)', v_n; END IF;

  BEGIN
    PERFORM public.yh_outbox_replay_enqueue('kupa_hacamat:points', c_owner, 'missing', 10, NULL);
    RAISE EXCEPTION 'ASSERT replay-inactive: pasif kaynakta replay reddedilmeliydi';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'ASSERT%' THEN RAISE; END IF;
  END;

  UPDATE public.yh_source_activation SET is_active = true WHERE source_key = 'kupa_hacamat:points';
  v_res := public.yh_outbox_replay_enqueue('kupa_hacamat:points', c_owner, 'missing', 2, NULL);
  IF (v_res->>'enqueued')::int <> 2 OR (v_res->>'done')::boolean THEN RAISE EXCEPTION 'ASSERT replay-page1: %', v_res; END IF;
  v_last := (v_res->>'last_id')::uuid;
  v_res2 := public.yh_outbox_replay_enqueue('kupa_hacamat:points', c_owner, 'missing', 2, v_last);
  IF (v_res2->>'enqueued')::int <> 1 OR NOT (v_res2->>'done')::boolean THEN RAISE EXCEPTION 'ASSERT replay-page2: %', v_res2; END IF;

  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_key = 'kupa_hacamat:points' AND replay = true AND status = 'pending';
  IF v_n <> 3 THEN RAISE EXCEPTION 'ASSERT replay-rows: 3 replay satiri beklenir (%)', v_n; END IF;

  -- İdempotent: aynı replay tekrar → satır sayısı değişmez.
  PERFORM public.yh_outbox_replay_enqueue('kupa_hacamat:points', c_owner, 'missing', 10, NULL);
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_key = 'kupa_hacamat:points';
  IF v_n <> 3 THEN RAISE EXCEPTION 'ASSERT replay-idempotent: satir sayisi degismemeli (%)', v_n; END IF;

  -- Gerçek CDC olayı (GUC yok) → replay=false (webhook tetiklenir).
  UPDATE public.cupping_points SET name = 'ZZ nokta 1b' WHERE name = 'ZZ nokta 1';
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox o JOIN public.cupping_points p ON p.id = o.source_id
    WHERE p.name = 'ZZ nokta 1b' AND o.replay = false;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT cdc-not-replay: gercek olay replay=false olmali (%)', v_n; END IF;
END
$b$;

-- Tenant / kaynak reddi
DO $c$
DECLARE
  c_demo constant uuid := '40f842a0-e3e8-448c-8971-9a938e1faccb';
  c_leg  constant uuid := '11111111-1111-1111-1111-111111111111';
  c_owner constant uuid := 'aa8b960b-f4f1-4e5b-89f5-109bc030c147';
BEGIN
  BEGIN PERFORM public.yh_outbox_replay_enqueue('kupa_hacamat:points', c_demo, 'missing', 10, NULL);
        RAISE EXCEPTION 'ASSERT reject-demo';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'ASSERT%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.yh_outbox_replay_enqueue('kupa_hacamat:points', c_leg, 'missing', 10, NULL);
        RAISE EXCEPTION 'ASSERT reject-userless';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'ASSERT%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.yh_outbox_replay_enqueue('numeroloji:sources', c_owner, 'missing', 10, NULL);
        RAISE EXCEPTION 'ASSERT reject-out-of-scope-source';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'ASSERT%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.yh_outbox_replay_enqueue('kupa_hacamat:points; drop table x', c_owner, 'missing', 10, NULL);
        RAISE EXCEPTION 'ASSERT reject-injection-key';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'ASSERT%' THEN RAISE; END IF; END;
  BEGIN PERFORM public.yh_outbox_replay_enqueue('kupa_hacamat:points', c_owner, 'everything', 10, NULL);
        RAISE EXCEPTION 'ASSERT reject-mode';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'ASSERT%' THEN RAISE; END IF; END;
END
$c$;

-- Orphan (kaynağı olmayan index satırı) → 'orphans' modu yakalar; coverage sayımları.
DO $d$
DECLARE
  c_owner constant uuid := 'aa8b960b-f4f1-4e5b-89f5-109bc030c147';
  v_ghost uuid := gen_random_uuid();
  v_res jsonb; v_cov record; v_n int;
BEGIN
  INSERT INTO public.yasam_hafizasi_index (tenant_id, source_module, source_table, source_id, title, search_text)
  VALUES (c_owner, 'kupa_hacamat', 'cupping_points', v_ghost, 'ZZ hayalet', 'ZZ hayalet');
  v_res := public.yh_outbox_replay_enqueue('kupa_hacamat:points', c_owner, 'orphans', 50, NULL);
  IF (v_res->>'enqueued')::int <> 1 THEN RAISE EXCEPTION 'ASSERT orphans: 1 hayalet beklenir (%)', v_res; END IF;
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_id = v_ghost AND operation = 'upsert';
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT orphans-row: hayalet icin upsert olayi yok'; END IF;

  SELECT * INTO v_cov FROM public.yh_replay_coverage('kupa_hacamat:points') WHERE tenant_id = c_owner;
  IF v_cov.source_rows <> 3 OR v_cov.eligible <> 3 OR v_cov.missing <> 3 OR v_cov.stale <> 1 THEN
    RAISE EXCEPTION 'ASSERT coverage-owner: %', row_to_json(v_cov);
  END IF;
  SELECT count(*) INTO v_n FROM public.yh_replay_coverage('kupa_hacamat:points');
  IF v_n <> 3 THEN RAISE EXCEPTION 'ASSERT coverage-tenants: yalniz 3 gercek tenant (owner,A,B) beklenir (%)', v_n; END IF;
END
$d$;

-- Outcome (complete v2) + satır işaretleyici
DO $e$
DECLARE
  v_id uuid; v_ver bigint; v_r text; v_o text; v_rep boolean;
BEGIN
  SELECT id, event_version INTO v_id, v_ver FROM public.yasam_hafizasi_outbox WHERE source_key = 'kupa_hacamat:points' LIMIT 1;
  UPDATE public.yasam_hafizasi_outbox SET status = 'processing', locked_at = now(), locked_by = 'zz-worker' WHERE id = v_id;
  v_r := public.yh_outbox_complete_v2(v_id, 'zz-worker', v_ver, 'indexed');
  SELECT last_outcome INTO v_o FROM public.yasam_hafizasi_outbox WHERE id = v_id;
  IF v_r <> 'succeeded' OR v_o IS DISTINCT FROM 'indexed' THEN RAISE EXCEPTION 'ASSERT outcome: % %', v_r, v_o; END IF;

  -- Yeni gerçek olay → last_outcome temizlenir, replay=false.
  UPDATE public.yasam_hafizasi_outbox
    SET status = 'pending', processed_at = NULL, event_version = nextval('public.yasam_hafizasi_outbox_event_version_seq')
    WHERE id = v_id;
  SELECT last_outcome, replay INTO v_o, v_rep FROM public.yasam_hafizasi_outbox WHERE id = v_id;
  IF v_o IS NOT NULL OR v_rep THEN RAISE EXCEPTION 'ASSERT outcome-reset: % %', v_o, v_rep; END IF;

  BEGIN
    UPDATE public.yasam_hafizasi_outbox SET status = 'processing', locked_at = now(), locked_by = 'zz-worker' WHERE id = v_id;
    SELECT event_version INTO v_ver FROM public.yasam_hafizasi_outbox WHERE id = v_id;
    PERFORM public.yh_outbox_complete_v2(v_id, 'zz-worker', v_ver, 'BAD OUTCOME!');
    RAISE EXCEPTION 'ASSERT outcome-validate: gecersiz outcome reddedilmeliydi';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'ASSERT%' THEN RAISE; END IF; END;
END
$e$;

-- NULL tenant (eski ortak/canonical) satırlar ENQUEUE EDİLMEZ; tenant → NULL eski index'i siler.
DO $f$
DECLARE
  c_a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_oil uuid; v_sheet_null uuid; v_sheet_a uuid; v_row_null uuid; v_row_a uuid; v_n int; v_op text; v_t uuid;
BEGIN
  INSERT INTO public.aromatherapy_oils (tenant_id, name) VALUES (NULL, 'ZZ canonical yag') RETURNING id INTO v_oil;
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_id = v_oil;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT null-oil: NULL tenant yag enqueue edilmemeli'; END IF;

  INSERT INTO public.aromatherapy_oils (tenant_id, name) VALUES (c_a, 'ZZ uzman yag') RETURNING id INTO v_oil;
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_id = v_oil AND tenant_id = c_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ASSERT tenant-oil: uzman yagi enqueue edilmeli'; END IF;

  UPDATE public.aromatherapy_oils SET tenant_id = NULL WHERE id = v_oil;
  SELECT operation, tenant_id INTO v_op, v_t FROM public.yasam_hafizasi_outbox WHERE source_id = v_oil;
  IF v_op <> 'delete' OR v_t IS DISTINCT FROM c_a THEN RAISE EXCEPTION 'ASSERT tenant-to-null: eski tenant delete beklenir (% %)', v_op, v_t; END IF;

  INSERT INTO public.aromatherapy_reference_sheets (tenant_id, display_title) VALUES (NULL, 'ZZ canonical sheet') RETURNING id INTO v_sheet_null;
  INSERT INTO public.aromatherapy_reference_rows (sheet_id, cells) VALUES (v_sheet_null, '{"0":"ZZ"}') RETURNING id INTO v_row_null;
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_id IN (v_sheet_null, v_row_null);
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT null-sheet: canonical sheet/satir enqueue edilmemeli (%)', v_n; END IF;

  INSERT INTO public.aromatherapy_reference_sheets (tenant_id, display_title) VALUES (c_a, 'ZZ uzman sheet') RETURNING id INTO v_sheet_a;
  INSERT INTO public.aromatherapy_reference_rows (sheet_id, cells) VALUES (v_sheet_a, '{"0":"ZZ"}') RETURNING id INTO v_row_a;
  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE source_id IN (v_sheet_a, v_row_a) AND tenant_id = c_a;
  IF v_n <> 2 THEN RAISE EXCEPTION 'ASSERT tenant-sheet: uzman sheet+satir enqueue edilmeli (%)', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.yasam_hafizasi_outbox WHERE tenant_id IS NULL;
  IF v_n <> 0 THEN RAISE EXCEPTION 'ASSERT no-null-outbox: NULL tenant olay olmamali (%)', v_n; END IF;
END
$f$;

-- Owner tenant artık sentetik DEĞİL: stones reconcile enqueue owner için çalışır.
DO $g$
DECLARE
  c_owner constant uuid := 'aa8b960b-f4f1-4e5b-89f5-109bc030c147';
  v_stone uuid; v_out text;
BEGIN
  INSERT INTO public.stones (tenant_id, stone_name) VALUES (c_owner, 'ZZ ametist') RETURNING id INTO v_stone;
  SELECT r.outcome INTO v_out FROM public.yh_outbox_reconcile_enqueue('dogaltas:stones', 'stones', v_stone, c_owner, 'upsert') AS r;
  IF v_out IS NULL THEN RAISE EXCEPTION 'ASSERT reconcile-owner: owner icin reconcile calismali'; END IF;
END
$g$;
