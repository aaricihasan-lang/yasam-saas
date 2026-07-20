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

## 2026-07-20 — S2.17 main'e merge edildi (PR #13, `7344b6d`) + S2.18 açıldı (Retrieval Query Descriptor / EX-D)

### Tarih
2026-07-20

### Karar
(1) **S2.17 (search_tsv tsquery Plan) main/production'a MERGE EDİLDİ** — **PR #13**, merge commit
**`7344b6d`** (feature kod `1ab8601`). Alt-taki "S2.17 push/PR bekliyor" girdisi bununla kapanır.
`origin/main` sonrasında **`9bbe5da`**'ya ilerledi (yalnız **Danışan Yolculuğu / clients** mobil analiz +
Word UX düzeltmeleri; `4305d3d` + merge `9bbe5da`; **YH yüzeyine dokunmaz** — drift doğrulandı).

(2) **S2.18 açıldı: Saf Retrieval Query Descriptor / Execution Contract (EX-D).** S2.18, S2.17
`TsQueryPlan` çıktısını **tüketir** ve retrieval'ın execution niyetini **DB'siz, saf, deterministik
typed descriptor** olarak üretir. **Worktree tabanı = `9bbe5da`** (güncel origin/main), branch
`work/yh-s2-18`. Bu tur **yalnız doküman açılışı**; `retrievalQuery.ts` + harness ayrı onaylı adımda.

**Kesin sözleşme kayıtları:**
- **S2.18 = saf Retrieval Query Descriptor / Execution Contract** (execution niyeti; yürütme değil).
- **S2.17 `TsQueryPlan` çıktısını tüketir** (config/column/tsquery).
- **Gerçek DB execution / `.rpc()` / PostgreSQL fonksiyonu / DDL / production SQL = S2.19 kapsamı.**
- **Evidence Gate downstream ve kapsam dışıdır** (`Candidate[]` tüketir, `TsQueryPlan` değil; boru hattı [4]).
- **Visibility politikası yeniden uygulanmaz** — mevcut S2.13 `VisibilityContext` taşınır; tenant/shared/
  PII/demo'nun ikinci implementasyonu oluşturulmaz; yetkili satır-kararı `evaluateVisibility`, WHERE
  materyalizasyonu S2.19.
- **Fail-closed sonuç sözleşmesi:** discriminated union `kind:'noop'` (execution yasak; sınırlı `reason`)
  | `kind:'query'` (güvenli descriptor). Adapter (S2.19) **yalnız `kind:'query'`** çalıştırabilir.
- **String SQL üretilmez** — visibility/ranking/limit typed veri; SQL/RPC parametre dönüşümü S2.19.
- **Ranking intent taşınır fakat yürütülmez** — weighted ts_rank gereksinimi + `YH_TSV_WEIGHTS` + desc +
  `YH_CANDIDATE_LIMIT`; ts_rank hesaplanmaz, SQL ifadesi oluşturulmaz.
- **Config/SQL drift riski S2.19'da çözülmelidir** — ağırlık/limit ya descriptor'dan RPC-parametresi
  olarak geçirilecek, ya SQL'de sabitlenirse TS config ile senkronizasyonu doğrulayan harness bulunacak.
  **S2.18'de DDL kararı verilmez.**

### Neden
Kanıt (boru hattı §Boru Hattı + §3/§9; `tsQueryPlan.ts` "Kapsam dışı"; `types.ts` `Candidate`):
`TsQueryPlan`'ı tüketen sıradaki anayasal ünite **execution bağlantısıdır ([3])**, Evidence Gate ([4])
değil. Doğru execution ts_rank sıralaması için **PostgreSQL RPC (DDL)** gerektirir; saf-birim disiplini
gereği bu DDL'li adım (S2.19) öncesine **DB'siz saf descriptor (EX-D)** yerleştirilir (S2.17'nin plan-önce
ritminin aynısı).

### Etkilenen Dosyalar
- `docs/ai/CURRENT_TASK.md`, `docs/ai/PROJECT_STATUS.md`, `docs/ai/ROADMAP.md`, `docs/ai/CHANGELOG_AI.md`
  (yalnız doküman; kod/harness/migration YOK).

### Breaking Change (Evet/Hayır)
Hayır (doküman açılışı).

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. (S2.18 DB'siz. RPC/DDL S2.19'a ait, ayrı onay + Dashboard.)

### Geriye Dönük Uyumluluk
İlgili değil (yeni sprint açılışı). S2.01–S2.17 birimleri değişmez; S2.18 yalnız import + tüketim.

