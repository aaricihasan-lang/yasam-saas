/**
 * WT5 — Biyoenerji GENEL ARAMA route entegrasyon harness'ı.
 * GERÇEK route (app/api/biyoenerji/search) + GERÇEK Postgres (embedded) + PostgREST shim
 * (scripts/bioenergy-presale-final/bioTestEnv). Production'a SIFIR temas; veriler sentetik ZZ_*.
 * Embedded PG LC_ALL=C → collation Türkçe büyük/küçük harfi katlamaz (prod en_US'ten de katı):
 * ön-süzgeç jokerinin ve JS kesin süzgecinin collation'dan bağımsız çalıştığını kanıtlar.
 * Çalıştır: npx tsx scripts/wt5/bio-search-route.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { NextRequest } from "next/server";
import { SERVICE_KEY, ANON_KEY, startBioTestEnv, seedBio, type BioSeed } from "../bioenergy-presale-final/bioTestEnv";
import { harness } from "../bioenergy-presale-final/fakePostgrest";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const H = harness("wt5/bio-search-route");
type Auth = { id: string; token: string } | null;
type Hit = { section: string; sectionLabel: string; id: string; title: string; href: string; matchedField: string };
type Sec = { key: string; label: string; total: number; hits: Hit[] };
type Res = { ok?: boolean; total?: number; sections?: Sec[]; error?: string; query?: string };

function req(q: string, auth: Auth, extra = ""): NextRequest {
  const headers: Record<string, string> = {};
  if (auth) { headers["x-user-id"] = auth.id; headers["x-session-token"] = auth.token; }
  return new NextRequest(`http://localhost/api/biyoenerji/search?q=${encodeURIComponent(q)}${extra}`, { headers });
}

(async () => {
  const env = await startBioTestEnv({ port: 54481, dirName: "wt5-bio-search-pgdata", maxRows: 1000 });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const seed: BioSeed = await seedBio(env.su);
  const A = seed.users.A, B = seed.users.B;
  const su = env.su;
  try {
    // Tenant A: farklı bölümlerde "mide" geçen kayıtlar (büyük/küçük + Türkçe İ)
    await su.query(`insert into bioenergy_subconscious_causes(tenant_id, title, content) values
      ($1,'ZZ MİDE AĞRISI','x'), ($1,'ZZ Korku','Mide bölgesinde sıkışma'), ($1,'ZZ Made up','made in')`, [seed.TA]);
    await su.query(`insert into bioenergy_chakras(tenant_id, name, organs) values ($1,'ZZ Solar Pleksus','mide, karaciğer'), ($1,'ZZ Kalp Çakrası','kalp')`, [seed.TA]);
    await su.query(`insert into bioenergy_energy_bodies(tenant_id, source_uid, genel_tanim) values ($1,'ZZ Eterik Beden','Mide ile bağlantılı katman')`, [seed.TA]);
    await su.query(`insert into bioenergy_symbols(tenant_id, symbol, title, meaning) select $1, 'ZZ Sembol '||g, 'ZZ', 'mide anlamı '||g from generate_series(1,40) g`, [seed.TA]);
    await su.query(`insert into bioenergy_imaginations(tenant_id, title, text) values ($1,'ZZ Işık İmajinasyonu','ışık'), ($1,'ZZ Deniz','dalga')`, [seed.TA]);
    // Tenant B: aynı kelime — A ASLA görmemeli
    await su.query(`insert into bioenergy_subconscious_causes(tenant_id, title, content) values ($1,'ZZ_B GİZLİ MİDE','b tenant')`, [seed.TB]);
    await su.query(`insert into bioenergy_chakras(tenant_id, name, organs) values ($1,'ZZ_B Çakra','mide')`, [seed.TB]);

    const route = await import("../../app/api/biyoenerji/search/route");
    const call = async (q: string, auth: Auth, extra = "") => {
      const r = await route.GET(req(q, auth, extra));
      return { status: r.status, json: (await r.json().catch(() => ({}))) as Res };
    };

    // Yetki
    H.ok((await call("mide", null)).status === 401, "oturumsuz → 401");
    H.ok((await call("mide", { id: A.id, token: "sahte" })).status === 401, "sahte token → 401");
    H.ok((await call("mide", { id: B.id, token: A.token })).status === 403, "id/token uyuşmazlığı → 403");
    H.ok((await call("mide", seed.users.NOMOD)).status === 403, "modül izni yok → 403");
    H.ok((await call("mide", seed.users.PENDING)).status === 403, "onay bekleyen → 403");

    // Tek kelime, farklı alt bölümler, büyük/küçük + Türkçe İ
    const r1 = await call("mide", A);
    const titles = (r1.json.sections ?? []).flatMap((s) => s.hits.map((h) => h.title));
    const keys = (r1.json.sections ?? []).map((s) => s.key);
    H.ok(r1.status === 200 && r1.json.ok === true, "200 ok");
    H.ok(titles.includes("ZZ MİDE AĞRISI") && titles.includes("ZZ Korku"), "büyük harf 'MİDE' ve 'Mide' eşleşir (C collation'da bile)");
    H.ok(!titles.includes("ZZ Made up"), "joker ön-süzgecin fazlası ('made') kesin süzgeçte düşer");
    H.ok(["bilincalti-sebepleri", "cakralar", "enerji-bedenleri", "sembol-dili"].every((k) => keys.includes(k)), `farklı alt bölümlerden sonuç (${keys.join(",")})`);
    H.ok((r1.json.sections ?? []).every((s) => s.label && s.hits.every((h) => h.sectionLabel === s.label && h.title)), "her sonuçta başlık + bölüm adı");
    // Tenant izolasyonu
    H.ok(!titles.some((t) => t.startsWith("ZZ_B")), "B tenant'ının kayıtları A'nın sonuçlarında YOK");
    const rB = await call("mide", B);
    const tB = (rB.json.sections ?? []).flatMap((s) => s.hits.map((h) => h.title));
    H.ok(tB.length === 2 && tB.every((t) => t.startsWith("ZZ_B")), "B yalnız kendi 2 kaydını görür");
    const rSpoof = await call("mide", B, `&tenant_id=${seed.TA}&tenantId=${seed.TA}`);
    H.ok((rSpoof.json.sections ?? []).flatMap((s) => s.hits).every((h) => h.title.startsWith("ZZ_B")), "query'de tenant_id verilse de yok sayılır");

    // Çok sonuç + sınır
    const sym = (r1.json.sections ?? []).find((s) => s.key === "sembol-dili");
    H.ok(sym?.total === 40 && sym.hits.length === 25, `çok sonuç: toplam 40, gösterilen 25 (${sym?.total}/${sym?.hits.length})`);
    H.ok(r1.json.total === (r1.json.sections ?? []).reduce((a, s) => a + s.total, 0), "genel toplam = bölüm toplamları");

    // Türkçe karakter / ASCII yazım
    const rIsik = await call("IŞIK", A);
    H.ok((rIsik.json.sections ?? []).some((s) => s.hits.some((h) => h.title === "ZZ Işık İmajinasyonu")), "'IŞIK' → 'Işık' (ı/I)");
    const rCakra = await call("cakra", A);
    H.ok((rCakra.json.sections ?? []).some((s) => s.hits.some((h) => h.title === "ZZ Kalp Çakrası")), "ASCII 'cakra' → 'Çakrası'");

    // 0 sonuç / geçersiz
    const r0 = await call("zzyokboyle", A);
    H.ok(r0.status === 200 && r0.json.total === 0 && (r0.json.sections ?? []).length === 0, "0 sonuç → boş liste");
    const rShort = await call("m", A);
    H.ok(rShort.status === 200 && rShort.json.total === 0, "1 karakter → arama yapılmaz");
    const rInj = await call("mide),title.ilike.%", A);
    H.ok(rInj.status === 200 && !(rInj.json.sections ?? []).flatMap((s) => s.hits).some((h) => h.title.startsWith("ZZ_B")), "PostgREST or() enjeksiyon denemesi → güvenli (500 yok, sızıntı yok)");

    // Navigasyon hedefleri
    const hitCh = (r1.json.sections ?? []).find((s) => s.key === "cakralar")?.hits[0];
    H.ok(Boolean(hitCh) && hitCh!.href === `/dashboard/biyoenerji/cakralar/${encodeURIComponent(hitCh!.id)}`, "çakra sonucu → kayıt detay rotası");
    const hitEb = (r1.json.sections ?? []).find((s) => s.key === "enerji-bedenleri")?.hits[0];
    H.ok(hitEb?.href === "/dashboard/biyoenerji/enerji-bedenleri?q=ZZ%20Eterik%20Beden", "enerji bedeni → bölüm + arama");

    // Demo hesap da yalnız kendi tenant'ında okur (yazma yok)
    const rDemo = await call("mide", seed.users.DEMO);
    H.ok(rDemo.status === 200 && !(rDemo.json.sections ?? []).flatMap((s) => s.hits).some((h) => h.title.startsWith("ZZ_B")), "demo hesap: tenant izolasyonu korunur");
  } catch (e) {
    H.ok(false, `beklenmeyen hata: ${String(e).slice(0, 300)}`);
  } finally {
    await env.stop();
  }
  H.done();
})();
