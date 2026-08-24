/**
 * HD FAZ 2 — Profesyonel Word/DOCX · HARNESS (DB'siz, server'sız)
 * ==============================================================
 *
 * Doğrular:
 *   A–H  Snapshot yapı/kapsam + fail-loud (eksik canonical).
 *   I    Snapshot IMMUTABILITY: create → canonical fixture değişse bile stored
 *        snapshot ve ondan üretilen DOCX AYNI (eski) içerik.
 *   HASH Canonical hash DB kontratıyla (chr(30)+SHA-256) BİREBİR + duyarlılık.
 *   DOCX Yapısal (ZIP/OOXML), içerik kesinliği, RAW markdown yok, Türkçe, duplication,
 *        hanging bağlamları, eksik-otorite metni.
 *   PERS Persistence: canonical immutability guard (updateReport reddi), IDOR,
 *        download-read (canonical-only, snapshot doğrulama).
 *   SEC  Statik güvenlik değişmezleri (auth, tenant-body güvensiz, demo, no-store,
 *        owned image, parser reuse, AI yok, legacy korunuyor).
 *
 * Çalıştır: npm run hd:word:harness
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildPersonalKnowledgeStructure } from "@/lib/human-design/knowledge/personalKnowledge";
import type { PkStructure } from "@/lib/human-design/knowledge/personalKnowledge";
import {
  buildReportSnapshot,
  canonicalContentHash,
  freezeContent,
  isHdReportSnapshot,
  ReportSnapshotError,
  type FrozenCanonicalContent,
  type FrozenCanonicalRecord,
} from "@/lib/human-design/reporting/reportSnapshot";
import type { HdEntityKind } from "@/lib/human-design/admin/centralContentTypes";
import {
  hdReportFilename,
  hdReportTitle,
  renderHdReportBuffer,
} from "@/lib/human-design/reporting/wordReport";
import {
  getCanonicalReportForDownload,
  saveCanonicalReport,
  updateReport,
} from "@/lib/human-design/api/reportPersistence";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}
function section(t: string): void { console.log(`\n—— ${t}`); }
function read(rel: string): string { return readFileSync(join(ROOT, rel), "utf8"); }
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// ── Fixture içerik/kayıt üreticileri ────────────────────────────────────────────
function kindOfKey(key: string): HdEntityKind {
  if (key.startsWith("tip_")) return "tip";
  if (key.startsWith("otorite_")) return "otorite";
  if (key.startsWith("kanal_")) return "kanal";
  return "kapi";
}

const TR = "İşÇĞÜÖ ı ş ç ğ ü ö";

function makeContent(key: string): FrozenCanonicalContent {
  const kind = kindOfKey(key);
  const base: FrozenCanonicalContent = freezeContent({
    general_description: `GD::${key}::${TR}`,
    report_text: `RT::${key}\n\n## Alt Başlık\n\nGövde metni satırı bir.\n\n- madde bir\n- madde iki`,
    strategy_text: null,
    signature_text: null,
    not_self_text: null,
    decision_mechanism: null,
    application_text: null,
    caution_notes: null,
    general_theme: null,
    full_channel_text: null,
    hanging_gate_context: null,
  });
  if (kind === "tip") {
    base.strategy_text = `STRAT::${key}`;
    base.signature_text = `SIG::${key}`;
    base.not_self_text = `NOTSELF::${key}`;
  } else if (kind === "otorite") {
    base.decision_mechanism = `DEC::${key}`;
    base.application_text = `APP::${key}`;
    base.caution_notes = `CAUT::${key}`;
  } else if (kind === "kapi") {
    base.general_theme = `THEME::${key}`;
  } else {
    base.full_channel_text = `FULLCH::${key}`;
    base.hanging_gate_context = `HANG::${key}`;
  }
  return base;
}

function makeRecord(key: string, content?: FrozenCanonicalContent): FrozenCanonicalRecord {
  return {
    meta: { contentId: `c_${key}`, entityId: `e_${key}`, entityKind: kindOfKey(key), canonicalKey: key, version: 1 },
    content: content ?? makeContent(key),
  };
}

/** structure.allKeys için tam kayıt haritası; overrides ile bazı key'ler null/değişik. */
function fullRecords(
  structure: PkStructure,
  overrides?: Record<string, FrozenCanonicalRecord | null>,
): Map<string, FrozenCanonicalRecord | null> {
  const m = new Map<string, FrozenCanonicalRecord | null>();
  for (const k of structure.allKeys) m.set(k, makeRecord(k));
  if (overrides) for (const [k, v] of Object.entries(overrides)) m.set(k, v);
  return m;
}

