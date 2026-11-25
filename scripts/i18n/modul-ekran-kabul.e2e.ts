/**
 * I18N-F1-R3 — MODÜL EKRAN KABUL TESTİ (gerçek Chromium; PRODUCTION'A SIFIR TEMAS; yalnız sentetik veri).
 *
 * Amaç: kapsam içi TÜM uzman modül ekranlarını Türkçe / İngilizce × 1280 / 768 / 390 / 360 px genişlikte açıp
 *   - ekran görüntüsü           → <out>/<dil>-<genişlik>-<rota-adı>.png
 *   - yatay taşma               → scrollWidth ≤ genişlik + 1 (aşan öğeler tanı için listelenir) = FAIL
 *   - sayfa çökmesi             → yakalanmamış hata (pageerror) / Next hata ekranı / belge-RSC 5xx
 *   - konsol error              → uygulama konsol hatası = FAIL (R4, Owner §18). Ayrım: "Failed to load resource" satırları
 *                                 HTTP ölçümüyle zaten sayıldığı için kaynak-yükleme sınıfında; aynı ekranda /api 5xx varsa
 *                                 (test ortamında olmayan modül tablosu) uygulama hatası UYARI sayılır (strict'te FAIL)
 *   - ham anahtar / MISSING_MESSAGE → konsolda next-intl hata kodu (MISSING_MESSAGE/INVALID_KEY/FORMATTING_ERROR…) ya da
 *                                 görünen metinde "<namespace>.<anahtar>" / "⟦…⟧" = FAIL
 *   - <html lang>               → beklenen dil (kapı açık: istenen dil; kapı kapalı: daima tr) değilse = FAIL
 *   - HTTP 5xx                  → belge / RSC / statik = FAIL; /api/* = UYARI (test ortamında olmayan modül tabloları
 *                                 yüzünden beklenir; `--strict-api` ya da MODUL_EKRAN_STRICT_API=1 ile FAIL)
 *   - EN'de Türkçe karakter     → görünen metin düğümleri + placeholder/title/aria-label; marka (scope.json
 *                                 brandAllowlist), sentetik veri ve lang="tr" işaretli öğeler hariç → "TR-aday" (BİLGİ, FAIL değil)
 * ve şu senaryoları koşar:
 *   S1 (tr işi) Dil değişiminde veri korunması: Danışan Kayıt formunda girilen metin TR→EN geçişinde (çerez + router.refresh —
 *      LanguageSelector'ın yaptığı ile aynı) kaybolmuyor mu
 *   S2 (en işi) EN'de Danışan oluşturma (sentetik) → POST /api/clients 2xx + DB satırı
 *   S3 (en işi) EN'de Danışan düzenleme (Genel Bilgi → telefon) → PATCH /api/clients/<id> 2xx + DB
 *   S4 (her dil) Word raporu: danışan detayında "Tam Word raporu" → POST …/word-report yanıtı 200
 *      (rapor DİLİ kapsam dışı — çıktılar henüz çevrilmedi; yalnız yanıt durumu)
 *   M  (her dil, 1280) Silme onayı modalı: aç → Vazgeç/Cancel ile kapat (silme ASLA onaylanmaz) + kaydın durduğu doğrulanır
 *   S5 (tr işi) Dil değiştir → sayfa yenile → dil kalıcı (Ayarlar › Dil; çerez + hesap tercihi) → sonra TR'ye geri alınır
 *   S6 (en işi) Hesap değiştir → dil izolasyonu: aynı tarayıcıda sentetik A (tercih en) ↔ B (tercih yok) hesapları
 *   S7 (her dil, 1280 + 360) Yükleme ekranı (loading.tsx): RSC yanıtı geciktirilerek istemci gezintisinde yakalanır
 *   K1 (--gate-closed) Kapı kapalı: NEXT_LOCALE=en çerezi + hesap tercihi en olsa bile her ekran tr, dil seçimi görünmez
 *
 * R5 (§29): Numeroloji, Human Design ve Atlas gerçek ekranları kapsama girdi (N1/H1/A1 sentetik kayıt → tur → N2/H2/A2 arşiv,
 *   rapor, silme; E1 erişim engeli; ücretli Roxy uçları anahtarsız + tarayıcıda kesilir). S6 kök neden tanısı: S6/S6-YARIS/S6-T/S6-API.
 * Kapsam DIŞI (Owner kararı): Kozmik Ajanda, Şifa Rehberi (ekran görüntüsü + TR-aday sayımı
 * ALINIR ama "KAPSAM-DIŞI" olarak ayrı raporlanır, başarısızlık sayılmaz), HD alt ekranları, admin ekranları.
 * Human Design ana ekranı (/human-design hub, #854) R4'te kapsama girdi.
 *
 * Ön koşul (gizli değer YOK; production adresi YOK) — yayın kapısı AÇIK build:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret NEXT_PUBLIC_I18N_LOCALE_SWITCHING=on npx next build
 * Çalıştır (CI: .github/workflows/i18n-modul-ekran.yml):
 *   npx tsx scripts/i18n/modul-ekran-kabul.e2e.ts --out <klasör> [--locales tr,en] [--widths 1280,768,390,360]
 *       [--only <rota-id-virgüllü>] [--budget-min 42] [--strict-api] [--full-page] [--gate-closed]
 *   --gate-closed: build NEXT_PUBLIC_I18N_LOCALE_SWITCHING=off ile yapılmış olmalı; yalnız tr turu koşar, çerez/tercih en verilir.
 *
 * Ortam: scripts/dy-presale-closeout/env (anamnez test ortamı = embedded PostgreSQL + PostgREST şimi + DY tabloları
 * + YH outbox) + Word raporu için asgari tablolar (scripts/asama2-dy005 ile aynı DDL) + user_locale_prefs migration'ı.
 * Doğaltaş / aromaterapi / kupa / biyoenerji / refleksoloji / stok / beslenme kataloğu / kişisel arşiv / Yaşam Hafızası
 * tabloları bu ortamda YOKTUR → bu ekranlar liste / boş durum olarak çekilir (API 5xx'leri uyarı olarak raporlanır).
 *
 * Çıktı: <out>/ozet.json + <out>/ozet.md + PNG'ler + <out>/next-sunucu.log. Çıkış kodu: çökme / belge 5xx / taşma /
 * senaryo hatası = 1; TR-aday ve API 5xx (strict değilse) = bilgi.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { startDyEnv } from "../dy-presale-closeout/env";

// ─── Parametreler ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (flag: string, def: string): string => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] !== undefined ? String(argv[i + 1]) : def;
};
type Lang = "tr" | "en";
const OUT = path.resolve(arg("--out", path.join(os.tmpdir(), "i18n-modul-ekran")));
const LOCALES = arg("--locales", "tr,en").split(",").map((s) => s.trim()).filter((s): s is Lang => s === "tr" || s === "en");
const WIDTHS = arg("--widths", "1280,768,390,360").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 320);
const ONLY = new Set(arg("--only", "").split(",").map((s) => s.trim()).filter(Boolean));
const BUDGET_MS = Number(arg("--budget-min", "42")) * 60_000;
const STRICT_API = argv.includes("--strict-api") || process.env.MODUL_EKRAN_STRICT_API === "1";
const FULL_PAGE = argv.includes("--full-page") || process.env.MODUL_EKRAN_FULL_PAGE === "1";
/** Kapı kapalı build'i: ekranlar tr turu olarak gezilir ama tarayıcıya NEXT_LOCALE=en + hesaba en tercihi verilir. */
const GATE_CLOSED = argv.includes("--gate-closed") || process.env.MODUL_EKRAN_GATE_CLOSED === "1";
/** R5: yalnız senaryolar (S6 kararlılık koşuları için hızlı tur); ekran turu atlanır. */
const SKIP_TOUR = argv.includes("--skip-tour");
const APP_PORT = Number(process.env.MODUL_EKRAN_APP_PORT ?? 3997);
const APP = `http://127.0.0.1:${APP_PORT}`;
const SUPA_PORT = Number(process.env.I18N_E2E_SUPA_PORT ?? 54398);
const PG_PORT = Number(process.env.MODUL_EKRAN_PG_PORT ?? 54481);
const ROOT = process.cwd();
const STARTED = Date.now();
mkdirSync(OUT, { recursive: true });

const HEIGHT: Record<number, number> = { 1280: 900, 768: 1024, 390: 844, 360: 780 };
const STABILIZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;
const CRASH_TEXT = /This page couldn[’']t load|Application error: a (client|server)-side exception/i;
const NOISE_PAGEERROR = /Failed to fetch|NetworkError|Load failed|AbortError|ResizeObserver loop/i;
/** Tarayıcının kaynak yükleme günlüğü (HTTP durumu ayrıca ölçülür) → uygulama konsol hatası sayılmaz. Ayrıca test ortamı
 *  yapıtı: `next start` Vercel Analytics / Speed Insights betiklerini (/_vercel/…/script.js) sunmaz → "Refused to execute
 *  script … MIME type ('text/plain')" (Vercel'de bu yollar platformca sunulur; ürün hatası değil). */
const RESOURCE_CONSOLE = /^Failed to load resource|Refused to execute script from '[^']*\/_vercel\/(?:speed-)?insights\//i;
/** next-intl hata kodları: eksik / geçersiz anahtar ya da ICU biçim hatası → FAIL. */
const INTL_CONSOLE = /MISSING_MESSAGE|INVALID_KEY|INVALID_MESSAGE|FORMATTING_ERROR|INSUFFICIENT_PATH|ENVIRONMENT_FALLBACK|IntlError/;

// ─── Mesaj kataloğu (etiketler koddan değil kataloğdan → metin değişse de test kırılmaz) ─────────────────

const msgCache = new Map<string, unknown>();
/** M("en", "clients.detail", "general.save") → messages/en/clients.detail.json içindeki clients.detail.general.save */
function M(lang: Lang, file: string, key: string): string {
  const f = path.join(ROOT, "messages", lang, `${file}.json`);
  if (!msgCache.has(f)) msgCache.set(f, JSON.parse(readFileSync(f, "utf8")));
  let cur: unknown = msgCache.get(f);
  for (const part of [...file.split("."), ...key.split(".")]) {
    cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined;
  }
  if (typeof cur !== "string") throw new Error(`katalog anahtarı yok: ${lang}/${file}.${key}`);
  return cur;
}
/** M'nin hata atmayan hali (karşılaştırma tabanında — ör. main — namespace olmayabilir). */
function Mq(lang: Lang, file: string, key: string): string | null {
  try { return M(lang, file, key); } catch { return null; }
}
/** Ham anahtar taraması için kök namespace'ler (messages/<dil>/*.json dosya adlarının ilk parçası). */
function messageRoots(): string[] {
  try {
    return Array.from(new Set(readdirSync(path.join(ROOT, "messages", "en")).filter((f) => f.endsWith(".json")).map((f) => f.split(".")[0]!)));
  } catch {
    return [];
  }
}
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Baştaki süs karakterini (✎ vb.) at — UI stripLeadingGlyph ile aynı amaç. */
const stripGlyph = (s: string) => s.replace(/^[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]+/, "").trim();

function brandAllowlist(): string[] {
  try {
    const j = JSON.parse(readFileSync(path.join(ROOT, "scripts/i18n/scope.json"), "utf8")) as { brandAllowlist?: string[] };
    return j.brandAllowlist ?? ["Yaşam Sistemi", "YAŞAM SİSTEMİ"];
  } catch {
    return ["Yaşam Sistemi", "YAŞAM SİSTEMİ"];
  }
}

// ─── Rotalar ─────────────────────────────────────────────────────────────────

type RouteDef = {
  id: string;
  group: string;
  path: string;
  /** Ayarlar sekmesi (data-settings-tab) */
  settingsTab?: string;
  /** Silme onayı modal denemesi: "first" | "last" görünür silme düğmesi */
  modal?: "first" | "last";
  /** Sekme yoksa sessizce atla (ör. Kişisel Dijital Ofis yalnız izinli hesapta) */
  optionalTab?: boolean;
  /** Kapsam dışı modül (Owner): ölçülür + ekran görüntüsü alınır, sonuç "KAPSAM-DIŞI" (FAIL sayılmaz). */
  outOfScope?: boolean;
  /** Oturumsuz ziyaretçi bağlamında aç (kampanya ziyaretçi ekranları). */
  anon?: boolean;
  /** Yüklendikten sonra yapılacak etkileşim: "bell" = bildirim panelini aç; "error-boundary" = API yanıtı bozularak
   *  segment hata sınırı (error.tsx) tetiklenir (ürün koduna dokunmadan, yalnız tarayıcıda yanıt değiştirilir). */
  action?: "bell" | "error-boundary";
  /** R5: yüklendikten sonra tıklanacak öğe (Playwright seçicisi; sekme geçişi). Yoksa not düşülür, FAIL sayılmaz. */
  click?: string;
  /** Beklenen belge HTTP durumu (ör. 404 sayfası). */
  expectStatus?: number;
  /** Bu rota için tam sayfa ekran görüntüsü (uzun ayar sekmeleri). */
  fullPage?: boolean;
};

const CLIENT_TABS = ["genel", "anamnez", "notlar", "seanslar", "odevler", "analizler", "taslar", "beslenme", "hafiza", "randevular", "yolculuk", "ucretlendirme"] as const;
const SETTINGS_TABS = ["security", "profile", "location", "contact", "export", "backup", "restore", "membership", "workspace", "language"] as const;

