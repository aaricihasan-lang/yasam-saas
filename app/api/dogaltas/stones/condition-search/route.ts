import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { STONES_LIST_EXTENDED_SELECT } from "@/lib/dogaltas/stonesListFetch";
import { serverErrorResponse } from "@/lib/http/apiError";
import {
  SEARCH_TYPES,
  type SearchType,
  type SearchCondition,
  type ConditionStone,
  evaluateStoneConditions,
  collectSuggestions,
  buildTypeCounts,
} from "@/lib/dogaltas/stoneConditionSearch";
import { containsTr, stoneHasWarning } from "@/lib/dogaltas/stoneSearchUtils";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * POST /api/dogaltas/stones/condition-search — SERVER-SIDE çok-kriterli (AND) taş
 * araması + opsiyonel metin/uyarı filtresi (F-01 / DT-S1 / §5).
 *
 * AMAÇ: "Mineralle Taş Bul" ve Doğaltaş Listesi detay filtreleri artık tüm taş
 * korpusunu TARAYICIYA indirmez. Değerlendirme SUNUCUDA yapılır (paylaşılan
 * stoneConditionSearch motoru ile — AND mantığı BİREBİR korunur); tarayıcıya yalnız
 * EŞLEŞEN alt küme döner. Mineral koşulu stones.assignments "Mineraller" bölümünden
 * çözülür (taşın serbest açıklama metninden DEĞİL) — F-05 semantiği.
 *
 * Güvenlik: requireModuleAccess("stones") → token↔user binding; tenant SUNUCUDAN
 * (body'den tenant alınmaz); demo → library dahil (mevcut showcase). Ham DB hatası
 * sızmaz. Değerlendirme korpusu tenant-scoped ve CAP'li (bounded).
 */

const VALUE_MAX = 120;
const MAX_CONDITIONS = 12;
// Değerlendirme korpusu üst sınırı — bounded server-side fetch. Aşılırsa `capped:true`
// ile dürüstçe raporlanır (sessiz truncation yok).
const CORPUS_CAP = 5000;
// Tarayıcıya dönen eşleşen satır üst sınırı.
const RESULT_CAP = 500;

function tenantIdsFor(tenantId: string, isDemo: boolean): string[] {
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) return [tenantId];
  return isDemo ? [tenantId, ADMIN_LIBRARY_TENANT_ID] : [tenantId];
}

async function exclusionIds(db: SupabaseClient, tenantId: string): Promise<Set<string>> {
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) return new Set();
  const { data } = await db.from("stone_exclusions").select("stone_id").eq("tenant_id", tenantId);
  return new Set((data ?? []).map((r) => String((r as { stone_id: unknown }).stone_id)));
}

type Body = {
  conditions?: unknown;
  warningOnly?: unknown;
  q?: unknown;
  searchMode?: unknown;
  wantSuggestions?: unknown;
};

