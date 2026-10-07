/**
 * AŞAMA 2B — Roxy "Sistem Yorumu" harness'i.
 *
 * Çalıştırma:  npx tsx scripts/hd-roxy/system-reading-harness.ts   (npm run hd:system-reading:harness)
 * GERÇEK Roxy / DB çağrısı YOK (fixture + fakeDb + fetch sayacı).
 *
 * Kapsam: whitelist çıkarıcı (alan/tip/uzunluk/HTML/bilinmeyen alan), yetki kapısı (admin / uzman
 * human_design+hd_system_reading / yetkisiz / modülsüz / kimliksiz), tenant izolasyonu, eski/manuel
 * kayıtlar, Roxy çağrı sayısı = 0, DTO sızıntısı, render güvenliği, admin yetki listesi.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

import { extractSystemReading, SYSTEM_READING_LIMITS, type SystemReadingDto } from "../../lib/human-design/providers/roxy/systemReading";
import { getChartSystemReading } from "../../lib/human-design/api/systemReadingService";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "../../lib/human-design/providers/roxy/normalize";
import { resolveModuleAccess } from "../../lib/auth/moduleAccessCore";
import {
  hasModulePermission,
  hasModulePermissionForProfile,
  parseModulePermissions,
  buildPremiumModulePermissionsPayload,
  DEFAULT_MODULE_PERMISSIONS,
} from "../../lib/auth/modulePermissions";
import {
  ADMIN_MODULE_KIND,
  ADMIN_MODULE_UI_KEYS,
  DEFAULT_ADMIN_MODULE_PERMISSIONS,
  enabledAccessModules,
  parseAdminModulePermissions,
  validateApprovalModules,
  validateModuleChanges,
} from "../../lib/admin/userManagement";
import { MEMBER_FILTER_MODULE_KEYS } from "../../lib/admin/memberListQuery";
import { HdSystemReadingView } from "../../app/human-design/kayitli-haritalar/components/HdSystemReadingPanel";
import { HdChartKnowledgeTabs } from "../../app/human-design/kayitli-haritalar/components/HdChartKnowledgeTabs";
import { createFakeDb } from "./fakeDb";
import type { YasamUser } from "../../lib/auth/yasamUser";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const FIXTURE = JSON.parse(readFileSync(join(HERE, "fixtures", "roxy-bodygraph-2018-07-20.json"), "utf8")) as Record<string, unknown>;
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : "");
  }
}

const T_A = "11111111-1111-4111-8111-111111111111";
const T_B = "22222222-2222-4222-8222-222222222222";

/**
 * lang=tr yanıt BİÇİMİ: repodaki gerçek fixture lang=en'dir (localized alan yok). Production'da
 * doğrulanan *Localized biçimi burada SENTETİK TEST değerleriyle eklenir (yalnız test; ürün metni değil).
 */
function trShaped(): Record<string, unknown> {
  const r = clone(FIXTURE);
  Object.assign(r, {
    typeLocalized: "Jeneratör",
    strategyLocalized: "Yanıt vermeyi bekle",
    authorityLocalized: "Sakral",
    definitionLocalized: "Bölünmüş",
    signatureLocalized: "Tatmin",
    notSelfLocalized: "Hayal kırıklığı",
    typeDescription: "Sürdürülebilir, kucaklayan bir yaşam gücü aurası (test).",
  });
  (r.incarnationCross as Record<string, unknown>).angleLocalized = "Sağ Açı";
  const centers = r.centers as Record<string, unknown>[];
  centers[0].nameLocalized = "Tepe";
  const channels = r.channels as Record<string, unknown>[];
  channels[0].nameLocalized = "Mantık";
  channels[0].circuitLocalized = "Kolektif";
  const gates = r.gates as Record<string, unknown>[];
  gates[0].planetLocalized = "Güneş";
  gates[0].gateNameLocalized = "Uyarım";
  return r;
}

