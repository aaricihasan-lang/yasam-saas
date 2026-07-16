# AKTİF GÖREV (CURRENT TASK)

> Bu dosya **yalnızca şu an üzerinde çalışılan tek görevi** tutar. Yeni bir görev
> başladığında bu dosya **baştan doldurulur** (önceki görevin özeti gerekiyorsa
> `PROJECT_STATUS.md` veya `CHANGELOG_AI.md`'ye taşınır).
>
> **Kullanım:** Görev başında bu şablon doldurulur ve kullanıcı onayı ile
> ilerlenir. Her aşama tamamlandıkça ilgili bölüm güncellenir.
>
> **⚠️ Ön koşul — Tutarlılık:** Bu dosya, `PROJECT_STATUS.md` ile **çelişmemelidir**.
> İkisi çelişiyorsa **geliştirmeye başlanmaz**; önce kullanıcıdan doğrulama istenir.

**Son güncelleme:** 2026-07-14

---

## Durum

**Aktif kodlama görevi YOK.** Son görev **S2.05 — JSONB Alan Çıkarımı tamamlandı**
(`work/yh-s2-05`, commit `b5d726f`). Sıradaki aşama **S2.07 (Evidence builder)**
henüz başlamadı; **analiz bekliyor** (kod yazılmadı, karar/onay alınmadı).

---

## Tamamlanan Görev — S2.05 (JSONB Alan Çıkarımı) ✅

Bir kaynak satırından (`row`) indekslenebilir kanıt alanlarını **saf + deterministik**
üreten builder. `work/yh-s2-05` branch'inde commit `b5d726f`.

**Çıktı:** `row → EvidenceField[] / topicTags: string[] / ExpertRelation[]`.

**Teslim edilen dosyalar:**
- `lib/yasam-hafizasi/indexer/extractFields.ts` (saf builder)
- `scripts/yh-extract-fields-harness.ts` (izole harness)

**Uygulanan ilkeler (kanonik):**
- JSONB/çok-değerli çıkarım kuralları **tamamen `extractFields.ts` içinde** (K1→A); `sources.ts` değişmedi; **AD-004 korundu**; `search/types.ts` değişmedi.
- **Fail-safe:** bozuk/bilinmeyen şekiller atlandı, crash yok, coercion (`String()`/`JSON.stringify()`) yok.
- **Evidence text ham/orijinal** korundu (trim/normalize yok).
- tag/relation **trim + exact dedupe** (relation dedup `Map<kind,Set<label>>` ile, ayıraçsız/çakışmasız).
- **note/paragraph sınıflandırması kaynak-bağlamlı** (`NOTE_SOURCES` = refleksoloji:notes, kisisel_arsiv:archives → note; diğer tüm makale/rehber/tarif/kütüphane → paragraph).
- **reference-rows cells** → `sectionRef` undefined (header eşlemesi yapılmaz).
- `Candidate` / `snippet` / `content_hash` / `group_key` **S2.07 kapsamında** (bilinçli dışarıda).

**Kabul kriterleri — GEÇTİ:**
- İzole harness `npx tsx scripts/yh-extract-fields-harness.ts` → **EXIT 0** (22 matris senaryosu + 6 kanonik kontrol + R1–R9 regresyon).
- Kapsam-izole `tsc --noEmit` (2 dosya + import zinciri) → **EXIT 0**.
- Tüm-proje `tsc --noEmit -p tsconfig.json` → **EXIT 0** (yabancı hata yok).
- Kaynak dosyalarda NUL byte = 0 (git metin olarak görüyor).

## Sıradaki Görev (henüz başlamadı) — S2.07 Evidence Builder

- **Kapsam (ROADMAP):** aday oluşturma için `Candidate` inşası + `content_hash` + `group_key` (JSONB parse'ı S2.05 çıktısı üstüne).
- **Durum:** **Analiz bekliyor.** Kod yazılmadı; kapsam/karar analizi ve kullanıcı onayı öncesinde başlanmayacak.
- **Not:** ROADMAP Sprint 2 tablosunda **S2.06 yoktur**; S2.05'ten sonra doğrudan **S2.07** gelir.

## Bekleyen Onaylar

- `work/yh-s2-05` branch'inin **push**'u — kullanıcı onayı bekliyor (henüz yapılmadı).
- **Main entegrasyonu** — kullanıcı onayı bekliyor (henüz yapılmadı).

## Sonuç

- S2.05 tamamlandı ve `b5d726f` ile commit'lendi; kabul kriterleri geçti.
- Push / main entegrasyonu / S2.07 **henüz yapılmadı**; sıradaki iş analiz bekliyor.
