/**
 * reflexology-hand-point-harness.ts
 *
 * EL YÜZEYLERİ (el_avuc / el_sirt) + NOKTA (point) regresyon kilidi.
 *
 *   A. Tip/çekirdek     — point renderable kuralı, 5 görünüm grubu, etiket/asset
 *   B. Normalize        — el bucket'ları + point KAYIPSIZ, idempotent, legacy {taban,yan}
 *   C. Merge (ZORUNLU)  — 3-yollu + base'siz birleştirme: ayak + el verisi 0 kayıp
 *   D. Eski istemci     — el anahtarı taşımayan PUT → sunucu el bölgelerini KORUR
 *   E. Taslak → atlas   — mergeDraftIntoAtlas el/point bölgelerini doğru bucket'a yazar
 *   F. Protokol/Word    — el grupları çözülür, point SVG, el PNG'leri + DOCX
 *   G. Kayıtlı Atlas    — özet etiketleri (Ayak / El ayrımı)
 *   H. Sunucu doğrulama — point + el görünümü PUT gövdesi kabul
 *   I. Nokta boyutu     — kayıt gidiş-dönüş, eski kayıt → Orta, ekran/Word çapı
 *
 * GERÇEK üretim fonksiyonlarını çağırır (kopya iş kuralı YOK).
 * Çalıştır:  npx tsx scripts/reflexology-hand-point-harness.ts
 */
import { Document, Packer } from "docx";
import JSZip from "jszip";
import type { FootSide, FootView, Region, RegionShapeType } from "@/app/refleksoloji/bolge-haritasi/types";
import {
  ALL_FOOT_VIEWS,
  DEFAULT_POINT_SIZE,
  POINT_RENDER_DIAMETER_PX,
  POINT_SIZES,
  pointDiameterPx,
  resolvePointSize,
} from "@/app/refleksoloji/bolge-haritasi/types";
import { ATLAS_IMAGE_SRC, atlasBackgroundLabel } from "@/app/refleksoloji/bolge-haritasi/utils/atlasBackground";
import {
  emptyOrganEntry,
  getRegionsForOrgan,
  mergeDraftIntoAtlas,
  type AtlasDocument,
} from "@/lib/atlasStorage";
import { normalizeAtlasDocument } from "@/lib/refleksoloji/atlasNormalize";
import { mergeAtlasThreeWay, mergeAtlasWithTombstones, type AtlasDocLike } from "@/lib/refleksoloji/atlasMerge";
import { carryOverHandBuckets, decideAtlasPut } from "@/lib/refleksoloji/atlasSyncCore";
import { validateAtlasPayload } from "@/lib/refleksoloji/atlasValidate";
import {
  ALL_ATLAS_GROUPS,
  ATLAS_GROUP_ASSET,
  ATLAS_GROUP_LABEL,
  isRenderableAtlasRegion,
  resolveProtocolAtlas,
  type RenderRegion,
} from "@/lib/refleksoloji/atlasRegionsCore";
import { regionToSvg, renderAtlasGroupPng } from "@/lib/refleksoloji/atlasImage";
import { buildSingleReport, reflexologyFooters, reflexologyHeaders } from "@/lib/refleksoloji/reflexologyWord";
import { atlasRegionToDisplay } from "@/app/refleksoloji/protokol-haritasi/lib/resolveDisplayRegions";
import {
  buildOrganSummary,
  footSideLabel,
  shapeLabel,
  viewLabel,
} from "@/app/refleksoloji/kayitli-atlas/lib/organSummary";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    fails.push(name);
    console.log(`  ❌ ${name}`);
  }
}

const SHAPES: RegionShapeType[] = ["oval", "rect", "free_draw", "thick_line", "point"];
const HAND_VIEWS: FootView[] = ["el_avuc", "el_sirt"];
let seq = 0;
const rid = (t: string) => `hp-${t}-${(seq++).toString().padStart(3, "0")}`;

