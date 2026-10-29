// Doğaltaş Kütüphanesi · owner inceleme görünümü (SAF). owner_stone RPC çıktısını alan × kaynak bazında TR/EN yan yana
// karşılaştırmaya çevirir: güncel sürüm, bekleyen sürümler, kalite işaretleri, sağlık / hukuk durumu.

export type OwnerRecordRow = {
  id: string; source_id: string; field_key: string; lang: "tr" | "en"; version: number; origin: string; content: string;
  is_current: boolean; review_state: string; visibility: string; health_sensitive: boolean; legal_cleared_at: string | null;
  quality_flags?: string[]; deleted_at: string | null; created_at: string;
};

export type CompareCell = {
  current: { id: string; version: number; content: string; review_state: string; visibility: string; flags: string[]; health: boolean; legal: boolean; origin: string } | null;
  pending: { id: string; version: number; content: string; flags: string[]; origin: string }[];
  history: number;
};

export type CompareRow = { source_id: string; field: string; tr: CompareCell; en: CompareCell; trEqualsEn: boolean };

const FIELD_ORDER = ["description", "meaning_spiritual", "meaning_emotional", "meaning_physical", "affirmation", "general", "usage",
  "meditation", "care", "cleansing", "warning", "history", "other"];

function cell(rows: OwnerRecordRow[]): CompareCell {
  const live = rows.filter((r) => !r.deleted_at);
  const cur = live.find((r) => r.is_current) ?? null;
  return {
    current: cur ? { id: cur.id, version: cur.version, content: cur.content, review_state: cur.review_state, visibility: cur.visibility,
      flags: cur.quality_flags ?? [], health: cur.health_sensitive, legal: !!cur.legal_cleared_at, origin: cur.origin } : null,
    pending: live.filter((r) => !r.is_current && r.review_state === "pending").sort((a, b) => b.version - a.version)
      .map((r) => ({ id: r.id, version: r.version, content: r.content, flags: r.quality_flags ?? [], origin: r.origin })),
    history: rows.length,
  };
}

export function buildOwnerCompare(records: OwnerRecordRow[]): CompareRow[] {
  const keys = new Map<string, { source_id: string; field: string }>();
  for (const r of records) keys.set(`${r.source_id}|${r.field_key}`, { source_id: r.source_id, field: r.field_key });
  const out: CompareRow[] = [];
  for (const { source_id, field } of keys.values()) {
    const tr = cell(records.filter((r) => r.source_id === source_id && r.field_key === field && r.lang === "tr"));
    const en = cell(records.filter((r) => r.source_id === source_id && r.field_key === field && r.lang === "en"));
    const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    out.push({ source_id, field, tr, en, trEqualsEn: !!tr.current && !!en.current && norm(tr.current.content) === norm(en.current.content) });
  }
  return out.sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field) || a.source_id.localeCompare(b.source_id));
}
