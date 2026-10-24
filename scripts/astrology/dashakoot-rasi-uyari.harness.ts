/**
 * Dashakoot Rasi tutarlılık uyarısı (owner talimatı 24.10.2026 madde 4) — YALNIZ gösterim; puan / toplam / kısıt / servis
 * değerlendirmesi değişmez. Kaynak: 44 GERÇEK sağlayıcı yanıtı (fixtures/dashakoot-rasi/kanit-44.json; sentetik kişiler;
 * sha256 QA ham dosyasının baytları). Beklenen değerler harness içinde HAM yanıttan bağımsız sayılır (ürün fonksiyonu kullanılmaz).
 *   A) 44 yanıt: uyarı ⇔ (Rasi karşılandı · 1 ∧ gelinden damada sayım ∈ {6,8,12}) — yanlış alarm 0, kaçan 0; duyarlılık ⇔ kısıt yok ∧ toplam 5
 *   B) Değişmezlik: teknik veri dondurulur; uyarı, ekran ve rapor üretimi veriyi DEĞİŞTİRMEZ; toplam / puan aynen
 *   C) Ekran (SSR): uyarı kutusu + Rasi satırı rozeti yalnız koşulda; tutarlı yanıtta hiçbiri yok; golden (7/10, 6/10) etkilenmez
 *   D) Word/PDF: rapor modeli + gerçek .docx / .pdf metninde aynı metinler; tutarlı yanıtta yok
 *   E) Eski kayıt / bozuk veri: count yoksa burçlardan türetilir; tanınmayan burç, Rasi satırı yok, toplam bozuk → uyarı yok;
 *      kısıt alanı yoksa duyarlılık metni YAZILMAZ (yalnız satır uyarısı)
 *   F) Metin: marka adı yok; teknik metinde hüküm etiketi yok; ekran ve rapor aynı dizge
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { projectRoxyVedicDashakoot } from "@/lib/astrology/providers/roxy/vedicPorutham";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { DashakootPanel } from "@/app/admin/astroloji/_components/VedicPoruthamPanels";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Mod = { dashakootRasiNotice: (t: unknown) => J; dashakootRasiNoticeTexts: (n: J) => { row: string; total: string; decision: string | null } };
const FIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "dashakoot-rasi", "kanit-44.json"), "utf8")) as { yanitlar: { id: string; body: J; response: J }[] };
const GDIR = join(__dirname, "fixtures", "golden");
let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 4).join("\n     ")}`); }
}
const dec = (h: string) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const squash = (s: string) => s.replace(/\s+/g, "");
const SG = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
/** BAĞIMSIZ beklenti (ham yanıttan): person2 = gelin, person1 = damat (sağlayıcı sözleşmesi). */
function expected(raw: J) {
  const r = raw.breakdown.find((b: J) => b.name === "Rasi");
  const c = ((SG.indexOf(r.person1) - SG.indexOf(r.person2) + 12) % 12) + 1;
  const notice = r.points === 1 && [6, 8, 12].includes(c);
  return { notice, count: c, sensitive: notice && raw.rajju.active === false && raw.vedha.active === false && raw.total === 5 };
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); }
  return o;
}
const proj = (raw: J) => { const r = projectRoxyVedicDashakoot(raw, { ayanamsa: "lahiri" }) as J; assert.ok(r.ok, (r.errors ?? []).join("; ")); return r.technical as J; };
const buildR = (technical: J) =>
  buildAstroReport({ id: "x", title: "x", technique: "vedic.dashakoot", analysisAt: "2026-10-24T12:00:00Z", params: {}, technical, method: {}, profile: { label: "Ayşe", partner: { label: "Mehmet" } } } as never);
const FONT_B64 = readFileSync(join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");
async function wordPdf(r: J): Promise<{ docx: string; pdf: string }> {
  const zip = await JSZip.loadAsync(await renderAstroReportDocx(r, null, symbolFontBuffers()));
  const xml = await zip.file("word/document.xml")!.async("string");
  const docx = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(Buffer.from(buildAstroReportPdf(r, null, FONT_B64, symbolFontsBase64())))), { mergePages: true });
  return { docx, pdf: String(text).replace(/\s+/g, " ") };
}
const panel = (tech: J) => dec(renderToStaticMarkup(createElement(DashakootPanel as J, { t: tech, names: ["Ayşe", "Mehmet"] })));

