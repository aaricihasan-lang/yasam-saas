-- GİRİŞ GÜVENLİĞİ F2-N — Owner MFA zorunluluğu için VERİTABANI düzeyinde çevrimdışı kurtarma kiti şartı. F2-A…F2-M'ye bağımlı,
-- EKLEYİCİ (mevcut fonksiyon gövdelerine dokunmaz). Owner talimatı 23.11.2026 (F2 / Owner MFA veritabanı güvenliği).
--
-- Sorun: #833 API katmanında Owner'ın kendi zorunluluğunu kitsiz açmasını engeller; ancak auth_mfa_set_required RPC'si
-- doğrudan çağrılırsa veya SQL'den users.mfa_required yazılırsa (users_mfa_policy_guard yalnız bir oturum ayarına —
-- yasam.mfa_policy — bakar; SQL erişimi olan herkes set_config ile açabilir) Owner kitsiz zorunluluğa girer: telefon ve
-- e-posta birlikte kaybolursa Owner'ı kurtaracak başka Owner yoktur.
--
--   N1 auth_owner_kit_locked_count(uuid): Owner'ın GEÇERLİ kit kodları (kind owner_offline, state active, süresi geçmemiş)
--      SATIR KİLİDİYLE sayılır. READ COMMITTED'da eşzamanlı iptal / kullanım beklenir ve sonucu görülür; REPEATABLE READ /
--      SERIALIZABLE'da eşzamanlı değişiklik serileştirme hatası verir (eski sayı sessizce kullanılmaz). Kimseye açık değil.
--   N2 users_owner_mfa_kit_guard (BEFORE INSERT / UPDATE OF mfa_required, role, active, is_super_admin): satır Owner ise
--      (role admin + active + is_super_admin — auth_is_owner_admin ile aynı ölçüt, YENİ değerlerle) ve zorunluluk YENİ açılıyorsa
--      VEYA zorunlu bir hesap YENİ Owner oluyorsa geçerli kit < 1 → RED (YF401). Yolu fark etmez: RPC, doğrudan UPDATE / INSERT,
--      service_role REST. Owner olmayan kullanıcılar, zaten zorunlu Owner'ın diğer alanları, zorunluluğu kapatma ETKİLENMEZ.
--   N3 auth_owner_kit_invalidation_guard (ERTELENMİŞ kısıt tetikleyicisi, işlem sonunda): zorunlu Owner'ın geçerli kit kodu
--      iptal edilir / silinir / süresi düşürülür / türü veya sahibi değiştirilirse ve işlem sonunda geçerli kit kalmazsa → RED
--      (YF402). KULLANIM (state 'used') SERBESTTİR: son kit koduyla acil giriş engellenmez. auth_owner_offline_kit_issue aynı
--      işlemde eskileri iptal edip 5 yenisini yazdığı için işlem sonunda kit vardır → yeniden üretim çalışır.
--   N4 auth_owner_kit_lock_order (BEFORE UPDATE / DELETE, KOMUT düzeyi) + TRUNCATE koruması: kit tablosunda herhangi bir satıra
--      dokunulmadan ÖNCE Owner'ın users satırı FOR SHARE kilitlenir. Böylece kilit sırası HER YOLDA aynıdır: önce users, sonra kit
--      (users UPDATE'inde PostgreSQL, BEFORE tetikleyicisinden önce users satırını zaten kilitler). Ters sıra kilitlenmesi
--      (deadlock) oluşmaz; ölçüm: kilit sırası olmadan "önce iptal" yarışında 40P01 (güvenli ama kabul edilemez) — f2n harness'ı.
--      TRUNCATE satır tetikleyicilerini atlar → zorunlu Owner varken kit tablosunu boşaltma RED (YF402).
--   Eşzamanlılık: N2 Owner'ın geçerli kit satırlarını FOR UPDATE kilitleyerek sayar; N3 users satırını (N4'ün aldığı) FOR SHARE
--      kilidiyle okur. "Zorunluluğu aç" ile "son kiti iptal et" aynı anda gelirse biri diğerinin işlemini bekler ve sonucunu görerek
--      karar verir; ikisi birden başarılı olamaz (READ COMMITTED; daha yüksek yalıtımda serileştirme hatası). İki sıra harness'ta.
--
-- SINIRLAR (mutlak koruma DEĞİLDİR): tablo sahibi / süper kullanıcı (Supabase'de postgres rolü, SQL Editor) bu tetikleyicileri
--   ALTER TABLE … DISABLE TRIGGER / DROP TRIGGER ile kapatabilir, session_replication_role = replica (süper kullanıcı) ile
--   atlayabilir, fonksiyonları yeniden tanımlayabilir veya kit satırlarını doğrudan yazabilir. Bu migration bilinçsiz / hatalı
--   SQL'i, uygulama anahtarıyla (service_role) yapılan yazmaları ve eşzamanlı yarışları durdurur; kötü niyetli DB sahibini DURDURMAZ.
--   Bu sınır yalnız DB erişiminin korunmasıyla (Supabase hesap 2FA, rol ayrımı, denetim kaydı) yönetilir.
--
-- Mevcut veri: migration mevcut satırları DEĞİŞTİRMEZ ve DOĞRULAMAZ. Zaten kitsiz + zorunlu bir Owner varsa uygulama SONRASI
--   da öyle kalır (yalnız yeni geçişler engellenir); ön kontrol bunu raporlar (f2n kurulum öncesi: kitsiz zorunlu Owner sayısı).
-- Geri alma: scripts/giris-guvenligi/f2n-rollback.sql (tetikleyici + fonksiyonlar kaldırılır, kayıt 1200'e döner).
-- 000200 kuralı DEĞİŞMEZ: 000200 tüm doğrusal zincirden (bu dosya dahil) ve kod yayını + canlı doğrulamadan SONRA uygulanır.

BEGIN;
-- >>> F2 MİGRATION KORUMASI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
DO $f2guard$
DECLARE
  v_me      constant integer := 1300;
  v_known   constant integer := 1300;
  v_reg     integer;
  v_fp      integer := -1;
  v_missing text;
  r         record;
BEGIN
  -- 1) Kayıt (her doğrusal F2 migration'ı COMMIT'ten önce yazar).
  IF to_regprocedure('public.auth_f2_schema_level()') IS NOT NULL THEN
    EXECUTE 'SELECT public.auth_f2_schema_level()' INTO v_reg;
  END IF;
  -- 2) Katalog parmak izleri (kayıttan bağımsız ikinci kaynak).
  FOR r IN SELECT * FROM (VALUES
      (0, to_regprocedure('public.auth_is_owner_admin(uuid)') IS NOT NULL),
      (100, to_regclass('public.auth_mfa_challenges') IS NOT NULL),
      (300, to_regclass('public.auth_trusted_devices') IS NOT NULL),
      (400, to_regclass('public.auth_email_otps') IS NOT NULL),
      (500, to_regclass('public.auth_recovery_codes') IS NOT NULL),
      (600, EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'auth_owner_session_stale')),
      (700, to_regclass('public.auth_audit_retention_policy') IS NOT NULL),
      (800, to_regclass('public.auth_retention_holds') IS NOT NULL),
      (900, to_regprocedure('public.user_sessions_user_id_immutable()') IS NOT NULL),
      (1000, to_regclass('public.auth_session_device_proofs') IS NOT NULL),
      (1100, to_regprocedure('public.users_admin_grant_guard()') IS NOT NULL),
      (1200, to_regprocedure('public.auth_email_provider_allowed(text)') IS NOT NULL),
      (1300, to_regprocedure('public.auth_owner_kit_locked_count(uuid)') IS NOT NULL)
    ) AS t(lvl, present) ORDER BY lvl LOOP
    IF r.present THEN
      v_fp := greatest(v_fp, r.lvl);
    ELSIF r.lvl < v_me THEN
      v_missing := concat_ws(',', v_missing, lpad(r.lvl::text, 6, '0'));
    END IF;
  END LOOP;
  IF coalesce(v_reg, -1) > v_me OR v_fp > v_me THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: % daha yeni bir F2 aşamasının üzerine YENİDEN UYGULANAMAZ (kayıt=%, katalog=%). Owner korumalı fonksiyonlar eski gövdeye dönerdi; hiçbir değişiklik yapılmadı.',
      lpad(v_me::text, 6, '0'), coalesce(lpad(v_reg::text, 6, '0'), 'yok'), lpad(greatest(v_fp, 0)::text, 6, '0')
      USING ERRCODE = 'YF201';
  END IF;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: SIRA HATASI — % uygulanmadan önce eksik aşama(lar): %. Hiçbir değişiklik yapılmadı.',
      lpad(v_me::text, 6, '0'), v_missing USING ERRCODE = 'YF202';
  END IF;
  IF (v_reg IS NULL AND v_fp >= 0) OR (v_reg IS NOT NULL AND v_reg <= v_known AND v_reg <> v_fp) THEN
    RAISE EXCEPTION 'F2 MİGRATION KORUMASI: ŞEMA SAPMASI — kayıt (%) ile katalog parmak izi (%) çelişiyor; insan incelemesi gerekli. Hiçbir değişiklik yapılmadı.',
      coalesce(lpad(v_reg::text, 6, '0'), 'yok'), lpad(greatest(v_fp, 0)::text, 6, '0') USING ERRCODE = 'YF203';
  END IF;
