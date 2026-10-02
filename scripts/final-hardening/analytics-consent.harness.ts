/**
 * P1-6 — Google Analytics onay (consent) kapısı + hukuki metin dil kuralları (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/analytics-consent.harness.ts
 *
 * Kapsam:
 *   - lib/legal/analyticsConsent.ts saf mantığı (okuma/yazma try/catch, yalnız karar + ISO tarih,
 *     bozuk değer → karar yok, çerez adı eşleştirme, silme atamaları)
 *   - components/analytics/analyticsConsentClient.ts yan etkileri (sahte window/document ile):
 *     ret/geri çekme → ga-disable bayrağı + _ga/_ga_* silinir, zorunlu çerezler korunur
 *   - components/GoogleAnalytics.tsx: gtag.js / dataLayer yalnız onay kontrolünden SONRA (statik)
 *   - Onay çubuğu + "Çerez tercihleri" düğmesi sözleşmesi (statik)
 *   - 5 hukuki sayfada mutlak ifade YOK
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_OPEN_EVENT,
  CONSENT_STORAGE_KEY,
  analyticsCookieNames,
  clearAnalyticsConsent,
  cookieDeletionAssignments,
  isAnalyticsConsentGranted,
  isAnalyticsCookieName,
  parseConsentRecord,
  readAnalyticsConsent,
  serializeConsentRecord,
  writeAnalyticsConsent,
  type StorageLike,
} from "../../lib/legal/analyticsConsent";
import { GA_MEASUREMENT_ID } from "../../lib/legal/analyticsPolicy";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let pass = 0;
let fail = 0;
const warnings: string[] = [];
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}:`, (e as Error).message);
  }
}

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}
const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

/** Basit çerez kavanozu: `document.cookie` atamalarını (domain/path dahil) uygular. */
function cookieJar(initial: Array<[string, string, string]>) {
  // [name, value, domain]  (domain "" = host-only)
  const jar = new Map<string, { value: string; domain: string }>();
  for (const [n, v, d] of initial) jar.set(`${n}|${d}`, { value: v, domain: d });
  const assignments: string[] = [];
  return {
    jar,
    assignments,
    get cookie() {
      return [...jar.entries()].map(([k, v]) => `${k.split("|")[0]}=${v.value}`).join("; ");
    },
    set cookie(assignment: string) {
      assignments.push(assignment);
      const [pair, ...attrs] = assignment.split(";").map((x) => x.trim());
      const [name, value] = pair.split("=");
      const domainAttr = attrs.find((a) => a.toLowerCase().startsWith("domain="));
      const domain = domainAttr ? domainAttr.slice(7) : "";
      const expired = attrs.some((a) => /^max-age=0$/i.test(a) || /^expires=Thu, 01 Jan 1970/i.test(a));
      if (expired) jar.delete(`${name}|${domain}`);
      else jar.set(`${name}|${domain}`, { value: value ?? "", domain });
    },
  };
}