### Notlar
- Taban SHA `9bbe5da82a2f9f5ccc4525b01a18141cf7ee77a3`. Fixed SHA `7344b6d` (S2.17/PR#13) hâlâ reachable.
- Kararlar K1–K7 ve harness matrisi `CURRENT_TASK.md`'de. Kod aşaması ayrı kullanıcı onayı bekler.

---

## 2026-07-20 — S2.17 (search_tsv Query / tsquery Plan) feature branch'te tamamlandı (push/PR bekliyor)

### Tarih
2026-07-20

### Karar
Yaşam Hafızası **S2.17 — search_tsv Query (tsquery Plan)** geliştirme ve doğrulama olarak
**tamamlandı**; **feature branch commit'i hazır**. Feature kod commit **`1ab8601`**
(`feat(yasam-hafizasi): add S2.17 search_tsv query plan`). Güncel origin/main (`95efcab`) feature
branch'e normal merge ile alındı (son main sync merge **`46fd460`**; parent'lar `1ab8601` + `95efcab`;
conflict yok — gelen değişiklik yalnız aromaterapi migration'ı). **Durum ayrımı:** kod tamamlandı ✅ ·
feature branch'e commit edildi ✅ · **main/production'a merge EDİLMEDİ ❌**. **Push ve PR henüz YOK.**
Sıradaki **S2.18** ayrı mimari analiz + onayla açılacak (henüz açılmadı, kod yok).

### Neden
Retrieval boru hattının [3] adımı: Concept Set (S2.15) + Dictionary Expansion (S2.16) çıktısını
PostgreSQL full-text search için güvenli/deterministik tsquery planına çevirmek. DB çalıştırma
bilinçli olarak sonraki faza (S2.18) bırakıldı (saf-birim disiplini).

### Oluşturulan dosyalar (feature kod `1ab8601`)
- `lib/yasam-hafizasi/search/tsQueryPlan.ts` — `buildTsQueryPlan(concepts: readonly Concept[]): TsQueryPlan` + `TsQueryClause`/`TsQueryPlan`/`TsQueryClauseKind`.
- `scripts/yh-tsquery-plan-harness.ts` — izole harness (20 test grubu / 57 assertion).

### Temel davranış / kararlar
- **Tek kelime concept → prefix `term:*`.** **Çok kelime concept → exact phrase `(t1 <-> t2)`;
  phrase-prefix YOK** (KARAR 1: §3 prefix'i yalnız tek kelime için tanımlar; icat yok).
- Clause'lar giriş sırasıyla **`|` (OR)**; config **`simple`**; kolon **`search_tsv`**.
- **Güvenlik allowlist'i:** ham girdi doğrudan eklenmez; her lexeme `^[a-z0-9]+$` yeniden doğrulanır;
  tek geçersiz lexeme → o concept clause'u tamamen atlanır; operatörler (`:*`, `<->`, `|`, `(`, `)`)
  yalnız koddan; SQL interpolation/DB çağrısı yok.
- **Serializer dedup:** aynı güvenli fragment tekrarında ilk görünüm + ilk `origin` korunur (S2.15/
  S2.16 semantik dedup'ı yeniden uygulanmaz).
- **Immutability:** plan + clauses + her clause `Object.freeze`; her çağrı taze; girdi mutasyonsuz.
- **Boş/geçersiz:** hepsi elenirse `clauses:[]`, `tsquery:""`, `isEmpty:true`; asla throw etmez.
- İmza `readonly Concept[]` (`unknown` değil; yalnız dizi-içi bozuk öğeye küçük guard; `any` yok).

### Kapsam dışı (S2.17 DEĞİL)
`candidateLimit`/`YH_CANDIDATE_LIMIT` · `ts_rank`/weights · DB execution · Supabase client ·
`textSearch` çağrısı · RPC · tenant/visibility filtresi · Stone Exclusion · Evidence Gate ·
Ranking · Retrieval Pipeline · UI · migration. (Hepsi S2.18+.)

### Doğrulamalar
S2.17 harness **57/57** · S2.16 regresyon **42/42** · S2.15 regresyon **42/42** · S2.14 regresyon
**83/83** · `tsc --noEmit` **PASS** · hedefli ESLint (2 yeni dosya) **PASS** · `git diff --check`
**PASS** · yasaklı kapsam grep temiz (candidateLimit/ts_rank/supabase/textSearch/rpc/tenant/… yalnız
JSDoc "Kapsam dışı" yorumunda; `any`/`as any` yok).

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. Saf/DB'siz; SQL/migration yok. `package.json`/lockfile değişmez.

### Push / durum
`origin/main` (`95efcab`) değişmedi. Feature branch `work/yh-s2-17` yalnız yerelde: kapanış docs
commit'i (bu tur) + feature kod `1ab8601` + sync merge'ler (`4f743c1`, `46fd460`) + açılış docs
`1b8a147`. **Push YAPILMADI; PR AÇILMADI; main'e merge EDİLMEDİ.** Push/PR ayrı onayla yapılacak.

### Notlar
Supabase execution çağrısı (S2.18) `.textSearch("search_tsv", plan.tsquery, { config: "simple" })`
olacak — `type` **verilmez** (kurulu `postgrest-js@2.105.3`'te `type` omit → `fts` = `to_tsquery`;
`type:'tsquery'` literali yok). S2.17 yalnız `plan.tsquery` string'ini üretir.

---

## 2026-07-20 — S2.16 PR #11 ile main'e merge edildi; S2.17 (search_tsv Query / tsquery Plan) Açıldı

### Tarih
2026-07-20

### Karar
Yaşam Hafızası **S2.16 — Dictionary Expansion, PR #11 ile `origin/main`'e merge edildi** (kod
`2192f74` `feat(yasam-hafizasi): add S2.16 dictionary expansion`; PR #11 merge `dc94b98`; güncel
`origin/main` = `dc94b98` bu kodu içerir). Ayrıca **S2.17 — search_tsv Query (tsquery Plan)**
aktif aşama olarak **açıldı** (`work/yh-s2-17`, taban güncel `origin/main` = `dc94b98`). Bu turda
yalnız izole worktree + açılış karar kilidi + yerel Supabase API doğrulaması hazırlandı; **kod
yazılmadı**, `tsQueryPlan.ts`/harness **oluşturulmadı**; yalnız açılış docs commit'i yapıldı (push/PR yok).

> **Not (doküman gecikmesi düzeltmesi):** S2.16 kodu main'e merge edilmiş olmasına rağmen S2.16
> turunda ayrı "close S2.16" docs commit'i yazılmamıştı; bu S2.17 açılış kaydı S2.16'yı
> **tamamlanmış-main** gerçeğiyle (PR #11 / `2192f74` / `dc94b98`) kayda alır.

### Neden
Retrieval boru hattının [3] adımı: Concept Set (S2.15) + Dictionary Expansion (S2.16) çıktısını
(`readonly Concept[]`) PostgreSQL full-text search için **güvenli, deterministik tsquery planına**
çevirmek (kaynak `04-phase-2-fast-search.md` §3). DB çalıştırma bilinçli olarak **sonraki faza**
bırakıldı (saf-birim disiplini, S2.14/15/16 ile aynı).

### S2.17 kilitli sözleşme (kod öncesi, kullanıcı onaylı)
- **Fonksiyon:** `buildTsQueryPlan(concepts: readonly Concept[]): TsQueryPlan` (yeni `lib/yasam-hafizasi/search/tsQueryPlan.ts`). İmza küçük; parametre `unknown` **yapılmaz** (`any`/TS-bypass yok); yalnız dizi-içi bozuk öğeye karşı fail-safe.
- **Tipler:** `TsQueryClause { term; origin; kind: "prefix"|"phrase"; fragment }` · `TsQueryPlan { config:"simple"; column:"search_tsv"; clauses; tsquery; isEmpty }`.
- **KARAR 1 — phrase prefix:** Tek kelime → `term:*`; çok kelime → exact phrase `(t1 <-> t2)`, **phrase'e prefix UYGULANMAZ** (§3 prefix'i yalnız tek kelime için tanımlar; icat yok).
- **KARAR 2 — candidate limit:** `YH_CANDIDATE_LIMIT` plana **dahil değildir**; `buildTsQueryPlan` okumaz, `config.ts` bu amaçla import edilmez, harness'te test edilmez. Yalnız DB sorgusu sonrası aday sayısını sınırlar → execution/adapter katmanı.
- **Clause'lar `|` (OR) ile birleşir; config `simple`** (DB trigger `to_tsvector('simple', unaccent)` ile simetrik).
- **Query güvenliği:** Ham girdi doğrudan eklenmez; her lexeme S2.17'de `^[a-z0-9]+$` allowlist'inden yeniden geçer; yalnız doğrulanmış lexeme'ler kod-sabit operatörlerle (`:* <-> | ( )`) serialize edilir; operatörler kullanıcıdan gelmez; geçersiz lexeme/clause fail-safe atlanır; tsquery string'i SQL metnine **interpolate edilmez** (PostgREST param değeri).
- **Boş:** geçerli clause yok → `isEmpty:true`, `tsquery:""`; boş/geçersiz tsquery DB'ye gönderilmez (kararı pipeline verir).
- **`ts_rank` plana dahil değil** (sıralama execution/S2.20).
- **Dedup:** yeni semantik dedup icat edilmez (S2.15/S2.16 term-dedup garantisi); yalnız serializer düzeyinde aynı güvenli fragment tekrarı önlenir (ilk görünüm/giriş sırası/`origin` korunur; query/synonym önceliği yeniden uygulanmaz).
- **Immutability:** plan + clauses + her clause `Object.freeze`; her çağrı taze.
- **Kapsam dışı:** DB execution/adapter · RPC · `ts_rank`/aday tavan · tenant/visibility · Stone Exclusion · Evidence Gate · Ranking · Retrieval Pipeline · Search UI · migration/config değişikliği. `types.ts`/`config.ts`/`normalize.ts`/`conceptSet.ts`/`dictionaryExpansion.ts` **değişmez**.

### Supabase textSearch API doğrulaması (yerel kurulu paket tipiyle KANITLANDI)
Kurulu `@supabase/postgrest-js@2.105.3` (`@supabase/supabase-js@2.105.3`; lockfile eşleşti) kaynak
tipi `src/PostgrestFilterBuilder.ts`:
`textSearch(column, query, { config?: string; type?: 'plain' | 'phrase' | 'websearch' })`.
Implementasyon: `type` omit → `typePart=''` → operatör **`fts` = `to_tsquery`** (OR/prefix/phrase
tam desteği); `config` → `fts(<config>).<query>`. **`type: 'tsquery'` literali YOKTUR** (bu sürümde
geçersiz). → Execution fazı `.textSearch("search_tsv", plan.tsquery, { config: "simple" })` (type
**verilmeden**) kullanır. Bu, ilk analizdeki `type:'tsquery'` önerisini **düzeltir**.

### Etkilenen Dosyalar (bu açılış turu — yalnız docs)
- `docs/ai/CURRENT_TASK.md` · `docs/ai/PROJECT_STATUS.md` · `docs/ai/CHANGELOG_AI.md` · `docs/ai/ROADMAP.md`
- Planlanan (kod turu, bu turda OLUŞTURULMADI): `lib/yasam-hafizasi/search/tsQueryPlan.ts` · `scripts/yh-tsquery-plan-harness.ts`.

### Breaking Change (Evet/Hayır)
Hayır. Saf/additif yeni birim; mevcut tipler/dosyalar değişmez.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. Saf/DB'siz; SQL/migration yok. `package.json`/lockfile değişmez.

### Doğrulamalar
Bu açılış turunda kod/harness/tsc/eslint çalıştırılmadı (docs + salt-okunur API doğrulaması). Kod
turu planı: yeni `yh-tsquery-plan-harness` + S2.16/15/14 regresyon + `tsc --noEmit` + hedefli ESLint
+ güvenlik/kapsam grep + `git diff --check`.

### Push / durum
`origin/main` (`dc94b98`) değişmedi; açılış docs `work/yh-s2-17`'de **commit edildi** (push/PR yok).
Sonraki faz (DB execution/adapter + `ts_rank`/aday tavan) **otomatik açılmaz**.

### Notlar
Supabase `type:'tsquery'` literali kurulu sürümde bulunmadığı için doğru çağrı `type`'ı omit
etmektir (→ `fts` → `to_tsquery`). Güvenlik tümüyle S2.14 normalize garantisi + S2.17 per-lexeme
re-assert'e dayanır (upstream'e körü körüne güven yok).

---

## 2026-07-20 — S2.15 PR #8 ile main'e merge edildi; S2.16 (Dictionary Expansion) Açıldı

### Tarih
2026-07-20

### Karar
Yaşam Hafızası **S2.15 — Kavram Kümesi (Concept Set), PR #8 ile `origin/main`'e merge edildi**
(kod `f56ec60` `feat(yasam-hafizasi): add S2.15 concept set`; PR #8 merge `404841b`; güncel
`origin/main` = `77aa824` bu kodu içerir). Ayrıca **S2.16 — Dictionary Expansion (Sözlük /
Eş-Anlam Genişletme)** aktif aşama olarak **açıldı** (`work/yh-s2-16`, taban güncel
`origin/main` = `77aa824`). Bu turda yalnız izole worktree + açılış karar kilidi hazırlandı;
**kod yazılmadı**, `dictionaryExpansion.ts`/harness **oluşturulmadı**; yalnız açılış docs
commit'i yapıldı (push/PR yok).

> **Not (doküman gecikmesi düzeltmesi):** S2.15 kodu main'e merge edilmiş olmasına rağmen
> S2.15 turunda ayrı bir "close S2.15" docs commit'i yazılmamıştı; bu S2.16 açılış kaydı,
> S2.15'i **tamamlanmış-main** gerçeğiyle (PR #8 / `f56ec60` / `404841b`) kayda alır.

### Neden
Retrieval boru hattının [2] adımının **sözlük/synonym kısmı** (S2.15 Concept Set = [2] taban/
query kısmıydı). Kilitli backlog: Dictionary Expansion → search_tsv → Stone Exclusion Adapter →
Evidence Gate → Ranking → Retrieval Pipeline → Search UI. S2.16, S2.15 çıktısını **additif**
genişletir (Additivite değişmezi: sözlük yoksa S2.15 çıktısı tek başına çalışır).

### S2.16 kilitli sözleşme (kod öncesi, kullanıcı onaylı)
- **Fonksiyon:** `expandConcepts(base: readonly Concept[], normalizedText: string, entries: readonly DictionaryEntry[]): readonly Concept[]` (yeni `lib/yasam-hafizasi/search/dictionaryExpansion.ts`).
- **Giriş modeli:** `interface DictionaryEntry { canonical: string; synonyms: readonly string[] }` (minimal; `is_active`/`tenant_id`/`lang` YOK → adapter/S2.17 işi).
- **Saf/deterministik/DB'siz/fail-safe;** `buildConceptSet` (S2.15) **değişmez**.
- **Sıra:** `[değişmez query prefix]` + `[synonym suffix]`; sort YOK; entries verilen sırayla; entry içinde canonical → `synonyms[]` sırası.
- **Dedup** yalnız normalize `term`; ilk-görülen korunur; query synonym'i bastırır. Genişletici **yalnız `origin:"synonym"`** üretir; `canonical` = normalize entry canonical (yeni canonical'da `canonical=self`).
- **Çok kelime:** substring DEĞİL → normalize token dizisinde **bitişik alt-dizi** eşleşmesi (`"anne" ⊄ "anneanne"`; `"anne sutu"` tek phrase Concept).
- **Tek-sıçrama:** yalnız base/query tetikler; eklenen synonym yeniden lookup edilmez; **transitif yok** (A→B→A döngüsü tasarım gereği yok).
- **Immutability:** çıktı + yeni Concept `Object.freeze`; base/entries mutasyonsuz.
- **Tavan YOK:** kavram/synonym tavanı S2.16'da yok. `YH_CANDIDATE_LIMIT=150` yalnız **aday kayıt** limitidir; Concept/tsquery boyutu limiti **değildir** (tsquery-boyut korkuluğu S2.17).
- **Kapsam dışı:** `DictionaryPort` · gerçek Supabase adapter · tenant/global merge · `lang`/`is_active` filtreleri · snapshot DB sıralaması · `search_tsv`/tsquery · Evidence Gate · Ranking · retrieval wiring · Search UI. `types.ts`/`config.ts`/`normalize.ts`/`conceptSet.ts` **değişmez** (yeni config sabiti yok).

