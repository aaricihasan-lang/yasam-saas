/**
 * HD Chart → Canonical · "Kişinin Human Design Bilgileri" DETERMİNİSTİK ASSEMBLER
 * =============================================================================
 *
 * SAF çekirdek (DB/ağ/AI yok): bir stored chart'tan (manuel veya computed derived
 * scalar kolonları) canonical anahtar yapısı + tamamlanmış kanal + asılı kapı
 * çözümü üretir. Mapping REUSE: consultation/normalizeChart (Tip/Otorite RAW+
 * snake_case, fail-loud) + knowledge-system/canonicalKeys builder'ları. İkinci
 * mapping/registry İCAT EDİLMEZ.
 *
 * İçerik (canonical prose) AYRI katmandan (published-only batched read) enjekte
 * edilir → `assemblePersonalKnowledge`. Bilinmeyen/geçersiz değer SESSİZCE
 * atlanmaz: `unresolved[]` (fail-loud). AI/synthesis/rewrite YOK.
 */

import { normalizeChartToCanonicalKeys, type StoredChartLike } from "@/lib/human-design/consultation/normalizeChart";
import {
  buildHdChannelCanonicalKeyFromCode,
  buildHdGateCanonicalKey,
  isValidGateNumber,
} from "@/lib/human-design/knowledge-system/canonicalKeys";
import { resolveChannelsAndHanging } from "./hangingGate";
import type { HdKnowledgeContent } from "./expertReadTypes";

export type { StoredChartLike };
export type CanonicalContent = HdKnowledgeContent;

export type PkUnresolved = {
  field: "type" | "authority" | "gate" | "channel";
  raw: unknown;
  reason: string;
};

export type PkGate = { key: string; gate: number; inCompletedChannel: boolean };
export type PkChannel = { key: string; code: string; name: string; gates: [number, number] };
export type PkHangingGate = {
  key: string;
  gate: number;
  potentialChannels: Array<{ key: string; code: string; name: string; partnerGate: number }>;
};

/** SAF yapı — içerik (prose) henüz yok; yalnız canonical kimlik/yapı. */
export type PkStructure = {
  typeKey: string | null;
  authorityKey: string | null;
  /** Tamamlanmış kanal İÇİNDE OLMAYAN benzersiz kapılar (bağımsız). */
  independentGates: PkGate[];
  /** Tamamlanmış kanal içindeki kapılar dahil TÜM benzersiz kapılar (metadata). */
  allGates: PkGate[];
  completedChannels: PkChannel[];
  hangingGates: PkHangingGate[];
  /** Batched published read için gerekli benzersiz canonical anahtarlar. */
  allKeys: string[];
  unresolved: PkUnresolved[];
};

function safeIdentityKey(chart: { type_code?: unknown } | { authority_code?: unknown }, prefix: "tip_" | "otorite_", field: "type" | "authority", raw: unknown, unresolved: PkUnresolved[]): string | null {
  try {
    const keys = normalizeChartToCanonicalKeys(chart as StoredChartLike);
    return keys.find((k) => k.startsWith(prefix)) ?? null;
  } catch (e) {
    unresolved.push({ field, raw, reason: e instanceof Error ? e.message : "bilinmeyen değer" });
    return null;
  }
}

