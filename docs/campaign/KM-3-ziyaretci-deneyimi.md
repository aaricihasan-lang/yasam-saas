# Kampanya Merkezi — KM-3 Gerçek Ziyaretçi Deneyimi

Bu belge, Owner'ın açtığı ücretsiz analizlerin kayıtsız ziyaretçiye nasıl sunulduğunu anlatır. Tasarım, KM-P0 v2 görsel PASS prototipinden geliyor; Owner önizlemesi ve canlı sayfa **aynı bileşeni** kullanıyor (`app/_campaign/VisitorCampaignView.tsx`).

## Görünürlük — üç kapı (hepsi gerekli)

1. **Ortam:** `CAMPAIGN_PUBLIC_ENABLED=true` **ve** `CAMPAIGN_MAINTENANCE_ENABLED=true`. Varsayılan kapalıdır; kapalıyken `/ucretsiz-analiz` ve `/api/kampanya/*` 404 döner. Kod yayına çıksa bile ziyaretçi hiçbir şey görmez.
2. **Veritabanı:** Yayındaki tek kampanya Aktif veya Yakında olmalı, tarih penceresi uygun olmalı, acil durdurma kapalı olmalı.
3. **Teknik:** Owner tekniği açmış olmalı, teknik katalogda **hazır** olmalı ve gerçek motora bağlı bir çalıştırıcısı bulunmalı (`lib/campaign/visitor/runners`).

## Gerçek motora bağlı teknikler (54) — gece operasyonu 02.11.2026 sonrası

| Modül | Teknikler | Motor | Kredi |
|---|---|---|---|
| Human Design (2) | BodyGraph; **İlişki Analizi (Connection, 2 kişi)** | Roxy BodyGraph (kişi başı) + Connection; uzman akışıyla aynı şema + tutarlılık denetimi | 1; 3 |
| Klasik Numeroloji (10) | core, bridge, personal_day, daily, chaldean, dual, person_all, compatibility, business_name, **names (≤3 aday)** | Roxy `/numerology/*` + mevcut servis (`computeClassicResult`) | 1–5 |
| Bütüncül Numeroloji (4) | analysis, timing, **relation (2 kişi)**, **place (bina + daire)** | Yerel motor | 0 |
| Gökyüzü Atlası (37) | Batı: natal, transit, **forecast (≤90 gün)**, progression, solar_arc, solar_return (+dönüş yeri), **lunar_return, planetary_return**, profections, **synastry, composite, astrocartography, relocation, local_space, fixed_stars, extra_points** · Vedik: d1, **varga, dasha, drishti, ashtakavarga, shadbala, panchanga, transit, bhav_chalit, chara_karaka, arudha, bhava_bala, upagraha**, sade_sati, **gun_milan, dashakoot, papasamyam** · KP: **chart, dasha, ruling** · Horary: lilly (yerel) | Servis seçim çözücüsü (`resolveSelectionContexts`) + teknik kaydı (`units/project`) — kayıtsız satır içi revizyon | 0–3 |
| Kozmik Takvim (1) | paket: 6 özellik, Hacamat dahil (tek seçim, tek kota) | Yerel motor (`lib/cosmic`) | 0 |

**Kanıt:** `scripts/campaign/visitor-atlas.test.ts` — 36 Atlas sağlayıcı tekniğinin HER isteği, uzman akışının kaydettiği golden istekle (yol + gövde + sorgu) **birebir** eşleşmeden sahte sağlayıcı yanıt vermez (164/0). İki kişilik tekniklerde eş bilgisi yalnız bellekte; motorun istediği eş profil kimliği sabit "satır içi" belirteçtir (kayıt değildir, dışarıdan verilemez).

**Bağlanmayanlar ve gerekçe:**
- `hd:transit`, `hd:personal_transit`: sınır yakınında sağlayıcı düzeltmesi + ORTAK gezegen önbelleğine (DB) yazar; kampanya bu önbelleği ve sınır hassasiyetini bozmamalı → bağlanmadı.
- `hd:variables` (Dört Ok / PHS): Owner tam analiz onayı şartı (katalogda `requiresOwnerConfirmation`).
- `hd:penta` (3–5 kişi): kişi başı harita + penta (4–6 kredi), çok kişilik kişisel veri; form ve onay tasarımı Owner kararı.
- `hd:local_engine`: arayüzde kullanılmıyor, bazı tip/otoriteler doğrulanmamış.
- Atlas `declination_parallels`, `vedic.heliacal`, `vedic.monthly`, `kp.transit`, `kp.ruling_interval`, `kp.horary`: doğum verisinden bağımsız / çok birimli (≤15 kredi) veya soru anına bağlı; golden kapsamı ve kredi tavanı ayrıca doğrulanmalı.
- Bütün bunlar katalogda "doğrulama" / "uygun değil" kalır; ziyaretçiye görünmez.

