# 05 — FAZ 3: Semantic Arama (pgvector)

## İçindekiler

- [Amaç](#amaç)
- [Değişmez Sınır](#değişmez-sınır)
- [Konum: İki Aday Üretici, Tek Kapı](#konum-i̇ki-aday-üretici-tek-kapı)
- [Embedding Modeli](#embedding-modeli)
- [Embedding Hangi Metinden Üretilir](#embedding-hangi-metinden-üretilir)
- [Backfill (Batch)](#backfill-batch)
- [content_hash / embed_model / index_version](#content_hash--embed_model--index_version)
- [pgvector KNN Aday Üretimi](#pgvector-knn-aday-üretimi)
- [RRF Füzyon](#rrf-füzyon)
- [Kanıt Kapısı'nın Semantic Adaylara Uygulanması](#kanıt-kapısının-semantic-adaylara-uygulanması)
- [Model Değişiminde Migration'sız Geçiş (Yan Tablo)](#model-değişiminde-migrationsız-geçiş-yan-tablo)
- [Fallback ve Maliyet](#fallback-ve-maliyet)
- [Değişmezler](#değişmezler)
- [Sonraki Faz](#sonraki-faz)

---

## Amaç

FAZ 3, anlamsal sıralamayı ekler — **ürün anayasasını bozmadan**. Semantic yalnız aday üretimi ve sıralama içindir.

> **pgvector sonucu = sadece aday. Görünür sonuç = yalnız Kanıt Kapısı'ndan geçen kayıt.**

---

## Değişmez Sınır

Semantic; Kanıt Kapısı, derece, "Neden?", tenant değişmezi ve boş-durum davranışına **dokunmaz**. Bu bileşenler FAZ 2'deki halleriyle kalır.

---

## Konum: İki Aday Üretici, Tek Kapı

```
Kavram Kümesi C                              Sorgu embedding'i
      │                                            │
      ▼                                            ▼
 [3a] LEXICAL (search_tsv, F2)          [3b] SEMANTIC (pgvector KNN, F3)
      └──────────────► [FÜZYON: RRF] ◄────────────┘
                            │ (aday listesi)
                            ▼
                   KANIT KAPISI (değişmez) → kanıtsız DÜŞER
                            ▼
              Derece · Neden · Tenant · Boş-durum (değişmez)
```

---

## Embedding Modeli

- **Varsayılan:** `text-embedding-3-small` (1536 boyut) — Türkçe için yeterli, ucuz, çok-dilli-uyumlu.
- **Rezerve:** `text-embedding-3-large` (3072) — yalnız isabet yetmezse reranking.
- Model bir bileşendir; `embed_model` ile versiyonlanır, takas edilebilir (Anayasa Madde 8).

---

## Embedding Hangi Metinden Üretilir

- **`embedding_text`** = `title + snippet + ana anlatı paragrafları` (≈≤512 token, maliyet sınırı).
- **Girmez:** id/source kodları, salt-etiket kodları, gürültü. (Etiket/ilişki lexical kanıttır, anlam vektörü değil.)
- Section-birim satırlarda yalnız o bölümün metni gömülür.
- Kaynak dilinde gömülür (tr).

---

## Backfill (Batch)

- Inngest toplu iş: `is_client_pii=false` ve (embedding yok **veya** content_hash değişmiş) satırlar.
- **OpenAI Batch API (%50 indirim)** bulk için; rate-limit dostu.
- İdempotent (content_hash). Maliyet ~$5 bir kerelik / 100 tenant; sonrası incremental ≈ $0.

---

## content_hash / embed_model / index_version

| Alan | Anlam | Re-embed tetiği |
|---|---|---|
| `content_hash` | embedding_text hash'i | içerik değişti |
| `embed_model` | mevcut embedding'in modeli | hedef model değişti |
| `index_version` | indeksleyici mantık sürümü | mantık değişti → full rebuild |

Re-embed **gerekli ⇔** biri değişti. Üçlü, tazeliği deterministik yönetir.

---

## pgvector KNN Aday Üretimi

- Sorgu embedding'i → `vector` üzerinde cosine KNN (HNSW index), `LIMIT K` (~50–100).
- **Aynı tenant değişmezini** WHERE'de taşır → başka tenant vektörü aday bile olamaz.
- Filtered-KNN recall inceliği (pre-filter vs HNSW) bilinen risk; iterative scan / partial index ile azaltılır.

---

## RRF Füzyon

- İki üretici → tek aday listesi (anahtar `source_table+source_id+section_ref`).
- **Reciprocal Rank Fusion:** `rrf_score = Σ 1/(k + rank_i)`, k≈60 — deterministik.
- **Anayasa koruması:** RRF yalnız **sıralama**dır. Derece RRF'ten gelmez (kanıttan). Nihai sıra: `(derece, Σ kanıt skoru, rrf_score, source_updated_at)`.

---

## Kanıt Kapısı'nın Semantic Adaylara Uygulanması

- **Birebir aynı kapı.** Semantic aday da aynı C ile taranır.
- C-terimi kanıtı olmayan semantic aday → **düşer** (mesafe/RRF önemsiz). `semantic_dropped_count` loglanır.
- **Dürüst sınır:** F3'te C hâlâ normalize+sözlük olduğundan, semantic esas olarak (a) kanıtı olan ama lexical pencereye giremeyen kayıtları taşır (recall), (b) sıralamayı iyileştirir. Asıl "anlam köprüsü" FAZ 4'ün C'yi AI ile zenginleştirmesini bekler.

---

## Model Değişiminde Migration'sız Geçiş (Yan Tablo)

Inline `embedding` kolonu yerine yan tablo:

```
yh_embeddings ( index_id, embed_model, dim, vector, built_at )   anahtar (index_id, embed_model)
```

- **Aynı boyut** güncelleme (small→small v2) → sadece re-embed.
- **Farklı boyut** (small 1536 → large 3072) → **yeni satırlar**, ALTER yok.
- **Kademeli geçiş:** iki model bir arada (dual-embed), A/B, sonra eski silinir. Model değişimi **additif** — migration ağrısı yok (Anayasa Madde 8'in mimari karşılığı).

---

## Fallback ve Maliyet

- **Cache:** sorgu embedding + sonuç önbelleği; korpus embedding kalıcı.
- **Maliyet:** sorgu embed ~$0.000004, KNN $0, kapı $0, "Neden?" AI'sız → F3'te RAG maliyeti sıfır.
- **Degrade:** embedding hatası/bütçe → otomatik Hızlı Tarama'ya düş (circuit breaker). Hızlı Tarama her zaman mevcut.

---

## Değişmezler

- Semantic **additif** — Hızlı Tarama tek başına çalışmaya devam eder.
- Kanıt Kapısı semantic adaylara birebir uygulanır; kanıtsız = düşer (INV-1).
- RRF yalnız sıralama; derece kanıttan.
- Embedding **asla PII içermez** (PII indeksi ayrı; F5).
- Model değişimi migration'sız (yan tablo).

---

## Sonraki Faz

→ [`06-phase-4-deep-analysis.md`](./06-phase-4-deep-analysis.md) — Derin Analiz (AI yalnız anlama).