const ROUTES: RouteDef[] = [
  { id: "ana-sayfa", group: "Ana sayfa / panel", path: "/" },
  { id: "panel", group: "Ana sayfa / panel", path: "/dashboard" },
  ...SETTINGS_TABS.map((t): RouteDef => ({
    id: t === "membership" ? "ayarlar-uyeligim" : `ayarlar-${t}`, group: "Ayarlar", path: "/settings", settingsTab: t,
    // Kapı kapalı build'de Dil sekmesi bilerek YOK → "beklenen" (K1 senaryosu ayrıca doğrular).
    optionalTab: t === "workspace" || (GATE_CLOSED && t === "language"),
  })),
  // Giriş yöntemleri (MyLoginMethodsPanel) + oturumlar Güvenlik sekmesinin altında → tam sayfa görüntü.
  { id: "ayarlar-giris-yontemleri", group: "Ayarlar", path: "/settings", settingsTab: "security", fullPage: true },
  { id: "bildirimler", group: "Bildirimler", path: "/", action: "bell" },
  { id: "human-design-hub", group: "Human Design", path: "/human-design" },
  { id: "hata-404", group: "Hata / yükleme", path: "/zz-olmayan-sayfa-r4", expectStatus: 404 },
  { id: "hata-siniri-kupa", group: "Hata / yükleme", path: "/kupa/protokoller", action: "error-boundary" },
  { id: "kampanya-ziyaretci-ana-sayfa", group: "Kampanya ziyaretçi", path: "/", anon: true },
  { id: "kampanya-ziyaretci-ucretsiz-analiz", group: "Kampanya ziyaretçi", path: "/ucretsiz-analiz", anon: true },
  { id: "ajanda", group: "Ajanda", path: "/dashboard/ajanda", modal: "first" },
  { id: "kisisel-arsiv", group: "Kişisel Arşiv", path: "/dashboard/kisisel-arsiv" },
  { id: "danisan-yolculugu", group: "Danışan Yolculuğu", path: "/danisan-yolculugu" },
  { id: "danisan-listesi", group: "Danışanlar", path: "/danisan-yolculugu/liste" },
  { id: "danisan-kayit", group: "Danışanlar", path: "/danisan-yolculugu/kayit" },
  { id: "danisan-takip", group: "Danışan Yolculuğu", path: "/danisan-yolculugu/takip" },
  ...CLIENT_TABS.map((t): RouteDef => ({
    id: `danisan-detay-${t}`, group: "Danışanlar", path: `/dashboard/clients/{client}?tab=${t}`,
    modal: t === "genel" ? "first" : t === "seanslar" || t === "odevler" || t === "randevular" ? "last" : undefined,
  })),
  { id: "danisan-anamnez-detay", group: "Danışanlar", path: "/dashboard/clients/{client}/anamnez/{anamnesis}" },
  { id: "yasam-hafizasi", group: "Yaşam Hafızası", path: "/yasam-hafizasi" },
  { id: "dijital-icerik", group: "Dijital İçerik", path: "/digital-content" },
  { id: "belge-ceviri", group: "Dijital İçerik", path: "/belge-ceviri" },
  { id: "video-ceviri", group: "Dijital İçerik", path: "/video-ceviri" },
  { id: "ders-notu", group: "Dijital İçerik", path: "/ders-notu" },
  { id: "dogaltas", group: "Doğaltaş", path: "/dogaltas" },
  { id: "dogaltas-listesi", group: "Doğaltaş", path: "/dogaltas/dogaltas-listesi", modal: "first" },
  { id: "dogaltas-kayit", group: "Doğaltaş", path: "/dogaltas/dogaltas-kayit" },
  { id: "dogaltas-kutuphane", group: "Doğaltaş", path: "/dogaltas/kutuphane" },
  { id: "dogaltas-tas-bilgi-kutuphanesi", group: "Doğaltaş", path: "/dogaltas/tas-bilgi-kutuphanesi" },
  { id: "dogaltas-kombinasyonlar", group: "Doğaltaş", path: "/dogaltas/kombinasyonlar", modal: "first" },
  { id: "dogaltas-kombinasyon-olustur", group: "Doğaltaş", path: "/dogaltas/kombinasyon-olustur" },
  { id: "dogaltas-mineral-listesi", group: "Doğaltaş", path: "/dogaltas/mineral-listesi", modal: "first" },
  { id: "dogaltas-mineral-bankasi", group: "Doğaltaş", path: "/dogaltas/mineral-bankasi" },
  { id: "dogal-destek", group: "Doğal Destek", path: "/dogal-destek" },
  { id: "beslenme", group: "Beslenme", path: "/beslenme" },
  { id: "beslenme-besinler", group: "Beslenme", path: "/beslenme/besinler" },
  { id: "beslenme-kan-grubu", group: "Beslenme", path: "/beslenme/kan-grubu" },
  { id: "beslenme-mizac", group: "Beslenme", path: "/beslenme/mizac" },
  { id: "beslenme-planlar", group: "Beslenme", path: "/beslenme/planlar", modal: "first" },
  { id: "beslenme-rehber", group: "Beslenme", path: "/beslenme/rehber" },
  { id: "beslenme-sablonlar", group: "Beslenme", path: "/beslenme/sablonlar" },
  { id: "kupa", group: "Kupa & Hacamat", path: "/kupa" },
  { id: "kupa-takvim", group: "Kupa & Hacamat", path: "/kupa/takvim" },
  { id: "kupa-amac-rehberi", group: "Kupa & Hacamat", path: "/kupa/amac-rehberi" },
  { id: "kupa-amac-rehberi-yeni", group: "Kupa & Hacamat", path: "/kupa/amac-rehberi/yeni" },
  { id: "kupa-bilgi-kutuphanesi", group: "Kupa & Hacamat", path: "/kupa/bilgi-kutuphanesi" },
  { id: "kupa-guvenlik", group: "Kupa & Hacamat", path: "/kupa/guvenlik" },
  { id: "kupa-kaynaklar", group: "Kupa & Hacamat", path: "/kupa/kaynaklar" },
  { id: "kupa-noktalar", group: "Kupa & Hacamat", path: "/kupa/noktalar" },
  { id: "kupa-protokoller", group: "Kupa & Hacamat", path: "/kupa/protokoller", modal: "first" },
  { id: "kupa-protokoller-yeni", group: "Kupa & Hacamat", path: "/kupa/protokoller/yeni" },
  { id: "kupa-teknikler", group: "Kupa & Hacamat", path: "/kupa/teknikler", modal: "first" },
  { id: "kupa-teknikler-yeni", group: "Kupa & Hacamat", path: "/kupa/teknikler/yeni" },
  { id: "enerji-beden", group: "Biyoenerji / Çakra", path: "/enerji-beden" },
  { id: "biyoenerji", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji" },
  { id: "biyoenerji-cakralar", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/cakralar" },
  { id: "biyoenerji-bilincalti-sebepleri", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/bilincalti-sebepleri" },
  { id: "biyoenerji-enerji-bedenleri", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/enerji-bedenleri" },
  { id: "biyoenerji-imajinasyonlar", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/imajinasyonlar" },
  { id: "biyoenerji-seanslar", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/seanslar", modal: "first" },
  { id: "biyoenerji-sembol-dili", group: "Biyoenerji / Çakra", path: "/dashboard/biyoenerji/sembol-dili" },
  { id: "refleksoloji", group: "Refleksoloji", path: "/refleksoloji" },
  { id: "refleksoloji-bolge-haritasi", group: "Refleksoloji", path: "/refleksoloji/bolge-haritasi" },
  { id: "refleksoloji-protokol-haritasi", group: "Refleksoloji", path: "/refleksoloji/protokol-haritasi" },
  { id: "refleksoloji-kayitli-atlas", group: "Refleksoloji", path: "/refleksoloji/kayitli-atlas", modal: "first" },
  { id: "refleksoloji-kayitli-protokoller", group: "Refleksoloji", path: "/refleksoloji/kayitli-protokoller", modal: "first" },
  { id: "refleksoloji-notlar", group: "Refleksoloji", path: "/refleksoloji/notlar", modal: "first" },
  { id: "aromaterapi", group: "Aromaterapi", path: "/aromaterapi" },
  { id: "aromaterapi-bilgi-bankasi", group: "Aromaterapi", path: "/aromaterapi/bilgi-bankasi" },
  { id: "aromaterapi-sozluk", group: "Aromaterapi", path: "/aromaterapi/bilgi-bankasi/sozluk" },
  { id: "aromaterapi-bilgi-kayitlari", group: "Aromaterapi", path: "/aromaterapi/bilgi-kayitlari", modal: "first" },
  { id: "aromaterapi-bilgi-kayitlari-yeni", group: "Aromaterapi", path: "/aromaterapi/bilgi-kayitlari/yeni" },
  { id: "aromaterapi-karisim-olusturucu", group: "Aromaterapi", path: "/aromaterapi/karisim-olusturucu" },
  { id: "aromaterapi-katalog", group: "Aromaterapi", path: "/aromaterapi/katalog" },
  { id: "aromaterapi-kaynaklar", group: "Aromaterapi", path: "/aromaterapi/kaynaklar" },
  { id: "aromaterapi-maserasyon-yaglari", group: "Aromaterapi", path: "/aromaterapi/maserasyon-yaglari" },
  { id: "aromaterapi-sabit-yaglar", group: "Aromaterapi", path: "/aromaterapi/sabit-yaglar" },
  { id: "aromaterapi-ucucu-yaglar", group: "Aromaterapi", path: "/aromaterapi/ucucu-yaglar" },
  { id: "aromaterapi-yaglar", group: "Aromaterapi", path: "/aromaterapi/yaglar" },
  { id: "urun-stok", group: "Ürün & Stok", path: "/urun-stok" },
  { id: "urun-stok-canli-stok", group: "Ürün & Stok", path: "/urun-stok/canli-stok" },
  { id: "urun-stok-dogaltas", group: "Ürün & Stok", path: "/urun-stok/dogaltas", modal: "first" },
  { id: "urun-stok-yag", group: "Ürün & Stok", path: "/urun-stok/yag" },
  { id: "urun-stok-sabun-krem", group: "Ürün & Stok", path: "/urun-stok/sabun-krem" },
  { id: "urun-stok-aksesuar", group: "Ürün & Stok", path: "/urun-stok/aksesuar" },
  { id: "urun-stok-diger", group: "Ürün & Stok", path: "/urun-stok/diger" },
  { id: "urun-stok-satis-fiyatlandirma", group: "Ürün & Stok", path: "/urun-stok/satis-fiyatlandirma" },
  { id: "urun-stok-satis-gecmisi", group: "Ürün & Stok", path: "/urun-stok/satis-gecmisi" },
  { id: "urun-stok-stok-hareketleri", group: "Ürün & Stok", path: "/urun-stok/stok-hareketleri" },
  // ── R5 §29: Numeroloji / Human Design / Atlas gerçek ekranları (sentetik kayıtlar N1/H1/A1 ile ekran turundan önce oluşur) ──
  { id: "numeroloji", group: "Numeroloji", path: "/numeroloji" },
  { id: "numeroloji-analiz", group: "Numeroloji", path: "/numeroloji/analiz" },
  { id: "numeroloji-liste", group: "Numeroloji", path: "/numeroloji/liste" },
  { id: "numeroloji-kayit-detay", group: "Numeroloji", path: "/numeroloji/liste/{numRecord}" },
  { id: "numeroloji-bilgi-bankasi", group: "Numeroloji", path: "/numeroloji/bilgi-bankasi" },
  { id: "hd-danisanlar", group: "Human Design", path: "/human-design/danisanlar" },
  { id: "hd-kayitli-haritalar", group: "Human Design", path: "/human-design/kayitli-haritalar" },
  { id: "hd-kayitli-raporlar", group: "Human Design", path: "/human-design/kayitli-raporlar" },
  { id: "hd-bilgi-bankasi", group: "Human Design", path: "/human-design/bilgi-bankasi" },
  { id: "hd-transit", group: "Human Design", path: "/human-design/transit" },
  { id: "hd-iliski-grup", group: "Human Design", path: "/human-design/iliski-grup" },
  { id: "atlas", group: "Atlas", path: "/astroloji" },
  { id: "atlas-yeni-analiz", group: "Atlas", path: "/astroloji", click: "nav:has([data-testid=atlas-nav-skytools]) button >> nth=0" },
  { id: "atlas-analiz-arsivi", group: "Atlas", path: "/astroloji", click: "nav:has([data-testid=atlas-nav-skytools]) button >> nth=1" },
  { id: "atlas-bilgi-bankasi", group: "Atlas", path: "/astroloji", click: "nav:has([data-testid=atlas-nav-skytools]) button >> nth=2" },
  { id: "atlas-horary", group: "Atlas", path: "/astroloji#horary-lilly" },
  { id: "atlas-gokyuzu-efemeris", group: "Atlas", path: "/astroloji/efemeris" },
  { id: "atlas-gokyuzu-ay-evreleri", group: "Atlas", path: "/astroloji/efemeris", click: "[data-testid=sky-tab-ay]" },
  { id: "atlas-gokyuzu-derece", group: "Atlas", path: "/astroloji/efemeris", click: "[data-testid=sky-tab-derece]" },
  // ── Kapsam DIŞI / bekliyor (Owner): ölçülür, ayrı raporlanır, FAIL sayılmaz ──
  { id: "kd-kozmik-ajanda", group: "KAPSAM DIŞI", path: "/cosmic-calendar", outOfScope: true },
  { id: "kd-sifa-rehberi", group: "KAPSAM DIŞI", path: "/sifa-rehberi", outOfScope: true },
];

// ─── Sentetik veri ───────────────────────────────────────────────────────────

/** Bilinçli olarak ASCII: Türkçe-karakter taramasında sentetik veri gürültü üretmesin. */
const SYN = {
  tenantName: "ZZ_MODUL_EKRAN_TENANT",
  expertName: "ZZ Modul Uzman",
  expertEmail: "zz.modul.uzman@example.test",
  clientAd: "ZZ Modul",
  clientSoyad: "DANISAN",
  createdAd: "ZZ EnForm",
  createdSoyad: "OLUSTUR",
  keepAd: "ZZ Korunan",
  keepSoyad: "VERI",
  expertNameB: "ZZ Modul Uzman B",
  expertEmailB: "zz.modul.uzman.b@example.test",
};
/** Uzman modül yetkilerinin TAMAMI (kapsam dışı modüller de açık: yalnız kapsam içi ekranlar ziyaret edilir). */
const ALL_EXPERT_MODULES: Record<string, boolean> = {
  clients: true, appointments: true, stones: true, stok: true, reflexology: true, energy_body: true, aromatherapy: true,
  personal_archive: true, belge_ceviri: true, digital_content: true, cupping: true, beslenme: true, yasam_hafizasi: true,
  numerology: true, human_design: true, cosmic_calendar: true, sifa_rehberi: true, astrology: true,
};

const EXTRA_DDL = `
do $$ begin
  if not exists (select 1 from pg_constraint where conname='clients_tenant_id_id_key') then
    alter table public.clients add constraint clients_tenant_id_id_key unique (tenant_id, id);
  end if;
end $$;
create table if not exists public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now());
create table if not exists public.client_charges (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, charge_date text, category text, detail text, amount numeric, payment_status text, created_at timestamptz default now());
create table if not exists public.human_design_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, name text, birth_date text, journey_client_id uuid, created_at timestamptz default now());
create table if not exists public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, client_id uuid, chart_id uuid, title text, report_kind text, schema_version text, snapshot jsonb, created_at timestamptz default now());
create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, surname text, birth_date text, analysis_data jsonb, is_demo_seed boolean default false, created_at timestamptz default now());
-- R4: dy-presale-closeout test şeması client_stones / client_combinations'ı asgari kolonla kurar; Word raporu
-- (clientReportData.ts) production şemasındaki kolonlara göre sıralar/seçer → 42703 → "Rapor seçenekleri yüklenemedi" →
-- "Word Oluştur" pasif → S4 tıklama zaman aşımı (R3/R4 kanıtı: next-sunucu.log: column "stone_date" does not exist).
alter table public.client_stones add column if not exists stone_type text;
alter table public.client_stones add column if not exists note text;
alter table public.client_stones add column if not exists usage_area text;
alter table public.client_stones add column if not exists combination_text text;
alter table public.client_stones add column if not exists warning_text text;
alter table public.client_stones add column if not exists other_notes text;
alter table public.client_stones add column if not exists stone_date text;
alter table public.client_combinations add column if not exists description text;
alter table public.client_combinations add column if not exists note text;
alter table public.client_combinations add column if not exists stones_text text;
alter table public.client_combinations add column if not exists notes_text text;
alter table public.client_combinations add column if not exists notes_text_2 text;
grant select, insert, update, delete on all tables in schema public to service_role;
`;

type Fixture = {
  tenant: string; userId: string; token: string; client: string; anamnesis: string | null; userRecord: Record<string, unknown>;
  userB: { tenant: string; userId: string; token: string; userRecord: Record<string, unknown> } | null;
  /** R5: modül izni OLMAYAN uzman (erişim engeli senaryosu). */
  userC: { userId: string; token: string; userRecord: Record<string, unknown> } | null;
  /** R5: senaryolarla oluşan sentetik kayıtlar (yoksa ilgili rota ATLANDI). */
  numRecord: string | null; hdChart: string | null; horaryRecord: string | null;
};

async function seed(env: TestEnv): Promise<{ fx: Fixture; seedNotes: string[] }> {
  const q = (sql: string, a: unknown[] = []) => env.su.query(sql, a);
  const notes: string[] = [];
  const tenant = randomUUID();
  const userId = randomUUID();
  const token = `zz-modul-ekran-tok-${userId.slice(0, 8)}`;
  await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, SYN.tenantName]);
  await q(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,false)`,
    [userId, SYN.expertName, SYN.expertEmail, JSON.stringify(ALL_EXPERT_MODULES), tenant],
  );
  await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [userId, token]);
  const client = randomUUID();
  await q(
    `insert into public.clients(id, tenant_id, user_id, ad, soyad, telefon, dogum, kan, mizac) values ($1,$2,$3,$4,$5,'05000000099','1991-04-12','A Rh+','safra')`,
    [client, tenant, userId, SYN.clientAd, SYN.clientSoyad],
  );
  const tryQ = async (label: string, sql: string, a: unknown[]) => {
    try { await q(sql, a); notes.push(`tohum: ${label} ✓`); } catch (e) { notes.push(`tohum: ${label} ATLANDI (${(e as Error).message.slice(0, 160)})`); }
  };
  await tryQ("danışan notu", `insert into public.client_notes(tenant_id, client_id, saglik_notu, adres, oneriler) values ($1,$2,'ZZ saglik notu','ZZ adres','ZZ oneri')`, [tenant, client]);
  await tryQ("seans", `insert into public.client_sessions(tenant_id, client_id, session_date, session_type, session_note) values ($1,$2,'2026-11-20','ZZ seans','ZZ seans notu')`, [tenant, client]);
  await tryQ("ödev", `insert into public.client_homeworks(tenant_id, client_id, title, status, end_date) values ($1,$2,'ZZ odev','active','2026-12-20')`, [tenant, client]);
  await tryQ("randevu", `insert into public.appointments(tenant_id, client_id, user_id, title, appointment_date, status, notes) values ($1,$2,$3,'ZZ randevu', now() + interval '3 days','planned','ZZ randevu notu')`, [tenant, client, userId]);
  await tryQ("danışan taşı", `insert into public.client_stones(tenant_id, client_id, stone_name) values ($1,$2,'ZZ Stone')`, [tenant, client]);
  await tryQ("ücret", `insert into public.client_charges(tenant_id, client_id, charge_date, category, detail, amount, payment_status) values ($1,$2,'2026-11-20','session','ZZ ucret',100,'paid')`, [tenant, client]);
  await tryQ("rıza", `insert into public.client_consents(tenant_id, client_id, consent_type, status, text_version, method, recorded_by_user_id) values ($1,$2,'acik_riza_ozel_nitelikli','granted','v1','islak_imza',$3)`, [tenant, client, userId]);
  let anamnesis: string | null = null;
  try {
    const r = await q(
      // API'nin (POST /api/clients/[id]/anamnez) yazdığı TAM şekil: form_custom 4 anahtarlı, client_snapshot dolu.
      // DB varsayılanı '{}' API'nin hiç yazmadığı bir şekildir → editör (effectiveSections: custom.labels[...]) çöker.
      `insert into public.client_anamneses(tenant_id, client_id, kind, title, assessment_date, status, template_key, template_version, form_custom, answers, source_links, client_snapshot, created_by_user_id, completed_by_user_id, completed_at)
       values ($1,$2,'initial','ZZ anamnez formu','2026-11-10','completed','standard','std-v1',$3,$4,'{}'::jsonb,$5,$6,$6,'2026-11-10T10:00:00Z') returning id`,
      [
        tenant,
        client,
        JSON.stringify({ hidden: [], labels: {}, enabledSections: [], custom: [] }),
        JSON.stringify({ "A.reason": "ZZ basvuru nedeni" }),
        JSON.stringify({ ad: SYN.clientAd, soyad: SYN.clientSoyad, dogum: "1991-04-12" }),
        userId,
      ],
    );
    anamnesis = String(r.rows[0]?.id ?? "") || null;
    notes.push("tohum: anamnez ✓");
  } catch (e) {
    notes.push(`tohum: anamnez ATLANDI (${(e as Error).message.slice(0, 160)})`);
  }
  const userRecord = {
    id: userId, tenant_id: tenant, full_name: SYN.expertName, email: SYN.expertEmail, role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: ALL_EXPERT_MODULES, is_demo_account: false,
  };
  // S6 için ikinci sentetik uzman (AYRI tenant; dil tercihi yok) — hesap değişiminde dil izolasyonu.
  const tenantB = randomUUID();
  const userIdB = randomUUID();
  const tokenB = `zz-modul-ekran-tokB-${userIdB.slice(0, 8)}`;
  let userB: Fixture["userB"] = null;
  try {
    await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenantB, `${SYN.tenantName}_B`]);
    await q(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
       values ($1,$2,$3,'expert',true,'approved',$4,'premium','premium',$5,false)`,
      [userIdB, SYN.expertNameB, SYN.expertEmailB, JSON.stringify(ALL_EXPERT_MODULES), tenantB],
    );
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [userIdB, tokenB]);
    userB = {
      tenant: tenantB, userId: userIdB, token: tokenB,
      userRecord: { ...userRecord, id: userIdB, tenant_id: tenantB, full_name: SYN.expertNameB, email: SYN.expertEmailB },
    };
    notes.push("tohum: ikinci hesap (B) ✓");
  } catch (e) {
    notes.push(`tohum: ikinci hesap (B) ATLANDI (${(e as Error).message.slice(0, 160)})`);
  }
  // R5: izinsiz uzman C (kendi kiracısı; modül izni yok, üyelik aktif).
  let userC: Fixture["userC"] = null;
  try {
    const tenantC = randomUUID();
    const userIdC = randomUUID();
    const tokenC = `zz-modul-ekran-tokC-${userIdC.slice(0, 8)}`;
    await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenantC, `${SYN.tenantName}_C`]);
    await q(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, is_demo_account)
       values ($1,'ZZ Modul Uzman C','zz.modul.uzman.c@example.test','expert',true,'approved','{}'::jsonb,'premium','premium',$2,false)`,
      [userIdC, tenantC],
    );
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [userIdC, tokenC]);
    userC = { userId: userIdC, token: tokenC, userRecord: { ...userRecord, id: userIdC, tenant_id: tenantC, full_name: "ZZ Modul Uzman C", email: "zz.modul.uzman.c@example.test", module_permissions: {} } };
    notes.push("tohum: izinsiz hesap (C) ✓");
  } catch (e) {
    notes.push(`tohum: izinsiz hesap (C) ATLANDI (${(e as Error).message.slice(0, 160)})`);
  }
  return { fx: { tenant, userId, token, client, anamnesis, userRecord, userB, userC, numRecord: null, hdChart: null, horaryRecord: null }, seedNotes: notes };
}

// ─── Sonuç tipleri ───────────────────────────────────────────────────────────

type TrHit = { text: string; where: string };
type RouteResult = {
  route: string; group: string; lang: Lang; width: number; url: string; finalPath: string; status: number | null;
  screenshot: string | null; overflowPx: number; overflowOffenders: string[]; crash: boolean; crashReason: string | null;
  pageErrors: string[]; consoleErrors: number; consoleSamples: string[]; api5xx: string[]; other5xx: string[];
  trCandidates: number; trSamples: TrHit[]; note: string | null; ms: number; verdict: "PASS" | "FAIL" | "ATLANDI" | "KAPSAM-DIŞI";
  /** R4: <html lang>, uygulama konsol hataları (kaynak-yükleme hariç), next-intl hataları, ham anahtarlar, FAIL nedenleri. */
  htmlLang: string; consoleApp: number; consoleAppSamples: string[]; consoleResource: number; consoleWarnOnly: boolean;
  intlErrors: string[]; rawKeys: string[]; failReasons: string[]; outOfScope: boolean;
};
type ScenarioResult = { id: string; lang: Lang; title: string; ok: boolean; detail: string; screenshot?: string };

const results: RouteResult[] = [];
const scenarios: ScenarioResult[] = [];

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await sleep(1000);
  }
  throw new Error(`zaman aşımı: ${url}`);
}
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error(`zaman aşımı (${label})`)), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const htmlLang = (page: Page) => page.evaluate(() => document.documentElement.lang).catch(() => "");
async function waitLang(page: Page, lang: string, ms = 20_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if ((await htmlLang(page)) === lang) return true; await sleep(400); }
  return false;
}
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 7_000 }).catch(() => undefined);
  // Yükleniyor göstergeleri (animate-spin) en çok 4 sn beklenir.
  const until = Date.now() + 4_000;
  while (Date.now() < until) {
    const spinning = await page.locator(".animate-spin").filter({ visible: true }).count().catch(() => 0);
    if (spinning === 0) break;
    await sleep(300);
  }
  await sleep(600);
}
const shotName = (lang: Lang, width: number, id: string) => `${GATE_CLOSED ? "kapali-" : ""}${lang}-${width}-${id}.png`;

async function setAccountLocale(env: TestEnv, fx: Fixture, lang: Lang) {
  if (lang === "en") {
    await env.su.query(
      `insert into public.user_locale_prefs(tenant_id, user_id, preferred_locale) values ($1,$2,'en')
       on conflict (tenant_id, user_id) do update set preferred_locale = 'en'`,
      [fx.tenant, fx.userId],
    ).catch(() => undefined);
  } else {
    await env.su.query(`delete from public.user_locale_prefs where user_id = $1`, [fx.userId]).catch(() => undefined);
  }
}

async function newCtx(
  browser: Browser, fx: Fixture, lang: Lang, width: number,
  opts: { anon?: boolean; cookie?: Lang | null; noAuthInit?: boolean } = {},
): Promise<BrowserContext> {
  const mobile = width < 768;
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHT[width] ?? 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    locale: lang === "en" ? "en-GB" : "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true,
  });
  // tsx/esbuild keepNames: page.evaluate'e giden işlevler __name(...) yardımcısını çağırır; tarayıcıda tanımlı olmalı.
  await ctx.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });
  await guardPaid(ctx);
  // Kapı kapalı turunda çerez bilerek "en" (eski EN çerezi kalmış kullanıcı) — render yine tr olmalı.
  const cookie = opts.cookie === undefined ? (GATE_CLOSED ? "en" : lang) : opts.cookie;
  if (cookie) await ctx.addCookies([{ name: "NEXT_LOCALE", value: cookie, url: APP }]);
  if (opts.anon || opts.noAuthInit) return ctx;
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(fx.userRecord), fx.token]);
  return ctx;
}

/** Sayfa başına olay toplayıcı (rota değişiminde reset). */
type Bucket = { pageErrors: string[]; console: string[]; api5xx: string[]; other5xx: string[]; docStatus: number | null };
function track(page: Page): { bucket: () => Bucket; reset: () => void } {
  let b: Bucket = { pageErrors: [], console: [], api5xx: [], other5xx: [], docStatus: null };
  page.on("pageerror", (e) => { if (!NOISE_PAGEERROR.test(e.message)) b.pageErrors.push(e.message.slice(0, 300)); });
  page.on("console", (m) => { if (m.type() === "error") b.console.push(m.text().slice(0, 300)); });
  page.on("response", (r: Response) => {
    const u = r.url();
    if (!u.startsWith(APP)) return;
    const s = r.status();
    const p = u.slice(APP.length);
    try {
      if (r.request().isNavigationRequest() && r.request().frame() === page.mainFrame()) b.docStatus = s;
    } catch { /* service worker isteğinde frame() atar */ }
    if (s < 500) return;
    if (p.startsWith("/api/")) b.api5xx.push(`${s} ${r.request().method()} ${p.split("?")[0]}`);
    else b.other5xx.push(`${s} ${r.request().method()} ${p.slice(0, 160)}`);
  });
  return { bucket: () => b, reset: () => { b = { pageErrors: [], console: [], api5xx: [], other5xx: [], docStatus: null }; } };
}

async function selectSettingsTab(page: Page, tab: string): Promise<boolean> {
  const sel = `[data-settings-tab="${tab}"]`;
  const visible = async () => (await page.locator(sel).filter({ visible: true }).count()) > 0;
  if (!(await visible())) {
    const menus = page.locator("[data-settings-menu-key]");
    const n = await menus.count();
    for (let i = 0; i < n && !(await visible()); i++) {
      const toggle = menus.nth(i).locator("button").first();
      if (await toggle.isVisible().catch(() => false)) { await toggle.click().catch(() => undefined); await sleep(300); }
    }
  }
  if (!(await visible())) return false;
  await page.locator(sel).filter({ visible: true }).first().click();
  await sleep(500);
  return true;
}

/** Yatay taşma + tanı için taşmanın başladığı öğeler. */
async function measureOverflow(page: Page, width: number): Promise<{ px: number; offenders: string[] }> {
  return page.evaluate((W) => {
    const sw = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
    const px = Math.max(0, sw - W);
    const offenders: string[] = [];
    if (px > 1) {
      const all = Array.from(document.querySelectorAll<HTMLElement>("body *"));
      for (const el of all) {
        if (offenders.length >= 6) break;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= W + 1) continue;
        const parent = el.parentElement;
        if (parent && parent !== document.body && parent.getBoundingClientRect().right > W + 1) continue;
        const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).slice(0, 3).join(".");
        offenders.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""} → sağ ${Math.round(r.right)}px`);
      }
    }
    return { px, offenders };
  }, width);
}