### Etkilenen Dosyalar (bu açılış turu — yalnız docs)
- `docs/ai/CURRENT_TASK.md` · `docs/ai/PROJECT_STATUS.md` · `docs/ai/CHANGELOG_AI.md` · `docs/ai/ROADMAP.md`
- Planlanan (kod turu, bu turda OLUŞTURULMADI): `lib/yasam-hafizasi/search/dictionaryExpansion.ts` · `scripts/yh-dictionary-expansion-harness.ts`.

### Breaking Change (Evet/Hayır)
Hayır. Additif genişletme; `Concept` tipi (S2.01) `origin` union + opsiyonel `canonical` ile bunu zaten öngörüyor (tip değişmez).

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. Saf/DB'siz; SQL/migration yok. `package.json`/lockfile değişmez.

### Doğrulamalar
Bu açılış turunda kod/harness/tsc/eslint çalıştırılmadı (docs-only). Kod turu doğrulama planı:
yeni `yh-dictionary-expansion-harness` + S2.15/S2.14 regresyon harness'leri + `tsc --noEmit` +
hedefli ESLint + güvenlik/kapsam grep + `git diff --check`.

### Push / durum
`origin/main` (`77aa824`) değişmedi; açılış docs `work/yh-s2-16`'da **commit edildi** (push/PR
yok). Sonraki S2.17 (tsquery / dictionary adapter / tenant-global merge) **otomatik açılmaz**.

