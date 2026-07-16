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

**Son güncelleme:** 2026-07-16

---

## Durum

**Aktif görev: S2.08 — Runner + ParentTenantLookup — AÇILDI** (tasarım aşaması; **kod
henüz yok**). İzole worktree `work/yh-s2-08` (taban `origin/main` = `2b19743`). Bu
aşamada yalnız docs kapanış/açılış senkronizasyonu yapıldı. Önceki görev **S2.07
tamamlandı ve main'e merge edildi** (`2b19743`); aşağıda özetlenmiştir. Kod, tasarım
kararları kilitlenip kullanıcı onayı alındıktan sonra yazılacaktır.

---

## Tamamlanan Görev — S2.07 (İndeks-Birimi Builder) ✅ (main'de)

Bir kaynak satırından **yazma-yanı** indeks birimini **saf + deterministik + fail-safe**
üreten builder. S2.05 çıktısı (`ExtractedFields`) + S2.04 tenant sonucu üstüne kompoze eder.
Kod `380e44f`, docs `c213b68`, integration `f79ead6`; **PR #2 merge edildi** → main `2b19743`.

**Teslim edilen dosyalar:**
- `lib/yasam-hafizasi/indexer/buildCandidate.ts` (tip `BuiltIndexUnit` + fn `buildIndexUnit` + lokal guard/canonical/SHA-256)
- `scripts/yh-build-candidate-harness.ts` (izole harness)

**Uygulanan tasarım (kanonik):**
- **İmza:** `buildIndexUnit(config, row, tenant: TenantResolveResult, extracted: ExtractedFields): BuiltIndexUnit | null`.
- **BuiltIndexUnit (16 alan):** tenantId, sourceModule, sourceTable, sourceId, unitType, sectionRef, groupKey, title, titleSource, snippet, snippetOrigin, topicTags, expertRelations, evidenceFields, sourceUpdatedAt, contentHash.
- **groupKey:** `` `${config.sourceKey}:${groupId}` `` — record→primaryKey; section/row+join→parent FK; kimlik yoksa `null` (sessiz fallback yok).
- **title/snippet:** ilk geçerli boş-olmayan kolon; yoksa `null`; uydurma/first-sentence/label fallback yok.
- **Tenant:** ok:false→null; ok:true→tenantId (shared→null); isShared çıktıda yok; tenantId hash'e girmez.
- **Sıfır-kanıt (evidenceFields+topicTags+expertRelations üçü boş) → `null`** (INV-1).
- **contentHash:** `node:crypto` SHA-256; girdi yalnız içerik (title, snippet, evidenceFields[origin,kind,text,sectionRef], topicTags, expertRelations[kind,targetLabel]); lokal canonical (sabit sıra + uzunluk-önekli + null sabiti). Provenance/kimlik/tenant/updatedAt hariç.
- **Korunan (değişmez):** `sources.ts`, `tenantResolve.ts`, `extractFields.ts`, `config.ts`, `search/types.ts`, `package.json`, `package-lock.json` — **AD-004 korundu**.

**Kabul kriterleri — GEÇTİ (merge sonrası main üzerinde doğrulandı):**
- S2.07 harness `npx tsx scripts/yh-build-candidate-harness.ts` → **EXIT 0 (28/28)**.
- S2.05 regresyon harness `npx tsx scripts/yh-extract-fields-harness.ts` → **EXIT 0**.
- Tüm-proje `tsc --noEmit -p tsconfig.json` → **EXIT 0**.
- `git diff --check` → CLEAN; working tree temiz. Merge çakışmasız (`2b19743`, ebeveynler `8f7d8a1` + `f79ead6`).

> Önceki tamamlanan görev — **S2.05 (JSONB Alan Çıkarımı)** (`b5d726f`, PR #1 merge `cd9c77c`): `row → EvidenceField[]/topicTags/ExpertRelation[]`. Ayrıntı `CHANGELOG_AI.md`'de.

## Aktif Görev — S2.08 (Runner + ParentTenantLookup) — AÇILDI (kod yok)

İndeksleyici runner: kaynak satırlarını S2.04 tenant çözümü → S2.05 alan çıkarımı →
S2.07 birim builder zincirinden geçirir; join-mode tenant için `ParentTenantLookup`
DB erişimini **enjekte eder** (çekirdek saf kalır, IO enjekte edilir; tenantResolve
deseni). Backfill/write-side orkestrasyon.

**Durum:** Yalnız docs açılışı yapıldı; tasarım kararları henüz **kilitlenmedi**, kod
yok. Kilitleme + kullanıcı onayı sonrası uygulanacak.

**Not:** Birim genişletmesi (bir satır → çok birim) ve `sectionRef` üretimi S2.08
kapsamına aittir (S2.07'de `sectionRef` daima `null`, çağrı başına ≤1 birimdi).

## Bekleyen Onaylar

- **S2.08:** tasarım kararlarının kilitlenmesi + kod öncesi kullanıcı onayı.

## Sonuç

- S2.05 (`cd9c77c`) ve S2.07 (`2b19743`) main'de; tümü doğrulandı, AD-004 korundu.
  S2.08 açıldı (docs); kod, onay sonrası aynı çekirdek disipliniyle yazılacaktır.