/** SAF: chart scalar'larından canonical yapı. DB/içerik YOK. Deterministik. */
export function buildPersonalKnowledgeStructure(chart: StoredChartLike): PkStructure {
  const unresolved: PkUnresolved[] = [];

  // ── Tip / Otorite (normalizeChart REUSE; RAW+snake, fail-loud) ──
  const typeKey = safeIdentityKey({ type_code: chart.type_code }, "tip_", "type", chart.type_code, unresolved);
  const authorityKey = safeIdentityKey({ authority_code: chart.authority_code }, "otorite_", "authority", chart.authority_code, unresolved);

  // ── Kapılar: benzersiz + geçerli (1–64) ──
  const rawGates = Array.isArray(chart.gates) ? chart.gates : [];
  const validGates: number[] = [];
  for (const g of rawGates) {
    if (isValidGateNumber(g)) validGates.push(g);
    else unresolved.push({ field: "gate", raw: g, reason: "geçersiz kapı (1–64 bekleniyor)" });
  }
  const uniqueGates = [...new Set(validGates)].sort((a, b) => a - b);

  // ── Tamamlanmış kanal + asılı kapı (registry-türev; deterministik) ──
  const resolution = resolveChannelsAndHanging(uniqueGates);
  const channeled = new Set(resolution.channeledGates);

  const completedChannels: PkChannel[] = [];
  for (const c of resolution.completedChannels) {
    try {
      const key = buildHdChannelCanonicalKeyFromCode(c.code);
      completedChannels.push({ key, code: c.code, name: c.name, gates: [c.gateA, c.gateB] });
    } catch (e) {
      unresolved.push({ field: "channel", raw: c.code, reason: e instanceof Error ? e.message : "kanal anahtarı üretilemedi" });
    }
  }

  const allGates: PkGate[] = uniqueGates.map((gate) => ({
    key: buildHdGateCanonicalKey(gate),
    gate,
    inCompletedChannel: channeled.has(gate),
  }));
  const independentGates = allGates.filter((g) => !g.inCompletedChannel);

  const hangingGates: PkHangingGate[] = resolution.hangingGates.map((hg) => ({
    key: buildHdGateCanonicalKey(hg.gate),
    gate: hg.gate,
    potentialChannels: hg.potentialChannels
      .map((p) => {
        try {
          return { key: buildHdChannelCanonicalKeyFromCode(p.code), code: p.code, name: p.name, partnerGate: p.partnerGate };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  }));

  // ── Stored channels çapraz-kontrol (manuel tutarsızlık uyarısı; bloklamaz) ──
  const completedCodes = new Set(completedChannels.map((c) => c.code));
  const rawChannels = Array.isArray(chart.channels) ? chart.channels : [];
  for (const rc of rawChannels) {
    if (typeof rc !== "string") { unresolved.push({ field: "channel", raw: rc, reason: "kanal kodu string değil" }); continue; }
    let ok = false;
    try { buildHdChannelCanonicalKeyFromCode(rc); ok = true; } catch { ok = false; }
    if (!ok) { unresolved.push({ field: "channel", raw: rc, reason: "resmi 36 kanal değil / ters yön / geçersiz biçim" }); continue; }
    if (!completedCodes.has(rc)) {
      unresolved.push({ field: "channel", raw: rc, reason: "kanal işaretli ama iki kapısı chart'ta aktif değil (gate-türev tamamlanmış sayılmadı)" });
    }
  }

  // ── Batched read için benzersiz anahtar seti ──
  const allKeys = [
    ...(typeKey ? [typeKey] : []),
    ...(authorityKey ? [authorityKey] : []),
    ...allGates.map((g) => g.key),
    ...completedChannels.map((c) => c.key),
  ];

  return {
    typeKey,
    authorityKey,
    independentGates,
    allGates,
    completedChannels,
    hangingGates,
    allKeys: [...new Set(allKeys)],
    unresolved,
  };
}

// ── İçerik enjekte edilmiş nihai DTO ────────────────────────────────────────

export type HdPersonalKnowledge = {
  chartRef: { chartId: string; source: "manual" | "computed" };
  identity: {
    type: { key: string | null; content: CanonicalContent | null };
    authority: { key: string | null; content: CanonicalContent | null };
  };
  channels: Array<PkChannel & { content: CanonicalContent | null }>;
  /** Bağımsız (tamamlanmış kanalda olmayan) kapılar. */
  gates: Array<PkGate & { content: CanonicalContent | null }>;
  hangingGates: Array<{ key: string; gate: number; hangingContext: string | null; potentialChannels: PkHangingGate["potentialChannels"] }>;
  unresolved: PkUnresolved[];
  provenance: { readAt: string };
  /** Hiç yayınlanmış canonical içerik yoksa true (UI panel-level "yayınlanmadı"). */
  allUnpublished: boolean;
};

/** SAF birleştirme: yapı + published içerik haritası → nihai DTO. */
export function assemblePersonalKnowledge(
  chartRef: { chartId: string; source: "manual" | "computed" },
  structure: PkStructure,
  contentByKey: ReadonlyMap<string, CanonicalContent | null>,
  readAt: string,
): HdPersonalKnowledge {
  const get = (key: string | null): CanonicalContent | null => (key ? contentByKey.get(key) ?? null : null);

  const channels = structure.completedChannels.map((c) => ({ ...c, content: get(c.key) }));
  const gates = structure.independentGates.map((g) => ({ ...g, content: get(g.key) }));
  const hangingGates = structure.hangingGates.map((hg) => {
    const content = get(hg.key);
    return {
      key: hg.key,
      gate: hg.gate,
      hangingContext: content?.hanging_gate_context ?? null,
      potentialChannels: hg.potentialChannels,
    };
  });

  const anyPublished =
    get(structure.typeKey) !== null ||
    get(structure.authorityKey) !== null ||
    channels.some((c) => c.content !== null) ||
    gates.some((g) => g.content !== null) ||
    hangingGates.some((h) => h.hangingContext !== null);

  return {
    chartRef,
    identity: {
      type: { key: structure.typeKey, content: get(structure.typeKey) },
      authority: { key: structure.authorityKey, content: get(structure.authorityKey) },
    },
    channels,
    gates,
    hangingGates,
    unresolved: structure.unresolved,
    provenance: { readAt },
    allUnpublished: !anyPublished,
  };
}
