# YOL HARİTASI (ROADMAP)

> Bu dosya, projedeki **büyük modülleri ve sprintleri** üst düzeyde gösterir.
> Ayrıntılı güncel durum `PROJECT_STATUS.md`'de, aktif görev `CURRENT_TASK.md`'dedir.
>
> **Durum işaretleri:** ✅ Tamamlandı · 🟡 Devam ediyor · ⬜ Bekliyor
>
> **Kaynak notu:** Modül durumları, proje hafızası (`MEMORY.md` indeksi) ve repo
> içi doğrulanmış dosyalardan türetilmiştir. Yaşam Hafızası sprint durumları
> `docs/yasam-hafizasi/10-roadmap.md` ve `lib/yasam-hafizasi/` kaynak dosya
> başlıklarından doğrulanmıştır. Tarihler mutlaktır. Güncel gerçek için
> `PROJECT_STATUS.md` esas alınır.

---

## 1. Modül Genel Durumu

| Modül | Durum | Not (doğrulanmış / hafıza kaydı) |
|---|:--:|---|
| Kozmik / Cosmic Calendar | ✅ | Çekirdek motorlar + FAZ 2C/3A/3B/3C/4 + global konum FAZ 5 kilitli (maintenance mode) |
| Refleksoloji | ✅ | Maintenance mode; audit düzeltmeleri + FINAL kilit; production ready |
| Doğaltaş | ✅ | V3 audit FAZ A–B5 + liste perf kilitli; tenant-only mimari |
| Biyoenerji (enerji-beden) | ✅ | V3 UX birleştirme kilitlemeye hazır (görsel + perf P0/P1) |
| Ürün & Stok | ✅ | K-2 envanter + K-3 "cep stok defteri" DB-first |
| Danışan Yolculuğu | ✅ | Audit düzeltmeleri (IDOR/cascade/görüşme/confirm) |
| Ayarlar & Güvenlik | ✅ | /settings 5 sekme + hesap güvenliği (session guard, risk motoru) |
| Human Design | 🟡 | Hesap motoru + BodyGraph sunum kilitli; production entry point var; API route (FAZ 5/2) bekliyor |
| Aromaterapi | 🟡 | FAZ B1 AI'sız Blend Oluşturucu kilitli; sonraki fazlar açık |
| Şifa Rehberi | 🟡 | Çekirdek akış sağlam; legacy kolon fallback (liste kartı "0 bölüm") açık |
| Dijital İçerik | 🟡 | Blok-1 patch'leri; Blok-2/3 + kimliksiz AI uç güvenliği açık |
| Numeroloji | 🟡 | Sert QA: kritik RLS + hesap/görsel bulguları (~62/100), düzeltme bekliyor |
| **Yaşam Hafızası™** | 🟡 | Merkezi zeka katmanı; TASARIM tam + Sprint 1 + Sprint 2 kısmen (aşağıya bakınız) |

> **Not:** Modül "✅" işareti, ilgili sprint/faz kilidini ifade eder; her modülde
> bug/güvenlik/perf/polish backlog'u sürebilir. Bilinen kritik güvenlik riskleri
> `PROJECT_STATUS.md → Riskler` altındadır.

---

## 2. Yaşam Hafızası™ — Sprint Yol Haritası

**Tasarım (FAZ 0–7):** ✅ Tamamlandı — 12 doküman `docs/yasam-hafizasi/` altında
(Anayasa v1.0 + Kanıt Kuralı + mimari + faz tasarımları + roadmap).

**Uygulama iş sırası:** `Migration → Indexer → Retrieval → UI → Semantic → PII →
Derin Analiz → Admin → Test → Deploy`

### Sprint 0 — Hazırlık ⬜/🟡
- Açık kararlar + extension kurulumu (`unaccent`, `vector`), feature-flag iskelet, sınırda-PII sınıf kararı.
- *Durum: kısmen; feature-flag iskelet kodu mevcut (`config.ts`, `flags.ts`).*