Owner panelinde her teknik "Ziyaretçi akışına bağlı" ya da "Ziyaretçiye henüz bağlı değil" etiketi taşır. Yayın kontrol listesi bağlı olmayan seçimleri uyarı olarak gösterir.

**Kozmik paketin durumu:** "doğrulama"dan **hazır**a alındı. Gerekçe: altı özellik sunucuda gerçek motorla hesaplanıyor ve testli. Hacamat yalnız tarafsız bilgi gösterir: Hicri gün ve Ay evresi. Kural metni, uygun/yasak gün, sağlık ya da yarar iddiası gösterilmez. Hukuki inceleme sonrası içerik ayrı bir yayın kapısıdır.

## Akış (`lib/campaign/visitor/pipeline.ts`)

1. **Ön kapılar:** Ortam kapısı, yayındaki kampanya ve bağlı teknik denetlenir.
2. **İstek denetimi:**
   - Aynı köken, JSON gövde, en fazla 16 KB.
   - Bal küpü alanı.
   - IP başına 10 dakikada 30 istek (DB hız sınırı).
3. **Girdi doğrulama:** Bilinmeyen alan reddedilir. Takvim, gelecek tarih ve saat biçimi denetlenir. Konum yalnız yerel veri setinden alınır (il, 973 ilçe, dünya; dış API yok). Hata varsa **rezervasyon açılmaz**.
4. **Rezervasyon (`campaign_reserve`, KM-1):**
   - Kampanya ve teknik açık mı.
   - IP ve tarayıcı günlük hakkı (yalnız günlük HMAC özetleri).
   - Teknik ve genel kontenjan ile kredi bütçesi.
   - Aylık kampanya payı ve uzman payı tabanı.
   - Sağlayıcı durumunun tazeliği, dakika sınırı, idempotency.
5. **Çalıştırma:** Her sağlayıcı HTTP isteği `guardedFetch` üzerinden geçer: rezervasyon tavanı ve `campaign_authorize_call` → istek → sonuç kaydı. İzin yoksa istek atılmaz. Yapılandırılmış Roxy kökü dışına istek atılmaz.
6. **Sonuçlandırma (`settle`):**
   - Başarı: `completed`.
   - Sağlayıcıya hiç gidilmeden hata: `aborted_no_call` (hak geri döner).
   - Çağrı sonrası hata: `failed_after_call` (yetkilendirilen kredi harcanmış sayılır).

**Kozmik paket akışı:** İlk istek rezervasyon açar ve 2 saatlik, HMAC imzalı paket belirteci döndürür. Sonraki özellik ve ay geçişleri belirteçle yapılır; belirteç başına 2 saatte 120 istek sınırı vardır. Belirtecin rezervasyonu `completed`, aynı kampanya ve `kozmik:paket` olmalıdır.

## Roxy kredi koruması — gerçek hesap kalanı

Yanıt başlığındaki `X-RateLimit-Remaining` bir **anahtar sayacıdır** ve hesabın gerçek kalanından yüksektir (canlı ölçüm 29.10: başlık 49.629, hesap 27.709). Bu yüzden:

- **Migration `20271229000300`:** Mevcut RPC'ler değişmez; yalnız ekleme yapılır.
  - `campaign_observe_usage`: Yalnız Owner çalıştırabilir. Paneldeki "Gerçek kullanımı doğrula (1 kredi)" düğmesi sağlayıcının `/usage` ucunu **bir kez** okur ve gerçek kalanı kaydeder. Aynı anda fark = başlık − gerçek kalıcı olarak yazılır ve denetim kaydı oluşur.
  - `campaign_observe_header`: Sonraki başlık gözlemleri (kampanya çağrıları ve uzman Klasik Numeroloji defteri) **yalnız geçerli bir fark varken** işlenir: kalan = başlık − fark. Fark aynı UTC ayına ait ve en fazla 7 günlük, gözlem en fazla 10 dakikalık olmalı. Sıra dışı (daha eski) gözlem daha yeni değeri ezmez.
