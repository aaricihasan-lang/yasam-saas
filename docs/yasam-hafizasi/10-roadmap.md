# 10 — Uygulama Yol Haritası (Roadmap)

## İçindekiler

- [Amaç](#amaç)
- [İş Sırası (Özet)](#i̇ş-sırası-özet)
- [Sprint 0 — Hazırlık](#sprint-0--hazırlık)
- [Sprint 1 — Şema + Indexer](#sprint-1--şema--indexer)
- [Sprint 2 — Retrieval (Hızlı Tarama)](#sprint-2--retrieval-hızlı-tarama)
- [Sprint 3 — UI (Hızlı Tarama)](#sprint-3--ui-hızlı-tarama)
- [Sprint 4 — Semantic](#sprint-4--semantic)
- [Sprint 5 — PII](#sprint-5--pii)
- [Sprint 6 — Derin Analiz](#sprint-6--derin-analiz)
- [Sprint 7 — Admin + Ops](#sprint-7--admin--ops)
- [Sprint 8 — Test + Deploy](#sprint-8--test--deploy)
- [Genel Değişmezler](#genel-değişmezler)
- [İlgili Dokümanlar](#i̇lgili-dokümanlar)

---

## Amaç

Bu doküman, tasarımdan (FAZ 0–7) gerçek implementasyona geçişin **sprint bazlı iş sırasını** tanımlar. Her sprint: amaç, bağımlılık, teslim kriteri, riskler.

> **Altyapı notu:** DDL Supabase Dashboard SQL Editor'dan uygulanır (`DATABASE_URL=localhost` çalışmaz). Her commit **kapsam izole** olmalı (yalnız ilgili dosya path'leri). Her sprint sonunda ilgili harness yeşil + canlı smoke.

---

## İş Sırası (Özet)

```
Migration → Indexer → Retrieval → UI → Semantic → PII → Derin Analiz → Admin → Test → Deploy
   S1         S1         S2        S3      S4        S5       S6          S7      S8     S8
(S0 hazırlık tümünün önünde)
```

---

## Sprint 0 — Hazırlık

- **Amaç:** Açık kararları ve kurulum ön-koşullarını kapatmak.
- **İşler:** A3 `aromatherapy_knowledge_articles` RLS kilit + app-katmanı filtre kararı · A2 sınırda-PII sınıf kararı (öneri: ihtiyatla PII) · A4 pii_safe yol seçimi · A6 `unaccent` + `vector` extension (Dashboard) · feature-flag iskelet kararı.
- **Bağımlılık:** —
- **Teslim kriteri:** 4 MUST kalemi karara/kuruluma bağlanmış; extension'lar aktif.
- **Riskler:** extension erişim/izin; sınırda-PII yanlış sınıf → ihtiyatlı varsayılan.

---

## Sprint 1 — Şema + Indexer

- **Amaç:** İndeks modelini ve indeksleyiciyi kurmak.
- **İşler:** `yasam_hafizasi_index` + `yasam_hafizasi_index_PII` + yardımcı tablolar (RLS-kilitli) · indexer config (tablo→alan-rol) · tenant denormalizasyonu (JOIN tabloları) · lexical backfill (embedding'siz).
- **Bağımlılık:** S0.
- **Teslim kriteri:** 20 F1–4 tablosu indekslenir; tenant denormalizasyon doğru; RLS kilit doğrulandı.
- **Riskler:** DDL'siz tablolarda şema sürprizi; JOIN tenant tutarlılığı.

---

## Sprint 2 — Retrieval (Hızlı Tarama)

- **Amaç:** Deterministik çekirdek aramayı çalıştırmak.
- **İşler:** normalize · sözlük genişletme · `search_tsv` sorgu · **Kanıt Kapısı** · derece · deterministik "Neden?" · tenant/shared değişmezi · INV-1/INV-2 harness.
- **Bağımlılık:** S1.
- **Teslim kriteri:** Golden set (lexical alt küme) geçer; INV-1/2 yeşil; kanıtsız sonuç yok.
- **Riskler:** Türkçe normalize kenar durumları; sözlük kapsamı.

---

## Sprint 3 — UI (Hızlı Tarama)

- **Amaç:** Kullanıcıya değer veren ilk sürüm.
- **İşler:** ana modül ekranı · sonuç kartı · derece görsel dili · "Neden?" · modül filtresi · boş/hata durumları · erişilebilirlik · responsive.
- **Bağımlılık:** S2.
- **Teslim kriteri:** Masaüstü+mobil canlı smoke; a11y kontrol; iki-hız iskeleti (semantic olmadan).
- **Riskler:** mobil bottom-sheet + klavye davranışı.

---

## Sprint 4 — Semantic

- **Amaç:** Anlamsal sıralamayı eklemek (additif).
- **İşler:** `yh_embeddings` yan tablo · embedding backfill (Batch) · pgvector KNN · RRF füzyon · fallback/degrade.
- **Bağımlılık:** S2 (kapı), S1 (indeks).
- **Teslim kriteri:** Recall kazancı ölçüldü; Kanıt Kapısı semantic'e uygulanıyor; kanıtsız semantic aday düşüyor; embedding'de PII yok.
- **Riskler:** filtered-KNN recall; TR embedding kalitesi.

---

## Sprint 5 — PII

- **Amaç:** Danışan geçmişini gizlilikle dahil etmek.
- **İşler:** PII tablo/indexer · client-scope retrieval · pii_safe C-builder · audit trail · silme/RTBF · restore tombstone · cross-client harness.
- **Bağımlılık:** S1–S4.
- **Teslim kriteri:** cross-tenant/client sızıntı testleri yeşil; RTBF residue=0; PII egress=0.
- **Riskler:** çapraz-danışan minimizasyon; restore diriltme.

---

## Sprint 6 — Derin Analiz

- **Amaç:** AI kavram çıkarımını (yalnız anlama) eklemek.
- **İşler:** `ConceptExtractor` adapter · zorunlu JSON schema + doğrulayıcı · sistem sözleşmesi · injection red-team harness · cache/rate-limit/timeout/circuit-breaker.
- **Bağımlılık:** S2 (C-builder dikişi), S4.
- **Teslim kriteri:** injection/hallucination testleri yeşil; şema-dışı reddediliyor; fallback çalışıyor; determinizm korunuyor.
- **Riskler:** provider yanıt tutarlılığı; PII notu pii_safe yol.

---

## Sprint 7 — Admin + Ops

- **Amaç:** İşletim ve gözlemlenebilirlik.
- **İşler:** admin health paneli · reconcile · rebuild · maliyet raporu · flag yönetimi · alarmlar.
- **Bağımlılık:** S1–S6.
- **Teslim kriteri:** metrikler doğru; tetikler çalışıyor; PII içeriği admin'e sızmıyor.
- **Riskler:** reconcile performansı büyük indekste.

---

## Sprint 8 — Test + Deploy

- **Amaç:** Tam doğrulama ve kademeli yayına alma.
- **İşler:** golden set tam koşum · performans/latency · UX/responsive/a11y · feature-flag kademeli rollout · canlı smoke.
- **Bağımlılık:** tümü.
- **Teslim kriteri:** tüm harness yeşil; latency hedefleri karşılandı; Aşama 1→5 rollout planı hazır.
- **Riskler:** ölçek altında latency; rollout geri-alma planı.

---

## Genel Değişmezler

Tüm sprintler boyunca korunur:

- **INV-1** — Kanıtsız aday görünmez.
- **INV-2** — "Neden?" yalnız Evidence'tan.
- **INV-TENANT / INV-PII** — Tenant/PII izolasyonu her sorguda.
- **Additivite** — Semantic/AI additiftir; yokluğunda Hızlı Tarama tek başına çalışır.
- **Anayasa** — 10 madde + Kanıt Kuralı; çelişkide madde kazanır.

---

## İlgili Dokümanlar

- Vizyon & Anayasa → [`00-overview.md`](./00-overview.md)
- Uçtan uca mimari → [`01-architecture.md`](./01-architecture.md)
- Doğrulama & MoSCoW → [`09-phase-7-validation.md`](./09-phase-7-validation.md)