function makeRegion(shape: RegionShapeType, organ: string, footSide: FootSide, view: FootView, i: number): Region {
  const cx = 0.2 + ((i * 0.07) % 0.6);
  const cy = 0.25 + ((i * 0.05) % 0.5);
  const base = { id: rid(`${view}-${shape}`), organ, footSide, view, shape, color: "rgba(239, 68, 68, 0.22)" } as Region;
  if (shape === "oval" || shape === "rect") return { ...base, cx, cy, rx: 0.04, ry: 0.03, angle: 0 };
  if (shape === "free_draw") return { ...base, points: [{ x: cx, y: cy }, { x: cx + 0.04, y: cy + 0.02 }] };
  if (shape === "thick_line") return { ...base, x1: cx, y1: cy, x2: cx + 0.1, y2: cy + 0.04, lineWidth: 0.003 };
  return { ...base, cx, cy };
}

/** Her görünüm × her şekil × iki taraf. */
function fullFixture(organ: string): Region[] {
  const out: Region[] = [];
  let i = 0;
  for (const view of ALL_FOOT_VIEWS) {
    for (const shape of SHAPES) {
      out.push(makeRegion(shape, organ, "left", view, i++));
      out.push(makeRegion(shape, organ, "right", view, i++));
    }
  }
  return out;
}

const EMPTY: AtlasDocument = { _meta: { version: "1", updated_at: "T" } } as AtlasDocument;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function regionIdsByView(doc: AtlasDocLike, organ: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const entry = doc[organ] as Record<string, { sol?: { id: string }[]; sag?: { id: string }[] }> | undefined;
  if (!entry) return out;
  for (const [view, bucket] of Object.entries(entry)) {
    out[view] = [...(bucket.sol ?? []), ...(bucket.sag ?? [])].map((r) => r.id).sort();
  }
  return out;
}

function handCount(doc: AtlasDocLike, organ: string): number {
  const ids = regionIdsByView(doc, organ);
  return (ids.el_avuc?.length ?? 0) + (ids.el_sirt?.length ?? 0);
}

function totalCount(doc: AtlasDocLike, organ: string): number {
  return Object.values(regionIdsByView(doc, organ)).reduce((a, l) => a + l.length, 0);
}

console.log("Refleksoloji — EL YÜZEYLERİ + NOKTA HARNESS\n");

/* ─── A. Tip / çekirdek ─────────────────────────────────────────────────────── */
check("ALL_FOOT_VIEWS = 3 ayak + 2 el", ALL_FOOT_VIEWS.join(",") === "taban,yan_ic,yan_dis,el_avuc,el_sirt");
check("ALL_ATLAS_GROUPS = ALL_FOOT_VIEWS", ALL_ATLAS_GROUPS.join(",") === ALL_FOOT_VIEWS.join(","));
check("etiket Avuç İçi / El Sırtı", ATLAS_GROUP_LABEL.el_avuc === "Avuç İçi" && ATLAS_GROUP_LABEL.el_sirt === "El Sırtı");
check("asset avuç", ATLAS_GROUP_ASSET.el_avuc === "el_avuc_sag_sol.png" && ATLAS_IMAGE_SRC.el_avuc === "/refleksoloji/el_avuc_sag_sol.png");
check("asset sırt", ATLAS_GROUP_ASSET.el_sirt === "el_sirti_sag_sol.png" && ATLAS_IMAGE_SRC.el_sirt === "/refleksoloji/el_sirti_sag_sol.png");
check("ayak asset'leri DEĞİŞMEDİ",
  ATLAS_IMAGE_SRC.taban === "/refleksoloji/klinik_taban.png" &&
  ATLAS_IMAGE_SRC.yan_ic === "/refleksoloji/klinik_yan_ic.png" &&
  ATLAS_IMAGE_SRC.yan_dis === "/refleksoloji/klinik_yan_dis.png");
check("arka plan etiketleri", atlasBackgroundLabel("el_avuc") === "Avuç İçi Görünüm" && atlasBackgroundLabel("el_sirt") === "El Sırtı Görünüm" && atlasBackgroundLabel("yan_dis") === "Yan Dış Görünüm");
const pt = makeRegion("point", "Kalp", "left", "el_avuc", 1);
check("point renderable (cx/cy)", isRenderableAtlasRegion(pt));
check("point cx yoksa renderable DEĞİL", !isRenderableAtlasRegion({ ...pt, cx: undefined }));
check("point NaN renderable DEĞİL", !isRenderableAtlasRegion({ ...pt, cy: Number.NaN }));
check("emptyOrganEntry 5 bucket", Object.keys(emptyOrganEntry()).sort().join(",") === "el_avuc,el_sirt,taban,yan_dis,yan_ic");
const disp = atlasRegionToDisplay(pt);
check("protokol display point (cx/cy korunur)", disp?.shape === "point" && disp.cx === pt.cx && disp.cy === pt.cy);

