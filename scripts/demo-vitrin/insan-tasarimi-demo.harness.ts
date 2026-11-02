/**
 * DEMO HESABI — HUMAN DESIGN SALT OKUNUR ÖRNEK GÖRÜNÜMÜ (D3, owner 2026-11-02). Ağ / DB / ücretli çağrı YOK.
 *
 * CI regresyon listesine girer (korunan HD test klasörü DIŞINDA). Doğrular:
 *   A) Örnek veri: 5 sentetik kişi (Örnek Kişi A–E, her tipten biri), 5 Roxy kaydı, Sistem Yorumu + Dört Ok her kişide,
 *      Connection + Penta; lisanslı sağlayıcı açıklama metni YOK (yalnız demo notu); e-posta / gerçek tenant / ham yanıt YOK.
 *   B) Demo servisi: okuma uçları örneği döndürür; arama + sayfalama gerçek sözleşmeyle; yazma / rapor / hesap → 403;
 *      örnekte olmayan kimlik / parametre → 404 (uydurma yanıt yok).
 *   C) Demo kapısı (isHdDemoViewer): yalnız demo + uzman + gerçek HD modül kapısı + /api/hd/demo/ yolu; diğer her şey red.
 *   D) Statik: demo ucu / servis veritabanı, HD motoru, sağlayıcı istemcisi, ağ İÇE AKTARMAZ; kapı istekten önce; owner kararı
 *      (02.11): demo hesabında yeni hesap YOK — yerel HD hesabı + genel/kişisel transit 403, ekranlar hesap düğmesi göstermez; gerçek HD
 *      uçlarının demo yazma reddi yerinde; Eğitim Merkezi dosyaları köprüye bağlı değil.
 *   E) İstemci yönlendirme kararı (hdDemoRewrite): yalnız demo + HD uzman sayfası + izinli okuma; yazma, hesap, Eğitim,
 *      transit ve diğer modüller AYNEN gerçek uca gider; normal oturum hiç etkilenmez.
 *   F) Modül erişimi: human_design demo'da açık kalır; D1 (Dijital İçerik) ve D8 (Atlas) kapalılığı değişmedi.
 * Örneğin kayıtlı yanıtlardan birebir yeniden üretilebildiği ayrıca: scripts/hd-demo/build-demo-fixture.ts --check (korunan alan).
 * Çalıştır: npx tsx --tsconfig scripts/tsconfig.demo-vitrin-tests.json scripts/demo-vitrin/insan-tasarimi-demo.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import HD_DEMO_FIXTURE_JSON from "../../lib/human-design/demo/fixture.generated";
import { handleHdDemoRequest, hdDemoSampleIds } from "../../lib/human-design/demo/demoService";
import { isHdDemoViewer } from "../../lib/human-design/demo/demoGate";
import { hdDemoRewrite, isHdDemoPage } from "../../lib/human-design/demo/demoFetchBridge";
import { DEMO_DENIED_MODULE_KEYS, resolveModuleAccess } from "../../lib/auth/moduleAccessCore";

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
const call = (method: string, p: string, query: Record<string, string> = {}, body: unknown = null) => handleHdDemoRequest(method, p, new URLSearchParams(query), body);
const PLACEHOLDER = "Demo görünümünde lisanslı sağlayıcı açıklaması gösterilmez.";

const FX = JSON.parse(HD_DEMO_FIXTURE_JSON) as {
  people: { key: string; name: string; clientId: string; chartId: string }[];
  relationIds: string[];
  analysisRows: J[];
  responses: Record<string, { status: number; body: J }>;
};
const IDS = hdDemoSampleIds();

function strings(v: unknown, acc: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => strings(x, acc));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, acc));
  else if (typeof v === "string") acc.push(v);
  return acc;
}

async function main() {
  section("A Örnek veri değişmezleri");
  ok(FX.people.length === 5 && FX.people.every((p, i) => p.name === `Örnek Kişi ${"ABCDE"[i]}`), "5 sentetik kişi: Örnek Kişi A–E");
  const types = FX.analysisRows.map((r) => r.typeCode).sort();
  ok(JSON.stringify(types) === JSON.stringify(["generator", "manifesting_generator", "manifestor", "projector", "reflector"]), "her HD tipinden bir örnek");
  ok(FX.analysisRows.every((r) => r.analysisCount === 1 && r.linkedToJourney === false && r.journeyClientId === null), "Danışan Yolculuğu bağı yok (gerçek danışan kaydına bağlanmaz)");
  for (const p of FX.people) {
    const d = FX.responses[`GET charts?id=${p.chartId}`]?.body.data as J | undefined;
    ok(!!d && d.provider === "roxyapi" && d.source === "computed" && !!d.roxy_render && !("provider_raw" in d) && !("input_hash" in d), `${p.key}: kayıtlı Roxy haritası (render yükü var; ham yanıt / girdi özeti yok)`);
    const act = ((d?.computed_result as J | undefined)?.activations as unknown[] | undefined) ?? [];
    ok(act.length === 26, `${p.key}: 26 aktivasyon`);
    const sr = FX.responses[`GET charts/system-reading?id=${p.chartId}`]?.body as J | undefined;
    ok(sr?.ok === true && sr.available === true, `${p.key}: Sistem Yorumu yapısı hazır`);
    const vr = FX.responses[`POST charts/variables/saved?chart_id=${p.chartId}`]?.body as J | undefined;
    const arrows = ((vr?.data as J | undefined)?.arrows as J[] | undefined) ?? [];
    ok(vr?.found === true && arrows.length === 4, `${p.key}: kayıtlı Dört Ok (4 ok)`);
    ok(arrows.every((a) => (a.text as J).description === PLACEHOLDER && (a.text as J).colorMeaning === PLACEHOLDER), `${p.key}: Dört Ok açıklamaları demo notu`);
  }
  const conn = FX.responses[`GET relations/${FX.relationIds[0]}`]?.body.analysis as J | undefined;
  const penta = FX.responses[`GET relations/${FX.relationIds[1]}`]?.body.analysis as J | undefined;
  ok(conn?.kind === "connection" && (conn.participants as J[]).length === 2, "Connection örneği (A + B)");
  ok(penta?.kind === "penta" && (penta.participants as J[]).length === 4, "Penta örneği (A–D)");
  ok([conn, penta].every((a) => (a?.participants as J[]).every((p) => p.status === "current" && Array.isArray(p.gates))), "katılımcı kayıtları güncel (kaynak harita eşleşiyor)");
  // Lisans: yerel içerik (ilişki açıklamaları) DIŞINDA 40+ karakterlik her metin ya demo notu ya da sistemin KENDİ metnidir
  // (hesap uyarısı / doğrulama gerekçesi "Yaşam Sistemi" anar; aktivasyon listesi; "Türkçe (English)" terim etiketi).
  // Asıl sızıntı denetimi build anında ham sağlayıcı metinleriyle birebir yapılır (build-demo-fixture.ts).
  const SYSTEM_OWN = (s: string) =>
    s.includes("Yaşam Sistemi") || /^(Personality|Design) [^·]+( · (Personality|Design) [^·]+)*$/.test(s) || (/^[^.]+ \([A-Za-z][A-Za-z ,'-]*\)$/.test(s) && s.length < 90);
  const longOutsideLocal = Object.entries(FX.responses)
    .filter(([k]) => !k.endsWith("/knowledge"))
    .flatMap(([, r]) => strings(r.body))
    .filter((s) => s.length >= 40 && s !== PLACEHOLDER && !SYSTEM_OWN(s));
  ok(longOutsideLocal.length === 0, `sağlayıcı açıklama metni yok (40+ karakter, demo notu dışı: ${longOutsideLocal.length})`);
  const all = strings(FX);
  ok(!all.some((s) => /@/.test(s)), "e-posta / iletişim yok");
  ok(all.filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s)).every((s) => s.startsWith("d3")), "tüm kimlikler sabit demo kimliği (d3…; gerçek tenant / kullanıcı yok)");

  section("B Demo servisi");
  const list = call("GET", "analyses");
  ok(list.status === 200 && (list.body.rows as J[]).length === 5 && list.body.total === 5, "analiz listesi 5 satır");
  ok((call("GET", "analyses", { q: "kişi c" }).body.rows as J[]).map((r) => r.name).join() === "Örnek Kişi C", "Türkçe arama (gerçek sözleşme)");
  ok((call("GET", "analyses", { q: "yok-boyle" }).body.total as number) === 0, "eşleşmeyen arama boş");
  const page = call("GET", "analyses", { limit: "2", offset: "2" });
  ok((page.body.rows as J[]).length === 2 && (page.body.rows as J[])[0].name === "Örnek Kişi C", "sayfalama");
  ok(call("GET", "charts").status === 200 && (call("GET", "charts").body.data as J[]).length === 5, "kayıtlı harita listesi");
  ok(call("GET", "charts", { id: IDS.chartIds[0].toUpperCase() }).status === 200, "harita detayı (kimlik büyük/küçük harf duyarsız)");
  ok(call("GET", "charts", { client_id: IDS.clientIds[1] }).status === 200, "danışana göre harita listesi");
  ok(call("GET", "charts", { scope: "manual" }).status === 200, "manuel harita listesi (boş)");
  ok(call("GET", "clients", { id: IDS.clientIds[2] }).status === 200, "HD danışan detayı");
  ok(call("GET", "charts/system-reading", { id: IDS.chartIds[3] }).status === 200, "Sistem Yorumu");
  ok(call("POST", "charts/variables/saved", {}, { chart_id: IDS.chartIds[4] }).status === 200, "kayıtlı Dört Ok");
  ok(call("GET", "relations").status === 200 && call("GET", "relations/candidates").status === 200, "ilişki listesi + aday listesi");
  for (const id of IDS.relationIds) {
    ok(call("GET", `relations/${id}`).status === 200 && call("GET", `relations/${id}/knowledge`).status === 200 && call("GET", `relations/${id}/reports`).status === 200, `ilişki ${id.slice(-1)} detay / bilgi / rapor listesi`);
  }
  ok((call("GET", "journey-clients", { search: "ayşe" }).body.rows as J[]).length === 0, "Danışan Yolculuğu araması boş (gerçek danışan okunmaz)");
  const unknownChart = "d3a00000-0000-4000-8000-000000000099";
  ok(call("GET", "charts", { id: unknownChart }).status === 404, "örnekte olmayan harita → 404");
  ok(call("GET", "charts/system-reading", { id: unknownChart }).status === 404, "örnekte olmayan Sistem Yorumu → 404");
  ok(call("POST", "charts/variables/saved", {}, { chart_id: unknownChart }).status === 404, "örnekte olmayan Dört Ok → 404");
  ok(call("GET", "charts", { id: IDS.chartIds[0], extra: "1" }).status === 404, "bilinmeyen parametre → 404");
  ok(call("GET", "transit").status === 404 && call("GET", "knowledge").status === 404, "örnekte olmayan uç → 404");
  ok(call("GET", "clients", { id: IDS.clientIds[0], delete_preview: "1" }).status === 403, "silme önizlemesi → 403");
  for (const [m, p] of [["POST", "charts"], ["POST", "charts/roxy"], ["POST", "charts/variables"], ["POST", "compute"], ["PATCH", "clients"], ["DELETE", "charts"], ["POST", "relations"], ["DELETE", `relations/${IDS.relationIds[0]}`], ["POST", "reports/professional"], ["POST", `relations/${IDS.relationIds[0]}/reports`], ["PUT", "charts"]] as const) {
    const r = call(m, p, {}, {});
    ok(r.status === 403 && r.body.code === "DEMO_READONLY", `${m} ${p} → 403 DEMO_READONLY`);
  }
  const a1 = call("GET", "charts", { id: IDS.chartIds[0] });
  (a1.body.data as J).client_name = "değişti";
  ok((call("GET", "charts", { id: IDS.chartIds[0] }).body.data as J).client_name === "Örnek Kişi A", "yanıt kopyası: paylaşılan örnek değişmez");

  section("C Demo kapısı");
  const req = (p = "/api/hd/demo/charts") => new NextRequest(`http://localhost${p}`);
  const g = (o: J) => async () => o as never;
  const demoExpert = { ok: true, is_demo_account: true, profile: { role: "expert" } };
  ok((await isHdDemoViewer(req(), { guard: g(demoExpert) })) === true, "demo + uzman + HD kapısı → geçer");
  ok((await isHdDemoViewer(req(), { guard: g({ ...demoExpert, is_demo_account: false }) })) === false, "demo olmayan uzman → red");
  ok((await isHdDemoViewer(req(), { guard: g({ ...demoExpert, profile: { role: "admin" } }) })) === false, "demo admin → red");
  ok((await isHdDemoViewer(req(), { guard: g({ ok: false }) })) === false, "HD kapısı reddi (oturum / üyelik / modül) → red");
  ok((await isHdDemoViewer(req(), { guard: async () => { throw new Error("x"); } })) === false, "kapı hatası → red");
  ok((await isHdDemoViewer(req("/api/hd/charts"), { guard: g(demoExpert) })) === false, "demo yolu dışı → red");

  section("D Statik");
  const svc = src("lib/human-design/demo/demoService.ts");
  const route = src("app/api/hd/demo/[...path]/route.ts");
  const bridge = src("lib/human-design/demo/demoFetchBridge.ts");
  const forbidden = /supabase|chartPersistence|roxyChartService|providers\/roxy|engine\/|relationService|variablesService|systemReadingService|userGuard|fetch\(/;
  const imports = (s: string) => s.split("\n").filter((l) => /^\s*import\s/.test(l)).join("\n");
  ok(!forbidden.test(imports(svc)) && !/\bfetch\(/.test(svc), "demo servisi DB / motor / sağlayıcı / ağ içe aktarmaz");
  ok(!/supabase|providers\/roxy|engine\/|Persistence|relationService|variablesService|systemReadingService|userGuard/.test(imports(route)), "demo ucu DB / motor / sağlayıcı içe aktarmaz (yalnız kapı + servis)");
  ok(route.indexOf("isHdDemoViewer(req)") > -1 && route.indexOf("isHdDemoViewer(req)") < route.indexOf("handleHdDemoRequest(req.method"), "kapı istekten önce");
  ok(!/supabase|engine\/|providers\//.test(imports(bridge)), "istemci köprüsü saf (DB / motor / sağlayıcı yok)");
  ok(/is_demo_account[\s\S]{0,200}DEMO_READONLY/.test(src("app/api/hd/charts/route.ts")), "gerçek /api/hd/charts demo yazma reddi yerinde");
  ok(/DEMO_READONLY/.test(src("app/api/hd/location/search/route.ts")) && /DEMO_READONLY/.test(src("app/api/hd/reports/professional/route.ts")), "gerçek konum araması + profesyonel rapor demo reddi yerinde");
  ok(/if \(ctx\.isDemo\) return fail\(403, "DEMO_READONLY"/.test(src("lib/human-design/relations/relationService.ts")), "ilişki oluşturma demo reddi yerinde");
  ok(/if \(ctx\.isDemo\) return fail\(403, "DEMO_READONLY"/.test(src("lib/human-design/variables/variablesService.ts")), "Dört Ok hesap demo reddi yerinde");
  // Owner kararı 2026-11-02: demo hesabında HİÇBİR yeni hesap yok (yerel motor ve önbellekten transit dahil).
  const demoFirst = (rel: string) => {
    const s = src(rel);
    const g = s.indexOf("if (!guard.ok) return guard.response;");
    const d = s.indexOf("if (guard.is_demo_account)", g);
    const work = Math.min(...["quotaCheck(", "hitDbRateLimit(", "handleCompute(", "runCompute(", "resolveTransitMoment("].map((k) => s.indexOf(k, g)).filter((i) => i > -1));
    return g > -1 && d > g && d < work && /DEMO_READONLY/.test(s.slice(d, d + 400));
  };
  ok(demoFirst("app/api/hd/compute/route.ts"), "yerel HD hesabı (/api/hd/compute) demo'da 403 — hesap ve kota öncesi");
  ok(demoFirst("app/api/hd/transit/route.ts"), "genel transit (/api/hd/transit) demo'da 403 — hesap öncesi");
  ok(/is_demo_account[\s\S]{0,40}\)/.test(src("app/api/hd/transit/personal/route.ts")) && /isDemo: guard\.is_demo_account/.test(src("app/api/hd/transit/personal/route.ts")), "kişisel transit demo reddi (servis) yerinde");
  const transitUi = src("app/human-design/transit/components/HdTransitContent.tsx");
  ok(/isDemo \? \(\s*<DemoModuleBanner/.test(transitUi), "transit ekranı demo'da görünüm kurmaz (bilgi bandı)");
  const relUi = src("app/human-design/iliski-grup/components/HdRelationsContent.tsx");
  ok(/isDemo \? \(\s*<DemoModuleBanner[\s\S]{0,400}data-hd-rel-builder/.test(relUi), "İlişki & Grup: demo'da yeni analiz bölümü yok (bilgi bandı)");
  const layout = src("app/human-design/layout.tsx");
  ok(/HdDemoFetchBridge/.test(layout) && !/<(div|section|main)/.test(layout), "HD layout yalnız köprüyü yükler (düzen değişmez)");

  section("E İstemci yönlendirme kararı");
  const P = "/human-design/kayitli-haritalar";
  ok(hdDemoRewrite("GET", "/api/hd/charts", P, true) === "/api/hd/demo/charts", "demo: harita listesi → demo ucu");
  ok(hdDemoRewrite("GET", "/api/hd/analyses", "/human-design/danisanlar", true) === "/api/hd/demo/analyses", "demo: analiz listesi → demo ucu");
  ok(hdDemoRewrite("GET", `/api/hd/relations/${IDS.relationIds[0]}/knowledge`, "/human-design/iliski-grup", true) === `/api/hd/demo/relations/${IDS.relationIds[0]}/knowledge`, "demo: ilişki bilgisi → demo ucu");
  ok(hdDemoRewrite("POST", "/api/hd/charts/variables/saved", P, true) === "/api/hd/demo/charts/variables/saved", "demo: kayıtlı Dört Ok okuması → demo ucu");
  ok(hdDemoRewrite("GET", "/api/hd/charts", P, false) === null, "normal oturum: hiçbir istek yönlenmez");
  for (const [m, p] of [["POST", "/api/hd/charts"], ["DELETE", "/api/hd/charts"], ["POST", "/api/hd/charts/variables"], ["POST", "/api/hd/charts/roxy"], ["POST", "/api/hd/compute"], ["POST", "/api/hd/relations"], ["GET", "/api/hd/transit"], ["GET", "/api/hd/transit/personal"], ["GET", "/api/hd/knowledge"], ["GET", "/api/hd/bilgi-bankasi"], ["GET", "/api/hd/reports"], ["GET", "/api/hd/education/access"], ["GET", "/api/clients"]] as const) {
    ok(hdDemoRewrite(m, p, P, true) === null, `demo: ${m} ${p} gerçek uca gider`);
  }
  ok(hdDemoRewrite("GET", "/api/hd/charts", "/human-design/egitim-merkezi", true) === null && !isHdDemoPage("/human-design/egitim-haritalari/x"), "Eğitim Merkezi sayfaları kapsam dışı");
  ok(hdDemoRewrite("GET", "/api/hd/charts", "/dashboard/clients/x", true) === null && hdDemoRewrite("GET", "/api/hd/charts", "/human-designer", true) === null, "HD dışı sayfa kapsam dışı");

  section("F Modül erişimi");
  ok(!DEMO_DENIED_MODULE_KEYS.has("human_design") && resolveModuleAccess("expert", { human_design: true }, "human_design", { isDemo: true }) === true, "human_design demo'da açık (değişmedi)");
  ok(["personal_archive", "digital_content", "astrology"].every((k) => DEMO_DENIED_MODULE_KEYS.has(k)), "Dijital İçerik (D1) ve gerçek Atlas (D8) demo'da kapalı");
  ok(resolveModuleAccess("expert", { hd_system_reading: false, human_design: true }, "hd_system_reading", { isDemo: true }) === false, "hd_system_reading bayrağı veride değişmedi (yalnız demo örneği gösterilir)");

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error(fails.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
