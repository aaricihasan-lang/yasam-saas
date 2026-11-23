-- =============================================================================
-- D (v2) - yh_cdc_enqueue() PRODUCTION / REPO SATIR FARKI - TEK SONUC - YALNIZ OKUMA
--   Tek ifade, tek satir (jsonb). Islem korumasi KULLANILMAZ, salt-okunurluk sorgunun yapisindan gelir:
--   yalniz bir SELECT, yalniz yerlesik IMMUTABLE veya STABLE fonksiyonlar, DML DDL dinamik SQL YOK.
--   Fonksiyon CAGRILMAZ, yalniz pg_proc katalogu okunur.
--   PRODUCTION GOVDE METNI CIKTIYA YAZILMAZ: satirlar yalniz md5 ile karsilastirilir, farkli satirlar icin
--   yalniz satir no + uzunluk + evet/hayir isaretleri doner. Repo metni de sorguda YOKTUR (yalniz satir md5).
--   Repo kaynagi: supabase/migrations/20260927000000_yh_source_activation_control.sql (tek tanim, 84 satir).
--   v2 notu: ilk surumde metin sabitleri SQL metni icerdigi icin SQL Editor istemci tarafinda bozulabiliyordu.
--   Bu surumde metin sabitlerinde cift tire, noktali virgul, ters bolu, dolar ve ic tirnak YOKTUR.
-- =============================================================================
WITH repo(no, md5_tam, md5_bosluksuz) AS (VALUES
  (1, 'd41d8cd98f00b204e9800998ecf8427e', 'd41d8cd98f00b204e9800998ecf8427e'),
  (2, '7b8200502d7d084eac348e93e0f00ea6', '7b8200502d7d084eac348e93e0f00ea6'),
  (3, '58ec96b0d17c381c7a787c6e7fdbf4c1', '93cf128ebbd30d8fe4e0de36c4d26d13'),
  (4, 'cc1c373cba9fe86c52e372671de0034e', '13c320e346a7e647f5170957084c39d6'),
  (5, '54e787ec72087fae07e8225c498b0e8c', '2a3f0b618effcfe7767bba730e46e7cc'),
  (6, 'bdd998fab3ae9d1327cb0dc506fc5481', 'ed964a435bfba9ac2fc59724c67e4425'),
  (7, '030ec884fa477ecf98d52b18559afa2e', '44fe9cbc8aa8ee4b422183783a1f6cc8'),
  (8, 'bbbc2f671e4db99620c7b8b8163992a6', '79140302663ee64606fc03cb16feb2ed'),
  (9, '19aad9f2fe3ce0023298ab83f7e75775', '19aad9f2fe3ce0023298ab83f7e75775'),
  (10, 'a62ceb8f076224187cb815407bd65038', '8fad6a1d1399e608792595e4562b76a0'),
  (11, 'caaa90b273e96238126c12e632df3595', '556202553ee822cbe12bf861746e56cc'),
  (12, 'e4450082c5c6d009e21e077c956243d3', '7d158aa4595bd5ed57284e75d34c0d94'),
  (13, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (14, '78e03fe537cc165bc0ac505c3eb3ef9d', 'ec0e0572cf3481e070eff151f147d2f2'),
  (15, '92973d3876e22e6bd278ef1830c634e2', 'a3edd90ee35c793d95c2e4036415e89c'),
  (16, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (17, 'ce195d9bc5a00f4cbaecff45face7d95', 'a027441142d15693f6942b0373bdaa65'),
  (18, 'a38eb6ab7fb182e0141e4c6e72f23fbb', 'fea797e31476a794d857af1f492a3a2d'),
  (19, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (20, 'd0fc6bef8caaef839a64cb527d333718', 'a3764f9106d1f6e0648c27a3f312a97f'),
  (21, '69a922c0c514b3c4314bd3e54cba0125', '8b70f88d255f65749978dab8f636c36b'),
  (22, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (23, 'd41d8cd98f00b204e9800998ecf8427e', 'd41d8cd98f00b204e9800998ecf8427e'),
  (24, '90dada8c3e4334fe024da3f18cad3c21', '9f592bee77884e064c7fa16931be9ba6'),
  (25, '777b55b3a5561745038b1996a7f22575', '7c9bbd99a41afccdc6bd45647d4c18cc'),
  (26, 'd23a2ab9d111ca1cd9cc6ef391b375f5', '43b70bf0a39cfd28fde12c851ec32586'),
  (27, '90fbaf9c8542bf9dd655cf31e995f434', '5218588e62c74c6cd55530d2427a403d'),
  (28, 'e36044fcd32479c859392e96d612e4eb', '8a55773ef60aef2680e7dc8a5988ec8c'),
  (29, '5cb9894f9b40f1c5046b471bebd3d26c', 'b52de076ff71be7666d2e4420a975aa6'),
  (30, 'd41d8cd98f00b204e9800998ecf8427e', 'd41d8cd98f00b204e9800998ecf8427e'),
  (31, '23b7041f354723f8f1bf5f699fc1140f', 'b042c77fe414310bd1d491a9a9ff003d'),
  (32, '3622c1607fc7373192ed71aff0704d3c', '427c547025ce44950865e9ef75afee7f'),
  (33, 'fd268fcd0d161928af0532173fa58534', '343a5d553a669c1e736542de36b544b5'),
  (34, '03a7a95e416793c5d89ef8ad33d9b1ee', '4d166be299b70608a9de5f5df9478ad6'),
  (35, '3eae1413077cb4fc170d46d766b5822c', 'b92b9beaea72bb5bc011626c0142eff5'),
  (36, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (37, 'd41d8cd98f00b204e9800998ecf8427e', 'd41d8cd98f00b204e9800998ecf8427e'),
  (38, '152342bf41e8c1fa9d41a19249949be5', 'f8e27998de3e368d8ce4f2ded6a2fd67'),
  (39, '986190c9a291cc2c3b01bb7ba9d9f3bf', '8bc2b167b2510df104f169d42ab4ef6d'),
  (40, 'be27b768e1074ad3ccda096a6d92b9d0', '45f0c9fea103eb26ebe3f85d2ff9160f'),
  (41, '631418b763f256c8083a156d2b5e79ae', '4176a37c7adf5cace69ed6fe415c0e57'),
  (42, 'd739640f1cfe2ffa2094f3fe0de98c13', 'f8153c4f8bf7a26446894e98ac2cb000'),
  (43, '7a9740e9c32da10735c4037501ea7226', 'd0e0c6bb95582132ec0e43d01c7b7bfa'),
  (44, '769483591e65bc2029465148f9e6ebae', 'c2ae642e1c54d072f149e90c49e2f995'),
  (45, 'c90a051ef53d504f0bef4a1ba74b9687', 'ceade28421b22ec5b75f2e04b2ba43ac'),
  (46, '8b89b0d4ae8c8db1fdfd3752afcc11fa', '6232521a98159dfada7bec6606c64819'),
  (47, '29a5f8a8d0ae32505fb2d2e9f3183487', '778537b0acce06229cb78d5f72c907ab'),
  (48, '7f8e460bcd5db1f778bbd5e93707e9fe', 'd693ae5c790bf40d1aa64bfea7dce293'),
  (49, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (50, 'd41d8cd98f00b204e9800998ecf8427e', 'd41d8cd98f00b204e9800998ecf8427e'),
  (51, 'ee72ed6611cdbe5936cf4ded2ddf98d3', '337cc30f7d2b8b665742211f9b251540'),
  (52, 'f68a1aaedc8bcf568d60c784c7abf62e', '22fab0f05eae05148a5226e8e452942d'),
  (53, 'a6874bf728d184a463f347cdee0d0499', 'feaf95b62d9a12b932d4862db3ecbbf9'),
  (54, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (55, '4a7b274f952ee0e5e438385daa9e492d', 'dfdb6f47760f2fc6901c876d42bc78db'),
  (56, '014a65a868635f101283a8893cefd6c4', '47104c611d8537a2f60c5fb73b43811e'),
  (57, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (58, 'd41d8cd98f00b204e9800998ecf8427e', 'd41d8cd98f00b204e9800998ecf8427e'),
  (59, '50aa501bd5ffe8f68b8b0531be821038', '31022924320cb3d9000b49e90d31280d'),
  (60, '0d39886f2662e9fca9e200c411db8912', 'a1d991991eddb8c6e9c7dbf7fc7ba71b'),
  (61, '9438d7e22ac7566e529fbb96bdd4477f', 'ceb72c04af353e90fb299b7786620be9'),
  (62, '98dac32ac8d56d8b5bfa243f68efd050', 'b7db4588385c4fc7ed5211c35c711598'),
  (63, '2eee1df9e6b2bd4e15f0aee5039523e7', 'e574566546b2d90bbb418d70bac6b89e'),
  (64, 'e7a18c4b5344670fc1bffb74ccc1ac36', 'ecffb16e93010b45ef967651a9919b8f'),
  (65, 'de8b063a85470b486705cc9b83574e44', 'f16b62e0a3843c24bc963f02a0044bac'),
  (66, 'a71f5f1a9665675f24da591fdc1589fd', 'cd7b63417152f1db486a45beba1562a9'),
  (67, 'c64aa10546c31b4056cb3733a659a2bd', '845977a7e4b73f821bc20bcc51701910'),
  (68, '4687071441b13f5c60ba48b6a2ae6cea', '42d333e892283b794c54c039e38f6ba5'),
  (69, '0e2c0bd133976ad81961d717da8dedc1', '8a3254481bc89ce02810873900092345'),
  (70, 'c8ffb40fde5199ff54e3ebbcc8eee43d', 'f6ba1dbeb0427283aa66ceffdd362322'),
  (71, '854d61ddfd0c8bc51d88b54ff9d9f2da', '6a5918c7d59f2229ef67868e191be819'),
  (72, 'a790d7f601f7ffd51317b9262925ab59', 'a0cd9d2c3ca07fa26e110059821048cb'),
  (73, 'd1484701b6186afbef50df1fc7040a49', 'c090bb3a8752d670a9584defe7125067'),
  (74, '890653f39052ad4c837265ea2fcab98e', '37262e163cf4fc555a79627bd0630dee'),
  (75, 'e9339e026614fe1bed10b2b3e8059952', '78141848d1b4f4f2c52af330ea2c9b5c'),
  (76, 'c158315241aba78b19aa2f59881dbae2', 'ddab13db67014cd395e7c349ac761501'),
  (77, 'd96519286ac34ccf91be262c5b55fcc5', 'b14911f3578d8ca580f9f1465b73db12'),
  (78, 'd41d8cd98f00b204e9800998ecf8427e', 'd41d8cd98f00b204e9800998ecf8427e'),
  (79, 'bc5046808ef8c88bafaffb556ecb2363', '427c547025ce44950865e9ef75afee7f'),
  (80, 'c415bcdad970c08fc3d555acab766d33', '343a5d553a669c1e736542de36b544b5'),
  (81, 'fa66e52b652f61b0f53bf4502a8a3891', '4d166be299b70608a9de5f5df9478ad6'),
  (82, '55421325fc645006a50cdc8aa4944843', 'b92b9beaea72bb5bc011626c0142eff5'),
  (83, '3450a92350f14261fcfaae6eccc95191', '3450a92350f14261fcfaae6eccc95191'),
  (84, 'd41d8cd98f00b204e9800998ecf8427e', 'd41d8cd98f00b204e9800998ecf8427e')),
fn AS (SELECT p.prosrc, p.prosecdef, p.provolatile, p.proowner::regrole::text AS sahip,
              coalesce(p.proconfig = ARRAY['search_path=public, pg_catalog']::text[], false) AS search_path_beklenen
       FROM pg_proc p WHERE p.oid = to_regprocedure('public.yh_cdc_enqueue()')),
prod AS (SELECT t.no::int AS no, md5(rtrim(t.l, chr(13))) AS md5_tam, md5(btrim(t.l, ' ' || chr(9) || chr(13))) AS md5_bosluksuz,
                length(t.l) AS uzunluk, t.l, upper(t.l) AS u, lower(t.l) AS k
         FROM fn, regexp_split_to_table(fn.prosrc, chr(10)) WITH ORDINALITY AS t(l, no)),
kapi AS (SELECT min(no) AS no FROM prod WHERE strpos(l, 'FROM public.yh_source_activation') > 0)
SELECT jsonb_build_object(
  'sorgu_surumu', 'D-v2',
  'fonksiyon_var', EXISTS (SELECT 1 FROM fn),
  'govde_md5', (SELECT md5(prosrc) FROM fn),
  'sahip_rol', (SELECT sahip FROM fn),
  'security_definer', (SELECT prosecdef FROM fn), 'volatility', (SELECT provolatile FROM fn),
  'search_path_beklenen', (SELECT search_path_beklenen FROM fn),
  'satir_sayisi', jsonb_build_object('production', (SELECT count(*) FROM prod), 'repo', (SELECT count(*) FROM repo)),
  'yalniz_bosluk_farki_satir', (SELECT count(*) FROM prod p WHERE NOT EXISTS (SELECT 1 FROM repo r WHERE r.md5_tam = p.md5_tam)
                                  AND EXISTS (SELECT 1 FROM repo r WHERE r.md5_bosluksuz = p.md5_bosluksuz)),
  'production_fazla_satirlar_METINSIZ', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'no', p.no, 'uzunluk', p.uzunluk,
        'tg_argv', strpos(p.u, 'TG_ARGV') > 0,
        'new_old', strpos(p.u, 'NEW.') > 0 OR strpos(p.u, 'OLD.') > 0,
        'aktivasyon', strpos(p.k, 'yh_source_activation') > 0 OR strpos(p.k, 'is_active') > 0,
        'outbox_yazimi', strpos(p.k, 'yasam_hafizasi_outbox') > 0 OR strpos(p.u, 'ON CONFLICT') > 0,
        'raise', strpos(p.u, 'RAISE') > 0, 'return', strpos(p.u, 'RETURN') > 0,
        'kosul', strpos(p.u, 'IF ') > 0 OR strpos(p.u, 'ELSIF') > 0 OR strpos(p.u, 'CASE') > 0 OR strpos(p.u, 'WHEN') > 0,
        'sahiplik_kapsam', strpos(p.k, 'owner') > 0 OR strpos(p.k, 'scope') > 0 OR strpos(p.k, 'kisisel') > 0,
        'dis_cagri_veya_sir_olasi', strpos(p.k, 'http') > 0 OR strpos(p.k, 'net.') > 0 OR strpos(p.k, 'vault') > 0
            OR strpos(p.k, 'secret') > 0 OR strpos(p.k, 'token') > 0 OR strpos(p.k, 'password') > 0
            OR strpos(p.k, 'apikey') > 0 OR strpos(p.k, 'bearer') > 0) ORDER BY p.no), '[]'::jsonb)
      FROM prod p WHERE NOT EXISTS (SELECT 1 FROM repo r WHERE r.md5_bosluksuz = p.md5_bosluksuz)
        AND length(btrim(p.l, ' ' || chr(9) || chr(13))) > 0),
  'repo_eksik_satir_nolari', (SELECT coalesce(jsonb_agg(r.no ORDER BY r.no), '[]'::jsonb)
      FROM repo r WHERE r.md5_bosluksuz <> 'd41d8cd98f00b204e9800998ecf8427e' AND NOT EXISTS (SELECT 1 FROM prod p WHERE p.md5_bosluksuz = r.md5_bosluksuz)),
  'aktivasyon_kapisi', jsonb_build_object(
        'production_satir_no', (SELECT no FROM kapi), 'repo_satir_no', 28,
        'production_kapi_oncesi_raise', (SELECT count(*) FROM prod, kapi WHERE prod.no < kapi.no AND strpos(prod.u, 'RAISE') > 0),
        'repo_kapi_oncesi_raise', 4),
  'v2_sozlesmesi', (SELECT jsonb_build_object(
        'arg0_source_key', strpos(prosrc, 'TG_ARGV[0]') > 0, 'arg1_beklenen_tablo', strpos(prosrc, 'TG_ARGV[1]') > 0,
        'tablo_dogrulamasi', strpos(prosrc, 'TG_TABLE_NAME IS DISTINCT FROM') > 0,
        'aktivasyon_kapisi', strpos(prosrc, 'FROM public.yh_source_activation') > 0 AND strpos(prosrc, 'IS DISTINCT FROM true') > 0,
        'new_id_tenant', strpos(prosrc, 'NEW.id') > 0 AND strpos(prosrc, 'NEW.tenant_id') > 0,
        'old_id_tenant', strpos(prosrc, 'OLD.id') > 0 AND strpos(prosrc, 'OLD.tenant_id') > 0,
        'outbox_insert', strpos(prosrc, 'INSERT INTO public.yasam_hafizasi_outbox') > 0,
        'coalescing', strpos(prosrc, 'ON CONFLICT (source_key, source_id)') > 0,
        'processing_korunur', strpos(prosrc, 'o.status = ' || chr(39) || 'processing' || chr(39)) > 0,
        'insert_update_delete', strpos(prosrc, 'TG_OP = ' || chr(39) || 'DELETE' || chr(39)) > 0 AND strpos(prosrc, 'TG_OP = ' || chr(39) || 'UPDATE' || chr(39)) > 0)
      FROM fn),
  'tetikleyici_baglantilari', (SELECT coalesce(jsonb_agg(jsonb_build_object('tablo', t.tgrelid::regclass::text, 'ad', t.tgname, 'durum', t.tgenabled)
        ORDER BY t.tgrelid::regclass::text, t.tgname), '[]'::jsonb)
      FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgfoid = to_regprocedure('public.yh_cdc_enqueue()'))
) AS yh_cdc_enqueue_fark;