/* ─── B. Normalize ──────────────────────────────────────────────────────────── */
const FIX = fullFixture("Böbrek");
const DOC = mergeDraftIntoAtlas(clone(EMPTY), FIX, []);
check(`taslak → atlas: 50 bölge (got ${totalCount(DOC as AtlasDocLike, "Böbrek")})`, totalCount(DOC as AtlasDocLike, "Böbrek") === 50);
check(`taslak → atlas: el 20 bölge (got ${handCount(DOC as AtlasDocLike, "Böbrek")})`, handCount(DOC as AtlasDocLike, "Böbrek") === 20);
const N1 = normalizeAtlasDocument(clone(DOC));
check("normalize: 0 bölge kaybı (50)", totalCount(N1 as AtlasDocLike, "Böbrek") === 50);
check("normalize: el 0 kayıp (20)", handCount(N1 as AtlasDocLike, "Böbrek") === 20);
check("normalize idempotent", JSON.stringify(normalizeAtlasDocument(clone(N1))) === JSON.stringify(N1));
const pointsAfter = getRegionsForOrgan(N1, "Böbrek").filter((r) => r.shape === "point");
check(`normalize: point 10 adet korunur (got ${pointsAfter.length})`, pointsAfter.length === 10);
check("normalize: point geometrisi aynen (cx/cy)", pointsAfter.every((r) => {
  const src = FIX.find((f) => f.id === r.id);
  return !!src && src.cx === r.cx && src.cy === r.cy && r.footSide === src.footSide && r.view === src.view;
}));
for (const view of HAND_VIEWS) {
  for (const foot of ["left", "right"] as const) {
    const got = getRegionsForOrgan(N1, "Böbrek", { view, foot }).length;
    check(`${view}/${foot}: 5 şekil (got ${got})`, got === 5);
  }
}
// Legacy {taban, yan} belge → el bucket'ları boş eklenir, ayak bölgesi kaybolmaz.
const LEGACY = {
  _meta: { version: "1", updated_at: "T" },
  Mesane: {
    taban: { sol: [{ id: "lg-1", shape: "oval", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 }], sag: [] },
    yan: { sol: [{ id: "lg-2", shape: "rect", cx: 0.4, cy: 0.4, rx: 0.1, ry: 0.1 }], sag: [] },
  },
};
const NL = normalizeAtlasDocument(clone(LEGACY)) as unknown as AtlasDocLike;
const nlIds = regionIdsByView(NL, "Mesane");
check("legacy: taban + yan→yan_ic korunur", nlIds.taban?.join() === "lg-1" && nlIds.yan_ic?.join() === "lg-2");
check("legacy: el bucket'ları boş eklenir", nlIds.el_avuc?.length === 0 && nlIds.el_sirt?.length === 0);
// Eski (el anahtarı OLMAYAN) 3-görünüm belge → normalize no-loss.
const OLD3 = {
  _meta: { version: "1", updated_at: "T" },
  Kalp: { taban: { sol: [{ id: "o3-1", shape: "oval", cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.1 }], sag: [] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } },
};
check("eski 3-görünüm belge normalize: ayak korunur", totalCount(normalizeAtlasDocument(clone(OLD3)) as unknown as AtlasDocLike, "Kalp") === 1);