END $f2guard$;
-- <<< F2 MİGRATION KORUMASI

-- ── N1 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_owner_kit_locked_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v integer;
BEGIN
  PERFORM 1 FROM public.auth_recovery_codes c
   WHERE c.user_id = p_user_id AND c.kind = 'owner_offline' AND c.state = 'active'
     AND (c.expires_at IS NULL OR c.expires_at > now())
   FOR UPDATE;
  SELECT count(*)::integer INTO v FROM public.auth_recovery_codes c
   WHERE c.user_id = p_user_id AND c.kind = 'owner_offline' AND c.state = 'active'
     AND (c.expires_at IS NULL OR c.expires_at > now());
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_kit_locked_count(uuid) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_owner_kit_locked_count(uuid) IS 'F2-N: Owner''ın geçerli çevrimdışı kit kodu sayısı (satır kilidiyle). Yalnız F2-N tetikleyicileri kullanır.';

-- ── N2 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.users_owner_mfa_kit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new_owner boolean := lower(btrim(coalesce(NEW.role::text, ''))) = 'admin' AND NEW.active IS TRUE AND NEW.is_super_admin IS TRUE;
  v_old_owner boolean := false;
BEGIN
  IF NEW.mfa_required IS DISTINCT FROM true OR NOT v_new_owner THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old_owner := lower(btrim(coalesce(OLD.role::text, ''))) = 'admin' AND OLD.active IS TRUE AND OLD.is_super_admin IS TRUE;
    IF OLD.mfa_required IS TRUE AND v_old_owner THEN
      RETURN NEW;   -- zaten zorunlu Owner: başka alanların değişmesi bu kuralın konusu değil
    END IF;
  END IF;
  IF public.auth_owner_kit_locked_count(NEW.id) < 1 THEN
    RAISE EXCEPTION 'F2-N: Owner için ikinci doğrulama zorunluluğu geçerli çevrimdışı kurtarma kiti olmadan açılamaz'
      USING ERRCODE = 'YF401',
            HINT = 'Önce SQL konsolunda auth_owner_offline_kit_issue() ile kit üretin, kâğıda yazın, sonra zorunluluğu açın.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.users_owner_mfa_kit_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS users_owner_mfa_kit_guard_trg ON public.users;
