/**
 * KİŞİSEL DİJİTAL OFİS — veri servisi (YALNIZ SUNUCU; service-role db).
 *
 * Sahiplik: her sorgu tenant_id + user_id ile daraltılır; ikisi de YALNIZ kimlik doğrulamasından (verifyUserRequest) gelir,
 * istemci gövdesinden asla. service-role RLS'yi aştığı için bu daraltma zorunludur.
 *
 * Eşzamanlılık: her yazma "version = beklenen" koşuluyla yapılır; tutmazsa { conflict } döner (API 409).
 * Veritabanı tetikleyicisi de sürümün tam 1 artmasını ve kimlik kolonlarının değişmemesini zorlar.
 *
 * Silme YOK: tasarım/tercih satırı silinmez; "sıfırla" yalnız görsel tasarımı varsayılana döndürür
 * (eski tasarım geçmişe girer), modül tercihleri (expert_ui_prefs) DEĞİŞMEZ. Modül yetkilerine dokunulmaz.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { HISTORY_MAX, WORKSPACE_SCHEMA_VERSION } from "./catalog";
import { checkDesignContrast, type ContrastIssue } from "./contrast";
import { DEFAULT_UI_PREFS, parseDesign, type UiPrefs, type WorkspaceDesign } from "./schema";

assertServerOnly("lib/workspace/service");

export const DESIGNS_TABLE = "expert_workspace_designs";
export const PREFS_TABLE = "expert_ui_prefs";

export type Owner = { tenantId: string; userId: string };
export type HistoryEntry = { id: string; savedAt: string; design: WorkspaceDesign };
export type DesignState = { applied: WorkspaceDesign | null; draft: WorkspaceDesign | null; history: HistoryEntry[]; schemaVersion: number; version: number; updatedAt: string | null };
export type PrefsState = UiPrefs & { schemaVersion: number; version: number; updatedAt: string | null };

export type DesignAction =
  | { action: "saveDraft"; draft: WorkspaceDesign }
  | { action: "discardDraft" }
  | { action: "apply"; draft?: WorkspaceDesign }
  | { action: "restore"; historyId: string }
  | { action: "loadHistory"; historyId: string }
  | { action: "reset" };

export type WriteResult<T> =
  | { ok: true; state: T }
  | { ok: false; kind: "conflict"; current: T }
  | { ok: false; kind: "invalid"; error: string }
  | { ok: false; kind: "db"; cause: unknown };

const DESIGN_COLS = "applied, draft, history, schema_version, version, updated_at";
const PREFS_COLS = "hidden_modules, favorites, card_level, view_mode, reading, schema_version, version, updated_at";

type DesignRow = { applied: unknown; draft: unknown; history: unknown; schema_version: number; version: number; updated_at: string };
type PrefsRow = { hidden_modules: string[]; favorites: string[]; card_level: string; view_mode: string; reading: Record<string, unknown>; schema_version: number; version: number; updated_at: string };

export const EMPTY_DESIGN_STATE: DesignState = { applied: null, draft: null, history: [], schemaVersion: WORKSPACE_SCHEMA_VERSION, version: 0, updatedAt: null };

/** Kayıtlı JSON'u bugünkü şemadan geçirir; geçmeyen değer okunurken yok sayılır (veri SİLİNMEZ, yalnız gösterilmez). */
function safeDesign(v: unknown): WorkspaceDesign | null {
  if (v === null || v === undefined) return null;
  const p = parseDesign(v, { allowAssets: true });
  return p.ok ? p.value : null;
}

function toDesignState(row: DesignRow | null): DesignState {
  if (!row) return { ...EMPTY_DESIGN_STATE, history: [] };
  const history = Array.isArray(row.history)
    ? (row.history as unknown[]).flatMap((h) => {
        const e = h as { id?: unknown; savedAt?: unknown; design?: unknown };
        const design = safeDesign(e?.design);
        return design && typeof e.id === "string" && typeof e.savedAt === "string" ? [{ id: e.id, savedAt: e.savedAt, design }] : [];
      })
    : [];
  return { applied: safeDesign(row.applied), draft: safeDesign(row.draft), history, schemaVersion: row.schema_version, version: row.version, updatedAt: row.updated_at };
}