/* ─── C. Merge — ZORUNLU 0 kayıp ───────────────────────────────────────────── */
// C1. 3-yollu: base = N1; sunucu el'e nokta ekler; yerel ayağa oval ekler.
const base = clone(N1) as unknown as AtlasDocLike;
const serverDoc = mergeDraftIntoAtlas(clone(N1), [makeRegion("point", "Böbrek", "right", "el_sirt", 91)], []) as unknown as AtlasDocLike;
const localDoc = mergeDraftIntoAtlas(clone(N1), [makeRegion("oval", "Böbrek", "left", "taban", 92)], []) as unknown as AtlasDocLike;
const m3 = mergeAtlasThreeWay(serverDoc, localDoc, base, "2026-10-10T12:00:00.000Z");
check(`3-yollu: 52 bölge (got ${totalCount(m3.document, "Böbrek")})`, totalCount(m3.document, "Böbrek") === 52);
check(`3-yollu: el 21 (got ${handCount(m3.document, "Böbrek")})`, handCount(m3.document, "Böbrek") === 21);
check("3-yollu: çakışma yok", m3.conflicts.length === 0);
// C2. 3-yollu: yerel el bölgesini SİLER (bilinçli) → silme uygulanır, kalan el korunur.
const delId = getRegionsForOrgan(N1, "Böbrek", { view: "el_avuc", foot: "left" })[0].id;
const localDel = mergeDraftIntoAtlas(clone(N1), [], [delId]) as unknown as AtlasDocLike;
const m3d = mergeAtlasThreeWay(clone(N1) as unknown as AtlasDocLike, localDel, base, "2026-10-10T12:00:00.000Z");
check("3-yollu silme: yalnız silinen düşer (49)", totalCount(m3d.document, "Böbrek") === 49 && !regionIdsByView(m3d.document, "Böbrek").el_avuc.includes(delId));
// C3. Base'siz (LWW/union): sunucu yalnız ayak, yerel el+ayak → hepsi korunur.
const footOnly = mergeDraftIntoAtlas(clone(EMPTY), FIX.filter((r) => !HAND_VIEWS.includes(r.view)), []) as unknown as AtlasDocLike;
const mu = mergeAtlasWithTombstones(footOnly, clone(N1) as unknown as AtlasDocLike);
check(`base'siz birleşim: 50 (got ${totalCount(mu, "Böbrek")})`, totalCount(mu, "Böbrek") === 50);
check("base'siz birleşim: el 20", handCount(mu, "Böbrek") === 20);
// C4. Base'siz ters yön: sunucu el+ayak, yerel yalnız ayak (eski kopya) → el korunur.
const mu2 = mergeAtlasWithTombstones(clone(N1) as unknown as AtlasDocLike, footOnly);
check("base'siz (yerel eski): el 20 korunur", handCount(mu2, "Böbrek") === 20 && totalCount(mu2, "Böbrek") === 50);
// C5. Birleşim çıktısı normalize'dan sonra da kayıpsız.
check("birleşim → normalize: 50/20", totalCount(normalizeAtlasDocument(clone(mu)) as unknown as AtlasDocLike, "Böbrek") === 50 &&
  handCount(normalizeAtlasDocument(clone(mu)) as unknown as AtlasDocLike, "Böbrek") === 20);

/* ─── D. Eski istemci PUT (sunucu koruması) ─────────────────────────────────── */
// Eski istemci normalize'ı el anahtarlarını HİÇ yazmaz: o çıktıyı birebir taklit et.
function oldClientStrip(doc: AtlasDocLike): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === "_meta") { out[k] = v; continue; }
    const e = v as Record<string, unknown>;
    out[k] = { taban: e.taban, yan_ic: e.yan_ic, yan_dis: e.yan_dis };
  }
  return out;
}
const serverCur = clone(N1) as unknown as AtlasDocLike;
// Eski istemci ayağa bir bölge ekleyip PUT eder (el anahtarları yok).
const oldEdited = mergeDraftIntoAtlas(clone(N1), [makeRegion("rect", "Böbrek", "right", "yan_dis", 93)], []) as unknown as AtlasDocLike;
const oldPut = oldClientStrip(oldEdited);
check("eski istemci gövdesinde el anahtarı yok (taklit doğru)", !("el_avuc" in (oldPut.Böbrek as object)));
const carried = carryOverHandBuckets(serverCur, oldPut) as AtlasDocLike;
check(`eski PUT: el 20 korunur (got ${handCount(carried, "Böbrek")})`, handCount(carried, "Böbrek") === 20);
check(`eski PUT: yeni ayak bölgesi de var (31 ayak) (got ${totalCount(carried, "Böbrek") - handCount(carried, "Böbrek")})`,
  totalCount(carried, "Böbrek") - handCount(carried, "Böbrek") === 31);