CREATE TRIGGER users_owner_mfa_kit_guard_trg
  BEFORE INSERT OR UPDATE OF mfa_required, role, active, is_super_admin ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_owner_mfa_kit_guard();

-- ── N3 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_owner_kit_invalidation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := OLD.user_id;
  v_u   record;
BEGIN
  SELECT u.mfa_required, u.role, u.active, u.is_super_admin INTO v_u FROM public.users u WHERE u.id = v_uid FOR SHARE;
  IF FOUND AND v_u.mfa_required IS TRUE
     AND lower(btrim(coalesce(v_u.role::text, ''))) = 'admin' AND v_u.active IS TRUE AND v_u.is_super_admin IS TRUE
     AND public.auth_owner_kit_locked_count(v_uid) < 1 THEN
    RAISE EXCEPTION 'F2-N: ikinci doğrulaması zorunlu Owner''ın son geçerli çevrimdışı kurtarma kiti iptal edilemez / silinemez'
      USING ERRCODE = 'YF402',
            HINT = 'Kiti yenilemek için auth_owner_offline_kit_issue() kullanın (aynı işlemde yeni kit yazılır).';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_kit_invalidation_guard() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS auth_owner_kit_invalidate_upd_trg ON public.auth_recovery_codes;
CREATE CONSTRAINT TRIGGER auth_owner_kit_invalidate_upd_trg
  AFTER UPDATE ON public.auth_recovery_codes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.kind = 'owner_offline' AND OLD.state = 'active' AND NEW.state IS DISTINCT FROM 'used'
        AND (NEW.state IS DISTINCT FROM OLD.state OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.user_id IS DISTINCT FROM OLD.user_id
             OR NEW.expires_at IS DISTINCT FROM OLD.expires_at))
  EXECUTE FUNCTION public.auth_owner_kit_invalidation_guard();