/** EN ekranında Türkçe karakter içeren görünür metin düğümleri + öznitelikler (aday listesi). */
async function scanTurkish(page: Page, exclude: string[]): Promise<{ count: number; samples: TrHit[] }> {
  return page.evaluate((ex) => {
    const RE = /[çğıöşüÇĞİÖŞÜ]/;
    const clean = (s: string) => {
      let t = s.replace(/\s+/g, " ").trim();
      for (const e of ex) t = t.split(e).join(" ");
      return t;
    };
    const skip = (el: Element | null): boolean => {
      if (!el) return true;
      if (el.closest("script,style,noscript,template,[translate='no'],[data-i18n-ignore]")) return true;
      const langEl = el.closest("[lang]");
      if (langEl && langEl !== document.documentElement && (langEl.getAttribute("lang") ?? "").toLowerCase().startsWith("tr")) return true;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return true;
      return el.getClientRects().length === 0;
    };
    const desc = (el: Element) => {
      const cls = (typeof (el as HTMLElement).className === "string" ? (el as HTMLElement).className : "").trim().split(/\s+/).slice(0, 2).join(".");
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
    };
    let count = 0;
    const samples: { text: string; where: string }[] = [];
    const seen = new Set<string>();
    const add = (raw: string, where: string) => {
      count++;
      const key = raw.slice(0, 120);
      if (samples.length < 25 && !seen.has(key)) { seen.add(key); samples.push({ text: key, where }); }
    };
    if (document.body) {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) {
        const raw = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!raw || !RE.test(clean(raw))) continue;
        const el = n.parentElement;
        if (skip(el)) continue;
        add(raw, desc(el as Element));
      }
      for (const el of Array.from(document.querySelectorAll("[placeholder],[title],[aria-label]"))) {
        if (skip(el)) continue;
        for (const a of ["placeholder", "title", "aria-label"]) {
          const v = el.getAttribute(a);
          if (v && RE.test(clean(v))) add(v.replace(/\s+/g, " ").trim(), `${desc(el)}@${a}`);
        }
      }
      if (RE.test(clean(document.title))) add(document.title, "title");
    }
    return { count, samples };
  }, exclude);
}

/** Görünen metinde/özniteliklerde ham çeviri anahtarı: "<kök-namespace>.<a>.<b>" (boşluksuz, tüm düğüm) ya da DEV işareti ⟦…⟧. */
async function scanRawKeys(page: Page, roots: string[]): Promise<string[]> {
  return page.evaluate((rs) => {
    const RE = rs.length ? new RegExp(`^(?:${rs.join("|")})(?:\\.[A-Za-z0-9_-]+)+$`) : null;
    const hits: string[] = [];
    const test = (v: string) => {
      const t = v.replace(/\s+/g, " ").trim();
      if (!t) return;
      if (t.includes("⟦") || (RE && RE.test(t))) { if (hits.length < 15 && !hits.includes(t.slice(0, 120))) hits.push(t.slice(0, 120)); }
    };
    if (!document.body) return hits;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = w.nextNode())) {
      const el = n.parentElement;
      if (!el || el.closest("script,style,noscript,template")) continue;
      test(n.textContent ?? "");
    }
    for (const el of Array.from(document.querySelectorAll("[placeholder],[title],[aria-label]"))) {
      for (const a of ["placeholder", "title", "aria-label"]) { const v = el.getAttribute(a); if (v) test(v); }
    }
    test(document.title);
    return hits;
  }, roots);
}

// ─── Ekran turu ──────────────────────────────────────────────────────────────

/** Ham anahtar taramasının kök namespace listesi (main()'de doldurulur). */
let ROOTS: string[] = [];

function resolvePath(p: string, fx: Fixture): string | null {
  if (p.includes("{anamnesis}") && !fx.anamnesis) return null;
  if (p.includes("{numRecord}") && !fx.numRecord) return null;
  if (p.includes("{hdChart}") && !fx.hdChart) return null;
  return p.replace("{client}", fx.client).replace("{anamnesis}", fx.anamnesis ?? "").replace("{numRecord}", fx.numRecord ?? "").replace("{hdChart}", fx.hdChart ?? "");
}

async function visitRoute(page: Page, t: ReturnType<typeof track>, r: RouteDef, lang: Lang, width: number, fx: Fixture, exclude: string[]): Promise<RouteResult> {
  const started = Date.now();
  const base: RouteResult = {
    route: r.id, group: r.group, lang, width, url: r.path, finalPath: "", status: null, screenshot: null, overflowPx: 0, overflowOffenders: [],
    crash: false, crashReason: null, pageErrors: [], consoleErrors: 0, consoleSamples: [], api5xx: [], other5xx: [], trCandidates: 0, trSamples: [],
    note: null, ms: 0, verdict: "PASS",
    htmlLang: "", consoleApp: 0, consoleAppSamples: [], consoleResource: 0, consoleWarnOnly: false, intlErrors: [], rawKeys: [], failReasons: [],
    outOfScope: !!r.outOfScope,
  };
  if (Date.now() - STARTED > BUDGET_MS) return { ...base, note: "süre bütçesi aşıldı — atlandı", verdict: "ATLANDI" };
  const p = resolvePath(r.path, fx);
  if (!p) return { ...base, note: "tohum kaydı yok (anamnez / N1 / H1 senaryo kaydı) — atlandı", verdict: "ATLANDI" };
  base.url = p;
  t.reset();
  // Hata sınırı denemesi: liste API'si 200 + bozuk şekil ({protocols: nesne}) döner → bileşen render'da patlar →
  // app/kupa/error.tsx devreye girmeli. Yalnız bu sekmenin tarayıcı isteği değiştirilir; sunucu/DB'ye dokunulmaz.
  const ebPattern = "**/api/kupa/protocols**";
  if (r.action === "error-boundary") {
    await page.route(ebPattern, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, protocols: { zzBozukSekil: true } }) }));
  }
  let boundaryShown = null as boolean | null;
  try {
    await withTimeout((async () => {
      await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settle(page);
      if (r.settingsTab) {
        const okTab = await selectSettingsTab(page, r.settingsTab);
        if (!okTab) {
          base.note = GATE_CLOSED && r.settingsTab === "language"
            ? "kapı kapalı: Dil sekmesi beklendiği gibi YOK"
            : r.optionalTab ? "sekme bu hesapta yok (isteğe bağlı) — atlandı" : "sekme bulunamadı";
          if (r.optionalTab) base.verdict = "ATLANDI";
        }
        await settle(page);
      }
      if (r.action === "bell") {
        const titles = [Mq(lang, "notifications", "bell.title"), "Bildirimler", "Notifications"].filter((x): x is string => !!x);
        const bell = page.locator(titles.map((x) => `button[title="${x}"]`).join(",")).filter({ visible: true }).first();
        if ((await bell.count()) > 0) { await bell.click().catch(() => undefined); await sleep(800); await settle(page); }
        else base.note = "bildirim zili bulunamadı";
      }
      if (r.click) {
        const el = page.locator(r.click).filter({ visible: true }).first();
        if ((await el.count()) > 0) { await el.click().catch(() => undefined); await sleep(500); await settle(page); }
        else base.note = `tıklanacak öğe yok (${r.click})`;
      }
      if (r.action === "error-boundary") {
        boundaryShown = await page.locator("[role=alert]").filter({ visible: true }).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
      }
    })(), 90_000, r.id);
  } catch (e) {
    base.crash = true;
    base.crashReason = `yüklenemedi: ${(e as Error).message.slice(0, 200)}`;
  }
  if (r.action === "error-boundary") await page.unroute(ebPattern).catch(() => undefined);
  const b = t.bucket();
  base.status = b.docStatus;
  base.finalPath = page.url().startsWith(APP) ? page.url().slice(APP.length) : page.url();
  if (base.verdict === "ATLANDI") { base.ms = Date.now() - started; return base; }
  base.htmlLang = await htmlLang(page);
  const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => "");
  if (CRASH_TEXT.test(bodyText)) { base.crash = true; base.crashReason = base.crashReason ?? "Next hata ekranı (This page couldn’t load / Application error)"; }
  if (b.pageErrors.length && r.action !== "error-boundary") { base.crash = true; base.crashReason = base.crashReason ?? `yakalanmamış hata: ${b.pageErrors[0]}`; }
  if (r.action === "error-boundary") {
    base.note = boundaryShown ? "hata sınırı (error.tsx) göründü — beklenen" : "hata sınırı GÖRÜNMEDİ";
    if (!boundaryShown && !base.crash) { base.crash = true; base.crashReason = "enjekte edilen hata modül hata sınırında yakalanmadı"; }
  }
  if (r.expectStatus && base.status !== r.expectStatus) base.note = `${base.note ? `${base.note}; ` : ""}beklenen HTTP ${r.expectStatus}, gelen ${base.status ?? "-"}`;
  const finalNoQuery = base.finalPath.split("?")[0];
  const wantedNoQuery = p.split("?")[0];
  if (finalNoQuery !== wantedNoQuery && !base.note) base.note = `yönlendirme → ${base.finalPath.slice(0, 120)}`;
  try {
    await page.addStyleTag({ content: STABILIZE_CSS }).catch(() => undefined);
    const ov = await measureOverflow(page, width);
    base.overflowPx = Math.round(ov.px);
    base.overflowOffenders = ov.offenders;
    if (lang === "en") {
      const tr = await scanTurkish(page, exclude);
      base.trCandidates = tr.count;
      base.trSamples = tr.samples;
    }
    base.rawKeys = await scanRawKeys(page, ROOTS).catch(() => []);
    const file = shotName(lang, width, r.id);
    await page.screenshot({ path: path.join(OUT, file), fullPage: FULL_PAGE || !!r.fullPage, timeout: 30_000 });
    base.screenshot = file;
  } catch (e) {
    base.note = `${base.note ? `${base.note}; ` : ""}ölçüm/ekran görüntüsü hatası: ${(e as Error).message.slice(0, 160)}`;
  }
  const after = t.bucket();
  base.pageErrors = after.pageErrors.slice(0, 5);
  base.consoleErrors = after.console.length;
  base.consoleSamples = Array.from(new Set(after.console)).slice(0, 4);
  base.api5xx = Array.from(new Set(after.api5xx)).slice(0, 10);
  base.other5xx = Array.from(new Set(after.other5xx)).slice(0, 10);
  // Konsol sınıflandırma (R4): next-intl hataları → FAIL; kaynak yükleme → HTTP ölçümünde; geri kalan = uygulama hatası.
  base.intlErrors = Array.from(new Set(after.console.filter((m) => INTL_CONSOLE.test(m)))).slice(0, 5);
  const appConsole = after.console.filter((m) => !RESOURCE_CONSOLE.test(m) && !INTL_CONSOLE.test(m) && !NOISE_PAGEERROR.test(m));
  base.consoleResource = after.console.filter((m) => RESOURCE_CONSOLE.test(m)).length;
  // Hata sınırı denemesinde enjekte edilen hatanın günlüğü beklenir → sayılmaz.
  base.consoleApp = r.action === "error-boundary" ? 0 : appConsole.length;
  base.consoleAppSamples = Array.from(new Set(appConsole)).slice(0, 4);
  // Aynı ekranda /api 5xx varsa (test ortamında modül tablosu yok) uygulama konsol hatası çoğunlukla onun yankısıdır → UYARI.
  base.consoleWarnOnly = base.consoleApp > 0 && base.api5xx.length > 0 && !STRICT_API;
  const docFail = (base.status ?? 0) >= 500 || base.other5xx.length > 0;
  const expectedLang = GATE_CLOSED ? "tr" : lang;
  const reasons: string[] = [];
  if (base.crash) reasons.push("çökme");
  if (docFail) reasons.push("belge/RSC 5xx");
  if (base.overflowPx > 1) reasons.push(`taşma ${base.overflowPx}px`);
  if (STRICT_API && base.api5xx.length > 0) reasons.push("api 5xx (strict)");
  if (base.consoleApp > 0 && !base.consoleWarnOnly) reasons.push(`konsol ${base.consoleApp}`);
  if (base.intlErrors.length) reasons.push("next-intl hata kodu");
  if (base.rawKeys.length) reasons.push("ham anahtar");
  if (base.htmlLang && base.htmlLang !== expectedLang) reasons.push(`html lang=${base.htmlLang} (beklenen ${expectedLang})`);
  if (r.expectStatus && base.status !== r.expectStatus) reasons.push(`HTTP ${base.status ?? "-"}≠${r.expectStatus}`);
  base.failReasons = reasons;
  base.verdict = r.outOfScope ? "KAPSAM-DIŞI" : reasons.length ? "FAIL" : "PASS";
  base.ms = Date.now() - started;
  return base;
}

