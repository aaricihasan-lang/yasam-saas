/**
 * FAZ1 FINAL HARDENING — PAKET INFRA harness (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/infra.harness.ts
 *
 * Kapsam:
 *   - Güvenlik başlıkları + minimal enforced CSP + Report-Only CSP (Supabase host'u env'den)
 *   - next.config.ts headers() bağlantısı + poweredByHeader:false
 *   - GA rota izin listesi (public-only, oturumda kapalı) + URL maskeleme
 *   - dataResidency (env yoksa placeholder; Tokyo/Frankfurt hardcode YOK)
 *   - Hukuki sayfalar TASLAK işaretli; gizlilik metninde eski yanlış iddialar YOK
 *   - KVKK onam sözleşmesi (doğrulama, güncel durum türetme, özet) + route statik güvenliği
 *   - server-only: "use client" dosyalarından service-role/secret modüllerine import yolu 0
 *   - legacy grants (migration 1100): anon istemci kullanan dosyalarda kilitlenen tablolara erişim 0
 *   - drift compare.mjs: iyi/bozuk manifest
 *   - gelecek zaman metinleri (INFRA dosyaları)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildEnforcedCsp,
  buildReportOnlyCsp,
  buildSecurityHeaders,
  supabaseOrigins,
} from "../../lib/security/securityHeaders";
import {
  GA_MEASUREMENT_ID,
  analyticsPagePath,
  isGaAllowedPath,
  redactAnalyticsUrl,
  shouldEnableAnalytics,
} from "../../lib/legal/analyticsPolicy";
import { DATA_REGION_PLACEHOLDER, getDataResidency } from "../../lib/legal/dataResidency";
import { LEGAL_DRAFT_MARK } from "../../lib/legal/legalDraft";
import {
  CONSENT_METHODS,
  CONSENT_STATUSES,
  CONSENT_TEXT_VERSION,
  CONSENT_TYPES,
  deriveCurrentConsents,
  summarizeConsents,
  validateConsentInput,
} from "../../lib/legal/clientConsent";
import { assertServerOnly } from "../../lib/server/serverOnlyGuard";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}:`, (e as Error).message);
  }
}

// ── Küçük modül grafiği (yalnız `@/` + relative; type-only import'lar hariç) ──────────
const SRC_DIRS = ["app", "components", "lib", "shared", "hooks", "i18n"];
const EXTS = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];
function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(rel);
    return /\.(ts|tsx|js|mjs)$/.test(e.name) ? [rel.split(path.sep).join("/")] : [];
  });
}
const ALL_FILES = SRC_DIRS.flatMap(walk);
const srcCache = new Map<string, string>();
const src = (rel: string) => {
  if (!srcCache.has(rel)) srcCache.set(rel, read(rel));
  return srcCache.get(rel)!;
};
function resolveSpec(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(fromRel), spec);
  else return null;
  for (const e of EXTS) {
    const cand = path.posix.normalize(base + e);
    if (exists(cand) && fs.statSync(path.join(ROOT, cand)).isFile()) return cand;
  }
  return null;
}
const depCache = new Map<string, string[]>();
function runtimeDeps(rel: string): string[] {
  if (depCache.has(rel)) return depCache.get(rel)!;
  const code = src(rel);
  const out: string[] = [];
  const re =
    /^\s*(import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gm;
  for (const m of code.matchAll(re)) {
    if (m[2]) continue; // import type / export type → derleme sonrası silinir
    const spec = m[3] ?? m[4];
    // `import { type A, type B } from` → tamamen tip ise atla
    if (m[1] === "import" && /^\s*import\s*\{\s*(type\s+[\w$]+\s*,?\s*)+\}\s*from/.test(m[0])) continue;
    const r = resolveSpec(rel, spec);
    if (r) out.push(r);
  }
  depCache.set(rel, out);
  return out;
}
function findPath(start: string, isTarget: (f: string) => boolean): string[] | null {
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const f = queue.shift()!;
    if (f !== start && isTarget(f)) {
      const chain = [f];
      let p = prev.get(f);
      while (p) {
        chain.unshift(p);
        p = prev.get(p) ?? null;
      }
      return chain;
    }
    for (const d of runtimeDeps(f)) {
      if (!prev.has(d)) {
        prev.set(d, f);
        queue.push(d);
      }
    }
  }
  return null;
}
const isUseClient = (rel: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*["']use client["']/.test(src(rel));

(async () => {
  // ── 1) Güvenlik başlıkları ──────────────────────────────────────────────────
  const headers = buildSecurityHeaders({ supabaseUrl: "https://abcd1234.supabase.co" });
  const h = (k: string) => headers.find((x) => x.key.toLowerCase() === k.toLowerCase())?.value;

  await t("HSTS 2 yıl, includeSubDomains YOK", () => {
    assert.equal(h("Strict-Transport-Security"), "max-age=63072000");
  });
  await t("nosniff / referrer / XFO", () => {
    assert.equal(h("X-Content-Type-Options"), "nosniff");
    assert.equal(h("Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.equal(h("X-Frame-Options"), "SAMEORIGIN");
  });
  await t("Permissions-Policy", () => {
    assert.equal(
      h("Permissions-Policy"),
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    );
  });
  await t("enforced CSP minimal ve kırıcı direktif YOK", () => {
    const csp = h("Content-Security-Policy")!;
    assert.equal(csp, buildEnforcedCsp());
    for (const d of ["frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'", "object-src"]) {
      assert.ok(csp.includes(d), d);
    }
    // Enforced'ta içerik yükleme direktifleri OLMAMALI (Supabase/blob/Word/TUS/WebView kırılmasın).
    for (const d of ["default-src", "script-src", "img-src", "connect-src", "frame-src", "media-src", "style-src"]) {
      assert.ok(!new RegExp(`(^|;\\s*)${d}\\b`).test(csp), `enforced CSP ${d} içermemeli`);
    }
    // Hacamat PDF önizlemesi <object data="blob:"> → object-src 'none' OLMAMALI.
    assert.ok(!/object-src 'none'/.test(csp));
    assert.ok(/object-src 'self' blob:/.test(csp));
  });
  await t("Report-Only CSP Supabase (https+storage+wss), blob:, data:, GA", () => {
    const ro = h("Content-Security-Policy-Report-Only")!;
    assert.ok(ro.includes("https://abcd1234.supabase.co"));
    assert.ok(ro.includes("https://abcd1234.storage.supabase.co"), "TUS/doğrudan storage hostu");
    assert.ok(ro.includes("wss://abcd1234.supabase.co"));
    assert.match(ro, /img-src [^;]*blob:[^;]*/);
    assert.match(ro, /img-src [^;]*data:/);
    assert.match(ro, /frame-src [^;]*blob:[^;]*data:/);
    assert.match(ro, /media-src [^;]*blob:/);
    assert.match(ro, /worker-src 'self' blob:/);
    assert.match(ro, /script-src [^;]*https:\/\/www\.googletagmanager\.com/);
    assert.match(ro, /connect-src [^;]*https:\/\/\*\.google-analytics\.com/);
    assert.match(ro, /style-src 'self' 'unsafe-inline'/);
    assert.ok(!ro.includes("'unsafe-eval'"), "prod'da unsafe-eval yok");
  });
  await t("Report-Only dev'de unsafe-eval; URL yoksa *.supabase.co", () => {
    const ro = buildReportOnlyCsp({ isDev: true, supabaseUrl: undefined });
    assert.ok(ro.includes("'unsafe-eval'"));
    assert.ok(ro.includes("https://*.supabase.co"));
    assert.deepEqual(supabaseOrigins("not a url").https, ["https://*.supabase.co"]);
  });
  await t("next.config.ts headers() + poweredByHeader:false", async () => {
    const mod = await import(pathToFileURL(path.join(ROOT, "next.config.ts")).href);
    const cfg = (mod.default?.default ?? mod.default) as {
      poweredByHeader?: boolean;
      headers?: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
    };
    assert.equal(cfg.poweredByHeader, false);
    const rules = await cfg.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    assert.ok(all, "/:path* kuralı yok");
    const keys = all!.headers.map((x) => x.key);
    for (const k of [
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "X-Frame-Options",
      "Permissions-Policy",
      "Content-Security-Policy",
      "Content-Security-Policy-Report-Only",
    ]) {
      assert.ok(keys.includes(k), k);
    }
    // redirects korunmuş olmalı (regresyon)
    const redirects = await (cfg as { redirects?: () => Promise<unknown[]> }).redirects!();
    assert.ok(redirects.length >= 10);
  });

  // ── 2) Google Analytics yalnız public ─────────────────────────────────────
  await t("GA izin listesi", () => {
    assert.equal(isGaAllowedPath("/dashboard/clients/0b7c2c1e-2f7a-4f1b-9a0e-1c2d3e4f5a6b"), false);
    assert.equal(isGaAllowedPath("/gizlilik-politikasi"), true);
    assert.equal(isGaAllowedPath("/gizlilik-politikasi/"), true);
    assert.equal(isGaAllowedPath("/gizlilik-politikasi?x=1"), true);
    assert.equal(isGaAllowedPath("/"), true);
    assert.equal(isGaAllowedPath("/admin"), false);
    assert.equal(isGaAllowedPath("/admin/users"), false);
    assert.equal(isGaAllowedPath("/danisan-yolculugu/liste"), false);
    assert.equal(isGaAllowedPath("/gizlilik-politikasi/../dashboard"), false);
    assert.equal(isGaAllowedPath(null), true); // usePathname null → "/"
  });
  await t("GA oturumda kapalı (ana sayfa dahil)", () => {
    assert.equal(shouldEnableAnalytics({ pathname: "/", hasSession: true }), false);
    assert.equal(shouldEnableAnalytics({ pathname: "/kvkk-aydinlatma", hasSession: true }), false);
    assert.equal(shouldEnableAnalytics({ pathname: "/", hasSession: false }), true);
    assert.equal(shouldEnableAnalytics({ pathname: "/numeroloji", hasSession: false }), false);
  });
  await t("GA page_path query/hash içermez", () => {
    assert.equal(analyticsPagePath("/iletisim?email=a@b.c#x"), "/iletisim");
  });
  await t("Vercel analytics URL maskeleme", () => {
    assert.equal(
      redactAnalyticsUrl("https://www.yasamsistemi.com/dashboard/clients/0b7c2c1e-2f7a-4f1b-9a0e-1c2d3e4f5a6b?tab=notlar#x"),
      "https://www.yasamsistemi.com/dashboard/clients/[id]",
    );
    assert.equal(redactAnalyticsUrl("/refleksoloji/notlar/123456"), "/refleksoloji/notlar/[n]");
  });
  await t("GoogleAnalytics bileşeni: politika + disable bayrağı + inline init yok", () => {
    const c = read("components/GoogleAnalytics.tsx");
    assert.ok(c.includes("shouldEnableAnalytics"));
    assert.ok(c.includes("ga-disable-"));
    assert.ok(c.includes("send_page_view: false"));
    assert.ok(!c.includes("dangerouslySetInnerHTML"), "inline init script kalmamalı");
    assert.ok(!c.includes(`"${GA_MEASUREMENT_ID}"`), "GA ID tek kaynaktan (analyticsPolicy) gelmeli");
  });
  await t("layout: Vercel Analytics yalnız maskeleyen sarmalayıcıdan", () => {
    const l = read("app/layout.tsx");
    assert.ok(l.includes("<PrivacyAnalytics />"));
    assert.ok(!l.includes("@vercel/analytics"), "layout doğrudan @vercel/analytics kullanmamalı");
    assert.ok(read("components/analytics/PrivacyAnalytics.tsx").includes("redactAnalyticsUrl"));
  });

  // ── 3) Veri konumu ────────────────────────────────────────────────────────
  await t("dataResidency env yoksa placeholder", () => {
    const r = getDataResidency({});
    assert.equal(r.configured, false);
    assert.equal(r.label, DATA_REGION_PLACEHOLDER);
    assert.equal(DATA_REGION_PLACEHOLDER, "Bölge bilgisi yayın öncesi netleştirilecektir");
  });
  await t("dataResidency env ile", () => {
    const r = getDataResidency({ NEXT_PUBLIC_DATA_REGION_LABEL: "  AB  (Almanya) ", NEXT_PUBLIC_DATA_REGION_NOTE: "" });
    assert.deepEqual(r, { configured: true, label: "AB (Almanya)", note: null });
  });
  const LEGAL_FILES = [
    "app/gizlilik-politikasi/page.tsx",
    "app/kullanim-sartlari/page.tsx",
    "app/kvkk-aydinlatma/page.tsx",
    "app/veri-isleme-sozlesmesi/page.tsx",
    "app/alt-isleyiciler/page.tsx",
  ];
  await t("Tokyo/Frankfurt hardcode YOK (INFRA hukuki dosyaları)", () => {
    const files = [
      ...LEGAL_FILES,
      ...walk("lib/legal"),
      ...walk("components/kvkk"),
    ];
    for (const f of files) assert.ok(!/tokyo|frankfurt|ap-northeast|eu-central/i.test(read(f)), f);
  });

  // ── 4) Hukuki sayfalar TASLAK + dürüst iddialar ───────────────────────────
  await t("tüm hukuki sayfalar TASLAK kabuğunu kullanır", () => {
    for (const f of LEGAL_FILES) assert.ok(read(f).includes("LegalPageShell"), f);
    const shell = read("components/kvkk/LegalPageShell.tsx");
    assert.ok(shell.includes("LEGAL_DRAFT_MARK"));
    assert.equal(LEGAL_DRAFT_MARK, "TASLAK — hukuki inceleme gerekir");
  });
  await t("gizlilik: eski yanlış iddialar yok, gerçek davranış var", () => {
    const g = read("app/gizlilik-politikasi/page.tsx");
    assert.ok(!/üçüncü taraflarla paylaşmıyor/.test(g));
    assert.ok(!/görüntüleyemez, inceleyemez/.test(g));
    assert.match(g, /Google Analytics<\/strong> yalnızca oturum açılmamış/);
    assert.match(g, /yalnızca yönetici hesabında açıktır/);
    assert.match(g, /görüntüleme özelliği <strong>bulunmaz<\/strong>/);
  });
  await t("alt işleyiciler: 5 sağlayıcı + kapsamlar", () => {
    const s = read("lib/legal/subprocessors.ts");
    for (const n of ["Supabase", "Vercel", "OpenAI", "Inngest", "Google Analytics"]) assert.ok(s.includes(`name: "${n}"`), n);
    assert.match(s, /Yalnız yönetici hesabının/);
    assert.match(s, /Yalnız oturum açılmamış ziyaretçilerin herkese açık/);
  });
  await t("ana sayfa footer yeni hukuki bağlantılar + i18n anahtarları", () => {
    const p = read("app/page.tsx");
    for (const href of ["/kvkk-aydinlatma", "/veri-isleme-sozlesmesi", "/alt-isleyiciler"]) assert.ok(p.includes(`href="${href}"`), href);
    for (const loc of ["tr", "en"]) {
      const j = JSON.parse(read(`messages/${loc}/home.json`));
      const footer = j.home?.footer ?? j.footer ?? Object.values(j).find((v) => (v as { footer?: unknown })?.footer) as never;
      const f = (footer as { footer?: Record<string, string> })?.footer ?? (footer as Record<string, string>);
      for (const k of ["kvkk", "dpa", "subprocessors"]) assert.ok(typeof f?.[k] === "string", `${loc}.${k}`);
    }
  });

  // ── 5) KVKK onam sözleşmesi ───────────────────────────────────────────────
  await t("onam sabitleri migration CHECK ile birebir", () => {
    const sql = read("supabase/migrations/20270129000900_client_consents.sql");
    for (const v of [...CONSENT_TYPES, ...CONSENT_STATUSES, ...CONSENT_METHODS]) assert.ok(sql.includes(`'${v}'`), v);
  });
  await t("validateConsentInput: geçerli + sunucu alanları yok sayılır", () => {
    const r = validateConsentInput({
      consent_type: "acik_riza_ozel_nitelikli",
      status: "granted",
      method: "islak_imza",
      note: "  imzalı form dosyada ",
      tenant_id: "evil",
      client_id: "evil",
      recorded_by_user_id: "evil",
      recorded_at: "2000-01-01",
    });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(Object.keys(r.value).sort(), ["consent_type", "method", "note", "source", "status", "text_version"]);
      assert.equal(r.value.text_version, CONSENT_TEXT_VERSION);
      assert.equal(r.value.note, "imzalı form dosyada");
    }
  });
  await t("validateConsentInput: hatalı alanlar", () => {
    assert.equal(validateConsentInput(null).ok, false);
    assert.equal(validateConsentInput({ consent_type: "pazarlama", status: "granted", method: "diger" }).ok, false);
    assert.equal(validateConsentInput({ consent_type: "iletisim_izni", status: "ok", method: "diger" }).ok, false);
    assert.equal(validateConsentInput({ consent_type: "iletisim_izni", status: "granted", method: "email" }).ok, false);
    const long = validateConsentInput({ consent_type: "iletisim_izni", status: "granted", method: "diger", note: "x".repeat(1001) });
    assert.equal(long.ok, false);
    const badVer = validateConsentInput({ consent_type: "iletisim_izni", status: "granted", method: "diger", text_version: "v 1; drop" });
    assert.equal(badVer.ok, false);
  });
  await t("deriveCurrentConsents: en son kayıt kazanır; özet", () => {
    const base = { text_version: "v", method: "diger" as const, source: null, note: null, recorded_by_user_id: "u" };
    const hist = [
      { ...base, id: "a", consent_type: "acik_riza_ozel_nitelikli" as const, status: "granted" as const, recorded_at: "2026-09-01T10:00:00Z" },
      { ...base, id: "b", consent_type: "acik_riza_ozel_nitelikli" as const, status: "withdrawn" as const, recorded_at: "2026-09-02T10:00:00Z" },
      { ...base, id: "c", consent_type: "aydinlatma_bildirildi" as const, status: "granted" as const, recorded_at: "2026-09-01T09:00:00Z" },
    ];
    const cur = deriveCurrentConsents(hist);
    assert.equal(cur.acik_riza_ozel_nitelikli?.status, "withdrawn");
    const s = summarizeConsents(cur);
    assert.equal(s.tone, "warn");
    assert.match(s.badge, /açık rıza/);
    assert.equal(summarizeConsents({}).tone, "none");
    const ok = summarizeConsents({ aydinlatma_bildirildi: { status: "granted" }, acik_riza_ozel_nitelikli: { status: "granted" } });
    assert.equal(ok.tone, "ok");
  });
  await t("consents route: guard + tenant sunucudan + append-only", () => {
    const r = read("app/api/clients/[id]/consents/route.ts");
    assert.equal((r.match(/await requireModuleAccess\(req, "clients"\)/g) ?? []).length, 2);
    assert.match(r, /tenant_id: tenantId/);
    assert.match(r, /recorded_by_user_id: userId/);
    assert.ok(!/\.update\(|\.delete\(|\.upsert\(/.test(r), "route yalnız insert/select");
    assert.ok(!/body\.(tenant_id|client_id|recorded_by_user_id)/.test(r));
    assert.match(r, /CONSENTS_NOT_READY/);
    assert.match(r, /is_demo_account/);
  });
  await t("ClientConsentPanel mevcut + submit kilidi + taslak işareti", () => {
    const c = read("components/kvkk/ClientConsentPanel.tsx");
    assert.ok(isUseClient("components/kvkk/ClientConsentPanel.tsx"));
    assert.ok(c.includes("useSubmitLock"));
    assert.ok(c.includes("LEGAL_DRAFT_MARK"));
    assert.ok(c.includes("Sonra tamamla"));
    assert.ok(c.includes('variant === "badge"'));
  });

  // ── 6) server-only ────────────────────────────────────────────────────────
  await t("assertServerOnly: Node'da no-op, tarayıcıda hata", () => {
    assertServerOnly("x");
    const g = globalThis as Record<string, unknown>;
    g.window = {};
    g.document = {};
    try {
      assert.throws(() => assertServerOnly("lib/supabase-server"), /yalnız sunucu/);
    } finally {
      delete g.window;
      delete g.document;
    }
  });
  await t("lib/supabase-server.ts sunucu-yalnız koruması çağırır", () => {
    assert.match(read("lib/supabase-server.ts"), /assertServerOnly\("lib\/supabase-server"\)/);
  });
  const SECRET_RE = /process\.env\.(SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|INNGEST_SIGNING_KEY|INNGEST_EVENT_KEY|DEMO_IP_SALT)\b/;
  const serverTargets = new Set(
    ALL_FILES.filter((f) => f === "lib/supabase-server.ts" || (SECRET_RE.test(src(f)) && !/\/route\.ts$/.test(f))),
  );
  await t("server-only hedefleri bulundu (supabase-server + secret helper'lar)", () => {
    assert.ok(serverTargets.has("lib/supabase-server.ts"));
    assert.ok(serverTargets.size >= 2, [...serverTargets].join(","));
  });
  await t('"use client" → service-role/secret modülü import yolu 0', () => {
    const clientRoots = ALL_FILES.filter((f) => /\.(tsx?|jsx?)$/.test(f) && isUseClient(f));
    assert.ok(clientRoots.length > 100, `client kök sayısı şüpheli: ${clientRoots.length}`);
    const leaks: string[] = [];
    for (const root of clientRoots) {
      if (serverTargets.has(root)) {
        leaks.push(root);
        continue;
      }
      const chain = findPath(root, (f) => serverTargets.has(f));
      if (chain) leaks.push(chain.join(" → "));
    }
    assert.deepEqual(leaks, [], `sızıntı:\n${leaks.join("\n")}`);
  });

  // ── 7) Legacy grants (migration 1100) — anon istemci kanıtı ─────────────────
  const LOCKED = [
    "client_charges",
    "client_combinations",
    "combinations",
    "security_events",
    "support_messages",
    "video_transcription_jobs",
    "video_training_records",
    "personal_archive_files",
    "user_payment_history",
    "_bak_users_modperm_20260926",
    "_bak_users_modperm_cosmic_preapply_20260926",
    "_bak_hacamat_rules_20260926",
  ];
  await t("migration 1100 tablo listesi harness ile aynı", () => {
    const sql = read("supabase/migrations/20270129001100_legacy_grants_lockdown.sql");
    for (const tb of LOCKED) assert.ok(sql.includes(`'${tb}'`), tb);
    assert.ok(!/\bDROP\s+TABLE\b/i.test(sql.replace(/--.*$/gm, "")), "DROP TABLE yasak");
  });
  await t("anon istemci (lib/supabase) kullanan dosyalarda kilitli tablo erişimi 0", () => {
    const anonImporters = ALL_FILES.filter((f) => runtimeDeps(f).includes("lib/supabase.ts"));
    assert.ok(anonImporters.length >= 5, `anon importer sayısı: ${anonImporters.length}`);
    // Bir kademe: anon importer'ı (sayfa olmayan helper) kullanan dosyalar da tablo adı geçirebilir.
    const helperImporters = ALL_FILES.filter((f) =>
      runtimeDeps(f).some((d) => anonImporters.includes(d) && !/\/page\.tsx$/.test(d)),
    );
    const scope = [...new Set([...anonImporters, ...helperImporters])];
    const alt = LOCKED.join("|");
    // (a) doğrudan .from("<kilitli>") ya da embedded select "…<kilitli>(…)"
    const direct = new RegExp(
      `\\.from\\(\\s*["'\`](${alt})["'\`]|\\.select\\(\\s*["'\`][^"'\`]*\\b(${alt})\\s*\\(`,
    );
    const hits = scope.filter((f) => direct.test(src(f)));
    assert.deepEqual(hits, [], "doğrudan erişim");
    // (b) dinamik .from(<değişken>) kullanan dosyalarda kilitli tablo adı hiç geçmemeli
    //     (tablo listeleri: MODULE_STAT_TABLES, AUDIT_TABLES, *_CANDIDATES, loadTenantMetricSummary("…")).
    const quoted = new RegExp(`["'\`](${alt})["'\`]`);
    const dynamicFiles = scope.filter((f) => /\.from\(\s*[A-Za-z_$]/.test(src(f).replace(/Array\.from\(|Buffer\.from\(/g, "")));
    assert.ok(dynamicFiles.length >= 2, `dinamik from dosyaları: ${dynamicFiles.join(",")}`);
    assert.deepEqual(dynamicFiles.filter((f) => quoted.test(src(f))), [], "dinamik tablo listesi");
    // Realtime (postgres_changes) yok.
    assert.deepEqual(ALL_FILES.filter((f) => /postgres_changes/.test(src(f))), []);
  });

  // ── 8) Drift compare ──────────────────────────────────────────────────────
  await t("drift compare: hedef durum OK, bozuk durum FAIL", async () => {
    const { compareManifest } = (await import(
      pathToFileURL(path.join(ROOT, "scripts/final-hardening/drift/compare.mjs")).href
    )) as { compareManifest: (a: unknown, e: unknown) => { fails: string[]; warnings: string[] } };
    const expected = JSON.parse(read("supabase/expected-manifest.json"));
    const priv = { select: false, insert: false, update: false, delete: false };
    const good = {
      format: "yasam-drift-manifest",
      version: 1,
      tables: (expected.tables_no_client_grant.names as string[]).map((name) => ({
        schema: "public", name, kind: "r", rls: true, anon: priv, authenticated: priv,
      })),
      policies: [],
      functions: (expected.functions_no_client_execute.names as string[]).map((name) => ({
        name, args: "", security_definer: true, anon_execute: false, authenticated_execute: false, extension: false,
      })),
      buckets: Object.entries(expected.buckets as Record<string, object>).map(([id, v]) => ({ id, ...v })),
    };
    const ok = compareManifest([{ manifest: JSON.stringify(good) }], expected);
    assert.deepEqual(ok.fails, []);
    const bad = structuredClone(good);
    bad.tables.find((x) => x.name === "combinations")!.anon = { ...priv, select: true };
    bad.functions.find((x) => x.name === "login_user")!.anon_execute = true;
    bad.policies.push({ schema: "storage", table: "objects", name: "video_temp_insert" } as never);
    (bad.buckets.find((x) => x.id === "video-temp") as { file_size_limit?: number }).file_size_limit = 5368709120;
    bad.tables.push({ schema: "public", name: "yeni_tablo", kind: "r", rls: false, anon: { ...priv, select: true }, authenticated: priv });
    const r = compareManifest(bad, expected);
    assert.equal(r.fails.length, 4, r.fails.join("\n"));
    assert.ok(r.warnings.some((w) => w.includes("yeni_tablo")));
  });

  // ── 9) Gelecek zaman metinleri ────────────────────────────────────────────
  await t("gelecek zaman metinleri düzeltildi", () => {
    assert.ok(!read("app/numeroloji/bilgi-bankasi/page.tsx").includes("yönetilecek"));
    assert.ok(!read("messages/tr/clients.analizler.json").includes("toplanacak"));
    assert.ok(!read("messages/tr/clients.memory.json").includes("yakında (Paket 2)"));
  });

  // ── 10) Beslenme sayaç: SYSTEM ∪ tenant ───────────────────────────────────
  await t("beslenme counts foods = SYSTEM + tenant", () => {
    const r = read("app/api/beslenme/counts/route.ts");
    assert.match(r, /SYSTEM_NUTRITION_TENANT_ID/);
    assert.match(r, /foods: foodsSystem \+ foodsCustom/);
  });

  console.log(`infra harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
})();