// Fetch sayacı: bu harness boyunca HİÇBİR ağ isteği yapılmamalı (özellikle roxyapi.com).
const fetchCalls: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  fetchCalls.push(String(input));
  throw new Error("harness: ağ çağrısı yasak");
}) as typeof fetch;

const ALLOWED_DTO_KEYS = new Set([
  "general", "centers", "channels", "activations",
  "key", "title", "value", "details", "label", "text",
  "id", "name", "defined", "theme", "notSelfQuestion", "biology",
  "circuit", "description", "circuitDescription",
  "side", "planet", "gate", "line", "gateName", "gateDescription", "lineMeaning", "planetDescription",
]);
function dtoKeys(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => dtoKeys(x, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { acc.add(k); dtoKeys(x, acc); }
  return acc;
}
const allStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.flatMap(allStrings) : v && typeof v === "object" ? Object.values(v).flatMap(allStrings) : typeof v === "string" ? [v] : [];

async function main() {
  console.log("HD AŞAMA 2B — Sistem Yorumu harness'i (mock)\n");

  // ── A) Çıkarıcı ──
  {
    const en = extractSystemReading(FIXTURE)!;
    ok("A1 gerçek fixture (lang=en) → DTO", !!en);
    const g = (k: string) => en.general.find((x) => x.key === k);
    ok("A2 Genel: 8 başlık (Tip/Strateji/Otorite/Profil/Tanım/Haç/İmza/Benlik-dışı)", en.general.map((x) => x.key).join(",") === "type,strategy,authority,profile,definition,cross,signature,notSelf");
    ok("A3 Tip açıklaması + aura sağlayıcıdan birebir", g("type")!.details.some((d) => d.label === "Açıklama" && d.text === FIXTURE.typeDescription) && g("type")!.details.some((d) => d.label === "Aura" && d.text === FIXTURE.aura));
    ok("A4 Strateji / Otorite / Tanım açıklamaları birebir", g("strategy")!.details[0].text === FIXTURE.strategyDescription && g("authority")!.details[0].text === FIXTURE.authorityDescription && g("definition")!.details[0].text === FIXTURE.definitionDescription);
    const pk = FIXTURE.profileKeynotes as Record<string, unknown>;
    ok("A5 Profil: yapısal numara + açıklama + 2 keynote", g("profile")!.value === FIXTURE.profile && g("profile")!.details.map((d) => d.text).join("|") === [FIXTURE.profileDescription, pk.personality, pk.design].join("|"));
    const xc = FIXTURE.incarnationCross as Record<string, unknown>;
    ok("A6 Haç: ad + açı + açıklama", g("cross")!.value === xc.name && g("cross")!.details.some((d) => d.text === xc.description) && g("cross")!.details.some((d) => d.label === "Açı"));
    ok("A7 İmza / Benlik-dışı: yalnız etiket, uzun açıklama UYDURULMAZ", g("signature")!.value === FIXTURE.signature && g("signature")!.details.length === 0 && g("notSelf")!.details.length === 0);
    ok("A8 9 merkez (tema / benlik-dışı sorusu / biyoloji + tanımlı durumu)", en.centers.length === 9 && en.centers.every((c) => c.theme && c.notSelfQuestion && c.biology && typeof c.defined === "boolean"));
    ok("A9 kanallar: yapısal kimlik + açıklama + devre açıklaması", en.channels.length === (FIXTURE.channels as unknown[]).length && en.channels.every((c) => /^\d+-\d+$/.test(c.id ?? "") && c.description && c.circuitDescription));
    ok("A10 26 aktivasyon, Design/Personality ayrımı korunur", en.activations.length === 26 && en.activations.filter((a) => a.side === "design").length === 13 && en.activations.filter((a) => a.side === "personality").length === 13);
    ok("A11 aktivasyon: kapı/çizgi/kapı açıklaması/çizgi anlamı/gezegen açıklaması", en.activations.every((a) => a.gate >= 1 && a.gate <= 64 && a.line >= 1 && a.line <= 6 && a.gateDescription && a.lineMeaning && a.planetDescription));

    const tr = extractSystemReading(trShaped())!;
    const t = (k: string) => tr.general.find((x) => x.key === k)!;
    ok("A12 Türkçe *Localized TERCİH edilir", t("type").value === "Jeneratör" && t("strategy").value === "Yanıt vermeyi bekle" && t("authority").value === "Sakral" && t("definition").value === "Bölünmüş" && t("signature").value === "Tatmin" && t("notSelf").value === "Hayal kırıklığı");
    ok("A13 Localized merkez/kanal/devre/gezegen/kapı adı", tr.centers[0].name === "Tepe" && tr.channels[0].name === "Mantık" && tr.channels[0].circuit === "Kolektif" && tr.activations[0].planet === "Güneş" && tr.activations[0].gateName === "Uyarım");
    ok("A14 Localized yoksa ham enum'a güvenli geri dönüş", tr.centers[1].name === (FIXTURE.centers as Record<string, unknown>[])[1].name && tr.activations[1].planet === (FIXTURE.gates as Record<string, unknown>[])[1].planet);
    ok("A15 haç açısı localized", t("cross").details.some((d) => d.label === "Açı" && d.text === "Sağ Açı"));

    // Dayanıklılık
    ok("A16 null / dizi / sayı / string → null", [null, undefined, [], 5, "x", true].every((v) => extractSystemReading(v) === null));
    ok("A17 boş nesne → null (sistem yorumu yok)", extractSystemReading({}) === null);
    const wrong = clone(FIXTURE) as Record<string, unknown>;
    Object.assign(wrong, { typeDescription: 42, strategyDescription: { x: 1 }, authorityDescription: ["a"], centers: "bozuk", channels: { a: 1 }, gates: [null, 7, "x", { side: "mars", gate: 1, line: 1 }, { side: "design", gate: 99, line: 1 }, { side: "design", gate: 5, line: 9 }] });
    const w = extractSystemReading(wrong);
    ok("A18 yanlış tip alanlar atılır, kalan alanlar korunur (fail-safe)", !!w && !w.general.find((x) => x.key === "type")!.details.some((d) => d.label === "Açıklama") && w.centers.length === 0 && w.channels.length === 0 && w.activations.length === 0);
    const big = clone(FIXTURE) as Record<string, unknown>;
    big.typeDescription = "a".repeat(20000);
    const bd = extractSystemReading(big)!;
    const bt = bd.general.find((x) => x.key === "type")!.details[0].text;
    ok("A19 aşırı uzun metin kırpılır (≤ limit)", bt.length === SYSTEM_READING_LIMITS.text && bt.endsWith("…"));
    const many = clone(FIXTURE) as Record<string, unknown>;
    many.gates = Array.from({ length: 500 }, () => (FIXTURE.gates as unknown[])[0]);
    many.centers = Array.from({ length: 100 }, () => (FIXTURE.centers as unknown[])[0]);
    const md = extractSystemReading(many)!;
    ok("A20 dizi uzunluğu sınırlanır", md.activations.length === SYSTEM_READING_LIMITS.activations && md.centers.length === SYSTEM_READING_LIMITS.centers);
    const html = clone(FIXTURE) as Record<string, unknown>;
    html.typeDescription = '<script>alert(1)</script><img src=x onerror="x()">Metin\u0000‮';
    const hd = extractSystemReading(html)!;
    const ht = hd.general.find((x) => x.key === "type")!.details[0].text;
    ok("A21 kontrol / yön karakterleri temizlenir; metin DÜZ METİN kalır", !ht.includes("\u0000") && !ht.includes("‮") && ht.startsWith("<script>"));
    const markup = renderToStaticMarkup(createElement(HdSystemReadingView, { data: hd }));
    ok("A22 render: HTML YORUMLANMAZ (escape edilir)", !markup.includes("<script>") && !markup.includes("<img") && markup.includes("&lt;script&gt;"));
    const extra = clone(FIXTURE) as Record<string, unknown>;
    Object.assign(extra, { secretField: "S3CR3T", providerMeta: { key: "K" }, designInstantUtc: "2018-04-20T00:33:14.578Z" });
    ((extra.centers as Record<string, unknown>[])[0]).internal = "X1";
    ((extra.gates as Record<string, unknown>[])[0]).ichingHexagram = { number: 1, english: "ICHING_MARKER_Q9" };
    const ed = extractSystemReading(extra)!;
    const keys = dtoKeys(ed);
    ok("A23 bilinmeyen/ek sağlayıcı alanları DTO'ya SIZMAZ (anahtar whitelist)", [...keys].every((k) => ALLOWED_DTO_KEYS.has(k)), [...keys].filter((k) => !ALLOWED_DTO_KEYS.has(k)));
    const strs = allStrings(ed).join("\n");
    ok("A24 ek alan değerleri / designInstantUtc / I-Ching DTO'da YOK", !strs.includes("S3CR3T") && !strs.includes("X1") && !strs.includes("2018-04-20T00:33") && !strs.includes("ICHING_MARKER_Q9"));
    const emptyArr = clone(FIXTURE) as Record<string, unknown>;
    Object.assign(emptyArr, { centers: [], channels: [], gates: [] });
    const ea = extractSystemReading(emptyArr)!;
    ok("A25 boş merkez/kanal/kapı → bölüm boş, genel korunur", ea.centers.length === 0 && ea.channels.length === 0 && ea.activations.length === 0 && ea.general.length === 8);
    const r = renderToStaticMarkup(createElement(HdSystemReadingView, { data: ea }));
    ok("A26 boş bölümler render edilmez", !r.includes("Merkezler") && !r.includes("Kanallar") && !r.includes("Aktivasyonlar"));
  }

  // ── B) Yetki kapısı ──
  {
    const p = (role: string, perms: Record<string, boolean>, extra: Record<string, unknown> = {}) => ({ role, module_permissions: perms, ...extra });
    const admin = p("admin", {});
    const full = p("user", { human_design: true, hd_system_reading: true });
    const hdOnly = p("user", { human_design: true });
    const srOnly = p("user", { hd_system_reading: true });
    const none = p("user", {});
    const gate = (prof: Record<string, unknown>) =>
      resolveModuleAccess(prof.role, prof.module_permissions, "human_design") && hasModulePermissionForProfile(prof, "hd_system_reading");
    ok("B1 admin → PASS", gate(admin));
    ok("B2 human_design + hd_system_reading → PASS", gate(full));
    ok("B3 human_design açık, hd_system_reading kapalı → RED (403)", !gate(hdOnly));
    ok("B4 hd_system_reading açık ama human_design kapalı → RED (403)", !gate(srOnly));
    ok("B5 hiçbir izin → RED", !gate(none));
    ok("B6 hd_system_reading=\"true\" (string) kabul EDİLMEZ", !gate(p("user", { human_design: true, hd_system_reading: "true" as unknown as boolean })));
    const route = src("app/api/hd/charts/system-reading/route.ts");
    const iGuard = route.indexOf('requireModuleAccess(req, "human_design")');
    const iPerm = route.indexOf('hasModulePermissionForProfile(guard.profile, "hd_system_reading")');
    const iDb = route.indexOf("getChartSystemReading(");
    ok("B7 route sırası: oturum+modül → alt-yetki (403) → DB", iGuard > 0 && iPerm > iGuard && iDb > iPerm && route.includes("status: 403"));
    // Kimliksiz gerçek route çağrısı (DB'ye gitmeden 401)
    const { GET } = await import("../../app/api/hd/charts/system-reading/route");
    const res = await GET(new NextRequest("http://localhost/api/hd/charts/system-reading?id=x"));
    ok("B8 kimliksiz istek → 401", res.status === 401);
    // İstemci görünürlüğü (sekme)
    const u = (role: string, perms: Record<string, boolean>) =>
      ({ id: "u", role, module_permissions: parseModulePermissions(perms) }) as unknown as YasamUser;
    const vis = (x: YasamUser) => hasModulePermission(x, "human_design") && hasModulePermission(x, "hd_system_reading");
    ok("B9 sekme görünürlüğü: yalnız iki izin birlikte (admin her zaman)", vis(u("admin", {})) && vis(u("user", { human_design: true, hd_system_reading: true })) && !vis(u("user", { human_design: true })) && !vis(u("user", { hd_system_reading: true })));
    const tabs = src("app/human-design/kayitli-haritalar/components/HdChartKnowledgeTabs.tsx");
    ok("B10 yetkisiz: sekme çubuğu HİÇ çizilmez (children aynen)", tabs.includes("if (!allowed) return <>{children}</>;"));
    const expert = createElement("div", { "data-expert": "1" }, "UZMAN-ICERIK");
    const off = renderToStaticMarkup(createElement(HdChartKnowledgeTabs, { chartId: "c1", allowed: false }, expert));
    const on = renderToStaticMarkup(createElement(HdChartKnowledgeTabs, { chartId: "c1", allowed: true }, expert));
    ok("B11 render: yetkisiz → yalnız uzman içeriği, 'Sistem Yorumu' kontrolü YOK", off === '<div data-expert="1">UZMAN-ICERIK</div>' && !off.includes("Sistem Yorumu"));
    ok("B12 render: yetkili → [Uzman Bilgilerim][Sistem Yorumu]; varsayılan uzman sekmesi; sistem paneli ilk tıklamaya kadar YÜKLENMEZ", on.includes('role="tablist"') && on.indexOf("Uzman Bilgilerim") < on.indexOf("Sistem Yorumu") && on.includes("UZMAN-ICERIK") && !on.includes("data-hd-system-reading-panel"));
  }

  // ── C) Servis: tenant izolasyonu + eski kayıtlar + 0 Roxy çağrısı ──
  {
    const f = createFakeDb({
      human_design_charts: [
        { id: "rx-1", tenant_id: T_A, source: "computed", provider: "roxyapi", provider_raw: clone(FIXTURE), computed_result: {} },
        { id: "rx-noraw", tenant_id: T_A, source: "computed", provider: "roxyapi", provider_raw: null },
        { id: "eng-1", tenant_id: T_A, source: "computed", provider: null, provider_raw: null },
        { id: "man-1", tenant_id: T_A, source: "manual", provider: null, provider_raw: null },
        { id: "man-legacy", tenant_id: T_A, source: null, provider: null },
        { id: "rx-bad", tenant_id: T_A, source: "computed", provider: "roxyapi", provider_raw: { foo: 1 } },
        { id: "rx-b", tenant_id: T_B, source: "computed", provider: "roxyapi", provider_raw: clone(FIXTURE) },
      ],
    });
    const before = fetchCalls.length;
    const r1 = await getChartSystemReading(f.db, T_A, "rx-1");
    ok("C1 Roxy kaydı → available:true + DTO", r1.status === 200 && r1.body.ok && "available" in r1.body && r1.body.available === true);
    for (let i = 0; i < 5; i++) await getChartSystemReading(f.db, T_A, "rx-1");
    ok("C2 Sistem Yorumu 6× açıldı → ağ/Roxy çağrısı = 0", fetchCalls.length === before && fetchCalls.length === 0, fetchCalls);
    const body = JSON.stringify(r1.body);
    ok("C3 yanıtta provider_raw / ham anahtar / koordinat YOK", !body.includes("provider_raw") && !body.includes("designInstantUtc") && !body.includes("ichingHexagram") && !body.includes("X-API-Key") && !body.includes("latitude"));
    const keys = dtoKeys((r1.body as { data: SystemReadingDto }).data);
    ok("C4 DTO anahtarları whitelist içinde", [...keys].every((k) => ALLOWED_DTO_KEYS.has(k)));
    const un = async (id: string) => {
      const r = await getChartSystemReading(f.db, T_A, id);
      return r.status === 200 && r.body.ok === true && "available" in r.body && r.body.available === false && !("data" in r.body);
    };
    ok("C5 Roxy kaydı ama provider_raw YOK → available:false", await un("rx-noraw"));
    ok("C6 dahili motor kaydı → available:false", await un("eng-1"));
    ok("C7 manuel kayıt → available:false", await un("man-1"));
    ok("C8 eski manuel (source null) → available:false", await un("man-legacy"));
    ok("C9 bozuk provider_raw → available:false", await un("rx-bad"));
    ok("C10 eski kayıtlarda da sağlayıcı geri dönüş çağrısı YOK", fetchCalls.length === 0);
    const cross = await getChartSystemReading(f.db, T_A, "rx-b");
    const missing = await getChartSystemReading(f.db, T_A, "does-not-exist");
    ok("C11 başka tenant'ın kaydı → 404 (bulunamadı ile AYNI yanıt; varlık sızmaz)", cross.status === 404 && JSON.stringify(cross.body) === JSON.stringify(missing.body));
    const own = await getChartSystemReading(f.db, T_B, "rx-b");
    ok("C12 kendi tenant'ında erişim var", own.status === 200 && "available" in own.body && own.body.available === true);
    const bad = await getChartSystemReading(f.db, T_A, "../../etc");
    const nul = await getChartSystemReading(f.db, T_A, null);
    ok("C13 geçersiz / eksik id → 400", bad.status === 400 && nul.status === 400);
    const charts = f.tables.human_design_charts;
    ok("C14 okuma DB'ye YAZMAZ (satırlar değişmedi)", charts.length === 7 && JSON.stringify(charts.find((x) => x.id === "rx-1")!.provider_raw) === JSON.stringify(FIXTURE));
    let threw = false;
    try { await getChartSystemReading(f.db, "", "rx-1"); } catch { threw = true; }
    ok("C15 boş tenant → fail-closed (fırlatır)", threw);
  }

  // ── D) Statik: Roxy çağrısı / ham yanıt yolu yok; Bilgi Bankası ile karışma yok ──
  {
    const files = [
      "lib/human-design/providers/roxy/systemReading.ts",
      "lib/human-design/api/systemReadingService.ts",
      "app/api/hd/charts/system-reading/route.ts",
      "app/human-design/kayitli-haritalar/components/HdSystemReadingPanel.tsx",
      "app/human-design/kayitli-haritalar/components/HdChartKnowledgeTabs.tsx",
    ].map(src).join("\n");
    ok("D1 Sistem Yorumu yolunda Roxy istemcisi / hesap ucu YOK", !/callRoxyBodygraph|searchRoxyLocations|computeRoxyChart|providers\/roxy\/client|providers\/roxy\/location|\/api\/hd\/charts\/roxy|roxyapi\.com|ROXY_API_KEY/.test(files));
    ok("D2 HTML enjeksiyonu yolu YOK (dangerouslySetInnerHTML kullanımı yok)", !/dangerouslySetInnerHTML\s*[=:]/.test(files));
    ok("D3 Bilgi Bankası tablolarına / uçlarına dokunulmaz", !/hd_knowledge|human_design_knowledge|\/api\/hd\/knowledge|bilgi-bankasi|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(files));
    const svc = src("lib/human-design/api/systemReadingService.ts");
    ok("D4 servis yalnız gerekli kolonları seçer ve ham yanıtı döndürmez", svc.includes('select("id, source, provider, provider_raw")') && !/body: \{[^}]*provider_raw/.test(svc));
    const modal = src("app/human-design/kayitli-haritalar/components/HdComputedChartModal.tsx");
    ok("D5 modal: uzman bölümleri korunur (Bilgi Bankası + Kişinin HD Bilgileri)", modal.includes("<HdExpertKnowledgePanel") && modal.includes("<HdPersonalKnowledgePanel") && modal.includes("<HdChartKnowledgeTabs"));
    const reporting = ["lib/human-design/reporting/reportSnapshotService.ts", "lib/human-design/reporting/wordReport.ts", "app/api/hd/reports/professional/route.ts"].map(src).join(" ");
    ok("D6 Word/PDF yolu Sistem Yorumu kullanmaz", !/systemReading|system-reading/.test(reporting));
    ok("D7 hesap/BodyGraph dosyaları Sistem Yorumu'na bağlanmadı", !/systemReading/.test(src("lib/human-design/api/roxyChartService.ts") + src("lib/human-design/providers/roxy/normalize.ts") + src("lib/human-design/providers/roxy/render.ts")));
  }

  // ── E) Admin yetki listesi ──
  {
    ok("E1 hd_system_reading admin listesinde, human_design'dan hemen sonra", ADMIN_MODULE_UI_KEYS.indexOf("hd_system_reading") === ADMIN_MODULE_UI_KEYS.indexOf("human_design") + 1);
    ok("E2 tür = capability (modül değil)", ADMIN_MODULE_KIND.hd_system_reading === "capability");
    ok("E3 varsayılan KAPALI (admin + kullanıcı + kayıt)", DEFAULT_ADMIN_MODULE_PERMISSIONS.hd_system_reading === false && DEFAULT_MODULE_PERMISSIONS.hd_system_reading === false);
    ok("E4 Premium payload'ında YOK (otomatik açılmaz)", !("hd_system_reading" in buildPremiumModulePermissionsPayload()));
    ok("E5 admin toggle değişikliği geçerli", validateModuleChanges({ hd_system_reading: true }).ok && validateModuleChanges({ hd_system_reading: "1" }).ok === false);
    const onlyCap = validateApprovalModules(["hd_system_reading"]);
    ok("E6 onay: yalnız alt-yetki seçmek 'en az bir modül' sayılmaz", onlyCap.ok === false);
    const appr = validateApprovalModules(["human_design"]);
    ok("E7 onay: seçilmezse hd_system_reading=false", appr.ok && appr.fullMap.hd_system_reading === false);
    const perms = parseAdminModulePermissions({ human_design: true, hd_system_reading: true });
    ok("E8 açık modül sayısına alt-yetki girmez", perms.hd_system_reading === true && !enabledAccessModules(perms).includes("hd_system_reading"));
    ok("E9 üye listesi modül filtresinde alt-yetki yok", !MEMBER_FILTER_MODULE_KEYS.includes("hd_system_reading"));
    const sql = src("supabase/migrations/20270129235900_admin_member_phase1_hardening.sql");
    ok("E10 mevcut SQL doğrulayıcı anahtarı kabul eder (biçim kontrolü) → migration GEREKMEZ", /e\.key !~ '\^\[a-z\]\[a-z0-9_\]\{0,39\}\$'/.test(sql) && /^[a-z][a-z0-9_]{0,39}$/.test("hd_system_reading"));
  }

  // ── F) Hesap regresyonu: fixture normalizasyonu aynı ──
  {
    const v = validateRoxyBodygraph(FIXTURE);
    const n = v.ok ? normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" }) : null;
    ok("F1 normalizasyon değişmedi (fixture geçerli, 26 aktivasyon)", !!n && n.ok && n.chart.activations.length === 26);
    const vt = validateRoxyBodygraph(trShaped());
    ok("F2 *Localized alanlı yanıt şema doğrulamasını BOZMAZ", vt.ok);
  }

  globalThis.fetch = realFetch;
  console.log(`\n${passed} PASS / ${failed} FAIL`);
  if (failed) {
    for (const x of fails) console.log(" -", x);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
