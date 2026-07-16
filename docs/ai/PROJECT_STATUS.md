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

**Son güncelleme:** 2026-07-14

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

- **Yaşam Hafızası™ — Sprint 2 (Retrieval / Hızlı Tarama):** S2.01–S2.04 origin/main'de; **S2.05 tamamlandı** — `work/yh-s2-05` (`b5d726f`), push edildi ve **PR #1 açık** (base `main` ← compare `integration/yh-s2-05`, merge commit `d57657f`; henüz merge edilmedi). Aktif: **S2.07 (İndeks-Birimi Builder) — UYGULANIYOR** (`work/yh-s2-07`, taban `67fa6fb`; henüz commit yok).

## Son Tamamlanan Aşama

- Yaşam Hafızası **S2.05 — JSONB Alan Çıkarımı** (saf builder, fail-safe) **tamamlandı**; `work/yh-s2-05` branch'inde commit `b5d726f`. Çıktı: `row → EvidenceField[] / topicTags string[] / ExpertRelation[]`.
- **Kabul kriterleri geçti:** izole harness `npx tsx` EXIT 0 (22 matris + 6 kanonik + R1–R9 regresyon); kapsam-izole tsc EXIT 0; tüm-proje `tsc --noEmit` EXIT 0.
- Not: S2.05 henüz `origin/main`'de **değil** (yalnız `work/yh-s2-05`). S2.04 (`6578ec5`) origin/main'de.

## Son Commit

- `b5d726f` — Yaşam Hafızası **S2.05 (field extraction)** — `work/yh-s2-05` (henüz push edilmedi).
- Doküman altyapısı: `65258bf` (docs/ai, aynı branch). S2.05 tabanı: `6578ec5` (S2.04) → `origin/main` (`6dd3805`).
- İlgili yakın Yaşam Hafızası commit'leri: `b3396d9` (S2.03) · `0882fa4` (S2.01).

## Son Push

- S2.05 (`b5d726f`) + doküman (`65258bf`) `origin/work/yh-s2-05`'e **push edildi**; ayrıca `origin/integration/yh-s2-05` (`d57657f`, S2.05'in güncel main tabanına merge'ü) push edildi ve **PR #1** açıldı (açık, merge edilmedi). `origin/main` = `eb08ae1` (Danışan Performansı `perf(clients)`; YH'ye dokunmuyor).
- S2.07 (`work/yh-s2-07`) **henüz push edilmedi** (kod/docs commit edilmedi).

## Son Doğrulanan Production Commit

- **Doğrulanmadı.** (Production ile eşleşen commit bu oturumda doğrulanmadı.)

## Son Doğrulanan Production Deploy

- **Doğrulanmadı.** (Deploy ortamı/tarihi bu oturumda doğrulanmadı.)

## Son Başarılı Smoke Test

- **Doğrulanmadı.** (Bu oturumda smoke test çalıştırılmadı.)

## Devam Eden İş

- **Aktif: S2.07 (İndeks-Birimi Builder) — UYGULANIYOR** (`work/yh-s2-07`). `buildCandidate.ts` (`BuiltIndexUnit`/`buildIndexUnit`, saf + fail-safe, `node:crypto` SHA-256 content_hash) + izole harness yazılıyor. Doğrulamalar (yeni harness + S2.05 regresyon + izole/tam TSC) koşulmadan **tamamlandı/PASS denmeyecek**; henüz commit yok. Not: ROADMAP'te **S2.06 yoktur**; S2.05'ten doğrudan S2.07.
- **Onay bekleyen:** S2.07 iki path-scoped commit (docs + kod) + push; S2.05 için **PR #1 merge** (açık).

## Bekleyen İşler

- Yaşam Hafızası **S2.07** (Evidence builder) → S2.08 (Runner + ParentTenantLookup) → S2.13 (görünürlük) → Kanıt Kapısı/derece/"Neden?"/INV harness (Sprint 2 kalan).
- S2.05 branch'i (`work/yh-s2-05`) için push + main entegrasyonu.
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