### Notlar
S2.16 çekirdeği bir lookup fonksiyonu **invoke etmez** (`entries` verisini doğrudan alır);
bu yüzden S2.13'teki `StoneExclusionPort` desenine karşılık **`DictionaryPort` eklenmez** (YAGNI).
Gerçek veri erişimi (service_role query + tenant/global merge + `is_active`/`lang` filtresi +
deterministik snapshot sıralaması) S2.17'ye aittir.

---

## 2026-07-19 — S2.14 PR #6 ile main'e merge edildi; S2.15 (Kavram Kümesi / Concept Set) Açıldı

### Tarih
2026-07-19

### Karar
Yaşam Hafızası **S2.14 — Retrieval Türkçe Metin Normalizasyonu, PR #6 ile `origin/main`'e
merge edildi** (kod `dd29167` production'da). Ayrıca **S2.15 — Kavram Kümesi (Concept Set)**
aktif aşama olarak **açıldı** (`work/yh-s2-15`, taban güncel `origin/main` = `f72b01b`).
Bu turda yalnız izole worktree + açılış karar kilidi hazırlandı; **kod yazılmadı**,
`conceptSet.ts`/harness **oluşturulmadı**, **commit/push yapılmadı** (açılış docs yerelde,
uncommitted).

### Neden
Retrieval boru hattının [2] adımının **taban/query kısmı**. Kilitli backlog: Concept Set →
Dictionary Expansion → search_tsv → Stone Exclusion Adapter → Evidence Gate → Ranking →
Retrieval Pipeline → Search UI. Evidence Gate'in Concept Set'ten önce yapılması
(erken-sözleşme/rework riski) değerlendirildi ve **reddedildi**; backlog sırası korundu
(Concept Set önce → Concept sözleşmesini kilitler).

### S2.15 kilitli sözleşme (kod öncesi, kullanıcı onaylı)
- **Fonksiyon:** `buildConceptSet(input: unknown): readonly Concept[]` (yeni `lib/yasam-hafizasi/search/conceptSet.ts`).
- **Model:** `normalizeSearchText(input).tokens` → her token `{ term, origin: "query" }`.
- **Phrase Concept YOK** (tokens-only; çok-kelime kavramları Dictionary Expansion/S2.16).
- **Dictionary seam YOK** (Seçenek A — S2.16'da additif; synonym üretimi yok).
- **Dedup** anahtar `term`, ilk-görülme sırası korunur, sort yok. **canonical** omit. **origin** daima `"query"`.
- **Fail-safe:** non-string/boş/yalnız-işaret → boş dizi; asla throw. Çıktı dizisi + her Concept `Object.freeze`.
- **Filtre YOK:** stop-word/kısa-token/rakam elemesi kapsam dışı (gate/tsquery işi).
- **Kapsam dışı:** Dictionary Expansion · search_tsv · Evidence Gate · Ranking · retrieval wiring · DB/SQL/API/AI. `types.ts`/`config.ts`/`normalize.ts` değişmez.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. Saf/DB'siz; SQL/migration yok. `package.json`/lockfile değişmez.

### Doğrulamalar
Bu açılış turunda kod/harness/tsc/eslint çalıştırılmadı (docs-only, commit yok). Kod turu
doğrulama planı: yeni `yh-concept-set-harness` + 10 regresyon harness + `tsc --noEmit` +
hedefli ESLint + güvenlik grep.

### Push / durum
`origin/main` (`f72b01b`) değişmedi; açılış docs yerelde (`work/yh-s2-15`), **uncommitted**;
push yapılmadı; PR açılmadı. Sonraki S2.16 (Dictionary Expansion) **otomatik açılmaz**.

### Notlar
Bu kayıt hem S2.14'ün main'e MERGE'ini (PR #6) hem S2.15'in AÇILIŞINI belgeler; aynı
tarihli aşağıdaki "S2.14 … Tamamlandı" kaydı, S2.14 kodunun tamamlanma anına ait tarihsel
kayıttır (silinmedi).

---

## 2026-07-19 — S2.14 (Retrieval Türkçe Metin Normalizasyonu) Tamamlandı; lexical sözleşme canlı DB SELECT ile doğrulandı

### Tarih
2026-07-19

### Karar
Yaşam Hafızası **S2.14 — Retrieval Türkçe Metin Normalizasyonu tamamlandı** ve
`origin/work/yh-s2-14`'e push edildi. Sorgu ve indeks metnine SİMETRİK uygulanan saf,
deterministik, fail-safe, locale-bağımsız, mutasyonsuz Türkçe normalize + tokenizasyon
birimi. Kod commit **`dd29167`** (`feat(yasam-hafizasi): add S2.14 retrieval text
normalize`; parent `596d21e`); branch güncel `origin/main` (`91bcbab`) ile senkron
(sync merge `ad03579`).

### Teslim edilen dosyalar
- `lib/yasam-hafizasi/search/normalize.ts` — `normalizeSearchText(input: unknown):
  NormalizedSearchText`; çıktı `{ normalizedText, tokens }`. **Tam saf (hiç import yok)**;
  `toLocaleLowerCase` KULLANILMAZ (locale-bağımsız); string-olmayan/boş/işaret-only girdi
  → `{ "", [] }` (fail-safe, hiçbir girdide throw yok); `Object.freeze` ile mutasyonsuz;
  deterministik.
- `scripts/yh-normalize-harness.ts` — izole, DB'siz harness (83 assertion; production DB
  simetri fixture regression guard).

### Normalize sözleşmesi (kilitli)
NFD → Türkçe/Latin fold (I/İ/ı/i→i · Ç/ç→c · Ğ/ğ→g · Ö/ö→o · Ş/ş→s · Ü/ü→u · Â/â→a ·
Î/î→i · Û/û→u) → combining-mark strip → generic `toLowerCase()` → noktalama/tire/
altçizgi/sembol→boşluk → çoklu whitespace→tek → trim → whitespace tokenize. **Stop-list /
stemmer / concept-set / dictionary / dedupe / sort YOK** (bunlar sonraki S2.x). DB/IO/
AI/fetch/env/SQL YOK.

### Lexical sözleşme — canlı production Supabase salt-okunur SELECT ile DOĞRULANDI
İndeks tarafı `to_tsvector('simple', yh_immutable_unaccent(text))` (unaccent → generic
lowercase). Teyit edilen query–index simetrisi: `IŞIK/Işık/ışık → isik` · `İĞNE/İğne/igne
→ igne` · `ŞİFA → sifa` · `ÇAKRA → cakra` · `GÖĞÜS → gogus` · `BÜTÜN → butun`. **Kritik
açık nokta kapandı: `ı → i`, `ışık → isik`.** App normalize DB ile birebir aynı nihai
token'ı üretir. Bu eşleşmeler harness'te production-teyitli regression fixture olarak
sabitlendi.

### Neden
Retrieval boru hattının ([1] normalize) ilk halkası; [2] sözlük, [3] tsquery ve [4]
Kanıt Kapısı'nın ortak ön koşulu. Türkçe I/İ/ı/i belirsizliği (JS `İ.toLowerCase()` →
`i` + U+0307 combining-dot; tr-locale bağımlılığı) fold-önce-generic-lowercase (DB-ayna)
stratejisiyle çözüldü; combining-dot ve locale bağımlılığı elendi.

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. Saf/DB'siz; SQL/migration/DDL yok. `package.json`/lockfile değişmedi.

