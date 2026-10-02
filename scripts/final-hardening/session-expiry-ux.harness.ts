/**
 * WEB P1 — süresi dolan/iptal edilen oturum UX harness'ı (prod'a temas YOK).
 * Kural: sunucu süreleri DEĞİŞMEZ (admin idle 2s / mutlak 24s; uzman idle 7g / mutlak 30g);
 * yalnız istemci geçersiz oturumda bayat durumda takılmaz.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from "../../lib/auth/sessionSecurity";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let pass = 0;
let fail = 0;
const ok = (c: boolean, m: string) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "PASS" : "FAIL"} ${m}`);
};
const H = 3600_000;

async function main() {
  console.log("── A) Sunucu süreleri DEĞİŞMEDİ ──");
  ok(SESSION_IDLE_MS.admin === 2 * H && SESSION_ABSOLUTE_MS.admin === 24 * H, "admin: idle 2 saat, mutlak 24 saat");
  ok(SESSION_IDLE_MS.expert === 7 * 24 * H && SESSION_ABSOLUTE_MS.expert === 30 * 24 * H, "uzman: idle 7 gün, mutlak 30 gün (yeni/ kısaltılmış süre YOK)");

  console.log("\n── B) Oturum durumu uç noktası (neden) ──");
  const route = read("app/api/auth/session/route.ts");
  ok(/EXPIRED_END_REASONS[\s\S]*"expired_idle"[\s\S]*"expired_absolute"[\s\S]*"expired_policy_cleanup"/.test(route), "süre dolumu nedenleri → reason=expired");
  ok(/reason: "expired" \| "revoked" = "revoked"/.test(route), "diğer/okunamayan nedenler → güvenli varsayılan revoked");
  ok(/\.eq\("session_token", token\)/.test(route) && /if \(valid\) return json\(\{ valid: true \}/.test(route), "neden yalnız aynı token için; geçerli oturumda ek bilgi yok");

  console.log("\n── C) İstemci yardımcıları (davranış) ──");
  const g = globalThis as unknown as Record<string, unknown>;
  const store = new Map<string, string>();
  g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  g.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  g.window = globalThis;
  const { checkSessionStatus, markSessionEnded, consumeSessionEnded } = await import("../../lib/auth/sessionExpiry");
  let next: () => Promise<Response> = async () => new Response(JSON.stringify({ valid: true }), { status: 200 });
  const seen: Array<{ url: string; headers: Record<string, string> }> = [];
  g.fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.push({ url, headers: init?.headers ?? {} });
    return next();
  };
  ok((await checkSessionStatus("tok-1"))?.valid === true, "geçerli oturum → valid");
  ok(!seen[0].url.includes("token=") && seen[0].headers["x-session-token"] === "tok-1", "token URL'de değil başlıkta");
  next = async () => new Response(JSON.stringify({ valid: false, reason: "expired" }), { status: 200 });
  const ex = await checkSessionStatus("tok-1");
  ok(ex?.valid === false && ex.reason === "expired", "süre dolumu → reason expired");
  next = async () => new Response(JSON.stringify({ valid: false, reason: "revoked" }), { status: 200 });
  ok((await checkSessionStatus("tok-1"))?.reason === "revoked", "iptal → reason revoked");
  next = async () => { throw new Error("network"); };
  ok((await checkSessionStatus("tok-1")) === null, "ağ hatası → null (oturum sonu SAYILMAZ)");
  next = async () => new Response("x", { status: 500 });
  ok((await checkSessionStatus("tok-1")) === null, "5xx → null (oturum sonu SAYILMAZ)");
  ok((await checkSessionStatus(null)) === null, "token yok → null (istek yok)");
  markSessionEnded("expired");
  ok(consumeSessionEnded() === "expired" && consumeSessionEnded() === null, "neden bir kez taşınır ve tüketilir");

  console.log("\n── D) Guard kapsamı ──");
  const guard = read("hooks/useSessionGuard.ts");
  ok(!/role === "admin"\) return/.test(guard) && !/user\.role === "admin"/.test(guard), "useSessionGuard admin'i MUAF TUTMAZ");
  ok(/VALIDATE_INTERVAL_MS = 60 \* 1000/.test(guard) && /visibilitychange/.test(guard), "yük: 60 sn + görünürlük dönüşü (daha sık polling yok)");
  ok(/onSessionInvalid: \(reason: SessionEndReason\) => void/.test(guard), "guard nedeni iletir");
  const mrg = read("components/auth/ModuleRouteGuard.tsx");
  ok(/useStoredSessionGuard\(\(pathname \?\? "\/"\) !== "\/"/.test(mrg) && /markSessionEnded\(reason\)/.test(mrg) && /clearYasamUser\(\)/.test(mrg) && /window\.location\.replace\("\/"\)/.test(mrg), "modül + /admin sayfaları: temizle → nedenle ana sayfa giriş akışı");

  console.log("\n── E) Ana sayfa (hub) ──");
  const page = read("app/page.tsx");
  ok(/reason === "expired" \? t\("auth\.sessionExpired"\) : t\("auth\.sessionInvalid"\)/.test(page), "süre dolumunda 'başka cihaz' mesajı KULLANILMAZ");
  ok(/clearYasamUser\(\);\s*setUser\(null\);\s*setAuthModalView\("login"\);\s*setLoginModalOpen\(true\);/.test(page), "bayat durum temizlenir + giriş modalı açılır");
  const nav = page.slice(page.indexOf("async function handleAdminNav"), page.indexOf("async function retryProfileSync"));
  ok(/if \(status === 200\) \{\s*router\.push\("\/admin"\);/.test(nav) && (nav.match(/router\.push\("\/admin"\)/g) ?? []).length === 1, "handleAdminNav: /admin'e YALNIZ admin-session 200 ise gider");
  ok(/fetch\("\/api\/auth\/admin-session"/.test(nav), "handleAdminNav tıklama anında oturumu tazeler (bayat sonuç yok)");
  ok(/if \(status === 401\)[\s\S]*endSessionForReason/.test(nav), "401 → giriş akışı (sessiz '/' dönüşü yok)");
  ok(/\.then\(\(r\) => r\.status\)/.test(page) && /if \(status !== 401\) return;[\s\S]*endSessionRef\.current\(s\.reason\)/.test(page), "sayfa yüklemede admin-session 401 → oturum doğrulanır, geçersizse giriş akışı");
  ok(/consumeSessionEnded\(\)/.test(page), "modül sayfasından dönüşte neden gösterilir");

  console.log("\n── F) Mesajlar ──");
  const trRaw = JSON.parse(read("messages/tr/home.json"));
  const enRaw = JSON.parse(read("messages/en/home.json"));
  const tr = trRaw.home ?? trRaw;
  const en = enRaw.home ?? enRaw;
  ok(tr.auth?.sessionExpired === "Oturum süreniz doldu. Lütfen tekrar giriş yapın.", "TR: 'Oturum süreniz doldu. Lütfen tekrar giriş yapın.'");
  ok(typeof en.auth?.sessionExpired === "string" && en.auth.sessionExpired.length > 0, "EN anahtar paritesi");

  console.log(`\nsession-expiry-ux harness: ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main();