check("eski PUT: el bölge içerikleri birebir", JSON.stringify(regionIdsByView(carried, "Böbrek").el_avuc) === JSON.stringify(regionIdsByView(serverCur, "Böbrek").el_avuc));
check("carry SAF: girdi değişmedi", !("el_avuc" in (oldPut.Böbrek as object)));
// Yeni istemci el'i bilinçli boşaltır (anahtar VAR, dizi boş) → sunucu DİRİLTMEZ.
const newCleared = clone(N1) as unknown as AtlasDocLike;
(newCleared.Böbrek as Record<string, unknown>).el_avuc = { sol: [], sag: [] };
(newCleared.Böbrek as Record<string, unknown>).el_sirt = { sol: [], sag: [] };
const carried2 = carryOverHandBuckets(serverCur, newCleared) as AtlasDocLike;
check("yeni istemci bilinçli silme: el 0 (diriltme YOK)", handCount(carried2, "Böbrek") === 0);
const newDoc = clone(N1) as unknown as Record<string, unknown>;
check("yeni istemci belgesi aynı nesne (no-op)", carryOverHandBuckets(serverCur, newDoc) === newDoc);
// Organ tamamen düşmüş (mezar taşı akışı) → dokunulmaz.
const dropped: Record<string, unknown> = { _meta: { version: "1", updated_at: "T", tombstones: { böbrek: "2026-10-10T00:00:00.000Z" } } };
check("organ düşmüşse diriltilmez", !("Böbrek" in carryOverHandBuckets(serverCur, dropped)));
// Sunucu boşken (ilk kayıt) → no-op.
check("sunucu belgesi yok → no-op", carryOverHandBuckets(null, oldPut) === oldPut);
// Karar katmanı (CAS / shrink) değişmedi: el carry sonrası update kararı.
const dec = decideAtlasPut({ current: { updated_at: "U1", document: serverCur, organ_list: ["Böbrek"] }, expected: "U1", incomingDocument: carried, incomingOrganList: ["Böbrek"], allowEmpty: false });
check("decideAtlasPut: update", dec.kind === "update");

/* ─── E. Taslak → atlas bucket yerleşimi ───────────────────────────────────── */
const handPoint = makeRegion("point", "Mide", "left", "el_sirt", 7);
const E1 = mergeDraftIntoAtlas(clone(EMPTY), [handPoint], []);
const eIds = regionIdsByView(E1 as AtlasDocLike, "Mide");
check("point el_sirt/sol bucket'ına yazıldı", eIds.el_sirt?.join() === handPoint.id && (E1 as unknown as Record<string, Record<string, { sol: unknown[] }>>).Mide.el_sirt.sol.length === 1);
check("point başka bucket'a sızmadı", Object.entries(eIds).filter(([v]) => v !== "el_sirt").every(([, l]) => l.length === 0));
const stored = (E1 as unknown as Record<string, Record<string, { sol: Record<string, unknown>[] }>>).Mide.el_sirt.sol[0];
check("point kaydı minimum alan (id/shape/cx/cy/color)",
  JSON.stringify(Object.keys(JSON.parse(JSON.stringify(stored))).sort()) === JSON.stringify(["color", "cx", "cy", "id", "shape"]));

/* ─── F. Protokol çözümü + Word ────────────────────────────────────────────── */
const R = resolveProtocolAtlas(N1, ["Böbrek"]);
check("protokol: el_avuc 10 / el_sirt 10", R.regionsByGroup.el_avuc.length === 10 && R.regionsByGroup.el_sirt.length === 10);
check("protokol: ayak grupları 10/10/10 (regresyon yok)", R.regionsByGroup.taban.length === 10 && R.regionsByGroup.yan_ic.length === 10 && R.regionsByGroup.yan_dis.length === 10);
check("protokol: organ groups 5 görünüm", R.organs[0].groups.join(",") === ALL_FOOT_VIEWS.join(","));
check("protokol: el bölgesi kendi grubunda", R.regionsByGroup.el_avuc.every((r) => r.view === "el_avuc" && r.group === "el_avuc"));
const ptRender = R.regionsByGroup.el_avuc.find((r) => r.shape === "point") as RenderRegion;
const svg = regionToSvg(ptRender, 1448, 1086, 1);
check("Word SVG: point → circle", svg.startsWith("<circle") && svg.includes('stroke="#ffffff"'));
check("Word SVG: point merkez doğru", svg.includes(`cx="${(ptRender.cx! * 1448).toFixed(2)}"`) && svg.includes(`cy="${(ptRender.cy! * 1086).toFixed(2)}"`));

