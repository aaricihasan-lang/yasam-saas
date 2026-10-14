// Vedik D1 / Varga / KP haritası — EKRAN ↔ WORD/PDF eşdeğerlik testi (YEREL; sahte DB + sahte Roxy; GERÇEK Roxy YOK).
//
// Önkoşul: `next start -p 3931` (veya dev) + dev-fake-backend (FAKE_ROXY_CERT/KEY ile yerel sahte Roxy).
// Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/vedic-charts-ui.e2e.mts [shotDir]
//
//   E1 her harita türü (D1, D9, D10, KP chart, KP horary, KP transit) hesaplanır + kaydedilir (sahte Roxy)
//   E2 kayıtlı analiz arşivden açılır → ekrandaki harita (Roxy gölge-DOM SVG'si / KP ızgarası) okunur
//   E3 aynı kaydın RAPOR haritası (sunucu figürü) ekranla öğe öğe aynı: sınıf, konum, metin, yazı boyutu
//   E4 Word + PDF gerçek rotadan indirilir: Word'deki PNG = bu kaydın figür PNG'si (bayt bayt), PDF'te 1200×1200 görsel
//   E5 yanlış harita yok: D1 / D9 / D10 / KP raporlarının görselleri birbirinden farklı, her rapor yalnız kendi figürünü taşır
//      (farklı DANIŞAN karışmaması report8'de: sahte Roxy yalnız tek golden kişiye yanıt verir)
//   E6 kayıtlı analizi yeniden indirmek aynı dosya görselini verir; 0 sağlayıcı isteği
import { chromium } from "playwright";
import JSZip from "jszip";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAstroReport, type ReportAnalysisInput } from "@/lib/astrology/report/model";
import { kundliMarkup, renderFigurePng, renderFigureSvg } from "@/lib/astrology/report/figurePng";
import { kundliLocalizedTree, parseSvg, type MiniEl, type ReportFigure } from "@/lib/astrology/report/figures";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- sahte API yanıtları (test)
type J = any;
const SHOTS = process.argv[2] ?? ".";
const LOG = process.env.FAKE_LOG ?? "";
const BASE = "http://localhost:3931/admin/astroloji";
const API = "http://localhost:3931/api/admin/astroloji";
const TOKEN = "local-owner-token-aaaaaaaaaaaa";
const HDR = { "content-type": "application/json", "x-admin-id": "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", "x-session-token": TOKEN, cookie: `yasam_admin_session=${TOKEN}` };
let pass = 0;
let fail = 0;
const ok = (n: string, c: boolean, x = "") => {
  if (c) pass++;
  else fail++;
  console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`);
};
const hits = () => (LOG ? (readFileSync(LOG, "utf8").match(/^fake roxy #\d+/gm) ?? []).length : null);
const api = async (path: string, body?: unknown) => {
  const r = await fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: HDR, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json().catch(() => null)) as J };
};
const bytes = async (path: string) => {
  const r = await fetch(`${API}${path}`, { headers: HDR });
  return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
};

const AT = { date: "2026-10-07", time: "12:00", timezone: "Europe/Istanbul" };
const SELS = [
  { key: "D1", technique: "vedic.d1", options: { ayanamsa: "lahiri" } },
  { key: "D9", technique: "vedic.varga", options: { ayanamsa: "lahiri", division: 9 } },
  { key: "D10", technique: "vedic.varga", options: { ayanamsa: "lahiri", division: 10 } },
  { key: "KP", technique: "kp.chart", options: { ayanamsa: "kp-newcomb", nodeType: "mean" } },
  { key: "KPH", technique: "kp.horary", options: { ...AT, horaryNumber: 108, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: null } },
  { key: "KPT", technique: "kp.transit", options: { ...AT, ayanamsa: "kp-newcomb", nodeType: "mean" } },
];

type TextRow = { cls: string; x: string; y: string; text: string; fs: string; tr: string };
const own = (el: MiniEl) => el.childNodes.map((c) => (c.nodeType === 3 ? c.data : "")).join("").trim();
function serverRows(root: MiniEl): TextRow[] {
  return root.querySelectorAll("text").map((t) => ({ cls: t.attrs.class ?? "", x: t.attrs.x, y: t.attrs.y, text: own(t), fs: t.style.fontSize, tr: t.style.transform }));
}
const figureOf = (a: ReportAnalysisInput): ReportFigure | null => {
  const b = buildAstroReport(a).blocks.find((x) => x.kind === "chart");
  return b && b.kind === "chart" && "figure" in b ? b.figure : null;
};
const ty = (t: string) => Number(/translateY\((-?[\d.]+)px\)/.exec(t)?.[1] ?? 0);

(async () => {
  const stamp = Date.now().toString(36);
  const mk = async (label: string, birthDate: string, birthTime: string, loc: string) =>
    (await api("/profiles", { label: `${label} ${stamp}`, birthDate, birthTime, timeKnown: true, timeAccuracy: "exact_record", locationId: loc })).json.profile.id as string;
  const pa = await mk("Vedik A", "1990-07-15", "14:30", "tr-34-istanbul");
  const runAll = async (pid: string) => {
    const sel = SELS.map(({ technique, options }) => ({ technique, options }));
    const plan = await api("/engine/plan", { profileId: pid, revision: 1, selections: sel });
    const run = await api("/engine/run", { profileId: pid, revision: 1, selections: plan.json.plan.selections.map((s: J, i: number) => ({ technique: s.technique, options: s.options ?? sel[i].options })), confirmNewRequests: plan.json.plan.newRequestCount });
    const out: Record<string, string> = {};
    for (const [i, r] of (run.json.results as J[]).entries()) {
      if (!r.ok) {
        ok(`E1 ${SELS[i].key} hesaplandı`, false, r.code);
        continue;
      }
      out[SELS[i].key] = (await api("/analyses", { profileId: pid, revision: 1, technique: r.technique, options: r.view.options, saveRequestId: crypto.randomUUID() })).json.analysisId;
    }
    return out;
  };
  const A = await runAll(pa);
  ok("E1 tüm harita türleri hesaplandı + kaydedildi", Object.keys(A).length === SELS.length, `${Object.keys(A).join(",")}`);

  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([
    { name: "__Host-yasam_sid", value: TOKEN, domain: "localhost", path: "/", secure: true },
    { name: "yasam_admin_session", value: TOKEN, domain: "localhost", path: "/" },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem("yasam_user", JSON.stringify({ id: "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a", tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", full_name: "Owner", email: "admin@yasamsistemi.com", role: "admin", active: true, module_permissions: {} }));
    localStorage.setItem("yasam_session_token", "local-owner-token-aaaaaaaaaaaa");
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const openSaved = async (pid: string, id: string) => {
    await page.goto(`${BASE}#danisan/${pid}`, { waitUntil: "load", timeout: 120000 });
    await page.waitForSelector("[data-testid=astro-client-file-analyses]", { timeout: 90000 });
    await page.waitForTimeout(1200);
    await page.locator(`[data-saved-item="${id}"]`).click();
    await page.waitForSelector("[data-testid=astro-saved-analysis]", { timeout: 60000 });
    await page.waitForTimeout(2500);
  };

  const h0 = hits();
  const pngOf: Record<string, Buffer> = {};
  for (const s of SELS) {
    const id = A[s.key];
    if (!id) continue;
    const analysis = (await api(`/analyses/${id}`)).json.analysis as ReportAnalysisInput;
    const fig = figureOf(analysis);
    ok(`E3 ${s.key}: rapor modelinde harita figürü var (${fig?.type ?? "yok"})`, !!fig);
    if (!fig) continue;
    await openSaved(pa, id);
    if (fig.type === "kundli") {
      // Tarayıcıya DİZE olarak verilir (tsx'in __name yardımcısı sayfada tanımsız).
      const tag = fig.component === "divisional" ? "roxy-divisional-chart" : "roxy-vedic-kundli";
      const screen = (await page.evaluate(`(async () => {
        const el = document.querySelector("${tag}");
        if (!el) return null;
        await el.updateComplete;
        await new Promise((r) => setTimeout(r, 400));
        const svg = el.shadowRoot && el.shadowRoot.querySelector('svg[part="chart"]');
        if (!svg) return null;
        return {
          rows: [...svg.querySelectorAll("text")].map((t) => ({ cls: t.getAttribute("class") || "", x: t.getAttribute("x") || "", y: t.getAttribute("y") || "", text: [...t.childNodes].filter((c) => c.nodeType === 3).map((c) => c.data).join("").trim(), fs: t.style.fontSize, tr: t.style.transform })),
          shapes: svg.querySelectorAll("line, rect, polygon").length,
        };
      })()`)) as { rows: TextRow[]; shapes: number } | null;
      ok(`E2 ${s.key}: ekranda Roxy haritası çizildi`, !!screen && screen.rows.length > 0);
      if (!screen) continue;
      const tree = kundliLocalizedTree(await kundliMarkup(fig), fig);
      const srv = serverRows(tree);
      const key = (r: TextRow) => `${r.cls}|${r.x}|${r.y}|${r.text}|${r.fs}`;
      const diff = srv.map((r, i) => (screen.rows[i] && key(r) === key(screen.rows[i]) ? null : `${i}: sunucu ${key(r)} ≠ ekran ${screen.rows[i] ? key(screen.rows[i]) : "yok"}`)).filter(Boolean);
      ok(`E3 ${s.key}: rapor haritası ekranla öğe öğe aynı (sınıf, x, y, metin, yazı boyutu; ${srv.length} metin)`, srv.length === screen.rows.length && diff.length === 0, diff.slice(0, 3).join(" | "));
      ok(`E3 ${s.key}: çizgi/kutu sayısı aynı`, tree.querySelectorAll("line").length + tree.querySelectorAll("rect").length + tree.querySelectorAll("polygon").length === screen.shapes, `${screen.shapes}`);
      const shift = srv.map((r, i) => Math.abs(ty(r.tr) - ty(screen.rows[i]?.tr ?? ""))).reduce((m, v) => Math.max(m, v), 0);
      ok(`E3 ${s.key}: kalabalık hücre kaydırması ekranla en çok 1 birim farklı (ekran sistem yazı tipi, rapor Geist ölçüsüyle hesaplar)`, shift <= 1, `en büyük fark ${shift}`);
    } else {
      const screen = (await page.evaluate(`(() => {
        const out = {};
        for (const c of document.querySelectorAll("[data-testid=astro-kp-chart] [data-kp-sign]")) out[c.getAttribute("data-kp-sign")] = [...c.querySelectorAll("[data-kp-item]")].map((b) => (b.textContent || "").trim());
        return out;
      })()`)) as Record<string, string[]>;
      ok(`E2 ${s.key}: ekranda KP haritası çizildi (12 burç kutusu)`, Object.keys(screen).length === 12);
      const root = parseSvg(await renderFigureSvg(fig));
      const srv: Record<string, string[]> = {};
      let cur = "";
      const walk = (n: MiniEl) => {
        for (const c of n.childNodes) {
          if (c.nodeType !== 1) continue;
          if (c.tag === "text" && c.attrs["data-kp-sign"]) {
            cur = c.attrs["data-kp-sign"];
            srv[cur] = [];
          } else if (c.tag === "rect" && c.attrs["data-kp-item"]) srv[cur].push("");
          else if (c.tag === "text" && cur && srv[cur].length && srv[cur][srv[cur].length - 1] === "") srv[cur][srv[cur].length - 1] = own(c);
          walk(c);
        }
      };
      walk(root);
      const diff = Object.keys(screen).filter((k) => JSON.stringify(screen[k]) !== JSON.stringify(srv[k] ?? []));
      ok(`E3 ${s.key}: rapor KP haritası ekranla aynı (12 burç kutusunda aynı etiketler, aynı sıra)`, diff.length === 0, diff.map((k) => `${k}: ekran ${screen[k].join(",")} / rapor ${(srv[k] ?? []).join(",")}`).join(" | "));
    }
    await page.locator("[data-testid=astro-saved-analysis]").screenshot({ path: join(SHOTS, `vedic-ui-${s.key}.png`) }).catch(() => undefined);

    // E4: gerçek rota → Word + PDF
    const exp = await renderFigurePng(fig);
    ok(`E4 ${s.key}: figür PNG'si üretildi (1200×1200)`, !("error" in exp) && exp.width === 1200 && exp.height === 1200);
    if ("error" in exp) continue;
    pngOf[s.key] = exp.png;
    const d = await bytes(`/analyses/${id}/report?format=docx`);
    const zip = await JSZip.loadAsync(d.buf);
    const media = await Promise.all(Object.keys(zip.files).filter((n) => n.startsWith("word/media/") && !zip.files[n].dir).map((n) => zip.file(n)!.async("nodebuffer")));
    ok(`E4 ${s.key}: Word 200 + tek harita görseli = bu kaydın figür PNG'si (bayt bayt)`, d.status === 200 && media.length === 1 && media[0].equals(exp.png), `${d.status} medya ${media.length}`);
    const xml = await zip.file("word/document.xml")!.async("string");
    ok(`E4 ${s.key}: Word'de harita başlığı doğru adla`, xml.includes(s.key === "D1" ? "Vedik D1 (Rashi) haritası" : s.key === "D9" ? "Vedik D9 (Navamsa) haritası" : s.key === "D10" ? "Vedik D10 (" : s.key === "KP" ? "KP haritası" : s.key === "KPH" ? "KP horary haritası" : "KP transit haritası"));
    const p = await bytes(`/analyses/${id}/report?format=pdf`);
    ok(`E4 ${s.key}: PDF 200 + 1200×1200 harita görseli`, p.status === 200 && /\/Width 1200[\s\S]{0,200}?\/Height 1200/.test(p.buf.toString("latin1")));
    if (s.key === "D1" || s.key === "KP") {
      writeFileSync(join(SHOTS, `vedic-route-${s.key}.docx`), d.buf);
      writeFileSync(join(SHOTS, `vedic-route-${s.key}.pdf`), p.buf);
    }
    // E6: yeniden indirme
    const d2 = await bytes(`/analyses/${id}/report?format=docx`);
    const m2 = await Promise.all(Object.keys((await JSZip.loadAsync(d2.buf)).files).filter((n) => n.startsWith("word/media/") && !n.endsWith("/")).map(async (n) => (await JSZip.loadAsync(d2.buf)).file(n)!.async("nodebuffer")));
    ok(`E6 ${s.key}: kayıtlı analizi yeniden indirmek aynı haritayı verir`, m2.length === 1 && m2[0].equals(exp.png));
  }
  if (LOG) ok("E6 arşivden açma + rapor indirme: 0 sağlayıcı isteği", hits() === h0, `${h0} → ${hits()}`);

  // E5: yanlış harita yok — her türün görseli farklı (D1 ≠ D9 ≠ D10, KP ≠ horary ≠ transit)
  const keys = Object.keys(pngOf);
  const dup = keys.flatMap((a, i) => keys.slice(i + 1).filter((b) => pngOf[a].equals(pngOf[b])).map((b) => `${a}=${b}`));
  ok(`E5 ${keys.length} harita türünün görselleri birbirinden farklı (yanlış harita yanlış rapora girmez)`, keys.length === SELS.length && dup.length === 0, dup.join(","));
  ok("sayfa hatası yok", errors.length === 0, errors.join(" | "));
  await browser.close();
  console.log(`\nvedic charts ui: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("HATA", e);
  process.exit(2);
});
