/**
 * Refleksoloji PREMIUM Word raporu — harness (server-side, tarayıcısız).
 *
 * Kapsam:
 *   A. CONTENT CONTRACT  — single: İçindekiler/Kaynak UID/#001/Protokol Sayısı/Kapsam YOK
 *   A2. BULK numbering    — çok protokolde #001/#002 + Protokol Sayısı
 *   B. CONDITIONAL        — açıklama/not/taban/yan_ic/yan_dis boşsa bölüm YOK
 *   C. SHAPE              — oval/rect/free_draw/thick_line doğru SVG elementi
 *   D. VIEW GROUPING      — mesane→yan_ic, ince bağırsak→yan_dis, taban'a sızmaz
 *   E. IDENTITY           — NFC/NFD kanonik atlas eşleşmesi
 *   F. DOCX               — Packer geçerli, gömülü PNG + magic bytes + boyut/oran
 *   G. DETERMINISM        — aynı girdi → aynı SVG → aynı PNG
 *
 * Çalıştır: npm run refleksoloji:word:harness
 */

import { Document, Packer } from "docx";
import JSZip from "jszip";
import type { AtlasDocument, StoredRegion } from "@/lib/atlasStorage";
import { resolveProtocolAtlas, type AtlasBackgroundGroup } from "@/lib/refleksoloji/atlasRegionsCore";
import { buildAtlasSvg, renderAtlasGroupPng, regionToSvg } from "@/lib/refleksoloji/atlasImage";
import {
  buildSingleReport,
  buildBulkReport,
  reflexologyHeaders,
  reflexologyFooters,
  type ReflexologyProtocolInput,
} from "@/lib/refleksoloji/reflexologyWord";
import { getImgDimensions } from "@/lib/docx/reportHelpers";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(t: string): void {
  console.log(`\n──────── ${t} ────────`);
}

// ─── Fixture yardımcıları ─────────────────────────────────────────────────────
let uid = 0;
const nid = (p: string) => `${p}-${(uid += 1)}`;

function oval(cx: number, cy: number, rx = 0.05, ry = 0.05): StoredRegion {
  return { id: nid("oval"), shape: "oval", cx, cy, rx, ry, angle: 0 };
}
function rect(cx: number, cy: number, rx = 0.05, ry = 0.04): StoredRegion {
  return { id: nid("rect"), shape: "rect", cx, cy, rx, ry, angle: 0 };
}
function freeDraw(pts: [number, number][]): StoredRegion {
  return { id: nid("free"), shape: "free_draw", points: pts.map(([x, y]) => ({ x, y })) };
}
function thickLine(x1: number, y1: number, x2: number, y2: number): StoredRegion {
  return { id: nid("thick"), shape: "thick_line", x1, y1, x2, y2, lineWidth: 0.004 };
}

type Bucket = { sol?: StoredRegion[]; sag?: StoredRegion[] };
function entry(taban: Bucket, yan: Bucket) {
  return {
    taban: { sol: taban.sol ?? [], sag: taban.sag ?? [] },
    yan: { sol: yan.sol ?? [], sag: yan.sag ?? [] },
  };
}

function makeAtlas(organs: Record<string, ReturnType<typeof entry>>): AtlasDocument {
  return { _meta: { version: "1", updated_at: "2026-01-01T00:00:00.000Z" }, ...organs } as AtlasDocument;
}

// Gerçekçi fixture (§22): karışık şekiller + üç görünüm.
const ATLAS = makeAtlas({
  // Taban organları
  "Böbrek": entry({ sol: [freeDraw([[0.28, 0.55], [0.30, 0.60], [0.31, 0.64]])], sag: [freeDraw([[0.70, 0.55], [0.72, 0.60], [0.73, 0.64]])] }, {}),
  "Kalp": entry({ sol: [oval(0.30, 0.42), oval(0.33, 0.45)] }, {}),
  "Karaciğer": entry({ sag: [rect(0.68, 0.40), rect(0.72, 0.44)] }, {}),
  // Yan görünüm — İç (mesane inner organ)
  "Mesane": entry({}, { sol: [rect(0.35, 0.60), rect(0.40, 0.62)] }),
  // Yan görünüm — Dış (ince bağırsak dış)
  "İnce bağırsak": entry({}, { sol: [freeDraw([[0.55, 0.40], [0.60, 0.45]]), thickLine(0.62, 0.5, 0.7, 0.58)] }),
});

// NFD anahtarlı atlas (identity testi): "Karaciğer" NFD normalize edilerek saklanır.
const NFD_ATLAS = makeAtlas({
  ["Karaciğer".normalize("NFD")]: entry({ sag: [rect(0.68, 0.40)] }, {}),
});

