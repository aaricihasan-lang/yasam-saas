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

**Son güncelleme:** 2026-07-19

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

- **Yaşam Hafızası™ — Sprint 2 (Retrieval / Hızlı Tarama):** S2.01–S2.05 + S2.07 + **S2.08–S2.12 origin/main'de** (`555030a`). S2.05 **PR #1** (`cd9c77c`); S2.07 **PR #2** (`2b19743`); **S2.08–S2.12 PR #3** (`555030a`). Aktif: **S2.13 (Retrieval Görünürlük Kararı) — AÇILDI, kod henüz yok** (`work/yh-s2-13`, taban `555030a`).

## Son Tamamlanan Aşama

- Yaşam Hafızası **S2.08–S2.12 — İndeksleyici write-side** (runner + source + write plan/adapter + admin route + smoke) **tamamlandı ve main'e merge edildi**. Git akışı: 7 kaynak commit (`8cf503d`→`93ae185`) → entegrasyon merge `fa9adbd` (`work/yh-s2-integration`) → **PR #3** (`work/yh-s2-integration` → `main`, "Create a merge commit") → main **`555030a`** (ebeveynler `0a3e8a4` + `fa9adbd`). **20 YH dosyası, +3580/−67; package/lock/migration/SQL yok; YH-dışı değişiklik yok.**
- **Aşamalar:** S2.08 `runIndexUnit`+`makeParentTenantLookup` (`dd7a022`) · S2.09 `runSource` (`172aa91`) · S2.10 `indexWritePlan`+`supabaseIndexAdapters` (`b8ffc67`) · S2.11 admin index-page route (`e171fa1`) · S2.12A index smoke (`2dc44d3`) · S2.12C exact-owned-record dry-run (`93ae185`).
- **Kabul kriterleri geçti (entegrasyon worktree'sinde doğrulandı):** 8 harness **EXIT 0** (**S2.12 smoke 41/41**); tüm-proje `tsc --noEmit` **EXIT 0**; ESLint YH kapsamı **0 error** (1 eskiden-var warning); güvenlik grep'leri temiz. Production build: derleme + TypeScript **geçti**, `Collecting page data` **ortam değişkeni eksikliği** (`supabaseUrl is required`, YH-dışı hacamat route) nedeniyle durdu — kod hatası değil.
- Önceki aşamalar: **S2.07** (`2b19743`, PR #2) · **S2.05** (`cd9c77c`, PR #1).

## Son Commit

- `555030a` — **PR #3 merge** (S2.08–S2.12 → main; ebeveynler `0a3e8a4` + `fa9adbd`). Entegrasyon commit `fa9adbd`; S2.12 kaynak HEAD `93ae185`.
- Önceki: `2b19743` — S2.07 (index-unit builder) main merge; `cd9c77c` — S2.05 main merge.

## Son Push

- **S2.08–S2.12:** `origin/work/yh-s2-integration` (`fa9adbd`) + `origin/work/yh-s2-12` (`93ae185`) push edildi; **PR #3 merge edildi** → `origin/main` = **`555030a`**.
- **S2.07:** `origin/work/yh-s2-07` (`380e44f`); **PR #2** → `2b19743`. **S2.05:** `origin/work/yh-s2-05` (`67fa6fb`); **PR #1** → `cd9c77c`.
- **S2.13:** `work/yh-s2-13` yalnız bu docs uzlaştırma/açılış commit'iyle açıldı (kod yok); **push yapılmadı**.

## Son Doğrulanan Production Commit

- **Doğrulanmadı.** (Production ile eşleşen commit bu oturumda doğrulanmadı.)

## Son Doğrulanan Production Deploy

- **Doğrulanmadı.** (Deploy ortamı/tarihi bu oturumda doğrulanmadı.)

## Son Başarılı Smoke Test

- **Doğrulanmadı.** (Bu oturumda smoke test çalıştırılmadı.)

## Devam Eden İş

- **Aktif: S2.13 (Retrieval Görünürlük Kararı) — AÇILDI** (`work/yh-s2-13`, taban `555030a`). Bu turda yalnız docs uzlaştırma/açılış yapıldı; **kod henüz yazılmadı**. S2.13 kapsamı: retrieval adaylarının görünürlük filtresi — session tenant + isteğe bağlı shared + PII dışlama + demo dışlama + tenant'a özgü stone exclusion dışlama; **saf/deterministik/DB'siz**, stone exclusions **enjekte port** (config sabiti değil), fail-closed, harness ile doğrulanacak. Planlanan: `lib/yasam-hafizasi/search/visibilityScope.ts` + `scripts/yh-visibility-scope-harness.ts`; yeniden kullanım `tenantScope.ts`. Not: ROADMAP'te **S2.06 yoktur**; S2.05 → S2.07 → S2.08–S2.12 → S2.13.
- **Onay bekleyen:** S2.13 kod öncesi kullanıcı onayı (kararlar kilitli).

## Bekleyen İşler

- Yaşam Hafızası **S2.13** (Retrieval Görünürlük Kararı) → sonraki S2.x: `search_tsv` sorgu · normalize/sözlük · Kanıt Kapısı · derece · "Neden?" · INV harness (Sprint 2 kalan).
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
