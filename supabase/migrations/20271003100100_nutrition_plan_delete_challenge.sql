-- ============================================================
-- 20271003100100_nutrition_plan_delete_challenge.sql
--
-- Beslenme — "Planı Sil" (tüm plan REVİZYONU) için SUNUCU TARAFLI 4 haneli doğrulama kodu.
--
-- AMAÇ: Plan silme artık "Günü Temizle" ile AYNI 3 aşamalı korumayı kullanır (kapsam → geri
--   alınamaz uyarısı → sunucunun ürettiği tek kullanımlık 4 haneli kod). Mevcut
--   nutrition_destructive_challenges tablosu + nutrition_challenge_consume RPC'si AYNEN
--   yeniden kullanılır; yalnız işlem türü CHECK kısıtına 'plan_delete' eklenir.
--
-- DURUM: PRODUCTION'A UYGULANMADI.
--
-- SIRALAMA: Bu migration KOD DEPLOY'UNDAN ÖNCE uygulanmalıdır. Uygulanmadan yeni kod deploy
--   edilirse: POST /api/beslenme/plans/[id]/delete/challenge → challenge INSERT CHECK ihlali
--   (23514) → 503 DELETE_UNAVAILABLE; kullanıcı net mesaj görür, HİÇBİR plan silinmez
--   (DELETE route geçerli challenge olmadan çalışmaz). Yani eksik migration = plan silme
--   geçici olarak kapalı; veri kaybı yok.
--
-- VERİ-YIKICI MI: HAYIR. Yalnız CHECK kısıtı genişletilir (mevcut satırların tümü yeni kısıtı
--   zaten sağlar → ADD CONSTRAINT doğrulaması hızlı ve güvenli). Tablo/satır/fonksiyon silinmez.
-- İDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT; tekrar çalıştırılabilir. Tablo henüz
--   yoksa (20270201000200 uygulanmamış ortam) sessizce atlanır.
-- KİLİT: kısa ACCESS EXCLUSIVE (kısa ömürlü güvenlik tablosu; birkaç satır). lock_timeout ile
--   sınırlandırılır; aşılırsa tamamı geri alınır ve güvenle tekrar denenebilir.
--
-- ROLLBACK (yalnız 'plan_delete' satırı kalmadığında; önce kısa ömürlü satırlar temizlenir):
--   BEGIN;
--   DELETE FROM public.nutrition_destructive_challenges WHERE action = 'plan_delete';
--   ALTER TABLE public.nutrition_destructive_challenges
--     DROP CONSTRAINT IF EXISTS nutrition_destructive_challenges_action_chk;
--   ALTER TABLE public.nutrition_destructive_challenges
--     ADD CONSTRAINT nutrition_destructive_challenges_action_chk
--     CHECK (action IN ('food_reset_one', 'food_reset_all', 'plan_day_clear'));
--   COMMIT;
--   (Rollback sonrası plan silme 503 DELETE_UNAVAILABLE döner; veri kaybı olmaz.)
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $mig$
BEGIN
  IF to_regclass('public.nutrition_destructive_challenges') IS NULL THEN
    RAISE NOTICE 'nutrition_destructive_challenges yok — 20271003100100 atlandı (önce 20270201000200 uygulanmalı)';
    RETURN;
  END IF;

  ALTER TABLE public.nutrition_destructive_challenges
    DROP CONSTRAINT IF EXISTS nutrition_destructive_challenges_action_chk;

  ALTER TABLE public.nutrition_destructive_challenges
    ADD CONSTRAINT nutrition_destructive_challenges_action_chk CHECK (
      action IN ('food_reset_one', 'food_reset_all', 'plan_day_clear', 'plan_delete')
    );
END
$mig$;

COMMIT;
