-- AUTH-01 (20271104000000) hedefli hesap kilitleme DoS düzeltmesi — davranış doğrulaması (hata → FAIL).
-- Yerel embedded-pg; prod'a temas YOK.
DO $$
DECLARE
  r jsonb; i int; n int;
BEGIN
  -- ── G: grant / RLS ──────────────────────────────────────────────────────────
  IF has_table_privilege('anon', 'public.auth_login_trusted', 'SELECT')
     OR has_table_privilege('authenticated', 'public.auth_login_trusted', 'SELECT')
     OR has_table_privilege('authenticated', 'public.auth_login_trusted', 'INSERT') THEN
    RAISE EXCEPTION 'G1 auth_login_trusted anon/authenticated erişimi açık';
  END IF;
  SELECT count(*) INTO n FROM pg_class WHERE oid = 'public.auth_login_trusted'::regclass AND relrowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION 'G2 auth_login_trusted RLS kapalı'; END IF;
  IF has_function_privilege('anon', 'public.auth_login_guarded(text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.auth_login_guarded(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'G3 auth_login_guarded istemci EXECUTE açık';
  END IF;

  DELETE FROM public.auth_login_throttle;
  DELETE FROM public.auth_login_trusted;

  -- ── O: owner hedefli kilit DoS ──────────────────────────────────────────────
  -- O1 owner bilinen IP'den bir kez başarılı giriş yapar → güvenilen işareti oluşur.
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-owner');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'O1 owner ilk giriş ok değil: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_login_trusted;
  IF n <> 1 THEN RAISE EXCEPTION 'O1b güvenilen IP kaydı yazılmadı (%)', n; END IF;
  -- O2 saldırgan 10 farklı IP'den 3'er yanlış deneme (30) → 'email' kapsamı kilitlenir.
  FOR i IN 1..30 LOOP
    r := public.auth_login_guarded('owner@test.com', 'yanlis', 'ip-attacker-' || ((i - 1) % 10));
  END LOOP;
  SELECT count(*) INTO n FROM public.auth_login_throttle
   WHERE scope = 'email' AND locked_until > now();
  IF n <> 1 THEN RAISE EXCEPTION 'O2 e-posta kilidi oluşmadı (eski koruma bozuldu?) n=%', n; END IF;
  -- O3 yeni (güvenilmeyen) IP'den DOĞRU parola → hâlâ locked (dağıtık kaba kuvvet koruması korunur).
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-new');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'O3 güvenilmeyen IP e-posta kilidini aştı: %', r; END IF;
  -- O4 owner kendi (güvenilen) IP'sinden DOĞRU parola → ok (DoS düzeltmesi).
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-owner');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'O4 güvenilen IP owner girişi reddedildi: %', r; END IF;

  -- ── T: güvenilen IP'den kaba kuvvet hâlâ sınırlı ('email_ip' bağlayıcı) ───────
  FOR i IN 1..5 LOOP
    r := public.auth_login_guarded('owner@test.com', 'yanlis', 'ip-owner');
  END LOOP;
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-owner');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'T1 güvenilen IP için email_ip kilidi uygulanmadı: %', r; END IF;

  -- ── D: herkese açık demo hesabı ─────────────────────────────────────────────
  DELETE FROM public.auth_login_throttle;
  FOR i IN 1..40 LOOP
    r := public.auth_login_guarded('demo@test.com', 'yanlis', 'ip-d-' || ((i - 1) % 20));
  END LOOP;
  SELECT count(*) INTO n FROM public.auth_login_throttle WHERE scope = 'email';
  IF n <> 0 THEN RAISE EXCEPTION 'D1 demo hesabı için e-posta sayacı tutulmamalı (n=%)', n; END IF;
  r := public.auth_login_guarded('demo@test.com', 'demo-parola-1', 'ip-visitor');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'D2 demo ziyaretçisi kilitlendi: %', r; END IF;
  SELECT count(*) INTO n FROM public.auth_login_trusted t
   WHERE t.email_key = 'e:' || encode(extensions.digest('demo@test.com', 'sha256'), 'hex');
  IF n <> 0 THEN RAISE EXCEPTION 'D3 demo için güvenilen IP kaydı tutulmamalı'; END IF;
  -- D4 demo için tek IP'den döngü yine durur ('email_ip')
  FOR i IN 1..5 LOOP
    r := public.auth_login_guarded('demo@test.com', 'yanlis', 'ip-loop');
  END LOOP;
  r := public.auth_login_guarded('demo@test.com', 'demo-parola-1', 'ip-loop');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'D4 demo email_ip kilidi uygulanmadı: %', r; END IF;

  -- ── N: normal hesapta eski davranış ve hesap varlığı gizliliği ───────────────
  DELETE FROM public.auth_login_throttle;
  r := public.auth_login_guarded('yok@test.com', 'x', 'ip-n');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'N1 var olmayan e-posta invalid değil: %', r; END IF;
  r := public.auth_login_guarded('three@test.com', 'yanlis', 'ip-n');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'N2 yanlış parola invalid değil: %', r; END IF;
  IF (r ? 'retry_after') OR (r ? 'user') THEN RAISE EXCEPTION 'N3 invalid yanıtı ek alan sızdırıyor'; END IF;
  r := public.auth_login_guarded('three@test.com', 'y', NULL);
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'N4 IP olmadan doğru giriş ok değil: %', r; END IF;

  -- ── S: 30 günden eski güven kaydı geçersiz ───────────────────────────────────
  DELETE FROM public.auth_login_throttle;
  UPDATE public.auth_login_trusted SET last_success_at = now() - interval '31 days';
  FOR i IN 1..30 LOOP
    r := public.auth_login_guarded('owner@test.com', 'yanlis', 'ip-attacker-' || ((i - 1) % 10));
  END LOOP;
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-owner');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'S1 süresi dolmuş güven kaydı kilidi aştı: %', r; END IF;

  -- ── F: yanlış pozitif / gerçek dünya senaryoları (mevcut davranışın belgelenmesi) ─────────
  DELETE FROM public.auth_login_throttle;
  DELETE FROM public.auth_login_trusted;
  -- F1 Ortak NAT: bir kişinin 5 hatası yalnız KENDİ e-posta+IP kovasını kilitler; aynı IP'deki başka uzman girer.
  FOR i IN 1..5 LOOP
    r := public.auth_login_guarded('three@test.com', 'yanlis', 'ip-ofis');
  END LOOP;
  r := public.auth_login_guarded('three@test.com', 'y', 'ip-ofis');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'F1a hatalı kullanıcının e-posta+IP kilidi yok: %', r; END IF;
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-ofis');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'F1b aynı IP''deki başka uzman kilitlendi: %', r; END IF;
  -- F2 Ortak NAT IP kovası (mevcut, değişmedi): farklı hesaplarla 50 hata → IP 15 dk kilit → herkes etkilenir.
  DELETE FROM public.auth_login_throttle;
  FOR i IN 1..50 LOOP
    r := public.auth_login_guarded('yok' || i || '@test.com', 'yanlis', 'ip-okul');
  END LOOP;
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-okul');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'F2 IP kovası (50) değişmiş: %', r; END IF;
  -- F3 Mobil → Wi-Fi: e-posta kilidi varken owner yeni (güvenilmeyen) IP'den girerse locked (yanlış pozitif,
  --    15 dk; eski davranışla aynı); bilinen IP'den hemen girer.
  DELETE FROM public.auth_login_throttle;
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-ev-wifi');
  FOR i IN 1..30 LOOP
    r := public.auth_login_guarded('owner@test.com', 'yanlis', 'ip-attacker-' || ((i - 1) % 10));
  END LOOP;
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-mobil-yeni');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'F3a yeni IP e-posta kilidini aştı: %', r; END IF;
  r := public.auth_login_guarded('owner@test.com', 'owner-parola-1', 'ip-ev-wifi');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'F3b bilinen Wi-Fi IP''sinden giriş reddedildi: %', r; END IF;
  -- F4 Güvenilen IP yetki aşımı yaratmaz: yanlış parola güvenilen IP'den de invalid.
  r := public.auth_login_guarded('owner@test.com', 'yanlis', 'ip-ev-wifi');
  IF r->>'status' <> 'invalid' THEN RAISE EXCEPTION 'F4 güvenilen IP yanlış parolayı kabul etti: %', r; END IF;
  -- F5 Güvenilen IP yalnız KENDİ e-postası için: başka hesabın kilidini aşamaz.
  DELETE FROM public.auth_login_throttle;
  FOR i IN 1..30 LOOP
    r := public.auth_login_guarded('three@test.com', 'yanlis', 'ip-x-' || ((i - 1) % 10));
  END LOOP;
  r := public.auth_login_guarded('three@test.com', 'y', 'ip-ev-wifi');
  IF r->>'status' <> 'locked' THEN RAISE EXCEPTION 'F5 owner''ın güvenilen IP''si başka hesabın kilidini aştı: %', r; END IF;

  RAISE NOTICE 'AUTH-01 lockout DoS assert: PASS';
END $$;
