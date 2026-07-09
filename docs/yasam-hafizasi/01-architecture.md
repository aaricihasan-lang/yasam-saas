# 01 — Uçtan Uca Mimari

## İçindekiler

- [Amaç](#amaç)
- [Yüksek Seviye Akış](#yüksek-seviye-akış)
- [Bileşenler](#bileşenler)
  - [1. Normalize](#1-normalize)
  - [2. Concept Builder (Kavram Kümesi)](#2-concept-builder-kavram-kümesi)
  - [3. Lexical Üretici](#3-lexical-üretici)
  - [4. Semantic Üretici](#4-semantic-üretici)
  - [5. Füzyon (RRF)](#5-füzyon-rrf)
  - [6. Kanıt Kapısı](#6-kanıt-kapısı)
  - [7. Derece](#7-derece)
  - [8. Neden Gösterildi](#8-neden-gösterildi)
  - [9. UI](#9-ui)
- [İki İndeks (Bilgi + PII)](#iki-i̇ndeks-bilgi--pii)
- [Yardımcı Sistemler](#yardımcı-sistemler)
- [Genişleme Dikişleri](#genişleme-dikişleri)
- [Uçtan Uca Veri Akışı](#uçtan-uca-veri-akışı)
- [Değişmezler](#değişmezler)
- [Sonraki Doküman](#sonraki-doküman)

---

## Amaç

Bu doküman, Yaşam Hafızası motorunun tüm bileşenlerini ve aralarındaki veri akışını tanımlar. Her bileşenin sorumluluğu ve bir sonrakine ne verdiği nettir; böylece fazlar (lexical → semantic → AI → PII) birbirine additif takılır.

---

## Yüksek Seviye Akış

```
             ┌──────────── PAYLAŞILAN MOTOR ────────────┐
Sorgu/Not ─► │ 1 normalize                              │
             │ 2 Concept Builder → Kavram Kümesi C      │
             │        (sözlük + AI kavram çıkarımı)     │
             └───────────────┬──────────────────────────┘
                             │ C
              ┌──────────────┴───────────────┐
              ▼                               ▼
     3 LEXICAL (search_tsv)         4 SEMANTIC (pgvector KNN)
              └──────────────┬───────────────┘
                             ▼
                     5 FÜZYON (RRF)   → aday listesi
                             ▼
                     6 KANIT KAPISI   → kanıtsız = DÜŞER (INV-1)
                             ▼
              7 DERECE · 8 NEDEN · Tenant/PII izolasyonu · Boş durum
                             ▼
                     9 UI (dereceli, kanıtlı kartlar)
```

---

## Bileşenler

### 1. Normalize
Türkçe-duyarlı metin normalizasyonu (küçük harf İ→i/I→ı, diyakritik katlama, noktalama→boşluk, tokenizasyon). Sorguya ve indekslenen metne **simetrik** uygulanır. Stemmer kullanılmaz. Ayrıntı: [`04-phase-2-fast-search.md`](./04-phase-2-fast-search.md).

### 2. Concept Builder (Kavram Kümesi)
Normalize token'lardan **Kavram Kümesi C** üretir:
- **Sözlük genişletme** (deterministik, `yh_topic_dictionary`) — çift yönlü eş-anlam/kanonik.
- **AI kavram çıkarımı** (yalnız Derin Analiz; AI yalnız anlar) — sözlük kavramlarıyla **eşit statü**, bypass yok.

C, hem *ne aranacağını* hem de Kanıt Kapısı'nın *ne kanıt sayacağını* belirler.

### 3. Lexical Üretici
`search_tsv` üzerinde ağırlıklı tsquery (A=title, B=tag/ilişki, C=paragraf, D=diğer). C'deki kavramların OR birleşimi + önek eşleşmesi. Aday tavanı N (~150). AI/embedding gerektirmez → Hızlı Tarama.

### 4. Semantic Üretici
Sorgu embedding'i → `pgvector` KNN (cosine, HNSW). **İkinci** aday üreticisi. Aynı tenant değişmezini WHERE'de taşır. Ayrıntı: [`05-phase-3-semantic-search.md`](./05-phase-3-semantic-search.md).

### 5. Füzyon (RRF)
Lexical + semantic adaylar tek listede birleşir (anahtar: `source_table+source_id+section_ref`). Reciprocal Rank Fusion (`Σ 1/(k+rank)`, k≈60) **yalnız sıralama** üretir — deterministik. Derece RRF'ten gelmez.

### 6. Kanıt Kapısı
Her aday için `evidence_fields` + `topic_tags` + `expert_relations` üzerinde C ile deterministik kanıt taraması. En az bir Evidence üretilemeyen aday **düşürülür** (INV-1). Lexical/semantic fark etmez; aynı kapı.

### 7. Derece
Evidence'ların **güç skorundan** deterministik derece (Çok güçlü / Güçlü / Zayıf). Kanıt türü rubriği belirler; AI/vektör dereceyi etkilemez.

### 8. Neden Gösterildi
Evidence kaydından deterministik şablon (INV-2). AI kullanılmaz. `char_span` → UI vurgusu.

### 9. UI
Ana modül ekranı + danışan detayı paneli; dereceli kartlar, filtreler, iki-hız akışı, boş/hata durumları. Ayrıntı: [`08-phase-6-ux.md`](./08-phase-6-ux.md).

---

## İki İndeks (Bilgi + PII)

```
yasam_hafizasi_index          yasam_hafizasi_index_PII
(bilgi/kütüphane, F1-4)       (danışan geçmişi, F5)
is_client_pii = false         is_client_pii = true
tenant_id (NULL=shared OK)    tenant_id + client_id ZORUNLU
embedding: dış model OK       embedding: yalnız yerel / YOK
Ana modül araması buraya      Yalnız danışan bağlamı + gated
```

Ana modül araması PII tablosunu **hiç referans etmez** → PII'yi kazara döndürmesi yapısal olarak imkânsız. Motor paylaşılır; yalnız aday kaynağı ayrışır. Ayrıntı: [`07-phase-5-pii-security.md`](./07-phase-5-pii-security.md).

---

## Yardımcı Sistemler

| Sistem | Rol |
|---|---|
| **Backfill** | Korpus embedding'lerini toplu üretir (Batch API); idempotent (content_hash). |
| **Rebuild** | Tam/incremental/tenant/PII yeniden indeksleme. |
| **Reconcile** | Tenant denormalizasyonu + tombstone tutarlılık denetimi. |
| **Cache** | Sorgu embedding + sonuç önbelleği; PII global cache'lenmez. |
| **Audit** | PII erişim izleri (append-only). |
| **Feature Flag** | Kademeli açılım (Hızlı→Derin→Semantic→PII→herkes). |
| **Admin paneli** | İndeks sağlığı, kuyruk, kapsam, maliyet. |

---

## Genişleme Dikişleri

Mimari, iki temiz dikişle katmanlı büyür:

1. **Aday-listesi dikişi** (Üretici ↔ Kanıt Kapısı): FAZ 3 semantic'i **ikinci üretici** olarak ekler; downstream'e (kapı/derece/neden/tenant) dokunmaz.
2. **C-builder dikişi** (Concept Builder): FAZ 4 AI kavram çıkarımını ekler; retrieval ve kapı değişmez.

Her iki dikiş de değişmezleri korur: eklenen katman bir kaydı ekrana **sokamaz**; yalnız aday üretir/sıralar.

---

## Uçtan Uca Veri Akışı

1. Kullanıcı sorgu/not girer (ana modül veya danışan detayı).
2. Normalize → Concept Builder → C.
3. Lexical (+ semantic, flag açıksa) aday üretir; RRF birleştirir.
4. Tenant/PII/shared/demo/exclusion değişmezi WHERE'de uygulanır.
5. Kanıt Kapısı her adayı sınar; kanıtsızları düşürür.
6. Derece + "Neden?" deterministik üretilir.
7. Modül faseti + group_key gruplama.
8. UI dereceli kartları gösterir; boşsa dürüst "Kayıt bulunamadı".

---

## Değişmezler

- **INV-1** — Kanıtsız aday görünmez.
- **INV-2** — "Neden?" yalnız Evidence'tan (AI'sız).
- **INV-TENANT** — Her sorgu tenant/PII değişmeziyle sarılı.
- **Additivite** — Semantic/AI additiftir; yokluğunda Hızlı Tarama tek başına çalışır.

---

## Sonraki Doküman

→ [`02-phase-0-source-inventory.md`](./02-phase-0-source-inventory.md) — kaynak envanteri ve alan haritası.