### Doğrulamalar
- `yh-normalize-harness` → **EXIT 0, 83/83**.
- 9 regresyon harness → **EXIT 0** (extract-fields · build-candidate · run-index-unit ·
  run-source · index-write-plan · **supabase-adapters 37** · admin-route 65 ·
  **index-smoke 41** · **visibility 49**).
- `npx tsc --noEmit` → **EXIT 0** (harness'te ES2020-altı BigInt-literal → `BigInt()`
  ile düzeltildi). Hedefli ESLint (2 S2.14 dosyası) → **0 error, 0 warning**. Güvenlik
  grep temiz. `git diff --check` temiz.

### Push / durum
`origin/work/yh-s2-14` = `ad03579` (kod `dd29167` + sync merge); local/remote **0/0**;
`origin/main` (`91bcbab`) **değişmedi**; **PR açılmadı**. Sonraki S2.x **otomatik açılmaz**
(yeni salt-okunur analiz turu + kullanıcı onayı gerekir).

### Notlar
Bu kayıt S2.14 kodunun TAMAMLANMASINI belgeler; aynı tarihli aşağıdaki "S2.14 ... Açıldı"
kaydı, S2.14'ün AÇILDIĞI ana ait tarihsel kayıttır (silinmedi).

---

## 2026-07-19 — S2.13 PR #4 ile main'e merge edildi; S2.14 (Retrieval Türkçe Metin Normalizasyonu) Açıldı

