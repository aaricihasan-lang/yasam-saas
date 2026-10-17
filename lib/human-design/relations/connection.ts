// Human Design CONNECTION (iki kişilik ilişki haritası) — Roxy yanıt doğrulama + normalizasyon +
// bağımsız tutarlılık denetimi (SAF; ağ/DB yok).
//
// Sözleşme: RoxyAPI OpenAPI v2.0.0 `calculateConnection` 200 yanıtı (alan adları şemadan; tahmin yok):
//   totalChannels · channels[{gateA,gateB,name,nameLocalized?,circuit,circuitLocalized?,centers[2],
//   dynamic,dynamicLocalized?,personAGates[],personBGates[]}] · centers[9]{id,name,nameLocalized?,defined,
//   definedBy[]} · combinedDefinition · combinedDefinitionLocalized? · summary{electromagnetic,dominance,
//   compromise,companionship}
// Sağlayıcı yorum metni / uyum puanı / yüzde DÖNDÜRMEZ → bu modül de ÜRETMEZ.
//
// Tutarlılık: katılımcıların KAYITLI (doğrulanmış) BodyGraph aktif kapılarından, resmî 36 kanal
// topolojisiyle (engine/channels) bağlı kanallar, dinamikler, birleşik merkezler ve birleşik tanım
// bağımsız türetilir. Roxy yanıtı bununla BİREBİR örtüşmezse sonuç KAYDEDİLMEZ (fail-closed).

import { CHANNELS, GATE_CENTER, type CenterName } from "../engine/channels";
import { APP_CENTER_TO_ENGINE_CENTER, toAppCenterCode, toAppChannelCode } from "../normalize/hdAppCodes";
import { HUMAN_DESIGN_CENTERS } from "../constants";
import type { HdCenterCode } from "../types";

export const CONNECTION_DYNAMICS = ["Electromagnetic", "Dominance", "Compromise", "Companionship"] as const;
export type ConnectionDynamic = (typeof CONNECTION_DYNAMICS)[number];
export const COMBINED_DEFINITIONS = ["None", "Single", "Split", "Triple Split", "Quadruple Split"] as const;
export type CombinedDefinition = (typeof COMBINED_DEFINITIONS)[number];

export type HdConnectionChannel = {
  /** Resmî kanal kodu "küçük-büyük" (ör. "20-34"). */
  id: string;
  gateA: number;
  gateB: number;
  name: string;
  nameLocalized: string | null;
  circuit: string;
  circuitLocalized: string | null;
  centers: [string, string];
  dynamic: ConnectionDynamic;
  dynamicLocalized: string | null;
  personAGates: number[];
  personBGates: number[];
};

export type HdConnectionCenter = {
  code: HdCenterCode;
  name: string;
  nameLocalized: string | null;
  defined: boolean;
  /** Merkezi KENDİ haritasında tanımlayan kişi(ler): "A", "B" (ikisi birden → ["A","B"]); boş = ikisinde de açık. */
  definedBy: Array<"A" | "B">;
};

