# 04 — FAZ 2: Hızlı Tarama (Lexical, Deterministik)

## İçindekiler

- [Amaç](#amaç)
- [Boru Hattı](#boru-hattı)
- [1. Türkçe Normalize](#1-türkçe-normalize)
- [2. Sözlük / Eş-Anlam Genişletme](#2-sözlük--eş-anlam-genişletme)
- [3. search_tsv Sorgu Stratejisi](#3-search_tsv-sorgu-stratejisi)
- [4. Kanıt Kapısı](#4-kanıt-kapısı)
- [5. Derece Hesabı](#5-derece-hesabı)
- [6. "Neden Gösterildi?"](#6-neden-gösterildi)
- [7. Boş Durum Davranışı](#7-boş-durum-davranışı)
- [8. Modül Filtreleri](#8-modül-filtreleri)
- [9. Tenant / Shared Değişmezi](#9-tenant--shared-değişmezi)
- [Değişmezler](#değişmezler)
- [Sonraki Faz](#sonraki-faz)

---

## Amaç

Hızlı Tarama, **AI ve embedding olmadan**, tamamen deterministik çalışan çekirdek arama katmanıdır. Sistem hiçbir dış bağımlılık olmadan bu katmanla ayakta kalır.

---

## Boru Hattı

```
Sorgu/Not
 ▼ [1] NORMALİZE (Türkçe)              → normalize token'lar
 ▼ [2] SÖZLÜK GENİŞLETME               → Kavram Kümesi C
 ▼ [3] search_tsv SORGUSU (tenant-filtreli) → aday kayıtlar (ts_rank, limit N)
 ▼ [4] KANIT KAPISI                    → Evidence[] veya DÜŞÜR (INV-1)
 ▼ [5] DERECE                          → çok güçlü / güçlü / zayıf
 ▼ [6] "NEDEN?" (şablon)               → deterministik metin
 ▼ [8] MODÜL FASET + gruplama          → dereceli kart listesi
 └─ [7] boşsa → "Kayıt bulunamadı"
```

---

## 1. Türkçe Normalize

Sorguya ve indekslenen metne **simetrik** uygulanır:

1. Türkçe-duyarlı küçük harf (`İ→i`, `I→ı`, `Ş→ş`, `Ğ→ğ`, `Ü→ü`, `Ö→ö`, `Ç→ç`).
2. Diyakritik katlama (`ğ→g, ü→u, ş→s, ı→i, ö→o, ç→c`).
3. Noktalama/tire/alt-çizgi → boşluk.
4. Boşluk sadeleştirme.
5. Tokenizasyon.
6. Gürültü token atma (opsiyonel stop-list).

**Stemmer YOK.** Postgres'te güvenilir Türkçe stemmer default gelmez; morfolojik varyant (lenf/lenfin/lenfatik) **sözlük + önek** ile yakalanır. Bu, "AI tahmin etmez" ilkesiyle uyumlu ve öngörülebilir.

---

## 2. Sözlük / Eş-Anlam Genişletme

Kaynak: `yh_topic_dictionary` (küratörlü, deterministik — **AI yok**).

```
C = { normalize(sorgu) token'ları }
her token/öbek için:
    d = dictionary.lookup(token)   // çift yönlü canonical↔synonyms
    if d: C += d.canonical + d.synonyms
C = dedupe(normalize(C))
```

- Çok kelimeli kavram ("anne sütü") tek kavram olarak eşleşir.
- Her kavram kaynağını taşır (`query` / `synonym`) → "Neden?"te `synonym` türü belli olur.
- **Hızlı Tarama'da C = yalnız normalize + sözlük.** AI kavram çıkarımı FAZ 4'tür.

---

## 3. search_tsv Sorgu Stratejisi

- **tsquery** = C'nin OR birleşimi; tek kelime `kavram:*` (önek), çok kelime öbek.
- **Config:** `simple` + `unaccent` (stemmer değil) → normalize'la simetrik.
- **Ağırlık:** `ts_rank({A:1.0, B:0.6, C:0.35, D:0.15}, search_tsv, tsquery)`; A=title, B=tag/ilişki, C=paragraf, D=diğer.
- **Aday tavanı** N (~150) → Kanıt Kapısı'na girecek maksimum.

> tsquery bir adayı **bulur** ama görünürlüğe **karar vermez**; o Kanıt Kapısı'nın işidir. tsvector eşleşmesi kök/kısmi olabilir; kapı bunu somut kanıta indirger.

---

## 4. Kanıt Kapısı

Her aday için `evidence_fields` + `topic_tags` + `expert_relations` deterministik taranır:

```
Evidence[] = []
her concept in C:
    her field in aday.evidence_fields:
        m = match(concept, normalize(field.text))
        if m: Evidence += { concept, matched_term:m.term, evidence_type:mapKind(field.kind),
                            field_origin:field.origin, section_ref, char_span:m.span }
    if concept in topic_tags:       Evidence += {type:'tag', ...}
    if concept in expert_relations: Evidence += {type:'relation', target_label, ...}
if Evidence boş: DROP   // INV-1
```

**Eşleşme türleri (öncelik):** exact-title > exact-tag/relation > whole-word > phrase > synonym > prefix/partial.

---

## 5. Derece Hesabı

Her kanıta güç skoru; adayın derecesi = **en yüksek** kanıt skoru:

| Kanıt | Skor |
|---|---|
| exact-title | 100 |
| exact-relation | 95 |
| exact-tag | 90 |
| partial-title | 80 |
| partial-tag/relation | 70 |
| whole-word paragraph | 60 |
| whole-word note | 55 |
| synonym-in-paragraph | 40 |
| prefix/partial | 25 |
| indirect | 15 |

**Eşik:** ≥90 → ● ● ● Çok güçlü · 55–89 → ● ● ○ Güçlü · <55 → ● ○ ○ Zayıf.
**Çoklu-kavram bonusu:** ≥2 farklı kavram ≥60 → bir üst derece (Çok güçlü'yü aşmaz).
**Sıralama:** `(derece, Σ kanıt skoru, ts_rank, source_updated_at)` — deterministik.

---

## 6. "Neden Gösterildi?"

Kaynak: yalnız Evidence → deterministik şablon (AI yok, INV-2):

| evidence_type | Şablon |
|---|---|
| title | `"{matched_term}" bu kaydın başlığında geçiyor.` |
| tag | `Bu kaydı "{matched_term}" etiketiyle siz ilişkilendirmişsiniz.` |
| relation | `Bu kaydı "{target_label}" ile siz bağlantılandırmışsınız.` |
| paragraph | `"{matched_term}" bu kaydın {section_ref} bölümünde geçiyor.` |
| note | `"{matched_term}" bu kaydın notunda geçiyor.` |
| synonym | `Aramanız "{concept}" olarak anlamlandırıldı; kayıtta "{matched_term}" geçiyor.` |

---

## 7. Boş Durum Davranışı

| Durum | Tespit | Ekran |
|---|---|---|
| Soğuk başlangıç | tenant indeks satırı = 0 | "Hazineniz boş" + kayıt ekleme daveti |
| Konu yok | indeks dolu, eşleşme/kanıt yok | "'{C}' olarak anlamlandırıldı, kayıt bulunamadı" |

**Kritik:** tsvector aday bulup **hepsi Kanıt Kapısı'nda düşerse** yine "Kayıt bulunamadı". Kanıtsız kök/kısmi eşleşme asla gösterilmez. Her iki durum da anlamlandırma C'yi gösterir (aramanın dürüst yapıldığının kanıtı).

---

## 8. Modül Filtreleri

- Tek retrieval, tüm izinli modüller → `source_module` gruplama.
- Faset sayaçları tam kümeden; `(0)` modül pasif/şeffaf.
- Filtre = sunum-katmanı faseti (yeni AI çağrısı yok); "Tümü" varsayılan.

---

## 9. Tenant / Shared Değişmezi

Her retrieval sorgusuna **istisnasız** sarılır:

```
WHERE ( tenant_id = :session OR (tenant_id IS NULL AND :allow_shared) )
  AND is_client_pii = false
  AND source_module NOT skipped(demo 40f842a0…)
  AND NOT excludedStone(stones, source_id ∈ stone_exclusions[tenant])
  AND search_tsv @@ :tsquery
```

`:session` daima session'dan; body/query'den asla.

---

## Değişmezler

- **INV-1** — Kanıtsız aday düşer.
- **INV-2** — "Neden?" yalnız Evidence'tan.
- **Determinizm** — Aynı girdi → aynı çıktı (derece + "Neden?").

---

## Sonraki Faz

→ [`05-phase-3-semantic-search.md`](./05-phase-3-semantic-search.md) — semantic arama (pgvector).