- **Fail-closed kuralları:**
  - Fark yoksa veya bayatsa kalan güncellenmez; durum 15 dakikada bayatlar ve ücretli rezervasyon `saglayici_durumu_bilinmiyor` ile reddedilir.
  - Başlık tek başına **asla** hesap kalanı sayılmaz.
  - Kampanya çağrı kaydına ham başlık kalanı yazılmaz; yalnız plan sınırı yazılır.
- **Uzman payı tabanı** gerçek kalandan hesaplanır. Eşzamanlı istekler testte aşım üretmedi (30 paralel istekte tam izin verilen sayı geçti).

## Gizlilik

- Doğum bilgisi, ad ve yer **yalnız bellekte** işlenir. Kaydedilmez, loglanmaz ve önbelleğe alınmaz; Klasik Numeroloji önbelleği kampanya için kapalıdır.
- Kampanya, uzmanın Klasik Numeroloji sağlayıcı defterine satır yazmaz; defteri yalnız okur.
- Analiz kaydı oluşturulmaz.
- IP ve tarayıcı yalnız günlük dönen HMAC özeti olarak sayılır. `campaign_purge_subjects` bu özetleri 30 gün sonra siler.
- Tarayıcı kimliği çerezi `km_z`: HttpOnly, Secure, SameSite=Lax, 30 gün; içeriği rastgele bir kimliktir.
- Horary soru metni cihazda kalır, sunucuya gönderilmez.
- **Ziyaretçiye hiçbir koşulda gösterilmeyenler:** uzman Bilgi Bankası, uzman ve danışmanlık notları, Atlas uzman notları ve soru kayıtları, Bütüncül Numeroloji uzman bilgi kayıtları, taş önerileri ve stok, Hacamat kural kayıtları ve raporları.
- **Yorumlar:** Sağlayıcı ve kitap metinleri yalnız Owner'ın modül ve teknik anahtarları açıksa ve katalogda yorum kaynağı varsa gösterilir. Kaynağı olmayan tekniğe yorum eklenmez.
- **Rapor:** Yalnız HD Word, Owner "Word raporu"nu açtıysa sunulur. Uzman kaydı içermez; yorum kapalıysa "yorumsuz" seçenekle üretilir.

## Zamanlanmış bakım

`lib/inngest/functions/campaignMaintenance.ts`. Varsayılan kapalıdır; `CAMPAIGN_MAINTENANCE_ENABLED=true` ile açılır. Üç iş yapar:
- 10 dakikada bir: `campaign_expire_stale` (yarım rezervasyonlar harcandı sayılır).
- 10 dakikada bir: uzman Klasik Numeroloji defterinden tazelik senkronu.
- Günde bir: 30 günden eski kimlik özetlerini silme.

## Bot doğrulaması (gece operasyonu)

