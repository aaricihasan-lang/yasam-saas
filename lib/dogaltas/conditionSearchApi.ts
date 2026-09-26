/**
 * conditionSearchApi.ts — /api/dogaltas/stones/condition-search istemci sarmalayıcısı.
 *
 * "Mineralle Taş Bul" ve Doğaltaş Listesi detay filtreleri artık tüm taş korpusunu
 * TARAYICIYA indirmez; koşullar server-side değerlendirilir (paylaşılan AND motoru)
 * ve yalnız EŞLEŞEN alt küme + öneriler döner (bounded).
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { StoneListItemExtended } from "@/lib/dogaltas/stonesListFetch";
import type { SearchCondition, SearchType } from "@/lib/dogaltas/stoneConditionSearch";

export type ConditionSuggestion = { name: string; count: number };
export type ConditionSuggestions = Partial<Record<SearchType, ConditionSuggestion[]>>;

export type ConditionSearchResult = {
  ok: boolean;
  rows: StoneListItemExtended[];
  total: number;
  capped: boolean;
  suggestions?: ConditionSuggestions;
  error?: string;
};

export type ConditionSearchParams = {
  conditions?: Pick<SearchCondition, "type" | "value" | "minPercent">[];
  warningOnly?: boolean;
  q?: string;
  searchMode?: "name" | "content";
  wantSuggestions?: boolean;
  /** Race guard — çağıran verirse en-son isteğin sequence'i döner (stale eleme). */
  signal?: AbortSignal;
};

export async function fetchStonesByConditions(
  params: ConditionSearchParams,
): Promise<ConditionSearchResult> {
  const userId = readYasamUser()?.id;
  const token = readSessionToken();
  if (!userId || !token) {
    return { ok: false, rows: [], total: 0, capped: false, error: "Oturum bulunamadı." };
  }
  try {
    const res = await fetch("/api/dogaltas/stones/condition-search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": userId, "x-session-token": token },
      body: JSON.stringify({
        conditions: params.conditions ?? [],
        warningOnly: params.warningOnly ?? false,
        q: params.q ?? "",
        searchMode: params.searchMode ?? "name",
        wantSuggestions: params.wantSuggestions ?? false,
      }),
      cache: "no-store",
      signal: params.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean; rows?: StoneListItemExtended[]; total?: number; capped?: boolean;
      suggestions?: ConditionSuggestions; error?: string;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, rows: [], total: 0, capped: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      rows: json.rows ?? [],
      total: json.total ?? 0,
      capped: Boolean(json.capped),
      suggestions: json.suggestions,
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, rows: [], total: 0, capped: false, error: "aborted" };
    }
    return { ok: false, rows: [], total: 0, capped: false, error: e instanceof Error ? e.message : "Ağ hatası" };
  }
}
