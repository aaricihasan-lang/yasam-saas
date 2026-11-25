/**
 * D-HD — HD terim sözlüğü (messages/<dil>/hd.terms.json) kilidi.
 *   1) TR değerleri mevcut kaynak etiketlerle BAYT-BAYT aynı (TR ekranı değişmez).
 *   2) TR ve EN aynı anahtar ağacı; her kanonik kod (5 tip, 7 otorite + 2 Ego ayrımı, 12 profil, 4+1 tanım, 9 merkez,
 *      36 kanal, 13 gezegen, 4 merkez durumu, 5×3 tip anahtarı, 3 açı, 8 başlık) iki dilde var.
 *   3) EN değerlerinde Türkçe harf yok; EN tip/otorite/tanım değerleri uluslararası HD terimleri.
 * Kullanım: npx tsx scripts/hd-i18n/terms-catalog.harness.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HUMAN_DESIGN_TYPES, HUMAN_DESIGN_AUTHORITIES, HUMAN_DESIGN_PROFILES, HUMAN_DESIGN_DEFINITIONS, HUMAN_DESIGN_CENTERS, HUMAN_DESIGN_CHANNELS } from "../../lib/human-design/constants";
import { hdAuthorityDisplayLabel, hdCenterLabelFromCode, hdChannelLabelFromCode, hdDefinitionLabelFromCode, hdProfileLabelFromCode, hdTypeLabelFromCode } from "../../lib/human-design/codeHelpers";
import { HD_TERM_BI, HD_STRATEGY_TR, HD_SIGNATURE_TR, HD_NOT_SELF_TR, hdCrossAngleLabel } from "../../lib/human-design/normalize/hdDisplayLabels";
import { HD_CENTER_STATE_LABEL } from "../../lib/human-design/chart/centerStates";
import { HD_PLANET_ORDER, PLANET_LABEL_TR } from "../../lib/human-design/bodygraph/planetGlyphs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (l: string) => (JSON.parse(fs.readFileSync(path.join(root, "messages", l, "hd.terms.json"), "utf8")) as { hd: { terms: Record<string, Record<string, string>> } }).hd.terms;
const TR = read("tr");
const EN = read("en");
let pass = 0, fail = 0;
const ok = (c: unknown, n: string, d?: unknown) => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.error(`  FAIL ${n}${d !== undefined ? " — " + JSON.stringify(d).slice(0, 400) : ""}`); } };
const eq = (group: string, pairs: [string, string][]) => {
  const bad = pairs.filter(([k, v]) => TR[group]?.[k] !== v);
  ok(bad.length === 0 && Object.keys(TR[group] ?? {}).length === pairs.length, `TR ${group}: ${pairs.length} değer kaynakla bayt-bayt aynı`, bad);
};
eq("type", HUMAN_DESIGN_TYPES.map((x) => [x.code, hdTypeLabelFromCode(x.code)]));
eq("authority", [...HUMAN_DESIGN_AUTHORITIES.map((x): [string, string] => [x.code, hdAuthorityDisplayLabel(x.code, "generator")]), ["ego_manifested", hdAuthorityDisplayLabel("ego_heart", "manifestor")], ["ego_projected", hdAuthorityDisplayLabel("ego_heart", "projector")]]);
eq("profile", HUMAN_DESIGN_PROFILES.map((x) => [x.code, hdProfileLabelFromCode(x.code)]));
eq("definition", [...HUMAN_DESIGN_DEFINITIONS.map((x): [string, string] => [x.code, hdDefinitionLabelFromCode(x.code)]), ["none", hdDefinitionLabelFromCode("none")]]);
eq("center", HUMAN_DESIGN_CENTERS.map((x) => [x.code, hdCenterLabelFromCode(x.code)]));
eq("channel", HUMAN_DESIGN_CHANNELS.map((x) => [x.code, hdChannelLabelFromCode(x.code)]));
eq("centerState", Object.entries(HD_CENTER_STATE_LABEL));
eq("planet", HD_PLANET_ORDER.map((p) => [p, PLANET_LABEL_TR[p]]));
eq("title", Object.entries(HD_TERM_BI));
eq("strategy", Object.entries(HD_STRATEGY_TR));
eq("signature", Object.entries(HD_SIGNATURE_TR));
eq("notSelf", Object.entries(HD_NOT_SELF_TR));
eq("angle", [["right_angle", hdCrossAngleLabel("Right Angle")], ["left_angle", hdCrossAngleLabel("Left Angle")], ["juxtaposition", hdCrossAngleLabel("Juxtaposition")]]);

const keys = (o: Record<string, Record<string, string>>) => Object.entries(o).flatMap(([g, m]) => Object.keys(m).map((k) => `${g}.${k}`)).sort().join("|");
ok(keys(TR) === keys(EN), "TR ve EN anahtar ağacı aynı");
const trInEn = Object.entries(EN).flatMap(([g, m]) => Object.entries(m).filter(([, v]) => /[çğıöşüÇĞİÖŞÜ]/.test(v) || !v.trim()).map(([k]) => `${g}.${k}`));
ok(trInEn.length === 0, "EN değerlerinde Türkçe harf / boş değer yok", trInEn);
ok(Object.values(EN.type).join("|") === "Generator|Manifesting Generator|Projector|Manifestor|Reflector", "EN tipler uluslararası HD terimleri");
ok(EN.authority.sacral === "Sacral Authority" && EN.authority.emotional.startsWith("Emotional") && EN.authority.splenic === "Splenic Authority" && EN.authority.self_projected === "Self-Projected Authority" && EN.authority.lunar === "Lunar Authority", "EN otoriteler uluslararası HD terimleri");
ok(EN.definition.split === "Split Definition" && EN.definition.triple_split === "Triple Split Definition" && EN.definition.quadruple_split === "Quadruple Split Definition" && EN.definition.none === "No Definition", "EN tanımlar uluslararası HD terimleri");
ok(EN.profile["3_5"] === "3/5 — Martyr / Heretic" && EN.profile["6_2"] === "6/2 — Role Model / Hermit", "EN profil çizgi adları (Investigator…Role Model)");
console.log(`\n=== HD terim sözlüğü: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