- Cloudflare Turnstile; doğrulama SUNUCUDA (`lib/campaign/visitor/botCheck.ts`): biçim → tek kullanım (DB kovası; sayaç DB'de değilse fail-closed) → siteverify (5 sn) → `success` + eylem `kampanya` + hostname listesi + en çok 5 dakikalık doğrulama.
- Rezervasyon açan HER istekte gerekir (yerel teknikler dahil; kontenjan tüketmeye karşı). Kozmik paketin belirteçli sonraki istekleri rezervasyon açmaz.
- Yapılandırma yoksa: ücretli teknikler ziyaretçiye LİSTELENMEZ ve sunucu reddeder; yerel teknikler hız sınırlarıyla çalışır.
- Cloudflare'e ziyaretçi IP'si gönderilmez. Betik ve iframe izni CSP'de yalnız `/ucretsiz-analiz` yolunda.

## IP ve tarayıcı kimliği

- Tek yardımcı: `lib/campaign/visitor/clientIp.ts` (doğrulama) + `subject.normalizeIp` (gruplama: IPv4-eşlemeli → IPv4, IPv6 → /64). Bilinmeyen / bozuk IP → ücretli red, yerel ortak kova.
- Hız sınırları DB okumalarından önce: IP 30/10 dk, IPv6 /48 120/10 dk, imzalı çerezi olmayan tarayıcı 10/10 dk, durum ucu 120/10 dk, konum araması 120/10 dk, olay ucu 120/10 dk.
- `km_z` çerezi sunucu imzalı (`kimlik.imza`); uydurma / imzasız değer yok sayılır.
- CGNAT: aynı IP'yi paylaşan çok kişi olabilir — IP günlük hakkı Owner ayarıdır; tarayıcı kimliği ve bot doğrulaması ile birlikte uygulanır.

## İstatistik (migration 20271229000400)

- Toplu sayaç: ziyaret (sayfa), analiz başlatma / tamamlama (YALNIZ sunucu), rapor indirme, profesyonel üyelik tıklaması, `utm_source`. 7/30/90 gün, kampanya karşılaştırma ve kaynak tabloları panelde.
- Tekil ziyaret yalnız analitik çerez onayı ile (yerel rastgele kimlik → sunucuda günlük HMAC; 90 gün).
- Dönüşüm (üyelik tamamlama) ölçülmüyor → panelde "Veri henüz toplanmıyor". Tablo yoksa tüm olay kartları aynı uyarıyı gösterir.

## Ortam değişkenleri (production'a Owner girer; bu PR sırları değiştirmez)

| Değişken | Değer | Not |
|---|---|---|
| `CAMPAIGN_PUBLIC_ENABLED` | `true` | **Yayın anahtarı.** |
| `CAMPAIGN_MAINTENANCE_ENABLED` | `true` | Bakım. **Kapalıysa ziyaretçi yüzeyi de 404** (yarım rezervasyonlar kapanmadan / kimlik özetleri silinmeden yayın yok). |
| `CAMPAIGN_SUBJECT_SECRET` | ≥ 32 karakter rastgele | IP/tarayıcı özeti, çerez imzası, paket belirteci. Yoksa `RATE_LIMIT_SECRET`; ikisi de yoksa fail-closed. |
| `TURNSTILE_SECRET_KEY` | Cloudflare | Sunucu sırrı. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare | Tarayıcıya durum ucuyla verilir. |
| `CAMPAIGN_BOT_HOSTNAMES` | `yasamsistemi.com` | Zorunlu; boşsa bot yapılandırması yok sayılır. |
| `CAMPAIGN_BOT_VERIFY_URL` | — | YALNIZ yerel test (localhost, Vercel dışı). Production'da tanımlanmaz. |
| `ROXY_API_KEY`, `ASTROLOGY_MODULE_ENABLED`, `NUMEROLOGY_CLASSIC_PROVIDER_CALLS` | mevcut | Değişmez. |

## Testler

| Test | Kapsam | Sonuç |
|---|---|---|
| `scripts/campaign/pg/campaign-visitor.mjs` | 000300, gerçek kalan, fark kuralları, uzman payı, 30 eşzamanlı istek, yetki | 30 |
| `scripts/campaign/pg/campaign-night.mjs` | 000400; 120 eşzamanlı ücretli / aynı IP / aynı istek kimliği; dakika sınırı; kapanışta çağrı yetkisi yok; zaman aşımı iadesiz; bakım idempotent; limit düşürme; TR gün sınırı; olay sayaçları (100 eşzamanlı) | 32 |
| `scripts/campaign/visitor-runners.test.ts` | 54 çalıştırıcı kaydı; Bütüncül ilişki / mekân; isim adayları; yarış (paralel kredi) | 71 |
| `scripts/campaign/visitor-atlas.test.ts` | 36 Atlas tekniği katı golden; eş verisi; kutup; DST; 503 | 164 |
| `scripts/campaign/visitor-hd-relation.test.ts` | HD Connection: 3 istek, tutarlılık, tavan, yorum | 15 |
| `scripts/campaign/visitor-api.test.ts` | Uçlar, kapılar, bot (16), IP (8), denetim düzeltmeleri, olaylar (10), paket belirteci | 89 |
| `scripts/campaign/visitor-ui-e2e.ts` | Playwright + `next start` + geçici PG + yerel HTTPS sahte sağlayıcı + sahte Turnstile; 1920/1440/1366/390/320, Android; ana sayfa (bağımlı dalda) | yerel |

## Ana sayfa entegrasyonu

`app/_campaign/HomeCampaignSection.tsx` (bu PR) — Owner önizlemesi ve `/ucretsiz-analiz` ile aynı sunum bileşeni ve dönüştürücü. Kapalı → hiçbir şey; Yakında → duyuru; Aktif → analiz kartları (`/ucretsiz-analiz?teknik=…`). Durum `/api/kampanya/durum`'dan okunur; içerik değişikliği için yeniden yayın gerekmez.

`app/page.tsx` bağlantısı (4 satır) AYRI bağımlı Draft PR'dadır: dal `work/km3-ana-sayfa-kampanya` (taban: bu dal). #680 (Kişisel Ofis) main'e girdikten sonra main bu dala merge commit ile alındı; çakışma yok. Merge sırası: #682 → ana sayfa PR'ı.
