/**
 * I18N-F1-R3 — MODÜL EKRAN KABUL TESTİ (gerçek Chromium; PRODUCTION'A SIFIR TEMAS; yalnız sentetik veri).
 *
 * Amaç: kapsam içi TÜM uzman modül ekranlarını Türkçe / İngilizce × 1280 / 390 / 360 px genişlikte açıp
 *   - ekran görüntüsü           → <out>/<dil>-<genişlik>-<rota-adı>.png
 *   - yatay taşma               → scrollWidth ≤ genişlik + 1 (aşan öğeler tanı için listelenir)
 *   - sayfa çökmesi             → yakalanmamış hata (pageerror) / Next hata ekranı / belge-RSC 5xx
 *   - konsol error sayısı       → bilgi (örnekleriyle)
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
 *
 * Kapsam DIŞI (Owner kararı): Numeroloji, Human Design, Atlas/Astroloji, Kozmik Ajanda, Şifa Rehberi, admin ekranları.
 *
 * Ön koşul (gizli değer YOK; production adresi YOK) — yayın kapısı AÇIK build:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret NEXT_PUBLIC_I18N_LOCALE_SWITCHING=on npx next build
 * Çalıştır (CI: .github/workflows/i18n-modul-ekran.yml):
 *   npx tsx scripts/i18n/modul-ekran-kabul.e2e.ts --out <klasör> [--locales tr,en] [--widths 1280,390,360]
 *       [--only <rota-id-virgüllü>] [--budget-min 42] [--strict-api] [--full-page]
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
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const WIDTHS = arg("--widths", "1280,390,360").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 320);
const ONLY = new Set(arg("--only", "").split(",").map((s) => s.trim()).filter(Boolean));
const BUDGET_MS = Number(arg("--budget-min", "42")) * 60_000;
const STRICT_API = argv.includes("--strict-api") || process.env.MODUL_EKRAN_STRICT_API === "1";
const FULL_PAGE = argv.includes("--full-page") || process.env.MODUL_EKRAN_FULL_PAGE === "1";
const APP_PORT = Number(process.env.MODUL_EKRAN_APP_PORT ?? 3997);
const APP = `http://127.0.0.1:${APP_PORT}`;
const SUPA_PORT = Number(process.env.I18N_E2E_SUPA_PORT ?? 54398);
const PG_PORT = Number(process.env.MODUL_EKRAN_PG_PORT ?? 54481);
const ROOT = process.cwd();
const STARTED = Date.now();
mkdirSync(OUT, { recursive: true });

const HEIGHT: Record<number, number> = { 1280: 900, 390: 844, 360: 780 };
const STABILIZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;
const CRASH_TEXT = /This page couldn[’']t load|Application error: a (client|server)-side exception/i;
const NOISE_PAGEERROR = /Failed to fetch|NetworkError|Load failed|AbortError|ResizeObserver loop/i;

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
};

const CLIENT_TABS = ["genel", "anamnez", "notlar", "seanslar", "odevler", "analizler", "taslar", "beslenme", "hafiza", "randevular", "yolculuk", "ucretlendirme"] as const;
const SETTINGS_TABS = ["security", "profile", "location", "contact", "export", "backup", "restore", "membership", "workspace", "language"] as const;

const ROUTES: RouteDef[] = [
  { id: "ana-sayfa", group: "Ana sayfa / panel", path: "/" },
  { id: "panel", group: "Ana sayfa / panel", path: "/dashboard" },
  ...SETTINGS_TABS.map((t): RouteDef => ({
    id: t === "membership" ? "ayarlar-uyeligim" : `ayarlar-${t}`, group: "Ayarlar", path: "/settings", settingsTab: t, optionalTab: t === "workspace",
  })),
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
grant select, insert, update, delete on all tables in schema public to service_role;
`;

type Fixture = { tenant: string; userId: string; token: string; client: string; anamnesis: string | null; userRecord: Record<string, unknown> };

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
      `insert into public.client_anamneses(tenant_id, client_id, kind, title, assessment_date, status, template_version, answers, created_by_user_id, completed_by_user_id, completed_at)
       values ($1,$2,'initial','ZZ anamnez formu','2026-11-10','completed','std-v1',$3,$4,$4,'2026-11-10T10:00:00Z') returning id`,
      [tenant, client, JSON.stringify({ "A.reason": "ZZ basvuru nedeni" }), userId],
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
  return { fx: { tenant, userId, token, client, anamnesis, userRecord }, seedNotes: notes };
}

// ─── Sonuç tipleri ───────────────────────────────────────────────────────────

type TrHit = { text: string; where: string };
type RouteResult = {
  route: string; group: string; lang: Lang; width: number; url: string; finalPath: string; status: number | null;
  screenshot: string | null; overflowPx: number; overflowOffenders: string[]; crash: boolean; crashReason: string | null;
  pageErrors: string[]; consoleErrors: number; consoleSamples: string[]; api5xx: string[]; other5xx: string[];
  trCandidates: number; trSamples: TrHit[]; note: string | null; ms: number; verdict: "PASS" | "FAIL" | "ATLANDI";
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
const shotName = (lang: Lang, width: number, id: string) => `${lang}-${width}-${id}.png`;

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

async function newCtx(browser: Browser, fx: Fixture, lang: Lang, width: number): Promise<BrowserContext> {
  const mobile = width < 768;
  const ctx = await browser.newContext({
    viewport: { width, height: HEIGHT[width] ?? 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
    locale: lang === "en" ? "en-GB" : "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true,
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: lang, url: APP }]);
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

// ─── Ekran turu ──────────────────────────────────────────────────────────────

function resolvePath(p: string, fx: Fixture): string | null {
  if (p.includes("{anamnesis}") && !fx.anamnesis) return null;
  return p.replace("{client}", fx.client).replace("{anamnesis}", fx.anamnesis ?? "");
}

async function visitRoute(page: Page, t: ReturnType<typeof track>, r: RouteDef, lang: Lang, width: number, fx: Fixture, exclude: string[]): Promise<RouteResult> {
  const started = Date.now();
  const base: RouteResult = {
    route: r.id, group: r.group, lang, width, url: r.path, finalPath: "", status: null, screenshot: null, overflowPx: 0, overflowOffenders: [],
    crash: false, crashReason: null, pageErrors: [], consoleErrors: 0, consoleSamples: [], api5xx: [], other5xx: [], trCandidates: 0, trSamples: [],
    note: null, ms: 0, verdict: "PASS",
  };
  if (Date.now() - STARTED > BUDGET_MS) return { ...base, note: "süre bütçesi aşıldı — atlandı", verdict: "ATLANDI" };
  const p = resolvePath(r.path, fx);
  if (!p) return { ...base, note: "tohum kaydı yok (anamnez) — atlandı", verdict: "ATLANDI" };
  base.url = p;
  t.reset();
  try {
    await withTimeout((async () => {
      await page.goto(`${APP}${p}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settle(page);
      if (r.settingsTab) {
        const okTab = await selectSettingsTab(page, r.settingsTab);
        if (!okTab) {
          base.note = r.optionalTab ? "sekme bu hesapta yok (isteğe bağlı) — atlandı" : "sekme bulunamadı";
          if (r.optionalTab) base.verdict = "ATLANDI";
        }
        await settle(page);
      }
    })(), 90_000, r.id);
  } catch (e) {
    base.crash = true;
    base.crashReason = `yüklenemedi: ${(e as Error).message.slice(0, 200)}`;
  }
  const b = t.bucket();
  base.status = b.docStatus;
  base.finalPath = page.url().startsWith(APP) ? page.url().slice(APP.length) : page.url();
  if (base.verdict === "ATLANDI") { base.ms = Date.now() - started; return base; }
  const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : "")).catch(() => "");
  if (CRASH_TEXT.test(bodyText)) { base.crash = true; base.crashReason = base.crashReason ?? "Next hata ekranı (This page couldn’t load / Application error)"; }
  if (b.pageErrors.length) { base.crash = true; base.crashReason = base.crashReason ?? `yakalanmamış hata: ${b.pageErrors[0]}`; }
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
    const file = shotName(lang, width, r.id);
    await page.screenshot({ path: path.join(OUT, file), fullPage: FULL_PAGE, timeout: 30_000 });
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
  const docFail = (base.status ?? 0) >= 500 || base.other5xx.length > 0;
  const fail = base.crash || docFail || base.overflowPx > 1 || (STRICT_API && base.api5xx.length > 0);
  base.verdict = fail ? "FAIL" : "PASS";
  base.ms = Date.now() - started;
  return base;
}

async function screenTour(browser: Browser, env: TestEnv, fx: Fixture, lang: Lang, exclude: string[]) {
  await setAccountLocale(env, fx, lang);
  const routes = ROUTES.filter((r) => ONLY.size === 0 || ONLY.has(r.id));
  // Genişlikler paralel (her biri kendi bağlamında); rotalar her genişlikte sıralı.
  await Promise.all(WIDTHS.map(async (width) => {
    const ctx = await newCtx(browser, fx, lang, width);
    let page = await ctx.newPage();
    let t = track(page);
    for (const r of routes) {
      const res = await visitRoute(page, t, r, lang, width, fx, exclude);
      results.push(res);
      const flag = res.verdict === "PASS" ? "PASS" : res.verdict === "FAIL" ? "FAIL" : "ATLA";
      console.log(`  ${flag} [${lang} ${width}] ${r.id} http=${res.status ?? "-"} taşma=${res.overflowPx} çökme=${res.crash ? "E" : "H"} konsol=${res.consoleErrors} api5xx=${res.api5xx.length}${lang === "en" ? ` tr-aday=${res.trCandidates}` : ""}${res.note ? ` (${res.note})` : ""}`);
      if (res.crash) {
        // Çöken sayfa sonraki rotayı etkilemesin: yeni sekme.
        await page.close().catch(() => undefined);
        page = await ctx.newPage();
        t = track(page);
      }
    }
    await ctx.close().catch(() => undefined);
  }));
}

// ─── Senaryolar ──────────────────────────────────────────────────────────────

function scenario(id: string, lang: Lang, title: string, ok: boolean, detail: string, screenshot?: string) {
  scenarios.push({ id, lang, title, ok, detail, screenshot });
  console.log(`  ${ok ? "PASS" : "FAIL"} [${lang}] ${id} ${title}${detail ? ` → ${detail.slice(0, 300)}` : ""}`);
}

async function runScenario(id: string, lang: Lang, title: string, fn: () => Promise<{ ok: boolean; detail: string; shot?: string }>) {
  try {
    const r = await withTimeout(fn(), 150_000, id);
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
        const btn = r.modal === "last" ? btns.nth(n - 1) : btns.first();
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
    trAdayEkran: enTr.length,
    trAdayToplam: enTr.reduce((a, r) => a + r.trCandidates, 0),
    senaryo: scenarios.length,
    senaryoFail: scenFail.length,
    eksikKatalogAnahtari: missingMessages.length,
  };
  const verdict = screenFail.length === 0 && scenFail.length === 0 ? "PASS" : "FAIL";
  writeFileSync(path.join(OUT, "ozet.json"), JSON.stringify({ meta, verdict, totals, results, scenarios, missingMessages }, null, 2));

  const L: string[] = [];
  L.push(`# I18N-F1-R3 — Modül ekran kabul testi (${LOCALES.join(", ")} × ${WIDTHS.join(" / ")} px)`);
  L.push("");
  L.push(`Sonuç: **${verdict}** — ekran ${totals.ekranPass} PASS / ${totals.ekranFail} FAIL / ${totals.ekranAtlandi} atlandı; senaryo ${totals.senaryo - totals.senaryoFail}/${totals.senaryo}.`);
  L.push("");
  L.push(`- Yatay taşma: ${totals.tasma} ekran · Çökme: ${totals.cokme} · Belge/RSC 5xx: ${totals.belge5xx} · API 5xx olan ekran: ${totals.api5xxEkran} (${STRICT_API ? "FAIL sayıldı" : "uyarı — test ortamında olmayan modül tabloları"}) · Konsol error toplamı: ${totals.konsolHataToplam}`);
  L.push(`- EN TR-aday (BİLGİ, FAIL değil): ${totals.trAdayEkran} ekranda ${totals.trAdayToplam} düğüm/öznitelik · Sunucu eksik katalog anahtarı günlüğü: ${totals.eksikKatalogAnahtari}`);
  L.push(`- Rapor dili: KAPSAM DIŞI (Word/PDF çıktıları henüz çevrilmedi; yalnız indirme yanıtı denetlendi).`);
  L.push(`- Veri: tamamen sentetik (ZZ_*), gömülü PostgreSQL + PostgREST şimi; production'a temas yok.`);
  L.push("");
  L.push("## Rota × dil × genişlik");
  L.push("");
  L.push("| Grup | Rota | Dil | px | HTTP | Taşma px | Çökme | Konsol err | API 5xx | Diğer 5xx | TR-aday | Sonuç | Not |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const order = new Map(ROUTES.map((r, i) => [r.id, i]));
  const sorted = [...results].sort((a, b) => (order.get(a.route) ?? 0) - (order.get(b.route) ?? 0) || a.lang.localeCompare(b.lang) || b.width - a.width);
  for (const r of sorted) {
    L.push(`| ${mdEsc(r.group)} | ${r.route} | ${r.lang} | ${r.width} | ${r.status ?? "-"} | ${r.overflowPx} | ${r.crash ? "EVET" : "-"} | ${r.consoleErrors} | ${r.api5xx.length} | ${r.other5xx.length} | ${r.lang === "en" ? r.trCandidates : "n/a"} | ${r.verdict} | ${mdEsc((r.crashReason ? `${r.crashReason}; ` : "") + (r.note ?? ""))} |`);
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
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) { console.error("önce yayın kapısı AÇIK build gerekli (.next/BUILD_ID yok)"); process.exit(2); }

  const { env } = await startDyEnv({ port: PG_PORT, dirName: "i18n-modul-ekran-pgdata", httpPort: SUPA_PORT });
  const setupNotes: string[] = [];
  for (const [label, sql] of [
    ["user_locale_prefs migration", readFileSync(path.join(ROOT, "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8")],
    ["Word raporu asgari tabloları", EXTRA_DDL],
    ["numerology_records client bağı migration", readFileSync(path.join(ROOT, "supabase/migrations/20271120000300_numerology_records_client_link.sql"), "utf8")],
  ] as const) {
    try { await env.su.query(sql); setupNotes.push(`kurulum: ${label} ✓`); } catch (e) { setupNotes.push(`kurulum: ${label} ATLANDI (${(e as Error).message.slice(0, 160)})`); }
  }
  const { fx, seedNotes } = await seed(env);
  for (const n of [...setupNotes, ...seedNotes]) console.log(`  ${n}`);
  const exclude = [
    ...brandAllowlist(), SYN.tenantName, SYN.expertName, SYN.expertEmail,
    SYN.clientAd, SYN.clientSoyad, SYN.createdAd, SYN.createdSoyad, SYN.keepAd, SYN.keepSoyad,
  ].sort((a, b) => b.length - a.length);

  const logPath = path.join(OUT, "next-sunucu.log");
  const log = createWriteStream(logPath);
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let crashed: Error | null = null;
  try {
    app = spawn(process.execPath, [nextBin, "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
      cwd: ROOT,
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    app.stdout?.pipe(log, { end: false });
    app.stderr?.pipe(log, { end: false });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    for (const lang of LOCALES) {
      console.log(`\n[ekran turu: ${lang} × ${WIDTHS.join("/")} px — ${ROUTES.length} rota]`);
      await screenTour(browser, env, fx, lang, exclude);
    }
    console.log("\n[senaryolar]");
    if (LOCALES.includes("tr")) await scenarioKeepData(browser, env, fx);
    if (LOCALES.includes("en")) await scenarioCreateEdit(browser, env, fx);
    for (const lang of LOCALES) await scenarioWord(browser, env, fx, lang);
    console.log("\n[silme onayı modalları (1280 px)]");
    for (const lang of LOCALES) await modalProbes(browser, env, fx, lang);
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
    tarih: new Date().toISOString(), locales: LOCALES, widths: WIDTHS, rotaSayisi: ROUTES.length, strictApi: STRICT_API, fullPage: FULL_PAGE,
    sureSn: Math.round((Date.now() - STARTED) / 1000), kurulum: [...setupNotes, ...seedNotes], genelHata: crashed ? crashed.message.slice(0, 300) : null,
  };
  const { verdict, totals } = writeSummary(meta, missing);
  console.log(`\nÇıktılar: ${OUT} (ozet.md, ozet.json, PNG)`);
  console.log(`=== modül ekran kabulü: ekran ${totals.ekranPass} PASS / ${totals.ekranFail} FAIL / ${totals.ekranAtlandi} atlandı; senaryo FAIL ${totals.senaryoFail}; TR-aday ${totals.trAdayToplam} (bilgi) → ${crashed ? "FAIL (genel hata)" : verdict} ===`);
  process.exit(verdict === "PASS" && !crashed ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
