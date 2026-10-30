/**
 * Klasik Numeroloji — kayıtlı analizden Doğaltaş eşleştirmesi (YALNIZ SUNUCU; YALNIZ OKUMA; 0 sağlayıcı çağrısı).
 *
 * Girdi YALNIZ kayıtlı analiz sonucudur (`result.chart` + katalogdan EN uğurlu ilişkiler). Yeniden hesap YOK.
 * Aday dizini Doğaltaş Kütüphanesi uzman yayın RPC'lerinden (libraryAdapter) kurulur; kütüphane kapalı / yetkisiz /
 * okunamaz ise yedek mod (`text_only`): doğrudan öneriler yalnız ad. Stok rozetleri `dogaltas_inventory` YALNIZ select.
 * Yanıtta kütüphane kaynak adı, iç uuid, sağlayıcı adı YOKTUR (adaptör + eşleştirici filtreleri).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchStonesForNumbers } from "../stones/matcher";
import {
  CLASSIC_STONE_UNAVAILABLE_TR,
  loadClassicStoneIndex,
  lookupClassicStockBadges,
  type ClassicStoneDb,
  type ClassicStoneIndexResult,
  type ClassicStoneIndexUnavailableReason,
} from "../stones/libraryAdapter";
import type { ClassicStockBadge } from "../stones/stock";
import type { StoneLuckyAssociations, StoneMatchResult, StoneNumberInput, StoneNumberKey, StonePersonNumbers } from "../stones/types";
import { getCatalogEntry } from "./repository";

assertServerOnly("lib/numeroloji-klasik/server/stonesService");

export type ClassicStonesMode = "library" | "text_only";

export type ClassicStonesView = {
  mode: ClassicStonesMode;
  /** Yalnız text_only modunda: library_disabled | no_access | unavailable | empty. */
  reason?: ClassicStoneIndexUnavailableReason;
  /** reason'ın Türkçe açıklaması (uzmana gösterilebilir). */
  reasonText?: string;
  result: StoneMatchResult;
  /** Yalnız stokta bulunan taş adları → adet (salt-okunur rozet; adet 0 olabilir = stokta kayıtlı ama adetsiz). */
  stock: Record<string, number>;
};

export type ClassicStonesDeps = {
  loadIndex: (input: { db: ClassicStoneDb; viewerId: string }) => Promise<ClassicStoneIndexResult>;
  lookupStock: (db: ClassicStoneDb, tenantId: string, names: readonly string[]) => Promise<ClassicStockBadge[]>;
};

export function defaultClassicStonesDeps(env: Record<string, string | undefined> = process.env): ClassicStonesDeps {
  return {
    loadIndex: (input) => loadClassicStoneIndex({ ...input, env }),
    lookupStock: (db, tenantId, names) => lookupClassicStockBadges(db, tenantId, names),
  };
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}
function intList(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x)) : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

const NUMBER_KEYS: readonly StoneNumberKey[] = ["lifePath", "expression", "soulUrge", "personality", "birthDay"];
const LIFE_PATHS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]);

/** Kayıtlı analiz sonucundaki kişi haritası (yoksa null). */
export function savedChartOf(result: unknown): Record<string, unknown> | null {
  const chart = rec(rec(result)?.chart);
  return chart && rec(chart.core) ? chart : null;
}

/** Kayıtlı harita → eşleştirici girdileri (saf). */
export function stoneInputsFromChart(chart: Record<string, unknown>): { person: StonePersonNumbers; lifePath: number | null } {
  const core = rec(chart.core) ?? {};
  const person: StonePersonNumbers = {};
  for (const k of NUMBER_KEYS) {
    const n = rec(core[k]);
    if (n && typeof n.value === "number" && Number.isInteger(n.value)) {
      const input: StoneNumberInput = { value: n.value, ...(n.type === "master" ? { type: "master" as const } : { type: "single" as const }) };
      person[k] = input;
    }
  }
  const debt = intList(rec(chart.karmicDebt)?.debtNumbers);
  const lessons = intList(rec(chart.karmicLessons)?.missingNumbers);
  if (debt.length) person.karmicDebt = debt;
  if (lessons.length) person.karmicLessons = lessons;
  const lp = person.lifePath?.value ?? null;
  return { person, lifePath: lp !== null && LIFE_PATHS.has(lp) ? lp : null };
}

