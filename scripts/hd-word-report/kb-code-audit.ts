/**
 * Bilgi Bankası kod tutarlılık denetimi (SAF; DB/ağ YOK).
 * Editörün yapısal seçeneklerden ürettiği HER kod, Word v2'nin haritadan aradığı kod biçimiyle
 * (buildExpertKnowledgeCodes) aynı mı? Uyuşmayan kategori → o kategorideki kayıtlar Word'e ASLA girmez.
 * Çalıştır: npx tsx scripts/hd-word-report/kb-code-audit.ts
 */
import { HD_KNOWLEDGE_CATEGORIES } from "../../lib/human-design/constants";
import { buildKnowledgeCodeFromValue, getStructuredCategoryOptions } from "../../lib/human-design/codeHelpers";
import { buildExpertKnowledgeCodes, toAppChartCodes } from "../../lib/human-design/normalize/hdAppCodes";
import { HUMAN_DESIGN_CENTERS } from "../../lib/human-design/constants";

let bad = 0;
// Word'ün üretebileceği TÜM kodların evreni: tüm tip/otorite/profil/tanım/merkez(tanımlı+açık)/kanal/kapı.
const reachable = new Set<string>();
const opts = (c: string) => getStructuredCategoryOptions(c) ?? [];
for (const c of HD_KNOWLEDGE_CATEGORIES) {
  for (const o of opts(c) as Array<{ code: string }>) {
    // Haritayı bu değeri içerecek biçimde kur ve Word'ün kodlarını üret.
    const chart: Record<string, unknown> = { type_code: null, authority_code: null, profile_code: null, definition_code: null, active_centers: [], open_centers: [], gates: [], channels: [] };
    if (c === "Tipler") chart.type_code = o.code;
    if (c === "Otoriteler") chart.authority_code = o.code;
    if (c === "Profiller") chart.profile_code = o.code;
    if (c === "Tanımlar") chart.definition_code = o.code;
    if (c === "Merkezler") {
      const [state, ...rest] = o.code.split("_");
      const center = rest.join("_");
      if (state === "tanimli") chart.active_centers = [center];
      else { chart.open_centers = [center]; chart.active_centers = HUMAN_DESIGN_CENTERS.map((x) => x.code).filter((x) => x !== center).slice(0, 1); }
    }
    if (c === "Kanallar") chart.channels = [o.code.replace("_", "-")];
    if (c === "Kapılar") chart.gates = [Number(o.code)];
    const wordCodes = buildExpertKnowledgeCodes(toAppChartCodes(chart));
    const editorCode = buildKnowledgeCodeFromValue(c as never, o.code);
    wordCodes.forEach((w) => reachable.add(w));
    if (!wordCodes.includes(editorCode)) {
      bad++;
      if (bad <= 15) console.log(`UYUŞMAZ ${c}: editör="${editorCode}"  Word=${JSON.stringify(wordCodes)}`);
    }
  }
}
const counts = HD_KNOWLEDGE_CATEGORIES.map((c) => `${c}=${(opts(c) as unknown[]).length}`).join(" ");
console.log(`seçenekler: ${counts}`);
console.log(bad === 0 ? "SONUÇ: TÜM yapısal kodlar Word eşleşmesiyle TUTARLI" : `SONUÇ: ${bad} UYUŞMAZLIK`);
process.exit(bad === 0 ? 0 : 1);
