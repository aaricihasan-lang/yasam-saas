# ASTROLOJİ AŞAMA 7B — İLERLEME KAYDI (Danışan Listesi · Danışan Ön İzleme · Güvenli Eşleştirme · Arşiv)

- Başlangıç HEAD: `ef02e8ce` (Aşama 7A; temiz, upstream yok) · Branch `work/astrology-roxy` · Worktree `C:/yasam-astrology-roxy`
- Commit'ler: `0b8cab08` migration + PG · `56360165` sunucu/API · `f175e289` arayüz + DY rozeti · `d86c1d41` uçtan uca test · (son) görsel düzeltme + yerel tohum + bu rapor
- Gerçek Roxy çağrısı: **0** (toplam 47 aynı). Production / Frankfurt / Tokyo: **dokunulmadı**. Push / merge / deploy / prod migration: **yok**. Gerçek danışan verisi: **yok**.

## 1. Danışan Listesi (yeni davranış)
- Sunucu tarafı: `GET /api/admin/astroloji/profiles?q=&birthDate=&archived=1&sort=recent|name&limit=&offset=` → RPC `astro_profile_page`
  (tenant + uzman parametreli). Arama ad/soyad/profil adı ve eşleşik danışan adı üzerinde, Türkçe duyarsız
  (`astro_norm` = `lib/astrology/search/normalize.ts`). LIKE jokerleri kaçırılır (`%` arama değildir).
