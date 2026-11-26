-- =============================================================================
-- ÜYE PASİFLEŞTİRME F2 — ESKİ "GİRİŞİ KAPALI" HESAPLAR · SALT-OKUNUR RAPOR (migration DEĞİL)
-- =============================================================================
-- Amaç: 20280126000000 uygulandıktan sonra, bugünkü "Pasif Yap" (active=false) ile girişi kapatılmış ve
--   arşivlenmemiş hesapları Owner kararına sunmak. Hiçbir satır DEĞİŞMEZ (READ ONLY işlem).
-- Kişisel veri yazdırılmaz: ad / e-posta / telefon YOK; yalnız kimlik, rol, onay, paket özeti ve tarihler.
-- Çalıştırma: Owner onayıyla, production SQL konsolunda; işlem READ ONLY açılır.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) Durum dağılımı (uzman / yönetici ayrı)
SELECT lower(btrim(coalesce(u.role, ''))) AS rol,
       public.member_account_state(u.active, u.archived_at, u.access_restricted_at) AS durum,
       count(*)::int AS adet
  FROM public.users u
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- 2) Geçiş adayları: onaylı uzman + giriş kapalı + arşivde değil + demo değil
--    (son "user_deactivated" audit tarihi = pasife alınma zamanı; kayıt yoksa NULL → eski sistem)
SELECT u.id,
       u.package_type,
       u.trial_kind,
       u.trial_status,
       u.payment_status,
       u.created_at::date AS kayit_tarihi,
       (SELECT max(a.created_at) FROM public.admin_audit_log a
         WHERE a.target_user_id = u.id AND a.action = 'user_deactivated') AS pasife_alinma,
       (SELECT count(*)::int FROM public.user_sessions s
         WHERE s.user_id = u.id AND s.is_active = true) AS acik_oturum
  FROM public.users u
 WHERE lower(btrim(coalesce(u.role, ''))) = 'expert'
   AND lower(btrim(coalesce(u.approval_status, ''))) IN ('approved', '')
   AND u.active IS NOT TRUE
   AND u.archived_at IS NULL
   AND coalesce(u.is_demo_account, false) = false
 ORDER BY pasife_alinma NULLS FIRST, u.created_at;

ROLLBACK;
