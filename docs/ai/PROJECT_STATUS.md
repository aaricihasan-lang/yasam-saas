# PROJE DURUMU (PROJECT STATUS)

> Bu dosya projenin **güncel özet durumunu** tutar. Yeni bir Claude oturumu işe
> başlarken **önce bu dosyayı okur**. Kısa, güncel ve doğru tutulur; ayrıntılı
> karar geçmişi `CHANGELOG_AI.md`'de, aktif görev ise `CURRENT_TASK.md`'dedir.
>
> **Güncelleme kuralı:** Anlamlı bir aşama tamamlandığında veya commit/push
> yapıldığında ilgili alanlar güncellenir. Tarihler **mutlak** yazılır (örn.
> `2026-07-13`), "bugün/dün" gibi göreli ifadeler kullanılmaz.
>
> **Doğrulama notu:** Aşağıdaki alanlarda yalnızca doğrulanmış bilgi vardır.
> Doğrulanamayan alanlar açıkça **"Doğrulanmadı"** olarak işaretlenmiştir; tahmin
> yazılmamıştır.

**Son güncelleme:** 2026-07-19 (S2.14 açılış)

---

## ⚠️ Tutarlılık Kontrolü (CURRENT_TASK.md ile)

Geliştirmeye başlamadan **önce** bu dosya (`PROJECT_STATUS.md`) ile
`CURRENT_TASK.md` **çelişmemelidir**. Örnek çelişkiler: bu dosyadaki "Devam Eden İş"
ile `CURRENT_TASK.md`'deki "Görev"in uyuşmaması, veya "Son Commit"in aktif görevin
varsaydığı temelle tutarsız olması.

**Kural:** İki doküman çelişiyorsa **geliştirmeye başlanmaz**. Önce durum
kullanıcıya bildirilir ve **doğrulama istenir**. Çelişki giderilmeden koda geçilmez.

---

## Proje

**Yaşam SaaS** — Bütüncül/holistik terapistler için çok modüllü bir SaaS uygulaması
(Next.js App Router). Modüller: Kozmik Takvim, Refleksoloji, Doğaltaş, Biyoenerji,
Aromaterapi, Numeroloji, Şifa Rehberi, Human Design, Danışan Yolculuğu, Ürün & Stok,
Dijital İçerik ve merkezi zeka katmanı **Yaşam Hafızası™**.

## Sprint