DROP TRIGGER IF EXISTS auth_owner_kit_invalidate_del_trg ON public.auth_recovery_codes;
CREATE CONSTRAINT TRIGGER auth_owner_kit_invalidate_del_trg
  AFTER DELETE ON public.auth_recovery_codes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.kind = 'owner_offline' AND OLD.state = 'active')
  EXECUTE FUNCTION public.auth_owner_kit_invalidation_guard();

-- ── N4 ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auth_owner_kit_lock_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.mfa_required IS TRUE AND lower(btrim(coalesce(u.role::text, ''))) = 'admin'
                AND u.active IS TRUE AND u.is_super_admin IS TRUE) THEN
      RAISE EXCEPTION 'F2-N: ikinci doğrulaması zorunlu Owner varken kurtarma kodu tablosu boşaltılamaz'
        USING ERRCODE = 'YF402';
    END IF;
    RETURN NULL;
  END IF;
  -- Kilit sırası: önce Owner'ın users satırı (paylaşımlı), sonra kit satırları.
  PERFORM 1 FROM public.users u
   WHERE lower(btrim(coalesce(u.role::text, ''))) = 'admin' AND u.active IS TRUE AND u.is_super_admin IS TRUE
   FOR SHARE;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.auth_owner_kit_lock_order() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS auth_owner_kit_lock_order_trg ON public.auth_recovery_codes;
CREATE TRIGGER auth_owner_kit_lock_order_trg
  BEFORE UPDATE OR DELETE ON public.auth_recovery_codes
  FOR EACH STATEMENT EXECUTE FUNCTION public.auth_owner_kit_lock_order();
DROP TRIGGER IF EXISTS auth_owner_kit_truncate_guard_trg ON public.auth_recovery_codes;
CREATE TRIGGER auth_owner_kit_truncate_guard_trg
  BEFORE TRUNCATE ON public.auth_recovery_codes
  FOR EACH STATEMENT EXECUTE FUNCTION public.auth_owner_kit_lock_order();

-- >>> F2 ŞEMA DÜZEYİ KAYDI (F2-J; üretici: scripts/giris-guvenligi/f2-migration-guard.mjs — elle değiştirmeyin)
CREATE OR REPLACE FUNCTION public.auth_f2_schema_level() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $f2lvl$ SELECT 1300 $f2lvl$;
REVOKE ALL ON FUNCTION public.auth_f2_schema_level() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.auth_f2_schema_level() IS 'F2 giriş güvenliği şema düzeyi (migration yeniden uygulama korumasının kaydı). Yalnız F2 migration''ları yazar.';
-- <<< F2 ŞEMA DÜZEYİ KAYDI
COMMIT;
