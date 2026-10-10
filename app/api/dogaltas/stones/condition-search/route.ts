import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { stoneReadTenantIds } from "@/lib/dogaltas/stoneTenantScope";
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
import { fetchAllRows } from "@/lib/dogaltas/fetchAllRows";

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

/** Okuma görünürlüğü: ortak kural (lib/dogaltas/stoneTenantScope). */
const tenantIdsFor = stoneReadTenantIds;

async function exclusionIds(db: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const res = await fetchAllRows<{ stone_id: unknown }>((from, to) =>
    db.from("stone_exclusions").select("stone_id").eq("tenant_id", tenantId)
      .order("stone_id", { ascending: true }).range(from, to),
  );
  return new Set(res.rows.map((r) => String(r.stone_id)));
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

/**
 * WT9 çoklu kaynak: bir taşın ÇAKRALARI = birincil kaynak (stones.chakras) ∪ tüm ek kaynaklar
 * (stone_sources.chakras). Yalnız aynı tenant'ın satırları; TEK sorgu (N+1 yok). Migration öncesi
 * şemada tablo yok → boş harita (eski davranış).
 */
async function extraSourceData(
  db: SupabaseClient,
  tenantIds: readonly string[],
  opts: { chakras: boolean; text: boolean },
): Promise<{ chakras: Map<string, string[]>; text: Map<string, string> }> {
  const chakras = new Map<string, string[]>();
  const text = new Map<string, string>();
  const missing = (e: unknown) => /^(42P01|PGRST205|42703|PGRST204)$/.test(String((e as { code?: string })?.code ?? ""));
  if (opts.chakras) {
    const res = await fetchAllRows<{ stone_id: unknown; chakras: unknown }>((from, to) =>
      db.from("stone_sources").select("stone_id, chakras").in("tenant_id", [...tenantIds])
        .not("chakras", "is", null).order("id", { ascending: true }).range(from, to),
    );
    if (!res.ok && !missing(res.error)) throw res.error;
    for (const r of res.ok ? res.rows : []) {
      if (!Array.isArray(r.chakras)) continue;
      const k = String(r.stone_id);
      chakras.set(k, [...(chakras.get(k) ?? []), ...r.chakras.map(String)]);
    }
  }
  if (opts.text) {
    const res = await fetchAllRows<{ id: unknown; primary_source_name: unknown; extra_sources_text: unknown }>((from, to) =>
      db.from("stones").select("id, primary_source_name, extra_sources_text").in("tenant_id", [...tenantIds])
        .order("id", { ascending: true }).range(from, to),
    );
    if (!res.ok && !missing(res.error)) throw res.error;
    for (const r of res.ok ? res.rows : []) {
      const parts = [r.primary_source_name, r.extra_sources_text].filter((v): v is string => typeof v === "string" && v.length > 0);
      if (parts.length) text.set(String(r.id), parts.join(" "));
    }
  }
  return { chakras, text };
}

/** Birincil + ek kaynak çakraları (tekil, ilk görülen yazım korunur). */
function mergedChakras(primary: unknown, extra: readonly string[] | undefined): string[] | null {
  const base = Array.isArray(primary) ? (primary as unknown[]).map(String) : [];
  if (!extra?.length) return Array.isArray(primary) ? base : null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...base, ...extra]) {
    const k = c.trim().toLocaleLowerCase("tr-TR");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
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
    // P2-07: `.range(0, CORPUS_CAP)` PostgREST 1000-satır tavanında sessizce 1000'de
    // kesiliyordu (corpusCapped hiç true olmuyordu). Artık sayfalı okunur; CAP+1'e kadar
    // gerçek okuma → kesilme olursa `capped:true` DÜRÜSTÇE döner.
    const corpusRes = await fetchAllRows<Record<string, unknown>>((from, to) =>
      db
        .from("stones").select(STONES_LIST_EXTENDED_SELECT)
        .in("tenant_id", ids)
        .order("stone_name", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to),
      { maxRows: CORPUS_CAP + 1 },
    );
    if (!corpusRes.ok) return serverErrorResponse({ route: "dogaltas/stones/condition-search", action: "POST", tenantId, cause: corpusRes.error });

    const excluded = await exclusionIds(db, tenantId);
    const allRows = corpusRes.rows.filter((r) => !excluded.has(String((r as { id: unknown }).id)));
    const corpusCapped = corpusRes.truncated || allRows.length > CORPUS_CAP;
    const corpus = corpusCapped ? allRows.slice(0, CORPUS_CAP) : allRows;

    const hasCriteria = conditions.length > 0 || warningOnly || Boolean(q);
    // WT9: ek kaynakların çakraları (çakra koşulu / öneriler) + metni (içerik araması) — tek sorgu.
    const extra = await extraSourceData(db, ids, {
      chakras: wantSuggestions || conditions.some((c) => c.type === "chakra"),
      text: Boolean(q) && searchMode === "content",
    });

    const matched = hasCriteria
      ? corpus.filter((row) => {
          const s = row as Record<string, unknown>;
          if (conditions.length > 0) {
            const cs: ConditionStone = {
              stone_name: String(s.stone_name ?? ""),
              chakras: mergedChakras(s.chakras, extra.chakras.get(String(s.id))),
              assignments: s.assignments,
            };
            if (!evaluateStoneConditions(cs, conditions).matches) return false;
          }
          if (warningOnly && !stoneHasWarning(s.warning_text as string | null | undefined, s.warning_tags)) return false;
          if (q) {
            const hay = searchMode === "content"
              ? `${contentHaystack(s)} ${extra.text.get(String(s.id)) ?? ""}`
              : String(s.stone_name ?? "");
            if (!containsTr(hay, q)) return false;
          }
          return true;
        })
      : [];

    const total = matched.length;
    const resultCapped = matched.length > RESULT_CAP;
    // WT9: ek kaynak çakrası olan satıra birleşik çakra listesi eklenir (search_chakras) → istemci
    // (Kombinasyon Oluştur) aynı motorla yeniden değerlendirirken sonucu düşürmez. Görüntülenen
    // birincil çakralar (chakras) DEĞİŞMEZ.
    const rows = (resultCapped ? matched.slice(0, RESULT_CAP) : matched).map((row) => {
      const extraChakras = extra.chakras.get(String((row as Record<string, unknown>).id));
      return extraChakras?.length
        ? { ...row, search_chakras: mergedChakras((row as Record<string, unknown>).chakras, extraChakras) }
        : row;
    });

    // Öneriler/sayımlar (dropdown) — istenirse korpus üzerinden server-side üretilir
    // (kombinasyon-oluştur artık öneri için korpusu tarayıcıya çekmez).
    let suggestions: Record<string, { name: string; count: number }[]> | undefined;
    if (wantSuggestions) {
      const conditionStones: ConditionStone[] = corpus.map((row) => {
        const s = row as Record<string, unknown>;
        return {
          stone_name: String(s.stone_name ?? ""),
          chakras: mergedChakras(s.chakras, extra.chakras.get(String(s.id))),
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
