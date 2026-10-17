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
import { centerStateMap, classifyChartRowCenters } from "../../lib/human-design/chart/centerStates";

// HD-UZMAN-01: Word yolu merkez durumlarını kayıtlı haritadan sınıflandırır (classifyChartRowCenters).
// Tanımsız: manuel harita + merkezde beyan edilmiş aktif kapı. Açık: 26 aktivasyonu tek kapıda (başka
// merkezde) olan hesaplanmış harita → hedef merkezde aktif kapı YOK (kanıtlı).
const GATE_OF: Record<string, number> = {
  head: 64, ajna: 47, throat: 62, g_identity: 1, heart_ego: 21, solar_plexus: 6, sacral: 5, spleen: 48, root: 58,
};
const PLANETS = ["Sun", "Earth", "Moon", "NorthNode", "SouthNode", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
function computedRowWithSingleGate(gate: number): Record<string, unknown> {
  const activations = (["personality", "design"] as const).flatMap((side) => PLANETS.map((body) => ({ body, side, gate, line: 1 })));
  const engineAll = ["Head", "Ajna", "Throat", "G", "Heart", "Spleen", "SolarPlexus", "Sacral", "Root"];
  return {
    source: "computed",
    type_code: null, authority_code: null, profile_code: null, definition_code: null,
    active_centers: [], open_centers: HUMAN_DESIGN_CENTERS.map((x) => x.code), gates: [gate], channels: [],
    computed_result: { activations, centers: { defined: [], open: engineAll }, channels: [] },
  };
}

let bad = 0;
// Word'ün üretebileceği TÜM kodların evreni: tüm tip/otorite/profil/tanım/merkez(tanımlı/tanımsız/açık)/kanal/kapı.
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
    let row: Record<string, unknown> = chart;
    if (c === "Merkezler") {
      const m = /^(tanimli|tanimsiz|tam_acik)_(.+)$/.exec(o.code);
      if (!m) throw new Error(`beklenmeyen merkez seçeneği: ${o.code}`);
      const [, state, center] = m;
      if (state === "tanimli") chart.active_centers = [center];
      else if (state === "tanimsiz") {
        chart.open_centers = [center];
        chart.active_centers = HUMAN_DESIGN_CENTERS.map((x) => x.code).filter((x) => x !== center).slice(0, 1);
        chart.gates = [GATE_OF[center]];
      } else {
        // Hedef merkez dışındaki bir merkezin kapısı → hedefte aktif kapı yok (Açık).
        const other = center === "head" ? "g_identity" : "head";
        row = computedRowWithSingleGate(GATE_OF[other]);
      }
    }
    if (c === "Kanallar") chart.channels = [o.code.replace("_", "-")];
    if (c === "Kapılar") chart.gates = [Number(o.code)];
    // Word yolu (reportSnapshotV2Service) ile AYNI: kayıt → uygulama kodları + kanıtlı merkez durumları.
    const wordCodes = buildExpertKnowledgeCodes(toAppChartCodes(row), centerStateMap(classifyChartRowCenters(row)));
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