function struct(chart: { type_code?: unknown; authority_code?: unknown; gates?: number[]; channels?: string[] }): PkStructure {
  return buildPersonalKnowledgeStructure({
    type_code: chart.type_code,
    authority_code: chart.authority_code,
    gates: chart.gates ?? [],
    channels: chart.channels ?? [],
  } as never);
}

function buildOk(
  structure: PkStructure,
  overrides?: Record<string, FrozenCanonicalRecord | null>,
  client = { name: "Ayşe Çğ Örnek", birthDate: "1990-05-12", birthTime: "14:30", birthPlace: "İstanbul" },
) {
  return buildReportSnapshot({
    generatedAt: "2026-08-23T10:00:00.000Z",
    readAt: "2026-08-23T10:00:00.000Z",
    client,
    chart: { chartId: "chart-1", source: "manual" },
    structure,
    recordByKey: fullRecords(structure, overrides),
  });
}

// jszip ile DOCX içi metin çıkarma
async function docxParts(buffer: Buffer): Promise<{ files: string[]; docText: string; docXml: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files);
  const docXml = await (zip.file("word/document.xml")?.async("string") ?? Promise.resolve(""));
  // <w:t ...>metin</w:t> düğümlerini birleştir → görünen metin.
  const texts: string[] = [];
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(docXml)) !== null) {
    texts.push(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  }
  return { files, docText: texts.join("\n"), docXml };
}