(async () => {
  for (const g of HAND_VIEWS) {
    const { png, width, height } = await renderAtlasGroupPng(g, R.regionsByGroup[g]);
    check(`${g} PNG üretildi (${width}x${height})`, png.length > 10_000 && png[0] === 0x89 && png[1] === 0x50);
    check(`${g} PNG oranı el görseliyle aynı (4:3)`, Math.abs(width / height - 1448 / 1086) < 0.01);
  }
  const children = await buildSingleReport(
    { index: 0, title: "El Testi", description: null, notes: null, organs: ["Böbrek"], createdAt: "2026-10-10T00:00:00.000Z", resolved: R },
    "10.10.2026",
  );
  const doc = new Document({ sections: [{ properties: { titlePage: true }, headers: reflexologyHeaders(), footers: reflexologyFooters(), children }] });
  const buf = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  const media = Object.keys(zip.files).filter((f) => /^word\/media\/.+\.png$/i.test(f));
  check("DOCX: 'Avuç İçi' harita başlığı", xml.includes("Refleksoloji Uygulama Haritası — Avuç İçi"));
  check("DOCX: 'El Sırtı' harita başlığı", xml.includes("Refleksoloji Uygulama Haritası — El Sırtı"));
  check("DOCX: ayak başlıkları korunur", xml.includes("— Taban") && xml.includes("— Yan İç") && xml.includes("— Yan Dış"));
  check(`DOCX: 5 harita görseli (got ${media.length})`, media.length === 5);
  check("DOCX: Kullanılan Görünümler el dahil", xml.includes("Avuç İçi, El Sırtı"));

  // Ayak-only protokol → el bölümü YOK (mevcut raporlar değişmez).
  const footOnlyResolved = resolveProtocolAtlas(normalizeAtlasDocument(clone(footOnly)), ["Böbrek"]);
  const fc = await buildSingleReport(
    { index: 0, title: "Ayak", description: null, notes: null, organs: ["Böbrek"], createdAt: "2026-10-10T00:00:00.000Z", resolved: footOnlyResolved },
    "10.10.2026",
  );
  const fbuf = await Packer.toBuffer(new Document({ sections: [{ properties: { titlePage: true }, children: fc }] }));
  const fxml = await (await JSZip.loadAsync(fbuf)).file("word/document.xml")!.async("string");
  check("ayak-only DOCX: el başlığı YOK", !fxml.includes("Avuç İçi") && !fxml.includes("El Sırtı"));

  /* ─── G. Kayıtlı Atlas özetleri ─────────────────────────────────────────── */
  const sAll = buildOrganSummary(N1, "Böbrek");
  check("özet: görünüm 'Taban · Yan · El'", sAll.viewLabel === "Taban · Yan · El");
  check("özet: ayak 'Her iki ayak', el 'Her iki el'", sAll.footLabel === "Her iki ayak" && sAll.handLabel === "Her iki el");
  const sHand = buildOrganSummary(E1, "Mide");
  check("özet: yalnız el → ayak '—', el 'Sol el'", sHand.footLabel === "—" && sHand.handLabel === "Sol el" && sHand.viewLabel === "El");
  const sFoot = buildOrganSummary(normalizeAtlasDocument(clone(footOnly)), "Böbrek");
  check("özet: ayak-only → el satırı yok (null), etiket aynen", sFoot.handLabel === null && sFoot.viewLabel === "Taban · Yan");
  check("etiket: el görünümü/taraf/şekil", viewLabel("el_avuc") === "Avuç İçi" && viewLabel("el_sirt") === "El Sırtı" &&
    footSideLabel("left", "el_avuc") === "Sol el" && footSideLabel("right") === "Sağ ayak" && shapeLabel("point") === "Nokta");

  /* ─── H. Sunucu doğrulama ───────────────────────────────────────────────── */
  const body = JSON.stringify({ document: N1, organ_list: ["Böbrek"] });
  check("validateAtlasPayload: el + point kabul", validateAtlasPayload({ document: N1, organList: ["Böbrek"], bodyBytes: body.length }) === null);
  const bad = clone(N1) as unknown as Record<string, Record<string, { sol: unknown[] }>>;
  bad.Böbrek.el_avuc.sol.push({ id: "x", shape: "point", cx: "a", cy: 0.1 });
  check("validateAtlasPayload: bozuk point reddedilir", validateAtlasPayload({ document: bad, organList: [], bodyBytes: 10 }) !== null);

  /* ─── I. Nokta boyutu ───────────────────────────────────────────────────── */
  check("boyut: varsayılan Orta = önceki sabit çap", DEFAULT_POINT_SIZE === "md" && pointDiameterPx(undefined) === POINT_RENDER_DIAMETER_PX);
  check("boyut: bilinmeyen değer → Orta", resolvePointSize("dev") === "md" && resolvePointSize(42) === "md" && resolvePointSize(null) === "md");
  const diam = POINT_SIZES.map((sz) => pointDiameterPx(sz));
  check(`boyut: 4 kademe artan çap (${diam.join("/")})`, diam.length === 4 && diam.every((d, i) => i === 0 || d > diam[i - 1]));
  const sized = POINT_SIZES.map((sz, i) => ({ ...makeRegion("point", "Mide", "right", "taban", 100 + i), pointSize: sz }));
  const I1 = mergeDraftIntoAtlas(clone(EMPTY), sized, []);
  const back = getRegionsForOrgan(I1, "Mide").filter((r) => r.shape === "point");
  check("boyut: kayıt → okuma 4/4 korunur", POINT_SIZES.every((sz, i) => back.find((r) => r.id === sized[i].id)?.pointSize === sz));
  const I2 = normalizeAtlasDocument(JSON.parse(JSON.stringify(I1)));
  check("boyut: JSON + normalize sonrası korunur", POINT_SIZES.every((sz, i) => getRegionsForOrgan(I2, "Mide").find((r) => r.id === sized[i].id)?.pointSize === sz));
  const legacyPoint = getRegionsForOrgan(E1, "Mide").find((r) => r.id === handPoint.id);
  check("boyut: boyutsuz eski nokta → Orta açılır", legacyPoint?.pointSize === "md");
  const nonPoint = getRegionsForOrgan(N1, "Böbrek").filter((r) => r.shape !== "point");
  check("boyut: oval/kare/çizgi bölgelerine boyut eklenmez", nonPoint.length > 0 && nonPoint.every((r) => r.pointSize === undefined));
  const IR = resolveProtocolAtlas(I1, ["Mide"]);
  const radius = (sz: string) => {
    const rr = IR.regionsByGroup.taban.find((r) => r.pointSize === sz) as RenderRegion;
    return Number(/ r="([0-9.]+)"/.exec(regionToSvg(rr, 1448, 1086, 1))?.[1]);
  };
  const radii = POINT_SIZES.map(radius);
  check(`Word SVG: boyuta göre artan yarıçap (${radii.join("/")})`, radii.every((r, i) => Number.isFinite(r) && (i === 0 || r > radii[i - 1])));
  const legacySvg = regionToSvg({ ...ptRender, pointSize: undefined }, 1448, 1086, 1);
  check("Word SVG: Orta = eski nokta çıktısı (bayt-eşit)", regionToSvg({ ...ptRender, pointSize: "md" }, 1448, 1086, 1) === legacySvg && svg === legacySvg);

  console.log(`\n──────── SONUÇ: ${pass} PASS / ${fail} FAIL ────────`);
  if (fail > 0) {
    console.log("Başarısız:");
    for (const f of fails) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("Fixture: 50 bölge · 5 görünüm × 5 şekil × sol+sağ");
  console.log("✅ EL YÜZEYLERİ + NOKTA — ALL PASS (0 el bölgesi kaybı)");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