### Tarih
2026-07-19

### Karar
Yaşam Hafızası **S2.13 — Retrieval Görünürlük Kararı, PR #4 ile `origin/main`'e merge
edildi** ("Create a merge commit"; merge commit **`4c672e9`**, ebeveynler `c412334`
[alakasız paralel REPORT-ALL-WORD-C1 oturumu] + `608f576` [S2.13 kapanış docs]). Kaynak
zincir korundu (`03112f3` · `fec4c69` · `e3b4e73` · `608f576`); PR #4 net katkısı 6 YH
dosyası (+751/−59); package/lock/migration/SQL yok.

Ayrıca **S2.14 — Retrieval Türkçe Metin Normalizasyonu** aktif aşama olarak **açıldı**
(`work/yh-s2-14`, taban güncel `origin/main` = `4c672e9`). Bu docs turunda **kod
yazılmadı**; `normalize.ts` ve harness henüz oluşturulmadı.

### Neden
S2.13 [3]'ün görünürlük yüklemini tamamladı; retrieval boru hattının (`04-phase-2-fast-search.md`)
**[1] Türkçe Normalize** adımı henüz yok. Normalize, [2] sözlük genişletme, [3] tsquery
ve [4] Kanıt Kapısı'nın ortak ön koşuludur; saf/deterministik/DB'siz olduğundan mevcut
test-ortamı engelini (non-prod Supabase yok) aşarak güvenle ilerletilebilir.