function parseConditions(raw: unknown): { ok: true; value: SearchCondition[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Koşullar liste olmalıdır." };
  if (raw.length > MAX_CONDITIONS) return { ok: false, error: `En fazla ${MAX_CONDITIONS} koşul.` };
  const out: SearchCondition[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return { ok: false, error: "Geçersiz koşul." };
    const c = item as Record<string, unknown>;
    const type = String(c.type ?? "");
    if (!SEARCH_TYPES.includes(type as SearchType)) return { ok: false, error: "Geçersiz koşul türü." };
    const value = String(c.value ?? "").trim();
    if (value.length > VALUE_MAX) return { ok: false, error: "Koşul değeri çok uzun." };
    let minPercent: number | null = null;
    if (c.minPercent != null) {
      const n = Number(c.minPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: "Yüzde 0–100 arası olmalıdır." };
      minPercent = n;
    }
    out.push({ id: `c${out.length}`, type: type as SearchType, value, minPercent });
  }
  return { ok: true, value: out };
}

function contentHaystack(s: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).join(" ") : "");
  const asg = s.assignments && typeof s.assignments === "object" ? JSON.stringify(s.assignments) : "";
  return [
    str(s.stone_name), str(s.short_description), str(s.general_info), str(s.source_note),
    str(s.physical_effects), str(s.spiritual_effects), str(s.other_effects), str(s.feng_shui),
    str(s.meditation), str(s.care), str(s.application), str(s.warning_text),
    arr(s.warning_tags), arr(s.chakras), asg,
  ].join(" ");
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const parsed = parseConditions(body.conditions);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const conditions = parsed.value.filter((c) => c.value.trim());
  const warningOnly = body.warningOnly === true;
  const q = typeof body.q === "string" ? body.q.trim().slice(0, VALUE_MAX) : "";
  const searchMode: "name" | "content" = body.searchMode === "content" ? "content" : "name";
  const wantSuggestions = body.wantSuggestions === true;

  try {
    const ids = tenantIdsFor(tenantId, is_demo_account);
    // Bounded server-side fetch (CAP+1 → capped tespiti). Tarayıcıya inmez.
    const { data, error } = await db
      .from("stones").select(STONES_LIST_EXTENDED_SELECT)
      .in("tenant_id", ids)
      .order("stone_name", { ascending: true, nullsFirst: false })
      .range(0, CORPUS_CAP);
    if (error) return serverErrorResponse({ route: "dogaltas/stones/condition-search", action: "POST", tenantId, cause: error });

    const excluded = await exclusionIds(db, tenantId);
    const allRows = (data ?? []).filter((r) => !excluded.has(String((r as { id: unknown }).id)));
    const corpusCapped = allRows.length > CORPUS_CAP;
    const corpus = corpusCapped ? allRows.slice(0, CORPUS_CAP) : allRows;

    const hasCriteria = conditions.length > 0 || warningOnly || Boolean(q);

    const matched = hasCriteria
      ? corpus.filter((row) => {
          const s = row as Record<string, unknown>;
          if (conditions.length > 0) {
            const cs: ConditionStone = {
              stone_name: String(s.stone_name ?? ""),
              chakras: Array.isArray(s.chakras) ? (s.chakras as string[]) : null,
              assignments: s.assignments,
            };
            if (!evaluateStoneConditions(cs, conditions).matches) return false;
          }
          if (warningOnly && !stoneHasWarning(s.warning_text as string | null | undefined, s.warning_tags)) return false;
          if (q) {
            const hay = searchMode === "content" ? contentHaystack(s) : String(s.stone_name ?? "");
            if (!containsTr(hay, q)) return false;
          }
          return true;
        })
      : [];

    const total = matched.length;
    const resultCapped = matched.length > RESULT_CAP;
    const rows = resultCapped ? matched.slice(0, RESULT_CAP) : matched;

    // Öneriler/sayımlar (dropdown) — istenirse korpus üzerinden server-side üretilir
    // (kombinasyon-oluştur artık öneri için korpusu tarayıcıya çekmez).
    let suggestions: Record<string, { name: string; count: number }[]> | undefined;
    if (wantSuggestions) {
      const conditionStones: ConditionStone[] = corpus.map((row) => {
        const s = row as Record<string, unknown>;
        return {
          stone_name: String(s.stone_name ?? ""),
          chakras: Array.isArray(s.chakras) ? (s.chakras as string[]) : null,
          assignments: s.assignments,
        };
      });
      suggestions = {};
      for (const t of SEARCH_TYPES) {
        const names = collectSuggestions(conditionStones, t);
        const counts = buildTypeCounts(conditionStones, t, names);
        suggestions[t] = names.map((name) => ({ name, count: counts.get(name) ?? 0 }));
      }
    }

    return NextResponse.json({
      ok: true,
      rows,
      total,
      capped: corpusCapped || resultCapped,
      corpusCapped,
      ...(suggestions ? { suggestions } : {}),
    });
  } catch (e) {
    return serverErrorResponse({ route: "dogaltas/stones/condition-search", action: "POST", tenantId, cause: e });
  }
}
