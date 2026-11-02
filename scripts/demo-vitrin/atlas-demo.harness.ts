/**
 * DEMO HESABI — GÖKYÜZÜ ATLASI SALT OKUNUR ÖRNEK GÖRÜNÜMÜ (D8, owner 2026-11-01). Ağ / DB / ücretli çağrı YOK.
 *
 * CI regresyon listesine girer (korunan Atlas test klasörü DIŞINDA). Doğrular:
 *   A) Örnek veri: 42 tekniğin hepsi Örnek Harita A'da hazır; sağlayıcı yorumu YOK; danışan / e-posta / gerçek kişi YOK;
 *      plan yeni istek beklemez (önbellekten).
 *   B) Demo servisi: okuma uçları örneği döndürür; yazma / rapor / bilinmeyen → 403 / 404; plan-çalıştır hazır örneği verir,
 *      hazır olmayan seçim açık nedenle engellenir (uydurma sonuç yok), sağlayıcı denemesi 0.
 *   C) Demo kapısı (isAstrologyDemoViewer): yalnız demo + uzman + Premium + kill switch açık + uzman yolu.
 *   D) Statik: demo ucu / servis / kapı veritabanı, motor, sağlayıcı istemcisi, ağ İÇE AKTARMAZ; kapı istekten önce;
 *      gerçek Atlas kapısı ve erişim ucu DEĞİŞMEDİ (demo'ya 404); astrology modül anahtarı demo'da hâlâ KAPALI.
 *   E) İstemci sayfa kapısı: demo /astroloji'yi açar; diğer demo-kapalı modüller kapalı kalır; demo olmayan uzman değişmez.
 * Örneğin motorla birebir yeniden üretilebildiği ayrıca: scripts/astrology/demo/build-demo-fixture.ts --check (korunan alan).
 * Çalıştır: npx tsx --tsconfig scripts/tsconfig.demo-vitrin-tests.json scripts/demo-vitrin/atlas-demo.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { handleAstrologyDemoRequest } from "../../lib/astrology/demo/demoService";
import DEMO_FIXTURE_JSON from "../../lib/astrology/demo/fixture.generated";
import { isAstrologyDemoViewer } from "../../lib/astrology/demo/demoGate";
import { TECHNIQUE_IDS } from "../../lib/astrology/engine/techniques";
import { DEMO_DENIED_MODULE_KEYS, resolveModuleAccess } from "../../lib/auth/moduleAccessCore";
import { canExpertAccessRoutePath, evaluateRouteModuleGuard } from "../../lib/auth/routeModuleAccess";
import type { YasamUser } from "../../lib/auth/yasamUser";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    fails.push(label);
    console.error(`  ✗ ${label}`);
  }
}
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = path.resolve(__dirname, "..", "..");
const src = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
type J = Record<string, unknown>;
const call = (method: string, p: string, query: Record<string, string> = {}, body: unknown = null) =>
  handleAstrologyDemoRequest(method, p, new URLSearchParams(query), body);

const FX = JSON.parse(DEMO_FIXTURE_JSON) as {
  profilesList: { profiles: { id: string; label: string; clientId: unknown }[] };
  analysesList: Record<string, { analyses: { id: string; technique: string; providerInterpIncluded: unknown; clientId: unknown }[] }>;
  analyses: Record<string, { analysis: { interpretation?: { visible?: unknown }; clientId?: unknown } }>;
  selections: { profileId: string; technique: string; options: J; plan: { newRequestCount: number }; view: { ok: boolean; view: { interpretation?: { visible?: unknown } } } }[];
};
const [A, B] = (() => {
  const a = FX.profilesList.profiles.find((p) => p.label.includes(" A "))!;
  const b = FX.profilesList.profiles.find((p) => p.label.includes(" B "))!;
  return [a.id, b.id];
})();

async function main() {
  section("A Örnek veri (motor çıktısı) değişmezleri");
  {
    const techA = new Set(FX.selections.filter((s) => s.profileId === A).map((s) => s.technique));
    const missing = TECHNIQUE_IDS.filter((t) => !techA.has(t));
    ok(missing.length === 0, `Örnek Harita A'da ${TECHNIQUE_IDS.length} tekniğin hepsi hazır${missing.length ? ` (eksik: ${missing.join(", ")})` : ""}`);
    ok(FX.profilesList.profiles.length === 2 && FX.profilesList.profiles.every((p) => p.label.startsWith("Örnek Harita") && p.clientId === null), "yalnız 2 sentetik örnek profil; danışan bağı yok");
    ok(FX.selections.every((s) => s.plan.newRequestCount === 0 && s.view.ok === true), "her seçim önbellekten (plan yeni istek beklemez) ve görünümü hazır");
    ok(FX.selections.every((s) => s.view.view.interpretation?.visible === false), "sonuç görünümlerinde sağlayıcı yorumu YOK");
    const an = Object.values(FX.analyses).map((x) => x.analysis);
    ok(an.length === FX.selections.length && an.every((a) => a.interpretation?.visible === false && (a.clientId ?? null) === null), `${an.length} kayıtlı analiz: yorum yok, danışan bağı yok`);
    ok(Object.values(FX.analysesList).every((l) => l.analyses.every((a) => a.providerInterpIncluded === false && a.clientId === null)), "analiz listesi: yorum işareti / danışan yok");
    const text = DEMO_FIXTURE_JSON;
    ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(text), "e-posta adresi yok");
    ok(!/Roxy|RoxyAPI/.test(text), "marka adı (kullanıcı metni) yok");
    ok(!/"(raw_response|apiKey|session_token|password)"/.test(text), "ham sağlayıcı yanıtı / anahtar / oturum alanı yok");
  }

  section("B Demo servisi");
  {
    const acc = call("GET", "access");
    const ent = acc.body.entitlements as J;
    ok(acc.status === 200 && acc.body.demo === true && acc.body.readOnly === true && acc.body.isOwner === false && ent.providerInterpretations === false, "erişim: demo + salt okunur; sağlayıcı yorumu yetkisi YOK");
    const pl = call("GET", "profiles");
    ok(pl.status === 200 && (pl.body.profiles as unknown[]).length === 2, "profil listesi: 2 örnek");
    ok((call("GET", "profiles", { q: "ankara" }).body.profiles as { id: string }[]).map((p) => p.id).join() === B, "arama (Türkçe küçük harf) süzer");
    ok((call("GET", "profiles", { view: "archive" }).body.profiles as unknown[]).length === 2, "Analiz Arşivi: kayıtlı analizi olan 2 örnek");
    ok((call("GET", "profiles", { archived: "1" }).body.profiles as unknown[]).length === 0, "arşivlenmiş profil yok");
    ok(call("GET", `profiles/${A}`).status === 200 && call("GET", "profiles/00000000-0000-4000-8000-0000000000ff").status === 404, "profil ayrıntısı: örnek 200, bilinmeyen 404");
    const la = call("GET", "analyses", { profileId: A });
    ok(la.status === 200 && la.body.filteredTotal === TECHNIQUE_IDS.length, `analiz listesi A: ${String(la.body.filteredTotal)}`);
    const lv = call("GET", "analyses", { profileId: A, tradition: "vedic" });
    ok((lv.body.analyses as { tradition: string }[]).every((a) => a.tradition === "vedic") && Number(lv.body.filteredTotal) > 0, "gelenek süzgeci");
    const pg = call("GET", "analyses", { profileId: A, limit: "10", offset: "40" });
    ok((pg.body.analyses as unknown[]).length === 2 && pg.body.hasMore === false, "sayfalama (offset 40 → 2 kayıt)");
    const firstId = FX.analysesList[A].analyses[0].id;
    ok(call("GET", `analyses/${firstId}`).status === 200, "kayıtlı analiz ayrıntısı açılır");
    for (const p of ["analyses/report", `analyses/${firstId}/report`, "horary/western/report", `horary/western/records/${firstId}/report`]) ok(call("GET", p).body.code === "DEMO_READONLY", `rapor kapalı: GET ${p}`);
    ok(call("GET", "unmapped").status === 404 && call("GET", "client-status").status === 404 && call("GET", "results/x").status === 404, "izin listesi dışı GET → 404");
    ok((call("GET", "clients/candidates", { name: "ab" }).body.candidates as unknown[]).length === 0, "danışan adayı yok (gerçek danışan verisi okunmaz)");
    ok((call("GET", "horary/western/records").body.records as unknown[]).length === 0, "Horary kaydı yok");
    for (const [m, p] of [["POST", "profiles"], ["POST", "analyses"], ["PATCH", `profiles/${A}`], ["DELETE", `analyses/${firstId}`], ["PUT", "notes"], ["POST", "kb"], ["PATCH", "kb/x"], ["DELETE", "kb/x"], ["POST", "efemeris"], ["POST", "horary/western"], ["POST", "horary/western/records"], ["PUT", `profiles/${A}/client`], ["POST", "profiles/delete"], ["POST", `profiles/${A}/revisions`], ["PATCH", "unmapped"]] as const) {
      const r = call(m, p, {}, {});
      ok(r.status === 403 && r.body.code === "DEMO_READONLY", `yazma kapalı: ${m} ${p}`);
    }
    const natal = FX.selections.find((s) => s.profileId === A && s.technique === "western.natal")!;
    const plan = call("POST", "engine/plan", {}, { profileId: A, revision: 1, selections: [{ technique: "western.natal", options: { houseSystem: "koch" } }, { technique: "vedic.d1", options: {} }] });
    const pp = plan.body.plan as { newRequestCount: number; blockedCount: number; selections: { options: J; blocked: unknown }[] };
    ok(plan.status === 200 && pp.newRequestCount === 0 && pp.blockedCount === 0, "plan: hazır teknikler → 0 yeni istek, engel yok");
    ok(JSON.stringify(pp.selections[0].options) === JSON.stringify(natal.options), "plan: seçenekler hazır örneğin (motorla hesaplanmış) seçeneklerine normalize edilir");
    const runB = call("POST", "engine/run", {}, { profileId: B, revision: 1, selections: [{ technique: "western.natal", options: {} }] });
    ok(runB.status === 422 && runB.body.ok === false && (runB.body.results as J[])[0].code === "DEMO_SAMPLE_ONLY", "hazır örneği olmayan seçim → açık neden (uydurma sonuç yok)");
    const run = call("POST", "engine/run", {}, { profileId: A, revision: 1, selections: [{ technique: "kp.horary", options: {} }, { technique: "western.natal", options: {} }], confirmNewRequests: 0 });
    const ex = run.body.executed as J;
    const items = run.body.results as J[];
    ok(run.status === 200 && ex.providerAttempts === 0 && ex.newResults === 0 && items.every((x) => x.ok === true) && items[1].selectionIndex === 1, "çalıştır: hazır sonuçlar, sağlayıcı denemesi 0, sıra korunur");
    const partner = FX.selections.find((s) => s.technique === "western.synastry")!;
    ok((call("POST", "engine/view", {}, { profileId: A, revision: 1, selections: [{ technique: "western.synastry", options: { partnerProfileId: A } }] }).body.results as J[])[0].code === "DEMO_SAMPLE_ONLY", "ikili teknik: yalnız hazır karşı tarafla (başka kişi → engel)");
    ok((call("POST", "engine/view", {}, { profileId: A, revision: 1, selections: [{ technique: "western.synastry", options: partner.options }] }).body.results as J[])[0].ok === true, "ikili teknik: hazır karşı tarafla görünüm");
    ok(call("POST", "engine/plan", {}, { profileId: A, revision: 2, selections: [{ technique: "vedic.d1" }] }).status === 409, "eski / yanlış revizyon → 409");
    ok(call("POST", "engine/plan", {}, { profileId: "x", revision: 1, selections: [] }).status === 404, "bilinmeyen profil → 404");
    const ws = call("POST", "workspace", {}, { profileId: A, revision: 1, technique: "western.natal", options: natal.options });
    ok(ws.status === 200 && Array.isArray(ws.body.topics) && (ws.body.notes as unknown[]).length === 0, "çalışma alanı: konu başlıkları, not yok");
  }

  section("C Demo kapısı");
  {
    const env = { ASTROLOGY_MODULE_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
    const prof = { role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active" };
    const g = (over: J = {}, demo = true) => async () => ({ ok: true, userId: "u", tenantId: "t", email: "", db: null, is_demo_account: demo, profile: { ...prof, ...over } }) as never;
    const rq = (p = "/api/astroloji/demo/profiles") => new NextRequest(`http://localhost${p}`);
    ok((await isAstrologyDemoViewer(rq(), { env, verify: g() })) === true, "demo + uzman + Premium → geçer");
    ok((await isAstrologyDemoViewer(rq(), { env, verify: g({}, false) })) === false, "demo olmayan uzman → geçmez");
    ok((await isAstrologyDemoViewer(rq(), { env, verify: g({ role: "admin" }) })) === false, "demo bayraklı admin → geçmez");
    ok((await isAstrologyDemoViewer(rq(), { env, verify: g({ package_type: "standard" }) })) === false, "Premium değil → geçmez");
    ok((await isAstrologyDemoViewer(rq(), { env, verify: g({ approval_status: "pending" }) })) === false, "onay bekleyen → geçmez");
    ok((await isAstrologyDemoViewer(rq(), { env: {} as unknown as NodeJS.ProcessEnv, verify: g() })) === false, "kill switch kapalı → geçmez");
    ok((await isAstrologyDemoViewer(rq("/api/admin/astroloji/demo/profiles"), { env, verify: g() })) === false, "admin kabuğu yolu → geçmez");
    ok((await isAstrologyDemoViewer(rq(), { env, verify: async () => ({ ok: false, response: null }) as never })) === false, "oturum yok → geçmez");
    ok((await isAstrologyDemoViewer(rq(), { env, verify: async () => { throw new Error("db"); } })) === false, "doğrulama hatası → geçmez (fail-closed)");
  }

  section("D Statik: demo yolu veritabanı / motor / sağlayıcıya ulaşamaz; gerçek Atlas kapısı değişmedi");
  {
    const files = ["app/api/astroloji/demo/[...path]/route.ts", "lib/astrology/demo/demoService.ts", "lib/astrology/demo/demoGate.ts"];
    const FORBIDDEN = /engine\/|providers\/|astrology\/http|persistence\/|analyses\/service|profiles\/service|kb\/service|supabase|horary\/|ephemeris|efemeris/;
    for (const f of files) {
      const s = src(f);
      const imports = [...s.matchAll(/^import\s+(?:type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
      const bad = imports.filter((i) => FORBIDDEN.test(i));
      ok(bad.length === 0 && !/\bfetch\(|callRoxy|\.from\(|\.rpc\(/.test(s), `${f}: yasak içe aktarma / ağ / DB çağrısı yok${bad.length ? ` (${bad.join(", ")})` : ""}`);
    }
    ok(/^import DEMO_FIXTURE_JSON from "\.\/fixture\.generated";$/m.test(src("lib/astrology/demo/demoService.ts")) && [...src("lib/astrology/demo/demoService.ts").matchAll(/^import /gm)].length === 1, "demo servisi yalnız örnek dosyasını içe aktarır");
    const gen = src("lib/astrology/demo/fixture.generated.ts").replace(/\r\n/g, "\n").split("\n");
    ok(gen.length === 5 && gen[0].startsWith("// OTOMATİK ÜRETİLDİ") && /^const DEMO_FIXTURE_JSON: string = ".*";$/.test(gen[2]) && gen[3] === "export default DEMO_FIXTURE_JSON;", "örnek modülü yalnız veri (tek metin sabiti; kod yok)");
    const route = src("app/api/astroloji/demo/[...path]/route.ts");
    ok(route.indexOf("isAstrologyDemoViewer(req)") > 0 && route.indexOf("isAstrologyDemoViewer(req)") < route.indexOf("handleAstrologyDemoRequest("), "demo ucu: kapı istek işlenmeden ÖNCE");
    const access = src("app/api/admin/astroloji/access/route.ts");
    ok(!/demo/i.test(access), "gerçek erişim ucu DEĞİŞMEDİ (demo dalı yok → demo'ya 404)");
    const gate = src("lib/astrology/access/ownerGate.ts");
    ok(!/demoGate|isAstrologyDemoViewer|demoService/.test(gate) && /requireModuleAccess\)\(req, "astrology"\)/.test(gate), "gerçek Atlas kapısı (requireAstrologyAccess) demo dalı içermez; modül kapısı aynen");
    ok(DEMO_DENIED_MODULE_KEYS.has("astrology") && resolveModuleAccess("expert", { astrology: true }, "astrology", { isDemo: true }) === false, "astrology modül anahtarı demo'da KAPALI (gerçek uçlar + motor demo'ya 404)");
    const api = src("app/admin/astroloji/_lib/api.ts");
    ok(/if \(r\.ok \|\| r\.status !== 404 \|\| isAdminSurface\(\)\) return r;/.test(api), "istemci: demo yoklaması yalnız uzman yüzeyinde ve gerçek yoklama 404 ise");
    ok(/if \(demoView && rest\.startsWith\("\/"\) && !rest\.startsWith\("\/access"\)\) return DEMO_API \+ rest;/.test(api) && /if \(isAdminSurface\(\) \|\| !path\.startsWith\(ADMIN_API\)\) return path;/.test(api), "istemci: admin kabuğu hiç demo ucuna gitmez");
  }

  section("E İstemci sayfa kapısı (/astroloji)");
  {
    const u = (over: Partial<YasamUser> = {}): YasamUser =>
      ({ id: "u", role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active", module_permissions: {}, is_demo_account: true, ...over }) as YasamUser;
    ok(evaluateRouteModuleGuard("/astroloji", u()) === "allow" && canExpertAccessRoutePath(u(), "/astroloji"), "demo → /astroloji açılır");
    ok(evaluateRouteModuleGuard("/astroloji/efemeris", u()) === "allow", "demo → /astroloji alt sayfası açılır (hesap ucu sunucuda salt okunur)");
    ok(evaluateRouteModuleGuard("/astroloji", u({ package_type: "standard" })) === "deny_membership", "demo ama Premium değil → üyelik kapısı");
    ok(evaluateRouteModuleGuard("/astroloji", u({ is_demo_account: false })) === "deny" && !canExpertAccessRoutePath(u({ is_demo_account: false }), "/astroloji"), "demo olmayan, yetkisiz uzman → değişmedi (kapalı)");
    ok(evaluateRouteModuleGuard("/astroloji", u({ is_demo_account: false, module_permissions: { astrology: true } as YasamUser["module_permissions"] })) === "allow", "demo olmayan, yetkili uzman → değişmedi (açık)");
    ok(evaluateRouteModuleGuard("/belge-ceviri", u({ module_permissions: { belge_ceviri: true } as YasamUser["module_permissions"] })) === "deny", "demo'da diğer kapalı modüller kapalı kalır");
  }

  console.log(`\nATLAS DEMO GÖRÜNÜMÜ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
