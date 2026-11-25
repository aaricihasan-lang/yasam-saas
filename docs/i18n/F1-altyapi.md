# I18N-F1 — Çoklu Dil Altyapısı ve Kalite Kapıları

Başlangıç: `origin/main` 7de474e8 (2026-11-24). Mevcut next-intl 4 mimarisi KORUNDU; yeniden yazım yok.

## 1. Bileşenler

| Dosya | Görev |
|---|---|
| `lib/i18n/gate.ts` | **Yayın kapısı** (`NEXT_PUBLIC_I18N_LOCALE_SWITCHING`): production'da varsayılan KAPALI → dil seçici görünmez, eski `NEXT_LOCALE=en` çerezi yok sayılır, render daima `tr`. `on` → Preview/test ortamında açık; `next dev`'de varsayılan açık. Değişiklik yeni deployment ister. |
| `lib/i18n/catalog.ts` + `i18n/catalog.generated.ts` | Katalog birleştirme. Kayıt **otomatik üretilir** (`npm run i18n:catalog`); yeni modül sözlüğü `request.ts`'e dokunmadan eklenir. |
| `i18n/request.ts` | Locale = kapı + çerez; production'da hedef dil kataloğu kaynak dil üzerine birleştirilir (eksik anahtar → boş/ham anahtar yerine Türkçe metin); `timeZone: Europe/Istanbul`. |
| `lib/i18n/localePreference*.ts`, `app/api/me/locale` | **Kalıcı dil tercihi** (hesap). Bkz. §3. |
| `lib/i18n/localeCookie.ts`, `setLocale.ts` | Çerez: HttpOnly, production'da Secure, SameSite=Lax, 1 yıl. `clearLocale()` çıkış entegrasyonu için hazır. |
| `lib/i18n/format.ts` | tr-TR / en-GB / de-DE; `formatNumber`, `formatCurrency` (TRY sabit, kur yok), `formatTime24`, `formatDateAbsoluteInZone`. Mevcut fonksiyonlar byte-aynı. Mutlak sayısal tarih (A13): isteğe bağlı `locale` → tr `DD.MM.YYYY` (argümansız çağrı dahil, bayt-bayt aynı) · en `DD/MM/YYYY`; 24 saat. |
| `lib/i18n/apiError.ts` + `common.apiErrors` | Sunucu `code` → ekran dili. TR'de sunucu metni bugünkü gibi; başka dilde eşlenmemiş Türkçe metin ASLA yapıştırılmaz. |
| `lib/i18n/output.ts` | Word/PDF/PNG **çıktı dili sözleşmesi** (ekran dili = çıktı dili, aynı katalog, kullanıcı içeriği çevrilmez, hesap dile bağlanmaz). |
| `lib/i18n/providerLanguage.ts` | Roxy dil hazırlığı (doğrulanmış/bekleyen diller, önbellek anahtarına dil). Henüz hiçbir modüle bağlı değil. |
| `lib/i18n/terms/registry.ts` + `messages/*/terms.json` | **Kanonik kimlik + merkezî terminoloji** (burç, gök cismi, element, ay evresi). |
| `lib/i18n/pseudo.ts` | Sözde-yerelleştirme (yalnız dev, `I18N_PSEUDO=on`): İngilizce metinleri ⟪ŕéçóŕď⟫ yapar; çevrilmemiş metin ve taşmalar görünür. |
| `hooks/useDeleteConfirm.ts`, `lib/ui/bulkDeleteGuard.ts` | Silme/toplu silme metinleri `common.deleteConfirm`'dan; kontrol akışı metinden bağımsız; TR birebir. |

## 2. Kalite kapıları (CI regresyon listesinde)