function toPrefsState(row: PrefsRow | null): PrefsState {
  if (!row) return { ...DEFAULT_UI_PREFS, hiddenModules: [], favorites: [], reading: { ...DEFAULT_UI_PREFS.reading }, schemaVersion: WORKSPACE_SCHEMA_VERSION, version: 0, updatedAt: null };
  const r = row.reading ?? {};
  return {
    hiddenModules: [...row.hidden_modules],
    favorites: [...row.favorites],
    cardLevel: row.card_level === "module" ? "module" : "center",
    viewMode: (["auto", "day", "night", "reading", "focus"].includes(row.view_mode) ? row.view_mode : "auto") as UiPrefs["viewMode"],
    reading: {
      scale: typeof r.scale === "number" ? r.scale : DEFAULT_UI_PREFS.reading.scale,
      lineHeight: typeof r.lineHeight === "number" ? r.lineHeight : DEFAULT_UI_PREFS.reading.lineHeight,
      width: r.width === 58 || r.width === 80 ? r.width : 68,
    },
    schemaVersion: row.schema_version,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

async function readDesignRow(db: SupabaseClient, o: Owner): Promise<{ row: DesignRow | null; error: unknown }> {
  const { data, error } = await db.from(DESIGNS_TABLE).select(DESIGN_COLS).eq("tenant_id", o.tenantId).eq("user_id", o.userId).maybeSingle();
  return { row: (data as DesignRow | null) ?? null, error };
}

async function readPrefsRow(db: SupabaseClient, o: Owner): Promise<{ row: PrefsRow | null; error: unknown }> {
  const { data, error } = await db.from(PREFS_TABLE).select(PREFS_COLS).eq("tenant_id", o.tenantId).eq("user_id", o.userId).maybeSingle();
  return { row: (data as PrefsRow | null) ?? null, error };
}

export async function getDesign(db: SupabaseClient, o: Owner): Promise<{ ok: true; state: DesignState } | { ok: false; cause: unknown }> {
  const { row, error } = await readDesignRow(db, o);
  if (error) return { ok: false, cause: error };
  return { ok: true, state: toDesignState(row) };
}

export async function getPrefs(db: SupabaseClient, o: Owner): Promise<{ ok: true; state: PrefsState } | { ok: false; cause: unknown }> {
  const { row, error } = await readPrefsRow(db, o);
  if (error) return { ok: false, cause: error };
  return { ok: true, state: toPrefsState(row) };
}

export type RawDesign = { applied: unknown; draft: unknown; history: unknown[] };

function rawOf(row: DesignRow | null): RawDesign {
  return { applied: row?.applied ?? null, draft: row?.draft ?? null, history: Array.isArray(row?.history) ? [...(row!.history as unknown[])] : [] };
}

function pushHistory(history: unknown[], design: unknown, now: string): unknown[] {
  if (design === null || design === undefined) return history;
  return [{ id: randomUUID(), savedAt: now, design }, ...history].slice(0, HISTORY_MAX);
}

const entryId = (h: unknown) => (h as { id?: unknown } | null)?.id;

/**
 * Saf geçiş fonksiyonu: mevcut HAM durum + işlem → yeni ham (applied, draft, history).
 * Dokunulmayan alanlar ham hâliyle aynen korunur (bugünkü şemayla okunamayan eski kayıt bile kaybolmaz).
 */
export function nextDesignState(cur: RawDesign, a: DesignAction, now: string): { ok: true; next: RawDesign } | { ok: false; error: string } {
  const pick = (id: string): { ok: true; design: WorkspaceDesign } | { ok: false; error: string } => {
    const e = cur.history.find((h) => entryId(h) === id);
    if (!e) return { ok: false, error: "Geçmiş tasarım bulunamadı." };
    const d = safeDesign((e as { design?: unknown }).design);
    return d ? { ok: true, design: d } : { ok: false, error: "Bu geçmiş tasarım güncel sürümle açılamıyor." };
  };
  switch (a.action) {
    case "saveDraft":
      return { ok: true, next: { ...cur, draft: a.draft } };
    case "discardDraft":
      return { ok: true, next: { ...cur, draft: null } };
    case "apply": {
      const d = a.draft ?? safeDesign(cur.draft);
      if (!d) return { ok: false, error: "Uygulanacak taslak yok." };
      return { ok: true, next: { applied: d, draft: null, history: pushHistory(cur.history, cur.applied, now) } };
    }
    case "restore": {
      const r = pick(a.historyId);
      if (!r.ok) return { ok: false, error: r.error };
      const rest = cur.history.filter((h) => entryId(h) !== a.historyId);
      return { ok: true, next: { applied: r.design, draft: null, history: pushHistory(rest, cur.applied, now) } };
    }
    case "loadHistory": {
      const r = pick(a.historyId);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, next: { ...cur, draft: r.design } };
    }
    case "reset":
      // Owner kararı (P0 kapanış): yalnız görsel tasarım sıfırlanır; gizlenen modüller ve Favorilerim (ayrı tablo) korunur.
      return { ok: true, next: { applied: null, draft: null, history: pushHistory(cur.history, cur.applied, now) } };
  }
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "23505";

export async function writeDesign(
  db: SupabaseClient, o: Owner, expectedVersion: number, a: DesignAction,
): Promise<WriteResult<DesignState> | { ok: false; kind: "contrast"; issues: ContrastIssue[] }> {
  const { row, error } = await readDesignRow(db, o);
  if (error) return { ok: false, kind: "db", cause: error };
  const cur = toDesignState(row);
  if (cur.version !== expectedVersion) return { ok: false, kind: "conflict", current: cur };
  const step = nextDesignState(rawOf(row), a, new Date().toISOString());
  if (!step.ok) return { ok: false, kind: "invalid", error: step.error };
  // Owner kararı 1: aktif görünümü değiştiren işlemde sunucunun ölçebildiği kontrast kuralları zorunludur (taslak serbest).
  if (a.action === "apply" || a.action === "restore") {
    const issues = checkDesignContrast(step.next.applied as WorkspaceDesign);
    if (issues.length) return { ok: false, kind: "contrast", issues };
  }
  const fields = { applied: step.next.applied, draft: step.next.draft, history: step.next.history, schema_version: WORKSPACE_SCHEMA_VERSION };

  if (expectedVersion === 0) {
    const ins = await db.from(DESIGNS_TABLE).insert({ tenant_id: o.tenantId, user_id: o.userId, ...fields, version: 1 }).select(DESIGN_COLS).single();
    if (ins.error) {
      if (!isUniqueViolation(ins.error)) return { ok: false, kind: "db", cause: ins.error };
      const again = await readDesignRow(db, o);
      return { ok: false, kind: "conflict", current: toDesignState(again.row) };
    }
    return { ok: true, state: toDesignState(ins.data as DesignRow) };
  }

  const upd = await db
    .from(DESIGNS_TABLE)
    .update({ ...fields, version: expectedVersion + 1 })
    .eq("tenant_id", o.tenantId)
    .eq("user_id", o.userId)
    .eq("version", expectedVersion)
    .select(DESIGN_COLS);
  if (upd.error) return { ok: false, kind: "db", cause: upd.error };
  const rows = (upd.data ?? []) as DesignRow[];
  if (rows.length !== 1) {
    const again = await readDesignRow(db, o);
    return { ok: false, kind: "conflict", current: toDesignState(again.row) };
  }
  return { ok: true, state: toDesignState(rows[0]) };
}

export async function writePrefs(db: SupabaseClient, o: Owner, expectedVersion: number, p: UiPrefs): Promise<WriteResult<PrefsState>> {
  const fields = { hidden_modules: p.hiddenModules, favorites: p.favorites, card_level: p.cardLevel, view_mode: p.viewMode, reading: p.reading, schema_version: WORKSPACE_SCHEMA_VERSION };
  const cur = await readPrefsRow(db, o);
  if (cur.error) return { ok: false, kind: "db", cause: cur.error };
  if ((cur.row?.version ?? 0) !== expectedVersion) return { ok: false, kind: "conflict", current: toPrefsState(cur.row) };

  if (expectedVersion === 0) {
    const ins = await db.from(PREFS_TABLE).insert({ tenant_id: o.tenantId, user_id: o.userId, ...fields, version: 1 }).select(PREFS_COLS).single();
    if (ins.error) {
      if (!isUniqueViolation(ins.error)) return { ok: false, kind: "db", cause: ins.error };
      const again = await readPrefsRow(db, o);
      return { ok: false, kind: "conflict", current: toPrefsState(again.row) };
    }
    return { ok: true, state: toPrefsState(ins.data as PrefsRow) };
  }

  const upd = await db
    .from(PREFS_TABLE)
    .update({ ...fields, version: expectedVersion + 1 })
    .eq("tenant_id", o.tenantId)
    .eq("user_id", o.userId)
    .eq("version", expectedVersion)
    .select(PREFS_COLS);
  if (upd.error) return { ok: false, kind: "db", cause: upd.error };
  const rows = (upd.data ?? []) as PrefsRow[];
  if (rows.length !== 1) {
    const again = await readPrefsRow(db, o);
    if (again.error) return { ok: false, kind: "db", cause: again.error };
    return { ok: false, kind: "conflict", current: toPrefsState(again.row) };
  }
  return { ok: true, state: toPrefsState(rows[0]) };
}
