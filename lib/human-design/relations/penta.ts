// Human Design PENTA (BG5, 3–5 kişilik grup) — Roxy yanıt doğrulama + normalizasyon + bağımsız
// tutarlılık denetimi (SAF; ağ/DB yok). Connection'dan TAMAMEN ayrı hesap sistemi: ikili ilişki
// sonuçları burada KULLANILMAZ.
//
// Sözleşme: RoxyAPI OpenAPI v2.0.0 `calculatePenta` 200 yanıtı:
//   memberCount · channels[6]{gateA,gateB,name,nameLocalized?,circuit,circuitLocalized?,position,isCore,
//   defined,gateAHeldBy[],gateBHeldBy[]} · gates[12]{gate,gateName,gateNameLocalized?,filled,heldBy[]} ·
//   summary{definedChannels,filledGates,gapGates[],coreDefined}
// heldBy değerleri GÖNDERİLEN üye sırasına göre sıfır tabanlı indekslerdir.

import { toAppChannelCode } from "../normalize/hdAppCodes";

/** Penta'nın sabit 6 kanalı (OpenAPI açıklaması): üst = G→Boğaz, alt = G→Sakral; 2/14 çekirdek. */
export const PENTA_CHANNELS = [
  { id: "7-31", name: "The Alpha", position: "upper" },
  { id: "1-8", name: "Inspiration", position: "upper" },
  { id: "13-33", name: "The Prodigal", position: "upper" },
  { id: "5-15", name: "Rhythm", position: "lower" },
  { id: "2-14", name: "The Beat", position: "lower" },
  { id: "29-46", name: "Discovery", position: "lower" },
] as const;
export const PENTA_GATES = [1, 2, 5, 7, 8, 13, 14, 15, 29, 31, 33, 46] as const;
export const PENTA_MIN_MEMBERS = 3;
export const PENTA_MAX_MEMBERS = 5;

export type HdPentaChannel = {
  id: string;
  gateA: number;
  gateB: number;
  name: string;
  nameLocalized: string | null;
  circuit: string;
  circuitLocalized: string | null;
  position: "upper" | "lower";
  isCore: boolean;
  defined: boolean;
  gateAHeldBy: number[];
  gateBHeldBy: number[];
};

export type HdPentaGate = {
  gate: number;
  gateName: string;
  gateNameLocalized: string | null;
  filled: boolean;
  heldBy: number[];
};