| Komut | Ne reddeder |
|---|---|
| `npm run i18n:check` | C1–C10: dosya kümesi, anahtar eşitliği, boş değer, dosyalar arası çakışma, ICU ayrıştırma, argüman/placeholder/etiket eşitliği, `other` dalı, kodda olmayan anahtar, dinamik anahtar ön eki, katalog kaydı güncelliği |
| `npm run i18n:hardcoded` | Kullanıcıya görünür sabit metinde **artış** (cırcır). Taban: `scripts/i18n/baseline/hardcoded.json`. Owner'a özel yönetim ekranları kapsam dışı (`scripts/i18n/scope.json`). Kanonik değer → aynı satırda `i18n-ignore: <gerekçe>`. |
| `npm run i18n:tr-freeze` | Mevcut Türkçe metinlerde değişiklik/silme (bağımsız Türkçe regresyon). |
| `npm run i18n:unit` | Kapı, öncelik sırası, hesap izolasyonu, biçimler, hata kodu, silme onayı (TR birebir + EN), terminoloji, çıktı dili. |
| `npm run i18n:calc` | Hesaplama değişmezliği (statik + TR/EN süreç + altın değer). |
| `npm run i18n:negative` | Kapıların kasıtlı hataları gerçekten reddettiğinin kanıtı. |
| `npm run test:i18n:pg` | `user_locale_prefs` migration'ı geçici PostgreSQL'de (RLS, yetki, CHECK, izolasyon, CASCADE). |
| `npm run test:i18n:stones` | Doğaltaş 2a–2j harness'ları. |

Otomasyonun YAKALAYAMADIĞI: anlam/terminoloji doğruluğu, ton, kültürel uygunluk, hukuki metin doğruluğu → anadil incelemesi + Owner kabulü.

## 3. Dil tercihi öncelik sırası

1. Yayın kapısı kapalı → her şey `tr`.
2. Giriş yapılmışsa **hesap tercihi** (`public.user_locale_prefs`) — tek doğru kaynak; cihaz/tarayıcı/oturumdan bağımsız.
3. `NEXT_LOCALE` çerezi — render anında okunan cihaz kopyası (dil seçici hesap tercihini okuyup çerezi eşitler).
4. Varsayılan `tr`.

Ortak bilgisayar: hesapta tercih yoksa hedef `tr` → önceki uzmanın dili taşınmaz. Tercih okunamıyorsa (migration yok, demo hesap) çerez korunur. Demo hesap ortak kullanıldığı için tercih **saklanmaz**.

## 4. Paralel modül geliştirme kuralları (F2+)

- Her ajan: kendi worktree'si + yalnız `messages/{tr,en}/<modül>*.json` + kendi modül dizini. `npm run i18n:catalog` ile kaydı üretir.
- **Tek yazıcı (koordinatör)**: `i18n/`, `lib/i18n/**`, `messages/*/{common*,navigation,home,terms}.json`, `scripts/i18n/**` (taban dosyaları dahil), `hooks/useDeleteConfirm.ts`, `components/ui/**`, `app/layout.tsx`, `app/page.tsx`, `docs/i18n/**`.
- Terim: önce `terms` / glossary'de var mı bakılır; yeni terim koordinatöre önerilir, ajan kendi terimini uydurmaz.
- Sabit metin tabanı yalnız aşağı çekilir (`npm run i18n:hardcoded:update` koordinatörde). Artış = Owner onayı.
- Kalite kontrol ajanı yazma yetkisi olmadan tüm kapıları + EN render kontrolünü çalıştırır.

## 5. Güvenlik çalışmasıyla entegrasyon (HttpOnly / QR / e-posta OTP)

