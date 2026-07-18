# AI KARAR GÜNLÜĞÜ (CHANGELOG_AI)

> Bu dosya, Claude oturumları tarafından alınan **önemli ve kalıcı etkili
> kararları** kaydeder. Amaç, gelecekteki oturumların "bu neden böyle yapılmış?"
> sorusuna hızlıca yanıt bulmasıdır.
>
> **Ne kaydedilir?** Mimari kararlar, kapsam kararları, geriye dönük uyumluluğu
> etkileyen değişiklikler, güvenlik kararları, kalıcı süreç/kural değişiklikleri.
>
> **Ne kaydedilmez?** Rutin, tersine çevrilebilir küçük değişiklikler; yalnızca
> tek bir konuşmayı ilgilendiren detaylar.
>
> **Format:** En yeni karar **en üstte**. Tarihler **mutlak** (örn. `2026-07-13`).
> Doğrulanamayan tarih **"Doğrulanmadı"** olarak işaretlenir; tahmin yazılmaz.
> Her karar aşağıdaki şablonla eklenir.

<!--
## <YYYY-MM-DD> — <Kısa Karar Başlığı>

### Tarih
<YYYY-MM-DD>

### Karar
<Alınan kararın net ifadesi>

### Neden
<Bu kararın gerekçesi; hangi problemi çözüyor, hangi alternatifler elendi>

### Etkilenen Dosyalar
- <dosya1>

### Breaking Change (Evet/Hayır)
<Evet / Hayır — Evetse ne kırılıyor ve nasıl geçiş yapılıyor>

### Migration Gerektiriyor mu? (Evet/Hayır)
<Evet / Hayır — Evetse hangi migration/DDL ve nasıl uygulanacağı>

### Geriye Dönük Uyumluluk
<Eski davranış nasıl korunuyor? Fallback var mı?>

### Notlar
<Ek bağlam, ilgili commit hash'leri, takip işleri>
-->

---

## 2026-07-19 — S2.08–S2.12 Tamamlandı ve PR #3 ile main'e merge edildi; S2.13 Açıldı

### Tarih
2026-07-19

### Karar
Yaşam Hafızası **S2.08–S2.12 — İndeksleyici write-side tamamlandı ve `origin/main`'e
merge edildi**. Aşamalar: S2.08 `runIndexUnit`+`makeParentTenantLookup` (`dd7a022`) ·
S2.09 `runSource` (`172aa91`) · S2.10 `indexWritePlan`+`supabaseIndexAdapters`
(`b8ffc67`) · S2.11 admin index-page route (`e171fa1`) · S2.12A index smoke
(`2dc44d3`) · S2.12C exact-owned-record smoke dry-run (`93ae185`). Git akışı: 7 kaynak
commit (`8cf503d`→`93ae185`, `work/yh-s2-12`) → entegrasyon merge `fa9adbd`
(`work/yh-s2-integration`, güncel main'e fast-forward + `--no-ff` merge) → **PR #3**
(`work/yh-s2-integration` → `main`) **"Create a merge commit" ile merge edildi**
(merge commit **`555030a`**, ebeveynler `0a3e8a4` + `fa9adbd`). **20 YH dosyası,
+3580/−67; package/lock/migration/SQL yok; YH-dışı değişiklik yok.**

Ayrıca **S2.13 — Retrieval Görünürlük Kararı** aktif aşama olarak **açıldı**
(`work/yh-s2-13`, taban `555030a`). Bu docs turunda **kod yazılmadı**.

### Neden
S2.08–S2.12 indeksleyici write-side'ı tamamlar; docs (PROJECT_STATUS/CURRENT_TASK/
ROADMAP) daha önce yalnız "S2.08 açıldı, kod yok" durumunu yansıtıyordu ve gerçek kod
durumuyla çelişiyordu. Bu kayıt + docs uzlaştırma, protokolün "PROJECT_STATUS ↔
CURRENT_TASK tutarlılığı" ön koşulunu geri sağlar (koda geçmeden önce zorunlu).