(async () => {
  // ── 1) Saf consent mantığı ────────────────────────────────────────────────
  await t("anahtar ve olay adları sabit", () => {
    assert.equal(CONSENT_STORAGE_KEY, "yasam_analytics_consent_v1");
    assert.equal(CONSENT_OPEN_EVENT, "yasam:analytics-consent-open");
    assert.ok(CONSENT_CHANGE_EVENT.startsWith("yasam:"));
  });
  await t("serialize: yalnız karar + ISO tarih (kişisel veri yok)", () => {
    const raw = serializeConsentRecord("granted", new Date("2026-10-01T10:00:00Z"));
    const obj = JSON.parse(raw);
    assert.deepEqual(Object.keys(obj).sort(), ["decidedAt", "decision"]);
    assert.equal(obj.decision, "granted");
    assert.equal(obj.decidedAt, "2026-10-01T10:00:00.000Z");
  });
  await t("parse: geçerli/bozuk değerler", () => {
    assert.deepEqual(parseConsentRecord('{"decision":"denied","decidedAt":"2026-10-01T00:00:00.000Z"}'), {
      decision: "denied",
      decidedAt: "2026-10-01T00:00:00.000Z",
    });
    for (const bad of [null, undefined, "", "granted", "{", "[]", '{"decision":"yes","decidedAt":"2026-10-01"}', '{"decision":"granted"}', '{"decision":"granted","decidedAt":"dün"}', "x".repeat(500)]) {
      assert.equal(parseConsentRecord(bad as string | null | undefined), null, String(bad).slice(0, 30));
    }
  });
  await t("read/write/clear: bellek deposu", () => {
    const s = memoryStorage();
    assert.equal(readAnalyticsConsent(s), null);
    assert.equal(writeAnalyticsConsent("granted", s, new Date("2026-10-01T00:00:00Z")), true);
    assert.equal(readAnalyticsConsent(s)?.decision, "granted");
    assert.equal(isAnalyticsConsentGranted(readAnalyticsConsent(s)), true);
    writeAnalyticsConsent("denied", s);
    assert.equal(isAnalyticsConsentGranted(readAnalyticsConsent(s)), false);
    clearAnalyticsConsent(s);
    assert.equal(readAnalyticsConsent(s), null);
    assert.deepEqual([...s.data.keys()], [], "başka anahtar yazılmaz");
    assert.equal(writeAnalyticsConsent("maybe" as never, s), false, "geçersiz karar yazılmaz");
  });
  await t("read/write/clear: engelli depo sessizce karar yok", () => {
    assert.equal(readAnalyticsConsent(throwingStorage), null);
    assert.equal(writeAnalyticsConsent("granted", throwingStorage), false);
    assert.doesNotThrow(() => clearAnalyticsConsent(throwingStorage));
    assert.equal(readAnalyticsConsent(null), null);
    assert.equal(writeAnalyticsConsent("granted", null), false);
  });
  await t("onay yalnız açık granted", () => {
    assert.equal(isAnalyticsConsentGranted(null), false);
    assert.equal(isAnalyticsConsentGranted(undefined), false);
    assert.equal(isAnalyticsConsentGranted({ decision: "denied", decidedAt: "2026-10-01T00:00:00Z" }), false);
    assert.equal(isAnalyticsConsentGranted({ decision: "granted", decidedAt: "2026-10-01T00:00:00Z" }), true);
  });
  await t("çerez adı eşleştirme: yalnız _ga ve _ga_*", () => {
    assert.ok(isAnalyticsCookieName("_ga"));
    assert.ok(isAnalyticsCookieName(`_ga_${GA_MEASUREMENT_ID.slice(2)}`));
    for (const n of ["yasam_admin_session", "NEXT_LOCALE", "_gat", "_gid", "ga", "x_ga", "_ga_", "_ga_a=b"]) {
      assert.equal(isAnalyticsCookieName(n), false, n);
    }
    assert.deepEqual(
      analyticsCookieNames("NEXT_LOCALE=tr; _ga=GA1.1.1; yasam_admin_session=x; _ga_1W3D0G2TBN=GS1; _ga=dup"),
      ["_ga", "_ga_1W3D0G2TBN"],
    );
    assert.deepEqual(analyticsCookieNames(""), []);
    assert.deepEqual(analyticsCookieNames(null), []);
  });
  await t("silme atamaları: path=/ + host + .yasamsistemi.com", () => {
    const a = cookieDeletionAssignments("_ga", "www.yasamsistemi.com");
    assert.ok(a.every((x) => x.includes("path=/") && x.includes("max-age=0") && x.startsWith("_ga=;")));
    assert.ok(a.some((x) => !x.includes("domain=")), "host-only varyant");
    assert.ok(a.some((x) => x.endsWith("domain=.yasamsistemi.com")), ".yasamsistemi.com varyantı");
    assert.ok(a.some((x) => x.endsWith("domain=www.yasamsistemi.com")), "host varyantı");
    assert.ok(cookieDeletionAssignments("_ga", "yasamsistemi.com").some((x) => x.endsWith("domain=.yasamsistemi.com")));
    assert.deepEqual(cookieDeletionAssignments("_ga", "localhost").length, 1);
    assert.deepEqual(cookieDeletionAssignments("yasam_admin_session", "www.yasamsistemi.com"), [], "zorunlu çerez için atama üretilmez");
    assert.deepEqual(cookieDeletionAssignments("NEXT_LOCALE", "www.yasamsistemi.com"), []);
  });

  // ── 2) Tarayıcı yan etkileri (sahte window/document) ──────────────────────
  await t("ret / geri çekme: ga-disable + _ga* silinir, zorunlu çerezler kalır", async () => {
    const g = globalThis as Record<string, unknown>;
    const storage = memoryStorage();
    const events: string[] = [];
    const jar = cookieJar([
      ["_ga", "GA1.1.1", ".yasamsistemi.com"],
      ["_ga_1W3D0G2TBN", "GS1", ".yasamsistemi.com"],
      ["_ga", "GA1.1.2", ""],
      ["NEXT_LOCALE", "tr", ""],
      ["yasam_admin_session", "tok", ""],
    ]);
    const win: Record<string, unknown> = {
      localStorage: storage,
      location: { hostname: "www.yasamsistemi.com", pathname: "/" },
      dispatchEvent: (e: { type: string }) => {
        events.push(e.type);
        return true;
      },
    };
    g.window = win;
    g.document = jar;
    try {
      const client = await import("../../components/analytics/analyticsConsentClient");
      assert.equal(client.GA_DISABLE_KEY, `ga-disable-${GA_MEASUREMENT_ID}`);
      assert.equal(client.hasAnalyticsDecision(), false);
      assert.equal(client.hasAnalyticsConsent(), false);

      client.setAnalyticsConsent("granted");
      assert.equal(client.hasAnalyticsConsent(), true);
      assert.equal(readAnalyticsConsent(storage)?.decision, "granted");
      assert.ok(events.includes(CONSENT_CHANGE_EVENT));
      assert.equal(jar.jar.size, 5, "kabulde çerez silinmez");

      client.setAnalyticsConsent("denied");
      assert.equal(client.hasAnalyticsConsent(), false);
      assert.equal(win[client.GA_DISABLE_KEY], true, "ga-disable bayrağı");
      const left = [...jar.jar.keys()].map((k) => k.split("|")[0]).sort();
      assert.deepEqual(left, ["NEXT_LOCALE", "yasam_admin_session"], "yalnız zorunlu çerezler kalır");

      // geri çekme / tercih sıfırlama
      jar.cookie = "_ga=GA1.1.3; domain=.yasamsistemi.com; path=/";
      client.setAnalyticsConsent("granted");
      events.length = 0;
      client.reopenAnalyticsConsent();
      assert.equal(readAnalyticsConsent(storage), null, "karar silinir");
      assert.equal(client.hasAnalyticsDecision(), false);
      assert.equal(client.hasAnalyticsConsent(), false);
      assert.equal(win[client.GA_DISABLE_KEY], true);
      assert.ok(![...jar.jar.keys()].some((k) => k.startsWith("_ga")), "_ga* silindi");
      assert.deepEqual(events, [CONSENT_CHANGE_EVENT, CONSENT_OPEN_EVENT], "önce değişim, sonra tercih penceresi");

      // depolama engelli: karar bu sayfa yüklemesi için bellekte tutulur
      win.localStorage = throwingStorage;
      client.setAnalyticsConsent("granted");
      assert.equal(client.hasAnalyticsConsent(), true);
      client.setAnalyticsConsent("denied");
      assert.equal(client.hasAnalyticsConsent(), false);
    } finally {
      delete g.window;
      delete g.document;
    }
  });

  // ── 3) GoogleAnalytics: yükleme koşulu onaya bağlı (statik) ───────────────
  await t("GoogleAnalytics: gtag.js / dataLayer yalnız onaydan sonra", () => {
    const c = read("components/GoogleAnalytics.tsx");
    const code = c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/from "next\/script"|<Script\b|dangerouslySetInnerHTML/.test(code), "next/script veya inline init YOK");
    // evaluate(): onay + rota/oturum birlikte
    const evalFn = code.match(/function evaluate\([\s\S]*?\n\}/)?.[0] ?? "";
    assert.match(evalFn, /hasAnalyticsConsent\(\)\s*&&\s*shouldEnableAnalytics\(/, "evaluate onayı şart koşar");
    // dataLayer / script yalnız ensureGtag içinde
    const ensure = code.match(/function ensureGtag\(\)[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(ensure.includes("googletagmanager.com/gtag/js"), "script yalnız ensureGtag içinde");
    const outside = code.replace(ensure, "");
    assert.ok(!outside.includes("googletagmanager.com"), "ensureGtag dışında gtag.js yükleme YOK");
    assert.ok(!/window\.dataLayer\s*=/.test(outside), "ensureGtag dışında dataLayer kurulumu YOK");
    assert.ok(!/window\.gtag\s*=/.test(outside), "ensureGtag dışında gtag kurulumu YOK");
    // effect sırası: onay kontrolü → evaluate → ensureGtag
    const component = code.slice(code.indexOf("export default function GoogleAnalytics"));
    const iConsent = component.indexOf("if (!hasAnalyticsConsent())");
    const iEval = component.indexOf("if (!evaluate(pathname)) return;");
    const iEnsure = component.indexOf("ensureGtag()");
    assert.ok(iConsent > 0 && iEval > iConsent && iEnsure > iEval, "onay → evaluate → ensureGtag sırası");
    const consentBlock = component.slice(iConsent, iEval);
    assert.ok(consentBlock.includes("disableAnalyticsAndPurgeCookies()") && consentBlock.includes("return;"), "onaysız: sustur + çerez sil + çık");
    assert.ok(component.includes("CONSENT_CHANGE_EVENT"), "karar değişimi dinlenir");
    assert.ok(!c.includes(`"${GA_MEASUREMENT_ID}"`), "GA ID tek kaynaktan");
  });

  // ── 4) Onay çubuğu + tercih düğmesi (statik) ──────────────────────────────
  await t("AnalyticsConsentBanner: yalnız public + oturumsuz + kararsız; eşit ağırlıkta düğmeler", () => {
    const b = read("components/analytics/AnalyticsConsentBanner.tsx");
    assert.ok(b.startsWith('"use client"'));
    assert.match(b, /return !hasBrowserSession\(\) && !hasAnalyticsDecision\(\);/, "oturumsuz + kararsız");
    assert.match(b, /const open = isGaAllowedPath\(pathname\) && \(forced \|\| undecided\);/, "yalnız GA izinli public yol");
    assert.match(b, /useSyncExternalStore\(subscribe, readUndecidedVisitor, \(\) => false\)/, "sunucuda kapalı (hidrasyon uyumlu)");
    assert.ok(b.includes("CONSENT_OPEN_EVENT"), "tercih penceresi olayı dinlenir");
    const buttons = [...b.matchAll(/<button[\s\S]*?className="([^"]+)"[\s\S]*?>\s*([^<]+?)\s*<\/button>/g)].map((m) => ({ cls: m[1], label: m[2] }));
    const labels = buttons.map((x) => x.label).sort();
    assert.deepEqual(labels, ["Kabul et", "Reddet"]);
    assert.equal(buttons[0].cls, buttons[1].cls, "Kabul et / Reddet aynı görünüm");
    assert.ok(b.includes('href="/gizlilik-politikasi#cerezler"'), "Gizlilik bağlantısı");
    assert.match(b, /role="region"/);
    assert.match(b, /aria-labelledby=/);
    assert.match(b, /fixed inset-x-0 bottom-0/);
    assert.ok(b.includes("paddingBottom"), "içerik kapanmasın: gövdeye alt boşluk");
    assert.ok(b.includes("min-h-[44px]"), "dokunma hedefi");
    assert.ok(!/localStorage\.setItem|document\.cookie/.test(b), "depolama/çerez yalnız merkezi modülden");
  });
  await t("CookiePreferencesButton: tercihi sıfırlar + çubuğu açar", () => {
    const c = read("components/analytics/CookiePreferencesButton.tsx");
    assert.ok(c.startsWith('"use client"'));
    assert.ok(c.includes("reopenAnalyticsConsent()"));
    assert.ok(c.includes('type="button"'));
    const client = read("components/analytics/analyticsConsentClient.ts");
    const reopen = client.match(/export function reopenAnalyticsConsent\(\)[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(reopen.includes("clearAnalyticsConsent()") && reopen.includes("disableAnalyticsAndPurgeCookies()") && reopen.includes("CONSENT_OPEN_EVENT"));
    assert.ok(read("app/gizlilik-politikasi/page.tsx").includes("<CookiePreferencesButton"), "Gizlilik sayfasında");
  });
  await t("PrivacyAnalytics (Vercel) davranışı değişmedi", () => {
    const p = read("components/analytics/PrivacyAnalytics.tsx");
    assert.ok(p.includes("redactAnalyticsUrl") && !p.includes("analyticsConsent"));
  });
  await t("global mount: app/layout.tsx (orkestratör)", () => {
    const l = read("app/layout.tsx");
    if (!l.includes("<AnalyticsConsentBanner")) warnings.push("app/layout.tsx henüz <AnalyticsConsentBanner /> içermiyor (orkestratör ekleyecek)");
    assert.ok(l.includes("<GoogleAnalytics />"));
  });

  // ── 5) Mutlak ifade yasağı (5 hukuki sayfa + kimlik/kabuk) ────────────────
  await t("hukuki sayfalarda mutlak ifade YOK", () => {
    const files = [
      "app/gizlilik-politikasi/page.tsx",
      "app/kullanim-sartlari/page.tsx",
      "app/kvkk-aydinlatma/page.tsx",
      "app/veri-isleme-sozlesmesi/page.tsx",
      "app/alt-isleyiciler/page.tsx",
      "app/iletisim/page.tsx",
      "lib/legal/subprocessors.ts",
    ];
    const banned = [
      "hiçbir koşulda",
      "kimse erişemez",
      "admin dahil",
      "imkânsız",
      "imkansız",
      "asla erişilemez",
      "%100",
      "tamamen güvenli",
      "hiçbir şeyden sorumlu",
    ];
    for (const f of files) {
      const lower = read(f).replace(/\s+/g, " ").toLocaleLowerCase("tr");
      for (const w of banned) assert.ok(!lower.includes(w.toLocaleLowerCase("tr")), `${f}: "${w}"`);
    }
  });

  for (const w of warnings) console.warn(`WARN ${w}`);
  console.log(`analytics-consent harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
})();