### S2.14 kilitli kararlar (kod öncesi)
- **A1** — Kapsam: saf/deterministik Türkçe retrieval metin normalizasyonu.
- **A2** — Stop-list/gürültü elemesi **kapsam dışı** (sonraki sözlük/concept-set aşamasına).
- **A3** — Çıktı: `{ normalizedText: string; tokens: string[] }`.
- **A4** — Tipler `normalize.ts` içinde lokal/exported; **`search/types.ts` değişmez**.
- **A5** — SQL/migration/Supabase adapter/API/retrieval wiring/Kanıt Kapısı/concept-set/derece/"Neden?" **kapsam dışı**.
- **A6** — `package.json`/lockfile değişmez. **A7** — AI yok. **A8** — IO/DB/fetch/env/service_role yok. **A9** — saf/mutasyonsuz/deterministik. **A10** — boş/whitespace/yalnız-işaret girdi → fail-safe `{ "", [] }`.
- **A11** — I/İ/ı/i + diyakritik dönüşümü **tahminle belirlenmez**; kod-öncesi lexical sözleşme (`§1` + `20260712…_lexical_infra.sql` + canlı `unaccent`/text-search config) salt-okunur doğrulanır; çelişkide DUR.

### Lexical sözleşme ön-doğrulaması (bu turda salt-okunur)
DB tarafı `to_tsvector('simple', yh_immutable_unaccent(text))`. Migration notu: "App
normalize ASIL kaynaktır; DB unaccent DESTEKLEYİCİ/yedek (simetri)." Örnek:
`yh_immutable_unaccent('İğne Şifa Çakra') → 'Igne Sifa Cakra'` → `simple` küçük harf →
`igne sifa cakra`. Doküman §1 iki-adımlı sözleşmesi izlendiğinde dört i-varyantı (I, İ,
ı, i) her iki tarafta **`i`**'ye yakınsıyor → **bloklayıcı çelişki YOK**. Açık: DB
`unaccent`'in lowercase `ı` çıktısı örnekte gösterilmedi → kod turundan önce canlı
PostgREST ile teyit edilecek (tahminle kodlanmayacak).

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. S2.14 saf/DB'siz; migration/SQL/DDL yok.

