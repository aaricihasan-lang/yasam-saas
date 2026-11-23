-- GİRİŞ GÜVENLİĞİ F2-C fixture eki (yerel embedded-pg; prod'a temas YOK; sentetik kullanıcılar).
-- Owner Bildirim Zili tablosu: prod 20280101000400 ile AYNI kısıt adları/listeleri (2026-11-15 salt-okunur
-- kontrol) — 20280103000300'ün CHECK genişletmesi gerçek adlar üzerinde sınanır.
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  type text NOT NULL,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT admin_notifications_event_key_check CHECK (length(event_key) >= 3 AND length(event_key) <= 200),
  CONSTRAINT admin_notifications_kind_check CHECK (kind = ANY (ARRAY['info'::text, 'action'::text])),
  CONSTRAINT admin_notifications_type_check CHECK (type = ANY (ARRAY['basvuru','pro_talebi','inceleme','eski_kayit','odeme','deneme_basladi','deneme_bitti'])),
  CONSTRAINT admin_notifications_kind_type CHECK ((kind = 'info' AND type = ANY (ARRAY['deneme_basladi','deneme_bitti']))
    OR (kind = 'action' AND type = ANY (ARRAY['basvuru','pro_talebi','inceleme','eski_kayit','odeme']))),
  CONSTRAINT admin_notifications_resolution_check CHECK (resolution IS NULL OR resolution = ANY (ARRAY['deneme_onaylandi','pro_onaylandi',
    'reddedildi','pro_gecirildi','talep_kapatildi','inceleme_kaldirildi','deneme_durduruldu','pasife_alindi','odeme_durumu_guncellendi','kayit_silindi','kapandi'])),
  CONSTRAINT admin_notifications_info_never_resolved CHECK (kind = 'action' OR (resolved_at IS NULL AND resolution IS NULL))
);
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_notifications FROM PUBLIC, anon, authenticated, service_role;
-- Mevcut bir zil kaydı (CHECK genişletmesi mevcut satırı bozmamalı).
INSERT INTO public.admin_notifications (event_key, kind, type, target_user_id)
VALUES ('basvuru:00000000-0000-0000-0000-00000000e001:1', 'action', 'basvuru', '00000000-0000-0000-0000-00000000e001');