- **Yaşam Hafızası™ — Sprint 2 (Retrieval / Hızlı Tarama):** S2.01–S2.05 + S2.07 + **S2.08–S2.12 (PR #3, `555030a`)** + **S2.13 (PR #4, `4c672e9`)** origin/main'de. **S2.14 (Retrieval Türkçe Metin Normalizasyonu) AÇILDI** — `work/yh-s2-14` (taban `4c672e9`); **kod henüz YOK**, yalnız docs açılış + karar kilidi. `origin/main` değişmedi; push yapılmadı.

## Son Tamamlanan Aşama

- Yaşam Hafızası **S2.13 — Retrieval Görünürlük Kararı** (saf + deterministik + DB'siz + DI + fail-closed görünürlük karar birimi) **tamamlandı ve main'e merge edildi** (**PR #4**, merge commit `4c672e9`, ebeveynler `c412334` + `608f576`; kod commit `e3b4e73`). Teslim: `lib/yasam-hafizasi/search/visibilityScope.ts` (`evaluateVisibility` + kapalı reason-code union) + `scripts/yh-visibility-scope-harness.ts`. Kurallar: tenant görünürlüğü · açık `allowShared` ile shared · PII dışlama · demo tenant/source dışlama · enjekte stone-exclusion port + port hatasında fail-closed. **Gerçek Supabase/DB implementasyonu YOK** (sonraki S2.x). Doğrulamalar: yeni harness **49/49**, 8 regresyon harness EXIT 0 (`yh-index-smoke` **41/41**), `tsc --noEmit` EXIT 0, hedefli ESLint **0 error/0 warning**, güvenlik grep'leri temiz. PR #4 net katkısı 6 YH dosyası (+751/−59); package/lock/migration/SQL yok.
- Önceki aşama: Yaşam Hafızası **S2.08–S2.12 — İndeksleyici write-side** (runner + source + write plan/adapter + admin route + smoke) **tamamlandı ve main'e merge edildi**. Git akışı: 7 kaynak commit (`8cf503d`→`93ae185`) → entegrasyon merge `fa9adbd` (`work/yh-s2-integration`) → **PR #3** (`work/yh-s2-integration` → `main`, "Create a merge commit") → main **`555030a`** (ebeveynler `0a3e8a4` + `fa9adbd`). **20 YH dosyası, +3580/−67; package/lock/migration/SQL yok; YH-dışı değişiklik yok.**
- **Aşamalar:** S2.08 `runIndexUnit`+`makeParentTenantLookup` (`dd7a022`) · S2.09 `runSource` (`172aa91`) · S2.10 `indexWritePlan`+`supabaseIndexAdapters` (`b8ffc67`) · S2.11 admin index-page route (`e171fa1`) · S2.12A index smoke (`2dc44d3`) · S2.12C exact-owned-record dry-run (`93ae185`).
- **Kabul kriterleri geçti (entegrasyon worktree'sinde doğrulandı):** 8 harness **EXIT 0** (**S2.12 smoke 41/41**); tüm-proje `tsc --noEmit` **EXIT 0**; ESLint YH kapsamı **0 error** (1 eskiden-var warning); güvenlik grep'leri temiz. Production build: derleme + TypeScript **geçti**, `Collecting page data` **ortam değişkeni eksikliği** (`supabaseUrl is required`, YH-dışı hacamat route) nedeniyle durdu — kod hatası değil.
- Önceki aşamalar: **S2.07** (`2b19743`, PR #2) · **S2.05** (`cd9c77c`, PR #1).

## Son Commit

- `4c672e9` — **PR #4 merge** (S2.13 → main; ebeveynler `c412334` + `608f576`). Kaynak zincir korundu: `03112f3` docs-reconcile · `fec4c69` sync-merge · `e3b4e73` S2.13 kod · `608f576` kapanış docs.
- Bu turda: S2.14 açılış docs commit'i (`work/yh-s2-14`, yerel; push yok).
- Önceki: `555030a` — **PR #3 merge** (S2.08–S2.12 → main); `2b19743` — S2.07 main merge; `cd9c77c` — S2.05 main merge.

## Son Push

- **S2.13:** kod commit `e3b4e73` + kapanış docs `608f576` `origin/work/yh-s2-13`'e push edildi; **PR #4 merge edildi** → `origin/main` = **`4c672e9`**.
- **S2.08–S2.12:** `origin/work/yh-s2-integration` (`fa9adbd`) + `origin/work/yh-s2-12` (`93ae185`); **PR #3 merge edildi** → `555030a`.
- **S2.07:** `origin/work/yh-s2-07` (`380e44f`); **PR #2** → `2b19743`. **S2.05:** `origin/work/yh-s2-05` (`67fa6fb`); **PR #1** → `cd9c77c`.
- **S2.14:** `work/yh-s2-14` yalnız bu docs açılış commit'iyle açıldı (kod yok); **push yapılmadı**.

## Son Doğrulanan Production Commit

- **Doğrulanmadı.** (Production ile eşleşen commit bu oturumda doğrulanmadı.)

## Son Doğrulanan Production Deploy

- **Doğrulanmadı.** (Deploy ortamı/tarihi bu oturumda doğrulanmadı.)

## Son Başarılı Smoke Test

- **Doğrulanmadı.** (Bu oturumda smoke test çalıştırılmadı.)

## Devam Eden İş

- **S2.14 (Retrieval Türkçe Metin Normalizasyonu) AÇILDI** (`work/yh-s2-14`, taban `4c672e9`). Bu turda yalnız docs açılış + karar kilidi (A1–A11) + lexical sözleşme ön-doğrulaması yapıldı; **kod henüz yazılmadı**. Kapsam: boru hattı [1] adımı — saf/deterministik Türkçe normalize + tokenizasyon; çıktı `{ normalizedText, tokens }`; tipler `normalize.ts` içinde (`search/types.ts` değişmez); **stop-list kapsam dışı**; SQL/migration/package yok; AI/IO/DB yok. Planlanan: `lib/yasam-hafizasi/search/normalize.ts` + `scripts/yh-normalize-harness.ts`. Not: ROADMAP'te **S2.06 yoktur**; S2.05 → S2.07 → S2.08–S2.12 → S2.13 → S2.14.
- **Onay bekleyen:** kod-öncesi kesin lexical sözleşme doğrulaması (canlı `unaccent` `ı`/`İ`/`I`/`i` teyidi) + kod turu onayı.

## Bekleyen İşler

- Yaşam Hafızası **S2.14** (Türkçe normalize) kod turu → sonraki S2.x: [2] sözlük/concept-set · [3] `search_tsv` sorgu · gerçek Supabase stone-exclusion adapter · [4] Kanıt Kapısı · [5] derece · [6] "Neden?" · INV harness. Sonraki aşama ayrı analiz ve kullanıcı onayıyla belirlenecektir.
- Human Design **FAZ 5/2** (API route).
- Numeroloji QA düzeltmeleri (kritik RLS + hesap/görsel bulguları).
- Dijital İçerik Blok-2/3 + kimliksiz AI uç güvenliği.

## Önemli Mimari Kararlar

Ayrıntılı gerekçeler `ARCHITECTURE_DECISIONS.md`'de. Öne çıkanlar:

- **Kanıt Kapısı (Evidence Gate):** Kanıt yoksa sonuç gösterilmez (INV-1). AI yalnız Kavram Kümesi üretir; kayıt seçmez, cevap yazmaz.
- **PII iki fiziksel indeks:** `yasam_hafizasi_index` (bilgi/kütüphane) ve `yasam_hafizasi_index_PII` (danışan) ayrık; PII harici embedding/AI'ya çıkmaz (INV-PII).
- **Tenant Resolver saf fonksiyon:** DB erişimi enjekte edilir; fail-closed; coercion yok.
- **JSONB ayrıştırma builder katmanına ertelendi:** Kaynak config deklaratif/mantıksız kalır; JSONB çıkarımı S2.05/S2.07 builder'a aittir.

## Tamamlanan Modüller

Proje hafızasına göre kilitli/production-ready (ayrıntı `ROADMAP.md`):

- ✅ Kozmik / Cosmic Calendar (çekirdek + FAZ 2C/3A/3B/3C/4 + konum FAZ 5)
- ✅ Refleksoloji (maintenance mode, final kilit)
- ✅ Doğaltaş (V3 audit FAZ A–B5 + liste perf)
- ✅ Biyoenerji (V3 UX kilitlemeye hazır)
- ✅ Ürün & Stok (K-2/K-3)
- ✅ Danışan Yolculuğu (audit düzeltmeleri)
- ✅ Ayarlar & Güvenlik

> 🟡 Devam eden: Human Design, Aromaterapi, Şifa Rehberi, Dijital İçerik, Numeroloji, Yaşam Hafızası.

## Riskler

- **P0 güvenlik (hafıza kaydı):** `/api/auth/session` parolasız token üretimi (hesap devralma) + zayıf-auth ailesi (cross-tenant PII, ~16 route). *Doğrulama tarihi hafızada; bu oturumda yeniden test edilmedi.*
- **Numeroloji:** kritik RLS breach (cross-tenant PII) — hafıza kaydı, düzeltme bekliyor.
- **Doğaltaş RLS:** stones/minerals DB seviyesinde izole değil (anon key cross-tenant) — fix onaya bağlı.
- **Çoklu oturum:** Paylaşımlı `git index`; `83adab2` karışık-commit dersi (bkz. `CLAUDE_PROTOCOL.md`). Working-tree'de birden çok modülün değişikliği bir arada bulunabilir.
- **DDL kısıtı:** `DATABASE_URL=localhost` çalışmıyor; DDL yalnız Supabase Dashboard SQL Editor'dan.

## Notlar

- Bu, standart Next.js değildir; kod yazmadan önce `node_modules/next/dist/docs/` okunur (bkz. `AGENTS.md`).
- Yaşam Hafızası tasarım dokümanları `docs/yasam-hafizasi/` (12 dosya) — uygulama kararlarının kaynağı.
- Modül durumları proje hafızasından (`MEMORY.md`) türetilmiştir; kritik kilitleme öncesi ilgili modül yeniden doğrulanmalıdır.