export type HdPentaResult = {
  schema: "hd-penta-1";
  memberCount: number;
  channels: HdPentaChannel[];
  gates: HdPentaGate[];
  summary: { definedChannels: number; filledGates: number; gapGates: number[]; coreDefined: boolean };
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const optStr = (v: unknown): string | null => (isStr(v) ? v.trim().slice(0, 200) : null);
const sortNum = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Ham Roxy Penta yanıtı → doğrulanmış sonuç. memberCount gönderilen üye sayısına eşit olmalı. */
export function validateRoxyPenta(raw: unknown, sentMembers: number): Validation<HdPentaResult> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["yanıt bir JSON nesnesi değil"] };
  if (!isInt(raw.memberCount, PENTA_MIN_MEMBERS, PENTA_MAX_MEMBERS) || raw.memberCount !== sentMembers) {
    errors.push(`memberCount: gönderilen üye sayısı (${sentMembers}) bekleniyor`);
  }
  const idx = (v: unknown) => (Array.isArray(v) && v.every((n) => isInt(n, 0, sentMembers - 1)) ? sortNum(v as number[]) : null);

  const channels: HdPentaChannel[] = [];
  if (!Array.isArray(raw.channels) || raw.channels.length !== 6) errors.push("channels: tam 6 Penta kanalı bekleniyor");
  else {
    raw.channels.forEach((c, i) => {
      if (!isObj(c) || !isInt(c.gateA, 1, 64) || !isInt(c.gateB, 1, 64) || !isStr(c.name) || !isStr(c.circuit) || typeof c.isCore !== "boolean" || typeof c.defined !== "boolean") {
        return void errors.push(`channels[${i}]: zorunlu alan eksik/hatalı`);
      }
      const id = toAppChannelCode(c.gateA, c.gateB);
      const fixed = PENTA_CHANNELS.find((p) => p.id === id);
      if (!id || !fixed) return void errors.push(`channels[${i}]: Penta kanalı değil (${c.gateA}-${c.gateB})`);
      if (channels.some((x) => x.id === id)) return void errors.push(`channels[${i}]: kanal tekrarı ${id}`);
      if (c.position !== fixed.position) return void errors.push(`channels[${i}].position: ${id} için ${fixed.position} bekleniyor`);
      if (c.isCore !== (id === "2-14")) return void errors.push(`channels[${i}].isCore: yalnız 2-14 çekirdektir`);
      const ha = idx(c.gateAHeldBy);
      const hb = idx(c.gateBHeldBy);
      if (!ha || !hb) return void errors.push(`channels[${i}]: gateAHeldBy/gateBHeldBy geçersiz üye indeksi`);
      channels.push({
        id,
        gateA: c.gateA,
        gateB: c.gateB,
        name: c.name.trim().slice(0, 120),
        nameLocalized: optStr(c.nameLocalized),
        circuit: c.circuit.trim().slice(0, 60),
        circuitLocalized: optStr(c.circuitLocalized),
        position: fixed.position,
        isCore: c.isCore,
        defined: c.defined,
        gateAHeldBy: ha,
        gateBHeldBy: hb,
      });
    });
  }

  const gates: HdPentaGate[] = [];
  if (!Array.isArray(raw.gates) || raw.gates.length !== 12) errors.push("gates: tam 12 Penta kapısı bekleniyor");
  else {
    raw.gates.forEach((g, i) => {
      if (!isObj(g) || !isInt(g.gate, 1, 64) || !isStr(g.gateName) || typeof g.filled !== "boolean") {
        return void errors.push(`gates[${i}]: gate/gateName/filled eksik/hatalı`);
      }
      if (!(PENTA_GATES as readonly number[]).includes(g.gate)) return void errors.push(`gates[${i}]: Penta kapısı değil (${g.gate})`);
      if (gates.some((x) => x.gate === g.gate)) return void errors.push(`gates[${i}]: kapı tekrarı ${g.gate}`);
      const held = idx(g.heldBy);
      if (!held) return void errors.push(`gates[${i}].heldBy: geçersiz üye indeksi`);
      gates.push({ gate: g.gate, gateName: g.gateName.trim().slice(0, 120), gateNameLocalized: optStr(g.gateNameLocalized), filled: g.filled, heldBy: held });
    });
  }

  const s = raw.summary;
  if (!isObj(s) || !isInt(s.definedChannels, 0, 6) || !isInt(s.filledGates, 0, 12) || !Array.isArray(s.gapGates) || !s.gapGates.every((n) => isInt(n, 1, 64)) || typeof s.coreDefined !== "boolean") {
    errors.push("summary: definedChannels/filledGates/gapGates/coreDefined eksik/hatalı");
  }
  if (errors.length > 0) return { ok: false, errors };

  // İç tutarlılık (yalnız OpenAPI tanımlarından).
  const sum = s as Obj;
  const gateBy = new Map(gates.map((g) => [g.gate, g]));
  for (const g of gates) if (g.filled !== g.heldBy.length > 0) errors.push(`kapı ${g.gate}: filled ↔ heldBy çelişkisi`);
  for (const c of channels) {
    const ga = gateBy.get(c.gateA);
    const gb = gateBy.get(c.gateB);
    if (!ga || !gb) { errors.push(`${c.id}: kapı listede yok`); continue; }
    if (ga.heldBy.join() !== c.gateAHeldBy.join() || gb.heldBy.join() !== c.gateBHeldBy.join()) errors.push(`${c.id}: kanal ↔ kapı sahipliği çelişkisi`);
    if (c.defined !== (ga.filled && gb.filled)) errors.push(`${c.id}: defined ↔ kapı dolulukları çelişkisi`);
  }
  const gaps = sortNum((sum.gapGates as number[]));
  if (gaps.join() !== gates.filter((g) => !g.filled).map((g) => g.gate).sort((a, b) => a - b).join()) errors.push("summary.gapGates ↔ kapılar çelişkisi");
  if (sum.definedChannels !== channels.filter((c) => c.defined).length) errors.push("summary.definedChannels ↔ kanallar çelişkisi");
  if (sum.filledGates !== gates.filter((g) => g.filled).length) errors.push("summary.filledGates ↔ kapılar çelişkisi");
  if (sum.coreDefined !== channels.find((c) => c.id === "2-14")?.defined) errors.push("summary.coreDefined ↔ 2-14 çelişkisi");
  if (errors.length > 0) return { ok: false, errors };

  const order = PENTA_CHANNELS.map((p) => p.id as string);
  channels.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  gates.sort((a, b) => a.gate - b.gate);
  return {
    ok: true,
    value: {
      schema: "hd-penta-1",
      memberCount: sentMembers,
      channels,
      gates,
      summary: { definedChannels: sum.definedChannels as number, filledGates: sum.filledGates as number, gapGates: gaps, coreDefined: sum.coreDefined as boolean },
    },
  };
}

/** Bağımsız beklenen Penta kapı sahipliği (kayıtlı bireysel haritalardan, üye sırasıyla). */
export function expectedPentaHeldBy(memberGates: ReadonlyArray<Iterable<number>>): Map<number, number[]> {
  const sets = memberGates.map((g) => new Set(g));
  return new Map(PENTA_GATES.map((gate) => [gate, sets.flatMap((s, i) => (s.has(gate) ? [i] : []))]));
}

/** Roxy Penta yanıtı ↔ kayıtlı bireysel haritalar. Boş liste = tutarlı. */
export function checkPentaConsistency(r: HdPentaResult, memberGates: ReadonlyArray<Iterable<number>>): string[] {
  const exp = expectedPentaHeldBy(memberGates);
  const errors: string[] = [];
  for (const g of r.gates) {
    const w = exp.get(g.gate) ?? [];
    if (g.heldBy.join() !== w.join()) errors.push(`kapı ${g.gate}: heldBy [${g.heldBy}] ≠ kayıtlı haritalardan [${w}]`);
  }
  return errors;
}
