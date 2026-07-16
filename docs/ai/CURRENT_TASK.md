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

**Aktif görev: S2.07 — İndeks-Birimi Builder — UYGULAMA SÜRÜYOR** (implementation in
progress). İzole worktree `work/yh-s2-07` (taban `origin/work/yh-s2-05` = `67fa6fb`).
Tasarım kilidi onaylandı; docs + üretim kodu + izole harness yazılıyor. **Henüz
tamamlanmadı, commit/push yok, harness/TSC "PASS" olarak işaretlenmedi.** Önceki
görev **S2.05 tamamlandı** ve `b5d726f` ile korunmaktadır (aşağıda).

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

## Aktif Görev — S2.07 (İndeks-Birimi Builder) — UYGULANIYOR

Bir kaynak satırından **yazma-yanı** indeks birimini **saf + deterministik + fail-safe**
üreten builder. S2.05 çıktısı (`ExtractedFields`) + S2.04 tenant sonucu üstüne kompoze eder.

**Yeni dosyalar (yalnız bunlar):**
- `lib/yasam-hafizasi/indexer/buildCandidate.ts` (tip `BuiltIndexUnit` + fn `buildIndexUnit` + lokal guard/canonical/SHA-256)
- `scripts/yh-build-candidate-harness.ts` (izole harness)

**Onaylanan tasarım kararları (kesin):**
- **İmza:** `buildIndexUnit(config: SourceConfig, row, tenant: TenantResolveResult, extracted: ExtractedFields): BuiltIndexUnit | null`.
- **Çıktı alanları (16):** tenantId, sourceModule, sourceTable, sourceId, unitType, sectionRef, groupKey, title, titleSource, snippet, snippetOrigin, topicTags, expertRelations, evidenceFields, sourceUpdatedAt, contentHash. *(id/isShared/searchText/searchTsv/lang/isClientPii/embedModel/indexedAt/reviewedAt/version/tsRank — bu aşamada EKLENMEZ.)*
- **groupKey:** `` `${config.sourceKey}:${groupId}` `` — record→primaryKey; section/row + join→parent FK; güvenilir kimlik yoksa `null` (parent yoksa primaryKey'e sessiz fallback YOK). record ile section/row bu aşamada aynı prefix altında birleştirilmez.
- **Birim genişletmesi S2.08'e ait:** bir çağrı ≤1 birim; `sectionRef` S2.07'de daima `null`.
- **title/snippet:** ilk geçerli boş-olmayan string; yoksa `null` (+ source/origin `null`); fallback/first-sentence/uydurma yok.
- **Tenant:** `ok:false`→`null`; `ok:true`→tenantId aynen (shared için `null`); `isShared` çıktıya girmez; tenantId hash'e girmez.
- **Sıfır-kanıt politikası (onaylı):** evidenceFields + topicTags + expertRelations **üçü de boş → `null`** (INV-1).
- **contentHash:** `node:crypto` SHA-256 (harici paket yok). Girdi: title, snippet, evidenceFields(origin,kind,text,sectionRef), topicTags, expertRelations(kind,targetLabel). Hariç: tenantId, sourceId, sourceTable/Module, groupKey, unitType, sectionRef, titleSource, snippetOrigin, sourceUpdatedAt. Lokal canonical: sabit alan sırası + uzunluk-önekli kodlama + null sabit işareti; key-sırasına bağımlılık yok.
- **S2.05 çıktısı** yeniden ayrıştırılmadan/normalize edilmeden/sıralanmadan taşınır; girdi dizileri mutate edilmez (güvenli shallow copy serbest, eleman içeriği değişmez).
- **Korunan (değişmez):** `sources.ts`, `tenantResolve.ts`, `extractFields.ts`, `config.ts`, `search/types.ts`, `package.json`, `package-lock.json` — **AD-004 korunur**.

**Durum:** Kod + izole harness yazılıyor; doğrulamalar (yeni harness + S2.05 regresyon + izole/tam TSC) koşulmadan **tamamlandı/PASS denmeyecek**. İzolasyon: PR #1 (açık) ve paralel Danışan Performansı worktree/branch'ine **dokunulmadı**.

## Bekleyen Onaylar

- S2.05 (`work/yh-s2-05`): **PR #1 açık** (base `main` ← compare `integration/yh-s2-05`, merge commit `d57657f`); merge kullanıcı onayı bekliyor.
- S2.07: iki path-scoped commit (docs + kod) — doğrulama sonrası kullanıcı onayı bekliyor.

## Sonuç

- S2.05 tamamlandı (`b5d726f`); S2.07 aynı çekirdek disipliniyle **uygulanıyor** (henüz commit/push yok).
