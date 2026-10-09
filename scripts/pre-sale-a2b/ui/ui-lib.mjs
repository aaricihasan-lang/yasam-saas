// Shared Playwright helpers for AŞAMA 2B UI tests (local build 127.0.0.1:3911; everything else aborted).
import { chromium } from "playwright";

export const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
export const TENANT_A = "aaaaaaaa-0000-4000-8000-00000000000a";
export const TENANT_B = "bbbbbbbb-0000-4000-8000-00000000000b";

export const ALL_PERMS = Object.fromEntries(
  ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
    "aromatherapy", "personal_archive", "belge_ceviri", "human_design", "digital_content", "cosmic_calendar",
    "cupping", "beslenme", "yasam_hafizasi"].map((k) => [k, true]),
);

export function makeUser(role = "expert") {
  return {
    id: role === "admin" ? "00000000-0000-4000-8000-0000000000ad" : "00000000-0000-4000-8000-0000000000e1",
    email: `zz-${role}@example.invalid`, full_name: `ZZ ${role}`, name: `ZZ ${role}`, role, active: true,
    approval_status: "approved", package_type: "premium", membership_status: "active",
    tenant_id: role === "admin" ? TENANT_B : TENANT_A, is_demo_account: false, module_permissions: ALL_PERMS,
  };
}

let browser;
export async function launch() { browser ??= await chromium.launch(); return browser; }
export async function close() { await browser?.close(); browser = undefined; }

/**
 * routes: Array<[method|"*", RegExp, (req, url, body) => {status, json?, abort?} | Promise<...>]>
 * First match wins; unmatched /api → 200 {ok:true}.
 */
export async function newPage({ user, routes = [], viewport = { width: 1280, height: 900 } }) {
  const b = await launch();
  const ctx = await b.newContext({ viewport });
  // Admin kabuğu (proxy + layout) HttpOnly cookie ister; yerel test token'ı (sink yalnız sunucuya cevap verir).
  if (user?.role === "admin") {
    await ctx.addCookies([{ name: "yasam_admin_session", value: "zz-local-fake-token", domain: "127.0.0.1", path: "/", httpOnly: true }]);
  }
  const calls = [];
  const consoleErrors = [];
  const pageErrors = [];
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, user);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue(); // anon sink records it
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const entry = { method: req.method(), path: url.pathname, search: url.search, body };
    calls.push(entry);
    if (url.pathname === "/api/auth/session" && req.method() === "GET") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    for (const [m, re, fn] of routes) {
      if ((m === "*" || m === req.method()) && re.test(url.pathname + url.search)) {
        const r = await fn(req, url, body);
        entry.status = r.abort ? "ABORT" : r.status;
        if (r.abort) return route.abort("internetdisconnected");
        if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
        return route.fulfill({ status: r.status, json: r.json ?? {} });
      }
    }
    entry.status = 200;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  return { ctx, page, calls, consoleErrors, pageErrors };
}

export async function anonLog() {
  const r = await fetch("http://127.0.0.1:54399/__log");
  return r.json();
}
export async function anonReset() { await fetch("http://127.0.0.1:54399/__reset"); }

let pass = 0, fail = 0;
export const results = [];
export function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  results.push({ group, name, ok: !!cond, detail });
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + detail : ""}`);
}
export function summary() { console.log(`\nUI: ${pass} passed, ${fail} failed`); return fail; }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