export type HdConnectionResult = {
  schema: "hd-connection-1";
  totalChannels: number;
  channels: HdConnectionChannel[];
  centers: HdConnectionCenter[];
  combinedDefinition: CombinedDefinition;
  combinedDefinitionLocalized: string | null;
  summary: { electromagnetic: number; dominance: number; compromise: number; companionship: number };
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const optStr = (v: unknown): string | null => (isStr(v) ? v.trim().slice(0, 200) : null);
const sortNum = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Ham Roxy Connection yanıtı → doğrulanmış, normalize sonuç (yapısal denetim). */
export function validateRoxyConnection(raw: unknown): Validation<HdConnectionResult> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["yanıt bir JSON nesnesi değil"] };

  const channels: HdConnectionChannel[] = [];
  if (!Array.isArray(raw.channels) || raw.channels.length > 36) errors.push("channels: en fazla 36 öğeli dizi bekleniyor");
  else {
    const seen = new Set<string>();
    raw.channels.forEach((c, i) => {
      if (!isObj(c) || !isInt(c.gateA, 1, 64) || !isInt(c.gateB, 1, 64) || !isStr(c.name) || !isStr(c.circuit)) {
        errors.push(`channels[${i}]: gateA/gateB/name/circuit eksik veya hatalı`);
        return;
      }
      const id = toAppChannelCode(c.gateA, c.gateB);
      if (!id) return void errors.push(`channels[${i}]: resmî 36 kanal dışında (${c.gateA}-${c.gateB})`);
      if (seen.has(id)) return void errors.push(`channels[${i}]: kanal tekrarı ${id}`);
      seen.add(id);
      if (!Array.isArray(c.centers) || c.centers.length !== 2 || !c.centers.every(isStr)) {
        return void errors.push(`channels[${i}].centers: iki merkez bekleniyor`);
      }
      if (!CONNECTION_DYNAMICS.includes(c.dynamic as ConnectionDynamic)) {
        return void errors.push(`channels[${i}].dynamic: bilinmeyen değer`);
      }
      const own = [c.gateA, c.gateB];
      const gl = (v: unknown) => (Array.isArray(v) && v.length <= 2 && v.every((g) => isInt(g, 1, 64) && own.includes(g)) ? sortNum(v as number[]) : null);
      const pa = gl(c.personAGates);
      const pb = gl(c.personBGates);
      if (!pa || !pb) return void errors.push(`channels[${i}]: personAGates/personBGates kanalın kapılarından olmalı`);
      channels.push({
        id,
        gateA: c.gateA,
        gateB: c.gateB,
        name: c.name.trim().slice(0, 120),
        nameLocalized: optStr(c.nameLocalized),
        circuit: c.circuit.trim().slice(0, 60),
        circuitLocalized: optStr(c.circuitLocalized),
        centers: [String(c.centers[0]).trim(), String(c.centers[1]).trim()],
        dynamic: c.dynamic as ConnectionDynamic,
        dynamicLocalized: optStr(c.dynamicLocalized),
        personAGates: pa,
        personBGates: pb,
      });
    });
  }

  const centers: HdConnectionCenter[] = [];
  if (!Array.isArray(raw.centers) || raw.centers.length !== 9) errors.push("centers: tam 9 merkez bekleniyor");
  else {
    const seen = new Set<HdCenterCode>();
    raw.centers.forEach((c, i) => {
      if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || typeof c.defined !== "boolean" || !Array.isArray(c.definedBy)) {
        return void errors.push(`centers[${i}]: id/name/defined/definedBy eksik veya hatalı`);
      }
      const code = toAppCenterCode(c.id);
      const byName = toAppCenterCode(c.name);
      if (!code || seen.has(code) || (byName !== null && byName !== code)) return void errors.push(`centers[${i}]: merkez kimliği geçersiz/tekrar`);
      seen.add(code);
      const by = new Set<"A" | "B">();
      for (const v of c.definedBy) {
        if (v === "A" || v === "B") by.add(v);
        else if (v === "both") { by.add("A"); by.add("B"); }
        else return void errors.push(`centers[${i}].definedBy: bilinmeyen değer`);
      }
      centers.push({ code, name: c.name.trim(), nameLocalized: optStr(c.nameLocalized), defined: c.defined, definedBy: (["A", "B"] as const).filter((x) => by.has(x)) });
    });
  }

  if (!COMBINED_DEFINITIONS.includes(raw.combinedDefinition as CombinedDefinition)) errors.push("combinedDefinition: bilinmeyen değer");
  const s = raw.summary;
  const keys = ["electromagnetic", "dominance", "compromise", "companionship"] as const;
  if (!isObj(s) || !keys.every((k) => isInt(s[k], 0, 36))) errors.push("summary: dört dinamik sayısı bekleniyor");
  if (!isInt(raw.totalChannels, 0, 36)) errors.push("totalChannels: 0–36 tamsayı bekleniyor");

  if (errors.length > 0) return { ok: false, errors };
  const summary = { electromagnetic: (s as Obj).electromagnetic as number, dominance: (s as Obj).dominance as number, compromise: (s as Obj).compromise as number, companionship: (s as Obj).companionship as number };
  // İç tutarlılık (OpenAPI: totalChannels = channels.length = summary toplamı).
  const total = raw.totalChannels as number;
  if (total !== channels.length) errors.push(`totalChannels (${total}) ≠ channels (${channels.length})`);
  if (summary.electromagnetic + summary.dominance + summary.compromise + summary.companionship !== total) errors.push("summary toplamı ≠ totalChannels");
  for (const k of keys) {
    const n = channels.filter((c) => c.dynamic.toLowerCase() === k).length;
    if (n !== summary[k]) errors.push(`summary.${k} (${summary[k]}) ≠ kanal sayımı (${n})`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const order = HUMAN_DESIGN_CENTERS.map((c) => c.code as HdCenterCode);
  centers.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  channels.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  return {
    ok: true,
    value: {
      schema: "hd-connection-1",
      totalChannels: total,
      channels,
      centers,
      combinedDefinition: raw.combinedDefinition as CombinedDefinition,
      combinedDefinitionLocalized: optStr(raw.combinedDefinitionLocalized),
      summary,
    },
  };
}

const ENGINE_TO_APP = Object.fromEntries(
  Object.entries(APP_CENTER_TO_ENGINE_CENTER).map(([a, e]) => [e, a]),
) as Record<CenterName, HdCenterCode>;

/** Kanal dinamiği — OpenAPI tanımlarıyla birebir (Electromagnetic / Dominance / Compromise / Companionship). */
export function connectionDynamicFor(aHeld: number, bHeld: number): ConnectionDynamic | null {
  if (aHeld + bHeld < 2) return null;
  if (aHeld === 2 && bHeld === 2) return "Companionship";
  if ((aHeld === 2 && bHeld === 0) || (bHeld === 2 && aHeld === 0)) return "Dominance";
  if ((aHeld === 2 && bHeld === 1) || (bHeld === 2 && aHeld === 1)) return "Compromise";
  return "Electromagnetic"; // her biri tek kapı (farklı kapılar; birleşimde kanal tamam)
}

function definitionKind(definedCenters: Set<CenterName>, edges: Array<[CenterName, CenterName]>): CombinedDefinition {
  const parent = new Map<CenterName, CenterName>();
  const find = (x: CenterName): CenterName => {
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  for (const c of definedCenters) parent.set(c, c);
  for (const [a, b] of edges) parent.set(find(a), find(b));
  const n = new Set([...definedCenters].map(find)).size;
  return (["None", "Single", "Split", "Triple Split", "Quadruple Split"] as const)[Math.min(n, 4)];
}

/**
 * Bağımsız beklenen Connection (kayıtlı bireysel haritalardan). Sağlayıcı yanıtıyla karşılaştırma
 * ve testler için. definedA/B: her kişinin KENDİ haritasındaki tanımlı merkezler (uygulama kodu).
 */
export function expectedConnection(gatesA: Iterable<number>, gatesB: Iterable<number>, definedA: Iterable<HdCenterCode>, definedB: Iterable<HdCenterCode>) {
  const A = new Set(gatesA);
  const B = new Set(gatesB);
  const dA = new Set(definedA);
  const dB = new Set(definedB);
  const channels: Array<{ id: string; dynamic: ConnectionDynamic; personAGates: number[]; personBGates: number[] }> = [];
  const edges: Array<[CenterName, CenterName]> = [];
  const defined = new Set<CenterName>();
  for (const ch of CHANNELS) {
    const pa = [ch.gateA, ch.gateB].filter((g) => A.has(g));
    const pb = [ch.gateA, ch.gateB].filter((g) => B.has(g));
    const union = new Set([...pa, ...pb]);
    if (union.size < 2) continue;
    channels.push({ id: ch.id, dynamic: connectionDynamicFor(pa.length, pb.length)!, personAGates: sortNum(pa), personBGates: sortNum(pb) });
    edges.push([ch.centerA, ch.centerB]);
    defined.add(ch.centerA);
    defined.add(ch.centerB);
  }
  const centers = HUMAN_DESIGN_CENTERS.map((c) => {
    const code = c.code as HdCenterCode;
    const eng = APP_CENTER_TO_ENGINE_CENTER[code] as CenterName;
    return { code, defined: defined.has(eng), definedBy: (["A", "B"] as const).filter((x) => (x === "A" ? dA : dB).has(code)) };
  });
  return { channels, centers, combinedDefinition: definitionKind(defined, edges) };
}

/** Roxy yanıtı ↔ kayıtlı bireysel haritalar. Boş liste = tutarlı. */
export function checkConnectionConsistency(
  r: HdConnectionResult,
  exp: ReturnType<typeof expectedConnection>,
): string[] {
  const errors: string[] = [];
  const got = new Map(r.channels.map((c) => [c.id, c]));
  const want = new Map(exp.channels.map((c) => [c.id, c]));
  for (const id of want.keys()) if (!got.has(id)) errors.push(`eksik bağlı kanal ${id}`);
  for (const id of got.keys()) if (!want.has(id)) errors.push(`fazla bağlı kanal ${id}`);
  for (const [id, w] of want) {
    const g = got.get(id);
    if (!g) continue;
    if (g.dynamic !== w.dynamic) errors.push(`${id}: dinamik ${g.dynamic} ≠ ${w.dynamic}`);
    if (g.personAGates.join() !== w.personAGates.join() || g.personBGates.join() !== w.personBGates.join()) errors.push(`${id}: kişi kapıları uyuşmuyor`);
  }
  for (const w of exp.centers) {
    const g = r.centers.find((c) => c.code === w.code);
    if (!g) { errors.push(`merkez yok ${w.code}`); continue; }
    if (g.defined !== w.defined) errors.push(`${w.code}: birleşik tanım ${g.defined} ≠ ${w.defined}`);
    if (g.definedBy.join() !== w.definedBy.join()) errors.push(`${w.code}: definedBy [${g.definedBy}] ≠ [${w.definedBy}]`);
  }
  if (r.combinedDefinition !== exp.combinedDefinition) errors.push(`birleşik tanım ${r.combinedDefinition} ≠ ${exp.combinedDefinition}`);
  return errors;
}

/** Kanalın iki merkezinin uygulama kodları (sunum için). */
export function channelCenterCodes(id: string): [HdCenterCode, HdCenterCode] | null {
  const ch = CHANNELS.find((c) => c.id === id);
  return ch ? [ENGINE_TO_APP[ch.centerA], ENGINE_TO_APP[ch.centerB]] : null;
}

/** Kapının merkezi (uygulama kodu). */
export function gateCenterCode(gate: number): HdCenterCode | null {
  const c = GATE_CENTER[gate];
  return c ? ENGINE_TO_APP[c] : null;
}