### Doğrulamalar
Bu docs turunda kod/harness/tsc/eslint çalıştırılmadı (docs-only). Kod turu doğrulama
planı: yeni `yh-normalize-harness` + 9 regresyon harness + `tsc --noEmit` + hedefli
ESLint + güvenlik grep.

### Push / durum
`origin/main` (`4c672e9`) değişmedi; bu S2.14 açılış commit'i yerel (`work/yh-s2-14`);
push yapılmadı; PR açılmadı.

### Notlar
Bu kayıt hem S2.13'ün main'e MERGE'ini hem S2.14'ün AÇILIŞINI belgeler; aynı tarihli
aşağıdaki "S2.13 Tamamlandı ve remote branch'e push edildi" kaydı, S2.13 kodunun
tamamlanma anına ait tarihsel kayıttır (silinmedi).

---

## 2026-07-19 — S2.13 (Retrieval Görünürlük Kararı) Tamamlandı ve remote branch'e push edildi

### Tarih
2026-07-19

### Karar
Yaşam Hafızası **S2.13 — Retrieval Görünürlük Kararı tamamlandı** ve
`origin/work/yh-s2-13` çalışma branch'ine push edildi. Bir retrieval adayının
güvenilir server-side session scope altında görünür olup olmadığını **saf +
deterministik + DB'siz + dependency-injection + fail-closed** biçimde belirleyen
görünürlük karar birimi. Kod commit **`e3b4e73f2c82b6eb10b9c5e630370b652e29adb8`**
(`feat(yasam-hafizasi): add S2.13 retrieval visibility scope`; parent `fec4c69`).

### Teslim edilen dosyalar
- `lib/yasam-hafizasi/search/visibilityScope.ts` — `evaluateVisibility` + tipler
  (`VisibilityCandidate`/`VisibilityContext`/`StoneExclusionPort`/`VisibilityDecision`/
  `VisibilityReasonCode`); kapalı reason-code union.
- `scripts/yh-visibility-scope-harness.ts` — izole, DB'siz harness.

### Görünürlük kuralları (uygulanan öncelik)
session tenant geçerliliği → candidate tenant biçim geçerliliği → PII dışlama
(`is_client_pii` yalnız kesin false) → demo tenant/source dışlama → tenant/shared
görünürlüğü (`tenant_id = session` VEYA `null` + kesin `allowShared === true`) →
stone exclusion → görünür. Stone exclusion **enjekte port** ile; YALNIZ doğal taş
(`dogaltas`) adayında ve tenant/PII/demo geçildikten sonra çağrılır; farklı tenant /
PII / demo / eksik stabil kimlikte çağrılmaz; **port throw/reject/non-boolean →
fail-closed**. Tenant yalnız server-side session'dan; birim HTTP/body/query/cookie/
header/env OKUMAZ. Reason-code kapalı union; ham tenant/stone kimliği veya hata
mesajı içermez. Deterministik; girdi mutasyonu ve global durum yok.

### Mimari
Saf + DI tabanlı. **Gerçek Supabase / DB implementasyonu YOK** — `StoneExclusionPort`
yalnız sözleşme; gerçek adapter sonraki S2.x'e aittir. `tenantScope.ts` / `config.ts` /
`search/types.ts` **değiştirilmedi** (yalnız 2 yeni dosya).

### Migration Gerektiriyor mu? (Evet/Hayır)
Hayır. Migration/SQL/DDL yok. DB erişimi yok.

### Doğrulamalar
- `yh-visibility-scope-harness` → **EXIT 0, 49/49**.
- Sekiz regresyon harness → **EXIT 0** (dahil `yh-index-smoke` **41/41**).
- `npx tsc --noEmit` → **EXIT 0**. Hedefli ESLint (2 S2.13 dosyası) → **0 error, 0 warning**.
- Güvenlik grep'leri temiz; `git diff --check` temiz.

### Push / durum
- `origin/work/yh-s2-13` = `e3b4e73` (fast-forward `fec4c69..e3b4e73`); local/remote **0/0**.
- `origin/main` (`e4580eb`) **değişmedi**; **PR açılmadı**.

### Kapsam dışı (sonraki S2.x — korunur)
Gerçek Supabase stone-exclusion adapter'ı · `search_tsv` sorgu · retrieval adapter ·
ranking · Kanıt Kapısı · derece · "Neden gösterildi?" · gerçek DB smoke · indeks DDL ·
SQL/migration · Admin UI · production write · PII indeks. Sonraki S2.x aşaması ayrı
analiz ve kullanıcı onayıyla belirlenecektir.

### Notlar
Bu kayıt, S2.13 KODUNUN tamamlanmasını belgeler; aynı tarihli aşağıdaki
"S2.13 Açıldı" kaydı, S2.13'ün AÇILDIĞI ana ait tarihsel kayıttır (silinmedi).

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
