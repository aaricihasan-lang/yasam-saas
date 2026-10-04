/**
 * ADMIN WEB ONAY AKIŞI — istemci düzeltmesi harness'ı (prod'a temas YOK).
 * Kök neden (2026-10-04): pending token sessionStorage'da + bekleme yalnız React state'inde; yeniden
 * "Giriş Yap" polling'i durduruyordu; farklı sekmede token yoktu → onay geldiğinde dinleyen sekme yok.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}`);
};

async function main() {
  console.log("── A) Saklama: localStorage + süre + iptal (davranış) ──");
  const g = globalThis as unknown as Record<string, unknown>;
  const ls = new Map<string, string>();
  const ss = new Map<string, string>([["yasam_pending_session_v1", "legacy"]]);
  const mk = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
  g.localStorage = mk(ls);
  g.sessionStorage = mk(ss);
  g.window = globalThis;
  const calls: Array<{ url: string; method: string; tok: string | undefined }> = [];
  g.fetch = async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
    calls.push({ url, method: init?.method ?? "GET", tok: init?.headers?.["x-session-token"] });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const m = await import("../../lib/auth/loginUser");
  const future = new Date(Date.now() + 9 * 60_000).toISOString();
  m.savePendingLogin("tok-1", future);
  ok(m.PENDING_LOGIN_STORAGE_KEY === "yasam_pending_login_v2" && ls.has("yasam_pending_login_v2"), "pending token localStorage'da (sekmeler arası + yenileme sonrası)");
  ok(m.readPendingLogin()?.token === "tok-1" && m.readPendingLoginToken() === "tok-1", "geçerli pending okunur");
  ok(!ls.has("yasam_session_token"), "pending token normal oturum anahtarına YAZILMAZ");
  m.savePendingLogin("tok-2", new Date(Date.now() - 1000).toISOString());
  ok(m.readPendingLogin() === null && !ls.has("yasam_pending_login_v2"), "süresi (10 dk) dolan pending okunurken silinir");
  ls.set("yasam_pending_login_v2", JSON.stringify({ token: "tok-3", expiresAt: null, savedAt: Date.now() - 11 * 60_000 }));
  ok(m.readPendingLogin() === null, "bitiş bilinmese de 10 dk + tampon sonra silinir");
  ls.set("yasam_pending_login_v2", "{bozuk");
  ok(m.readPendingLogin() === null, "bozuk kayıt → null (çökme yok)");
  m.savePendingLogin("tok-4", future);
  await m.cancelPendingLogin("tok-4");
  ok(calls.some((c) => c.url === "/api/auth/session/pending" && c.method === "DELETE" && c.tok === "tok-4") && !ls.has("yasam_pending_login_v2") && !ss.has("yasam_pending_session_v1"),
    "iptal: sunucuda pending kapatılır (DELETE) + yerel token (eski sessionStorage dahil) silinir");

  console.log("\n── B) Sunucu: iptal uç noktası yalnız bekleyen kaydı kapatır ──");
  const pr = read("app/api/auth/session/pending/route.ts");
  const del = pr.slice(pr.indexOf("export async function DELETE"));
  ok(/\.eq\("session_state", "pending_approval"\)/.test(del) && /\.eq\("is_active", false\)/.test(del) && /\.is\("ended_at", null\)/.test(del) && /pending_cancelled/.test(del),
    "DELETE: yalnız bu token'ın hâlâ bekleyen (is_active=false) kaydı; aktif oturuma dokunmaz");
  ok(/status: 200/.test(del) && !/user_id|users/.test(del), "idempotent 200; kullanıcı/oturum bilgisi sızdırmaz");

  console.log("\n── C) Sayfa: kilit + otomatik sürdürme + sekmeler arası ──");
  const page = read("app/page.tsx");
  ok(/\{!pendingLogin && \(\s*<>\s*<div className="relative z-10 mt-5 space-y-3\.5">/.test(page), "bekleme sırasında e-posta/parola/giriş butonu gösterilmez (form kilitli)");
  ok(/if \(pendingLogin \|\| readPendingLogin\(\)\) return;/.test(page), "bekleyen işlem varken yeni login/session OLUŞTURULMAZ");
  ok(/void cancelPendingLogin\(tok\)/.test(page) && /auth\.pendingCancel/.test(page), "'Beklemeyi iptal et' sunucu iptaliyle");
  ok(/const restore = \(\) => \{[\s\S]*readPendingLogin\(\)[\s\S]*setPendingLogin\(/.test(page) && /window\.addEventListener\("storage", onStorage\)/.test(page),
    "yenileme / yeni sekme: geçerli pending varsa bekleme otomatik sürer (+ storage olayı)");
  ok(/e\.key === "yasam_user" && e\.newValue && !userRef\.current\) window\.location\.reload\(\)/.test(page), "başka sekme girişi tamamlarsa bu sekme aynı oturumla açılır");
  const tick = page.slice(page.indexOf("const tick = async () => {"), page.indexOf("const first = window.setTimeout(() => void tick(), 2000);"));
  ok(/await completeLoginRef\.current\(st\.row, pendingLogin\.token, false\);\s*clearPendingLoginToken\(\);/.test(tick), "onay → giriş tamamlanır, token SONRA temizlenir (açık diğer sekmeler de tamamlar)");
  ok(/clearPendingLoginToken\(\);\s*setMessage\(st\.state === "denied"/.test(tick), "ret / süre dolumu → token temizlenir + mesaj");
  ok(/const stored = readPendingLogin\(\);/.test(tick), "her turda yerel 10 dk süre + başka sekme iptali kontrol edilir");

  console.log("\n── D) Geçici Android tanılama logu KALDIRILDI ──");
  const { existsSync } = await import("node:fs");
  const sess = read("app/api/auth/session/route.ts");
  ok(!existsSync(join(ROOT, "lib/auth/appSignalDiag.ts")) && !/logAppSignalDiag|app-signal-diag/.test(sess), "header/referer telemetrisi production'da kalmadı");

  console.log(`\nadmin-pending-ux harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main();
