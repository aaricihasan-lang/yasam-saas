/**
 * I18N-F1-R5 HD-B — P31 HD profesyonel Word (v1 hd-report-1 + v2 eski düzen + v2 "pro-1") GOLDEN harness'ı.
 *
 * DB / ağ / Roxy YOK. Sentetik snapshot'lar (repodaki kayıtlı Roxy fikstürü normalize edilir, yeni çağrı yok);
 * kullanıcı içeriği ⟦…⟧ nöbetçileriyle işaretlidir (danışan adı, doğum yeri, hazırlayan, Bilgi Bankası başlık/metin,
 * kişisel kanal/kapı adı).
 *
 *   --write-golden  → TR golden'ı (normalize parça SHA) yazar. YALNIZ üretici değişikliğinden ÖNCE (taban) kullanılır.
 *   (varsayılan)    → TR: parametresiz + açık TR çıktı golden ile BAYT-EŞİT; EN kontrolleri (üretici dil desteği varsa).
 *   --out <klasör>  → TR/EN DOCX örneklerini yazar (Word render / görsel kontrol için).
 *
 * Çalıştır: npx tsx scripts/hd-i18n/reports-golden-p31.harness.ts [--write-golden] [--out <klasör>]
 */
import Module from "node:module";
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
globalThis.fetch = (async () => {
  throw new Error("harness: ağ çağrısı yasak");
}) as typeof fetch;

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write-golden");
const OUT = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : null;
const GOLDEN = path.join(ROOT, "scripts", "hd-i18n", "golden", "p31-tr.golden.json");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Geçerli küçük PNG (RGB, düz renk) — BodyGraph yerine; içerik SHA'sı sabit. */
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function solidPng(w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const r = Buffer.alloc(1 + w * 3, 0xee);
    r[0] = 0;
    rows.push(r);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

type Fixture = { name: string; kind: "v1" | "v2"; snapshot: unknown; opts: Record<string, unknown> };

async function fixtures(): Promise<Fixture[]> {
  const { normalizeRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/normalize");
  const { validateRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/schema");
  const { extractSystemReading } = await import("../../lib/human-design/providers/roxy/systemReading");
  const V2 = await import("../../lib/human-design/reporting/reportSnapshotV2");
  const { buildExpertKnowledgeCodes } = await import("../../lib/human-design/normalize/hdAppCodes");
  const { buildPersonalKnowledgeStructure } = await import("../../lib/human-design/knowledge/personalKnowledge");
  const { buildReportSnapshot, freezeContent } = await import("../../lib/human-design/reporting/reportSnapshot");
  const { loadHdReportLogo } = await import("../../lib/human-design/reporting/reportBrandAssets");

  const RAW = JSON.parse(readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8")) as Record<string, unknown>;
  const v = validateRoxyBodygraph(RAW);
  if (!v.ok) throw new Error("fixture geçersiz");
  const n = normalizeRoxyBodygraph(v.value, {
    date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48,
    nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z",
  });
  if (!n.ok) throw new Error("normalize başarısız");
  const codes = buildExpertKnowledgeCodes(n.codes);
  const cat = (c: string) => (c.startsWith("tip_") ? "Tipler" : c.startsWith("profil_") ? "Profiller" : c.startsWith("otorite_") ? "Otoriteler"
    : c.startsWith("tanim_") ? "Tanımlar" : c.startsWith("merkez_") ? "Merkezler" : c.startsWith("kanal_") ? "Kanallar" : "Kapılar");
  const expertRecords = codes.slice(0, 7).map((code, i) => ({
    category: cat(code), title: `⟦KB başlık ${i + 1} ${code}⟧`, code,
    content: `⟦KB metni ${i + 1}: uzman yazdı — Şule ılık çay içti.⟧\n\n⟦ikinci paragraf ${i + 1}⟧`, is_active: true,
    expert_notes: "OZEL-NOT-ASLA-RAPORDA-OLMAMALI",
  }));
  const client = { name: "⟦Danışan Örnekoğlu⟧", birthDate: "2018-07-20", birthTime: "19:00:00", birthPlace: "⟦Selçuklu, Konya⟧", timezone: "Europe/Istanbul" };
  const defined = new Set(n.codes.active_centers);
  const centerStates: Record<string, "defined" | "undefined" | "open"> = {};
  for (const c of ["head", "ajna", "throat", "g_identity", "heart_ego", "spleen", "solar_plexus", "sacral", "root"]) {
    centerStates[c] = defined.has(c as never) ? "defined" : c === "head" || c === "root" ? "open" : "undefined";
  }
  const firstChannel = n.codes.channels[0];
  const firstGate = n.codes.gates[0];
  const nameOverrides = {
    gates: firstGate ? { [firstGate]: "⟦kişisel kapı adı⟧" } : {},
    channels: firstChannel ? { [firstChannel]: "⟦kişisel kanal adı⟧" } : {},
  };
  const reading = extractSystemReading(RAW);
  const img = solidPng(120, 160);
  const logo = await loadHdReportLogo();

  const build = (requested: "none" | "expert" | "system" | "both", extra: Record<string, unknown> = {}) =>
    V2.buildReportSnapshotV2({
      generatedAt: "2026-10-09T09:00:00.000Z", chartId: "ch-golden", source: "computed", provider: "roxyapi", client,
      codes: n.codes, computed: n.chart, requested, systemReadingPermitted: true, systemReading: reading,
      expertRecords: expertRecords as never, bodygraph: { status: "roxy_render" }, chartImage: null,
      ...extra,
    } as never) as unknown as Record<string, unknown>;

  const list: Fixture[] = [];
  // v2 pro-1 — her içerik seçimi
  list.push({ name: "v2-pro-both-hazirlayan", kind: "v2", snapshot: build("both", { preparedBy: "⟦Uzman Ayşe Örnek, HD Danışmanı⟧", centerStates, nameOverrides }), opts: { bodygraphImage: img, logo } });
  list.push({ name: "v2-pro-none", kind: "v2", snapshot: build("none", { preparedBy: null }), opts: { bodygraphImage: img, logo } });
  list.push({ name: "v2-pro-expert-gorselsiz", kind: "v2", snapshot: build("expert", { preparedBy: "⟦Hoca⟧", bodygraph: { status: "missing" } }), opts: { bodygraphImage: null, logo } });
  list.push({ name: "v2-pro-system-yuklenen", kind: "v2", snapshot: build("system", { bodygraph: { status: "uploaded_image" }, centerStates }), opts: { bodygraphImage: img, logo: null } });
  list.push({ name: "v2-pro-both-redakte", kind: "v2", snapshot: build("both", { preparedBy: "⟦Uzman⟧" }), opts: { bodygraphImage: img, logo, systemReadingRedacted: true } });
  // Manuel kayıt (aktivasyon yok, haç yok)
  list.push({ name: "v2-pro-manuel", kind: "v2", snapshot: build("expert", { source: "manual", computed: null, provider: null }), opts: { bodygraphImage: null, logo } });
  // Eski düzen (layout / termSet / preparedBy yok) — bugün kayıtlı eski raporlar
  const legacy = build("both", { centerStates });
  delete legacy.layout;
  delete legacy.termSet;
  delete legacy.preparedBy;
  list.push({ name: "v2-eski-both", kind: "v2", snapshot: legacy, opts: { bodygraphImage: img, logo, expertName: "⟦Eski Hazırlayan⟧" } });
  const legacyPlain = build("expert", { bodygraph: { status: "missing" } });
  delete legacyPlain.layout;
  delete legacyPlain.termSet;
  delete legacyPlain.preparedBy;
  list.push({ name: "v2-eski-expert-gorselsiz", kind: "v2", snapshot: legacyPlain, opts: { bodygraphImage: null, logo: null } });
  const legacyRed = build("both");
  delete legacyRed.layout;
  delete legacyRed.termSet;
  list.push({ name: "v2-eski-redakte", kind: "v2", snapshot: legacyRed, opts: { bodygraphImage: img, logo, systemReadingRedacted: true } });

  // v1 (hd-report-1) — kayıtlı eski raporlar
  const kindOf = (key: string) => (key.startsWith("tip_") ? "tip" : key.startsWith("otorite_") ? "otorite" : key.startsWith("kanal_") ? "kanal" : "kapi");
  const v1 = (chart: { type_code: string; authority_code: string; gates: number[] }, omitKey?: string) => {
    const st = buildPersonalKnowledgeStructure({ ...chart, channels: [] } as never);
    const rec = new Map<string, unknown>();
    for (const k of st.allKeys) {
      if (k === omitKey) {
        rec.set(k, null);
        continue;
      }
      const kind = kindOf(k);
      const c = freezeContent({
        general_description: `⟦genel ${k}⟧`, report_text: `⟦rapor metni ${k}⟧\n\n## ⟦alt başlık⟧\n\n- ⟦madde⟧`,
        strategy_text: kind === "tip" ? "⟦strateji⟧" : null, signature_text: kind === "tip" ? "⟦imza⟧" : null, not_self_text: kind === "tip" ? "⟦kendilik dışı⟧" : null,
        decision_mechanism: kind === "otorite" ? "⟦karar⟧" : null, application_text: kind === "otorite" ? "⟦uygulama⟧" : null, caution_notes: kind === "otorite" ? "⟦dikkat⟧" : null,
        general_theme: kind === "kapi" ? "⟦tema⟧" : null, full_channel_text: kind === "kanal" ? "⟦tam kanal⟧" : null, hanging_gate_context: kind === "kanal" ? `⟦asılı ${k}⟧` : null,
      } as never);
      rec.set(k, { meta: { contentId: `c_${k}`, entityId: `e_${k}`, entityKind: kind, canonicalKey: k, version: 1 }, content: c });
    }
    return buildReportSnapshot({
      generatedAt: "2026-08-23T10:00:00.000Z", readAt: "2026-08-23T10:00:00.000Z",
      client: { name: "⟦Ayşe Yılmaz⟧", birthDate: "1990-05-12", birthTime: "14:30", birthPlace: "⟦İstanbul⟧" },
      chart: { chartId: "vis", source: "manual" }, structure: st, recordByKey: rec as never,
    });
  };
  list.push({ name: "v1-kisa", kind: "v1", snapshot: v1({ type_code: "generator", authority_code: "sacral", gates: [26, 44, 5, 9] }), opts: { chartImage: img } });
  list.push({ name: "v1-uzun-eksik", kind: "v1", snapshot: v1({ type_code: "manifesting_generator", authority_code: "emotional", gates: [26, 44, 10, 20, 34, 57, 1, 2, 62, 56, 9] }, "kapi_57"), opts: { chartImage: null, expertName: "⟦Uzman Adı⟧" } });
  return list;
}

type Golden = Record<string, { digest: string; parts: Record<string, string> }>;

async function main() {
  const { docxParts, digest, textNodes } = await import("./reports-golden/normalize");
  const { renderHdReportV2Buffer } = await import("../../lib/human-design/reporting/wordReportV2");
  const { renderHdReportBuffer, hdReportFilename } = await import("../../lib/human-design/reporting/wordReport");
  const W1 = await import("../../lib/human-design/reporting/wordReport");
  const W2 = await import("../../lib/human-design/reporting/wordReportV2");
  const outputMod = await import("../../lib/i18n/output");
  const EN = outputMod.outputLocaleFor("en");
  const TR = outputMod.outputLocaleFor("tr");

  const list = await fixtures();
  const render = (f: Fixture, output?: unknown) =>
    f.kind === "v2"
      ? renderHdReportV2Buffer(f.snapshot as never, { ...(f.opts as object), ...(output !== undefined ? { output } : {}) } as never)
      : renderHdReportBuffer(f.snapshot as never, { ...(f.opts as object), ...(output !== undefined ? { output } : {}) } as never);

  if (WRITE) {
    const g: Golden = {};
    for (const f of list) {
      const p = await docxParts(await render(f));
      g[f.name] = { digest: digest(p.parts), parts: p.parts };
    }
    g["__filenames"] = { digest: [hdReportFilename("⟦Şule Çağ⟧", "2026-10-09"), hdReportFilename("", "2026-10-09"), W1.hdReportTitle("⟦Ad⟧"), W1.hdReportTitle("")].join("|"), parts: {} };
    mkdirSync(path.dirname(GOLDEN), { recursive: true });
    writeFileSync(GOLDEN, JSON.stringify(g, null, 2) + "\n");
    console.log(`golden yazıldı: ${GOLDEN} (${list.length} fikstür)`);
    return;
  }

  if (!existsSync(GOLDEN)) throw new Error("golden yok — önce tabanda --write-golden");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Golden;
  const langSupported = (W2 as Record<string, unknown>).HD_REPORT_OUTPUT_SUPPORTED === true;

  console.log("\n—— A. TR golden (parametresiz + açık TR) bayt-eşit");
  for (const f of list) {
    const p0 = await docxParts(await render(f));
    const diff0 = Object.keys({ ...p0.parts, ...golden[f.name]!.parts }).filter((k) => p0.parts[k] !== golden[f.name]!.parts[k]);
    ok(`${f.name}: parametresiz TR = golden`, digest(p0.parts) === golden[f.name]!.digest, diff0.join(","));
    if (langSupported) {
      const p1 = await docxParts(await render(f, TR));
      ok(`${f.name}: açık TR = golden`, digest(p1.parts) === golden[f.name]!.digest);
      const p2 = await docxParts(await render(f, null));
      ok(`${f.name}: output=null = golden`, digest(p2.parts) === golden[f.name]!.digest);
    }
  }
  const fn = [hdReportFilename("⟦Şule Çağ⟧", "2026-10-09"), hdReportFilename("", "2026-10-09"), W1.hdReportTitle("⟦Ad⟧"), W1.hdReportTitle("")].join("|");
  ok("dosya adı / başlık TR = golden", fn === golden["__filenames"]!.digest, fn);
  if (!langSupported) {
    console.log("\n(üretici henüz dil desteği taşımıyor — EN bölümü atlandı)");
  } else {
    console.log("\n—— B. EN: Türkçe sistem metni 0, nöbetçiler aynen, w:lang yalnız EN, sayılar TR=EN");
    const TR_CHARS = /[çğıöşüÇĞİÖŞÜâÂ]/;
    // ASCII-katlanmış Türkçe sistem sözcükleri (ör. "Danisan", "Kapi") — EN çıktıda olmamalı.
    const ASCII_TR = /\b(Danisan|Danışan|Kapi|Kapı|Merkez|Kanal|Tanimli|Tanımlı|Acik|Gezegen|Rapor|Hazirlayan|Dogum|Cizgi|Sayfa|Bilgilendirme|Tip|Otorite|Profil)\b/;
    for (const f of list) {
      const tr = await docxParts(await render(f, TR));
      const en = await docxParts(await render(f, EN));
      const strip = (s: string) => s.replace(/⟦[^⟧]*⟧/g, "");
      const enTexts: string[] = [];
      for (const [k, x] of Object.entries(en.xml)) if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(k)) enTexts.push(...textNodes(x));
      const trTexts: string[] = [];
      for (const [k, x] of Object.entries(tr.xml)) if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(k)) trTexts.push(...textNodes(x));
      const enJoined = enTexts.join("\n");
      const allowed = (f.snapshot as Record<string, unknown>) && allowedProviderTr(f);
      // İzinli marka metni düğümden ÇIKARILIR (düğümün geri kalanı yine denetlenir).
      const clean = (x: string) => allowed.reduce((acc, a) => acc.split(a).join(""), strip(x));
      const leaks = enTexts.map(clean).filter((x) => TR_CHARS.test(x));
      const asciiLeaks = enTexts.map(clean).filter((x) => ASCII_TR.test(x));
      ok(`${f.name}: EN Türkçe harfli sistem metni 0`, leaks.length === 0, leaks.slice(0, 6).join(" ‖ "));
      ok(`${f.name}: EN ASCII-katlanmış Türkçe sistem sözcüğü 0`, asciiLeaks.length === 0, asciiLeaks.slice(0, 6).join(" ‖ "));
      const sentTr = trTexts.join("\n").match(/⟦[^⟧]*⟧/g) ?? [];
      const sentEn = enJoined.match(/⟦[^⟧]*⟧/g) ?? [];
      ok(`${f.name}: kullanıcı nöbetçileri aynen (${sentTr.length})`, JSON.stringify([...sentTr].sort()) === JSON.stringify([...sentEn].sort()));
      const nums = (arr: string[]) => arr.join(" ").replace(/⟦[^⟧]*⟧/g, "").match(/\b\d+\.\d\b|\b\d{1,2}–\d{1,2}\b/g) ?? [];
      ok(`${f.name}: kapı.çizgi / kanal sayıları TR=EN`, JSON.stringify(nums(trTexts).sort()) === JSON.stringify(nums(enTexts).sort()));
      const docEn = en.xml["word/styles.xml"] ?? "";
      const docTr = tr.xml["word/styles.xml"] ?? "";
      ok(`${f.name}: EN w:lang=en-GB`, /w:lang w:val="en-GB"/.test(docEn));
      ok(`${f.name}: TR'de w:lang yok`, !/w:lang /.test(docTr));
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(path.join(OUT, `${f.name}-tr.docx`), await render(f, TR));
        writeFileSync(path.join(OUT, `${f.name}-en.docx`), await render(f, EN));
      }
    }
    console.log("\n—— C. Profesyonel Rapor Özeti (özet penceresi): TR aynen, EN etiketleri koddan");
    const { buildProfessionalReportSummary } = await import("../../lib/human-design/reporting/reportSummary");
    const { localizeReportSummary } = await import("../../lib/human-design/reporting/reportText");
    for (const f of list) {
      const title = W1.hdReportTitle((f.snapshot as { client: { name: string } }).client.name);
      const base = buildProfessionalReportSummary(title, f.snapshot as never);
      ok(`${f.name}: özet TR aynen (aynı nesne)`, localizeReportSummary(base, f.snapshot as never, TR) === base && localizeReportSummary(base, f.snapshot as never, null) === base);
      const en = localizeReportSummary(base, f.snapshot as never, EN);
      const flat = JSON.stringify({ ...en, client: null }).replace(/⟦[^⟧]*⟧/g, "");
      ok(`${f.name}: özet EN'de Türkçe sistem metni 0`, !/[çğıöşüÇĞİÖŞÜ]/.test(flat) && !/Kapı|Kanal|Merkez/.test(flat), flat.slice(0, 300));
      ok(`${f.name}: özet EN sayılar aynı (kanal/kapı adedi)`, en.channels.length === base.channels.length && en.gates.length === base.gates.length);
    }
    const fnEn = (W1 as unknown as { hdReportFilename: (n: string, d: string, o?: unknown) => string }).hdReportFilename("", "2026-10-09", EN);
    ok("EN dosya adı (ad boş) İngilizce", fnEn === "Human-Design-Client-2026-10-09.docx", fnEn);
    ok("EN dosya adı (ad dolu) aynı slug", (W1 as unknown as { hdReportFilename: (n: string, d: string, o?: unknown) => string }).hdReportFilename("Şule Çağ", "2026-10-09", EN) === "Human-Design-Sule-Cag-2026-10-09.docx");
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.log(fails.join("\n"));
    process.exit(1);
  }
}

/**
 * EN çıktıda izinli Türkçe harfli metin: YALNIZ marka "Yaşam Sistemi" (TERMINOLOJI: çevrilmez, Owner standardı).
 * Fikstürdeki Roxy yanıtı İngilizcedir → Sistem Yorumu bölümündeki her Türkçe harf ürünün kendi sistem metnidir ve
 * FAIL sayılır. (Gerçek kayıtlarda sağlayıcı anlatısı TR'dir — KISMİ; rapor bunu EN notuyla açıkça söyler.)
 */
function allowedProviderTr(_f: Fixture): string[] {
  return ["Yaşam Sistemi", "YAŞAM SİSTEMİ"];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