/** TR uğurlu ilişkiler + (varsa) EN karşılık → eşleştirici girdisi. Gezegen/element EN tercih edilir (TR de çözülür). */
export function luckyFromChart(chart: Record<string, unknown>, luckyEn: unknown): StoneLuckyAssociations {
  const tr = rec(chart.luckyAssociations);
  const en = rec(luckyEn);
  return {
    gemstones: strList(tr?.gemstones),
    gemstonesAlt: strList(en?.gemstones),
    rulingPlanet: str(en?.rulingPlanet) ?? str(tr?.rulingPlanet),
    element: str(en?.element) ?? str(tr?.element),
  };
}

function stoneNamesOf(r: StoneMatchResult): string[] {
  const out = new Set<string>();
  for (const p of r.providerDirect) {
    out.add(p.input);
    if (p.nameTr) out.add(p.nameTr);
    for (const c of p.candidates ?? []) out.add(c.nameTr);
  }
  for (const s of r.suggestions) out.add(s.nameTr);
  for (const g of r.groups) for (const s of g.items) out.add(s.nameTr);
  return [...out].filter((n) => typeof n === "string" && n.trim().length > 0).slice(0, 400);
}

/**
 * Kayıtlı analiz sonucu → taş görünümü. Harita yoksa null (çağıran 422 döner).
 * `db` service-role istemcisidir; tenantId / viewerId YALNIZ oturum guard'ından gelir.
 */
export async function buildClassicStonesView(
  /** canSeeStock: Doğaltaş ("stones") modül izni — false ise tenant stok adetleri OKUNMAZ (NK-R11). */
  ctx: { db: SupabaseClient; tenantId: string; viewerId: string; canSeeStock?: boolean },
  analysisResult: unknown,
  deps: ClassicStonesDeps = defaultClassicStonesDeps(),
  /** full: true → gruplar kesilmeden döner (Taşlar sekmesi API'leri). Word / karşılaştırma varsayılanla aynı. */
  opts: { full?: boolean } = {},
): Promise<ClassicStonesView | null> {
  const chart = savedChartOf(analysisResult);
  if (!chart) return null;
  const { person, lifePath } = stoneInputsFromChart(chart);
  let luckyEn: unknown = chart.luckyEn;
  if (!rec(luckyEn) && lifePath !== null) {
    const cat = await getCatalogEntry(ctx.db, "lucky_association", lifePath, "en");
    if (cat.ok) luckyEn = cat.value.payload;
  }
  const lucky = luckyFromChart(chart, luckyEn);
  const sdb = ctx.db as unknown as ClassicStoneDb;
  let idx: ClassicStoneIndexResult;
  try {
    idx = await deps.loadIndex({ db: sdb, viewerId: ctx.viewerId });
  } catch {
    idx = { available: false, reason: "unavailable" };
  }
  const result = matchStonesForNumbers(person, lucky, idx.available ? idx.index : null, opts.full ? { uncapped: true } : {});
  const badges = ctx.canSeeStock === false ? [] : await deps.lookupStock(sdb, ctx.tenantId, stoneNamesOf(result)).catch(() => [] as ClassicStockBadge[]);
  const stock: Record<string, number> = {};
  for (const b of badges) if (b.stocked) stock[b.name] = b.adet;
  if (idx.available) return { mode: "library", result, stock };
  return { mode: "text_only", reason: idx.reason, reasonText: CLASSIC_STONE_UNAVAILABLE_TR[idx.reason], result, stock };
}