### Sprint 1 — Şema + Indexer 🟡
- **A1 merkezi sabitler/tipler** ✅ — `lib/yasam-hafizasi/config.ts`, `tenantScope.ts`, `flags.ts`
- İndeks tabloları (`yasam_hafizasi_index` + `..._PII`) + RLS + lexical backfill: ⬜ (DDL Dashboard'dan)

### Sprint 2 — Retrieval (Hızlı Tarama) 🟡
| Aşama | İş | Durum | Doğrulama |
|---|---|:--:|---|
| **S2.01** | Lexical Retrieval ortak tipleri (Concept/Evidence/Candidate/RankedResult) | ✅ | `search/types.ts` |
| **S2.02** | Küratörlü eş-anlam/kavram sözlüğü DDL (`yh_topic_dictionary`) | ✅ | `config.ts` (YH_TABLES.topicDictionary); DDL Dashboard'dan |
| **S2.03** | İndeks kaynak config (17 kaynak, kolon-rol eşleme, deklaratif) | ✅ | `indexer/sources.ts` |
| **S2.04** | Tenant Resolver (saf fonksiyon, fail-closed, column/join mode) | ✅ | `indexer/tenantResolve.ts` |
| **S2.05** | JSONB alan çıkarımı (metin/tag/relation ayrıştırma) | ✅ | `indexer/extractFields.ts` + `scripts/yh-extract-fields-harness.ts` (`b5d726f`, PR #1 merge `cd9c77c`) |
| **S2.07** | İndeks-birimi builder (yazma-yanı `BuiltIndexUnit`: group_key + content_hash + title/snippet) | ✅ | `indexer/buildCandidate.ts` + `scripts/yh-build-candidate-harness.ts` (`380e44f`, PR #2 merge `2b19743`; harness 28/28) |
| **S2.08** | Runner + `ParentTenantLookup` enjeksiyonu (backfill, join tenant DB erişimi) | 🟡 | `work/yh-s2-08` açıldı (docs); kod yok |
| **S2.13** | Retrieval görünürlük kararı (session + shared birlikte filtre) | ⬜ | — |
| S2.x | normalize · sözlük genişletme · `search_tsv` sorgu · **Kanıt Kapısı** · derece · deterministik "Neden?" · INV-1/INV-2 harness | ⬜ | `10-roadmap.md` |

> **S2.05 ve S2.07 tamamlandı ve main'de** (PR #1 merge `cd9c77c`, PR #2 merge `2b19743`). Aktif iş: **S2.08 (Runner + ParentTenantLookup)** — `work/yh-s2-08` açıldı (docs; kod yok). Sonrası: S2.13 (görünürlük). ROADMAP'te **S2.06 yoktur**.

### Sprint 3 — UI (Hızlı Tarama) ⬜
Ana modül ekranı · sonuç kartı · derece görsel dili · "Neden?" · modül filtresi · a11y · responsive.

### Sprint 4 — Semantic ⬜
`yh_embeddings` · embedding backfill · pgvector KNN · RRF füzyon · fallback (additif).

### Sprint 5 — PII ⬜
PII tablo/indexer · client-scope retrieval · `pii_safe` C-builder · audit · RTBF · cross-client harness.

### Sprint 6 — Derin Analiz ⬜
`ConceptExtractor` adapter (AI yalnız anlama) · zorunlu JSON schema + doğrulayıcı · injection red-team · cache/rate-limit/circuit-breaker.

### Sprint 7 — Admin + Ops ⬜
Admin health paneli · reconcile · rebuild · maliyet raporu · flag yönetimi · alarmlar.

### Sprint 8 — Test + Deploy ⬜
Golden set tam koşum · performans/latency · UX/a11y · feature-flag kademeli rollout · canlı smoke.

---

## 3. Genel Değişmezler (Yaşam Hafızası)

Tüm sprintler boyunca korunur (kaynak: `00-overview.md`, `10-roadmap.md`):

- **INV-1** — Kanıtsız aday görünmez ("Kanıt yoksa sonuç yok").
- **INV-2** — "Neden?" yalnız Evidence kaydından, deterministik şablonla (AI yok).
- **INV-TENANT / INV-PII** — Tenant/PII izolasyonu her sorguda.
- **Additivite** — Semantic/AI additiftir; yokluğunda Hızlı Tarama tek başına çalışır.
- **Anayasa** — 10 madde + Kanıt Kuralı; çelişkide madde kazanır.

---

## 4. Dokümantasyon Altyapısı (docs/ai)

| İş | Durum |
|---|:--:|
| `CLAUDE_PROTOCOL.md` (çalışma protokolü) | ✅ |
| `PROJECT_STATUS.md` (proje durumu) | 🟡 (yaşayan) |
| `CURRENT_TASK.md` (aktif görev) | 🟡 (yaşayan) |
| `ARCHITECTURE_DECISIONS.md` (mimari kararlar) | 🟡 (yaşayan) |
| `CHANGELOG_AI.md` (karar günlüğü) | 🟡 (yaşayan) |
| `ROADMAP.md` (bu dosya) | 🟡 (yaşayan) |