async function main() {
  // ══ A. Tip + Otorite + Kapılar + 1 Kanal ══
  section("A. Tip + Otorite + Gates + 1 Channel");
  {
    // gates 26,44 → tamamlanmış kanal 26-44; +bağımsız gate 5.
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [26, 44, 5] });
    const snap = buildOk(s);
    ok("A tip dolu", snap.identity.type !== null && snap.identity.type!.content.general_description.includes("tip_generator"));
    ok("A otorite dolu", snap.identity.authority !== null && snap.identity.authority!.kind === "otorite");
    ok("A 1 kanal (26-44)", snap.channels.length === 1 && snap.channels[0].gates.join("-") === "26-44");
    ok("A bağımsız gate 5 var, 26/44 yok", snap.gates.some((g) => g.gate === 5) && !snap.gates.some((g) => g.gate === 26 || g.gate === 44));
    ok("A schema/version", snap.schemaVersion === "hd-report-1");
    ok("A provenance kanal hash var", !!snap.provenance.canonical[snap.channels[0].key]?.hash);
  }

  // ══ B. Authority missing (chart'ta yok) ══
  section("B. Authority missing (empty-state)");
  {
    const s = struct({ type_code: "generator", authority_code: null, gates: [5] });
    const snap = buildOk(s);
    ok("B authority null", snap.identity.authority === null);
    ok("B authorityInChart false", snap.identity.authorityInChart === false);
    const buf = await renderHdReportBuffer(snap);
    const { docText } = await docxParts(buf);
    ok("B DOCX 'otorite bilgisi bulunmuyor'", docText.includes("Bu haritada otorite bilgisi bulunmuyor."));
    ok("B DOCX 'yayınlanmamış' YOK (o bölümde)", !docText.includes("henüz yayınlanmamış"));
  }

  // ══ C. No completed channels ══
  section("C. No completed channels");
  {
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [5, 7] }); // 5,7 partnersiz
    const snap = buildOk(s);
    ok("C 0 kanal", snap.channels.length === 0);
    const buf = await renderHdReportBuffer(snap);
    const { docText } = await docxParts(buf);
    ok("C DOCX 'tamamlanmış kanal bulunmuyor'", docText.includes("tamamlanmış kanal bulunmuyor"));
  }

  // ══ D. Multiple completed channels ══
  section("D. Multiple completed channels");
  {
    // 26-44 + 10-20 (Awakening) iki tamamlanmış kanal.
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [26, 44, 10, 20] });
    const snap = buildOk(s);
    ok("D 2 kanal", snap.channels.length === 2);
    const codes = snap.channels.map((c) => c.gates.join("-")).sort();
    ok("D kanal kodları 10-20 & 26-44", codes.join(",") === "10-20,26-44");
  }

  // ══ E. Hanging one potential ══
  section("E. Hanging one potential (gate 9 → 9-52)");
  {
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [9] });
    const snap = buildOk(s);
    const hg = snap.hangingContexts.find((h) => h.gate === 9);
    ok("E gate 9 hanging var", !!hg);
    ok("E tek potansiyel 9-52", !!hg && hg.potentials.length === 1 && hg.potentials[0].partnerGate === 52);
    ok("E bağlam kanaldan (HANG::kanal)", !!hg && hg.potentials[0].hangingContext.startsWith("HANG::kanal_"));
  }

  // ══ F. Gate 57 → 10-57, 20-57, 34-57 (üç ayrı bağlam) ══
  section("F. Gate 57 three separate hanging contexts");
  {
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [57] });
    const snap = buildOk(s);
    const hg = snap.hangingContexts.find((h) => h.gate === 57);
    ok("F gate 57 hanging var", !!hg);
    ok("F 3 potansiyel", !!hg && hg.potentials.length === 3);
    const partners = (hg?.potentials ?? []).map((p) => p.partnerGate).sort((a, b) => a - b);
    ok("F partnerler 10,20,34", partners.join(",") === "10,20,34");
    const ctxs = new Set((hg?.potentials ?? []).map((p) => p.hangingContext));
    ok("F 3 bağlam DISTINCT", ctxs.size === 3);
    const buf = await renderHdReportBuffer(snap);
    const { docText } = await docxParts(buf);
    ok("F DOCX üç kanal bağlam başlığı", (docText.match(/Asılı Kapı Bağlamı — Kanal/g) ?? []).length >= 3);
  }

  // ══ G. Long content / many gates ══
  section("G. Long content / many gates");
  {
    const many = [1, 2, 3, 4, 5, 6, 7, 11, 13, 33, 62, 56, 57, 9]; // karışık; bazıları hanging
    const s = struct({ type_code: "manifesting_generator", authority_code: "emotional", gates: many });
    const snap = buildOk(s);
    ok("G çok bağımsız kapı", snap.gates.length >= 8);
    const buf = await renderHdReportBuffer(snap);
    ok("G DOCX üretildi (buffer>0)", buf.length > 2000);
    const { files } = await docxParts(buf);
    ok("G word/document.xml var", files.includes("word/document.xml"));
  }

  // ══ H. Missing required canonical → fail-loud ══
  section("H. Missing required canonical → fail-loud");
  {
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [26, 44, 5] });
    // Tip içeriği eksik.
    try {
      buildReportSnapshot({
        generatedAt: "t", readAt: "t",
        client: { name: "X" }, chart: { chartId: "c", source: "manual" },
        structure: s, recordByKey: fullRecords(s, { [s.typeKey!]: null }),
      });
      ok("H tip eksik → throw", false);
    } catch (e) {
      ok("H tip eksik → ReportSnapshotError(missing_canonical)", e instanceof ReportSnapshotError && e.code === "missing_canonical");
    }
    // Otorite chart'ta VAR ama içerik eksik → fail-loud.
    try {
      buildReportSnapshot({
        generatedAt: "t", readAt: "t",
        client: { name: "X" }, chart: { chartId: "c", source: "manual" },
        structure: s, recordByKey: fullRecords(s, { [s.authorityKey!]: null }),
      });
      ok("H otorite(chart'ta var) eksik → throw", false);
    } catch (e) {
      ok("H otorite eksik → missing_canonical", e instanceof ReportSnapshotError && e.code === "missing_canonical");
    }
    // Tamamlanmış kanal içeriği eksik → fail-loud.
    const chKey = s.completedChannels[0].key;
    try {
      buildReportSnapshot({
        generatedAt: "t", readAt: "t",
        client: { name: "X" }, chart: { chartId: "c", source: "manual" },
        structure: s, recordByKey: fullRecords(s, { [chKey]: null }),
      });
      ok("H kanal eksik → throw", false);
    } catch (e) {
      ok("H kanal eksik → missing_canonical", e instanceof ReportSnapshotError && e.code === "missing_canonical");
    }
    // Bağımsız kapı içeriği eksik → fail-loud.
    const gKey = s.independentGates[0].key;
    try {
      buildReportSnapshot({
        generatedAt: "t", readAt: "t",
        client: { name: "X" }, chart: { chartId: "c", source: "manual" },
        structure: s, recordByKey: fullRecords(s, { [gKey]: null }),
      });
      ok("H bağımsız kapı eksik → throw", false);
    } catch (e) {
      ok("H kapı eksik → missing_canonical", e instanceof ReportSnapshotError && e.code === "missing_canonical");
    }
  }

  // ══ I. Snapshot IMMUTABILITY (canonical değişse de DOCX eski içerik) ══
  section("I. Snapshot immutability (redownload = old content)");
  {
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [26, 44, 5] });
    const snap1 = buildOk(s); // stored snapshot
    const stored = JSON.parse(JSON.stringify(snap1)); // DB'de saklanmış hâli
    // "Canonical fixture değişti": tamamen farklı içerikli yeni snapshot üret.
    const changedRecords = fullRecords(s);
    for (const [k, v] of changedRecords) if (v) v.content.general_description = `CHANGED::${k}`;
    const snap2 = buildReportSnapshot({
      generatedAt: "2026-12-01T00:00:00.000Z", readAt: "2026-12-01T00:00:00.000Z",
      client: { name: "Ayşe Çğ Örnek" }, chart: { chartId: "chart-1", source: "manual" },
      structure: s, recordByKey: changedRecords,
    });
    ok("I yeni snapshot değişti", snap2.identity.type!.content.general_description.startsWith("CHANGED::"));
    ok("I stored snapshot DEĞİŞMEDİ", stored.identity.type.content.general_description.includes("tip_generator"));
    // DOCX stored snapshot'tan üretilir → ESKİ içerik.
    const buf = await renderHdReportBuffer(stored);
    const { docText } = await docxParts(buf);
    ok("I DOCX eski içerik (GD::tip_generator)", docText.includes("GD::tip_generator"));
    ok("I DOCX yeni içerik YOK (CHANGED::)", !docText.includes("CHANGED::"));
    ok("I isHdReportSnapshot(stored)=true", isHdReportSnapshot(stored));
  }

  // ══ HASH ══
  section("HASH. Canonical hash contract + sensitivity");
  {
    const meta = { contentId: "id1", entityId: "ent1", entityKind: "tip" as HdEntityKind, canonicalKey: "tip_generator", version: 3 };
    const c = makeContent("tip_generator");
    const h1 = canonicalContentHash(meta, c);
    const h2 = canonicalContentHash(meta, freezeContent({ ...c }));
    ok("HASH aynı içerik → aynı hash", h1 === h2 && /^[0-9a-f]{64}$/.test(h1));
    const c2 = freezeContent({ ...c, report_text: c.report_text + "x" });
    ok("HASH bir karakter değişti → farklı", canonicalContentHash(meta, c2) !== h1);
    // Bağımsız yeniden-üretim: DB concat_ws(chr(30), ...) serialization'ı birebir.
    const RS = String.fromCharCode(30);
    const co = (v: string | null) => v ?? "";
    const expectInput = [
      "ent1", "tip", "tip_generator", "3",
      co(c.general_description), co(c.report_text), co(c.strategy_text), co(c.signature_text), co(c.not_self_text),
      co(c.decision_mechanism), co(c.application_text), co(c.caution_notes), co(c.general_theme), co(c.full_channel_text), co(c.hanging_gate_context),
    ].join(RS);
    const expect = createHash("sha256").update(expectInput, "utf8").digest("hex");
    ok("HASH DB-kontrat serialization birebir", expect === h1);
    // version farkı hash'i değiştirir (provenance duyarlılığı).
    ok("HASH version duyarlı", canonicalContentHash({ ...meta, version: 4 }, c) !== h1);
  }

  // ══ DOCX yapısal + içerik + duplication + Türkçe ══
  section("DOCX. Structure / exactness / no-raw-markdown / Türkçe / duplication");
  {
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [26, 44, 5, 9] });
    const snap = buildOk(s);
    const buf = await renderHdReportBuffer(snap);
    ok("DOCX ZIP magic PK", buf[0] === 0x50 && buf[1] === 0x4b);
    const { files, docText, docXml } = await docxParts(buf);
    ok("DOCX [Content_Types].xml", files.includes("[Content_Types].xml"));
    ok("DOCX word/document.xml", files.includes("word/document.xml"));
    ok("DOCX header1.xml", files.some((f) => /word\/header\d*\.xml/.test(f)));
    ok("DOCX footer1.xml", files.some((f) => /word\/footer\d*\.xml/.test(f)));
    ok("DOCX numbering.xml (bullet)", files.includes("word/numbering.xml"));
    ok("DOCX <w:document> kök", docXml.includes("<w:document"));
    // İçerik kesinliği
    ok("DOCX exact GD::tip_generator", docText.includes("GD::tip_generator"));
    ok("DOCX exact FULLCH::kanal (kanal metni)", /FULLCH::kanal_26_44/.test(docText));
    ok("DOCX exact THEME::kapi_5 (bağımsız kapı)", docText.includes("THEME::kapi_5"));
    // RAW markdown görünmez (## satır başı yok); "Alt Başlık" görünür.
    ok("DOCX RAW '## ' YOK", !/(^|\n)#{2,}\s/.test(docText) && !docText.includes("## Alt Başlık"));
    ok("DOCX bold heading 'Alt Başlık' görünür", docText.includes("Alt Başlık"));
    // Türkçe karakter bütünlüğü
    ok("DOCX Türkçe İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç", ["İ", "ı", "Ş", "ş", "Ğ", "ğ", "Ü", "ü", "Ö", "ö", "Ç", "ç"].every((ch) => docText.includes(ch)));
    // Bölüm başlıkları LOCKED sıra
    for (const h of ["Danışan ve Harita Bilgileri", "Temel Human Design Kimliği", "Tanımlı Kanallar", "Aktif / Bağımsız Kapılar", "Asılı Kapı Bağlamları"]) {
      ok(`DOCX bölüm '${h}'`, docText.includes(h));
    }
    // DUPLICATION: 26-44 kanal metni bir kez; kapı 26/44 bağımsız bölümde YOK.
    ok("DUP FULLCH::kanal_26_44 tam olarak 1 kez", (docText.match(/FULLCH::kanal_26_44/g) ?? []).length === 1);
    ok("DUP THEME::kapi_26 YOK (channeled)", !docText.includes("THEME::kapi_26"));
    ok("DUP THEME::kapi_44 YOK (channeled)", !docText.includes("THEME::kapi_44"));
    // Kaynak tam metni / evidence snapshot'a girmez (V1 references yok)
    ok("SRC 'Kaynakça' bölümü YOK", !docText.includes("Kaynakça") && !docText.includes("Kaynaklar"));
  }

  // ══ Filename / title sanitize ══
  section("FILE. Filename / title sanitize (§41)");
  {
    const bad = hdReportFilename("../../etc/pa sswd\r\n\"'<>|:*?", "2026-08-23");
    ok("FILE traversal/CRLF/quote yok", !/[\\/:*?"<>|\r\n]/.test(bad) && !bad.includes(".."));
    ok("FILE .docx uzantı", bad.endsWith(".docx"));
    ok("FILE tarih içerir", bad.includes("2026-08-23"));
    const tr = hdReportFilename("Ayşe Çağ Öz", "2026-08-23");
    ok("FILE TR transliterasyon", tr === "Human-Design-Ayse-Cag-Oz-2026-08-23.docx");
    ok("FILE bozuk tarih güvenli", hdReportFilename("X", "boom").includes("0000-00-00"));
    ok("TITLE danışanlı", hdReportTitle("Ayşe") === "Human Design Raporu — Ayşe");
    ok("TITLE boş güvenli", hdReportTitle("") === "Human Design Raporu");
  }

  // ══ PERSISTENCE (mock DB) ══
  section("PERS. Immutability guard / IDOR / download-read");
  {
    // Immutability: canonical satır → updateReport reddeder; legacy → geçer.
    const dbCanonical = mockDb({ reportKind: "canonical" });
    const up1 = await updateReport(dbCanonical as unknown as SupabaseClient, "t1", "r1", { title: "x", editedContent: "y" });
    ok("PERS canonical update REDDEDİLDİ", up1.ok === false && /değiştirilemez|sabittir/.test(up1.error ?? ""));

    const dbLegacy = mockDb({ reportKind: "legacy" });
    const up2 = await updateReport(dbLegacy as unknown as SupabaseClient, "t1", "r1", { title: "x", editedContent: "y" });
    ok("PERS legacy update GEÇTİ", up2.ok === true);

    // IDOR: chart başka tenant → saveCanonicalReport reddeder.
    const s = struct({ type_code: "generator", authority_code: "sacral", gates: [5] });
    const snap = buildOk(s);
    const dbNoChart = mockDb({ chartInTenant: false });
    const sv = await saveCanonicalReport(dbNoChart as unknown as SupabaseClient, "t1", "u1", {
      chartId: "chart-x", clientId: null, title: "T", snapshot: snap, provenance: snap.provenance.canonical,
    });
    ok("PERS IDOR chart yabancı → red", sv.id === null && /ait değil/.test(sv.error ?? ""));

    // download-read: canonical → 200 + snapshot; legacy → 400; missing → 404.
    const dbDlCanon = mockDb({ downloadRow: { title: "T", client_id: null, report_kind: "canonical", snapshot: JSON.parse(JSON.stringify(snap)) } });
    const dl1 = await getCanonicalReportForDownload(dbDlCanon as unknown as SupabaseClient, "t1", "r1");
    ok("PERS download canonical 200", dl1.status === 200 && !!dl1.data && dl1.data.snapshot.schemaVersion === "hd-report-1");
    const dbDlLegacy = mockDb({ downloadRow: { title: "T", client_id: null, report_kind: "legacy", snapshot: null } });
    const dl2 = await getCanonicalReportForDownload(dbDlLegacy as unknown as SupabaseClient, "t1", "r1");
    ok("PERS download legacy 400", dl2.status === 400 && dl2.data === null);
    const dbDlMissing = mockDb({ downloadRow: null });
    const dl3 = await getCanonicalReportForDownload(dbDlMissing as unknown as SupabaseClient, "t1", "r1");
    ok("PERS download missing 404", dl3.status === 404);
  }

  // ══ SECURITY static invariants ══
  section("SEC. Static security invariants");
  {
    const create = stripComments(read("app/api/hd/reports/professional/route.ts"));
    const download = stripComments(read("app/api/hd/reports/professional/download/route.ts"));
    const service = stripComments(read("lib/human-design/reporting/reportSnapshotService.ts"));
    const wordSrc = read("lib/human-design/reporting/wordReport.ts");
    const snapSrc = read("lib/human-design/reporting/reportSnapshot.ts");

    ok("SEC create requireModuleAccess(human_design)", /requireModuleAccess\(\s*req\s*,\s*"human_design"\s*\)/.test(create));
    ok("SEC create demo bloklu", /is_demo_account/.test(create) && /403/.test(create));
    ok("SEC create rate limit", /checkRateLimit/.test(create));
    ok("SEC create tenantId guard'dan (body'den değil)", /guard\.tenantId/.test(create) && !/raw\.tenantId|body\.tenantId|\.tenant_id\s*=/.test(create));
    ok("SEC download requireModuleAccess", /requireModuleAccess\(\s*req\s*,\s*"human_design"\s*\)/.test(download));
    ok("SEC download no-store", /no-store/.test(download));
    ok("SEC download owned-image guard", /isOwnedChartImagePath/.test(download));
    ok("SEC download keyfi URL fetch YOK", !/fetch\(\s*[^)]*snapshot/.test(download) && !/fetchImageBuffer\(/.test(download));
    ok("SEC service mutation YOK", !/\.insert\(|\.update\(|\.delete\(|\.upsert\(/.test(service));
    ok("SEC AI import YOK (word/snapshot)", !/openai|anthropic|@ai-sdk|langchain/i.test(wordSrc + snapSrc));
    ok("SEC parser reuse (React renderer değil)", /parseReaderBlocks|promotePlainHeadings/.test(wordSrc) && !/formatReaderText\(/.test(wordSrc));

    // Legacy korunuyor: eski dosyalar mevcut ve dokunulmamış davranış.
    ok("SEC legacy rapor-olustur mevcut", existsSync(join(ROOT, "app/human-design/rapor-olustur/page.tsx")));
    const persist = read("lib/human-design/api/reportPersistence.ts");
    ok("SEC legacy saveReport/updateReport korunuyor", /export async function saveReport/.test(persist) && /export async function updateReport/.test(persist));
    ok("SEC canonical INSERT report_kind='canonical'", /report_kind:\s*"canonical"/.test(persist));
  }

  console.log(`\n${"=".repeat(52)}\nSONUÇ: ${pass} geçti, ${fail} kaldı\n${"=".repeat(52)}`);
  if (fail > 0) process.exit(1);
}

// ── Minimal mock Supabase (yeterli alt küme) ────────────────────────────────────
type MockCfg = {
  reportKind?: string;
  chartInTenant?: boolean;
  clientInTenant?: boolean;
  downloadRow?: Record<string, unknown> | null;
};
function mockDb(cfg: MockCfg) {
  const state = {
    chartInTenant: cfg.chartInTenant ?? true,
    clientInTenant: cfg.clientInTenant ?? true,
  };
  return {
    from(table: string) {
      return makeChain(table, cfg, state);
    },
  };
}
function makeChain(table: string, cfg: MockCfg, state: { chartInTenant: boolean; clientInTenant: boolean }) {
  let selectCols = "";
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = (cols: string) => { selectCols = cols; return self(); };
  chain.update = () => self();
  chain.insert = () => self();
  chain.delete = () => self();
  chain.eq = () => self();
  chain.or = () => self();
  chain.order = () => self();
  chain.in = () => self();
  chain.maybeSingle = async () => {
    if (table === "human_design_charts") return { data: state.chartInTenant ? { id: "x" } : null, error: null };
    if (table === "human_design_clients") return { data: state.clientInTenant ? { id: "x" } : null, error: null };
    if (table === "human_design_reports") {
      if (selectCols.includes("report_kind") && selectCols.includes("snapshot")) {
        return { data: cfg.downloadRow ?? null, error: null };
      }
      if (selectCols.includes("report_kind")) {
        return { data: cfg.reportKind ? { report_kind: cfg.reportKind } : null, error: null };
      }
    }
    return { data: null, error: null };
  };
  // insert(...).select("id").single() → tek satır
  chain.single = async () => ({ data: { id: "new-id" }, error: null });
  // Thenable: update(...).eq(...).eq(...).select("id") await edildiğinde array döner
  // (updateReport data.length kontrolü). Diğer yollar maybeSingle/single ile sonlanır.
  chain.then = (resolve: (v: { data: { id: string }[]; error: null }) => unknown) =>
    resolve({ data: [{ id: "r1" }], error: null });
  return chain;
}

main().catch((e) => { console.error(e); process.exit(1); });
