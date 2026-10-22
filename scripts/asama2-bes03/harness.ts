/**
 * AŞAMA 2 / BES-03 — Danışan alerjen listesi ATOMİK sürüm kontrolü harness'ı.
 *
 * GERÇEK route handler'ları + GERÇEK nutrition migration zinciri (yerel embedded-postgres + test
 * PostgREST shim'i; scripts/dogal-destek-p2/beslenme/env.ts — `_nutrition_` migration'larını sırayla
 * uygular, 20271113000200 DAHİL). PRODUCTION'A SIFIR TEMAS; sentetik ZZ_ veri.
 *
 * İki sekme · sürümsüz / bozuk sürüm · 5 tur eşzamanlı çift istek · ADVISORY KİLİT YARIŞI (başka
 * işlem kilit altında listeyi değiştirirken) · v2'yi doğrudan sürümsüz/yanlış sürümle çağırma ·
 * v1'in yalnız service_role'e açık olduğu + yeni rotanın v1'i çağırmadığı · tenant / danışan
 * izolasyonu · demo · notların korunması · v2 yoksa 503 (fail-closed).
 *
 * Çalıştır: npx tsx scripts/asama2-bes03/harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";
import pg from "pg";
import { NextRequest } from "next/server";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(c: unknown, label: string, extra?: unknown) {
  if (c) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const PORT = 54681;
const MIG = "20271113000200_nutrition_replace_client_allergens_v2.sql";
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

type Json = Record<string, unknown>;
type H = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type U = { id: string; token: string };
async function call(handler: unknown, method: string, clientId: string, auth: U, body?: unknown) {
  const req = new NextRequest("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json", "x-user-id": auth.id, "x-session-token": auth.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await (handler as H)(req, { params: Promise.resolve({ clientId }) });
  let json: Json = {};
  try { json = (await res.clone().json()) as Json; } catch { /* boş */ }
  return { status: res.status, json };
}

