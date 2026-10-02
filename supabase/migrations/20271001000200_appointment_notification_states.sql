-- =============================================================================
-- 20271001000200_appointment_notification_states.sql   [ADDITIVE — NEW TABLE]
--
-- RANDEVU BİLDİRİMİ — SUNUCU/HESAP BAZLI GÖRÜNÜRLÜK DURUMU (AŞAMA 2 · §4.2 · M3)
--
-- AMAÇ: Bildirim zilindeki "Tamamlandı" ve "Tekrar gösterme" kararları artık cihaz-yerel
--   değil, KULLANICI + RANDEVU bazında sunucuda tutulur (owner kararı 9). Kayıt randevunun
--   O ANKİ tarihiyle (appointment_at) anahtarlanır → randevu yeniden planlanırsa (tarih
--   değişirse) eski kayıt eşleşmez ve bildirim TEKRAR görünür.
--   "Tamamlandı" yalnız bildirimi kapatır; appointments.status DEĞİŞMEZ (gelecek randevuda
--   statü değişimi 409 kuralı + clients.gorusme yan etkileri korunur).
--
-- GÜVENLİK MODELİ:
--   * RLS AÇIK, policy YOK → yalnız service_role (BYPASSRLS) erişir.
--   * REVOKE ALL FROM PUBLIC, anon, authenticated → tarayıcı/publishable erişimi YOK.
--   * tenant_id / user_id İSTEMCİDEN GELMEZ: API (app/api/appointments/notifications/state)
--     requireModuleAccess("appointments") guard'ından yazar; appointment_at sunucuda
--     randevunun güncel appointment_date değerinden alınır.
--   * FK ON DELETE CASCADE: randevu / kullanıcı / tenant silinince durum kayıtları düşer.
--   * Yaşam Hafızası CDC trigger'ı BİLİNÇLİ OLARAK EKLENMEZ (UI tercihi; danışan içeriği değil).
--
-- PRECONDITION: public.tenants(id), public.users(id), public.appointments(id) mevcut.
-- VERİ-YIKICI MI: HAYIR (yalnız yeni tablo + index + grant).
-- Uygulama sırası: bu migration → bildirim API'sini içeren deploy (kod ÖNCESİ).
--   (Tablo yoksa GET states okuması hata verir → API durumları boş sayıp zili yine gösterir;
--    POST 500 döner, istemci iyimser güncellemeyi geri alır.)
-- İdempotent: CREATE TABLE/INDEX IF NOT EXISTS + DO guard'ları; iki kez uygulanabilir.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.appointment_notification_states;
--   (Veri kaybı: yalnız bildirim görünürlük tercihleri; randevu verisi etkilenmez.)
-- =============================================================================

BEGIN;

-- ─── 0) Precondition ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'appointment_notification_states: public.tenants bulunamadı (precondition)';
  END IF;
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'appointment_notification_states: public.users bulunamadı (precondition)';
  END IF;
  IF to_regclass('public.appointments') IS NULL THEN
    RAISE EXCEPTION 'appointment_notification_states: public.appointments bulunamadı (precondition)';
  END IF;
END $$;

-- ─── 1) Tablo ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_notification_states (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  appointment_id  uuid        NOT NULL REFERENCES public.appointments (id) ON DELETE CASCADE,
  -- Kararın verildiği andaki randevu tarihi (yeniden planlama → yeni anahtar → tekrar bildirim).
  appointment_at  timestamptz NOT NULL,
  state           text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_notification_states_state_chk CHECK (state IN ('done', 'muted')),
  CONSTRAINT appointment_notification_states_user_appt_at_key UNIQUE (user_id, appointment_id, appointment_at)
);

-- Tablo önceden (kısmi) oluşturulmuşsa eksik kısıtları idempotent tamamla.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointment_notification_states'::regclass
      AND conname = 'appointment_notification_states_state_chk'
  ) THEN
    ALTER TABLE public.appointment_notification_states
      ADD CONSTRAINT appointment_notification_states_state_chk CHECK (state IN ('done', 'muted'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.appointment_notification_states'::regclass
      AND conname = 'appointment_notification_states_user_appt_at_key'
  ) THEN
    ALTER TABLE public.appointment_notification_states
      ADD CONSTRAINT appointment_notification_states_user_appt_at_key
      UNIQUE (user_id, appointment_id, appointment_at);
  END IF;
END $$;

COMMENT ON TABLE public.appointment_notification_states IS
  'Randevu bildirimi görünürlük durumu (done/muted) — kullanıcı+randevu+randevu tarihi. Yalnız service_role (API). appointments.status DEĞİŞTİRMEZ.';

-- ─── 2) Index ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointment_notification_states_tenant_user
  ON public.appointment_notification_states (tenant_id, user_id);

-- appointment_id FK cascade + randevu bazlı arama için.
CREATE INDEX IF NOT EXISTS idx_appointment_notification_states_appointment
  ON public.appointment_notification_states (appointment_id);

-- ─── 3) RLS + ACL ────────────────────────────────────────────────────────────
ALTER TABLE public.appointment_notification_states ENABLE ROW LEVEL SECURITY;
-- Policy YOK: anon/authenticated için RLS her satırı reddeder; service_role BYPASSRLS.

REVOKE ALL ON TABLE public.appointment_notification_states FROM PUBLIC;
REVOKE ALL ON TABLE public.appointment_notification_states FROM anon, authenticated;
GRANT ALL ON TABLE public.appointment_notification_states TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