### Etkilenen Dosyalar
- Kod (PR #3'te, bu turda değil): `lib/yasam-hafizasi/indexer/{runIndexUnit,parentTenantLookup,runSource,indexSourcePage,indexWritePlan,supabaseIndexAdapters,adminIndexRequest,indexSmokePlan}.ts` + `app/api/admin/yasam-hafizasi/index-page/route.ts` + `scripts/yh-*` (7 harness/araç).
- Docs (bu tur): `docs/ai/{PROJECT_STATUS,CURRENT_TASK,ROADMAP,CHANGELOG_AI}.md`.

### Breaking Change (Evet/Hayır)
Hayır. Yalnız yeni dosyalar; korunan sözleşme dosyaları (AD-004) değişmedi.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. Migration/SQL yok. İndeks tabloları DDL'i hâlâ Sprint 1 backlog'unda (Dashboard).

### Geriye Dönük Uyumluluk
Tam. Indexer write-side saf/enjekte; gerçek write ve smoke cleanup her ortamda
fail-closed. Retrieval henüz devrede değil.

### Doğrulamalar
- 8 harness **EXIT 0** (S2.05 · S2.07 · S2.08 · S2.09 42 · S2.10 plan 23 · S2.10 adapter 37 · S2.11 65 · **S2.12 smoke 41/41**).
- Tüm-proje `tsc --noEmit` **EXIT 0**. ESLint YH kapsamı **0 error** (1 eskiden-var warning: `yh-run-index-unit-harness.ts` kullanılmayan `ParentTenantLookup` type import'u).
- Güvenlik grep'leri temiz: exact-owned-record pk+tenant tek sorgu; smoke'ta insert/update/upsert/delete yok; admin auth + demo fail-closed; browser-direct Supabase yok.
- Production build: derleme + TypeScript aşamaları **geçti**; `Collecting page data` aşaması **ortam değişkeni eksikliği** (`supabaseUrl is required`, YH-dışı hacamat route) nedeniyle durdu — kod hatası değil, credential sağlanmadı.

### S2.13 kilitli kararlar (kod öncesi)
- **K1** — Kapsam: retrieval görünürlük yüklemi (session + isteğe bağlı shared + PII dışlama + demo dışlama + tenant stone exclusion dışlama; tenant yalnız server-side session; boş/geçersiz tenant fail-closed; deterministik).
- **K2** — Stone exclusions: config sabiti DEĞİL; saf **enjekte port**; DB erişimi S2.13 içinde yok.
- **K3** — Dosya: yeni `lib/yasam-hafizasi/search/visibilityScope.ts`; mevcut `tenantScope.ts` mümkün olduğunca değiştirilmeden yeniden kullanılır.
- **K4** — DB sınırı: S2.13 tamamen saf/DB'siz (Supabase sorgusu/retrieval yürütme/`search_tsv`/ranking/Kanıt Kapısı/derece/"Neden?"/production write/SQL/migration/Admin UI **kapsam dışı**).
- **K5** — Faz sırası: `search_tsv` sorgusu sonraki ayrı S2.x aşamasında.

### Notlar
- Gerçek DB smoke ve production write hâlâ **açık backlog** (bu turlarda çalıştırılmadı).
- Bu docs turunda kod yazılmadı; push yapılmadı; commit yalnız 4 docs dosyası.

---

## 2026-07-16 — S2.07 Tamamlandı ve main'e merge edildi; S2.08 Açıldı

### Tarih
2026-07-16

### Karar
Yaşam Hafızası **S2.07 — İndeks-Birimi Builder tamamlandı ve `origin/main`'e merge
edildi**. `buildCandidate.ts` (`buildIndexUnit`/`BuiltIndexUnit`) + izole harness
`yh-build-candidate-harness.ts` teslim edildi. Git akışı: kod `380e44f` + docs
`c213b68` (`work/yh-s2-07`) → integration `f79ead6` (`integration/yh-s2-07`,
güncel main'e merge) → **PR #2** (`integration/yh-s2-07` → `main`) **merge edildi**
(`merged_at 2026-07-16T18:07:30Z`, merge commit **`2b19743`**, ebeveynler
`8f7d8a1` + `f79ead6`).

Ayrıca aktif görev **S2.08 (Runner + ParentTenantLookup)** açıldı: yeni izole
worktree `work/yh-s2-08` (taban `2b19743`). Bu kayıt yalnız docs kapanış/açılış
commit'iyle (`docs(ai): close S2.07 and open S2.08`) gelir; **S2.08 kodu henüz yok**.

### Neden
S2.07 index-unit builder, Runner (S2.08) DB'ye yazmadan önce satırın deterministik,
provenance'lı, kanıt taşıyan biçimini üretir. Tamamlanıp main'e alınarak S2.08'in
saf zincir (S2.04 tenant → S2.05 alan → S2.07 birim) üstüne inşa edilmesi sağlandı.
Docs, sonraki oturumların tek doğru kaynağı olduğundan gerçek Git durumuyla
senkronlandı (S2.05 + S2.07 main'de; PR #1/#2 merge; S2.08 aktif).

### Etkilenen Dosyalar
- `docs/ai/PROJECT_STATUS.md`, `docs/ai/CURRENT_TASK.md`, `docs/ai/ROADMAP.md`, `docs/ai/CHANGELOG_AI.md` (durum senkronizasyonu; kod dosyasına dokunulmadı)

### Doğrulama (merge sonrası main üzerinde)
- S2.07 harness → **EXIT 0 (28/28)**; S2.05 regresyon harness → **EXIT 0**.
- Tüm-proje `tsc --noEmit -p tsconfig.json` → **EXIT 0**; `git diff --check` → CLEAN.
- **AD-004 korundu:** korunan 7 dosya (`sources.ts`, `tenantResolve.ts`, `extractFields.ts`, `config.ts`, `search/types.ts`, `package.json`, `package-lock.json`) merge öncesi main ile bit-bit özdeş.

### Breaking Change (Evet/Hayır)
Hayır. Additif; S2.07 yalnız yeni builder + harness ekledi.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. SQL/DDL yok; DB yazımı S2.08'e ait.

### Geriye Dönük Uyumluluk
Tam uyumlu; additif katman. Paralel Danışan Performansı çalışması (`8f7d8a1`,
`fc078eb`) main'de korundu, YH ile örtüşme yok.

### Notlar
S2.05 de bu döngüde main'e alınmıştı (PR #1 merge `cd9c77c`). Head branch'ler
(`integration/yh-s2-07`, `work/yh-s2-07`) silinmedi. S2.08 kodu kilitleme + onay
sonrası yazılacak.

---

## 2026-07-14 — S2.07 (İndeks-Birimi Builder) Başladı

### Tarih
2026-07-14

### Karar
Yaşam Hafızası **S2.07 — İndeks-Birimi Builder** izole worktree `work/yh-s2-07`
(taban `origin/work/yh-s2-05` = `67fa6fb`) içinde **uygulanmaya başlandı** (henüz
commit/push yok). Bir kaynak satırından **yazma-yanı** indeks birimini saf +
deterministik + fail-safe üreten builder; S2.05 çıktısı + S2.04 tenant sonucu üstüne
kompoze eder.

Onaylanan tasarım (kesin):
- **İmza:** `buildIndexUnit(config, row, tenant: TenantResolveResult, extracted: ExtractedFields): BuiltIndexUnit | null` — yeni dosya `lib/yasam-hafizasi/indexer/buildCandidate.ts`.
- **BuiltIndexUnit (16 alan):** tenantId, sourceModule, sourceTable, sourceId, unitType, sectionRef, groupKey, title, titleSource, snippet, snippetOrigin, topicTags, expertRelations, evidenceFields, sourceUpdatedAt, contentHash. id/isShared/searchText/searchTsv/lang/isClientPii/embedModel/indexedAt/reviewedAt/version/tsRank bu aşamada YOK.
- **groupKey** = `${config.sourceKey}:${groupId}` (record→primaryKey; section/row+join→parent FK; kimlik yoksa `null`, sessiz primaryKey fallback yok).
- **Birim genişletme S2.08'e ait:** çağrı başına ≤1 birim; `sectionRef` daima `null`.
- **title/snippet:** ilk geçerli boş-olmayan kolon; yoksa `null`; uydurma/first-sentence/label fallback yok.
- **Tenant:** ok:false→null; ok:true→tenantId (shared→null); isShared çıktıda yok; tenantId hash'e girmez.
- **Sıfır-kanıt (evidenceFields+topicTags+expertRelations üçü boş) → `null`** (INV-1).
- **contentHash:** `node:crypto` SHA-256; girdi yalnız içerik (title, snippet, evidenceFields[origin,kind,text,sectionRef], topicTags, expertRelations[kind,targetLabel]); lokal canonical (sabit sıra + uzunluk-önekli + null sabiti). Provenance/kimlik/tenant/updatedAt hariç.

### Neden
S2.05 evidence/tag/relation çıkardı ama `Candidate`/`content_hash`/`group_key` bilinçle
ertelendi (bkz. `2026-07-14 — S2.05` kaydı). S2.07 bu boşluğu **yazma-yanı** indeks
birimi olarak doldurur: Runner (S2.08) DB'ye yazmadan önce satırın deterministik,
provenance'lı, kanıt taşıyan biçimini üretir. Determinizm + saflık (IO/DB yok) +
fail-safe disiplini S2.05 ile aynıdır. `content_hash`, incremental re-index için
tenant/kimlikten bağımsız yalnız içerik değişimini yakalar.

### Etkilenen Dosyalar
- `lib/yasam-hafizasi/indexer/buildCandidate.ts` (yeni)
- `scripts/yh-build-candidate-harness.ts` (yeni)
- `docs/ai/CURRENT_TASK.md`, `docs/ai/PROJECT_STATUS.md`, `docs/ai/ROADMAP.md`, `docs/ai/CHANGELOG_AI.md` (durum senkronizasyonu)

### Breaking Change (Evet/Hayır)
Hayır. Yeni, izole additif katman; mevcut modüller ve S2.01–S2.05 dosyaları etkilenmez.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. SQL/DDL yok; `search_text`/`search_tsv` ve DB yazımı S2.08'e ait.

### Geriye Dönük Uyumluluk
İlgili değil; additif yeni katman. `sources.ts`/`tenantResolve.ts`/`extractFields.ts`/`search/types.ts`/`config.ts` değişmez (AD-004 korunur).

### Notlar
Kod/docs **commit edilmedi** (kullanıcı onayı bekliyor). Kapsam dışı bırakılan
`search_text`/`is_client_pii`(F5)/`lang`/`embed_model`(F3) ve birim genişletmesi →
S2.08+. PR #1 (S2.05, açık) ve paralel Danışan Performansı worktree/branch'ine
dokunulmadı.

---

## 2026-07-14 — S2.05 (JSONB Alan Çıkarımı) Tamamlandı

### Tarih
2026-07-14

### Karar
Yaşam Hafızası **S2.05 — JSONB Alan Çıkarımı** tamamlandı ve `work/yh-s2-05`
branch'inde commit `b5d726f` ("feat(yasam-hafizasi): add S2.05 field extraction")
olarak kaydedildi. Saf builder `extractFields(config, row)` üretir:
`row → EvidenceField[] / topicTags: string[] / ExpertRelation[]`.

Uygulanan ilkeler: JSONB/çok-değerli çıkarım kuralları tamamen `extractFields.ts`
içinde (K1→A; `sources.ts` değişmedi, AD-004 korundu, `search/types.ts` değişmedi);
fail-safe (bozuk/bilinmeyen şekiller atlanır, crash yok, coercion yok); evidence
text ham/orijinal; tag/relation trim + exact dedupe; note/paragraph sınıflandırması
**kaynak-bağlamlı** (`NOTE_SOURCES` = refleksoloji:notes + kisisel_arsiv:archives);
reference-rows cells `sectionRef` undefined.

### Neden
S2.03 (`sources.ts`) JSONB kolonları AD-004 gereği yalnız kolon adıyla listeler;
ayrıştırma bilinçli olarak builder'a ertelenmişti. S2.05 bu boşluğu Kanıt Kapısı'nın
(INV-1) tarayacağı evidence/tag/relation yapıları için doldurur. Determinizm ve
saflık (IO/DB yok) korunarak halüsinasyon/yan-etki yüzeyi minimize edildi.

### Etkilenen Dosyalar
- `lib/yasam-hafizasi/indexer/extractFields.ts` (yeni, saf builder)
- `scripts/yh-extract-fields-harness.ts` (yeni, izole harness)

### Kabul Kriterleri (geçti)
- İzole harness `npx tsx` → EXIT 0 (22 matris + 6 kanonik + R1–R9 regresyon).
- Kapsam-izole `tsc --noEmit` → EXIT 0.
- Tüm-proje `tsc --noEmit -p tsconfig.json` → EXIT 0 (yabancı hata yok).

### Breaking Change (Evet/Hayır)
Hayır. Yeni, izole altyapı; mevcut modüller etkilenmedi.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. SQL/DDL yok.

### Geriye Dönük Uyumluluk
İlgili değil; additif yeni katman.

### Notlar
Push: **henüz yapılmadı** (uzak `origin/work/yh-s2-05` yok). Main entegrasyonu:
**henüz yapılmadı**. Kapsam dışı bırakılanlar (`Candidate` / `snippet` /
`content_hash` / `group_key`) → **S2.07**. ROADMAP'te S2.06 yok; sıradaki S2.07.

---

## 2026-07-13 — S2.04 origin/main'de Tamamlandı; S2.05 (JSONB Alan Çıkarımı) Açıldı

### Tarih
2026-07-13

### Karar
Yaşam Hafızası **S2.04 (Tenant Resolver)** `origin/main`'de **tamamlandı** olarak
kaydedildi (commit `6578ec5`). Aktif görev **S2.05 — JSONB Alan Çıkarımı**'na
geçildi. S2.05 için K1–K6 kararları kilitlendi:
- **K1 → A:** JSONB çıkarım kuralları **yalnız builder içinde**; `sources.ts`
  değişmez; **AD-004 korunur** (yeni AD gerekmez).
- **K2:** Yeni dosya `lib/yasam-hafizasi/indexer/extractFields.ts`;
  `search/types.ts` mümkün olduğunca değişmez.
- **K3:** S2.05 yalnız `row → EvidenceField[]/TopicTags[]/ExpertRelations[]`;
  `Candidate`/`content_hash`/`group_key` **S2.07**'de.
- **K4:** **Fail-safe** — bilinmeyen JSONB şekli indekslemeyi durdurmaz; alan atlanır.
- **K5:** Önce dokümanlar güncellenir (bu kayıt), sonra S2.05 kodu.
- **K6:** tenantResolve benzeri izole harness (`scripts/yh-extract-fields-harness.ts`, `tsx`).

### Neden
Sonraki oturumların tek doğru kaynağı (`docs/ai/`) ile gerçek durum arasındaki
çelişkiyi gidermek: S2.04 artık working-tree'de "commit bekliyor" değil,
`origin/main`'de tamamlanmış temeldir. S2.05 bunun üstüne, çekirdek saflık/
determinizm disipliniyle (tenantResolve deseni) inşa edilecek.

### Etkilenen Dosyalar
- `docs/ai/PROJECT_STATUS.md`
- `docs/ai/CURRENT_TASK.md`
- `docs/ai/CHANGELOG_AI.md`

### Breaking Change (Evet/Hayır)
Hayır. Yalnız dokümantasyon senkronizasyonu; uygulama davranışı değişmedi.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır.

### Geriye Dönük Uyumluluk
Tam uyumlu; kod/mimari değişmedi (AD-004 dahil korunuyor).

### Notlar
`6578ec5`'in origin/main'de olduğu kullanıcı beyanına göredir; bu oturumda git ile
yeniden doğrulanmadı. Bu doküman commit'i (İş Birimi 1), S2.05 kod commit'inden
(İş Birimi 2) ayrı ve path-scoped tutulur. Commit/push kullanıcı onayına bağlıdır.

---

## 2026-07-13 — docs/ai Kalıcı AI Çalışma Sistemi Kuruldu

### Tarih
2026-07-13

### Karar
`docs/ai/` altında çoklu-oturum çalışma sistemi kuruldu: `CLAUDE_PROTOCOL.md`,
`PROJECT_STATUS.md`, `CURRENT_TASK.md`, `ARCHITECTURE_DECISIONS.md`,
`CHANGELOG_AI.md`, `ROADMAP.md`. Doküman öncelik sırası + yaşayan doküman ilkesi
tanımlandı.

### Neden
Repo aynı anda birden fazla Claude oturumu ile geliştiriliyor. Paylaşımlı `git
index` üzerinden yabancı dosya sızması (bkz. `83adab2`) ve tutarsız çalışma riskini
azaltmak için tek doğru kaynak gerekti. Yeni oturumlar yalnız bu klasörü okuyarak
başlayabilsin.

### Etkilenen Dosyalar
- `docs/ai/CLAUDE_PROTOCOL.md`
- `docs/ai/PROJECT_STATUS.md`
- `docs/ai/CURRENT_TASK.md`
- `docs/ai/ARCHITECTURE_DECISIONS.md`
- `docs/ai/CHANGELOG_AI.md`
- `docs/ai/ROADMAP.md`

### Breaking Change (Evet/Hayır)
Hayır. Yalnız dokümantasyon; uygulama davranışı değişmedi.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır.

### Geriye Dönük Uyumluluk
Tam uyumlu; mevcut kod/dokümanlar etkilenmedi.

### Notlar
Bu görevde commit/push yapılmadı (kullanıcı talimatı).

---

## 2026-07-12 — Doğaltaş Kategori Güvenliği + "Karışık Commit" Dersi (83adab2)

### Tarih
2026-07-12

### Karar
"Taş Bilgi Kütüphanesi" tarayıcıdan `anon key` ile `stone_knowledge_categories`
okuyup yazıyordu; kimlik doğrulamalı sunucu route'una (`/api/dogaltas/knowledge/
categories`, service_role, admin-gated POST, fail-closed demo guard) taşındı.
Süreç dersi: `83adab2` commit'ine kapsam dışı iki `yasam-hafizasi/indexer` dosyası
karıştı; bu olay `CLAUDE_PROTOCOL.md → Büyük Dersler` altında kalıcılaştırıldı.

### Neden
Tarayıcıdan hassas kategori verisine anon erişim güvenlik açığıydı. Ayrıca
paylaşımlı `git index`'te toplu/kapsamsız stage, yabancı dosyaların commit'e
sızmasına yol açtı → path-scoped stage/commit ve öncesi/sonrası doğrulama kuralı
zorunlu hale getirildi.

### Etkilenen Dosyalar
- `app/api/dogaltas/knowledge/categories/route.ts`
- `app/dogaltas/tas-bilgi-kutuphanesi/page.tsx`
- (Kapsam dışı sızan: `lib/yasam-hafizasi/indexer/sources.ts`, `tenantResolve.ts`)

### Breaking Change (Evet/Hayır)
Hayır (fallback korundu; UI admin-gated).

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. DB seviyesi RLS/REVOKE ayrı ve onaylı aşamaya bırakıldı.

### Geriye Dönük Uyumluluk
Korundu; kategori okuma davranışı sunucu route'una taşındı, UI fallback'i çalışıyor.

### Notlar
Commit `83adab2` (Author tarihi: 2026-07-12). Süreç kuralları `CLAUDE_PROTOCOL.md`'de.

---

## Tarih: Doğrulanmadı — Yaşam Hafızası™ Sprint 2 Retrieval Çekirdeği (S2.01–S2.04)

### Tarih
Doğrulanmadı (tasarım/uygulama fazı; commit'ler: `0882fa4` S2.01, `b3396d9` S2.03).

### Karar
Hızlı Tarama (lexical retrieval) çekirdeği katmanlı ve saf tutuldu:
- **S2.01** ortak tipler (`search/types.ts`) — yalnız tip, mantık yok.
- **S2.02** küratörlü sözlük DDL (`yh_topic_dictionary`).
- **S2.03** deklaratif kaynak config (`indexer/sources.ts`) — DB/IO/normalize/evidence yok.
- **S2.04** Tenant Resolver (`indexer/tenantResolve.ts`) — saf fonksiyon, fail-closed, DB erişimi enjekte.

### Neden
Determinizm, test edilebilirlik ve güvenlik (tenant/PII izolasyonu). Saflık sınırı:
IO ve DB erişimi çekirdekten ayrıştırılarak yan etki yüzeyi ve halüsinasyon riski
en aza indirildi. JSONB ayrıştırma ve evidence çıkarımı bilinçli olarak sonraki
builder aşamalarına (S2.05/S2.07) ertelendi.

### Etkilenen Dosyalar
- `lib/yasam-hafizasi/search/types.ts`
- `lib/yasam-hafizasi/indexer/sources.ts`
- `lib/yasam-hafizasi/indexer/tenantResolve.ts`
- `lib/yasam-hafizasi/config.ts`

### Breaking Change (Evet/Hayır)
Hayır (yeni, izole altyapı; mevcut modüller etkilenmedi).

### Migration Gerektiriyor mu? (Evet/Hayır)
Evet (kısmen) — indeks tabloları + `yh_topic_dictionary` DDL Supabase Dashboard SQL
Editor'dan uygulanır (`DATABASE_URL=localhost` çalışmaz).

### Geriye Dönük Uyumluluk
İlgili değil; additif yeni katman.

### Notlar
S2.04 (`tenantResolve.ts`) **`6578ec5` ile origin/main'de commit'lendi** (bu kayıt ilk
yazıldığında working-tree'de untracked'ti; sonradan commit edildi). Ayrıntı:
`ROADMAP.md` ve `ARCHITECTURE_DECISIONS.md`.

---

## Tarih: Doğrulanmadı — Yaşam Hafızası™ Ürün Anayasası v1.0 + Kanıt Kuralı

### Tarih
Doğrulanmadı (tasarım fazı; kaynak: `docs/yasam-hafizasi/00-overview.md`).

### Karar
10 maddelik Ürün Anayasası + Kanıt Kuralı çekirdek felsefe olarak kilitlendi:
AI yalnız anlama üretir (Kavram Kümesi), cevap üretmez ve kayıt seçmez; görünür
sonuca yalnız deterministik **Kanıt Kapısı** karar verir; kanıt yoksa sonuç yok.

### Neden
Halüsinasyonu, kaynaksız/kanıtlanamaz çıktıyı, teşhis/tedavi sorumluluğunu ve
model bağımlılığını yapısal olarak engellemek. Değer, AI modelinden değil uzmanın
kendi hazinesinden gelir (Taç İlke — Madde 8).

### Etkilenen Dosyalar
- `docs/yasam-hafizasi/00-overview.md` (ve ilgili 11 tasarım dokümanı)

### Breaking Change (Evet/Hayır)
Hayır (felsefe/tasarım kararı).

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır.

### Geriye Dönük Uyumluluk
İlgili değil.

### Notlar
Tüm teknik kararlar bu anayasaya tabidir; çelişkide madde kazanır. Değişmezler:
INV-1, INV-2, INV-TENANT, INV-PII.

<!-- Yeni kararlar buraya, en yeni en üstte olacak şekilde eklenir. -->