async function main() {
  const { startBesDb, pointRoutesTo } = await import("../dogal-destek-p2/beslenme/env");
  const { startEmbedShim } = await import("../dogal-destek-p2/beslenme/pgrestEmbedShim");
  const db = await startBesDb({ port: PORT, dirName: "asama2-bes03-pgdata", includeNewMigration: true });
  const shim = await startEmbedShim(db.pool);
  pointRoutesTo(shim.url);
  const su = db.env.su;
  const q = async (sql: string, a: unknown[] = []) => (await su.query(sql, a)).rows;
  const q1 = async (sql: string, a: unknown[] = []) => (await q(sql, a))[0];
  try {
    const S = db.seed;
    const { A, A2, B, DEMO } = S.users;
    const a1 = S.clients.a1;
    const a2 = S.clients.a2;
    const route = await import("../../app/api/beslenme/clients/[clientId]/allergens/route");
    const allergenIds = (await q(`select id, code from nutrition_allergens order by code limit 4`)).map((r) => r.id as string);
    const [AL1, AL2, AL3] = allergenIds;
    const setOf = async (clientId: string) =>
      (await q(`select coalesce(allergen_id::text, 'c:' || custom_label) k, note from nutrition_client_allergens where client_id=$1 order by 1`, [clientId]))
        .map((r) => `${r.k}${r.note ? "|" + r.note : ""}`).join(",");
    const getV = async (clientId = a1, u: U = A) => (await call(route.GET, "GET", clientId, u)).json.version as string;

    section("Migration (izole DB; idempotent; ACL)");
    ok(db.applied.includes(MIG), "v2 migration nutrition zincirinde uygulandı");
    await su.query(mig(MIG));
    await su.query(mig(MIG));
    const acl = await q1(`select
      has_function_privilege('anon','public.nutrition_replace_client_allergens_v2(uuid,uuid,jsonb,text)','EXECUTE') a,
      has_function_privilege('authenticated','public.nutrition_replace_client_allergens_v2(uuid,uuid,jsonb,text)','EXECUTE') b,
      has_function_privilege('service_role','public.nutrition_replace_client_allergens_v2(uuid,uuid,jsonb,text)','EXECUTE') c,
      has_function_privilege('anon','public.nutrition_client_allergens_version(uuid,uuid)','EXECUTE') d,
      has_function_privilege('anon','public.nutrition_replace_client_allergens(uuid,uuid,jsonb)','EXECUTE') e,
      has_function_privilege('authenticated','public.nutrition_replace_client_allergens(uuid,uuid,jsonb)','EXECUTE') f`);
    ok(!acl.a && !acl.b && acl.c && !acl.d && !acl.e && !acl.f, "v2 + version: yalnız service_role; v1 de istemciye (anon/authenticated) KAPALI", acl);
    const src = readFileSync(path.join(process.cwd(), "app/api/beslenme/clients/[clientId]/allergens/route.ts"), "utf8");
    ok(/rpc\("nutrition_replace_client_allergens_v2"/.test(src) && !/rpc\("nutrition_replace_client_allergens"/.test(src) && !/\.delete\(\)|\.insert\(/.test(src),
      "rota YALNIZ v2'yi çağırır (v1 / doğrudan tablo yazımı yok → eski RPC ile atlatma yolu yok)");

    section("İki sekme");
    const v0 = await getV();
    ok(/^[0-9a-f]{64}$/.test(v0), "GET sürüm (boş küme de sürümdür)");
    const tA = await call(route.PUT, "PUT", a1, A, { allergens: [{ allergen_id: AL1, note: "Hafif" }, { custom_label: "Kivi" }], version: v0 });
    const v1 = tA.json.version as string;
    ok(tA.status === 200 && v1 !== v0 && v1 === (await getV()), "Sekme A → 200, yeni sürüm = GET sürümü", tA.json);
    const afterA = await setOf(a1);
    const tB = await call(route.PUT, "PUT", a1, A2, { allergens: [{ allergen_id: AL2 }], version: v0 });
    ok(tB.status === 409 && tB.json.code === "ALLERGEN_CONFLICT" && (await setOf(a1)) === afterA, "Sekme B eski listeyle → 409, Sekme A'nın alerjenleri (+ notu) KORUNDU", tB);
    ok(afterA.includes("|Hafif"), "not korunur");
    const noV = await call(route.PUT, "PUT", a1, A, { allergens: [] });
    ok(noV.status === 428 && noV.json.code === "ALLERGEN_VERSION_REQUIRED" && (await setOf(a1)) === afterA, "sürümsüz PUT (eski istemci) → 428, liste SİLİNMEDİ", noV);
    const badV = await call(route.PUT, "PUT", a1, A, { allergens: [], version: "abc" });
    ok(badV.status === 428 && (await setOf(a1)) === afterA, "bozuk sürüm → 428");
    const fake = await call(route.PUT, "PUT", a1, A, { allergens: [], version: "0".repeat(64) });
    ok(fake.status === 409 && (await setOf(a1)) === afterA, "uydurma sürüm → 409");

    section("Eşzamanlı çift istek (5 tur)");
    let raceOk = true;
    for (let i = 0; i < 5; i++) {
      const v = await getV();
      const [x, y] = await Promise.all([
        call(route.PUT, "PUT", a1, A, { allergens: [{ custom_label: `X${i}` }], version: v }),
        call(route.PUT, "PUT", a1, A2, { allergens: [{ custom_label: `Y${i}` }], version: v }),
      ]);
      const codes = [x.status, y.status].sort().join(",");
      const win = x.status === 200 ? `c:X${i}` : `c:Y${i}`;
      if (codes !== "200,409" || (await setOf(a1)) !== win) { raceOk = false; console.error("   tur", i, codes, await setOf(a1)); }
    }
    ok(raceOk, "her turda tam 1×200 + 1×409; liste = kazananın listesi (karışma yok)");

    section("Advisory kilit yarışı (eski v1 yazarı kilit altında değiştirirken)");
    {
      const v = await getV();
      const locker = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
      await locker.connect();
      await locker.query("begin");
      await locker.query(`select public.nutrition_replace_client_allergens($1,$2,$3::jsonb)`, [S.TA, a1, JSON.stringify([{ custom_label: "PARALEL-V1" }])]);
      const pending = call(route.PUT, "PUT", a1, A, { allergens: [{ custom_label: "KILITTE-BEKLEYEN" }], version: v });
      await new Promise((r) => setTimeout(r, 800));
      await locker.query("commit");
      await locker.end();
      const late = await pending;
      ok(late.status === 409 && (await setOf(a1)) === "c:PARALEL-V1", "kilit bırakılınca bekleyen v2 isteği 409; paralel yazarın listesi korunur (yarış penceresi yok)", { s: late.status, set: await setOf(a1) });
    }

    section("v2'yi doğrudan çağırarak atlatma girişimi");
    const before = await setOf(a1);
    let e1 = "";
    try { await su.query(`select public.nutrition_replace_client_allergens_v2($1,$2,'[]'::jsonb,null)`, [S.TA, a1]); } catch (e) { e1 = String((e as Error).message); }
    let e2 = "";
    try { await su.query(`select public.nutrition_replace_client_allergens_v2($1,$2,'[]'::jsonb,$3)`, [S.TA, a1, "f".repeat(64)]); } catch (e) { e2 = String((e as Error).message); }
    ok(/allergen_version_required/.test(e1) && /allergen_version_conflict/.test(e2) && (await setOf(a1)) === before, "sürümsüz / yanlış sürümle doğrudan çağrı → istisna, liste değişmedi", { e1, e2 });

    section("Tenant / danışan izolasyonu, demo");
    const vA = await getV();
    const tenB = await call(route.PUT, "PUT", a1, B, { allergens: [], version: vA });
    ok((tenB.status === 404 || tenB.status === 403) && (await setOf(a1)) === before, "başka tenant → reddedilir, liste değişmedi", tenB.status);
    const cross = await call(route.PUT, "PUT", a2, A, { allergens: [{ allergen_id: AL3 }], version: vA });
    ok(cross.status === 409 && (await setOf(a2)) === "" && (await setOf(a1)) === before, "a1'in sürümüyle a2'ye yazma → 409 (sürüm danışana özgü), iki liste de değişmedi");
    const dm = await call(route.PUT, "PUT", a1, DEMO, { allergens: [], version: vA });
    ok(dm.status === 403 && (await setOf(a1)) === before, "demo → 403");
    const vB = await getV(a1, B);
    ok(vB === undefined || vB === null, "başka tenant GET sürüm alamaz", vB);

    section("Fail-closed: v2 yoksa 503 (sessiz v1 / sürümsüz yazım YOK)");
    await su.query(`alter function public.nutrition_replace_client_allergens_v2(uuid,uuid,jsonb,text) rename to nutrition_replace_client_allergens_v2_x`);
    const un = await call(route.PUT, "PUT", a1, A, { allergens: [], version: await getV() });
    await su.query(`alter function public.nutrition_replace_client_allergens_v2_x(uuid,uuid,jsonb,text) rename to nutrition_replace_client_allergens_v2`);
    ok(un.status === 503 && un.json.code === "ALLERGEN_RPC_MISSING" && (await setOf(a1)) === before, "v2 yok → 503, liste değişmedi", un);

    section("Güncel sürümle tekrar kaydetme");
    const fin = await call(route.PUT, "PUT", a1, A, { allergens: [{ allergen_id: AL1 }, { custom_label: "Çilek (şüpheli)" }], version: await getV() });
    ok(fin.status === 200 && (await setOf(a1)).includes("c:Çilek (şüpheli)"), "güncel veriyle tekrar kayıt 200; Türkçe etiket korunur");
  } finally {
    await shim.close().catch(() => undefined);
    await db.stop();
  }
}

main()
  .catch((e) => { fail++; fails.push(String(e)); console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / BES-03 harness: ${pass} PASS / ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