async function main() {
  // Düzeltme öncesi modül yoksa testler FAIL sayılır (yükleme bozulmaz).
  const M = (await import("@/lib/astrology/model/dashakootRasiNotice").catch(() => null)) as Mod | null;
  const need = (): Mod => { assert.ok(M && typeof M.dashakootRasiNotice === "function", "dashakootRasiNotice modülü yok"); return M!; };
  const cases = FIX.yanitlar.map((y) => ({ ...y, exp: expected(y.response) }));
  const bad = cases.filter((c) => c.exp.notice), sens = bad.filter((c) => c.exp.sensitive);

  await t(`A0: fixture 44 gerçek yanıt; ürün projeksiyonu 44/44 kabul; beklenen (bağımsız) tutarsız ${bad.length}, duyarlı ${sens.length}`, () => {
    assert.equal(cases.length, 44);
    for (const c of cases) proj(c.response);
    assert.equal(bad.length, 8);
    assert.equal(sens.length, 3);
  });
  await t("A1: uyarı ⇔ kanıtlanmış çelişki koşulu — 44 yanıtta yanlış alarm 0, kaçan 0; sayım ve duyarlılık bağımsız beklentiyle aynı", () => {
    const { dashakootRasiNotice } = need();
    let fa = 0, miss = 0;
    for (const c of cases) {
      const n = dashakootRasiNotice(proj(c.response));
      if (n && !c.exp.notice) fa++;
      if (!n && c.exp.notice) miss++;
      if (n) {
        assert.equal(n.count, c.exp.count, `${c.id} sayım`);
        assert.equal(n.decisionSensitive, c.exp.sensitive, `${c.id} duyarlılık`);
        assert.equal(n.total, c.response.total, `${c.id} toplam`);
        assert.equal(n.totalUnderRule, c.response.total - 1, `${c.id} kural toplamı`);
      }
    }
    assert.deepEqual([fa, miss], [0, 0]);
  });
  await t("B: değişmezlik — dondurulmuş teknik veri; uyarı + ekran + rapor üretimi veriyi değiştirmez, toplam / Rasi puanı aynen", () => {
    const { dashakootRasiNotice } = need();
    for (const c of bad) {
      const tech = deepFreeze(proj(c.response));
      const before = JSON.stringify(tech);
      dashakootRasiNotice(tech);
      panel(tech);
      reportTexts(buildR(tech));
      assert.equal(JSON.stringify(tech), before, c.id);
      assert.equal(tech.total, c.response.total);
      assert.equal(tech.rows.find((r: J) => r.id === "rasi").points, 1);
    }
  });
  await t("C1: ekran — tutarsız 8 yanıtta uyarı kutusu + Rasi rozeti + satır ve toplam metni; duyarlılık metni yalnız 3 duyarlı yanıtta", () => {
    const { dashakootRasiNotice, dashakootRasiNoticeTexts } = need();
    for (const c of bad) {
      const tech = proj(c.response);
      const tx = dashakootRasiNoticeTexts(dashakootRasiNotice(tech));
      const h = panel(tech);
      assert.ok(h.includes('data-testid="astro-dashakoot-rasi-notice"'), `${c.id} kutu`);
      assert.ok(h.includes('data-testid="astro-dashakoot-rasi-badge"'), `${c.id} rozet`);
      assert.ok(h.includes(tx.row) && h.includes(tx.total), `${c.id} metin`);
      assert.equal(h.includes('data-testid="astro-dashakoot-rasi-decision"'), c.exp.sensitive, `${c.id} duyarlılık`);
      if (tx.decision) assert.ok(h.includes(tx.decision), `${c.id} duyarlılık metni`);
    }
  });
  await t("C2: ekran — tutarlı 36 yanıtta ve iki golden'da (7/10, takas 6/10) uyarı kutusu / rozet YOK", () => {
    need();
    const goldens = ["vedic-dashakoot", "vedic-dashakoot-swap"].map((n) => JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8")).response);
    for (const raw of [...cases.filter((c) => !c.exp.notice).map((c) => c.response), ...goldens]) {
      const h = panel(proj(raw));
      assert.ok(!h.includes("astro-dashakoot-rasi-notice") && !h.includes("astro-dashakoot-rasi-badge") && !h.includes("tutarlılık uyarısı"));
    }
  });
  await t("D1: rapor modeli — tutarsız yanıtta ekranla AYNI satır / toplam / (duyarlıysa) duyarlılık metni; tutarlı yanıtta yok", () => {
    const { dashakootRasiNotice, dashakootRasiNoticeTexts } = need();
    for (const c of cases) {
      const tech = proj(c.response);
      const s = reportTexts(buildR(tech)).join("\n");
      const n = dashakootRasiNotice(tech);
      if (!n) { assert.ok(!s.includes("tutarlılık uyarısı"), `${c.id} tutarlı`); continue; }
      const tx = dashakootRasiNoticeTexts(n);
      assert.ok(s.includes(tx.row) && s.includes(tx.total), `${c.id} rapor metni`);
      assert.equal(tx.decision ? s.includes(tx.decision) : !s.includes("bu satıra duyarlıdır"), true, `${c.id} duyarlılık`);
    }
  });
  await t("D2: gerçek Word (.docx) ve PDF metni — duyarlı bir yanıtta üç metin; tutarlı golden'da uyarı yok", async () => {
    const { dashakootRasiNotice, dashakootRasiNoticeTexts } = need();
    const tech = proj(sens[0].response);
    const tx = dashakootRasiNoticeTexts(dashakootRasiNotice(tech));
    const { docx, pdf } = await wordPdf(buildR(tech));
    for (const x of [tx.row, tx.total, tx.decision!]) {
      assert.ok(squash(docx).includes(squash(x)), `Word: ${x.slice(0, 40)}`);
      assert.ok(squash(pdf).includes(squash(x)), `PDF: ${x.slice(0, 40)}`);
    }
    const g = proj(JSON.parse(readFileSync(join(GDIR, "vedic-dashakoot.json"), "utf8")).response);
    const w = await wordPdf(buildR(g));
    assert.ok(!w.docx.includes("tutarlılık uyarısı") && !w.pdf.includes("tutarlılık uyarısı"));
  });
  await t("E: eski kayıt / bozuk veri — count yoksa türetilir; tanınmayan burç / Rasi yok / toplam bozuk → yok; kısıt alanı yoksa duyarlılık yazılmaz", () => {
    const { dashakootRasiNotice, dashakootRasiNoticeTexts } = need();
    const base = proj(sens[0].response);
    const clone = () => JSON.parse(JSON.stringify(base));
    const noCount = clone(); delete noCount.rows.find((r: J) => r.id === "rasi").count;
    assert.equal(dashakootRasiNotice(noCount)?.count, 6, "count yok → burçlardan 6");
    const unk = clone(); const r = unk.rows.find((x: J) => x.id === "rasi"); delete r.count; r.person1 = { raw: "Ophiuchus", label: "?" };
    assert.equal(dashakootRasiNotice(unk), null, "tanınmayan burç");
    const noRow = clone(); noRow.rows = noRow.rows.filter((x: J) => x.id !== "rasi");
    assert.equal(dashakootRasiNotice(noRow), null, "Rasi satırı yok");
    for (const tot of [null, 5.5, 0, 11, "5"]) { const x = clone(); x.total = tot; assert.equal(dashakootRasiNotice(x), null, `toplam ${String(tot)}`); }
    const noRj = clone(); delete noRj.rajju;
    const n = dashakootRasiNotice(noRj);
    assert.ok(n && n.decisionSensitive === false && dashakootRasiNoticeTexts(n).decision === null, "kısıt bilinmiyorsa duyarlılık metni yok");
    const veto = clone(); veto.rajju.active = true;
    assert.equal(dashakootRasiNotice(veto)?.decisionSensitive, false, "kısıt etkinse karar kısıta bağlıdır");
    for (const v of [null, undefined, [], "x", 1, { rows: "x" }]) assert.equal(dashakootRasiNotice(v), null);
  });
  await t("F: metin — marka adı yok; teknik uyarı metninde hüküm etiketi (önerilir / sınırda / reddedilir / tavsiye) yok; puan değiştirilmedi ibaresi var", () => {
    const { dashakootRasiNotice, dashakootRasiNoticeTexts } = need();
    for (const c of bad) {
      const tx = dashakootRasiNoticeTexts(dashakootRasiNotice(proj(c.response)));
      const all = [tx.row, tx.total, tx.decision ?? ""].join(" ");
      assert.doesNotMatch(all, /roxy/i);
      assert.doesNotMatch(all, /önerilir|sınırda|reddedilir|tavsiye/i);
      assert.match(tx.row, /Gösterilen puan ve toplam değiştirilmemiştir\./);
    }
  });
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
