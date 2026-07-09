# 09 — FAZ 7: Doğrulama & Kilitleme

## İçindekiler

- [Amaç](#amaç)
- [Tutarlılık Denetimi ve Açık Halkalar](#tutarlılık-denetimi-ve-açık-halkalar)
- [Anayasa — Madde-Mekanizma-Test](#anayasa--madde-mekanizma-test)
- [Golden Test Set (≥100)](#golden-test-set-100)
- [INV-1 ve INV-2 Testleri](#inv-1-ve-inv-2-testleri)
- [Determinizm — 4 Kombinasyon](#determinizm--4-kombinasyon)
- [Sızıntı Testleri](#sızıntı-testleri)
- [PII / Yaşam Döngüsü Testleri](#pii--yaşam-döngüsü-testleri)
- [AI Güvenlik Testleri](#ai-güvenlik-testleri)
- [Performans / Latency Hedefleri](#performans--latency-hedefleri)
- [Backfill / Rebuild / Admin / UX / Flag Testleri](#backfill--rebuild--admin--ux--flag-testleri)
- [Hata Toleransı (Degrade Zinciri)](#hata-toleransı-degrade-zinciri)
- [Risk Analizi](#risk-analizi)
- [Üretime Hazırlık — MoSCoW](#üretime-hazırlık--moscow)
- [Sonuç](#sonuç)
- [Sonraki Faz](#sonraki-faz)

---

## Amaç

FAZ 7 yeni özellik üretmez; F0–6 mimarisinin üretime hazır olup olmadığını **denetler**.

---

## Tutarlılık Denetimi ve Açık Halkalar

Faz zinciri iç-tutarlı; 7 açık halka bulundu (mimariyi bozmaz):

| # | Bulgu | Durum | Sınıf |
|---|---|---|---|
| A1 | F1 inline embedding vs F3 yan tablo | yan tablo kanonik (kapandı) | Kapandı |
| A2 | Sınırda-PII hangi indekse | açık karar (ihtiyatla PII) | **MUST** |
| A3 | aromatherapy_knowledge_articles RLS açık | indekslemeden önce kilit | **MUST** |
| A4 | pii_safe yol seçimi | PII Derin Analiz'den önce | **MUST** |
| A5 | HD/Numeroloji/belge-içerik envanterde yok | gelecek kapsam | SHOULD/COULD |
| A6 | unaccent + vector extension | impl ön-koşulu (Dashboard) | **MUST** |
| A7 | DATABASE_URL=localhost çalışmıyor | DDL Dashboard SQL Editor | Not |

---

## Anayasa — Madde-Mekanizma-Test

| Madde | Mekanizma | Test |
|---|---|---|
| AI cevap üretmez | Çıktı şeması yalnız concepts[] + doğrulayıcı | T-AI-1 |
| Kanıt Kapısı son karar | Aday → kapı → görünürlük | T-GATE-1 |
| Kanıtsız sonuç yok | INV-1 düşürme | T-INV1-* |
| Tenant izolasyonu | WHERE tenant=session + RLS | T-LEAK-tenant |
| PII izolasyonu | Ayrı PII tablosu + client_id | T-LEAK-client/PII |
| Neden gösterildi | Yalnız Evidence şablonu | T-INV2-* |
| Derece sistemi | Kanıt-türü rubriği | T-DEG-* |

---

## Golden Test Set (≥100)

104 senaryo, kategori bazlı (her satır: beklenen + beklenmeyen sonuç):

| Grup | Kapsam | Örnek | Adet |
|---|---|---|---|
| A | Tek kelime | lenf, stres, uyku, D vitamini | 8 |
| B | Çok kelime/öbek | anne sütü, göğüs lenf dolaşımı | 8 |
| C | Eş anlam/sözlük | laktasyon→anne sütü | 10 |
| D | Yanlış yazım/İ-ı | İltihap/iltıhap, anne sutu | 8 |
| E | Türkçe karakter | öğüt, şifa, düğüm | 6 |
| F | İngilizce | lymphatic system, sleep | 6 |
| G | Almanca | Stillen, Schlaf, Lymphe | 4 |
| H | Boş sonuç | tiroid nodülü; soğuk-başlangıç; kanıt-düşer | 6 |
| I | Çok sonuç | taş, not, protokol | 6 |
| J | Relation | iceren_taslar/onerilen_taslar/related_* | 8 |
| K | Tag | organs/category/warning_tags/keyword | 6 |
| L | Title | birebir başlık | 4 |
| M | Paragraph | yalnız gövde metni | 4 |
| N | Section | healing_guide_sections/reference_rows/raw_json | 4 |
| O | Shared kayıt | NULL-tenant referans | 4 |
| P | Tenant kayıt | yalnız kendi kaydı | 4 |
| Q | PII kayıt | bu-danışan / çapraz-danışan / PII-kapalı / modül-PII-yok | 8 |

**Toplam: 104.**

---

## INV-1 ve INV-2 Testleri

**INV-1 (kanıtsız sonuç yok):**
- tsvector kök/kısmi ama kanıtsız aday → sonuçta yok.
- pgvector yüksek-benzerlik kanıtsız → düşer.
- AI-uydurma kavram eşleşmiyor → boş.
- Her görünen kartın ≥1 Evidence'ı var (property test).
- `semantic_dropped_count` loglanıyor.

**INV-2 ("Neden?" yalnız Evidence):**
- "Neden?" metni Evidence şablonuna birebir eşit (AI çağrı sayacı=0).
- Evidence yoksa "Neden?" üretilmez.
- `matched_term` kayıtta gerçekten var.
- char_span highlight gerçek konuma denk.

---

## Determinizm — 4 Kombinasyon

| Semantic | AI | Beklenen |
|---|---|---|
| kapalı | kapalı | Hızlı Tarama baseline |
| açık | kapalı | + semantic sıralama; derece/Neden AYNI |
| kapalı | açık | + AI kavram; ek kayıtlar kanıtlı; derece/Neden AYNI |
| açık | açık | tam; kurallar AYNI |

**T-DET:** dört kombinasyonda derece + "Neden?" değişmez (yalnız sıralama/recall değişir); aynı girdi → aynı çıktı.

---

## Sızıntı Testleri

| Test | Beklenen |
|---|---|
| Cross-tenant | Tenant A, Tenant B kaydını hiçbir modda döndürmez |
| Cross-client | Danışan A, Danışan B PII'sini döndürmez |
| Cross-expert | Atama dışı danışan görünmez |
| Cross-shared | PII asla NULL → shared'dan sızamaz |
| Modül-arama PII | Serbest arama PII indeksini sorgulamaz |

---

## PII / Yaşam Döngüsü Testleri

Embedding egress=0 · PII cache yok · ham PII log'da yok · audit tam · backup ayrı/şifreli · restore tombstone (diriltmez) · RTBF residue=0.

---

## AI Güvenlik Testleri

| Saldırı | Beklenen |
|---|---|
| Prompt injection | Çıktı yine concepts[]; kanıt arar → zararsız |
| Jailbreak | Şema+doğrulayıcı+kapı → cevaba dönüşemez |
| Hallucination | Uydurma eşleşmezse yok; eşleşirse gerçek kayıt+kanıt |
| Schema kırılması | Reddet → retry → fallback |
| JSON bozulması | Fallback lexical |
| Rate limit | Fallback + 429 nazik UX |
| Timeout | Sessiz Hızlı Tarama |
| Provider/Semantic down | Circuit breaker → lexical |

---

## Performans / Latency Hedefleri

UI top-N (~150) sabit; retrieval DB indeksine bağlı.

| İndeks satırı | Hızlı Tarama p95 | Derin Analiz p95 |
|---|---|---|
| 100 | < 80 ms | < 900 ms |
| 1.000 | < 100 ms | < 1.0 s |
| 10.000 | < 150 ms | < 1.2 s |
| 100.000 | < 250 ms | < 1.5 s |
| 500.000 | < 400 ms | < 1.8 s |
| 1.000.000 | < 600 ms | < 2.2 s |

GIN (tsvector) + HNSW (vector) indeksleriyle; aşımda alarm + degrade.

---

## Backfill / Rebuild / Admin / UX / Flag Testleri

- **Backfill:** yarım-kalan (idempotent), yeniden-başlayan, model/index_version/content_hash değişimi → veri kaybı/çift-gömme yok.
- **Rebuild:** tam/incremental/tek-kayıt/tenant/PII → izole, kapı/tenant korunur.
- **Admin:** health/queue/cache/backfill/semantic/embedding/reconcile/rebuild/flag; PII içeriği admin'e sızmaz.
- **UX:** mobil/tablet/laptop/desktop/ultrawide + SR + keyboard + PWA/offline.
- **Flag:** tek/ikili/üçlü/tam-açık/tam-kapalı; kapalı = UI gizli + API 403.

---

## Hata Toleransı (Degrade Zinciri)

| Yoksa | Sistem |
|---|---|
| OpenAI/AI | Hızlı Tarama ayakta |
| pgvector | Lexical ayakta |
| Redis/cache | Cache'siz çalışır |
| Batch | Senkron/incremental embed |
| Tüm AI | Hızlı Tarama tam işlevsel |

Çekirdek değer (kanıtlı lexical arama) hiçbir dış bağımlılığa muhtaç değildir.

---

## Risk Analizi

| Risk | Etki | Olasılık | Çözüm |
|---|---|---|---|
| A3 knowledge RLS açık | Yüksek | Orta | Sprint 0 kilit + app filtre |
| A2 sınırda-PII yanlış sınıf | Yüksek | Düşük | Sprint 0 karar; ihtiyatla PII |
| A4 pii_safe seçilmemiş | Yüksek | — | Seçim yapılmadan PII Derin Analiz açma |
| Filtered-KNN recall | Orta | Orta | HNSW iterative scan / partial; eval |
| TR embedding kalitesi | Orta | Orta | small→large rerank; sözlük telafi |
| Semantic yield düşük | Düşük | Orta | Sözlük + F4 |
| Türkçe stemmer yok | Düşük | Yüksek | Kabul edilen tasarım (normalize+sözlük+önek) |
| Cache bayat | Orta | Düşük | content_hash + invalidasyon |
| Maliyet kaçağı | Orta | Düşük | dedup+cache+rate-limit+degrade |
| Backup diriltme | Yüksek | Düşük | Tombstone denetimi |

Kritik/veri-kaybı riski yok; kalanlar bilinen + azaltmalı.

---

## Üretime Hazırlık — MoSCoW

**MUST (Sprint 0–1):** A3 RLS kilit · A2 sınıf · A6 extension · şema+PII+yardımcı tablolar (RLS-kilitli) · indexer+tenant değişmezi+Kanıt Kapısı+deterministik Neden · golden set + INV + cross-tenant/client harness.

**SHOULD:** semantic (pgvector) + backfill Batch · admin health paneli · feature-flag kademeli açılım · cache.

**COULD:** Derin Analiz (AI C-builder) · çapraz-danışan "benzer vaka" · yerel model · HD/Numeroloji envanteri.

**WON'T (bu sürüm):** kolektif/çapraz-uzman bilgelik · belge-içeriği metin çıkarımı · tam çok-dilli lokalizasyon · RAG özet (anayasa gereği yok).

---

## Sonuç

**Mimari tasarım tamam ve iç-tutarlı; A2/A3/A4/A6 (Sprint 0) kapandığında implementasyona hazır.** Bunlar karar/kurulum kalemleridir, mimari boşluğu değil. Ayrıntılı gerekçe: [`README.md`](./README.md) ve [`10-roadmap.md`](./10-roadmap.md).

---

## Sonraki Faz

→ [`10-roadmap.md`](./10-roadmap.md) — uygulama yol haritası.
