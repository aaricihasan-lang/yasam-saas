/**
 * P34 — HD İlişki / Grup (Connection + Penta) Word raporu + gömülü PNG — TR golden + EN çıktı denetimi (I18N-F1-R5 HD-B).
 *
 * SIRA (rapor sözleşmesi): golden, üretici dosyaları DEĞİŞMEDEN ÖNCE taban SHA'da `--write-golden` ile yazıldı (ayrı commit).
 * Sonra her koşuda:
 *   G  TR parametresiz + açık TR (`output = tr`) → normalize parça SHA'ları golden ile BAYT-EŞİT; PNG SHA'ları eşit.
 *   E  EN: belge metninde (document + header + footer) Türkçe SİSTEM metni 0 (Türkçe harf + ASCII-katlanmış TR sözcük
 *      listesi; kullanıcı nöbetçileri ⟦…⟧ hariç), nöbetçiler aynen, sayılar TR = EN, `w:lang` yalnız EN (TR'de yok),
 *      dosya adı EN, B5: kayıtlı TR `*Localized` metni EN'de KULLANILMAZ (İngilizce `name`/`gateName`).
 *   P  EN PNG: sahnede Türkçe merkez/bant/sonek yok; TR PNG golden ile aynı.
 * Gerçek DB / Roxy / ağ YOK (sahte sağlayıcı yanıtları, motor ile üretilmiş kişi kapıları).
 *
 * Çalıştır: npx tsx scripts/hd-i18n/reports-golden-p34.harness.ts [--write-golden] [--out <dizin>]
 */
import Module from "node:module";
import path from "node:path";
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import JSZip from "jszip";
import { docxParts, digest, sha, textNodes } from "./reports-golden/normalize";
import { engineChart, fakeConnectionResponse, fakePentaResponse, PEOPLE } from "../hd-relations/fakeRelationRoxy";
import { validateRoxyConnection, type HdConnectionResult } from "../../lib/human-design/relations/connection";
import { validateRoxyPenta, type HdPentaResult } from "../../lib/human-design/relations/penta";
import { participantChartFacts, type RelationAnalysisView } from "../../lib/human-design/relations/relationService";
import { connectionExplanations, pentaExplanations } from "../../lib/human-design/relations/explanations";
import { CONNECTION_IMAGE_RESULT_ONLY_NOTE, RELATION_REPORT_SCHEMA, type RelationReportSnapshot } from "../../lib/human-design/relations/relationExtras";
import * as relationReport from "../../lib/human-design/relations/relationReport";
import { outputLocaleFor } from "../../lib/i18n/output";

