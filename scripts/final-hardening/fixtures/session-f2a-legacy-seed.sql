-- GİRİŞ GÜVENLİĞİ F2-A eski oturum tohumu (yerel embedded-pg; prod'a temas YOK).
-- 20271003200000 (ESKİ create_session_v2) uygulandıktan SONRA, F2-A migration'ından ÖNCE çalışır.
-- Eski RPC android_app oturumlarını expires_at NULL (süresiz) açıyordu; tohum aynı yolu (eski
-- fonksiyonun kendisi) kullanır — kolon varsayılanıyla dolan fixture satırı bu durumu temsil ETMEZ.
SELECT public.create_session_v2(
  '00000000-0000-0000-0000-00000000e0f2', 'f2a-legacy-android', '203.0.113.9', 'TR', 'Istanbul', 'UA-test',
  'mobile', 'android_app', NULL, now() + interval '30 days', false, true,
  604800, 7200, 86400, 900, 2, 600);

-- 400 gün önce açılmış + 400 gün boşta (expires_at DEĞİŞMEZ — trigger android için yasaklar).
UPDATE public.user_sessions
   SET created_at = now() - interval '400 days', last_seen_at = now() - interval '400 days'
 WHERE session_token = 'f2a-legacy-android';
