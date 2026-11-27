/**
 * GİRİŞ GÜVENLİĞİ — admin doğrudan URL geri dönüşü: saf kural + proxy (gerçek proxy.ts, NextRequest). Ağ / DB YOK.
 * Kanıt: çerezsiz /admin/... → "/?yonetim=<yol>" (yetki kararı VERİLMEZ, yalnız yönlendirme); açık yönlendirme denemeleri
 * (şema, alan adı, //, \, .., kontrol karakteri, aşırı uzunluk, /admin dışı) parametreye GİRMEZ; çerez varken proxy geçirir
 * (son karar admin layout'ta DB ile); CSP başlığı yönlendirmede de var.
 * Çalıştır: npx tsx scripts/giris-guvenligi/admin-cerez-donus.check.ts
 */
import { NextRequest } from "next/server";
import { safeAdminReturnPath, ADMIN_RETURN_PARAM } from "@/lib/auth/adminReturnPath";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 200)}` : ""}`); }
}

async function main() {
  console.log("── saf kural");
  for (const v of ["/admin", "/admin/eposta-durumu", "/admin/users/00000000-0000-0000-0000-000000000001?x=1#hesap", "/admin?tab=1"]) ok(safeAdminReturnPath(v) === v, `kabul: ${v}`);
  for (const v of ["/admin/%2e%2e/settings", "/admin/%2f%2fevil", "/admin/%E0%A4%A", "", "/", "/settings", "/administrator", "//admin", "/admin//evil.example", "https://evil.example/admin", "/admin/\\evil", "/admin/../settings",
    "/admin/%0d%0aSet-Cookie", "/admin/\u0000", `/admin/${"a".repeat(400)}`, "javascript:alert(1)", "/admin/..", " /admin"]) {
    const r = safeAdminReturnPath(v);
    ok(r === null, `ret: ${JSON.stringify(v).slice(0, 40)}`, r);
  }

  console.log("── proxy");
  const { proxy } = await import("@/proxy") as { proxy: (r: NextRequest) => Promise<Response> | Response };
  const go = async (url: string, cookie?: string) => {
    const res = await proxy(new NextRequest(url, { headers: cookie ? { cookie } : {} }));
    return { status: res.status, loc: res.headers.get("location"), csp: res.headers.get("content-security-policy") };
  };
  const a = await go("https://www.yasamsistemi.com/admin/eposta-durumu");
  const u = a.loc ? new URL(a.loc) : null;
  ok(a.status === 307 && u?.pathname === "/" && u?.searchParams.get(ADMIN_RETURN_PARAM) === "/admin/eposta-durumu" && !!a.csp, "çerezsiz /admin/eposta-durumu → /?yonetim=/admin/eposta-durumu (CSP var)", a);
  const b = await go("https://www.yasamsistemi.com/admin/users/abc?tab=2");
  ok(new URL(b.loc ?? "https://x/").searchParams.get(ADMIN_RETURN_PARAM) === "/admin/users/abc?tab=2", "sorgu dizgisi korunur", b.loc);
  const c = await go("https://www.yasamsistemi.com/admin//evil.example");
  ok(c.status === 307 && !new URL(c.loc ?? "https://x/").searchParams.has(ADMIN_RETURN_PARAM), "//evil → parametre YOK (yalnız ana sayfa)", c.loc);
  const d = await go("https://www.yasamsistemi.com/admin/eposta-durumu", "yasam_admin_session=xxxxxxxxxxxxxxxxxxxxxxxx");
  ok(d.status !== 307 || !d.loc, "çerez varken proxy yönlendirmez (yetki kararı admin layout'ta, DB)", d);
  const e = await go("https://www.yasamsistemi.com/settings");
  ok(!e.loc, "/admin dışı yollar etkilenmez", e);
  console.log(`\nadmin-cerez-donus: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((err) => { console.error(err); console.log(`\nadmin-cerez-donus: ${pass} PASS / ${fail + 1} FAIL`); process.exit(1); });
