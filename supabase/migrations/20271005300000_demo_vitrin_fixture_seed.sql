-- ============================================================================
-- DEMO VİTRİN — SENTETİK ÖRNEK VERİ (uzman@test.com demo tenant'ı)
--
-- OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: lib/demo/demoVitrinFixture.ts
-- Üretici: npx tsx scripts/demo-vitrin/buildSeedSql.ts (harness --check ile birebir doğrular).
--
-- KAPSAM: YALNIZ demo tenant 40f842a0-e3e8-448c-8971-9a938e1faccb (users.is_demo_account=true,
-- email=uzman@test.com). Gerçek uzman/tenant verisine DOKUNMAZ.
-- İÇERİK: açıkça sentetik (kurgusal adlar, 0500 000 xx xx telefonlar, example.test e-postalar).
-- İDEMPOTENT: tüm id'ler sabit; ON CONFLICT DO NOTHING → tekrar uygulama duplicate üretmez,
-- mevcut satırı DEĞİŞTİRMEZ. Tarihler uygulama anına göre gün ofsetiyle yazılır.
-- GÜVENLİK KİLİDİ: tenant yoksa, demo kullanıcı yoksa veya tenant'ta demo-OLMAYAN kullanıcı
-- varsa migration HATA verip hiçbir şey yazmaz (tek transaction).
-- NOT: client_notes/client_sessions/client_homeworks/client_stones/appointments üzerindeki
-- Yaşam Hafızası CDC tetikleyicileri birkaç outbox olayı üretir; işçi demo tenant'ı
-- "excluded-demo" olarak no-op/deindex ile kapatır (index'e demo verisi YAZILMAZ).
-- ============================================================================
BEGIN;

DO $demo_guard$
DECLARE
  v_demo_user uuid;
  v_non_demo integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid) THEN
    RAISE EXCEPTION 'demo vitrin seed: demo tenant bulunamadı (%)', '40f842a0-e3e8-448c-8971-9a938e1faccb';
  END IF;
  SELECT count(*) INTO v_non_demo FROM public.users
   WHERE tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND coalesce(is_demo_account, false) = false;
  IF v_non_demo > 0 THEN
    RAISE EXCEPTION 'demo vitrin seed: demo tenant demo-olmayan kullanıcı içeriyor (%) — durduruldu', v_non_demo;
  END IF;
  v_demo_user := (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com');
  IF v_demo_user IS NULL THEN
    RAISE EXCEPTION 'demo vitrin seed: demo kullanıcı (%) bulunamadı', 'uzman@test.com';
  END IF;
END
$demo_guard$;

-- Danışanlar
INSERT INTO public.clients (id, tenant_id, user_id, ad, soyad, name, telefon, email, dogum, gorusme, burc, kan, mizac, created_at)
VALUES
  ('de5a0001-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Eylül', 'Karaca', 'Eylül Karaca', '0500 000 00 01', 'eylul.karaca@example.test', '1990-03-21', to_char(current_date + (-6), 'YYYY-MM-DD'), 'Koç', 'A Rh+', 'safra', (now() + interval '-60 days')),
  ('de5a0001-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Kaan', 'Ersoy', 'Kaan Ersoy', '0500 000 00 02', 'kaan.ersoy@example.test', '1985-07-14', to_char(current_date + (-12), 'YYYY-MM-DD'), 'Yengeç', 'B Rh+', 'dem', (now() + interval '-45 days')),
  ('de5a0001-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Merve', 'Duman', 'Merve Duman', '0500 000 00 03', 'merve.duman@example.test', '1993-11-08', to_char(current_date + (-20), 'YYYY-MM-DD'), 'Akrep', '0 Rh+', 'balgam', (now() + interval '-38 days')),
  ('de5a0001-c11e-4000-8000-000000000004'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Deniz', 'Akbulut', 'Deniz Akbulut', '0500 000 00 04', 'deniz.akbulut@example.test', '1988-09-25', to_char(current_date + (-28), 'YYYY-MM-DD'), 'Terazi', 'AB Rh+', 'sovdavi', (now() + interval '-30 days')),
  ('de5a0001-c11e-4000-8000-000000000005'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Gökçe', 'Tunalı', 'Gökçe Tunalı', '0500 000 00 05', 'gokce.tunali@example.test', '1991-05-17', to_char(current_date + (-35), 'YYYY-MM-DD'), 'Boğa', 'B Rh-', 'dem', (now() + interval '-25 days')),
  ('de5a0001-c11e-4000-8000-000000000006'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Baran', 'Yıldırım', 'Baran Yıldırım', '0500 000 00 06', 'baran.yildirim@example.test', '1987-12-03', to_char(current_date + (-41), 'YYYY-MM-DD'), 'Yay', '0 Rh-', 'balgam', (now() + interval '-15 days'))
ON CONFLICT (id) DO NOTHING;

-- Notlar (client_notes: danışan başına tek satır)
INSERT INTO public.client_notes (id, tenant_id, client_id, saglik_notu, adres, oneriler, notlar)
VALUES
  ('de5a0002-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'Stres kaynaklı gerilim tipi baş ağrısı tarif ediyor. Uyku düzeni düzensiz; hekim kontrolü mevcut, ek tanı bildirmedi.', 'Örnek Mahallesi, Vitrin Sokak No: 1, İstanbul', 'Sabah 15 dk nefes çalışması · Saat 21:00 sonrası ekran molası · Haftada 3 gün 30 dk tempolu yürüyüş.', 'Hedef: enerji dengesi ve stres yönetimi. Yaşam Sistemi vitrin hesabı için hazırlanmış SENTETİK örnek kayıttır; gerçek bir kişiye ait değildir.'),
  ('de5a0002-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000002'::uuid, 'Masa başı çalışma kaynaklı omuz ve boyun gerginliği.', 'Örnek Mahallesi, Vitrin Sokak No: 2, Ankara', 'Saatlik esneme molası · Akşam ılık duş sonrası kısa gevşeme.', 'Odak: beden farkındalığı ve uyku kalitesi. Yaşam Sistemi vitrin hesabı için hazırlanmış SENTETİK örnek kayıttır; gerçek bir kişiye ait değildir.'),
  ('de5a0002-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000003'::uuid, 'Öğün atlama ve öğleden sonra enerji düşüşü tarif ediyor.', 'Örnek Mahallesi, Vitrin Sokak No: 3, İzmir', 'Düzenli öğün saatleri · Gün içine yayılmış su tüketimi.', 'Odak: beslenme düzeni ve günlük enerji. Yaşam Sistemi vitrin hesabı için hazırlanmış SENTETİK örnek kayıttır; gerçek bir kişiye ait değildir.')
ON CONFLICT (id) DO NOTHING;

-- Randevular
INSERT INTO public.appointments (id, tenant_id, client_id, user_id, title, appointment_date, notes, status)
VALUES
  ('de5a0003-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Takip görüşmesi', (((current_date + (-6))::timestamp + interval '11 hours') AT TIME ZONE 'Europe/Istanbul'), 'Uyku günlüğü birlikte değerlendirildi.', 'tamamlandi'),
  ('de5a0003-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Kontrol seansı', (((current_date + (7))::timestamp + interval '14 hours') AT TIME ZONE 'Europe/Istanbul'), 'Nefes çalışması ilerlemesi gözden geçirilecek.', 'bekliyor'),
  ('de5a0003-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000002'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'İlk değerlendirme', (((current_date + (-12))::timestamp + interval '10 hours') AT TIME ZONE 'Europe/Istanbul'), 'Genel durum ve hedefler konuşuldu.', 'tamamlandi'),
  ('de5a0003-c11e-4000-8000-000000000004'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000003'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), 'Beslenme takibi', (((current_date + (3))::timestamp + interval '16 hours') AT TIME ZONE 'Europe/Istanbul'), 'Ölçüm ve öğün planı değerlendirmesi.', 'bekliyor')
ON CONFLICT (id) DO NOTHING;

-- Danışan taşları
INSERT INTO public.client_stones (id, tenant_id, client_id, stone_name, stone_type, usage_area, note, stone_date, created_at)
VALUES
  ('de5a0004-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'Ametist', 'Kuvars', 'Uyku öncesi rahatlama rutini', 'Yatak odasında, gece rutininin parçası olarak.', (current_date + (-20)), (now() + interval '-20 days')),
  ('de5a0004-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'Akuamarin', 'Beril', 'İfade ve iletişim çalışması', 'Gün içinde taşınması önerildi.', (current_date + (-6)), (now() + interval '-6 days')),
  ('de5a0004-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000002'::uuid, 'Siyah Turmalin', 'Turmalin', 'Çalışma masası düzeni', 'Odaklanma rutininin yanında.', (current_date + (-12)), (now() + interval '-12 days'))
ON CONFLICT (id) DO NOTHING;

-- Seanslar
INSERT INTO public.client_sessions (id, tenant_id, client_id, tarih, session_date, session_type, duration_minutes, fee, session_note, actions_done, suggestions, next_plan, created_at)
VALUES
  ('de5a0005-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, to_char(current_date + (-20), 'YYYY-MM-DD'), (current_date + (-20)), 'Biyoenerji', 60, 1500, 'İlk biyoenerji seansı; boğaz ve kalp bölgesinde gerginlik ifade edildi.', 'Nefes çalışması, gevşeme yönlendirmesi.', 'Akşam rutini ve uyku günlüğü.', 'İki hafta sonra takip.', (now() + interval '-20 days')),
  ('de5a0005-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, to_char(current_date + (-6), 'YYYY-MM-DD'), (current_date + (-6)), 'Takip', 45, 1200, 'Uyku süresinde iyileşme bildirildi; baş ağrısı sıklığı azaldı.', 'Rutin gözden geçirildi, nefes egzersizi güncellendi.', 'Haftada 3 yürüyüş korunacak.', 'Bir hafta sonra kontrol.', (now() + interval '-6 days')),
  ('de5a0005-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000002'::uuid, to_char(current_date + (-12), 'YYYY-MM-DD'), (current_date + (-12)), 'İlk görüşme', 50, 1300, 'Masa başı çalışma ve uyku kalitesi konuşuldu.', 'Beden farkındalığı egzersizi gösterildi.', 'Saatlik esneme molası.', 'Üç hafta sonra takip.', (now() + interval '-12 days'))
ON CONFLICT (id) DO NOTHING;

-- Ödevler
INSERT INTO public.client_homeworks (id, tenant_id, client_id, title, homework_type, description, start_date, end_date, status, expert_note, created_at)
VALUES
  ('de5a0006-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'Uyku günlüğü', 'Günlük', 'Her sabah uyku saati, uyanma sayısı ve dinlenmişlik puanını not et.', (current_date + (-6)), (current_date + (8)), 'devam', 'Bir sonraki seansta birlikte değerlendirilecek.', (now() + interval '-6 days')),
  ('de5a0006-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'Sabah nefes çalışması', 'Egzersiz', 'Uyanınca 15 dakika 4-6 nefes ritmi.', (current_date + (-20)), (current_date + (-6)), 'tamamlandi', 'Düzenli uygulandı.', (now() + interval '-20 days')),
  ('de5a0006-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000003'::uuid, 'Öğün saatleri kaydı', 'Günlük', 'Bir hafta boyunca öğün saatlerini ve öğleden sonra enerji durumunu yaz.', (current_date + (-5)), (current_date + (2)), 'devam', 'Beslenme planıyla birlikte incelenecek.', (now() + interval '-5 days'))
ON CONFLICT (id) DO NOTHING;

-- Analizler (Çakra Analizi — AnalizlerTab anahtar şeması)
INSERT INTO public.client_analyses (id, tenant_id, client_id, analysis_type, analysis_data, note, created_at)
VALUES
  ('de5a0007-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'chakra', '{"title":"Çakra Analizi","values":{"before_energy_ruhsal":{"mark":"","male":"","female":""},"before_energy_zihinsel":{"mark":"-","male":"","female":""},"before_energy_duygusal":{"mark":"-","male":"","female":""},"before_energy_eterik":{"mark":"","male":"","female":""},"before_energy_fiziksel":{"mark":"","male":"","female":""},"after_energy_ruhsal":{"mark":"","male":"","female":""},"after_energy_zihinsel":{"mark":"+","male":"","female":""},"after_energy_duygusal":{"mark":"+","male":"","female":""},"after_energy_eterik":{"mark":"","male":"","female":""},"after_energy_fiziksel":{"mark":"","male":"","female":""},"before_chakra_tac":{"mark":"+","male":"","female":""},"before_chakra_goz":{"mark":"","male":"","female":""},"before_chakra_bogaz":{"mark":"-","male":"","female":""},"before_chakra_kalp":{"mark":"-","male":"","female":""},"before_chakra_mide":{"mark":"","male":"","female":""},"before_chakra_sakral":{"mark":"","male":"","female":""},"before_chakra_kok":{"mark":"+","male":"","female":""},"after_chakra_tac":{"mark":"+","male":"","female":""},"after_chakra_goz":{"mark":"","male":"","female":""},"after_chakra_bogaz":{"mark":"+","male":"","female":""},"after_chakra_kalp":{"mark":"+","male":"","female":""},"after_chakra_mide":{"mark":"","male":"","female":""},"after_chakra_sakral":{"mark":"","male":"","female":""},"after_chakra_kok":{"mark":"+","male":"","female":""}},"demo_fixture":true}'::jsonb, 'Seans öncesi boğaz ve kalp bölgesinde düşük, seans sonrası dengelenmiş olarak işaretlendi.', (now() + interval '-20 days'))
ON CONFLICT (id) DO NOTHING;

-- Ücretlendirme
INSERT INTO public.client_charges (id, tenant_id, client_id, charge_date, category, amount, detail, note, created_at)
VALUES
  ('de5a0008-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (current_date + (-20)), 'session', 1500, NULL, 'İlk biyoenerji seansı', (now() + interval '-20 days')),
  ('de5a0008-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (current_date + (-20)), 'analysis', 600, NULL, 'Çakra analizi', (now() + interval '-20 days')),
  ('de5a0008-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (current_date + (-6)), 'session', 1200, NULL, 'Takip seansı', (now() + interval '-6 days')),
  ('de5a0008-c11e-4000-8000-000000000004'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (current_date + (-6)), 'other', 450, 'Ametist ve akuamarin taşı', 'Örnek ürün satışı', (now() + interval '-6 days')),
  ('de5a0008-c11e-4000-8000-000000000005'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000002'::uuid, (current_date + (-12)), 'session', 1300, NULL, 'İlk görüşme', (now() + interval '-12 days'))
ON CONFLICT (id) DO NOTHING;

-- Anamnez (std-v1, tamamlanmış)
INSERT INTO public.client_anamneses (id, tenant_id, client_id, kind, title, assessment_date, status, template_key, template_version, form_custom, answers, source_links, client_snapshot, revision, created_by_user_id, updated_by_user_id, completed_by_user_id, created_at, updated_at, completed_at)
VALUES
  ('de5a0009-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'initial', 'İlk görüşme anamnezi', (current_date + (-20)), 'completed', 'standard', 'std-v1', '{"hidden":[],"labels":{},"enabledSections":[],"custom":[]}'::jsonb, '{"A.reason":"Uzun süredir devam eden gerilim tipi baş ağrısı ve düzensiz uyku.","A.expectation":"Gün içinde daha dengeli enerji ve daha düzenli uyku.","A.priorities":"1) Uyku düzeni 2) Stres yönetimi 3) Düzenli hareket","A.aggravating":"Uzun ekran süresi, geç saatte yemek.","A.relieving":"Kısa yürüyüşler, nefes çalışması.","B.height_cm":168,"B.weight_kg":61,"B.past_illnesses":"Bildirilen önemli bir hastalık yok (sentetik örnek).","F.duration":6,"F.bedtime":"00:30","F.waketime":"07:00","F.quality":5,"G.meal_count":3,"G.water":"Günde yaklaşık 1,5 litre","G.caffeine":"Günde 2 fincan kahve","G.diet_style":"Karma beslenme","H.satisfaction":6}'::jsonb, '{}'::jsonb, '{"ad":"Eylül","soyad":"Karaca","dogum":"1990-03-21"}'::jsonb, 2, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), (now() + interval '-20 days'), (now() + interval '-20 days'), (now() + interval '-20 days'))
ON CONFLICT (id) DO NOTHING;

-- KVKK onam kayıtları
INSERT INTO public.client_consents (id, tenant_id, client_id, consent_type, status, text_version, method, source, note, recorded_by_user_id, recorded_at)
VALUES
  ('de5a000a-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'aydinlatma_bildirildi', 'granted', 'kvkk-2026-10', 'uygulama_onay', 'demo_vitrin_fixture', 'Sentetik örnek onam kaydı.', (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), (now() + interval '-60 days')),
  ('de5a000a-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'acik_riza_ozel_nitelikli', 'granted', 'kvkk-2026-10', 'islak_imza', 'demo_vitrin_fixture', 'Sentetik örnek onam kaydı.', (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), (now() + interval '-60 days')),
  ('de5a000a-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000002'::uuid, 'aydinlatma_bildirildi', 'granted', 'kvkk-2026-10', 'uygulama_onay', 'demo_vitrin_fixture', 'Sentetik örnek onam kaydı.', (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'), (now() + interval '-45 days'))
ON CONFLICT (id) DO NOTHING;

-- Beslenme: danışan profili
INSERT INTO public.nutrition_client_profiles (id, tenant_id, client_id, goal_type, goal_note, activity_level, dietary_pattern, daily_meal_count, target_weight_kg, water_note, lifestyle_note, general_note)
VALUES
  ('de5a000b-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'healthy_lifestyle', 'Gün içinde daha dengeli enerji.', 'light', 'Karma beslenme', 3, NULL, 'Günde 2 litre hedef', 'Masa başı çalışma, akşam yürüyüşü.', 'Sentetik örnek profil.'),
  ('de5a000b-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000003'::uuid, 'healthy_lifestyle', 'Öğün düzeni ve öğleden sonra enerji.', 'moderate', 'Akdeniz tipi', 4, NULL, 'Günde 2 litre', 'Haftada 2 gün pilates.', 'Sentetik örnek profil.')
ON CONFLICT DO NOTHING;

-- Beslenme: ölçümler
INSERT INTO public.nutrition_client_measurements (id, tenant_id, client_id, measured_at, weight_kg, height_cm, waist_cm, hip_cm, note)
VALUES
  ('de5a000c-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (((current_date + (-20))::timestamp + interval '9 hours') AT TIME ZONE 'Europe/Istanbul'), 61.8, 168, 74, 96, 'İlk ölçüm'),
  ('de5a000c-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (((current_date + (-6))::timestamp + interval '9 hours') AT TIME ZONE 'Europe/Istanbul'), 61, 168, 73, 95, 'Takip ölçümü'),
  ('de5a000c-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000003'::uuid, (((current_date + (-5))::timestamp + interval '9 hours') AT TIME ZONE 'Europe/Istanbul'), 58.4, 163, 70, 92, 'İlk ölçüm')
ON CONFLICT (id) DO NOTHING;

-- Beslenme: tercih / kaçınma
INSERT INTO public.nutrition_client_food_preferences (id, tenant_id, client_id, stance, food_id, food_label, note)
VALUES
  ('de5a000d-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'preferred', NULL, 'Yulaf', 'Kahvaltıda tercih ediyor.'),
  ('de5a000d-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, 'avoided', NULL, 'Acı biber', NULL)
ON CONFLICT (id) DO NOTHING;

-- Beslenme: plan (aktif, revizyon 1) + günler + öğünler + kalemler + besin snapshot'ları
INSERT INTO public.nutrition_plans (id, tenant_id, title, note, start_date, end_date, daily_energy_target, status, plan_family_id, revision_number)
VALUES
  ('de5a000e-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'Dengeli enerji — örnek haftalık plan', 'Sentetik örnek plan. Gerçek bir danışana ait değildir.', (current_date + (-6)), (current_date + (0)), 1800, 'active', 'de5a000f-c11e-4000-8000-000000000001'::uuid, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.nutrition_plan_days (id, tenant_id, plan_id, plan_date)
VALUES
  ('de5a0010-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, (current_date + (-6))),
  ('de5a0010-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, (current_date + (-5))),
  ('de5a0010-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, (current_date + (-4))),
  ('de5a0010-c11e-4000-8000-000000000004'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, (current_date + (-3))),
  ('de5a0010-c11e-4000-8000-000000000005'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, (current_date + (-2))),
  ('de5a0010-c11e-4000-8000-000000000006'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, (current_date + (-1))),
  ('de5a0010-c11e-4000-8000-000000000007'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, (current_date + (0)))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.nutrition_plan_meals (id, tenant_id, plan_id, plan_day_id, meal_type, label, sort_order)
VALUES
  ('de5a0011-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0010-c11e-4000-8000-000000000001'::uuid, 'breakfast', 'Kahvaltı', 0),
  ('de5a0011-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0010-c11e-4000-8000-000000000001'::uuid, 'lunch', 'Öğle', 1),
  ('de5a0011-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0010-c11e-4000-8000-000000000001'::uuid, 'dinner', 'Akşam', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.nutrition_plan_items (id, tenant_id, plan_id, meal_id, food_id, grams, quantity, food_name_snapshot, food_ownership_snapshot, portion_label_snapshot, portion_gram_snapshot, sort_order, note)
VALUES
  ('de5a0012-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0011-c11e-4000-8000-000000000001'::uuid, NULL, 50, 1, 'Yulaf ezmesi', 'custom', '1 kase', 50, 0, 'Sentetik örnek kalem.'),
  ('de5a0012-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0011-c11e-4000-8000-000000000001'::uuid, NULL, 150, 1, 'Yoğurt (tam yağlı)', 'custom', '1 kase', 150, 1, NULL),
  ('de5a0012-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0011-c11e-4000-8000-000000000002'::uuid, NULL, 250, 1, 'Mercimek çorbası', 'custom', '1 kase', 250, 0, NULL),
  ('de5a0012-c11e-4000-8000-000000000004'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0011-c11e-4000-8000-000000000002'::uuid, NULL, 150, 1, 'Mevsim salata', 'custom', '1 tabak', 150, 1, NULL),
  ('de5a0012-c11e-4000-8000-000000000005'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0011-c11e-4000-8000-000000000003'::uuid, NULL, 150, 1, 'Izgara tavuk göğsü', 'custom', '1 porsiyon', 150, 0, NULL),
  ('de5a0012-c11e-4000-8000-000000000006'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000e-c11e-4000-8000-000000000001'::uuid, 'de5a0011-c11e-4000-8000-000000000003'::uuid, NULL, 150, 1, 'Bulgur pilavı', 'custom', '1 porsiyon', 150, 1, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.nutrition_plan_item_nutrients (id, tenant_id, item_id, nutrient_code, amount, unit_code)
VALUES
  ('de5a0013-c11e-4000-8000-000000000001'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000001'::uuid, 'energy', 379, 'kcal'),
  ('de5a0013-c11e-4000-8000-000000000002'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000001'::uuid, 'protein', 13.2, 'g'),
  ('de5a0013-c11e-4000-8000-000000000003'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000001'::uuid, 'carbohydrate', 67.7, 'g'),
  ('de5a0013-c11e-4000-8000-000000000004'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000001'::uuid, 'total_fat', 6.5, 'g'),
  ('de5a0013-c11e-4000-8000-000000000005'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000001'::uuid, 'fiber', 10.1, 'g'),
  ('de5a0013-c11e-4000-8000-00000000000b'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000002'::uuid, 'energy', 61, 'kcal'),
  ('de5a0013-c11e-4000-8000-00000000000c'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000002'::uuid, 'protein', 3.5, 'g'),
  ('de5a0013-c11e-4000-8000-00000000000d'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000002'::uuid, 'carbohydrate', 4.7, 'g'),
  ('de5a0013-c11e-4000-8000-00000000000e'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000002'::uuid, 'total_fat', 3.3, 'g'),
  ('de5a0013-c11e-4000-8000-00000000000f'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000002'::uuid, 'fiber', 0, 'g'),
  ('de5a0013-c11e-4000-8000-000000000015'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000003'::uuid, 'energy', 56, 'kcal'),
  ('de5a0013-c11e-4000-8000-000000000016'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000003'::uuid, 'protein', 3.6, 'g'),
  ('de5a0013-c11e-4000-8000-000000000017'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000003'::uuid, 'carbohydrate', 8.9, 'g'),
  ('de5a0013-c11e-4000-8000-000000000018'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000003'::uuid, 'total_fat', 0.8, 'g'),
  ('de5a0013-c11e-4000-8000-000000000019'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000003'::uuid, 'fiber', 2.6, 'g'),
  ('de5a0013-c11e-4000-8000-00000000001f'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000004'::uuid, 'energy', 25, 'kcal'),
  ('de5a0013-c11e-4000-8000-000000000020'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000004'::uuid, 'protein', 1.2, 'g'),
  ('de5a0013-c11e-4000-8000-000000000021'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000004'::uuid, 'carbohydrate', 4.5, 'g'),
  ('de5a0013-c11e-4000-8000-000000000022'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000004'::uuid, 'total_fat', 0.3, 'g'),
  ('de5a0013-c11e-4000-8000-000000000023'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000004'::uuid, 'fiber', 1.8, 'g'),
  ('de5a0013-c11e-4000-8000-000000000029'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000005'::uuid, 'energy', 165, 'kcal'),
  ('de5a0013-c11e-4000-8000-00000000002a'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000005'::uuid, 'protein', 31, 'g'),
  ('de5a0013-c11e-4000-8000-00000000002b'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000005'::uuid, 'carbohydrate', 0, 'g'),
  ('de5a0013-c11e-4000-8000-00000000002c'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000005'::uuid, 'total_fat', 3.6, 'g'),
  ('de5a0013-c11e-4000-8000-00000000002d'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000005'::uuid, 'fiber', 0, 'g'),
  ('de5a0013-c11e-4000-8000-000000000033'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000006'::uuid, 'energy', 83, 'kcal'),
  ('de5a0013-c11e-4000-8000-000000000034'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000006'::uuid, 'protein', 3.1, 'g'),
  ('de5a0013-c11e-4000-8000-000000000035'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000006'::uuid, 'carbohydrate', 18.6, 'g'),
  ('de5a0013-c11e-4000-8000-000000000036'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000006'::uuid, 'total_fat', 0.2, 'g'),
  ('de5a0013-c11e-4000-8000-000000000037'::uuid, '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a0012-c11e-4000-8000-000000000006'::uuid, 'fiber', 4.5, 'g')
ON CONFLICT (id) DO NOTHING;

-- Plan ↔ danışan bağı
INSERT INTO public.nutrition_plan_clients (tenant_id, plan_family_id, client_id, assigned_by)
VALUES
  ('40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid, 'de5a000f-c11e-4000-8000-000000000001'::uuid, 'de5a0001-c11e-4000-8000-000000000001'::uuid, (SELECT u.id FROM public.users u WHERE u.tenant_id = '40f842a0-e3e8-448c-8971-9a938e1faccb'::uuid AND u.is_demo_account IS TRUE AND lower(btrim(u.email)) = 'uzman@test.com'))
ON CONFLICT (tenant_id, plan_family_id) DO NOTHING;

COMMIT;
