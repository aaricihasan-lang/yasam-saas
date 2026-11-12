-- =============================================================================
-- AŞAMA 4a · ESKİ PASİF KAYITLARIN SALT-OKUNUR SINIFLANDIRMASI (yalnız TOPLU SAYI; kişisel veri YOK)
-- =============================================================================
-- Ne zaman: 20280101000600 migration'ından ÖNCE ve SONRA çalıştırılabilir (archived_at yoksa onu NULL sayar).
-- Ne yapar: Bugün "onaylı uzman ∧ active=false" olan hesapları, yönetim geçmişindeki EN SON pasifleştirme
--   olayına göre gruplar. Hiçbir satırı değiştirmez (BEGIN READ ONLY … ROLLBACK).
--   son_olay = user_archived    → eski sistemde "Pasife Al ve Arşivle" ile kapatılmış (arşiv ADAYI)
--   son_olay = user_deactivated → eski sistemde "Pasif Yap" ile kapatılmış (pasif kalmalı)
--   son_olay = (yok)            → audit kaydı yok (audit öncesi / doğrudan veri) → belirsiz, pasif kalır
-- Owner kararı olmadan hiçbir hesap arşive aktarılmaz: bkz. legacy-archive-backfill.sql.
-- =============================================================================
BEGIN READ ONLY;

WITH has_col AS (
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'archived_at') AS v
),
pasif AS (
  SELECT u.id, coalesce(u.is_demo_account, false) AS demo
    FROM public.users u
   WHERE lower(coalesce(u.role, '')) = 'expert'
     AND lower(coalesce(u.approval_status, '')) = 'approved'
     AND u.active IS NOT TRUE
),
last_evt AS (
  SELECT DISTINCT ON (a.target_user_id) a.target_user_id, a.action
    FROM public.admin_audit_log a
   WHERE a.action IN ('user_deactivated', 'user_archived', 'user_activated')
   ORDER BY a.target_user_id, a.created_at DESC, a.id DESC
)
SELECT (SELECT v FROM has_col)                         AS archived_at_kolonu_var,
       coalesce(l.action, '(yok)')                     AS son_olay,
       p.demo                                          AS demo,
       count(*)::int                                   AS hesap_sayisi
  FROM pasif p
  LEFT JOIN last_evt l ON l.target_user_id = p.id
 GROUP BY 1, 2, 3
 ORDER BY 2, 3;

ROLLBACK;
