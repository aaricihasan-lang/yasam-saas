-- =============================================================================
-- AŞAMA 4a · PRODUCTION UYGULAMA SONRASI SALT-OKUNUR DOĞRULAMA (yalnız SELECT; READ ONLY işlem içinde çalıştırılır)
-- Kişisel veri seçilmez. Beklenenler: Z1 hepsi true + ledger 1; Z2 parmak izleri = beklenen-sonrasi-parmak-izi.txt;
-- Z3 5 koruma tetikleyicisi; Z4 yalnız service_role; Z5 arşivde hesap 0 + pasif sınıflandırma öncekiyle aynı;
-- Z6 veri parmak izi = uygulama öncesi (prod-migration/once.txt) aynı.
-- =============================================================================
SELECT 'Z1 nesneler' AS kontrol,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='archived_at') AS archived_at_kolonu,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_archived_inactive_chk' AND convalidated) AS arsiv_check_dogrulanmis,
  to_regprocedure('public.admin_unarchive_user(uuid,uuid)') IS NOT NULL AS unarchive_fn,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20280101000600' AND created_by='pr780-uye-arsiv-4a') AS ledger_000600,
  (SELECT count(DISTINCT m[1]) FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
    WHERE c.conname='admin_audit_action_chk') AS audit_eylem_sayisi;

SELECT 'Z2 parmak_izi' AS kontrol, p.oid::regprocedure::text AS imza, md5(replace(p.prosrc, chr(13), '')) AS md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('admin_archive_user','admin_set_user_active','admin_list_members_v2','admin_member_stage_of',
                     'admin_purge_archived_expert','admin_purge_in_progress','admin_unarchive_user',
                     'admin_purge_require_archived_trg','admin_archived_user_guard_trg','admin_archived_child_guard_trg')
 ORDER BY 2;

SELECT 'Z3 tetikleyiciler' AS kontrol, c.relname AS tablo, t.tgname AS tetikleyici, t.tgenabled AS durum
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND NOT t.tgisinternal
   AND t.tgname IN ('admin_archived_user_guard','admin_purge_require_archived','admin_archived_guard')
 ORDER BY 2, 3;

SELECT 'Z4 yetki' AS kontrol, p.proname AS fonksiyon,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('admin_archive_user','admin_set_user_active','admin_unarchive_user','admin_list_members_v2')
 ORDER BY 2;

SELECT 'Z5 durum' AS kontrol,
  (SELECT count(*) FROM public.users WHERE archived_at IS NOT NULL) AS arsivde,
  (SELECT count(*) FROM public.users WHERE archived_at IS NOT NULL AND active IS TRUE) AS aktif_arsiv_celiskisi,
  (SELECT count(*) FROM public.users WHERE lower(coalesce(role,''))='expert' AND lower(coalesce(approval_status,''))='approved' AND active IS NOT TRUE) AS pasif_onayli_uzman,
  (SELECT count(*) FROM public.admin_purge_context) AS purge_context_satir;

SELECT 'Z6 veri_parmak_izi' AS kontrol,
  (SELECT md5(string_agg((to_jsonb(u) - 'archived_at')::text, E'\n' ORDER BY u.id)) FROM public.users u) AS users_h,
  (SELECT count(*) FROM public.users) AS users_n,
  (SELECT count(*) FROM public.user_payment_history) AS uph_n,
  (SELECT count(*) FROM public.member_pricing_phases) AS mpp_n,
  (SELECT count(*) FROM public.trial_profiles) AS tp_n,
  (SELECT count(*) FROM public.admin_audit_log) AS aal_n;
