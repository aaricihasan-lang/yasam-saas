/**
 * BUG-016 — Biyoenerji liste araması Türkçe i-ailesinde (i/İ/ı/I) büyük-küçük harf duyarsız.
 * GERÇEK route (GET /api/biyoenerji/[resource]) + GERÇEK Postgres (embedded; PROD'A SIFIR TEMAS; ZZ_* veri).
 *
 * Not: embedded Postgres C locale'dedir → ş/ğ/ü/ö/ç büyük/küçük katlaması prod (en_US.UTF-8) ile
 * aynı değildir; bu yüzden test verisi yalnız i-ailesi + ASCII harf içerir (hatanın kendisi).
 *
 * 1) "inci" / "INCI" → "İnci" · "kırmızı" → "KIRMIZI" · "MİDE" / "mide" → "Mide" (liste + sayım aynı)
 * 2) kullanıcı girdisi literal: "." / "k.m" / "[" joker değil; yanlış pozitif yok
 * 3) tenant izolasyonu; 4) diğer kaynak (bilinçaltı sebepleri) aynı davranış
 * 5) saf yardımcı = Doğaltaş buildTurkishInsensitiveRegex ile BİREBİR (eşdeğerlik kilidi)
 * Çalıştır: npx tsx scripts/bug016-bio-tr-search/routes.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { ANON_KEY, SERVICE_KEY, seedBio, startBioTestEnv } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";
import { buildTurkishInsensitiveRegex } from "../../lib/text/turkishRegex";
import { buildTurkishInsensitiveRegex as dogaltasRegex, sanitizeOrSearchTerm } from "../../lib/dogaltas/stonesListFetch";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const H0 = harness("bug016-bio-tr-search/routes");
const H = { ok: (c: unknown, m: string, d?: unknown) => H0.ok(c, d === undefined || c ? m : m + " — " + JSON.stringify(d).slice(0, 400)), done: () => H0.done() };
type Auth = { id: string; token: string };
const BASE = "http://localhost/api/biyoenerji";

(async () => {
  // ── 5) eşdeğerlik ──
  const samples = ["inci", "İNCİ", "Işık", "a.b", "x]y", "k*m+n?", "$^\\\"", "[{}]|", "  çok   boşluk  ", "ığüşöç İIıi", "x".repeat(300), "", ".", "mide-1"];
  H.ok(samples.every((s) => buildTurkishInsensitiveRegex(s) === dogaltasRegex(s)), "5: saf yardımcı Doğaltaş regex'iyle birebir aynı çıktı", samples.map((s) => [s.slice(0, 12), buildTurkishInsensitiveRegex(s), dogaltasRegex(s)]).filter((x) => x[1] !== x[2]));
  H.ok(samples.every((s) => buildTurkishInsensitiveRegex(sanitizeOrSearchTerm(s)) === dogaltasRegex(sanitizeOrSearchTerm(s))), "5b: temizlenmiş girdilerde de birebir");

  const env = await startBioTestEnv({ port: 54643, dirName: "bug016-bio-tr-search-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    const seed = await seedBio(su);
    const A: Auth = seed.users.A;
    const B: Auth = seed.users.B;
    const ins = (t: string, tenant: string, name: string) => su.query(`insert into bioenergy_chakras(tenant_id, source_uid, name) values ($1,$2,$3)`, [tenant, `zz-${name}`, name]);
    for (const n of ["İnci", "KIRMIZI", "Mide", "Kum", "Kam"]) await ins("chakras", seed.TA, n);
    await ins("chakras", seed.TB, "inci");
    await su.query(`insert into bioenergy_subconscious_causes(tenant_id, source_uid, title) values ($1,'zz-s1','İHMAL'),($1,'zz-s2','Kabul')`, [seed.TA]);
    const list = await import("../../app/api/biyoenerji/[resource]/route");
    const ctx = (resource: string) => ({ params: Promise.resolve({ resource }) });
    const get = async (u: Auth, resource: string, qs: string) => {
      const r = await list.GET(new NextRequest(`${BASE}/${resource}?${qs}`, { method: "GET", headers: { "x-user-id": u.id, "x-session-token": u.token } }), ctx(resource));
      return { status: r.status, json: (await r.json()) as { ok?: boolean; rows?: Array<{ name?: string; title?: string; tenant_id?: string }>; count?: number } };
    };
    const names = async (q: string, u = A, resource = "chakras") => {
      const r = await get(u, resource, `search=${encodeURIComponent(q)}`);
      const c = await get(u, resource, `count=1&search=${encodeURIComponent(q)}`);
      const rows = (r.json.rows ?? []).map((x) => x.name ?? x.title ?? "").sort();
      return { status: r.status, rows, count: c.json.count, countStatus: c.status };
    };

    // ── 1) i-ailesi ──
    for (const [q, want] of [["inci", ["İnci"]], ["INCI", ["İnci"]], ["İnci", ["İnci"]], ["kırmızı", ["KIRMIZI"]], ["Kirmizi", ["KIRMIZI"]],
      ["MİDE", ["Mide"]], ["mide", ["Mide"]], ["MIDE", ["Mide"]], ["ku", ["Kum"]], ["KU", ["Kum"]]] as const) {
      const r = await names(q);
      H.ok(r.status === 200 && JSON.stringify(r.rows) === JSON.stringify(want) && r.count === want.length, `1: "${q}" → ${want.join(",")} (liste + sayım)`, r);
    }
    // ── 2) literal ──
    for (const q of [".", "k.m", "[", "K_m", ".*"]) {
      const r = await names(q);
      H.ok(r.status === 200 && r.rows.length === 0 && r.count === 0, `2: "${q}" literal → yanlış pozitif yok`, r);
    }
    // ── 3) tenant ──
    let r = await names("inci", B);
    H.ok(JSON.stringify(r.rows) === JSON.stringify(["inci"]), "3: B yalnız kendi 'inci' kaydını görür", r);
    r = await names("inci", A);
    H.ok(JSON.stringify(r.rows) === JSON.stringify(["İnci"]), "3b: A, B'nin kaydını görmez", r);
    // ── 4) diğer kaynak ──
    r = await names("ihmal", A, "subconscious-causes");
    H.ok(JSON.stringify(r.rows) === JSON.stringify(["İHMAL"]) && r.count === 1, "4: bilinçaltı sebepleri 'ihmal' → 'İHMAL'", r);
    // boş arama = tüm liste (eski davranış)
    const all = await get(A, "chakras", "");
    H.ok(all.status === 200 && (all.json.rows ?? []).length === 5, "boş arama → tüm kayıtlar (eski davranış)");
  } catch (e) {
    H.ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await env.stop();
    H.done();
  }
})();