function input(over: Partial<ReflexologyProtocolInput> & { organs: string[]; atlas?: AtlasDocument }): ReflexologyProtocolInput {
  const atlas = over.atlas ?? ATLAS;
  return {
    index: over.index ?? 0,
    title: over.title ?? "Sindirim Problemi",
    description: over.description ?? null,
    notes: over.notes ?? null,
    organs: over.organs,
    createdAt: over.createdAt ?? "2026-05-01T10:00:00.000Z",
    resolved: resolveProtocolAtlas(atlas, over.organs),
  };
}

function mediaFiles(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((f) => !zip.files[f].dir && /^word\/media\/.+\.(png|jpe?g)$/i.test(f));
}

async function docText(children: Awaited<ReturnType<typeof buildSingleReport>>): Promise<{ xml: string; zip: JSZip }> {
  const doc = new Document({
    sections: [{ properties: { titlePage: true }, headers: reflexologyHeaders(), footers: reflexologyFooters(), children }],
  });
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return { xml, zip };
}

async function main(): Promise<void> {
  // ── A. CONTENT CONTRACT (single) ─────────────────────────────────────────
  section("A. CONTENT CONTRACT (single)");
  {
    const single = await buildSingleReport(
      input({ title: "Sindirim Problemi", description: "Protokolün amacı", notes: "Sabah uygula.", organs: ["Böbrek", "Kalp", "Karaciğer", "Mesane", "İnce bağırsak"] }),
      "01 Mayıs 2026",
    );
    const { xml, zip } = await docText(single);
    ok("İçindekiler YOK", !xml.includes("İÇİNDEKİLER") && !xml.includes("İçindekiler"));
    ok("TOC field YOK", !xml.includes("TOC \\o"));
    ok("Kaynak UID YOK", !xml.includes("Kaynak UID"));
    ok("source_uid YOK", !xml.toLowerCase().includes("source_uid"));
    ok("PROTOKOL #001 YOK (single)", !xml.includes("PROTOKOL #001"));
    ok("'Protokol Sayısı' YOK (single)", !xml.includes("Protokol Sayısı"));
    ok("'Kapsam' YOK (single)", !xml.includes("Kapsam"));
    ok("'Tek Protokol' YOK (single)", !xml.includes("Tek Protokol"));
    ok("başlık var", xml.includes("Sindirim Problemi"));
    ok("Protokol Özeti var", xml.includes("Protokol Özeti"));
    ok("Uygulama Haritası var", xml.includes("Uygulama Haritası"));
    ok("Organ tablosu var", xml.includes("Seçilen Organlar ve Atlas Bölgeleri"));
    const media = mediaFiles(zip);
    ok("3 harita PNG gömülü (taban+yan_ic+yan_dis)", media.length === 3, `media=${media.length}`);
  }

  // ── A2. BULK numbering ───────────────────────────────────────────────────
  section("A2. CONTENT CONTRACT (bulk numbering)");
  {
    const bulk = await buildBulkReport(
      [
        input({ index: 0, title: "Protokol A", organs: ["Kalp"] }),
        input({ index: 1, title: "Protokol B", organs: ["Karaciğer"] }),
      ],
      "01 Mayıs 2026",
      "Tüm Protokoller",
    );
    const { xml } = await docText(bulk);
    ok("PROTOKOL #001 var (bulk)", xml.includes("PROTOKOL #001"));
    ok("PROTOKOL #002 var (bulk)", xml.includes("PROTOKOL #002"));
    ok("Protokol Sayısı var (bulk kapak)", xml.includes("Protokol Sayısı"));
    ok("Kapsam var (bulk kapak)", xml.includes("Kapsam"));
  }

  // ── B. CONDITIONAL ───────────────────────────────────────────────────────
  section("B. CONDITIONAL (boş → bölüm YOK)");
  {
    const withDesc = await docText(await buildSingleReport(input({ description: "AÇIKLAMA_SENTINEL", organs: ["Kalp"] }), "x"));
    ok("açıklama VAR → görünür", withDesc.xml.includes("AÇIKLAMA_SENTINEL"));
    const noDesc = await docText(await buildSingleReport(input({ description: null, organs: ["Kalp"] }), "x"));
    ok("açıklama YOK → görünmez", !noDesc.xml.includes("AÇIKLAMA_SENTINEL"));

    const withNotes = await docText(await buildSingleReport(input({ notes: "NOT_SENTINEL", organs: ["Kalp"] }), "x"));
    ok("not VAR → UYGULAMA NOTLARI callout", withNotes.xml.includes("UYGULAMA NOTLARI") && withNotes.xml.includes("NOT_SENTINEL"));
    const noNotes = await docText(await buildSingleReport(input({ notes: null, organs: ["Kalp"] }), "x"));
    ok("not YOK → callout YOK", !noNotes.xml.includes("UYGULAMA NOTLARI"));

    // Yalnız yan_ic (mesane) → Taban ve Yan Dış haritası YOK
    const onlyYanIc = await docText(await buildSingleReport(input({ organs: ["Mesane"] }), "x"));
    ok("taban boş → 'Haritası — Taban' YOK", !onlyYanIc.xml.includes("Haritası — Taban"));
    ok("yan_ic var → 'Haritası — Yan İç' VAR", onlyYanIc.xml.includes("Haritası — Yan İç"));
    ok("yan_dis boş → 'Haritası — Yan Dış' YOK", !onlyYanIc.xml.includes("Haritası — Yan Dış"));

    // Yalnız yan_dis (ince bağırsak) → Yan İç YOK
    const onlyYanDis = await docText(await buildSingleReport(input({ organs: ["İnce bağırsak"] }), "x"));
    ok("yan_dis var → 'Haritası — Yan Dış' VAR", onlyYanDis.xml.includes("Haritası — Yan Dış"));
    ok("yan_ic boş → 'Haritası — Yan İç' YOK", !onlyYanDis.xml.includes("Haritası — Yan İç"));

    // Yalnız taban → yan haritaları YOK
    const onlyTaban = await docText(await buildSingleReport(input({ organs: ["Kalp"] }), "x"));
    ok("yalnız taban → Taban VAR", onlyTaban.xml.includes("Haritası — Taban"));
    ok("yalnız taban → Yan İç YOK", !onlyTaban.xml.includes("Haritası — Yan İç"));
    ok("yalnız taban → Yan Dış YOK", !onlyTaban.xml.includes("Haritası — Yan Dış"));
  }

  // ── C. SHAPE (SVG geometri) ──────────────────────────────────────────────
  section("C. SHAPE (SVG elementleri)");
  {
    const W = 1000, H = 1000;
    const r = resolveProtocolAtlas(ATLAS, ["Kalp"]); // oval
    ok("oval → <ellipse", r.regionsByGroup.taban.every((x) => regionToSvg(x, W, H).includes("<ellipse")));
    const rr = resolveProtocolAtlas(ATLAS, ["Karaciğer"]); // rect
    ok("rect → <rect", rr.regionsByGroup.taban.every((x) => regionToSvg(x, W, H).includes("<rect")));
    const rf = resolveProtocolAtlas(ATLAS, ["Böbrek"]); // free_draw ≥2
    ok("free_draw(≥2) → <polyline", rf.regionsByGroup.taban.every((x) => regionToSvg(x, W, H).includes("<polyline")));
    const rt = resolveProtocolAtlas(ATLAS, ["İnce bağırsak"]); // includes thick_line
    ok("thick_line → <line", rt.regionsByGroup.yan_dis.some((x) => x.shape === "thick_line" && regionToSvg(x, W, H).includes("<line")));
    // free_draw tek nokta → <circle
    const singlePt = makeAtlas({ "Test": entry({ sol: [freeDraw([[0.5, 0.5]])] }, {}) });
    const rs = resolveProtocolAtlas(singlePt, ["Test"]);
    ok("free_draw(1 nokta) → <circle", regionToSvg(rs.regionsByGroup.taban[0], W, H).includes("<circle"));
  }

  // ── D. VIEW GROUPING ─────────────────────────────────────────────────────
  section("D. VIEW GROUPING (İç/Dış/Taban karışmaz)");
  {
    const r = resolveProtocolAtlas(ATLAS, ["Mesane", "İnce bağırsak", "Kalp"]);
    ok("mesane → yan_ic", r.regionsByGroup.yan_ic.every((x) => x.organLabel === "Mesane") && r.regionsByGroup.yan_ic.length === 2);
    ok("ince bağırsak → yan_dis", r.regionsByGroup.yan_dis.every((x) => x.organLabel === "İnce bağırsak") && r.regionsByGroup.yan_dis.length === 2);
    ok("mesane taban'a sızmaz", !r.regionsByGroup.taban.some((x) => x.organLabel === "Mesane"));
    ok("ince bağırsak yan_ic'e sızmaz", !r.regionsByGroup.yan_ic.some((x) => x.organLabel === "İnce bağırsak"));
    ok("kalp yalnız taban", r.regionsByGroup.taban.some((x) => x.organLabel === "Kalp") && !r.regionsByGroup.yan_ic.some((x) => x.organLabel === "Kalp"));
  }

  // ── E. IDENTITY (NFC/NFD) ────────────────────────────────────────────────
  section("E. IDENTITY (NFC/NFD kanonik eşleşme)");
  {
    const r = resolveProtocolAtlas(NFD_ATLAS, ["KARACİĞER"]); // NFC uppercase vs NFD key
    ok("NFD anahtar ↔ NFC sorgu eşleşir", r.organs[0]?.found === true && r.organs[0]?.totalRegions === 1);
    const rMiss = resolveProtocolAtlas(NFD_ATLAS, ["Dalak"]);
    ok("olmayan organ → found=false", rMiss.organs[0]?.found === false && rMiss.missingOrgans.includes("Dalak"));
  }

  // ── F. DOCX (gömülü PNG bütünlüğü) ───────────────────────────────────────
  section("F. DOCX (PNG magic bytes + boyut/oran)");
  {
    const single = await buildSingleReport(input({ organs: ["Kalp"] }), "x"); // yalnız taban
    const { zip } = await docText(single);
    const mediaNames = mediaFiles(zip);
    ok("en az 1 gömülü görsel", mediaNames.length >= 1, `media=${mediaNames.length}`);
    const buf = Buffer.from(await zip.file(mediaNames[0])!.async("nodebuffer"));
    ok("PNG magic bytes (89 50 4E 47)", buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47);
    const dims = getImgDimensions(buf);
    ok("boyut okunur", dims != null && dims.w > 0 && dims.h > 0, JSON.stringify(dims));
    ok("taban ~1:1 oran", dims != null && Math.abs(dims.w / dims.h - 1) < 0.02, dims ? `${dims.w}x${dims.h}` : "");
    ok("yüksek çözünürlük (≥2000px)", dims != null && dims.w >= 2000);
  }

  // ── G. DETERMINISM ───────────────────────────────────────────────────────
  section("G. DETERMINISM (aynı girdi → aynı SVG → aynı PNG)");
  {
    const r = resolveProtocolAtlas(ATLAS, ["Mesane"]);
    const regions = r.regionsByGroup.yan_ic;
    const svg1 = (await buildAtlasSvg("yan_ic" as AtlasBackgroundGroup, regions)).svg;
    const svg2 = (await buildAtlasSvg("yan_ic" as AtlasBackgroundGroup, regions)).svg;
    ok("SVG deterministik", svg1 === svg2);
    const png1 = (await renderAtlasGroupPng("yan_ic", regions)).png;
    const png2 = (await renderAtlasGroupPng("yan_ic", regions)).png;
    ok("PNG deterministik (byte-eşit)", png1.equals(png2), `${png1.length} vs ${png2.length}`);
  }

  // ── H. REPORT DATE (kapak "Oluşturulma Tarihi" = üretim tarihi, protokol tarihi değil) ──
  section("H. REPORT DATE (üretim tarihi ≠ protokol tarihi)");
  {
    // protocol.created_at 25 Ağustos; rapor 26 Ağustos'ta üretiliyor.
    const single = await buildSingleReport(
      input({ organs: ["Kalp"], createdAt: "2026-08-25T09:00:00.000Z" }),
      "26 Ağustos 2026", // reportDateLabel (üretim)
      "25 Ağustos 2026", // protocolDateLabel (kayıt)
    );
    const { xml } = await docText(single);
    const iOlus = xml.indexOf("Oluşturulma Tarihi");
    const i26 = xml.indexOf("26 Ağustos 2026");
    const iProt = xml.indexOf("Protokol Tarihi");
    const i25 = xml.indexOf("25 Ağustos 2026");
    ok("kapakta 'Oluşturulma Tarihi' var", iOlus >= 0);
    ok("Oluşturulma Tarihi = 26 Ağustos (üretim)", iOlus >= 0 && i26 > iOlus && (iProt < 0 || i26 < iProt));
    ok("'Protokol Tarihi' ayrı metadata var", iProt > iOlus);
    ok("Protokol Tarihi = 25 Ağustos (kayıt)", iProt >= 0 && i25 > iProt);
    ok("Oluşturulma Tarihi'nin değeri 25 DEĞİL (regresyon)", !(iOlus >= 0 && i25 > iOlus && (iProt < 0 || i25 < iProt)));

    // protocolDateLabel verilmezse "Protokol Tarihi" satırı YOK (conditional).
    const noProt = await docText(await buildSingleReport(input({ organs: ["Kalp"] }), "26 Ağustos 2026"));
    ok("protokol tarihi verilmezse 'Protokol Tarihi' YOK", !noProt.xml.includes("Protokol Tarihi"));
  }

  console.log(`\n──────── SONUÇ: ${pass}/${pass + fail} PASS ────────`);
  if (fail > 0) {
    console.log(`❌ ${fail} test başarısız.`);
    process.exit(1);
  }
  console.log("✅ Tüm Word raporu testleri geçti.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
