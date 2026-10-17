import { writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { engineChart, fakeConnectionResponse, PEOPLE } from "./fakeRelationRoxy";
import { validateRoxyConnection } from "../../lib/human-design/relations/connection";
import { buildCompositeModel } from "../../lib/human-design/relations/compositeModel";
import { buildCompositeScene, sceneToSvg } from "../../lib/human-design/relations/compositeScene";
const [a, b] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? 1)];
const v = validateRoxyConnection(fakeConnectionResponse(PEOPLE[a], PEOPLE[b]));
if (!v.ok) throw new Error("v");
const gA = [...new Set(engineChart(PEOPLE[a]).activations.map((x) => x.gate))];
const gB = [...new Set(engineChart(PEOPLE[b]).activations.map((x) => x.gate))];
const m = buildCompositeModel(gA, gB, v.value);
if (!m.ok) throw new Error(m.reason);
const svg = sceneToSvg(buildCompositeScene(m.model), "Geist");
const png = new Resvg(svg, { background: "white", fitTo: { mode: "width", value: 900 }, font: { loadSystemFonts: false, fontFiles: [path.join("C:/yasam-hd-centers/public/fonts/Geist-Regular.ttf")], defaultFontFamily: "Geist" } }).render().asPng();
writeFileSync(process.argv[4], png);
console.log("defined", m.model.definedChannelIds.join(" "));
// Penta önizleme: npx tsx composite-preview.ts penta <çıktı.png>
