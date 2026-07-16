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

**Son güncelleme:** 2026-07-16

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

- **Yaşam Hafızası™ — Sprint 2 (Retrieval / Hızlı Tarama):** S2.01–S2.04 + **S2.05** + **S2.07 origin/main'de** (`2b19743`). S2.05 **PR #1 merge edildi** (merge commit `cd9c77c`); S2.07 **PR #2 merge edildi** (merge commit `2b19743`). Aktif: **S2.08 (Runner + ParentTenantLookup) — AÇILDI, kod henüz yok** (`work/yh-s2-08`, taban `2b19743`).

## Son Tamamlanan Aşama

- Yaşam Hafızası **S2.07 — İndeks-Birimi Builder** (saf + deterministik + fail-safe) **tamamlandı ve main'e merge edildi**. Kod commit'i `380e44f` + docs commit'i `c213b68`; integration `f79ead6`; **PR #2** (`integration/yh-s2-07` → `main`) merge edildi (`merged_at 2026-07-16T18:07:30Z`, merge commit `2b19743`). Yeni dosyalar: `lib/yasam-hafizasi/indexer/buildCandidate.ts` (`BuiltIndexUnit`/`buildIndexUnit`, `node:crypto` SHA-256 content_hash, `${config.sourceKey}:${groupId}` group_key) + `scripts/yh-build-candidate-harness.ts`.
- **Kabul kriterleri geçti (merge sonrası main üzerinde doğrulandı):** S2.07 harness **EXIT 0 (28/28)**; S2.05 regresyon harness **EXIT 0**; tüm-proje `tsc --noEmit -p tsconfig.json` **EXIT 0**; `git diff --check` CLEAN. **AD-004 korundu** — korunan 7 dosya değişmedi.
- Önceki aşama: **S2.05 — JSONB Alan Çıkarımı** (`b5d726f`) main'de (PR #1 merge, `cd9c77c`).

## Son Commit

- `380e44f` — Yaşam Hafızası **S2.07 (index-unit builder)**; docs `c213b68`. Integration merge `f79ead6`; main merge `2b19743`.
- Önceki: `b5d726f` — S2.05 (field extraction); docs altyapısı `65258bf`.

## Son Push

- **S2.07:** `origin/work/yh-s2-07` (`380e44f`) + `origin/integration/yh-s2-07` (`f79ead6`) push edildi; **PR #2 merge edildi** → `origin/main` = **`2b19743`**.
- **S2.05:** `origin/work/yh-s2-05` (`67fa6fb`) + `origin/integration/yh-s2-05` (`d57657f`); **PR #1 merge edildi** → `cd9c77c`.
- **S2.08:** `work/yh-s2-08` yalnız bu docs kapanış/açılış commit'iyle açıldı (kod yok).
- Not: main bu süreçte paralel Danışan Performansı oturumuyla da ilerledi (`8f7d8a1 merge(perf)`, `fc078eb`); YH dosyalarına dokunmadı, korundu.

## Son Doğrulanan Production Commit

- **Doğrulanmadı.** (Production ile eşleşen commit bu oturumda doğrulanmadı.)

## Son Doğrulanan Production Deploy

- **Doğrulanmadı.** (Deploy ortamı/tarihi bu oturumda doğrulanmadı.)

## Son Başarılı Smoke Test

- **Doğrulanmadı.** (Bu oturumda smoke test çalıştırılmadı.)

## Devam Eden İş

- **Aktif: S2.08 (Runner + ParentTenantLookup) — AÇILDI** (`work/yh-s2-08`, taban `2b19743`). Bu aşamada yalnız docs kapanış/açılış yapıldı; **kod henüz yazılmadı**. S2.08 kapsamı: indexer runner + join-mode tenant için `ParentTenantLookup` enjeksiyonu (backfill; DB erişimi enjekte, çekirdek saf kalır). Not: ROADMAP'te **S2.06 yoktur**; S2.05 → S2.07 → S2.08.
- **Onay bekleyen:** S2.08 tasarım kararlarının kilitlenmesi (kod öncesi).

## Bekleyen İşler

- Yaşam Hafızası **S2.08** (Runner + ParentTenantLookup) → S2.13 (görünürlük) → Kanıt Kapısı/derece/"Neden?"/INV harness (Sprint 2 kalan).
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