F1 şu dosyalara DOKUNMAZ: `lib/auth/**`, `app/api/auth/**`, `app/layout.tsx`, `app/page.tsx`, `app/settings/**`, `public.users`. Güvenlik dalı main'e alındıktan sonra yapılacak küçük entegrasyonlar:
1. Çıkış uçlarında `clearLocale()` çağrısı (ortak bilgisayarda çerezin anında temizlenmesi).
2. Ayarlar sayfasına dil tercihi bölümü (bileşen hazır değil; F2-A'da `app/settings` sahibi ajanla).
3. Güvenlik dalının yeni ekranları (`app/m/*`, `components/auth/*`, `components/settings/*`) sabit metin kapısına takılır → çeviri ya da Owner onaylı taban güncellemesi.
4. Güvenlik dalının migration önekleri (`202801030009…`) main'deki en büyük önekten (20280124…) küçük → DB-02 adlandırma kapısı onları zaten reddeder; bu F1'den bağımsızdır. F1 migration'ı `20280126000000`.

## 6. Modül adları — Owner onayı gereken öneriler

| Türkçe ad | Bugünkü EN | Öneri | Önerinin Türkçe karşılığı | Gerekçe | Alternatifler |
|---|---|---|---|---|---|
| Gökyüzü Atlası | *(çevrilmemiş)* | **Celestial Atlas** | Göksel Atlas | "Gökyüzü atlası" metaforunu korur; profesyonel ve doğal | Astrology Atlas (Astroloji Atlası) · Sky Atlas (Gökyüzü Atlası — kelimesi kelimesine) |
| Yaşam Takvimi / Kozmik Ajanda | Life Calendar / Cosmic Calendar (R5 §24 uygulandı; önceki: Cosmic Agenda) | **Cosmic Calendar** | Kozmik Takvim | İngilizcede "agenda" toplantı gündemi demektir; takvim anlamı "calendar" | Cosmic Planner (Kozmik Planlayıcı) · Life Calendar (Yaşam Takvimi) |
| Doğal Destek & Rehber (Şifa Rehberi) | Natural Support & Guide | **Natural Wellness Guide** | Doğal İyi Yaşam Rehberi | "Healing" (şifa) İngilizce pazarlarda tıbbi iddia gibi okunur; "wellness" güvenli ve doğal | Holistic Care Guide (Bütüncül Bakım Rehberi) · Natural Support Guide |
| Kupa / Hacamat | *(çevrilmemiş)* | **Cupping & Hijama** | Kupa ve Hacamat | Hacamatın uluslararası karşılığı "hijama" | Cupping Therapy (Kupa Terapisi) |
| Yaşam Hafızası | Life Memory | **Life Memory** (marka terimi olarak koru) | Yaşam Hafızası | Kısa, ayırt edici; açıklayıcı alt başlıkla desteklenebilir | Life Archive (Yaşam Arşivi) · Life Records (Yaşam Kayıtları) |
| Yaşam Analiz Merkezi | Life Analysis Center | **Life Analysis Centre** | Yaşam Analiz Merkezi | en-GB yazımı (Owner A8 ile tutarlı) | Life Analysis Center (Amerikan yazımı) |

Ayrıca karar: **İngiliz mi Amerikan yazımı mı?** Mevcut katalog karışık (Center/Color ↔ Capitalisation/unrecognised). Biçimlendirme en-GB olduğu için öneri: İngiliz yazımı (Centre, Colour, Personalise).

Değişmeyen (doğal ve onaylı): Client Journey, Natural Stone (01.09 Owner kararı), Products & Inventory, Body & Energy Practices, Digital Content Center*, Numerology, Human Design, Reflexology, Aromatherapy, Nutrition, Personal Archive. (*yazım kararına bağlı)

## 7. Açık riskler (F1'de bilinçli olarak dokunulmadı)

- **Kozmik Ajanda P0 (bekleyen, Owner A12):** `lib/cosmic/transit-interpretations.ts` Türkçe burç/gezegen anahtarları; `app/cosmic-calendar/power-days/page.tsx:61-63` ve `lib/campaign/visitor/runners/kozmik.ts:58` "Dolunay" adına bağlı puanlama. Kimlikler (`terms/registry.ts` `full_moon` vb.) hazır; Kozmik en son modül.
- **Numeroloji kayıtlı metin ayrıştırma** (`chronoCutoff.ts:63`, `futureYearsRedaction.ts:38`) ve **Türkçe kanonik DB değerleri** (`clients.burc`, HD bilgi bankası kategorileri, numeroloji sınıfları) — ertelenmez: ilgili modül dalgasının İLK işi; altın değer testi (`i18n:calc`) sonucu kilitler.

## 8. F1-R1 (2026-11-24) — güncel main entegrasyonu ve tamamlamalar

**Taban:** origin/main a52b62ea (#839 giriş güvenliği). F1 değişiklikleri commit edilmeden üç yönlü yamayla taşındı (68 dosya, çakışma yok).

**Owner kararları uygulandı:** İngilizce = en-GB yazımı (Centre, organise, personalised, authorised, jewellery, grey). Modül adları:
Gökyüzü Atlası → Celestial Atlas · Şifa Rehberi → Natural Wellness Guide · Kupa / Hacamat → Cupping & Hijama ·
Danışan Yönetimi → Client Management · Doğaltaş → Natural Stone (modül adı; taşların kendisinden çoğul söz edilirken "stones").
Kozmik Ajanda → Cosmic Calendar ONAYLI ama Kozmik fazına kadar katalogda DEĞİŞTİRİLMEDİ (Owner: Kozmik'e henüz dokunma).
Human Design "Center" terimi alanın resmî İngilizce terimi olduğu için korundu (Centre yapılmadı).

**Dil tercihi entegrasyonu:**
- Çıkış: `DELETE /api/auth/session` yanıtı `NEXT_LOCALE` çerezini de siler (`clearLocaleCookie`); oturum kapatma mantığı aynı.
- Ayarlar → **Dil** sekmesi (`components/settings/LanguagePreferenceSection.tsx`); yalnız yayın kapısı açıkken eklenir.

**Güvenlik ekranları (#839) çevirisi:**
- Arayüz: `messages/*/auth.ui.json`. MFA/QR paneli, hesap kurtarma, giriş yöntemlerim, `/m/*` telefon onay sayfaları.
- Sunucu: `messages/*/auth.server.json` + `lib/i18n/serverMessages.ts` (`requestTranslator`). Rota hata metinleri isteğin etkin dilinde; durum kodu ve `code` alanı aynı; kapı kapalıyken daima Türkçe.
- E-postalar: `messages/*/auth.email.json`. OTP ve güvenlik bildirimleri ekran dilinde; kod konusu biçimi `<kod> — …` korundu. Owner'ın tetiklediği e-postalar Türkçe.
- Owner'a özel: `lib/auth/mfaAdminStatus.ts`, `lib/auth/adminPasswordGuard.ts` (scope.json `ownerOnlyReasons`).

**Hesaplama değişmezliği CI'da:**
- `scripts/i18n/calc-invariance.harness.ts` regresyon listesinde. Dar istisna `KORUNAN_SALT_OKUNUR_ISTISNA` (tam dosya yolu; `scripts/ci/run-regression.mjs`).
- Varsayılan yerel ayar `scripts/i18n/locale-shim.mjs` ile işletim sisteminden bağımsız zorlanır; sondalarla kanıtlanır.
- Kapsam: HD, astroloji (Batı Horary yerel motoru), numeroloji (motor + gelecek yılları gizleme), burç, ay.

**Yeni test betikleri:**
- `scripts/i18n/ui-e2e-mfa.ts`: e-posta OTP girişi × dil, çıkış, Ayarlar dili, migration'sız ortam.
- `scripts/i18n/visual-regression.mts`: yakalama ve piksel karşılaştırma.
- `scripts/i18n/ui-pseudo.mts`: sözde-yerelleştirme, `next dev`.
- `scripts/i18n/roxy-lang-probe.mts`: ücretli; anahtar ve `--confirm-paid` ister; varsayılan en fazla 6 çağrı.