- Sayfa ≤ 100 (arayüz 30'ar, "Daha fazla göster"); **200 kayıt sınırı kalktı** (231 profil testte eksiksiz).
- Her satır: profil adı, eşleşik danışan, doğum tarihi/saat/yer, **kayıtlı analiz sayısı + son analiz tarihi**, arşiv rozeti.
- Filtreler: arama (300 ms gecikmeli), doğum tarihi, Etkin/Arşiv, sıralama (son işlem / ada göre). Bayat yanıt koruması.
- Bilgi simgesi (ⓘ): istenen açıklama metni; tıklayınca açılır, mobilde ekrana sabitlenir (taşma düzeltildi).
- Karşı taraf (sinastri/composite) seçimi artık kendi sunucu aramasıyla gelir (sayfalı listeye bağımlı değil).

## 2. Analiz geçmişi (yeni düzen)
- `GET /analyses?profileId=` → `groups` (Batı Astrolojisi / Vedik / Jyotish / KP; **yalnız kaydı olan gelenek ve teknikler**) + sayfa.
  `&tradition=&technique=&offset=&limit=` ile süzülür; ≤ 100/sayfa (207 analiz testte eksiksiz).
- Arayüz: "Tümü (n)" + gelenek çipleri + (birden fazla teknik varsa) teknik çipleri + "Daha fazla göster".
- Satır: kayıt adı, analiz türü, seçenek özeti, tarih, revizyon. Açmak yalnız snapshot okur (**0 Roxy**, testli). İçerik değiştirilmez.
- Düzeltme: KP analizleri "Batı · …" diye etiketleniyordu → gelenek tekniğin kendisinden okunur ("KP · …").
- Başka uzmanın profiliyle liste artık `200 []` değil, tek tip **404** (7A P3-4 kapandı).

## 3–4. Danışan Yolculuğu ile sınırlı kimlik eşleştirmesi + Danışan Ön İzleme
- Aday arama: `GET /clients/candidates?name=&birthDate=` → RPC `astro_client_candidates`: yalnız **çağıranın tenant'ındaki** merkezî
  danışanlar (Danışan Yolculuğu'nun kendi kuralı: `requireModuleAccess("clients")` + `tenant_id`). Türkçe/büyük-küçük/boşluk duyarsız.
  Kesin eşleşme varsayılmaz: aynı ad+soyad+doğum tarihli **üç kayıt ayrı ayrı** ve "3 olası kayıt" uyarısıyla gösterilir. Otomatik bağ yok.
  En az 2 harf ya da doğum tarihi gerekir (tüm danışanları dökmez). Profil adından ad, profilden doğum tarihi önceden doldurulur.
- Ön izleme: `GET /clients/[id]/preview` — yalnız `id, ad, soyad, dogum, telefon, created_at` kolonları **okunur**
  (kan/mizaç/görüşme/sağlık/e-posta sorguya girmez; test sorgu günlüğünü denetler). Gösterilen: ad soyad, doğum tarihi,
  maskeli telefon (yalnız son 2 hane), kayıt tarihi, danışan kayıt no (şemada numara kolonu yok → kimliğin değişmez 8 haneli öneki),
  uzmanın bu danışana bağlı kendi Astroloji profilleri. **Şehir ve e-posta şemada tutulmadığı için gösterilmez; yeni alan yaratılmadı.**
- Modal: ekranın ortasında; masaüstünde **%50 genişlik** (1536 px pencerede 768 px ölçüldü), mobilde ekrana uyar (390 px'te kenarlarda 12 px);
  en çok %88 yükseklik, içerik kendi içinde kayar; Esc / arka plan / Kapat ile kapanır, sayfa kaydırması kilitlenir ve geri açılır;
  Astroloji ekranından çıkılmaz (URL aynı), iframe yok. Her aday ayrı ön izlenebilir.

## 5. Eşleştirme / yeniden bağlama / kaldırma
- `PUT /profiles/[id]/client {clientId, expectedClientId, confirmRelink?}` → RPC `astro_profile_set_client` (FOR UPDATE + iyimser kilit).
  - Yalnız uzmanın kendi profili (başkası → 404) + kendi tenant'ındaki danışan (başka tenant / var olmayan → 404). Ek ilişki tablosu YOK; mevcut `client_id` + 7A `ON DELETE SET NULL`.
  - Profil başka danışana bağlıysa onaysız istek **409 RELINK_CONFIRM_REQUIRED** (mevcut danışanı döner) → arayüzde ayrı onay adımı.
  - Ekranda görülen bağ değişmişse **409 CLIENT_LINK_CONFLICT** (bayat ekrandan yanlış ilişkilendirme engellenir).
- `DELETE /profiles/[id]/client?expectedClientId=` → kaldırma (onaylı); profil/revizyon/analiz **silinmez** (207 analiz testte aynen).
- Danışan silinince bağ NULL olur (7A); FK'siz bir ortamda kalabilecek "bozuk bağ" profil detayında `clientMissing` olarak gösterilir, ad sızmaz, bağ kaldırılabilir.
- Not (mimari gerçek): merkezî danışanlar sistem genelinde **tenant** kapsamlıdır ve her uzman ayrı tenant'tır (7A kanıtı). Bu yüzden
  "başka uzmanın danışanı" = başka tenant'ın danışanı → reddedilir. Aynı tenant'ta birden çok kullanıcı olursa danışanlar Danışan
  Yolculuğu'ndaki gibi o tenant'ta ortaktır; Astroloji profilleri ise uzman bazında ayrıdır.

## 6. Danışan Yolculuğu Astroloji durum alanı
- `components/astrology/AstrologyClientStatus.tsx` — DY danışan detayındaki hero rozet satırına (KVKK onam rozetinin yanına) lazy eklendi.
  DY sayfasında yalnız **+3 satır** (dynamic import + yorum + tek JSX); hiçbir iş akışı değişmedi. static harness farkın yalnız bu satırlar olduğunu denetler.
- Durumlar: **Astroloji analizi mevcut (n)** / **Henüz Astroloji analizi yok** / **Astroloji bağlantısı bulunmuyor** — `GET /client-status`
  (RPC `astro_client_status`): uzmanın **eşleşik** profillerindeki gerçek kayıtlı analiz sayısı; profil tek başına "analiz var" sayılmaz; Roxy yok.
- Görünürlük: admin olmayan oturumda istek bile atılmaz; owner olmayan admin / kill switch kapalı → sunucu tek tip 404 → rozet çizilmez;
  ağ/hata sessizce gizlenir. Yanıt yalnız `{status, analysisCount, lastAnalysisAt}` (içerik sızmaz; testli).
- DY'yi okuyan mevcut testler yeniden koşuldu: anamnez 146, bildirimler 129, beslenme 93, demo vitrin 236, beslenme erişim — hepsi PASS.

## 7. Bilgi simgesi
- Metin birebir: "Astroloji analizleri kendi modülünde saklanır. Danışan Yolculuğu ile yalnızca isteğe bağlı danışan eşleştirmesi ve analiz
  bulunma durumu paylaşılır. Haritalar, yorumlar ve raporlar Danışan Yolculuğu'na aktarılmaz."

## 8. Arşiv ve silme kararları
- **Arşiv uygulandı:** `archived_at` (migration 000400). `PATCH /profiles/[id] {archived}` (onaylı). Etkin listeden kalkar, "Arşiv" filtresinde
  bulunur, analiz sayısı ve açılabilirlik aynen, geri alınır. Başka uzman arşivleyemez (404).
- **Kalıcı silme UYGULANMADI** (karar gerekiyor). Bağımlılık zinciri (kanıtlı, migration'lar):
  profil → revizyonlar → sağlayıcı sonuçları → yorumlar; çalışma notları; kayıtlı analizler + analiz notları (hepsi CASCADE).
  **Kritik:** karşı taraf FK'leri (`astro_pr_partner_fk`, `astro_an_partner_fk`, 7A `*_partner_owner_fk`) de CASCADE → B profili silinirse,
  B'yi sinastri/composite karşı tarafı olarak kullanan **A profilinin kayıtlı analizleri de silinir**. Bugün silme yolu ve `service_role`
  DELETE yetkisi olmadığından risk yok (PG testi doğrular).
- KVKK etkisi: doğum verisi kişisel veridir; 7A sonrası DY'de danışan silinmesi Astroloji verisini silmez → silme talebi Astroloji'de ayrıca ele alınmalı.
  Snapshot'lar değişmezdir ve kayıt anındaki doğum verisini / danışan adını taşır.
- Seçenekler (owner kararı): (A) tek profil kalıcı silme: silme önizlemesi (etkilenen revizyon/sonuç/analiz ve **başka profillerdeki karşı taraf
  analizleri**), yazılı ad onayı (DY cascade-delete deseni), denetim kaydı; önce karşı taraf FK'lerini RESTRICT/SET NULL'a çevirme kararı.
  (B) anonimleştirme: değişmez snapshot'ları değiştirmeyi gerektirir (mimari kural ihlali). (C) yalnız arşiv + owner'ın elle yürüttüğü KVKK süreci.
  Toplu kalıcı silme eklenmedi.

## 9–10. İzolasyon testleri ve sayılar
| Test | Sonuç |
|---|---|
| `npm run test:astrology` (15 TS dosyası) | **336 PASS / 0 FAIL** (318 + 7B 16 + static 2) |
| PG — 000…200 eski zincir · 7A temiz · 7A yükseltme · 7A fail-closed | PASS (değişmedi) |
| PG — 7B (`test:astrology:pg7b`): 231 profil / 205 analiz sayfalama, Türkçe arama, aynı kimlikli üç danışan, başka tenant/uzman reddi, eşleştirme kilidi, arşiv, danışan silme, anon/authenticated yetkisizliği | PASS |
| `tsc --noEmit` (uygulama + test) · `next build` | 0 hata · OK |
| eslint (Astroloji dosyaları + DY sayfası) | Astroloji: 0. DY sayfasında 3 bulgu — 267/356/1934. satırlar, **önceden var**, 7B'nin eklediği satırlarda değil (dokunulmadı) |
| Mutasyon (phase7b): ön izleme tenant filtresi / ön izleme kolonları / yeniden bağlama onayı / durum mantığı / analiz geçmişi sahiplik | **5/5 yakalandı** |
| Tarayıcı (yerel `next start` + sahte PostgREST, gerçek Roxy/DB yok) | masaüstü 1536 px + mobil 390 px (aynı kökenli iframe) — ayrıntı aşağıda |

Zorunlu senaryolar → kanıt: aynı tenant iki uzman (phase7b U1/U2 + PG); farklı tenant (UB + PG); aynı kimlikli üç danışan (phase7b + PG + tarayıcı);
Türkçe İ/i/ı/I (phase7b + PG + tarayıcı "  İLKNUR ışık "); başka uzmanın profili/danışanı ve doğrudan yetkisiz danışan ID'si (404'ler);
yanlış eşleştirmeyi kaldırma; DY kaydı silinince veri korunması; eşleşme var/analiz yok; eşleşme + çok analiz; eşleşme yok; yetkisiz kullanıcı
(uzman / owner olmayan admin / oturumsuz → tek tip 404, astroloji tablosuna sorgu yok); >200 profil; >200 analiz; arşiv/geri alma;
kayıtlı analizi açarken 0 Roxy; mobil/masaüstü (tarayıcı); 318 regresyon (yeşil).

Tarayıcı bulguları: masaüstünde liste/arama/filtre/sayfalama, aday arama (3 kayıt + uyarı), ön izleme (%50, ortalı, kayar, Esc), ön izlemeden
eşleştirme, "ŞU AN EŞLEŞİK" işareti, yeniden bağlama onayı, onaylı kaldırma, analiz grupları (Tümü 15 / Batı 6 / Vedik 4 / KP 5) doğrulandı.
390 px'te sayfa / aday listesi yatay taşma 0; modal kenarlarda 12 px, kendi içinde kayar. **Bulunup düzeltilen:** bilgi notu 390 px'te sağdan
50 px taşıyordu → mobilde ekrana sabitlenen yerleşim (yeniden derleme sonrası 390 px'te 16–356 px, taşma 0; masaüstünde simge altında 320 px).
Onay metni dil düzeltmesi ("… ile eşleşik").
DY danışan detayı (gerçek sayfa, yerel): owner oturumunda "KVKK kaydı yok" rozetinin yanında **"Astroloji analizi mevcut (15)"**; owner olmayan
admin oturumunda durum ucu 404 ve rozet hiç çizilmedi, sayfanın geri kalanı aynen açıldı.

## 11. P0 / P1 / P2 / P3
- **P0 = 0 · P1 = 0 · P2 = 0** (açık).
- **P3:**
  1. Kalıcı silme kararı (8. bölüm) — karşı taraf CASCADE zinciri silme özelliği tasarlanmadan önce çözülmeli.
  2. Aynı tenant'ta birden çok kullanıcı olursa merkezî danışanlar (DY kuralı gereği) o tenant'ta ortaktır; ürün akışında her uzman ayrı tenant'tır.
  3. Kayıt parametresi boş/bozuk eski satırlarda analiz listesi seçenek özeti "undefined" gösterebilir (yalnız sentetik tohumda görüldü;
     gerçek kayıtlar her zaman normalize parametre taşır).
  4. Ön izleme JS ile açıldığında odak, açan düğme yerine önceki odaklı öğeye döner (gerçek tıklamada düğme odak alır).
  5. `astro_norm` C yerelinde Türkçe dışı büyük harfleri (É gibi) küçültmez; Türkçe harfler `translate` ile önceden eşlendiği için Türkçe aramayı etkilemez.
  6. Ön izlemedeki "kayıt no" gerçek bir numara kolonu değil, kimlik önekidir (şemada numara yok).

## 12. Migration gereksinimleri
- Yeni: `20271101000400_astrology_client_list.sql` (additive; 1 kolon + 8 fonksiyon; veri silmez; idempotent; yalnız service_role).
- Uygulama sırası (owner onayıyla, ileride): `000000 → 000100 → 000200 → 000300 → 000400`, **sonra** kod.
  Kod 000400 olmadan 503 ASTRO_NOT_READY döner (modül zaten kill switch ile kapalı).

## 13. Canlı sisteme dokunulmadı
- Tüm DB testleri geçici yerel embedded-postgres; tarayıcı testi yerel `next start` + yerel sahte PostgREST (127.0.0.1:54329); `ROXY_API_KEY`
  süreçten kaldırıldı, worktree'de `.env` yok, kabukta Supabase/DB değişkeni yok. Push/merge/deploy/migration yok; upstream ayarlı değil.

## 14. Sonraki aşamaya hazırlık
Aşama 7B kapsamı tamamlandı. Bir sonraki aşamaya (uzman yetkileri / Premium rapor) teknik olarak hazır; kalıcı silme için owner kararı bekleniyor.

**Aşama 7B yerel olarak tamamlandı. Push / preview / merge / production / migration YOK. DUR — owner raporu bekleniyor.**