const GOLDEN = path.join(process.cwd(), "scripts", "hd-i18n", "golden", "p34-tr.golden.json");
const args = process.argv.slice(2);
const WRITE = args.includes("--write-golden");
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ FAIL: ${name}${detail !== undefined ? ` ${JSON.stringify(detail).slice(0, 600)}` : ""}`); }
}

// ── Fikstürler (SENTETİK; kullanıcı içeriği ⟦…⟧ nöbetçisi) ─────────────────────────────────────────────
const N = ["⟦Ayşe Yılmaz⟧", "⟦Mehmet Kaya⟧", "⟦Zeynep Demir⟧", "⟦Ali Çelik⟧", "⟦Elif Şahin⟧", "⟦Can Öztürk⟧"];
const GEN = "2026-11-25T09:00:00.000Z";
const CREATED = "2026-11-20T10:00:00.000Z";
const gatesOf = (i: number) => participantChartFacts(engineChart(PEOPLE[i]))!.gates;

function connResult(lang: "tr" | "en"): HdConnectionResult {
  const v = validateRoxyConnection(fakeConnectionResponse(PEOPLE[0], PEOPLE[1], { lang }));
  if (!v.ok) throw new Error("connection fikstürü");
  return v.value;
}
function pentaResult(members: number[], localized: boolean): HdPentaResult {
  const raw = fakePentaResponse(members.map((i) => PEOPLE[i])) as Record<string, unknown>;
  if (localized) {
    // B5: TR kayıtlı yanıt — sağlayıcı yerel adları dolu (EN raporda KULLANILMAMALI).
    for (const g of raw.gates as Array<Record<string, unknown>>) g.gateNameLocalized = `TRLOC Kapı ${g.gate} Şöhret`;
    for (const c of raw.channels as Array<Record<string, unknown>>) { c.nameLocalized = `TRLOC Kanal Ğ ${c.gateA}`; c.circuitLocalized = "TRLOC Kabile"; }
  }
  const v = validateRoxyPenta(raw, members.length);
  if (!v.ok) throw new Error("penta fikstürü");
  return v.value;
}
type P = RelationAnalysisView["participants"][number];
const part = (i: number, pos: number, o: Partial<P> = {}): P => ({
  position: pos, clientId: `c-${i}`, name: N[i]!, sourceChartId: `h-${i}`, status: "current",
  birthDate: PEOPLE[i]!.date, birthTime: PEOPLE[i]!.time.slice(0, 5), birthPlace: `⟦Doğum Yeri ${i} İzmir⟧`, gates: gatesOf(i), ...o,
});

type Fx = { id: string; snapshot: RelationReportSnapshot; image: "scene" | "standard" | "none"; branding?: { title?: string; organization?: string; name?: string } };

function fixtures(): Fx[] {
  const cTr = connResult("tr");
  const cEn = connResult("en");
  const view = (kind: "connection" | "penta", participants: P[], result: HdConnectionResult | HdPentaResult, relationType: RelationAnalysisView["relationType"]): RelationAnalysisView => ({
    id: `a-${kind}-${participants.length}`, kind, memberCount: participants.length, relationType, createdAt: CREATED, participants, result,
  });
  const snap = (a: RelationAnalysisView, o: Partial<RelationReportSnapshot> = {}): RelationReportSnapshot => ({
    schema: RELATION_REPORT_SCHEMA, generatedAt: GEN, analysis: a,
    sections: { analysis: null, knowledge: null, expertComment: null }, preparedBy: null,
    image: { status: "ok", reason: null, source: "scene" }, ...o,
  });
  const kb = (kind: "connection" | "penta", names: string[]) => [
    ...(kind === "connection"
      ? [{ key: "channels", title: "Birleşik haritadaki kanallar — genel kanal kayıtlarınız", scope: "general" as const, entries: [{ id: "k1", category: "Kanallar", title: "⟦Kanal notum Ş⟧", code: "kanal_1_8", content: "⟦Uzman Bilgi Bankası içeriği: ğüşiöç.⟧" }] }]
      : [
          { key: "penta-channels", title: "Tanımlı Penta kanalları — genel kanal kayıtlarınız", scope: "general" as const, entries: [{ id: "k2", category: "Kanallar", title: "⟦Penta kanal kaydı⟧", code: "kanal_2_14", content: "⟦İçerik Ğ⟧" }] },
          { key: "penta-gates", title: "Penta kapıları — genel kapı kayıtlarınız", scope: "general" as const, entries: [{ id: "k3", category: "Kapılar", title: "⟦Kapı kaydı⟧", code: "kapi_2", content: "⟦Kapı içeriği ç⟧" }] },
        ]),
    { key: "person-0", title: `${names[0]} — bireysel kayıtlarınız`, scope: "individual" as const, person: names[0], entries: [{ id: "k4", category: "Tipler", title: "⟦Tip kaydı İ⟧", code: "tip_generator", content: "⟦Bireysel içerik ö⟧" }] },
  ];
  const conn = view("connection", [part(0, 0), part(1, 1, { status: "birth_data_changed" })], cTr, "mother_child");
  const connOnly = view("connection", [part(0, 0, { gates: null, status: "source_chart_deleted" }), part(1, 1, { gates: null, status: "client_deleted", birthTime: null, birthPlace: null })], cTr, null);
  const connEn = view("connection", [part(0, 0), part(1, 1)], cEn, "partner");
  const penta = view("penta", [part(2, 0), part(3, 1), part(4, 2), part(5, 3)], pentaResult([2, 3, 4, 5], false), "team");
  const pentaLoc = view("penta", [part(2, 0), part(3, 1), part(4, 2)], pentaResult([2, 3, 4], true), "family");
  const names = (a: RelationAnalysisView) => a.participants.map((p) => p.name);
  return [
    { id: "conn-full", image: "scene", branding: { title: "⟦Unvan Şifacı⟧", organization: "⟦Kurum Ğ Merkezi⟧" }, snapshot: snap(conn, {
      sections: { analysis: connectionExplanations(cTr, N[0]!, N[1]!), knowledge: kb("connection", names(conn)), expertComment: "⟦Uzman yorumu: çok güçlü bir bağ.⟧\n\n⟦İkinci paragraf ı.⟧" },
      preparedBy: "⟦Dr. Şule Öz⟧",
    }) },
    { id: "conn-result-only", image: "scene", snapshot: snap(connOnly, { image: { status: "ok", reason: CONNECTION_IMAGE_RESULT_ONLY_NOTE, source: "scene" } }) },
    { id: "conn-en-provider", image: "scene", snapshot: snap(connEn, { sections: { analysis: connectionExplanations(cEn, N[0]!, N[1]!), knowledge: null, expertComment: null } }) },
    { id: "conn-legacy-standard", image: "standard", snapshot: snap(conn, { image: { status: "ok", reason: null, source: "standard", png: "" } }) },
    { id: "conn-no-image", image: "none", snapshot: snap(conn, { image: { status: "unavailable", reason: null } }) },
    { id: "penta-4", image: "scene", snapshot: snap(penta, {
      sections: { analysis: pentaExplanations(penta.result as HdPentaResult, names(penta)), knowledge: kb("penta", names(penta)), expertComment: "⟦Grup yorumu ş⟧" },
      preparedBy: "⟦Hazırlayan Ö⟧",
    }) },
    { id: "penta-3-localized", image: "scene", snapshot: snap(pentaLoc, { sections: { analysis: pentaExplanations(pentaLoc.result as HdPentaResult, names(pentaLoc)), knowledge: null, expertComment: null } }) },
  ];
}

// ── Üretim ──────────────────────────────────────────────────────────────────────────────────────────────
type Out = ReturnType<typeof outputLocaleFor> | undefined;
// Taban (golden yazımı) imzası: renderRelationImage(a, w, logo) · renderRelationReportBuffer(s, opts) · relationReportFilename(a, gen).
// Çeviri sonrası: ek isteğe bağlı `output` (yoksa TR) — aynı çağrı tabanda da derlenir (fazla argüman `as never`).
async function produce(fx: Fx, logo: Buffer | null, output: Out) {
  const { renderRelationImage } = await import("../../lib/human-design/relations/relationImages");
  const img = renderRelationImage as unknown as (a: RelationAnalysisView, w: number, logo: Buffer | null, output?: Out) => { png: Buffer } | null;
  const a = fx.snapshot.analysis;
  const s: RelationReportSnapshot = JSON.parse(JSON.stringify(fx.snapshot));
  let png: Buffer | null = null;
  if (fx.image === "standard") {
    // Eski rapor: tarayıcıda donmuş PNG (dilden bağımsız; TR sahnesi ile üretilmiş sabit görsel).
    png = img(a, 600, null)?.png ?? null;
    s.image.png = png ? png.toString("base64") : "";
  } else if (fx.image === "scene") {
    png = (output ? img(a, 1100, logo, output) : img(a, 1100, logo))?.png ?? null;
  }
  const render = relationReport.renderRelationReportBuffer as unknown as (s: RelationReportSnapshot, o: Record<string, unknown>) => Promise<Buffer>;
  const opts: Record<string, unknown> = { image: png, logo, branding: fx.branding ?? null };
  if (output) opts.output = output;
  const buf = await render(s, opts);
  const fname = (relationReport.relationReportFilename as unknown as (a: RelationAnalysisView, g: string, o?: Out) => string)(a, s.generatedAt, output);
  return { buf, png, fname };
}

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
// ASCII-katlanmış Türkçe sistem sözcükleri (Türkçe harfsiz yazılmış olsa bile yakalanır).
const TR_WORDS = /\b(Iliski|İlişki|Grup|Kisi|Kişi|Dogum|Saat|Yeri|Kanal|Kanallar|Merkez|Merkezler|Tanimli|Tanımlı|degil|Hicbiri|Hiçbiri|Her ikisi|Yarim|Birlesik|Kapi|Kapilar|Bosluk|Dolu|Uye|Uzman|Yorumu|Hazirlayan|Unvan|Kurum|Analiz|Aciklama|Bilgi Bankam|Sayfa|Gorsel|Devre|Ust|Alt Penta|cekirdek|Ozet|Ozeti|Baglanti|turu|tarihi|Rapor|ve|yok|Yok|Elektromanyetik|Baskinlik|Uzlasma|Arkadaslik|Bireysel|Kolektif|Kabile|Sevgili|Anne|Cocuk|Ekip|TRLOC)\b/;
const stripUser = (s: string) => s.replace(/⟦[^⟧]*⟧/g, " ").replace(/Yaşam Sistemi|yasamsistemi\.com/g, " ");

async function allText(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n)).sort();
  const xmls = await Promise.all(names.map((n) => zip.files[n]!.async("string")));
  return { xmls, text: xmls.flatMap((x) => textNodes(x)).join("\n") };
}

async function main() {
  const { loadHdReportLogo } = await import("../../lib/human-design/reporting/reportBrandAssets");
  const logo = await loadHdReportLogo();
  const fxs = fixtures();
  const golden: Record<string, { digest: string; parts: Record<string, string>; png: string | null; fname: string }> = {};
  for (const fx of fxs) {
    const tr = await produce(fx, logo, undefined);
    const p = await docxParts(tr.buf);
    golden[fx.id] = { digest: digest(p.parts), parts: p.parts, png: tr.png ? sha(tr.png) : null, fname: tr.fname };
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(path.join(OUT, `${fx.id}-tr.docx`), tr.buf);
      if (tr.png) writeFileSync(path.join(OUT, `${fx.id}-tr.png`), tr.png);
    }
  }
  if (WRITE) {
    mkdirSync(path.dirname(GOLDEN), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + "\n");
    console.log(`golden yazıldı: ${GOLDEN} (${fxs.length} fikstür)`);
    return;
  }
  if (!existsSync(GOLDEN)) throw new Error("golden yok — önce --write-golden");
  const G = JSON.parse(readFileSync(GOLDEN, "utf8")) as typeof golden;

  console.log("\n[G — TR bayt-eşit (parametresiz + açık TR)]");
  const trOut = outputLocaleFor("tr");
  for (const fx of fxs) {
    const g = G[fx.id]!;
    const cur = golden[fx.id]!;
    const diff = Object.keys({ ...g.parts, ...cur.parts }).filter((k) => g.parts[k] !== cur.parts[k]);
    ok(`G ${fx.id} parametresiz TR digest = golden`, cur.digest === g.digest, diff);
    ok(`G ${fx.id} parametresiz TR PNG = golden`, cur.png === g.png);
    ok(`G ${fx.id} parametresiz TR dosya adı = golden`, cur.fname === g.fname, cur.fname);
    const ex = await produce(fx, logo, trOut);
    const pe = await docxParts(ex.buf);
    ok(`G ${fx.id} açık TR digest = golden`, digest(pe.parts) === g.digest, Object.keys(g.parts).filter((k) => g.parts[k] !== pe.parts[k]));
    ok(`G ${fx.id} açık TR PNG = golden`, (ex.png ? sha(ex.png) : null) === g.png);
    ok(`G ${fx.id} açık TR dosya adı = golden`, ex.fname === g.fname);
    const trx = await allText(ex.buf);
    ok(`G ${fx.id} TR belgede w:lang YOK`, !trx.xmls.some((x) => /w:lang/.test(x)) && !(await docxParts(ex.buf)).xml["word/styles.xml"]?.includes("w:lang w:val=\"en"));
  }

  console.log("\n[E — EN çıktı]");
  const en = outputLocaleFor("en");
  for (const fx of fxs) {
    const trBuf = (await produce(fx, logo, undefined)).buf;
    const e = await produce(fx, logo, en);
    if (OUT) {
      writeFileSync(path.join(OUT, `${fx.id}-en.docx`), e.buf);
      if (e.png) writeFileSync(path.join(OUT, `${fx.id}-en.png`), e.png);
    }
    const ex = await allText(e.buf);
    const trx = await allText(trBuf);
    const leaks = ex.text.split("\n").map(stripUser).filter((l) => TR_CHARS.test(l) || TR_WORDS.test(l));
    ok(`E ${fx.id} Türkçe sistem metni 0 (harf + ASCII-katlanmış)`, leaks.length === 0, leaks.slice(0, 12));
    const sentinels = (t: string) => (t.match(/⟦[^⟧]*⟧/g) ?? []).sort();
    ok(`E ${fx.id} kullanıcı nöbetçileri aynen (TR = EN)`, JSON.stringify(sentinels(ex.text)) === JSON.stringify(sentinels(trx.text)), { tr: sentinels(trx.text).length, en: sentinels(ex.text).length });
    const nums = (t: string) => (stripUser(t).match(/\d+/g) ?? []).filter((n) => !/^(2026|20|25|11)$/.test(n)).sort();
    ok(`E ${fx.id} sayılar TR = EN (kanal/kapı/sayı)`, JSON.stringify(nums(ex.text)) === JSON.stringify(nums(trx.text)));
    const styles = (await docxParts(e.buf)).xml["word/styles.xml"] ?? "";
    ok(`E ${fx.id} w:lang = en-GB`, /<w:lang w:val="en-GB"/.test(styles));
    ok(`E ${fx.id} dosya adı EN (HD-Relationship / HD-Group-Penta)`, /^HD-(Relationship|Group-Penta)-[A-Za-z0-9-]+-2026-11-25\.docx$/.test(e.fname) && e.fname !== G[fx.id]!.fname, e.fname);
    ok(`E ${fx.id} B5: kayıtlı TR *Localized metni EN'de yok`, !/TRLOC/.test(ex.text));
    if (fx.image === "scene" && e.png) ok(`E ${fx.id} EN PNG TR PNG'den farklı (etiketler EN)`, sha(e.png) !== G[fx.id]!.png);
    if (fx.image === "standard") ok(`E ${fx.id} eski donmuş PNG aynen gömülü (TR = EN medya)`, JSON.stringify(Object.entries((await docxParts(e.buf)).parts).filter(([k]) => k.startsWith("word/media/")).map(([, v]) => v).sort()) === JSON.stringify(Object.entries(G[fx.id]!.parts).filter(([k]) => k.startsWith("word/media/")).map(([, v]) => v).sort()));
  }

  console.log("\n[P — EN sahne metni]");
  const { renderRelationImageSvg } = (await import("../../lib/human-design/relations/relationImages")) as unknown as { renderRelationImageSvg?: (a: RelationAnalysisView, logo: Buffer | null, output?: Out) => string | null };
  for (const fx of fxs.filter((f) => f.image === "scene")) {
    const svgEn = renderRelationImageSvg?.(fx.snapshot.analysis, null, en) ?? "";
    const texts = [...svgEn.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);
    ok(`P ${fx.id} EN SVG metinlerinde Türkçe yok`, texts.length > 0 && texts.every((t) => !TR_CHARS.test(t) && !TR_WORDS.test(t) && !/BAŞ|BOĞAZ|KÖK|DALAK|KALP|SAKRAL MERKEZ|PLEKSUS|MERKEZİ|ÇEKİRDEK|boşluk/.test(t)), texts.filter((t) => TR_CHARS.test(t) || /MERKEZ|DALAK|KALP|KÖK|SAKRAL|PLEKSUS|boşluk/.test(t)).slice(0, 10));
  }

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL:", fails.join(" | ")); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
