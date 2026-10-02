/**
 * Refleksoloji protokol senkron çekirdeği (SAF) — FA-42 / DL-007.
 *
 *  - decideProtocolCas: by-uid PUT için iyimser eşzamanlılık kararı. reflexology_protocols
 *    tablosunda updated_at KOLONU YOK (migration bu pakette yok) → sürüm belirteci
 *    olarak istemcinin yazdığı `raw_json.updatedAt` kullanılır. Organ-adı cascade'i de
 *    bu alanı artırır (bkz. /api/refleksoloji/protocols/organ).
 *  - classifyLegacyProtocols: eski cihaz-geneli protokol kopyalarının sahipliği.
 */

import { parseOrganList } from "./organs";

export type ProtocolCasDecision = { ok: true } | { ok: false; code: "PROTOCOL_STALE" };

/**
 * expected yoksa (eski istemci / organ cascade) → koşulsuz (geriye dönük uyumlu).
 * Sunucu satırında sürüm yoksa (eski kayıt) → kabul (karşılaştırılacak belirteç yok).
 * Aksi halde birebir eşit olmalı.
 */
export function decideProtocolCas(
  expected: string | null,
  currentVersion: string | null | undefined,
): ProtocolCasDecision {
  if (!expected) return { ok: true };
  if (typeof currentVersion !== "string" || !currentVersion) return { ok: true };
  return currentVersion === expected ? { ok: true } : { ok: false, code: "PROTOCOL_STALE" };
}

/**
 * P1-5 (protokol diriltme): by-uid PUT'ta hedef satır YOKSA ne yapılır.
 *   - expected YOK  → istemci satırı hiç görmedi (yeni / sunucuya hiç gitmemiş kayıt) → insert
 *   - expected VAR  → istemci satırı GÖRMÜŞTÜ; satır artık yok = başka cihazda SİLİNDİ →
 *     409 PROTOCOL_DELETED (bayat düzenleme silinen protokolü DİRİLTMEZ)
 */
export type ProtocolMissingRowDecision =
  | { kind: "insert" }
  | { kind: "conflict"; code: "PROTOCOL_DELETED" };

export function decideProtocolMissingRow(expected: string | null): ProtocolMissingRowDecision {
  return expected ? { kind: "conflict", code: "PROTOCOL_DELETED" } : { kind: "insert" };
}

export const PROTOCOL_DELETED_ERROR =
  "Bu protokol başka bir cihazda silinmiş; değişiklik kaydedilmedi ve protokol yeniden oluşturulmadı. Gerekirse «Yeni protokol oluştur» ile yeniden kaydedin.";

/** raw_json içinden istemci sürüm belirteci. */
export function protocolRowVersion(rawJson: unknown): string | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const v = (rawJson as { updatedAt?: unknown }).updatedAt;
  return typeof v === "string" && v ? v : null;
}

export type LegacyProtocolLike = {
  id: string;
  title: string;
  description: string;
  organs: string[];
  notes: string;
};

export type ServerProtocolRowLike = {
  source_uid: string | null;
  title: string | null;
  target_problem: string | null;
  organs: string | null;
  application_notes: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim();

function sameProtocolContent(l: LegacyProtocolLike, r: ServerProtocolRowLike): boolean {
  const lo = l.organs.map((o) => o.trim()).filter(Boolean).join("|").toLocaleLowerCase("tr");
  const ro = parseOrganList(r.organs).join("|").toLocaleLowerCase("tr");
  return (
    norm(l.title) === norm(r.title) &&
    norm(l.description) === norm(r.target_problem) &&
    norm(l.notes) === norm(r.application_notes) &&
    lo === ro
  );
}

/**
 * Eski protokol kopyaları:
 *   - aynı source_uid + BİREBİR aynı içerik sunucuda → sahiplik kanıtlı → benimsenir
 *     (kapsamlı yerel kopyaya alınır; içerik zaten sunucuda)
 *   - diğer her şey (sunucuda yok / içerik farklı) → karantina (kullanıcı kararı)
 */
export function classifyLegacyProtocols<T extends LegacyProtocolLike>(
  legacy: T[],
  serverRows: ServerProtocolRowLike[],
): { adopt: T[]; quarantine: T[] } {
  const byUid = new Map<string, ServerProtocolRowLike>();
  for (const r of serverRows) if (r?.source_uid) byUid.set(r.source_uid, r);
  const adopt: T[] = [];
  const quarantine: T[] = [];
  for (const l of legacy) {
    if (!l?.id) continue;
    const r = byUid.get(l.id);
    if (r && sameProtocolContent(l, r)) adopt.push(l);
    else quarantine.push(l);
  }
  return { adopt, quarantine };
}
