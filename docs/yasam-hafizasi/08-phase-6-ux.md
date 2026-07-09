# 08 — FAZ 6: UX Entegrasyonu

## İçindekiler

- [Amaç](#amaç)
- [Ana Modül Arama Deneyimi](#ana-modül-arama-deneyimi)
- [Danışan Detayı — İki Kaynak Grubu](#danışan-detayı--i̇ki-kaynak-grubu)
- [İki-Hız Arama UX'i](#i̇ki-hız-arama-uxi)
- [Sonuç Kartı](#sonuç-kartı)
- [Derece Görsel Dili](#derece-görsel-dili)
- ["Neden Gösterildi?" Açılışı](#neden-gösterildi-açılışı)
- [Kanıt Görünümü](#kanıt-görünümü)
- [Sonuç Gruplama (group_key)](#sonuç-gruplama-group_key)
- [Modül Filtreleri](#modül-filtreleri)
- [Mobil UX](#mobil-ux)
- [Desktop UX](#desktop-ux)
- [Accessibility (WCAG 2.1 AA)](#accessibility-wcag-21-aa)
- [Performans (100 → 500.000+ satır)](#performans-100--500000-satır)
- [Feature Flag Kademeli Açılım](#feature-flag-kademeli-açılım)
- [Boş Durumlar](#boş-durumlar)
- [Hata Senaryoları](#hata-senaryoları)
- [Audit / Kullanıcı Görünürlüğü](#audit--kullanıcı-görünürlüğü)
- [Admin UX](#admin-ux)
- [Responsive Davranış](#responsive-davranış)
- [Değişmezler](#değişmezler)
- [Sonraki Faz](#sonraki-faz)

---

## Amaç

FAZ 6, kilitli UX'i motora bağlar. Tüm cihaz/durum/hata/ölçek boyutları tanımlıdır; nötr dil (Madde 10) her yerde korunur.

---

## Ana Modül Arama Deneyimi

- **Arama kutusu:** merkezde, sticky, örnek çipler (Lenf · Stres · Anne sütü). Kaynak = yalnız ana indeks (PII yok).
- **Hızlı Tarama:** yazarken/Enter'da anında (debounce ~250ms, min 2 karakter).
- **Derin Analiz:** aynı buton, sessiz zenginleştirme.
- **Son aramalar / Favoriler / Önerilen:** boş durumda dikey; yalnız uzmanın kendi kullanımı (M7).
- Mikro-metin: *"Sonuçlar yalnızca sizin kayıtlarınızdan gelir."*

---

## Danışan Detayı — İki Kaynak Grubu

```
┌ 🌿 Yaşam Hafızası ───────────────────────────┐
│ ⓘ Yalnızca sistem içi kayıtlarınıza dayanır. │
│ Notunuz: emzirme · anne sütü · laktasyon      │
├───────────────────────────────────────────────┤
│ 📚 Bilgi Kayıtlarınız (ana indeks)            │
│   [kart] [kart]                               │
├───────────────────────────────────────────────┤
│ 👤 Bu Danışanın Geçmişi (PII)  🔒            │  ← pii_flag kapalıysa HİÇ render yok
│   [kart]                                       │
└───────────────────────────────────────────────┘
```

İki fiziksel indeks → iki görsel grup. B grubu görsel olarak ayrık (🔒), yalnız pii_flag açık + bu danışan bağlamında render edilir.

---

## İki-Hız Arama UX'i

```
t0  → Hızlı Tarama sonuçları ANINDA (lexical, $0)
t0  → küçük ipucu: "🔍 İlişkili kayıtlar aranıyor…" (engellemez)
t+Δ → Derin Analiz biter → kartlar SESSİZCE eklenir (fade-in), ipucu kaybolur
```

- Skeleton yalnız ilk (cold) aramada.
- **Layout shift yok:** eklenen kartlar okunan kartı zıplatmaz.
- Timeout (2–4s) → sessizce Hızlı Tarama'da kalınır.

---

## Sonuç Kartı

```
┌───────────────────────────────────────────┐
│ 🦶 Refleksoloji        ● ● ●  Çok güçlü   │
│ Anne Sütünü Destekleme Protokolü          │
│ 📌 "anne sütü" başlıkta geçiyor           │
│ 📄 "…lenf bölgesi… **anne sütü** üretimi…"│
│ 🏷 organs · lenf    🔗 Aytaşı (ilişki)     │
│ 🕘 Son gözden geçirme: 2 yıl önce          │
│ [Kaydı Aç] [İlgili Bölüme Git] [⧉][＋][⭐] │
└───────────────────────────────────────────┘
```

Aksiyonlar: **Kaydı Aç · İlgili Bölüme Git · Kopyala · Nota Ekle · Favori.** Hepsi alıntısal/provenance — AI yorumu yok.

---

## Derece Görsel Dili

| Görsel | Etiket | Renk | Tooltip |
|---|---|---|---|
| ● ● ● | Çok güçlü | emerald | "Başlık/etiket/ilişkide birebir" |
| ● ● ○ | Güçlü | amber | "Paragrafta net geçiyor" |
| ● ○ ○ | Zayıf | slate | "Dolaylı; kanıtı sistemde var" |

Renk-bağımsız (dolu/boş nokta + etiket metni). Animasyon yalnız ilk belirişte hafif fade.

---

## "Neden Gösterildi?" Açılışı

| Cihaz | Etkileşim |
|---|---|
| Desktop | Kartta her zaman görünür kısa satır + hover'da tam tooltip |
| Tablet | Kısa satır + dokunmayla accordion |
| Mobil | Kısa satır + inline accordion (bottom sheet değil — bağlam kaybı olmasın) |

Kaynak: yalnız Evidence (AI yok). Kritik bilgi hover'a bağlı değildir.

---

## Kanıt Görünümü

- `char_span`'e göre eşleşen ifade **kalın + arka-renk** vurgulu.
- Paragraf ~2-3 satır snippet; "devamı" ile açılır.
- **İlgili Bölüme Git:** kaydı açar + `section_ref`'e otomatik scroll + kısa flash. Metin birebir alıntı.

---

## Sonuç Gruplama (group_key)

Aynı kaydın çok section eşleşmesi → **tek kart** (en güçlü kanıtla) + "Bu kayıtta {n} bölüm daha eşleşti ▸". Liste şişmez; tüm kanıtlar erişilebilir.

---

## Modül Filtreleri

```
[Tümü (7)] [Refleksoloji (2)] [Şifa (3)] [Doğaltaş (1)] [Aromaterapi (0)] [Biyoenerji (1)]
```

Sayaç tam kümeden; `(0)` pasif/gri. Seçim sunum-katmanı faseti (yeni AI çağrısı yok). "Tümü" varsayılan.

---

## Mobil UX

- **Bottom sheet:** danışan detayında ~%90, sürüklenebilir; sticky başlık+uyarı+filtre; yalnız liste kaydırılır.
- **Tam ekran:** ana modül araması.
- **Swipe:** sheet aşağı = kapat; kart üstünde swipe yok.
- **Keyboard:** arama/not + "İncele" klavye üstünde yüzer.
- **Safe area / PWA:** notch dolgusu; offline → Hızlı Tarama veya net çevrimdışı durumu.

---

## Desktop UX

- Ana modül = ortalanmış geniş sütun; danışan detayı = sağ panel / split view.
- **Kısayollar:** `Ctrl/⌘+K` aç/odakla · `Esc` kapat · `Enter` ara · `↑/↓` gez · `Enter` Kaydı Aç · `F` favori · `Tab` aksiyonlar.

---

## Accessibility (WCAG 2.1 AA)

- **ARIA:** arama `role=searchbox`; liste `role=list`; derece `aria-label`; canlı bölge `aria-live=polite` → Derin Analiz eklemeleri duyurulur.
- **Screen reader okuma sırası:** modül → derece → başlık → neden → paragraf → aksiyonlar.
- **Focus trap:** sheet/dialog açıkken; kapanınca odak tetikleyene döner.
- **Kontrast:** AA; renk tek anlam taşıyıcı değil.

---

## Performans (100 → 500.000+ satır)

| Ölçek | Strateji |
|---|---|
| ≤500 | Doğrudan render |
| 500–5.000 | Sonuç zaten top-N → liste küçük |
| 5.000–50.000 | Retrieval DB indeksinde; UI top-N + cursor pagination |
| 50.000–500.000+ | Virtualized liste + chunk yükleme; server-side count |

**İlke:** UI hiçbir zaman tüm indeksi yüklemez; motor top-N (~150) döner → UX ölçekten bağımsız sabit.

---

## Feature Flag Kademeli Açılım

```
Aşama 1: Hızlı Tarama (AI'sız)   → kendi test hesabı
Aşama 2: + Derin Analiz          → Beta uzmanlar
Aşama 3: + Semantic (pgvector)   → seçili uzmanlar
Aşama 4: + Danışan Geçmişi (PII) → gizlilik onaylı uzmanlar
Aşama 5: Tüm kullanıcılar
```

Flag'ler: `yh_enabled`, `yh_hizli`, `yh_derin`, `yh_semantic`, `yh_client_pii`, `yh_shared`. Kapalı flag → UI gizli + API 403.

---

## Boş Durumlar

| Durum | Ekran |
|---|---|
| Henüz kayıt yok (soğuk) | "Hazineniz boş" + kayıt daveti |
| Sonuç yok | "'{C}' olarak anlamlandırıldı, kayıt bulunamadı" |
| Kanıt yok (aday düştü) | Aynı "kayıt bulunamadı" (dürüst) |
| AI kapalı | Sessiz: yalnız Hızlı Tarama |
| Semantic kapalı | Sessiz lexical |
| PII kapalı | "Bu Danışanın Geçmişi" grubu hiç render edilmez |
| Shared kapalı | Yalnız tenant kayıtları |
| Demo | Fixture + "Demo modu" rozeti; PII yok |

---

## Hata Senaryoları

| Hata | UX |
|---|---|
| Derin Analiz timeout | Sessiz → Hızlı Tarama'da kal |
| API hatası | Nazik satır + (varsa) Hızlı Tarama sonucu |
| İndeks yok/boş | Soğuk-başlangıç ekranı |
| Embedding/Semantic yok | Sessiz lexical |
| Provider kapalı | Fallback lexical + "Derin Analiz geçici kapalı" |

**İlke:** her hata graceful degrade → Hızlı Tarama ayakta; kırık/boş ekran yok.

---

## Audit / Kullanıcı Görünürlüğü

Uzman **kendi** verisi: arama geçmişi, favoriler, son kullanılanlar, kaydedilen sorgular. PII erişim audit trail'i kullanıcıya değil, admin/denetim tarafına (içerik değil, erişim kaydı).

---

## Admin UX

İndeks sağlığı, backfill/queue ilerleme, semantic/embedding kapsamı, cache metrikleri, reconcile/rebuild tetikleri, maliyet, uzman-bazlı flag matrisi. **PII içeriği admin'e gösterilmez** (yalnız sayı/sağlık).

---

## Responsive Davranış

| Breakpoint | UX |
|---|---|
| Mobil (<640) | Tam-ekran arama; danışan = bottom sheet; tek sütun |
| Tablet (640–1024) | Geniş sheet / yarım panel; accordion "Neden?" |
| Laptop (1024–1440) | Split view; kart tek geniş sütun |
| Desktop (1440–1920) | Split view + sağ panel sabit; kısayollar |
| UltraWide (>1920) | Maks genişlik sınırlı; ortalanır (yayılmaz) |

---

## Değişmezler

- Kanıt Kapısı / derece / "Neden?" / tenant/PII izolasyonu UX'e birebir yansır.
- UI hiçbir yerde ham AI yorumu / kanıtsız sonuç / PII karışması üretmez.
- Her hata graceful degrade.

---

## Sonraki Faz

→ [`09-phase-7-validation.md`](./09-phase-7-validation.md) — doğrulama & kilitleme.
