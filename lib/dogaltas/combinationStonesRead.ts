/**
 * lib/dogaltas/combinationStonesRead.ts — F-02 READ tamamlama (server-side, salt-okuma).
 *
 * KANONİK OKUMA SEMANTİĞİ:
 *   - Bir combination'ın combination_stones (junction) satırı VARSA → YAPISAL kayıt:
 *       canonical read = junction. Her ilişki için gösterilecek isim:
 *         stone_id bağlı + stone hâlâ var → stones.stone_name (GÜNCEL ad; rename-aware)
 *         stone_id NULL / silinmiş       → snapshot_name (tarihsel fallback)
 *   - Junction satırı YOKSA → LEGACY kayıt: stones_text OLDUĞU GİBİ korunur.
 *
 * GÜVENLİK/DAVRANIŞ:
 *   - SALT-OKUMA: combination_stones/stones üzerinde INSERT/UPDATE/DELETE YOK.
 *   - DB'deki stones_text kolonu UPDATE EDİLMEZ; yalnız RESPONSE seviyesinde
 *     yapısal kayıtların stones_text'i canonical resolved string ile sunulur.
 *   - BATCH (N+1 yok): tüm combination id'leri için TEK sorgu.
 *   - Tenant scope: combination_stones.tenant_id = server-derived tenantId.
 *   - combination_stones tablosu yoksa (migration henüz uygulanmadıysa) → sorgu hatası
 *     yutulur, legacy stones_text fallback döner (merge-safe; mutation yok).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRowsByIds } from "@/lib/dogaltas/fetchAllRows";

export type ResolvedStone = {
  stone_id: string | null;
  /** Güncel canonical taş adı (stone hâlâ varsa); yoksa null. */
  name: string | null;
  /** Oluşturma anındaki ad (tarihsel/fallback). */
  snapshot_name: string;
  /** stone silinmiş / bağ çözülememiş. */
  deleted: boolean;
};

/** Görüntü adı: güncel ad varsa onu, yoksa snapshot_name. (Pure — test edilebilir.) */
export function pickStoneName(r: Pick<ResolvedStone, "name" | "snapshot_name">): string {
  return r.name && r.name.trim() ? r.name.trim() : r.snapshot_name;
}

/** Resolved ilişkilerden canonical CSV (compatibility mirror string). (Pure.) */
export function buildResolvedStonesText(resolved: ResolvedStone[]): string {
  return resolved.map(pickStoneName).filter((s) => s && s.trim()).join(", ");
}

/** Ham junction satırlarından ResolvedStone üretir (embed stone adı dahil). (Pure.) */
export function toResolvedStone(row: {
  stone_id: string | null;
  snapshot_name: string;
  stones?: { stone_name?: string | null } | { stone_name?: string | null }[] | null;
}): ResolvedStone {
  const embed = Array.isArray(row.stones) ? row.stones[0] : row.stones;
  const current = embed?.stone_name ?? null;
  return {
    stone_id: row.stone_id,
    name: current,
    snapshot_name: row.snapshot_name,
    deleted: row.stone_id == null || !current,
  };
}

type CombinationLike = { id: string; stones_text?: string | null };

/**
 * Combination satırlarını junction'dan hydrate eder. Yapısal kayıtlar için
 * stones_text'i (response seviyesinde) canonical resolved string yapar + resolved_stones
 * ekler. Legacy kayıtlar aynen döner (stones_text değişmez, resolved_stones eklenmez).
 */
export async function hydrateCombinationStoneNames<T extends CombinationLike>(
  db: SupabaseClient,
  tenantId: string,
  rows: T[],
): Promise<(T & { resolved_stones?: ResolvedStone[] })[]> {
  if (!rows || rows.length === 0) return rows;
  const ids = Array.from(new Set(rows.map((r) => r.id).filter(Boolean)));
  if (ids.length === 0) return rows;

  // BATCH + FK embed (stones.stone_name). Tenant-scoped. P2-07: id listesi parçalanır
  // (URL uzunluğu) ve her parça sayfalı okunur (1000-satır tavanı) → sessiz eksik yok.
  const res = await fetchAllRowsByIds<unknown>(ids, (chunk, from, to) =>
    db
      .from("combination_stones")
      .select("id, combination_id, stone_id, snapshot_name, sort_order, stones(stone_name)")
      .eq("tenant_id", tenantId)
      .in("combination_id", chunk)
      .order("combination_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  // Tablo yok / sorgu hatası → legacy fallback (mutation yok, kırılmaz).
  if (!res.ok) return rows;
  const data = res.rows;

  const byComb = new Map<string, ResolvedStone[]>();
  for (const jr of data) {
    const r = jr as {
      combination_id: string; stone_id: string | null; snapshot_name: string;
      stones?: { stone_name?: string | null } | { stone_name?: string | null }[] | null;
    };
    const list = byComb.get(r.combination_id) ?? [];
    list.push(toResolvedStone(r));
    byComb.set(r.combination_id, list);
  }

  return rows.map((row) => {
    const resolved = byComb.get(row.id);
    // Junction YOK → LEGACY: stones_text aynen; hydrate yok.
    if (!resolved || resolved.length === 0) return row;
    // YAPISAL: response-level canonical stones_text (rename-aware) + resolved_stones.
    return { ...row, resolved_stones: resolved, stones_text: buildResolvedStonesText(resolved) };
  });
}
