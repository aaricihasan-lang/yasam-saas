// Birleşik (Connection) BodyGraph MODELİ — SAF. Kaynak: katılımcıların KAYITLI bireysel aktif kapıları +
// KAYITLI, doğrulanmış Connection sonucu. Yeni hesap / Roxy çağrısı YOK.
//
// Tek kural: çizimde TANIMLI görünen kanallar = kayıtlı sonuç listesi (kimlik + dinamik + kişi kapıları).
// Kapılardan türetilen bağlı kanal kümesi sonuçla BİREBİR örtüşmezse model ÜRETİLMEZ (ok:false) →
// ekran güvenli yedek şemayı gösterir (uydurma çizim yok).

import { CHANNELS } from "../engine/channels";
import { connectionDynamicFor, type ConnectionDynamic, type HdConnectionResult } from "./connection";
import type { HdCenterCode } from "../types";

export type Holder = "A" | "B" | "both";
export type CompositeChannelState =
  | { id: string; state: "defined"; dynamic: ConnectionDynamic; holderA: Holder; holderB: Holder; personAGates: number[]; personBGates: number[] }
  | { id: string; state: "half"; holderA: Holder | null; holderB: Holder | null }
  | { id: string; state: "none" };

export type CompositeModel = {
  gates: Record<number, Holder | null>;
  channels: Record<string, CompositeChannelState>;
  centers: Array<{ code: HdCenterCode; defined: boolean; definedBy: Array<"A" | "B"> }>;
  definedChannelIds: string[];
  combinedDefinition: HdConnectionResult["combinedDefinition"];
};

export type CompositeBuild = { ok: true; model: CompositeModel } | { ok: false; reason: string };

export function buildCompositeModel(gatesA: readonly number[] | null, gatesB: readonly number[] | null, result: HdConnectionResult): CompositeBuild {
  if (!gatesA || !gatesB) return { ok: false, reason: "kaynak bireysel aktivasyon verisi yok" };
  const A = new Set(gatesA);
  const B = new Set(gatesB);
  const holder = (g: number): Holder | null => (A.has(g) && B.has(g) ? "both" : A.has(g) ? "A" : B.has(g) ? "B" : null);
  const gates: Record<number, Holder | null> = {};
  for (let g = 1; g <= 64; g++) gates[g] = holder(g);

  const byId = new Map(result.channels.map((c) => [c.id, c]));
  const channels: Record<string, CompositeChannelState> = {};
  const derived: string[] = [];
  for (const ch of CHANNELS) {
    const lo = Math.min(ch.gateA, ch.gateB);
    const hi = Math.max(ch.gateA, ch.gateB);
    const hA = holder(lo);
    const hB = holder(hi);
    if (hA && hB) {
      derived.push(ch.id);
      const r = byId.get(ch.id);
      const pa = [lo, hi].filter((g) => A.has(g));
      const pb = [lo, hi].filter((g) => B.has(g));
      const dyn = connectionDynamicFor(pa.length, pb.length);
      if (!r) return { ok: false, reason: `sonuçta olmayan bağlı kanal ${ch.id}` };
      if (r.dynamic !== dyn) return { ok: false, reason: `${ch.id} dinamiği uyuşmuyor` };
      if (r.personAGates.join() !== pa.join() || r.personBGates.join() !== pb.join()) return { ok: false, reason: `${ch.id} kişi kapıları uyuşmuyor` };
      channels[ch.id] = { id: ch.id, state: "defined", dynamic: r.dynamic, holderA: hA, holderB: hB, personAGates: pa, personBGates: pb };
    } else if (hA || hB) {
      channels[ch.id] = { id: ch.id, state: "half", holderA: hA, holderB: hB };
    } else {
      channels[ch.id] = { id: ch.id, state: "none" };
    }
  }
  const resultIds = result.channels.map((c) => c.id).sort();
  if (derived.slice().sort().join() !== resultIds.join()) return { ok: false, reason: "kanal listesi kayıtlı sonuçla birebir değil" };
  return {
    ok: true,
    model: {
      gates,
      channels,
      centers: result.centers.map((c) => ({ code: c.code, defined: c.defined, definedBy: c.definedBy })),
      definedChannelIds: resultIds,
      combinedDefinition: result.combinedDefinition,
    },
  };
}
