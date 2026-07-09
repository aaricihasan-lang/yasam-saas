# 🌿 YAŞAM HAFIZASI™ (Life Memory Engine)

> Yaşam Sistemi'nin merkezi zeka katmanı — uzmanın kendi bilgi hazinesini unutulmaz kılan, kanıta dayalı iç arama motoru.

Bu klasör, Yaşam Hafızası'nın **FAZ 0–7 boyunca tasarlanmış** tüm teknik mimarisinin kalıcı referansıdır. Belgeler yalnızca **tasarım**dır; bu klasörde işlevsel kod, SQL, migration veya API bulunmaz.

---

## İçindekiler

- [Projenin Amacı](#projenin-amacı)
- [Tasarım İlkeleri](#tasarım-ilkeleri)
- [Mimari Özeti](#mimari-özeti)
- [Faz Listesi](#faz-listesi)
- [Doküman Haritası](#doküman-haritası)
- [Değişmezler (Invariants)](#değişmezler-invariants)
- [Durum](#durum)

---

## Projenin Amacı

Yaşam Hafızası bir AI sohbet sistemi **değildir**. Bir **Uzman Hafızası**dır. Amacı, uzmanın yıllar boyunca oluşturduğu **kendi bilgi hazinesini** doğru anda önüne getirmektir.

**Slogan:** *"Kendi bilgi hazineniz en değerli kaynağınızdır."*

İki giriş kapısı, tek motor:

1. **Yaşam Hafızası Modülü** — Google mantığı; uzman serbest konu arar (Lenf, Stres, Anne sütü…), tüm modüller tek ekranda ilişkilendirilir.
2. **Danışan Detayı** — arama yok; danışan notu ("Bebek emiyor ama doymuyor") anlamlandırılıp ilişkili kayıtlar getirilir.

---

## Tasarım İlkeleri

- **Kanıt yoksa sonuç yok.** Bir kaydın gösterilmesi için eşleşmenin kanıtı sistemin kendi içinde (metin/başlık/paragraf/etiket/uzman-ilişki) bulunmalıdır.
- **AI yalnız anlar, cevap üretmez.** AI'nın tek görevi sorguyu/notu Kavram Kümesi'ne dönüştürmektir.
- **Bilginin tek kaynağı sistem içi kayıtlardır.** İnternet/dış DB/genel bilgi kullanılmaz.
- **Her sonuç kanıtlanabilir.** Kaynak + paragraf + neden ile.
- **Deterministik çekirdek.** Görünürlük, derece ve "Neden?" tamamen kural tabanlıdır; AI'sız üretilir.
- **Model bağımsızlığı.** Değer AI modelinden değil, uzmanın hazinesinden gelir; model değişse de sistem çalışır.

Tam anayasa: [`00-overview.md`](./00-overview.md).

---

## Mimari Özeti

```
Sorgu / Not
   │ normalize
   ▼
Kavram Kümesi C  ◄── sözlük (deterministik) + AI kavram çıkarımı (yalnız anlama)
   │
   ├─► Lexical üretici (search_tsv)
   └─► Semantic üretici (pgvector KNN)      → RRF füzyon
                                                │  (aday listesi)
                                                ▼
                                    ┌───────────────────────┐
                                    │  KANIT KAPISI          │  kanıtsız = düşer
                                    └───────────────────────┘
                                                │
                        Derece · "Neden?" · Tenant/PII izolasyonu · Boş durum
                                                │
                                                ▼
                                    Dereceli, kanıtlı sonuç kartları
```

**Anahtar:** pgvector/AI bir kaydı *ekrana sokamaz*; yalnız aday üretir ve sıralar. Görünür sonuca **yalnız Kanıt Kapısı** karar verir. Tam mimari: [`01-architecture.md`](./01-architecture.md).

---

## Faz Listesi

| Faz | Konu | Doküman |
|---|---|---|
| — | Vizyon & Anayasa | [`00-overview.md`](./00-overview.md) |
| — | Uçtan uca mimari | [`01-architecture.md`](./01-architecture.md) |
| 0 | Kaynak envanteri & alan haritası | [`02-phase-0-source-inventory.md`](./02-phase-0-source-inventory.md) |
| 1 | İndeks modeli | [`03-phase-1-index-model.md`](./03-phase-1-index-model.md) |
| 2 | Hızlı Tarama (lexical, deterministik) | [`04-phase-2-fast-search.md`](./04-phase-2-fast-search.md) |
| 3 | Semantic arama (pgvector) | [`05-phase-3-semantic-search.md`](./05-phase-3-semantic-search.md) |
| 4 | Derin Analiz (AI yalnız anlama) | [`06-phase-4-deep-analysis.md`](./06-phase-4-deep-analysis.md) |
| 5 | PII / Gizlilik (KVKK/GDPR) | [`07-phase-5-pii-security.md`](./07-phase-5-pii-security.md) |
| 6 | UX entegrasyonu | [`08-phase-6-ux.md`](./08-phase-6-ux.md) |
| 7 | Doğrulama & kilitleme | [`09-phase-7-validation.md`](./09-phase-7-validation.md) |
| — | Uygulama yol haritası | [`10-roadmap.md`](./10-roadmap.md) |

---

## Doküman Haritası

- **`00-overview.md`** — Vizyon, anayasa (10 madde), Kanıt Kuralı, temel prensipler, uzun vadeli hedef.
- **`01-architecture.md`** — Sistemin baştan sona veri akışı; her bileşen ve aralarındaki dikişler.
- **`02`–`09`** — Her fazın tam tasarımı (envanter → index → lexical → semantic → AI → PII → UX → doğrulama).
- **`10-roadmap.md`** — Sprint 0–8 uygulama sırası, bağımlılıklar, teslim kriterleri.

---

## Değişmezler (Invariants)

Tüm belgeler boyunca korunan, ihlal edilemez kurallar:

- **INV-1** — Kanıt Kapısı'ndan geçemeyen aday, skoru ne olursa olsun API katmanında düşürülür; ekrana ulaşamaz.
- **INV-2** — "Neden gösterildi?" yalnız Evidence kaydından deterministik şablonla üretilir; AI kullanılmaz.
- **INV-TENANT** — Her sorgu `tenant_id = session` (veya shared NULL) ile filtrelenir; başka tenant verisi görünmez.
- **INV-PII** — Danışan verisi ayrı fiziksel indekste; client_id scoped; dış embedding/AI'ya PII gitmez.

---

## Durum

**Tasarım (FAZ 0–7) tamamlandı.** Yaşam Hafızası implementasyona hazırdır; Sprint 0'da 4 açık karar/kurulum kalemi (bkz [`09-phase-7-validation.md`](./09-phase-7-validation.md) ve [`10-roadmap.md`](./10-roadmap.md)) kapatılmalıdır. Bu klasörde **hiçbir işlevsel kod / SQL / migration yoktur.**