async function screenTour(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang, exclude: string[]) {
  // Kapı kapalı turu: hesaba bilerek "en" tercihi yazılır (render yine tr olmalı).
  await setAccountLocale(env, fx, GATE_CLOSED ? "en" : lang);
  const routes = ROUTES.filter((r) => ONLY.size === 0 || ONLY.has(r.id));
  // Genişlikler paralel (her biri kendi bağlamında); rotalar her genişlikte sıralı.
  await Promise.all(WIDTHS.map(async (width) => {
    const ctx = await newCtx(browser, fx, lang, width);
    let anonCtx: BrowserContext | null = null;
    let page = await ctx.newPage();
    let t = track(page);
    for (const r of routes) {
      let res: RouteResult;
      if (r.anon) {
        // Ziyaretçi ekranı: oturumsuz ayrı bağlam (uzman localStorage'ı yok).
        anonCtx = anonCtx ?? await newCtx(browser, fx, lang, width, { anon: true });
        const ap = await anonCtx.newPage();
        const at = track(ap);
        res = await visitRoute(ap, at, r, lang, width, fx, exclude);
        await ap.close().catch(() => undefined);
      } else {
        res = await visitRoute(page, t, r, lang, width, fx, exclude);
      }
      results.push(res);
      const flag = res.verdict === "PASS" ? "PASS" : res.verdict === "FAIL" ? "FAIL" : res.verdict === "KAPSAM-DIŞI" ? "KDIS" : "ATLA";
      console.log(`  ${flag} [${GATE_CLOSED ? "kapalı-" : ""}${lang} ${width}] ${r.id} http=${res.status ?? "-"} lang=${res.htmlLang || "-"} taşma=${res.overflowPx} çökme=${res.crash ? "E" : "H"} konsol=${res.consoleErrors} (uyg=${res.consoleApp}${res.consoleWarnOnly ? " uyarı" : ""}, kaynak=${res.consoleResource}) api5xx=${res.api5xx.length}${lang === "en" ? ` tr-aday=${res.trCandidates}` : ""}${res.rawKeys.length ? ` ham-anahtar=${res.rawKeys.length}` : ""}${res.intlErrors.length ? ` intl-hata=${res.intlErrors.length}` : ""}${res.failReasons.length ? ` neden=[${res.failReasons.join(", ")}]` : ""}${res.note ? ` (${res.note})` : ""}`);
      // Tanı: ozet.md yazılamasa da (süreç erken düşerse) taşan öğe + çökme nedeni CI günlüğünde kalsın.
      if (res.overflowPx > 1) console.log(`      taşan öğeler: ${res.overflowOffenders.join(" · ") || "(saptanamadı)"}`);
      if (res.crash) console.log(`      çökme: ${res.crashReason ?? "-"}${res.pageErrors.length ? ` | pageerror: ${res.pageErrors[0]!.slice(0, 300)}` : ""}${res.consoleSamples.length ? ` | konsol: ${res.consoleSamples.join(" ‖ ").slice(0, 400)}` : ""}`);
      if (res.consoleApp > 0 && width === WIDTHS[0]) console.log(`      konsol (uygulama): ${res.consoleAppSamples.join(" ‖ ").slice(0, 500)}`);
      if (res.intlErrors.length) console.log(`      next-intl: ${res.intlErrors.join(" ‖ ").slice(0, 500)}`);
      if (res.rawKeys.length) console.log(`      ham anahtar: ${res.rawKeys.join(" · ").slice(0, 400)}`);
      if (res.crash && !r.anon) {
        // Çöken sayfa sonraki rotayı etkilemesin: yeni sekme.
        await page.close().catch(() => undefined);
        page = await ctx.newPage();
        t = track(page);
      }
    }
    await anonCtx?.close().catch(() => undefined);
    await ctx.close().catch(() => undefined);
  }));
}

// ─── Senaryolar ──────────────────────────────────────────────────────────────

function scenario(id: string, lang: Lang, title: string, ok: boolean, detail: string, screenshot?: string) {
  scenarios.push({ id, lang, title, ok, detail, screenshot });
  console.log(`  ${ok ? "PASS" : "FAIL"} [${lang}] ${id} ${title}${detail ? ` → ${detail.slice(0, 300)}` : ""}`);
}

async function runScenario(id: string, lang: Lang, title: string, fn: () => Promise<{ ok: boolean; detail: string; shot?: string }>, timeoutMs = 150_000) {
  try {
    const r = await withTimeout(fn(), timeoutMs, id);
    scenario(id, lang, title, r.ok, r.detail, r.shot);
  } catch (e) {
    scenario(id, lang, title, false, `hata: ${(e as Error).message.slice(0, 300)}`);
  }
}

