/**
 * HD FAZ 2 — Görsel QA fixture üreticisi (DB'siz). SHORT + LONG temsili rapor DOCX'i
 * üretir. İçerik SENTETİK (yalnız düzen/tipografi/pagination denetimi için); gerçek
 * canonical metin DEĞİLDİR. Çıktı dizini argümandan (varsayılan: scratchpad).
 *
 * Çalıştır: npm run hd:word:visual -- "<outDir>"
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { buildPersonalKnowledgeStructure, type PkStructure } from "@/lib/human-design/knowledge/personalKnowledge";
import {
  buildReportSnapshot,
  freezeContent,
  type FrozenCanonicalContent,
  type FrozenCanonicalRecord,
} from "@/lib/human-design/reporting/reportSnapshot";
import type { HdEntityKind } from "@/lib/human-design/admin/centralContentTypes";
import { hdReportFilename, renderHdReportBuffer } from "@/lib/human-design/reporting/wordReport";

const outDir = process.argv[2] || join_(process.cwd(), "scratchpad-hd-word");
function join_(a: string, b: string) { return a.replace(/[\\/]$/, "") + "/" + b; }

function kindOfKey(key: string): HdEntityKind {
  if (key.startsWith("tip_")) return "tip";
  if (key.startsWith("otorite_")) return "otorite";
  if (key.startsWith("kanal_")) return "kanal";
  return "kapi";
}

const LONG_PARA =
  "Bu bölüm, danışanın enerjisel yapısının profesyonel bir çerçevede ele alınmasını sağlar. " +
  "Metin, yayınlanmış canonical içeriğe sadık kalır; yorum katmanı eklenmez. Uzun paragraflar " +
  "sayfa geçişlerinde bölünürken başlıkların yalnız kalmaması ve okunabilir bir ritim korunması hedeflenir. " +
  "Türkçe karakterler (İ ı Ş ş Ğ ğ Ü ü Ö ö Ç ç) belge boyunca doğru render edilmelidir.";

function richBody(label: string): string {
  return (
    `${LONG_PARA}\n\n` +
    `## ${label} — Uygulama\n\n` +
    `Günlük yaşamda bu enerjinin nasıl deneyimlendiğine dair somut bir çerçeve sunulur. ${LONG_PARA}\n\n` +
    `- İlk gözlem: farkındalık ve zamanlama\n` +
    `- İkinci gözlem: karar mekanizmasıyla uyum\n` +
    `- Üçüncü gözlem: kendinden-olmayan tema ile ayrım\n\n` +
    `### Notlar\n\n${LONG_PARA}`
  );
}

function makeContent(key: string): FrozenCanonicalContent {
  const kind = kindOfKey(key);
  const c: FrozenCanonicalContent = freezeContent({
    general_description: `${LONG_PARA}`,
    report_text: richBody("Ana Metin"),
    strategy_text: null, signature_text: null, not_self_text: null,
    decision_mechanism: null, application_text: null, caution_notes: null,
    general_theme: null, full_channel_text: null, hanging_gate_context: null,
  });
  if (kind === "tip") { c.strategy_text = LONG_PARA; c.signature_text = "Tatmin ve akış."; c.not_self_text = "Hayal kırıklığı."; }
  else if (kind === "otorite") { c.decision_mechanism = richBody("Karar"); c.application_text = LONG_PARA; c.caution_notes = "Aceleci kararlardan kaçının."; }
  else if (kind === "kapi") { c.general_theme = "Bu kapının genel teması."; }
  else { c.full_channel_text = richBody("Tam Kanal"); c.hanging_gate_context = `Bu kapı ${key} kanalı üzerinden asılıdır: ${LONG_PARA}`; }
  return c;
}

function records(structure: PkStructure): Map<string, FrozenCanonicalRecord | null> {
  const m = new Map<string, FrozenCanonicalRecord | null>();
  for (const k of structure.allKeys) {
    m.set(k, { meta: { contentId: `c_${k}`, entityId: `e_${k}`, entityKind: kindOfKey(k), canonicalKey: k, version: 1 }, content: makeContent(k) });
  }
  return m;
}

function snapshotFor(chart: { type_code?: unknown; authority_code?: unknown; gates: number[] }, client: { name: string; birthDate?: string; birthTime?: string; birthPlace?: string }) {
  const s = buildPersonalKnowledgeStructure({ type_code: chart.type_code, authority_code: chart.authority_code, gates: chart.gates, channels: [] } as never);
  return buildReportSnapshot({
    generatedAt: "2026-08-23T10:00:00.000Z", readAt: "2026-08-23T10:00:00.000Z",
    client, chart: { chartId: "vis", source: "manual" }, structure: s, recordByKey: records(s),
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  // SHORT: tip + otorite + 1 kanal (26-44) + birkaç kapı.
  const shortSnap = snapshotFor(
    { type_code: "generator", authority_code: "sacral", gates: [26, 44, 5, 9] },
    { name: "Ayşe Yılmaz", birthDate: "1990-05-12", birthTime: "14:30", birthPlace: "İstanbul" },
  );
  const shortBuf = await renderHdReportBuffer(shortSnap);
  const shortName = hdReportFilename("Ayse-SHORT", "2026-08-23");
  writeFileSync(join_(outDir, shortName), shortBuf);

  // LONG: çok kapı + çoklu kanal + hanging (57) — uzun temsili içerik.
  const longSnap = snapshotFor(
    { type_code: "manifesting_generator", authority_code: "emotional", gates: [26, 44, 10, 20, 34, 57, 1, 2, 3, 4, 11, 13, 62, 56, 9 ] },
    { name: "Mehmet Çağrı Öztürk", birthDate: "1985-11-03", birthTime: "08:15", birthPlace: "İzmir" },
  );
  const longBuf = await renderHdReportBuffer(longSnap);
  const longName = hdReportFilename("Mehmet-LONG", "2026-08-23");
  writeFileSync(join_(outDir, longName), longBuf);

  const sum = (label: string, snap: ReturnType<typeof snapshotFor>, bytes: number, name: string) => {
    console.log(
      `${label}: ${name} (${bytes} bytes) | type=${snap.identity.type ? "var" : "yok"} ` +
      `authority=${snap.identity.authority ? "var" : (snap.identity.authorityInChart ? "eksik!" : "chart'ta yok")} ` +
      `channels=${snap.channels.length} gates=${snap.gates.length} hanging=${snap.hangingContexts.length}`,
    );
  };
  console.log(`OUTDIR: ${outDir}`);
  sum("SHORT", shortSnap, shortBuf.length, shortName);
  sum("LONG", longSnap, longBuf.length, longName);
}

main().catch((e) => { console.error(e); process.exit(1); });
