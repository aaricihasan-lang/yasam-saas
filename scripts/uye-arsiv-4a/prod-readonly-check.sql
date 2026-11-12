-- =============================================================================
-- AŞAMA 4a · PRODUCTION SALT-OKUNUR ÖN KONTROL (yalnız SELECT; çağıran READ ONLY işlem içinde çalıştırır)
-- Kişisel veri seçilmez: ad / e-posta / kimlik / danışan yok — yalnız şema bilgisi, parmak izi ve TOPLU sayılar.
-- =============================================================================

-- [1] 4a nesneleri bugün canlıda VAR MI (hepsi false beklenir → migration uygulanmamış)
SELECT 'A1 4a_nesneleri' AS kontrol,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='archived_at') AS archived_at_kolonu,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_archived_inactive_chk') AS arsiv_check,
  to_regprocedure('public.admin_unarchive_user(uuid,uuid)') IS NOT NULL AS unarchive_fn,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('admin_archived_user_guard','admin_purge_require_archived','admin_archived_guard') AND NOT tgisinternal) AS koruma_tetikleyicileri,
  (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20280101000600') AS ledger_000600,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS ledger_son;

-- [2] Ön koşullar (hepsi true beklenir)
SELECT 'A2 on_kosullar' AS kontrol,
  to_regclass('public.admin_purge_context') IS NOT NULL AS purge_context,
  to_regprocedure('public.admin_purge_in_progress(uuid,uuid)') IS NOT NULL AS purge_in_progress,
  to_regprocedure('public.admin_purge_archived_expert(uuid,uuid,text)') IS NOT NULL AS purge_fn,
  to_regclass('public.trial_profiles') IS NOT NULL AS trial_profiles,
  to_regclass('public.member_pricing_phases') IS NOT NULL AS pricing_phases,
  to_regclass('public.user_payment_history') IS NOT NULL AS payment_history,
  (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='user_payment_history' AND column_name='user_id') AS payment_history_user_id_tipi,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='astrology_technique_grants') AS astro_grants_kolonu,
  current_setting('server_version') AS pg_surum;

-- [3] Audit CHECK ön koşulu: canlı eylem kümesi = depodaki 32 eylem mi?
WITH canli AS (
  SELECT DISTINCT m[1] AS a
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conname = 'admin_audit_action_chk' AND c.conrelid = 'public.admin_audit_log'::regclass
), beklenen AS (
  SELECT unnest(ARRAY[
    'user_created','user_activated','user_deactivated','user_approved','user_rejected',
    'password_changed_by_admin','all_sessions_terminated','single_session_terminated',
    'desktop_limit_changed','mobile_limit_changed','tablet_limit_changed','total_session_limit_changed',
    'module_enabled','module_disabled','payment_status_changed','role_changed','workspace_viewed',
    'user_deleted','user_archived','main_admin_critical_action',
    'library_transfer_completed','library_transfer_failed','library_transfer_retried',
    'user_profile_updated','license_settings_changed','security_exempt_changed',
    'admin_web_login_pending','admin_web_login_approved','admin_web_login_denied',
    'admin_mobile_login_rejected','own_session_terminated','pricing_phase_changed']) AS a
)
SELECT 'A3 audit_check' AS kontrol,
  (SELECT count(*) FROM canli) AS canli_eylem,
  (SELECT count(*) FROM beklenen) AS beklenen_eylem,
  (SELECT string_agg(a, ',') FROM (SELECT a FROM canli EXCEPT SELECT a FROM beklenen) x) AS yalniz_canlida,
  (SELECT string_agg(a, ',') FROM (SELECT a FROM beklenen EXCEPT SELECT a FROM canli) x) AS yalniz_depoda;

-- [4] Fonksiyon gövdesi parmak izleri (CR temizlenmiş md5) → scripts/uye-arsiv-4a/repo-fingerprints.ts çıktısıyla aynı olmalı
SELECT 'A4 parmak_izi' AS kontrol, p.oid::regprocedure::text AS imza, md5(replace(p.prosrc, chr(13), '')) AS md5,
       p.prosecdef AS security_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('admin_archive_user','admin_set_user_active','admin_list_members_v2','admin_member_stage_of',
                     'admin_purge_archived_expert','admin_purge_in_progress')
 ORDER BY 2;

-- [5] Mevcut tetikleyiciler (ad çakışması kontrolü; yalnız ad + tablo)
SELECT 'A5 tetikleyiciler' AS kontrol, c.relname AS tablo, string_agg(t.tgname, ',' ORDER BY t.tgname) AS tetikleyiciler
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND NOT t.tgisinternal
   AND c.relname IN ('users','trial_profiles','member_pricing_phases','user_payment_history','admin_purge_context')
 GROUP BY c.relname ORDER BY 2;

-- [6] Eski pasif uzmanlar — Owner'ın istediği TOPLU sınıflandırma (son durum olayına göre; demo ayrımı)
WITH pasif AS (
  SELECT u.id, coalesce(u.is_demo_account, false) AS demo
    FROM public.users u
   WHERE lower(coalesce(u.role, '')) = 'expert'
     AND lower(coalesce(u.approval_status, '')) = 'approved'
     AND u.active IS NOT TRUE
), son AS (
  SELECT DISTINCT ON (a.target_user_id) a.target_user_id, a.action
    FROM public.admin_audit_log a
   WHERE a.action IN ('user_deactivated', 'user_archived', 'user_activated')
   ORDER BY a.target_user_id, a.created_at DESC, a.id DESC
)
SELECT 'A6 pasif_siniflandirma' AS kontrol,
  count(*)                                                          AS toplam_pasif_uzman,
  count(*) FILTER (WHERE s.action = 'user_archived')                AS son_islem_arsivleme,
  count(*) FILTER (WHERE s.action = 'user_deactivated')             AS son_islem_pasiflestirme,
  count(*) FILTER (WHERE s.action IS NULL OR s.action = 'user_activated') AS belirsiz,
  count(*) FILTER (WHERE p.demo)                                    AS demo,
  count(*) FILTER (WHERE NOT p.demo)                                AS demo_olmayan
  FROM pasif p LEFT JOIN son s ON s.target_user_id = p.id;

-- [7] Bağlam: toplam hesap sayıları (kişisel veri yok)
SELECT 'A7 baglam' AS kontrol,
  count(*) FILTER (WHERE lower(coalesce(role,''))='expert') AS uzman,
  count(*) FILTER (WHERE lower(coalesce(role,''))='admin')  AS yonetici,
  count(*) FILTER (WHERE lower(coalesce(role,''))='expert' AND lower(coalesce(approval_status,'')) IN ('','pending')) AS basvuru,
  count(*) FILTER (WHERE lower(coalesce(role,''))='expert' AND lower(coalesce(approval_status,''))='rejected') AS reddedilen,
  (SELECT count(*) FROM public.admin_purge_context) AS purge_context_satir
  FROM public.users;