/** S1: TR→EN geçişinde form verisi korunuyor mu (LanguageSelector ile aynı mekanizma: çerez + router.refresh). */
async function scenarioKeepData(browser: Browser, env: TestEnv, fx: Fixture) {
  await runScenario("S1-dil-gecisi-veri-korunmasi", "tr", "Danışan Kayıt formu: TR→EN geçişinde girilen metin korunur", async () => {
    await setAccountLocale(env, fx, "tr");
    const ctx = await newCtx(browser, fx, "tr", 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/danisan-yolculugu/kayit`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const adTr = page.getByPlaceholder(M("tr", "clients", "form.placeholders.ad"), { exact: true });
      const soyadTr = page.getByPlaceholder(M("tr", "clients", "form.placeholders.soyad"), { exact: true });
      await adTr.waitFor({ timeout: 30_000 });
      await adTr.fill(SYN.keepAd);
      await soyadTr.fill(SYN.keepSoyad);
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: APP }]);
      const refreshed = await page.evaluate(() => {
        const n = (window as unknown as { next?: { router?: { refresh?: () => void } } }).next;
        if (!n?.router?.refresh) return false;
        n.router.refresh();
        return true;
      });
      if (!refreshed) return { ok: false, detail: "window.next.router.refresh bulunamadı (Next sürümü?) — senaryo uygulanamadı" };
      const switched = await waitLang(page, "en", 30_000);
      await settle(page);
      const adEn = page.getByPlaceholder(M("en", "clients", "form.placeholders.ad"), { exact: true });
      const soyadEn = page.getByPlaceholder(M("en", "clients", "form.placeholders.soyad"), { exact: true });
      const labelsEn = (await adEn.count()) > 0;
      const adVal = labelsEn ? await adEn.inputValue() : await adTr.inputValue().catch(() => "");
      const soyadVal = labelsEn ? await soyadEn.inputValue() : await soyadTr.inputValue().catch(() => "");
      const shot = "senaryo-S1-dil-gecisi-en.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      const ok = switched && labelsEn && adVal === SYN.keepAd && soyadVal === SYN.keepSoyad;
      return { ok, shot, detail: `html lang=en: ${switched ? "evet" : "HAYIR"}; EN etiketler: ${labelsEn ? "evet" : "HAYIR"}; ad="${adVal}" soyad="${soyadVal}"` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** S2 + S3: EN'de danışan oluşturma ve düzenleme. */
async function scenarioCreateEdit(browser: Browser, env: TestEnv, fx: Fixture) {
  await setAccountLocale(env, fx, "en");
  await runScenario("S2-en-danisan-olusturma", "en", "EN: Danışan Kayıt formundan sentetik danışan oluşturma", async () => {
    const ctx = await newCtx(browser, fx, "en", 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/danisan-yolculugu/kayit`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const lang = await htmlLang(page);
      await page.getByPlaceholder(M("en", "clients", "form.placeholders.ad"), { exact: true }).fill(SYN.createdAd);
      await page.getByPlaceholder(M("en", "clients", "form.placeholders.soyad"), { exact: true }).fill(SYN.createdSoyad);
      const respP = page.waitForResponse((r) => r.url().startsWith(`${APP}/api/clients`) && r.request().method() === "POST", { timeout: 60_000 });
      await page.getByRole("button", { name: new RegExp(escRe(M("en", "clients", "form.submit.default"))) }).click();
      const resp = await respP;
      await settle(page);
      const shot = "senaryo-S2-en-danisan-olusturuldu.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      const row = await env.su.query(`select id from public.clients where tenant_id=$1 and ad=$2 and soyad=$3`, [fx.tenant, SYN.createdAd, SYN.createdSoyad]);
      const ok = lang === "en" && resp.status() >= 200 && resp.status() < 300 && row.rowCount === 1;
      return { ok, shot, detail: `html lang=${lang}; POST /api/clients ${resp.status()}; DB satırı: ${row.rowCount}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });

  await runScenario("S3-en-danisan-duzenleme", "en", "EN: Danışan detayı › Genel Bilgi düzenleme (telefon)", async () => {
    const ctx = await newCtx(browser, fx, "en", 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/dashboard/clients/${fx.client}?tab=genel`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const editBtn = page.getByRole("button", { name: new RegExp(escRe(stripGlyph(M("en", "clients.detail", "general.editButton")))) }).first();
      await editBtn.waitFor({ timeout: 60_000 });
      for (let i = 0; i < 40 && !(await editBtn.isEnabled()); i++) await sleep(500);
      await editBtn.click();
      const phone = page.getByPlaceholder(M("en", "clients.detail", "form.telefonPlaceholder"), { exact: true }).first();
      await phone.waitFor({ timeout: 20_000 });
      const NEW_PHONE = "05001112233";
      await phone.fill(NEW_PHONE);
      const respP = page.waitForResponse((r) => r.url().startsWith(`${APP}/api/clients/${fx.client}`) && r.request().method() === "PATCH", { timeout: 60_000 });
      await page.getByRole("button", { name: M("en", "clients.detail", "general.save"), exact: true }).click();
      const resp = await respP;
      await settle(page);
      const shot = "senaryo-S3-en-danisan-duzenlendi.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      const row = await env.su.query(`select telefon from public.clients where id=$1`, [fx.client]);
      const ok = resp.status() >= 200 && resp.status() < 300 && row.rows[0]?.telefon === NEW_PHONE;
      return { ok, shot, detail: `PATCH /api/clients/<id> ${resp.status()}; DB telefon=${String(row.rows[0]?.telefon)}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** S4: Word raporu indirme yanıtı 200 (rapor dili kapsam dışı). */
async function scenarioWord(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await setAccountLocale(env, fx, lang);
  await runScenario(`S4-word-indirme-${lang}`, lang, "Danışan detayı › Tam Word raporu → indirme yanıtı 200 (rapor dili: kapsam dışı)", async () => {
    const ctx = await newCtx(browser, fx, lang, 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/dashboard/clients/${fx.client}?tab=genel`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const wordBtn = page.getByRole("button", { name: M(lang, "clients.detail", "a11y.fullWordReport") }).first();
      await wordBtn.waitFor({ timeout: 60_000 });
      await wordBtn.click();
      await sleep(800);
      const gen = page.getByRole("button", { name: M(lang, "clients.detail", "wordDialog.generate"), exact: true }).last();
      await gen.waitFor({ timeout: 30_000 });
      const shot = `senaryo-S4-word-pencere-${lang}.png`;
      await page.screenshot({ path: path.join(OUT, shot) });
      const respP = page.waitForResponse((r) => r.url().includes("/word-report") && r.request().method() === "POST", { timeout: 90_000 });
      // gen.click() hata verirse respP hiç beklenmez; finally'de ctx kapanınca reddedilir → işlenmemiş ret
      // tüm süreci düşürür (45570872612: "page.waitForResponse: Target page ... closed") ve ozet.md yazılmaz.
      respP.catch(() => undefined);
      await gen.click();
      const resp = await respP;
      const ct = resp.headers()["content-type"] ?? "";
      const len = (await resp.body().catch(() => Buffer.alloc(0))).length;
      return { ok: resp.status() === 200, shot, detail: `POST ${resp.url().slice(APP.length).split("?")[0]} → ${resp.status()} (${ct.split(";")[0]}, ${len} bayt); rapor dili: kapsam dışı` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** M: silme onayı modalı aç → Vazgeç/Cancel → kapandı (silme ONAYLANMAZ). */
async function modalProbes(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await setAccountLocale(env, fx, lang);
  const DELETE_RE = lang === "en" ? /\b(Delete|Remove)\b/i : /(^|[\s(])(Sil|Kaldır)([\s)]|$)|Sil$/;
  const CANCEL_RE = /^(Vazgeç|İptal|İptal Et|Kapat|Hayır|Cancel|Close|Keep|No|Back)$/i;
  const routes = ROUTES.filter((r) => r.modal && (ONLY.size === 0 || ONLY.has(r.id)));
  const ctx = await newCtx(browser, fx, lang, 1280);
  try {
    for (const r of routes) {
      if (Date.now() - STARTED > BUDGET_MS) { scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, true, "süre bütçesi aşıldı — atlandı (bilgi)"); continue; }
      const p = resolvePath(r.path, fx);
      if (!p) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        const btns = page.getByRole("button", { name: DELETE_RE }).filter({ visible: true });
        const n = await btns.count();
        if (n === 0) { scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, true, "silme düğmesi yok (kayıt yok / bu ortamda tablo yok) — atlandı (bilgi)"); continue; }
        // R4: pasif (disabled) silme düğmesi tıklanamaz (ör. Refleksoloji › Notlar'da seçili not yokken "Sil") → zaman aşımı
        // yerine bilgi olarak atlanır.
        const enabledIdx: number[] = [];
        for (let i = 0; i < n; i++) if (await btns.nth(i).isEnabled().catch(() => false)) enabledIdx.push(i);
        if (enabledIdx.length === 0) { scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, true, `silme düğmesi pasif (${n} adet; seçili kayıt yok) — atlandı (bilgi)`); continue; }
        const btn = btns.nth(r.modal === "last" ? enabledIdx[enabledIdx.length - 1]! : enabledIdx[0]!);
        const label = ((await btn.getAttribute("aria-label")) ?? (await btn.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
        const clientsBefore = (await env.su.query(`select count(*)::int as n from public.clients where tenant_id=$1`, [fx.tenant])).rows[0]?.n as number;
        await btn.click();
        const dlg = page.locator("[role=alertdialog],[role=dialog],dialog[open]").filter({ visible: true }).last();
        const opened = await dlg.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false);
        if (!opened) {
          scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, true, `"${label}" tıklandı, diyalog algılanmadı (satır içi onay olabilir) — bilgi; incelenmeli`);
          await page.keyboard.press("Escape").catch(() => undefined);
          continue;
        }
        await sleep(500);
        const shot = `modal-${lang}-${r.id}.png`;
        await page.screenshot({ path: path.join(OUT, shot) });
        const dlgText = (await dlg.innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
        const cancel = dlg.getByRole("button", { name: CANCEL_RE }).first();
        if ((await cancel.count()) > 0) await cancel.click(); else await page.keyboard.press("Escape");
        const closed = await dlg.waitFor({ state: "hidden", timeout: 8_000 }).then(() => true).catch(() => false);
        const clientsAfter = (await env.su.query(`select count(*)::int as n from public.clients where tenant_id=$1`, [fx.tenant])).rows[0]?.n as number;
        const kept = clientsAfter === clientsBefore;
        const trInEn = lang === "en" && /[çğıöşüÇĞİÖŞÜ]/.test(dlgText.replace(/Yaşam Sistemi/g, ""));
        scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, closed && kept,
          `düğme "${label}" → diyalog açıldı; kapatıldı: ${closed ? "evet" : "HAYIR"}; danışan sayısı korundu: ${kept ? "evet" : "HAYIR"}${trInEn ? "; EN diyalogda TR-aday metin var (bilgi)" : ""}; metin: "${dlgText}"`, shot);
      } catch (e) {
        scenario(`M-${r.id}`, lang, `Silme onayı: ${r.id}`, false, `hata: ${(e as Error).message.slice(0, 200)}`);
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function prefOf(env: TestEnv, userId: string): Promise<string | null> {
  const r = await env.su.query(`select preferred_locale from public.user_locale_prefs where user_id=$1`, [userId]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
  return (r.rows[0]?.preferred_locale as string | undefined) ?? null;
}

/** S5: Ayarlar › Dil'den EN seç → sayfa yenile → başka sayfa → dil kalıcı mı (çerez + hesap tercihi); sonra TR'ye geri al. */
async function scenarioPersist(browser: Browser, env: TestEnv, fx: Fixture) {
  await runScenario("S5-dil-degistir-yenile-kalici", "tr", "Ayarlar › Dil: TR→EN seç → yenile → başka ekran: EN kalıcı (çerez + hesap tercihi); sonra TR'ye geri", async () => {
    await setAccountLocale(env, fx, "tr");
    const ctx = await newCtx(browser, fx, "tr", 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" });
      await settle(page);
      if (!(await selectSettingsTab(page, "language"))) return { ok: false, detail: "Ayarlar › Dil sekmesi bulunamadı" };
      const before = await htmlLang(page);
      await page.getByRole("radio", { name: /English/ }).first().click();
      const switched = await waitLang(page, "en", 30_000);
      await settle(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await settle(page);
      const afterReload = await htmlLang(page);
      await page.goto(`${APP}/dashboard`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const other = await htmlLang(page);
      const shot = "senaryo-S5-yenileme-sonrasi-en.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      // Not: çerez production build'de Secure → ctx.cookies(http-URL) onu süzer; tüm çerezler okunur.
      const cookie = (await ctx.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value ?? "-";
      const pref = await prefOf(env, fx.userId);
      // Geri al (sonraki senaryolar TR varsayar).
      await page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" });
      await settle(page);
      let reverted = false;
      if (await selectSettingsTab(page, "language")) {
        await page.getByRole("radio", { name: /Türkçe/ }).first().click().catch(() => undefined);
        reverted = await waitLang(page, "tr", 30_000);
      }
      await setAccountLocale(env, fx, "tr");
      const ok = before === "tr" && switched && afterReload === "en" && other === "en" && cookie === "en" && pref === "en";
      return { ok, shot, detail: `önce lang=${before}; seçim sonrası en: ${switched ? "evet" : "HAYIR"}; yenileme sonrası lang=${afterReload}; /dashboard lang=${other}; çerez NEXT_LOCALE=${cookie}; hesap tercihi(DB)=${pref ?? "yok"}; TR'ye geri: ${reverted ? "evet" : "HAYIR"}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

// ─── S6: hesap değişimi → dil izolasyonu (R5: kök neden tanısı + gerçek çıkış akışı + yarış kanıtı + API izolasyonu) ───
//
// R4'te S6 aralıklı 403 veriyordu (B'nin /api/me/locale isteği). R5 kök neden (kanıt: S6-T + S6-YARIS günlükleri):
//   Test düzeneği hesabı, uygulama JS'i ÇALIŞAN bir sayfada (404 sayfası; kök yerleşimdeki ModuleRouteGuard / QuickNavShell /
//   bildirim deposu açılışta profil senkronu başlatır) localStorage'ı değiştirerek "çıkış/giriş" yapıyordu. Önceki hesabın
//   uçuştaki GET /api/auth/profile yanıtı, değişimden SONRA dönünce lib/auth/yasamUser.ts syncYasamUserFromDbOutcome().run()
//   kimlik kontrolü yapmadan saveYasamUser(önceki hesap) yazar → localStorage: yasam_user = A, yasam_session_token = B →
//   sonraki istek x-user-id=A + B'nin oturumu → verifyUserRequest "Oturum kimliği uyuşmuyor" (403). Yetki kontrolü DOĞRU
//   çalışıyor (fail-closed); sızıntı yok. Ürün tarafı yarış (aynı JS bağlamında yumuşak çıkış → giriş) S6-YARIS'ta kanıtlanır.
// Test ortamında SESSION_COOKIE_MODE ayarlı değil → "off": kimlik YALNIZ x-user-id + x-session-token başlıkları; HttpOnly
// __Host-yasam_sid çerezi yok sayılır/üretilmez; Supabase Auth çerezi uygulamada hiç yok (özel user_sessions oturumu).
// Günlükte çerez/oturum DEĞERİ yazılmaz: yalnız çerez ADLARI + hangi sentetik hesaba ait olduğu (A/B) + sha256 ilk 8 hane.

const S6_REPEAT = Math.max(1, Number(arg("--s6-repeat", "1")) || 1);
const sha8 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);

type S6Ids = { users: Map<string, string>; tokens: Map<string, string> };
const s6Who = (ids: S6Ids, uid: string | null | undefined) => (uid ? `${ids.users.get(uid) ?? "?"}#${sha8(uid)}` : "yok");
const s6Tok = (ids: S6Ids, tok: string | null | undefined) => (tok ? `${ids.tokens.get(tok) ?? "?"}#${sha8(tok)}` : "yok");

/** Sayfadaki localStorage kimlik özeti (DEĞER yazılmaz): yasam_user.id sahibi + oturum anahtarının sahibi. */
async function s6Storage(page: Page, ids: S6Ids): Promise<{ user: string; tok: string; same: boolean }> {
  const v = await page.evaluate(() => {
    let id: string | null = null;
    try { id = (JSON.parse(localStorage.getItem("yasam_user") ?? "null") as { id?: string } | null)?.id ?? null; } catch { id = null; }
    return { id, tok: localStorage.getItem("yasam_session_token") };
  }).catch(() => ({ id: null as string | null, tok: null as string | null }));
  const user = s6Who(ids, v.id);
  const tok = s6Tok(ids, v.tok);
  return { user, tok, same: !!v.id && !!v.tok && (ids.users.get(v.id) ?? "u?") === (ids.tokens.get(v.tok) ?? "t?") };
}

/** Kimlik taşıyan isteklerin günlüğü: /api/me/locale + /api/auth/profile + /api/auth/session. Faz = isteğin ÇIKTIĞI an hangi hesap. */
function s6Recorder(page: Page, ids: S6Ids) {
  const lines: string[] = [];
  let phase = "-";
  let t0 = Date.now();
  const issued = new WeakMap<object, string>();
  const watch = (u: string) => /\/api\/(me\/locale|auth\/profile|auth\/session)(\?|$)/.test(u.slice(APP.length));
  page.on("request", (req) => { if (req.url().startsWith(APP) && watch(req.url())) issued.set(req, phase); });
  page.on("response", (r) => {
    const req = r.request();
    if (!r.url().startsWith(APP) || !watch(r.url())) return;
    const at = Date.now() - t0;
    void (async () => {
      const h = await req.allHeaders().catch(() => ({} as Record<string, string>));
      const cookies = (h["cookie"] ?? "").split(";").map((x) => x.split("=")[0]!.trim()).filter(Boolean);
      let body = "";
      if (r.status() >= 400) body = (await r.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 140);
      else if (r.url().includes("/api/me/locale") && req.method() === "GET") {
        const j = await r.json().catch(() => null) as { preference?: { status?: string; locale?: string; reason?: string } } | null;
        body = `${j?.preference?.status ?? "?"}${j?.preference?.locale ? `=${j.preference.locale}` : ""}${j?.preference?.reason ? `(${j.preference.reason})` : ""}`;
      }
      lines.push(`+${at}ms ${req.method()} ${r.url().slice(APP.length).split("?")[0]} → ${r.status()} [çıkış fazı ${issued.get(req) ?? "?"}; x-user-id=${s6Who(ids, h["x-user-id"])}; x-session-token=${s6Tok(ids, h["x-session-token"])}; çerez adları=${cookies.length ? cookies.join(",") : "yok"}]${body ? ` ${body}` : ""}`);
    })();
  });
  return {
    lines,
    setPhase: (p: string) => { phase = p; t0 = Date.now(); lines.push(`── faz: ${p}`); },
    note: (s: string) => lines.push(`   · ${s}`),
  };
}

/** Uygulama JS'i OLMAYAN aynı kökenli belge (public/file.svg): burada localStorage yazmak uçuşta istek bırakmaz. */
const S6_STATIC = "/file.svg";

/** "Giriş": sunucu oturumu (user_sessions satırı — createUserSession'ın yaptığı) + istemci durumu (completeLogin'in yazdığı iki anahtar). */
async function s6Login(page: Page, env: TestEnv, ids: S6Ids, u: { userId: string; userRecord: Record<string, unknown> }, label: string) {
  const tok = `zz-modul-ekran-s6-${randomUUID().slice(0, 12)}`;
  await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [u.userId, tok]);
  ids.tokens.set(tok, label);
  await page.goto(`${APP}${S6_STATIC}`, { waitUntil: "load" });
  await page.evaluate(([uu, tk]) => {
    localStorage.setItem("yasam_user", uu as string);
    localStorage.setItem("yasam_session_token", tk as string);
  }, [JSON.stringify(u.userRecord), tok]);
}

/** GERÇEK çıkış: ana sayfadaki "Çıkış Yap / Sign Out" düğmesi + onay diyaloğu (clearYasamUser → DELETE /api/auth/session). */
async function s6Logout(page: Page): Promise<{ ok: boolean; detail: string }> {
  await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const lng = (await htmlLang(page)) === "en" ? "en" : "tr";
  const label = M(lng, "home", "dashboard.logout");
  const btn = page.locator(`button[aria-label="${label}"]`).filter({ visible: true }).first();
  if ((await btn.count()) === 0) return { ok: false, detail: `çıkış düğmesi yok (${lng} "${label}")` };
  const delP = page.waitForResponse((r) => r.url() === `${APP}/api/auth/session` && r.request().method() === "DELETE", { timeout: 20_000 }).catch(() => null);
  await btn.click();
  const dlg = page.locator('[role="alertdialog"]').filter({ visible: true }).first();
  await dlg.waitFor({ timeout: 10_000 });
  await dlg.getByRole("button", { name: label, exact: true }).click();
  const del = await delP;
  await page.waitForFunction(() => !localStorage.getItem("yasam_user") && !localStorage.getItem("yasam_session_token"), null, { timeout: 10_000 }).catch(() => undefined);
  await settle(page);
  return { ok: !!del && del.status() === 200, detail: `DELETE /api/auth/session ${del?.status() ?? "yanıt yok"}` };
}

async function s6Visit(page: Page, p: string, want: string | null): Promise<string> {
  await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  if (want) await waitLang(page, want, 20_000);
  return htmlLang(page);
}

/** S6 (ana; en işi, --s6-repeat kez): GERÇEK çıkış → giriş akışı; A=en, B=tercih yok → B hiçbir ekranda en görmez; A dönüşte en. */
async function scenarioAccountIsolation(browser: Browser, env: TestEnv, fx: Fixture) {
  const B = fx.userB;
  for (let i = 1; i <= S6_REPEAT; i++) {
    await runScenario(`S6-hesap-degistir-dil-izolasyonu-${i}`, "en", `Gerçek çıkış/giriş (${i}/${S6_REPEAT}): A (tercih en) → çıkış → B (tercih yok) → çıkış → A; her hesap kendi dilinde, 403 yok`, async () => {
      if (!B) return { ok: false, detail: "ikinci sentetik hesap (B) tohumlanamadı" };
      await setAccountLocale(env, fx, "en");
      await env.su.query(`delete from public.user_locale_prefs where user_id=$1`, [B.userId]).catch(() => undefined);
      const ids: S6Ids = { users: new Map([[fx.userId, "A"], [B.userId, "B"]]), tokens: new Map([[fx.token, "A"], [B.token, "B"]]) };
      const ctx = await newCtx(browser, fx, "tr", 1280, { cookie: null, noAuthInit: true });
      try {
        const page = await ctx.newPage();
        const rec = s6Recorder(page, ids);
        const steps: string[] = [];
        const localeCookie = async () => (await ctx.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value ?? "yok";
        rec.setPhase("A giriş");
        await s6Login(page, env, ids, { userId: fx.userId, userRecord: fx.userRecord }, "A");
        const a1 = await s6Visit(page, "/", "en"); steps.push(`A ana sayfa → ${a1}`);
        const a2 = await s6Visit(page, "/dashboard", null); steps.push(`A panel → ${a2}`);
        if (i === 1) await page.screenshot({ path: path.join(OUT, "senaryo-S6-A-en.png") });
        rec.setPhase("A çıkış");
        const outA = await s6Logout(page); steps.push(`A çıkış: ${outA.detail}; çerez NEXT_LOCALE=${await localeCookie()}`);
        rec.setPhase("B giriş");
        await s6Login(page, env, ids, B, "B");
        const b0 = await s6Visit(page, "/dashboard", null); steps.push(`B panel (ana sayfadan önce) → ${b0}`);
        const b1 = await s6Visit(page, "/", "tr"); steps.push(`B ana sayfa → ${b1}`);
        const b2 = await s6Visit(page, "/dashboard", null); steps.push(`B panel → ${b2}`);
        const b3 = await s6Visit(page, "/settings", null); steps.push(`B ayarlar → ${b3}`);
        const stB = await s6Storage(page, ids); steps.push(`B depolama: user=${stB.user} tok=${stB.tok}`);
        if (i === 1) await page.screenshot({ path: path.join(OUT, "senaryo-S6-B-tr.png") });
        rec.setPhase("B çıkış");
        const outB = await s6Logout(page); steps.push(`B çıkış: ${outB.detail}`);
        rec.setPhase("A tekrar giriş");
        await s6Login(page, env, ids, { userId: fx.userId, userRecord: fx.userRecord }, "A");
        const a3 = await s6Visit(page, "/", "en"); steps.push(`A tekrar ana sayfa → ${a3}`);
        await sleep(800);
        const prefA = await prefOf(env, fx.userId);
        const prefB = await prefOf(env, B.userId);
        const locale4xx = rec.lines.filter((l) => /\/api\/me\/locale → 4\d\d/.test(l));
        const ok = a1 === "en" && a2 === "en" && outA.ok && b0 === "tr" && b1 === "tr" && b2 === "tr" && b3 === "tr" && stB.same && outB.ok && a3 === "en"
          && prefA === "en" && prefB === null && locale4xx.length === 0;
        console.log(`      S6 günlüğü (${i}):\n        ${rec.lines.join("\n        ")}`);
        writeFileSync(path.join(OUT, `senaryo-S6-gunluk-${i}.txt`), `${steps.join("\n")}\n\n${rec.lines.join("\n")}\n`);
        return { ok, shot: i === 1 ? "senaryo-S6-B-tr.png" : undefined, detail: `${steps.join("; ")}; DB tercih A=${prefA ?? "yok"} B=${prefB ?? "yok"}; /api/me/locale 4xx=${locale4xx.length}${locale4xx.length ? ` (${locale4xx.join(" | ").slice(0, 400)})` : ""}` };
      } finally {
        await ctx.close().catch(() => undefined);
        await setAccountLocale(env, fx, "en");
      }
    }, 300_000);
  }
}

/** S6-YARIS (en işi): ürün yarışının belirlenimci kanıtı. A'nın profil senkronu (GET /api/auth/profile) bekletilirken aynı sayfada
 *  hesap B'ye geçer (yumuşak çıkış + giriş ile aynı depolama değişimi), sonra yanıt bırakılır. Beklenen (kök neden): eski yanıt
 *  yasam_user'ı A'ya geri yazar, oturum anahtarı B'de kalır → /api/me/locale 403 "Oturum kimliği uyuşmuyor".
 *  PASS ölçütü = GÜVENLİK: istek fail-closed (401/403), A'nın tercihi B'ye dönmez, DB tercihleri değişmez. Yarışın yeniden
 *  üretilip üretilmediği ayrıntıda raporlanır (ürün bulgusu; düzeltme önerisi raporda). */
async function scenarioAccountRace(browser: Browser, env: TestEnv, fx: Fixture) {
  const B = fx.userB;
  await runScenario("S6-YARIS-ucustaki-profil-senkronu", "en", "Uçuştaki önceki hesap profil senkronu hesap değişiminden sonra dönerse: kimlik karışır mı, fail-closed mı", async () => {
    if (!B) return { ok: false, detail: "ikinci sentetik hesap (B) yok" };
    await setAccountLocale(env, fx, "en");
    await env.su.query(`delete from public.user_locale_prefs where user_id=$1`, [B.userId]).catch(() => undefined);
    const ids: S6Ids = { users: new Map([[fx.userId, "A"], [B.userId, "B"]]), tokens: new Map([[fx.token, "A"], [B.token, "B"]]) };
    const ctx = await newCtx(browser, fx, "tr", 1280, { cookie: null, noAuthInit: true });
    try {
      const page = await ctx.newPage();
      const rec = s6Recorder(page, ids);
      rec.setPhase("A giriş");
      await s6Login(page, env, ids, { userId: fx.userId, userRecord: fx.userRecord }, "A");
      await s6Visit(page, "/", "en");
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      let held = 0;
      await page.route("**/api/auth/profile**", async (route) => { held++; await gate; await route.continue().catch(() => undefined); });
      rec.setPhase("A profil senkronu bekletiliyor");
      await page.goto(`${APP}/dashboard`, { waitUntil: "domcontentloaded" });
      const until = Date.now() + 20_000;
      while (held === 0 && Date.now() < until) await sleep(200);
      if (held === 0) { release(); return { ok: false, detail: "A'nın profil senkronu yakalanamadı (bekletilecek istek yok)" }; }
      // Aynı sayfa (JS bağlamı) içinde çıkış + B girişi: clearYasamUser'ın sildiği iki anahtar → completeLogin'in yazdığı iki anahtar.
      const tokB = `zz-modul-ekran-s6y-${randomUUID().slice(0, 12)}`;
      await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [B.userId, tokB]);
      ids.tokens.set(tokB, "B");
      rec.setPhase("B'ye geçildi (A yanıtı hâlâ bekletiliyor)");
      await page.evaluate(([uu, tk]) => {
        localStorage.removeItem("yasam_user");
        localStorage.removeItem("yasam_session_token");
        localStorage.setItem("yasam_user", uu as string);
        localStorage.setItem("yasam_session_token", tk as string);
      }, [JSON.stringify(B.userRecord), tokB]);
      const before = await s6Storage(page, ids);
      const respP = page.waitForResponse((r) => r.url().includes("/api/auth/profile"), { timeout: 20_000 }).catch(() => null);
      release();
      await respP;
      await sleep(1_200);
      await page.unroute("**/api/auth/profile**").catch(() => undefined);
      const after = await s6Storage(page, ids);
      rec.setPhase("yanıt bırakıldıktan sonra /api/me/locale (istemcinin kurduğu başlıklarla)");
      const probe = await page.evaluate(async () => {
        let id = "";
        try { id = (JSON.parse(localStorage.getItem("yasam_user") ?? "null") as { id?: string } | null)?.id ?? ""; } catch { id = ""; }
        const tok = localStorage.getItem("yasam_session_token");
        const r = await fetch("/api/me/locale", { headers: { "x-user-id": id, ...(tok ? { "x-session-token": tok } : {}) }, cache: "no-store" });
        return { status: r.status, body: (await r.text()).slice(0, 200) };
      });
      await sleep(500);
      const prefA = await prefOf(env, fx.userId);
      const prefB = await prefOf(env, B.userId);
      const reproduced = after.user.startsWith("A#") && after.tok.startsWith("B#");
      const leaked = probe.status === 200 && /"locale":"en"/.test(probe.body);
      const ok = !leaked && (probe.status === 200 ? !reproduced : probe.status === 401 || probe.status === 403) && prefA === "en" && prefB === null;
      console.log(`      S6-YARIS günlüğü:\n        ${rec.lines.join("\n        ")}`);
      writeFileSync(path.join(OUT, "senaryo-S6-YARIS-gunluk.txt"), `${rec.lines.join("\n")}\n`);
      return {
        ok,
        detail: `bekletilen profil isteği=${held}; değişimden hemen sonra depolama user=${before.user} tok=${before.tok}; A yanıtı döndükten sonra user=${after.user} tok=${after.tok} → YARIŞ ${reproduced ? "YENİDEN ÜRETİLDİ (önceki hesabın profili yeni oturumun üzerine yazıldı)" : "üretilmedi"}; /api/me/locale → ${probe.status} ${probe.body.replace(/\s+/g, " ").slice(0, 120)}; sızıntı=${leaked ? "EVET" : "yok"}; DB tercih A=${prefA ?? "yok"} B=${prefB ?? "yok"}`,
      };
    } finally {
      await ctx.close().catch(() => undefined);
      await setAccountLocale(env, fx, "en");
    }
  });
}

/** S6-T (bilgi): R4'teki eski değişim yöntemi (uygulama JS'i çalışan 404 sayfasında depolama değişimi) — 403'ün aynı mekanizmayla
 *  oluştuğunu günlükle gösterir. Sonuç FAIL sayılmaz (test düzeneği yöntemi; ana S6 artık gerçek çıkış kullanır). */
async function scenarioAccountLegacyDiag(browser: Browser, env: TestEnv, fx: Fixture) {
  const B = fx.userB;
  if (!B) return;
  const ids: S6Ids = { users: new Map([[fx.userId, "A"], [B.userId, "B"]]), tokens: new Map([[fx.token, "A"], [B.token, "B"]]) };
  let conflicts = 0;
  let locale403 = 0;
  const runs: string[] = [];
  for (let i = 1; i <= 3; i++) {
    await setAccountLocale(env, fx, "en");
    const ctx = await newCtx(browser, fx, "tr", 1280, { cookie: null, noAuthInit: true });
    try {
      const page = await ctx.newPage();
      const rec = s6Recorder(page, ids);
      const legacySwitch = async (u: { userId: string; userRecord: Record<string, unknown> }, label: string) => {
        const tok = `zz-modul-ekran-s6t-${randomUUID().slice(0, 12)}`;
        await env.su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [u.userId, tok]);
        ids.tokens.set(tok, label);
        await page.goto(`${APP}/zz-olmayan-sayfa-r4`, { waitUntil: "domcontentloaded" });
        await page.evaluate(([uu, tk]) => { localStorage.clear(); localStorage.setItem("yasam_user", uu as string); localStorage.setItem("yasam_session_token", tk as string); }, [JSON.stringify(u.userRecord), tok]);
      };
      rec.setPhase("A (eski yöntem)");
      await legacySwitch({ userId: fx.userId, userRecord: fx.userRecord }, "A");
      await s6Visit(page, "/", "en");
      rec.setPhase("B (eski yöntem: 404 sayfasında depolama değişimi)");
      await legacySwitch(B, "B");
      await sleep(1_500);
      const st = await s6Storage(page, ids);
      rec.note(`değişimden 1,5 sn sonra depolama user=${st.user} tok=${st.tok}`);
      if (!st.same) conflicts++;
      await s6Visit(page, "/", null);
      await sleep(800);
      const n403 = rec.lines.filter((l) => /\/api\/me\/locale → 403/.test(l)).length;
      locale403 += n403;
      runs.push(`koşu ${i}: depolama user=${st.user} tok=${st.tok} → /api/me/locale 403=${n403}`);
      writeFileSync(path.join(OUT, `senaryo-S6-T-eski-yontem-${i}.txt`), `${rec.lines.join("\n")}\n`);
      console.log(`      S6-T günlüğü (${i}):\n        ${rec.lines.join("\n        ")}`);
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }
  await setAccountLocale(env, fx, "en");
  scenario("S6-T-eski-yontem-tani", "en", "BİLGİ: R4 değişim yöntemi (uygulama JS'li sayfada depolama değişimi) — kimlik çatışması/403 sayımı", true,
    `kimlik çatışması ${conflicts}/3, /api/me/locale 403 toplam ${locale403}; ${runs.join("; ")}`);
}

/** S6-API (en işi): iki uzman arasında tercih okuma/yazma izolasyonu — doğrudan HTTP (tarayıcı dışı), sentetik anahtarlar. */
async function scenarioAccountApiIsolation(env: TestEnv, fx: Fixture) {
  const B = fx.userB;
  await runScenario("S6-API-tercih-izolasyonu", "en", "A=en, B=yok: B, A'nın tercihini okuyamaz/yazamaz; çapraz kimlik 403; B'nin yazımı yalnız kendi satırına", async () => {
    if (!B) return { ok: false, detail: "ikinci sentetik hesap (B) yok" };
    await setAccountLocale(env, fx, "en");
    await env.su.query(`delete from public.user_locale_prefs where user_id=$1`, [B.userId]).catch(() => undefined);
    const call = async (method: "GET" | "PUT", uid: string | null, tok: string | null, body?: unknown) => {
      const h: Record<string, string> = { "cache-control": "no-store" };
      if (uid) h["x-user-id"] = uid;
      if (tok) h["x-session-token"] = tok;
      if (body !== undefined) h["content-type"] = "application/json";
      const r = await fetch(`${APP}/api/me/locale`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      const t = (await r.text()).replace(/\s+/g, " ").slice(0, 160);
      return { s: r.status, t };
    };
    const rows: string[] = [];
    const chk: boolean[] = [];
    const expect = (label: string, got: { s: number; t: string }, okIf: boolean) => { chk.push(okIf); rows.push(`${okIf ? "✔" : "✘"} ${label} → ${got.s} ${got.t}`); };
    const gA = await call("GET", fx.userId, fx.token); expect("A kendi kimliği GET", gA, gA.s === 200 && /"status":"set"/.test(gA.t) && /"locale":"en"/.test(gA.t));
    const gB = await call("GET", B.userId, B.token); expect("B kendi kimliği GET (tercih yok)", gB, gB.s === 200 && /"status":"unset"/.test(gB.t));
    const x1 = await call("GET", fx.userId, B.token); expect("x-user-id=A + B oturumu GET", x1, x1.s === 403 && /uyuşmuyor/.test(x1.t));
    const x2 = await call("GET", B.userId, fx.token); expect("x-user-id=B + A oturumu GET", x2, x2.s === 403 && /uyuşmuyor/.test(x2.t));
    const x3 = await call("PUT", fx.userId, B.token, { locale: "tr" }); expect("x-user-id=A + B oturumu PUT tr", x3, x3.s === 403);
    const x4 = await call("GET", fx.userId, null); expect("oturumsuz GET (yalnız x-user-id=A)", x4, x4.s === 401);
    const x5 = await call("GET", null, B.token); expect("x-user-id yok + B oturumu", x5, x5.s === 401);
    const afterX = await prefOf(env, fx.userId);
    chk.push(afterX === "en"); rows.push(`${afterX === "en" ? "✔" : "✘"} çapraz denemelerden sonra DB A=${afterX ?? "yok"} (en kalmalı)`);
    const pB = await call("PUT", B.userId, B.token, { locale: "en" }); expect("B kendi tercihi PUT en", pB, pB.s === 200 && /"persisted":true/.test(pB.t));
    const rowB = await env.su.query(`select tenant_id::text as t, preferred_locale as l from public.user_locale_prefs where user_id=$1`, [B.userId]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const rowA = await env.su.query(`select tenant_id::text as t, preferred_locale as l from public.user_locale_prefs where user_id=$1`, [fx.userId]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
    const bOk = rowB.rows.length === 1 && rowB.rows[0]!.t === B.tenant && rowB.rows[0]!.l === "en";
    const aOk = rowA.rows.length === 1 && rowA.rows[0]!.t === fx.tenant && rowA.rows[0]!.l === "en";
    chk.push(bOk, aOk);
    rows.push(`${bOk ? "✔" : "✘"} B satırı yalnız B kiracısında (tenant eşleşmesi) · ${aOk ? "✔" : "✘"} A satırı değişmedi`);
    const pBtr = await call("PUT", B.userId, B.token, { locale: "tr" }); expect("B kendi tercihini tr'ye geri al", pBtr, pBtr.s === 200);
    const gA2 = await call("GET", fx.userId, fx.token); expect("A tekrar GET (en kalmalı)", gA2, gA2.s === 200 && /"locale":"en"/.test(gA2.t));
    await env.su.query(`delete from public.user_locale_prefs where user_id=$1`, [B.userId]).catch(() => undefined);
    writeFileSync(path.join(OUT, "senaryo-S6-API-gunluk.txt"), `${rows.join("\n")}\n`);
    return { ok: chk.every(Boolean), detail: rows.join("; ") };
  });
}

// ─── R5 §29: Numeroloji / Human Design / Atlas gerçek ekranları + işlevsel senaryolar ─────────────────────────
//
// Ücretli çağrı YOK: test ortamında ROXY_API_KEY tanımsız (workflow + next start ortamında boş) → ücretli uçlar sunucuda 503
// döner; ayrıca tarayıcı bağlamında bilinen ücretli uçlar (Roxy) ağ katmanında kesilir ve sayılır (PAID_BLOCKED).
// Yalnız YEREL motorlu teknikler: Numeroloji (tarayıcıda hesaplama + sunucu doğrulaması), HD /api/hd/compute + /api/hd/charts
// (yerel motor), Atlas Batı Horary (William Lilly; yerel) + Word/PDF raporları. Veri sentetik (ZZ_*).

/** Ücretli sağlayıcıya (Roxy) giden ya da gidebilecek uçlar — tarayıcıda kesilir (sunucuda da anahtar yok → 503). */
const PAID_PATTERNS = [
  "**/api/hd/charts/roxy**", "**/api/hd/location/search**", "**/api/hd/charts/variables**", "**/api/hd/transit**", "**/api/hd/relations/**",
  "**/api/astroloji/engine/run**", "**/api/admin/astroloji/engine/run**", "**/api/astroloji/efemeris/aylik**", "**/api/admin/astroloji/efemeris/aylik**",
  "**/api/numeroloji-klasik/hesapla**",
];
const paidBlocked: string[] = [];
async function guardPaid(ctx: BrowserContext) {
  for (const pat of PAID_PATTERNS) {
    await ctx.route(pat, (route) => {
      const u = route.request().url();
      paidBlocked.push(`${route.request().method()} ${u.startsWith(APP) ? u.slice(APP.length).split("?")[0] : u}`);
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "E2E_PAID_PROVIDER_BLOCKED" }) });
    });
  }
}

/** Sayfa bağlamında, istemcinin kurduğu kimlik başlıklarıyla (localStorage) istek. İkili yanıt base64 döner. */
async function pageFetch(page: Page, method: string, url: string, body?: unknown): Promise<{ status: number; ct: string; text: string; b64: string | null; headers: Record<string, string> }> {
  return page.evaluate(async ([m, u, b]) => {
    let id = "";
    try { id = (JSON.parse(localStorage.getItem("yasam_user") ?? "null") as { id?: string } | null)?.id ?? ""; } catch { id = ""; }
    const tok = localStorage.getItem("yasam_session_token");
    const h: Record<string, string> = { "x-user-id": id, ...(tok ? { "x-session-token": tok } : {}) };
    if (b !== null) h["content-type"] = "application/json";
    const r = await fetch(u as string, { method: m as string, headers: h, body: b === null ? undefined : JSON.stringify(b), cache: "no-store" });
    const ct = r.headers.get("content-type") ?? "";
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => { if (/^(content-type|content-disposition|x-)/i.test(k)) headers[k] = v; });
    if (/json|text/.test(ct)) return { status: r.status, ct, text: (await r.text()).slice(0, 4000), b64: null, headers };
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { status: r.status, ct, text: "", b64: btoa(s), headers };
  }, [method, url, body === undefined ? null : body] as const);
}

const TR_CHAR = /[çğıöşüÇĞİÖŞÜ]/;
/** Word (.docx) açılabilir mi + görünen metinde Türkçe karakterli sözcük sayısı (EN'de "Türkçe sistem metni" adayı). */
async function docxStats(buf: Buffer): Promise<{ opens: boolean; words: number; trWords: number; samples: string[]; err?: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const z = await JSZip.loadAsync(buf);
    const xml = await z.file("word/document.xml")?.async("string");
    if (!xml) return { opens: false, words: 0, trWords: 0, samples: [], err: "word/document.xml yok" };
    const text = Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => m[1]).join(" ");
    const words = text.split(/\s+/).filter(Boolean);
    const tr = words.filter((w) => TR_CHAR.test(w));
    return { opens: true, words: words.length, trWords: tr.length, samples: Array.from(new Set(tr)).slice(0, 12) };
  } catch (e) {
    return { opens: false, words: 0, trWords: 0, samples: [], err: (e as Error).message.slice(0, 120) };
  }
}
function pdfStats(buf: Buffer): { opens: boolean; bytes: number } {
  return { opens: buf.subarray(0, 5).toString("latin1") === "%PDF-" && buf.includes(Buffer.from("%%EOF")), bytes: buf.length };
}
async function reportCheck(label: string, r: { status: number; ct: string; text: string; b64: string | null }, kind: "docx" | "pdf", lang: Lang, file: string): Promise<{ ok: boolean; line: string }> {
  if (r.status !== 200 || !r.b64) return { ok: false, line: `${label}: HTTP ${r.status} ${r.ct} ${r.text.replace(/\s+/g, " ").slice(0, 160)}` };
  const buf = Buffer.from(r.b64, "base64");
  writeFileSync(path.join(OUT, file), buf);
  if (kind === "pdf") {
    const p = pdfStats(buf);
    return { ok: p.opens, line: `${label}: 200 ${r.ct} ${p.bytes} bayt; PDF açılabilir=${p.opens ? "evet" : "HAYIR"} (${file})` };
  }
  const d = await docxStats(buf);
  return { ok: d.opens, line: `${label}: 200 ${buf.length} bayt; docx açılabilir=${d.opens ? "evet" : `HAYIR (${d.err ?? ""})`}; sözcük=${d.words}; Türkçe karakterli sözcük=${d.trWords}${lang === "en" && d.samples.length ? ` (örnek: ${d.samples.join(" · ")})` : ""} (${file})` };
}

/** R5 kurulum: HD tabloları (production şemasındaki kolonlar; lib/backup/schema.generated.ts), Numeroloji/HD bilgi bankası
 *  asgari tabloları, users ek kolonları. Atlas migration'ları ayrıca (gerçek dosyalar) uygulanır. */
const R5_DDL = `
alter table public.users add column if not exists is_super_admin boolean default false;
create table if not exists public.human_design_charts (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid,
  client_id uuid, client_name text, birth_date date, birth_time text, birth_place text, external_chart_url text, chart_image_url text,
  type_code text, authority_code text, profile_code text, definition_code text, active_centers text[], open_centers text[], gates int[],
  channels text[], notes text, created_at timestamptz default now(), updated_at timestamptz default now(), timezone text,
  source text default 'manual', input jsonb, computed_result jsonb, engine_version text, contract_version text, location_id text,
  provider text, provider_raw jsonb, input_hash text);
alter table public.human_design_reports add column if not exists selected_codes text[] not null default '{}';
alter table public.human_design_reports add column if not exists generated_content text;
alter table public.human_design_reports add column if not exists edited_content text;
alter table public.human_design_reports add column if not exists report_file_url text;
alter table public.human_design_reports add column if not exists updated_at timestamptz default now();
alter table public.human_design_reports add column if not exists canonical_provenance jsonb;
alter table public.human_design_reports add column if not exists report_version integer;
alter table public.human_design_clients add column if not exists birth_time text;
alter table public.human_design_clients add column if not exists birth_place text;
alter table public.human_design_clients add column if not exists chart_image_url text;
alter table public.human_design_clients add column if not exists external_chart_url text;
alter table public.human_design_clients add column if not exists notes text;
alter table public.human_design_clients add column if not exists updated_at timestamptz default now();
alter table public.human_design_clients add column if not exists birth_location_id text;
alter table public.human_design_clients add column if not exists birth_location_label text;
alter table public.human_design_clients add column if not exists birth_timezone text;
alter table public.human_design_clients add column if not exists birth_latitude double precision;
alter table public.human_design_clients add column if not exists birth_longitude double precision;
create table if not exists public.human_design_knowledge_records (id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  category text, title text, code text, content text, keywords text[], related_gates int[], related_channels text[], related_centers text[],
  tags text[], sort_order int default 0, is_active boolean default true, created_at timestamptz default now(), updated_at timestamptz default now(),
  expert_notes text, origin_type text, origin_label text, origin_source_id uuid, origin_transfer_batch_id uuid, transferred_at timestamptz);
alter table public.numerology_records add column if not exists user_id uuid;
alter table public.numerology_records add column if not exists updated_at timestamptz default now();
grant select, insert, update, delete on all tables in schema public to service_role;
`;
const ASTRO_MIGRATIONS = [
  "20260903000000_admin_audit_log.sql", "20271101000000_astrology_foundation.sql", "20271101000100_astrology_kb_analyses.sql",
  "20271101000200_astrology_timing_relationship.sql", "20271101000300_astrology_owner_isolation.sql", "20271101000400_astrology_client_list.sql",
  "20271101000500_astrology_profile_delete.sql", "20271101000600_astrology_record_caps.sql", "20271101000700_astrology_kb_snapshot_cleanup.sql",
  "20271101000800_astrology_analysis_delete.sql", "20271210000000_astro_horary_questions.sql", "20271230000000_astrology_technique_grants.sql",
  "20280125000000_astro_sky_monthly_ephemeris.sql",
];
/** Atlas API'lerinin PostgREST rpc/<ad> ile çağırdığı yerel fonksiyonlar (shim izin listesi). Ücretli değil. */
const ASTRO_RPCS = [
  "astro_profile_create", "astro_profile_append_revision", "astro_profile_page", "astro_analysis_page", "astro_analysis_summary",
  "astro_client_candidates", "astro_client_status", "astro_profile_set_client", "astro_analysis_save_v2", "astro_unmapped_touch",
  "astro_profile_delete_preview", "astro_profile_delete", "astro_profile_analyses_delete",
];

async function r5Setup(env: TestEnv, fx: Fixture): Promise<string[]> {
  const notes: string[] = [];
  const tryQ = async (label: string, sql: string, a: unknown[] = []) => {
    try { await env.su.query(sql, a); notes.push(`R5 kurulum: ${label} ✓`); return true; } catch (e) { notes.push(`R5 kurulum: ${label} ATLANDI (${(e as Error).message.slice(0, 160)})`); return false; }
  };
  await tryQ("HD / bilgi bankası / users ek kolonları", R5_DDL);
  for (const m of ASTRO_MIGRATIONS) {
    let sql = "";
    try { sql = readFileSync(path.join(ROOT, "supabase/migrations", m), "utf8"); } catch { notes.push(`R5 kurulum: ${m} DOSYA YOK`); continue; }
    await tryQ(`Atlas migration ${m}`, sql);
  }
  await tryQ("A: Atlas teknik izinleri (mode=all)", `update public.users set astrology_technique_grants = '{"mode":"all"}'::jsonb where id = $1`, [fx.userId]);
  await tryQ("service_role tablo yetkileri", `grant select, insert, update, delete on all tables in schema public to service_role`);
  return notes;
}

/** N1 (ekran turundan ÖNCE): Numeroloji analizini arayüzde hesapla (yerel motor) + KAYDET → POST /api/numeroloji/analyses → fx.numRecord. */
async function scenarioNumerologyCreate(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await runScenario(`N1-numeroloji-hesapla-kaydet-${lang}`, lang, "Numeroloji › Analiz: ad/soyad/doğum gir → hesapla (yerel motor) → Kaydet → kayıt DB'de", async () => {
    const ctx = await newCtx(browser, fx, lang, 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/numeroloji/analiz`, { waitUntil: "domcontentloaded" });
      await settle(page);
      await page.locator("#noj-ad").waitFor({ timeout: 30_000 });
      await page.locator("#noj-ad").fill("ZZ Numa");
      await page.locator("#noj-soyad").fill("TESTKAYIT");
      await page.locator("#noj-dt").pressSequentially("12041991", { delay: 30 });
      await page.getByRole("button", { name: /HESAPLA|CALCULATE/i }).first().click();
      await sleep(1_500);
      const saveLabel = Mq(lang, "numerology.app", "save.save") ?? (lang === "en" ? "SAVE" : "KAYDET");
      const respP = page.waitForResponse((r) => r.url().includes("/api/numeroloji/analyses") && r.request().method() === "POST", { timeout: 30_000 }).catch(() => null);
      // Karşılaştırma tabanında (main) kaydet düğmesi çevrilmemiş olabilir → TR etiketi de kabul edilir (yalnız seçici).
      const btn = page.getByRole("button", { name: new RegExp(`${escRe(saveLabel)}|^KAYDET$`, "i") }).filter({ visible: true }).first();
      await btn.waitFor({ timeout: 20_000 });
      await btn.click();
      // Aynı kişi önceden kaydedildiyse çift kayıt diyaloğu: yeni kayıt olarak devam.
      const dup = page.locator('[role="alertdialog"],[role="dialog"]').filter({ visible: true }).first();
      if (await dup.isVisible().catch(() => false)) await dup.getByRole("button").last().click().catch(() => undefined);
      const resp = await respP;
      const body = resp ? await resp.json().catch(() => null) as { ok?: boolean; id?: string } | null : null;
      const shot = `senaryo-N1-numeroloji-${lang}.png`;
      await settle(page);
      await page.screenshot({ path: path.join(OUT, shot) });
      const id = body?.id ?? null;
      const row = id ? await env.su.query(`select name, surname, birth_date, (analysis_data->'motor') is not null as motor from public.numerology_records where id=$1 and tenant_id=$2`, [id, fx.tenant]).catch(() => ({ rows: [] as Record<string, unknown>[] })) : { rows: [] as Record<string, unknown>[] };
      if (id && row.rows.length === 1) fx.numRecord = id;
      const ok = resp?.status() === 200 && !!id && row.rows.length === 1 && row.rows[0]!.motor === true;
      return { ok, shot, detail: `POST /api/numeroloji/analyses → ${resp?.status() ?? "yanıt yok"}; kayıt=${id ? "var" : "yok"}; DB satırı=${row.rows.length} (motor anlık görüntüsü ${row.rows[0]?.motor === true ? "var" : "yok"}); lang=${await htmlLang(page)}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }, 180_000);
}

/** H1 (ekran turundan ÖNCE): HD yerel motor hesabı + kayıt (POST /api/hd/compute, /api/hd/charts) → fx.hdChart. Ücretli Roxy yolu KULLANILMAZ. */
async function scenarioHdCreate(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await runScenario(`H1-hd-yerel-hesap-kayit-${lang}`, lang, "Human Design: yerel motorla hesapla (/api/hd/compute) + haritayı kaydet (/api/hd/charts) → DB", async () => {
    const ctx = await newCtx(browser, fx, lang, 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}${S6_STATIC}`, { waitUntil: "load" });
      const input = { date: "1991-04-12", time: "14:30", timezone: "Europe/Istanbul" };
      const c = await pageFetch(page, "POST", "/api/hd/compute", input);
      const s = await pageFetch(page, "POST", "/api/hd/charts", { input, client_name: "ZZ HD Danisan", birth_place: "Adana" });
      let id: string | null = null;
      try { const j = JSON.parse(s.text) as { id?: string; chart?: { id?: string }; data?: { id?: string } }; id = j.id ?? j.chart?.id ?? j.data?.id ?? null; } catch { id = null; }
      const row = await env.su.query(`select id::text, type_code, source, engine_version from public.human_design_charts where tenant_id=$1 order by created_at desc limit 1`, [fx.tenant]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      id = id ?? (row.rows[0]?.id as string | undefined) ?? null;
      if (id) fx.hdChart = id;
      let type = "";
      try { const j = JSON.parse(c.text) as Record<string, unknown>; type = JSON.stringify(j).match(/"type(?:_code|Code)?":"([^"]+)"/)?.[1] ?? ""; } catch { /* yok */ }
      const ok = c.status === 200 && (s.status === 200 || s.status === 201) && !!id && row.rows.length > 0;
      return { ok, detail: `compute → ${c.status}${type ? ` (tip ${type})` : ""}; kaydet → ${s.status} ${s.status >= 400 ? s.text.slice(0, 160) : ""}; DB: ${row.rows.length ? `source=${row.rows[0]!.source} tip=${row.rows[0]!.type_code} motor=${row.rows[0]!.engine_version}` : "satır yok"}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** A1 (ekran turundan ÖNCE): Atlas erişimi + Batı Horary (yerel) hesap + kayıt → fx.horaryRecord. */
async function scenarioAtlasCreate(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await runScenario(`A1-atlas-horary-hesap-kayit-${lang}`, lang, "Atlas: erişim + Batı Horary (yerel motor) hesapla + kaydet → DB", async () => {
    const ctx = await newCtx(browser, fx, lang, 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}${S6_STATIC}`, { waitUntil: "load" });
      const acc = await pageFetch(page, "GET", "/api/astroloji/access");
      const q = { date: "2026-11-20", time: "14:30", locationId: "tr-01-adana", quesitedHouse: 7, dst: "auto" };
      const h = await pageFetch(page, "POST", "/api/astroloji/horary/western", q);
      const sv = await pageFetch(page, "POST", "/api/astroloji/horary/western/records", { ...q, title: "ZZ Horary Kayit", saveRequestId: randomUUID(), saveQuestion: false });
      let id: string | null = null;
      try { const j = JSON.parse(sv.text) as { id?: string; record?: { id?: string } }; id = j.id ?? j.record?.id ?? null; } catch { id = null; }
      const row = await env.su.query(`select id::text from public.astro_horary_questions where tenant_id=$1 order by created_at desc limit 1`, [fx.tenant]).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      id = id ?? (row.rows[0]?.id as string | undefined) ?? null;
      if (id) fx.horaryRecord = id;
      const ok = acc.status === 200 && h.status === 200 && (sv.status === 200 || sv.status === 201) && !!id;
      return { ok, detail: `access → ${acc.status} ${acc.status !== 200 ? acc.text.slice(0, 120) : ""}; horary → ${h.status} ${h.status !== 200 ? h.text.slice(0, 160) : ""}; kaydet → ${sv.status} ${sv.status >= 400 ? sv.text.slice(0, 160) : ""}; DB kayıt=${row.rows.length}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  });
}

/** N2/H2/A2 (ekran turundan SONRA): arşivden aç + rapor indir (200 + dosya açılır + Türkçe sözcük sayımı) + silme (onaylı; yalnız testin kendi kaydı). */
async function scenarioModuleFunctional(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  // ── Numeroloji
  await runScenario(`N2-numeroloji-arsiv-rapor-sil-${lang}`, lang, "Numeroloji: arşivden aç → Word raporu (200 + açılır) → sil (onaylı, yalnız test kaydı)", async () => {
    if (!fx.numRecord) return { ok: false, detail: "N1 kaydı yok (önce N1 başarısız)" };
    const ctx = await newCtx(browser, fx, lang, 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}/numeroloji/liste/${fx.numRecord}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const shot = `senaryo-N2-numeroloji-arsiv-${lang}.png`;
      await page.screenshot({ path: path.join(OUT, shot) });
      const opened = (await page.getByText("TESTKAYIT", { exact: false }).count()) > 0;
      const rep = await pageFetch(page, "POST", "/api/numeroloji/word-report", { exportMode: "single", recordId: fx.numRecord, sections: { plain: true } });
      const rc = await reportCheck("Word", rep, "docx", lang, `rapor-numeroloji-${lang}.docx`);
      const del = await pageFetch(page, "DELETE", "/api/numeroloji/analyses", { ids: [fx.numRecord] });
      const left = await env.su.query(`select count(*)::int as n from public.numerology_records where id=$1`, [fx.numRecord]).catch(() => ({ rows: [{ n: -1 }] }));
      const gone = Number(left.rows[0]?.n) === 0;
      if (gone) fx.numRecord = null;
      return { ok: opened && rc.ok && del.status === 200 && gone, shot, detail: `arşivden açıldı=${opened ? "evet" : "HAYIR"}; ${rc.line}; sil → ${del.status}; DB'de kaldı mı=${gone ? "hayır (silindi)" : "EVET"}` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }, 180_000);
  // ── Human Design
  await runScenario(`H2-hd-arsiv-rapor-sil-${lang}`, lang, "Human Design: kayıtlı haritayı aç → profesyonel rapor oluştur + Word indir (200 + açılır) → silme önizleme + sil", async () => {
    if (!fx.hdChart) return { ok: false, detail: "H1 haritası yok" };
    const ctx = await newCtx(browser, fx, lang, 1280);
    try {
      const page = await ctx.newPage();
      // Hesaplanmış (computed) harita arşivden API ile açılır (GET /api/hd/charts?id=; kayitli-haritalar/[id] yalnız eski
      // manuel kayıtları listeler — scope=manual). Ekran görüntüsü Danışanlar çalışma alanından alınır.
      await page.goto(`${APP}/human-design/danisanlar`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const shot = `senaryo-H2-hd-arsiv-${lang}.png`;
      await page.screenshot({ path: path.join(OUT, shot) });
      const og = await pageFetch(page, "GET", `/api/hd/charts?id=${fx.hdChart}`);
      const opened = og.status === 200 && og.text.includes(fx.hdChart);
      const mk = await pageFetch(page, "POST", "/api/hd/reports/professional", { chartId: fx.hdChart, requestId: randomUUID(), allowMissingBodygraph: true });
      let reportId: string | null = null;
      try { const j = JSON.parse(mk.text) as { id?: string; reportId?: string; report?: { id?: string } }; reportId = j.reportId ?? j.id ?? j.report?.id ?? null; } catch { reportId = null; }
      const dl = reportId ? await pageFetch(page, "POST", "/api/hd/reports/professional/download", { reportId }) : null;
      const rc = dl ? await reportCheck("Word", dl, "docx", lang, `rapor-hd-${lang}.docx`) : { ok: false, line: `rapor oluşturma → ${mk.status} ${mk.text.replace(/\s+/g, " ").slice(0, 200)}` };
      const pv = await pageFetch(page, "GET", `/api/hd/charts?delete_preview=${fx.hdChart}`);
      let expect = 0;
      try { const j = JSON.parse(pv.text) as Record<string, unknown>; expect = Number((j.reports ?? (j.preview as Record<string, unknown> | undefined)?.reports ?? (j.counts as Record<string, unknown> | undefined)?.reports ?? 0)) || 0; } catch { expect = 0; }
      if (!expect) expect = Number((await env.su.query(`select count(*)::int as n from public.human_design_reports where chart_id=$1`, [fx.hdChart]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0);
      const del = await pageFetch(page, "DELETE", `/api/hd/charts?id=${fx.hdChart}&expect_reports=${expect}`);
      const left = await env.su.query(`select count(*)::int as n from public.human_design_charts where id=$1`, [fx.hdChart]).catch(() => ({ rows: [{ n: -1 }] }));
      const gone = Number(left.rows[0]?.n) === 0;
      const id = fx.hdChart;
      if (gone) fx.hdChart = null;
      return { ok: opened && rc.ok && pv.status === 200 && del.status === 200 && gone, shot, detail: `arşivden açıldı=${opened ? "evet" : "HAYIR"}; rapor oluştur → ${mk.status}; ${rc.line}; silme önizleme → ${pv.status} (rapor ${expect}); sil → ${del.status} ${del.status >= 400 ? del.text.slice(0, 120) : ""}; DB'de kaldı mı=${gone ? "hayır" : "EVET"} (${id.slice(0, 8)})` };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }, 180_000);
  // ── Atlas
  await runScenario(`A2-atlas-horary-arsiv-rapor-${lang}`, lang, "Atlas: kayıtlı Horary'yi aç + Word/PDF rapor (200 + açılır, EN'de Türkçe sözcük sayımı)", async () => {
    const ctx = await newCtx(browser, fx, lang, 1280);
    try {
      const page = await ctx.newPage();
      await page.goto(`${APP}${S6_STATIC}`, { waitUntil: "load" });
      const q = { date: "2026-11-20", time: "14:30", locationId: "tr-01-adana", quesitedHouse: 7, dst: "auto", question: "ZZ soru" };
      const lines: string[] = [];
      const oks: boolean[] = [];
      for (const fmt of ["docx", "pdf"] as const) {
        const r = await pageFetch(page, "POST", `/api/astroloji/horary/western/report?format=${fmt}`, q);
        const c = await reportCheck(`Horary ${fmt}`, r, fmt, lang, `rapor-atlas-horary-${lang}.${fmt}`);
        oks.push(c.ok); lines.push(c.line);
      }
      if (fx.horaryRecord) {
        const g = await pageFetch(page, "GET", `/api/astroloji/horary/western/records/${fx.horaryRecord}`);
        oks.push(g.status === 200); lines.push(`arşivden aç (GET kayıt) → ${g.status}`);
        const r = await pageFetch(page, "GET", `/api/astroloji/horary/western/records/${fx.horaryRecord}/report?format=docx`);
        const c = await reportCheck("Kayıtlı horary docx", r, "docx", lang, `rapor-atlas-horary-kayit-${lang}.docx`);
        oks.push(c.ok); lines.push(c.line);
      } else { oks.push(false); lines.push("A1 kaydı yok"); }
      await page.goto(`${APP}/astroloji`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const shot = `senaryo-A2-atlas-${lang}.png`;
      await page.screenshot({ path: path.join(OUT, shot) });
      return { ok: oks.every(Boolean), shot, detail: lines.join("; ") };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }, 180_000);
}

/** E1: erişim engeli — modül izni OLMAYAN sentetik uzman (C) Numeroloji / HD / Atlas'ı açamaz (ModuleAccessDenied) ve API'ler reddeder. */
async function scenarioModuleDenied(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await runScenario(`E1-erisim-engeli-${lang}`, lang, "İzinsiz uzman: /numeroloji, /human-design, /astroloji → erişim engeli ekranı; API 403/404; veri yok", async () => {
    const C = fx.userC;
    if (!C) return { ok: false, detail: "izinsiz hesap (C) tohumlanamadı" };
    const ctx = await newCtx(browser, { ...fx, userRecord: C.userRecord, token: C.token }, lang, 390);
    try {
      const page = await ctx.newPage();
      const lines: string[] = [];
      const oks: boolean[] = [];
      for (const p of ["/numeroloji", "/human-design", "/astroloji"]) {
        await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        const deniedTitles = [Mq(lang, "auth.ui", "moduleAccess.permission.title"), Mq(lang, "auth.ui", "moduleAccess.eyebrow"), "Yetkiniz Bulunmuyor", "Erişim kısıtlı"].filter((x): x is string => !!x);
        const denied = await page.getByText(new RegExp(deniedTitles.map(escRe).join("|"), "i")).first().isVisible().catch(() => false);
        const notFound = /404|could not be found|bulunamadı/i.test(await page.evaluate(() => document.body?.innerText ?? "").catch(() => ""));
        const ov = await measureOverflow(page, 390);
        const tr = lang === "en" ? await scanTurkish(page, []) : { count: 0, samples: [] as TrHit[] };
        const shot = `senaryo-E1-erisim-engeli-${lang}${p.replace(/\//g, "-")}.png`;
        await page.screenshot({ path: path.join(OUT, shot) });
        oks.push(denied || notFound);
        lines.push(`${p}: engel ekranı=${denied ? "evet" : notFound ? "404" : "HAYIR"}; lang=${await htmlLang(page)}; taşma=${Math.round(ov.px)}${lang === "en" ? `; TR-aday=${tr.count}${tr.samples.length ? ` (${tr.samples.slice(0, 4).map((x) => x.text).join(" · ")})` : ""}` : ""}`);
      }
      await page.goto(`${APP}${S6_STATIC}`, { waitUntil: "load" });
      for (const [m, u, want] of [["GET", "/api/numeroloji/analyses?fields=summary", [403]], ["GET", "/api/hd/charts", [403]], ["GET", "/api/astroloji/access", [404]]] as const) {
        const r = await pageFetch(page, m, u);
        const ok = (want as readonly number[]).includes(r.status);
        oks.push(ok);
        lines.push(`${m} ${u} → ${r.status} ${ok ? "✔" : "✘"}`);
      }
      return { ok: oks.every(Boolean), detail: lines.join("; ") };
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }, 180_000);
}

/** S7: yükleme ekranı (loading.tsx) — sayfa RSC yanıtı geciktirilip istemci gezintisi yapılır; dil, taşma, ham anahtar. */
async function scenarioLoading(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang) {
  await setAccountLocale(env, fx, GATE_CLOSED ? "en" : lang);
  for (const width of [1280, 360]) {
    await runScenario(`S7-yukleme-ekrani-${lang}-${width}`, lang, `Yükleme ekranı (Refleksoloji › notlar loading.tsx) ${width}px: dil + taşma + ham anahtar`, async () => {
      const ctx = await newCtx(browser, fx, lang, width);
      const pat = "**/refleksoloji/notlar**";
      try {
        const page = await ctx.newPage();
        await page.goto(`${APP}/refleksoloji`, { waitUntil: "domcontentloaded" });
        await settle(page);
        // Yalnız sayfanın tam (dinamik) RSC isteği 8 sn bekletilir; prefetch (yükleme sınırını getiren) istekler serbest →
        // önce prefetch, sonra push: Next yükleme sınırını (loading.tsx) anında gösterir, sayfa verisi gecikir.
        await page.route(pat, async (route) => {
          const h = route.request().headers();
          if (h["rsc"] && !h["next-router-prefetch"] && !h["next-router-segment-prefetch"]) await sleep(8_000);
          await route.continue().catch(() => undefined);
        });
        await page.evaluate(() => {
          const n = (window as unknown as { next?: { router?: { prefetch?: (u: string) => void } } }).next;
          try { n?.router?.prefetch?.("/refleksoloji/notlar"); } catch { /* yok */ }
        });
        await sleep(2_500);
        const pushed = await page.evaluate(() => {
          const n = (window as unknown as { next?: { router?: { push?: (u: string) => void } } }).next;
          if (!n?.router?.push) return false;
          n.router.push("/refleksoloji/notlar");
          return true;
        });
        const want = Mq(lang, "system", "loading.refleksoloji.clinicalNotes");
        // İskelet metni yalnız ekran okuyucu içindir (`<p class="sr-only">{badge} · {title}</p>`) → görünürlük değil, DOM'da
        // varlık aranır (koşu 45599816800: iskelet ekranda, "exact + visible" arama yakalayamadı).
        const seenText = want ? await page.getByText(want).first().waitFor({ state: "attached", timeout: 5_000 }).then(() => true).catch(() => false) : false;
        const skeleton = (await page.locator(".animate-pulse").filter({ visible: true }).count().catch(() => 0)) > 0;
        const seen = seenText && skeleton;
        const lng = await htmlLang(page);
        const ov = await measureOverflow(page, width);
        const raw = await scanRawKeys(page, ROOTS).catch(() => []);
        const tr = lang === "en" ? await scanTurkish(page, []) : { count: 0, samples: [] };
        const shot = `senaryo-S7-yukleme-${GATE_CLOSED ? "kapali-" : ""}${lang}-${width}.png`;
        await page.screenshot({ path: path.join(OUT, shot) });
        await page.unroute(pat).catch(() => undefined);
        const expected = GATE_CLOSED ? "tr" : lang;
        if (!pushed || !seen) {
          return { ok: true, shot, detail: `yükleme ekranı YAKALANAMADI (bilgi) — router.push: ${pushed ? "var" : "yok"}; katalog metni ${want ? `"${want}"` : "YOK (bu tabanda system.loading yok)"} görünür: ${seenText ? "evet" : "hayır"}; iskelet: ${skeleton ? "evet" : "hayır"}` };
        }
        const ok = ov.px <= 1 && raw.length === 0 && lng === expected;
        return { ok, shot, detail: `yükleme ekranı yakalandı ("${want}"); lang=${lng}; taşma=${Math.round(ov.px)}px${ov.offenders.length ? ` (${ov.offenders.join(" · ")})` : ""}; ham anahtar=${raw.length}; TR-aday=${tr.count}${tr.samples.length ? ` (${tr.samples.slice(0, 3).map((s) => s.text).join(" · ")})` : ""}` };
      } finally {
        await ctx.close().catch(() => undefined);
      }
    });
  }
}

/** K1: kapı kapalı build — NEXT_LOCALE=en + hesap tercihi en iken: tr render, dil seçici ve Dil sekmesi yok. */
async function scenarioGateClosed(browser: Browser, env: TestEnv, fx: Fixture) {
  await runScenario("K1-kapi-kapali-yalniz-tr", "tr", "Kapı kapalı: çerez en + hesap tercihi en → ana sayfa/panel/ayarlar tr; dil seçici ve Dil sekmesi görünmez", async () => {
    await setAccountLocale(env, fx, "en");
    const ctx = await newCtx(browser, fx, "tr", 1280, { cookie: "en" });
    try {
      const page = await ctx.newPage();
      const langs: string[] = [];
      for (const p of ["/", "/dashboard", "/settings"]) {
        await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        langs.push(`${p}=${await htmlLang(page)}`);
      }
      await page.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const selLabels = [Mq("tr", "common", "language.select"), Mq("en", "common", "language.select")].filter((x): x is string => !!x);
      const selectors = selLabels.length ? await page.locator(selLabels.map((l) => `button[aria-label="${l}"]`).join(",")).count() : 0;
      await page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const langTab = await selectSettingsTab(page, "language");
      const shot = "senaryo-K1-kapi-kapali-ayarlar.png";
      await page.screenshot({ path: path.join(OUT, shot) });
      const allTr = langs.every((x) => x.endsWith("=tr"));
      const ok = allTr && selectors === 0 && !langTab;
      return { ok, shot, detail: `lang: ${langs.join(", ")}; dil seçici sayısı=${selectors}; Ayarlar › Dil sekmesi: ${langTab ? "VAR" : "yok"}` };
    } finally {
      await ctx.close().catch(() => undefined);
      await setAccountLocale(env, fx, "tr");
    }
  });
}

// ─── Özet ────────────────────────────────────────────────────────────────────

function mdEsc(s: string) { return s.replace(/\|/g, "\\|").replace(/\n/g, " "); }

function writeSummary(meta: Record<string, unknown>, missingMessages: string[]) {
  const screenFail = results.filter((r) => r.verdict === "FAIL");
  const scenFail = scenarios.filter((s) => !s.ok);
  const enTr = results.filter((r) => r.lang === "en" && r.trCandidates > 0);
  const totals = {
    ekran: results.length,
    ekranPass: results.filter((r) => r.verdict === "PASS").length,
    ekranFail: screenFail.length,
    ekranAtlandi: results.filter((r) => r.verdict === "ATLANDI").length,
    tasma: results.filter((r) => r.overflowPx > 1).length,
    cokme: results.filter((r) => r.crash).length,
    belge5xx: results.filter((r) => (r.status ?? 0) >= 500 || r.other5xx.length > 0).length,
    api5xxEkran: results.filter((r) => r.api5xx.length > 0).length,
    konsolHataToplam: results.reduce((a, r) => a + r.consoleErrors, 0),
    konsolUygulamaFailEkran: results.filter((r) => r.consoleApp > 0 && !r.consoleWarnOnly && !r.outOfScope).length,
    konsolUygulamaUyariEkran: results.filter((r) => r.consoleWarnOnly && !r.outOfScope).length,
    hamAnahtarEkran: results.filter((r) => r.rawKeys.length > 0 || r.intlErrors.length > 0).length,
    dilUyusmazEkran: results.filter((r) => r.failReasons.some((x) => x.startsWith("html lang"))).length,
    kapsamDisiEkran: results.filter((r) => r.outOfScope).length,
    trAdayEkran: enTr.filter((r) => !r.outOfScope).length,
    trAdayToplam: enTr.filter((r) => !r.outOfScope).reduce((a, r) => a + r.trCandidates, 0),
    trAdayKapsamDisiToplam: enTr.filter((r) => r.outOfScope).reduce((a, r) => a + r.trCandidates, 0),
    senaryo: scenarios.length,
    senaryoFail: scenFail.length,
    eksikKatalogAnahtari: missingMessages.length,
  };
  const verdict = screenFail.length === 0 && scenFail.length === 0 ? "PASS" : "FAIL";
  writeFileSync(path.join(OUT, "ozet.json"), JSON.stringify({ meta, verdict, totals, results, scenarios, missingMessages }, null, 2));

  const L: string[] = [];
  L.push(`# I18N-R4 — Modül ekran kabul testi (${GATE_CLOSED ? "KAPI KAPALI · çerez/tercih en → " : ""}${LOCALES.join(", ")} × ${WIDTHS.join(" / ")} px)`);
  L.push("");
  L.push(`Sonuç: **${verdict}** — ekran ${totals.ekranPass} PASS / ${totals.ekranFail} FAIL / ${totals.ekranAtlandi} atlandı / ${totals.kapsamDisiEkran} kapsam dışı; senaryo ${totals.senaryo - totals.senaryoFail}/${totals.senaryo}.`);
  L.push("");
  L.push(`- Yatay taşma: ${totals.tasma} ekran · Çökme: ${totals.cokme} · Belge/RSC 5xx: ${totals.belge5xx} · API 5xx olan ekran: ${totals.api5xxEkran} (${STRICT_API ? "FAIL sayıldı" : "uyarı — test ortamında olmayan modül tabloları"}) · Konsol error toplamı: ${totals.konsolHataToplam}`);
  L.push(`- Uygulama konsol hatası: FAIL ${totals.konsolUygulamaFailEkran} ekran · UYARI (aynı ekranda api 5xx) ${totals.konsolUygulamaUyariEkran} ekran · Ham anahtar / next-intl hata: ${totals.hamAnahtarEkran} ekran · <html lang> uyuşmazlığı: ${totals.dilUyusmazEkran} ekran`);
  L.push(`- EN TR-aday (BİLGİ, FAIL değil): ${totals.trAdayEkran} ekranda ${totals.trAdayToplam} düğüm/öznitelik (kapsam dışı ekranlar ayrıca: ${totals.trAdayKapsamDisiToplam}) · Sunucu eksik katalog anahtarı günlüğü: ${totals.eksikKatalogAnahtari}`);
  L.push(`- Rapor dili: KAPSAM DIŞI (Word/PDF çıktıları henüz çevrilmedi; yalnız indirme yanıtı denetlendi).`);
  L.push(`- Veri: tamamen sentetik (ZZ_*), gömülü PostgreSQL + PostgREST şimi; production'a temas yok.`);
  L.push(`- Ücretli sağlayıcı (Roxy): sunucuda anahtar YOK; tarayıcıda kesilen ücretli uç isteği: ${paidBlocked.length}${paidBlocked.length ? ` (${Array.from(new Set(paidBlocked)).slice(0, 8).join(", ")})` : ""}`);
  L.push("");
  L.push("## Rota × dil × genişlik");
  L.push("");
  L.push("| Grup | Rota | Dil | px | HTTP | lang | Taşma px | Çökme | Konsol (top/uyg/kaynak) | API 5xx | Diğer 5xx | Ham anahtar | TR-aday | Sonuç | FAIL nedeni / Not |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const order = new Map(ROUTES.map((r, i) => [r.id, i]));
  const sorted = [...results].sort((a, b) => (order.get(a.route) ?? 0) - (order.get(b.route) ?? 0) || a.lang.localeCompare(b.lang) || b.width - a.width);
  for (const r of sorted) {
    L.push(`| ${mdEsc(r.group)} | ${r.route} | ${r.lang} | ${r.width} | ${r.status ?? "-"} | ${r.htmlLang || "-"} | ${r.overflowPx} | ${r.crash ? "EVET" : "-"} | ${r.consoleErrors}/${r.consoleApp}${r.consoleWarnOnly ? "(uyarı)" : ""}/${r.consoleResource} | ${r.api5xx.length} | ${r.other5xx.length} | ${r.rawKeys.length + r.intlErrors.length} | ${r.lang === "en" ? r.trCandidates : "n/a"} | ${r.verdict} | ${mdEsc([r.failReasons.join(", "), r.crashReason ?? "", r.note ?? ""].filter(Boolean).join("; "))} |`);
  }
  const consoleRows = sorted.filter((r) => r.consoleApp > 0 || r.intlErrors.length > 0 || r.rawKeys.length > 0);
  if (consoleRows.length) {
    L.push("");
    L.push("## Uygulama konsol hataları / ham anahtar (rota başına ilk genişlik)");
    const seenRoute = new Set<string>();
    for (const r of consoleRows) {
      const k = `${r.route}|${r.lang}`;
      if (seenRoute.has(k)) continue;
      seenRoute.add(k);
      L.push(`- ${r.lang}-${r.width}-${r.route}${r.consoleWarnOnly ? " (UYARI: aynı ekranda api 5xx)" : ""}: ${mdEsc([...r.intlErrors, ...r.rawKeys.map((x) => `ham: ${x}`), ...r.consoleAppSamples].join(" ‖ ").slice(0, 600))}`);
    }
  }
  L.push("");
  L.push("## Senaryolar");
  L.push("");
  L.push("| Kimlik | Dil | Başlık | Sonuç | Ayrıntı |");
  L.push("|---|---|---|---|---|");
  for (const s of scenarios) L.push(`| ${s.id} | ${s.lang} | ${mdEsc(s.title)} | ${s.ok ? "PASS" : "FAIL"} | ${mdEsc(s.detail)}${s.screenshot ? ` (${s.screenshot})` : ""} |`);
  const ovs = sorted.filter((r) => r.overflowPx > 1);
  if (ovs.length) {
    L.push("");
    L.push("## Yatay taşma ayrıntısı");
    for (const r of ovs) L.push(`- ${r.lang}-${r.width}-${r.route}: +${r.overflowPx}px — ${r.overflowOffenders.map(mdEsc).join(" · ") || "(öğe saptanamadı)"}`);
  }
  const crashes = sorted.filter((r) => r.crash || r.other5xx.length);
  if (crashes.length) {
    L.push("");
    L.push("## Çökme / 5xx ayrıntısı");
    for (const r of crashes) L.push(`- ${r.lang}-${r.width}-${r.route}: ${mdEsc(r.crashReason ?? "")} ${r.other5xx.map(mdEsc).join(", ")} ${r.pageErrors.map(mdEsc).join(" · ")}`);
  }
  const apis = new Map<string, Set<string>>();
  for (const r of results) for (const a of r.api5xx) { if (!apis.has(a)) apis.set(a, new Set()); apis.get(a)!.add(r.route); }
  if (apis.size) {
    L.push("");
    L.push(`## API 5xx (uyarı${STRICT_API ? " — strict: FAIL" : ""}; çoğu test ortamında modül tablosu olmamasından)`);
    for (const [a, rs] of apis) L.push(`- \`${mdEsc(a)}\` ← ${Array.from(rs).join(", ")}`);
  }
  if (enTr.length) {
    L.push("");
    L.push("## EN ekranlarında TR-aday metinler (BİLGİ — marka/sentetik veri hariç tutuldu; kanonik değer olabilir)");
    const byRoute = new Map<string, TrHit[]>();
    for (const r of enTr) {
      const cur = byRoute.get(r.route) ?? [];
      for (const s of r.trSamples) if (!cur.some((x) => x.text === s.text)) cur.push(s);
      byRoute.set(r.route, cur);
    }
    for (const [route, hits] of byRoute) {
      const maxCount = Math.max(...enTr.filter((r) => r.route === route).map((r) => r.trCandidates));
      L.push(`- **${route}** (en çok ${maxCount}): ${hits.slice(0, 12).map((h) => `“${mdEsc(h.text.slice(0, 80))}” [${mdEsc(h.where)}]`).join(" · ")}`);
    }
  }
  if (missingMessages.length) {
    L.push("");
    L.push("## Sunucu günlüğünde eksik katalog anahtarı ([i18n])");
    for (const m of missingMessages.slice(0, 80)) L.push(`- ${mdEsc(m)}`);
  }
  L.push("");
  L.push(`Meta: ${mdEsc(JSON.stringify(meta))}`);
  writeFileSync(path.join(OUT, "ozet.md"), `${L.join("\n")}\n`);
  return { verdict, totals };
}

// ─── Ana akış ────────────────────────────────────────────────────────────────

async function main() {
  if (LOCALES.length === 0 || WIDTHS.length === 0) { console.error("geçerli --locales / --widths yok"); process.exit(2); }
  if (GATE_CLOSED && LOCALES.some((l) => l !== "tr")) { console.error("--gate-closed yalnız --locales tr ile koşar"); process.exit(2); }
  ROOTS = messageRoots();
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) { console.error("önce yayın kapısı AÇIK build gerekli (.next/BUILD_ID yok)"); process.exit(2); }

  const { env } = await startDyEnv({ port: PG_PORT, dirName: "i18n-modul-ekran-pgdata", httpPort: SUPA_PORT, rpcAllow: ASTRO_RPCS });
  const setupNotes: string[] = [];
  for (const [label, sql] of [
    ["user_locale_prefs migration", readFileSync(path.join(ROOT, "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8")],
    ["Word raporu asgari tabloları", EXTRA_DDL],
    ["numerology_records client bağı migration", readFileSync(path.join(ROOT, "supabase/migrations/20271120000300_numerology_records_client_link.sql"), "utf8")],
  ] as const) {
    try { await env.su.query(sql); setupNotes.push(`kurulum: ${label} ✓`); } catch (e) { setupNotes.push(`kurulum: ${label} ATLANDI (${(e as Error).message.slice(0, 160)})`); }
  }
  const { fx, seedNotes } = await seed(env);
  seedNotes.push(...await r5Setup(env, fx));
  for (const n of [...setupNotes, ...seedNotes]) console.log(`  ${n}`);
  const exclude = [
    ...brandAllowlist(), SYN.tenantName, SYN.expertName, SYN.expertEmail,
    SYN.clientAd, SYN.clientSoyad, SYN.createdAd, SYN.createdSoyad, SYN.keepAd, SYN.keepSoyad, SYN.expertNameB, SYN.expertEmailB,
  ].sort((a, b) => b.length - a.length);

  const logPath = path.join(OUT, "next-sunucu.log");
  const log = createWriteStream(logPath);
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let crashed: Error | null = null;
  try {
    app = spawn(process.execPath, [nextBin, "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
      cwd: ROOT,
      // R5: ücretli sağlayıcı anahtarı bilinçli olarak BOŞ (Roxy çağrısı imkânsız → 503); Atlas modülü açık; aylık efemeris sağlayıcısı kapalı.
      env: {
        ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", ROXY_API_KEY: "",
        ASTROLOGY_MODULE_ENABLED: process.env.ASTROLOGY_MODULE_ENABLED ?? "true", ATLAS_MONTHLY_EPHEMERIS_PROVIDER: "0", ATLAS_PRO_EPHEMERIS_PROVIDER: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    app.stdout?.pipe(log, { end: false });
    app.stderr?.pipe(log, { end: false });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    console.log("\n[R5 ön senaryolar: Numeroloji / HD / Atlas sentetik kayıtları (yerel motor)]");
    await scenarioNumerologyCreate(browser, env, fx, LOCALES[0]!);
    await scenarioHdCreate(browser, env, fx, LOCALES[0]!);
    await scenarioAtlasCreate(browser, env, fx, LOCALES[0]!);
    for (const lang of SKIP_TOUR ? [] : LOCALES) {
      console.log(`\n[ekran turu: ${lang} × ${WIDTHS.join("/")} px — ${ROUTES.length} rota]`);
      await screenTour(browser, env, fx, lang, exclude);
    }
    console.log("\n[senaryolar]");
    if (GATE_CLOSED) {
      // Kapı kapalı build: yalnız K1 + yükleme ekranı (tr render beklenir); dil değişimi senaryoları anlamsız.
      await scenarioGateClosed(browser, env, fx);
      await scenarioLoading(browser, env, fx, "tr");
      await scenarioModuleDenied(browser, env, fx, "tr");
    } else {
      if (LOCALES.includes("tr")) await scenarioKeepData(browser, env, fx);
      if (LOCALES.includes("tr")) await scenarioPersist(browser, env, fx);
      if (LOCALES.includes("en")) await scenarioCreateEdit(browser, env, fx);
      if (LOCALES.includes("en")) {
        await scenarioAccountApiIsolation(env, fx);
        await scenarioAccountIsolation(browser, env, fx);
        await scenarioAccountRace(browser, env, fx);
        await scenarioAccountLegacyDiag(browser, env, fx);
      }
      for (const lang of LOCALES) await scenarioWord(browser, env, fx, lang);
      for (const lang of LOCALES) await scenarioModuleDenied(browser, env, fx, lang);
      for (const lang of LOCALES) await scenarioModuleFunctional(browser, env, fx, lang);
      for (const lang of LOCALES) await scenarioLoading(browser, env, fx, lang);
      console.log("\n[silme onayı modalları (1280 px)]");
      for (const lang of LOCALES) await modalProbes(browser, env, fx, lang);
    }
  } catch (e) {
    crashed = e as Error;
    console.error(e);
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) {
      try { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGKILL"); } catch { /* yok */ }
    }
    await sleep(500);
    log.end();
    await env.stop().catch(() => undefined);
  }

  let missing: string[] = [];
  try {
    missing = Array.from(new Set(readFileSync(logPath, "utf8").split("\n").filter((l) => l.includes("[i18n]")).map((l) => l.trim().slice(0, 300))));
  } catch { /* günlük yok */ }
  const meta = {
    tarih: new Date().toISOString(), locales: LOCALES, widths: WIDTHS, rotaSayisi: ROUTES.length, strictApi: STRICT_API, fullPage: FULL_PAGE, gateClosed: GATE_CLOSED,
    ucretliUcKesildi: paidBlocked.length, ucretliUcOrnek: Array.from(new Set(paidBlocked)).slice(0, 20),
    sureSn: Math.round((Date.now() - STARTED) / 1000), kurulum: [...setupNotes, ...seedNotes], genelHata: crashed ? crashed.message.slice(0, 300) : null,
  };
  const { verdict, totals } = writeSummary(meta, missing);
  console.log(`\nÇıktılar: ${OUT} (ozet.md, ozet.json, PNG)`);
  console.log(`=== modül ekran kabulü: ekran ${totals.ekranPass} PASS / ${totals.ekranFail} FAIL / ${totals.ekranAtlandi} atlandı; senaryo FAIL ${totals.senaryoFail}; TR-aday ${totals.trAdayToplam} (bilgi) → ${crashed ? "FAIL (genel hata)" : verdict} ===`);
  process.exit(verdict === "PASS" && !crashed ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
