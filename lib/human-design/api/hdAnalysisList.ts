// HD — "HUMAN DESIGN ANALİZLERİM" tek listesi (YALNIZ SUNUCU, service_role).
//
//   • Grup kimliği: HD profil kimliği (human_design_charts.client_id). Aynı AD-SOYAD farklı profiller
//     AYRI satırdır (isimle birleştirme YOK). Profilsiz eski analiz (client_id boş) kendi satırıdır.
//   • Yalnız EN AZ BİR analizi olan profiller listelenir (analizsiz profiller ayrı profil ekranında).
//   • "Danışan Yolculuğu'na bağlı" yalnız doğrulanmış kayıt bağına (journey_client_id) dayanır.
//   • Arama SUNUCUDA, tenant'ın TÜM kayıtları üzerinde (ilk N kayıtla sınırlı değil); Türkçe küçük
//     harf + çok kelime (ad + soyad birlikte). DB collation'ına güvenilmez (İ/ı tuzağı) → normalize JS.
//   • Tarayıcıya yalnız istenen SAYFA döner (varsayılan 20, en çok 50). Okuma hatası kısmi liste
//     olarak gösterilmez → hata döner.
//   • Sıra: son analiz tarihi yeni → eski; eşitlikte grup anahtarı (kararlı).

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "./tenantScope";
import { hdSafeDbError } from "./safeError";
import { normalizeHdPersonName } from "./hdIdentity";

const PAGE_READ = 1000;
const MAX_ROWS = 50_000;

export type HdAnalysisGroupRow = {
  key: string;
  hdClientId: string | null;
  /** Profilsiz eski analiz satırı için o analiz; aksi hâlde en son analiz. */
  latestChartId: string;
  latestKind: "computed" | "manual";
  name: string;
  birthDate: string | null;
  typeCode: string | null;
  profileCode: string | null;
  lastAnalysisAt: string;
  analysisCount: number;
  linkedToJourney: boolean;
};

export type HdAnalysisListResult =
  | { ok: true; rows: HdAnalysisGroupRow[]; total: number; offset: number; limit: number; scanned: { charts: number; profiles: number } }
  | { ok: false; error: string };

type ChartLite = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  birth_date: string | null;
  created_at: string;
  source: string | null;
  type_code: string | null;
  profile_code: string | null;
};
type ProfileLite = { id: string; name: string | null; birth_date: string | null; journey_client_id: string | null };

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  ctx: string,
): Promise<{ rows: T[]; error: string | null }> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_READ) {
    const { data, error } = await page(from, from + PAGE_READ - 1);
    if (error) return { rows: [], error: hdSafeDbError(ctx, error as { message?: string; code?: string }) };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_READ) return { rows: out, error: null };
  }
  return { rows: [], error: "Liste çok büyük; lütfen aramayı daraltın." };
}

export function hdSearchTokens(q: string): string[] {
  return normalizeHdPersonName(q.replace(/[,()*%\\]/g, " ").slice(0, 80))
    .split(" ")
    .filter(Boolean)
    .slice(0, 6);
}

export async function listHdAnalysisGroups(
  db: SupabaseClient,
  tenantId: string,
  opts: { q?: string; offset?: number; limit?: number } = {},
): Promise<HdAnalysisListResult> {
  const limit = Math.max(1, Math.min(50, Math.floor(opts.limit ?? 20)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));

  // Yalnız gruplama/özet için gereken DAR kolonlar (hesap sonucu / ham sağlayıcı verisi okunmaz).
  const charts = await readAll<ChartLite>(
    (from, to) =>
      withTenant(db.from("human_design_charts").select("id, client_id, client_name, birth_date, created_at, source, type_code, profile_code"), tenantId, "hdList.charts")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    "hdList.charts",
  );
  if (charts.error) return { ok: false, error: charts.error };
  const profiles = await readAll<ProfileLite>(
    (from, to) =>
      withTenant(db.from("human_design_clients").select("id, name, birth_date, journey_client_id"), tenantId, "hdList.profiles")
        .order("id", { ascending: true })
        .range(from, to),
    "hdList.profiles",
  );
  if (profiles.error) return { ok: false, error: profiles.error };
  const byProfile = new Map(profiles.rows.map((p) => [p.id, p]));

  const groups = new Map<string, HdAnalysisGroupRow>();
  for (const c of charts.rows) {
    // Profili silinmiş (yetim) client_id → profilsiz satır gibi davranılır (analiz kaybolmaz).
    const prof = c.client_id ? byProfile.get(c.client_id) ?? null : null;
    const key = prof ? `hd:${prof.id}` : `chart:${c.id}`;
    const g = groups.get(key);
    if (g) {
      g.analysisCount += 1;
      continue; // charts created_at DESC → ilk görülen en günceldir
    }
    groups.set(key, {
      key,
      hdClientId: prof?.id ?? null,
      latestChartId: c.id,
      latestKind: c.source === "computed" ? "computed" : "manual",
      name: (prof?.name ?? c.client_name ?? "").trim() || "—",
      birthDate: (prof?.birth_date ?? c.birth_date ?? null)?.slice(0, 10) ?? null,
      typeCode: c.type_code,
      profileCode: c.profile_code,
      lastAnalysisAt: c.created_at,
      analysisCount: 1,
      linkedToJourney: !!prof?.journey_client_id,
    });
  }

  const tokens = hdSearchTokens(opts.q ?? "");
  let rows = [...groups.values()];
  if (tokens.length > 0) {
    rows = rows.filter((r) => {
      const n = normalizeHdPersonName(r.name);
      return tokens.every((t) => n.includes(t));
    });
  }
  rows.sort((a, b) => (a.lastAnalysisAt < b.lastAnalysisAt ? 1 : a.lastAnalysisAt > b.lastAnalysisAt ? -1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return {
    ok: true,
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    offset,
    limit,
    scanned: { charts: charts.rows.length, profiles: profiles.rows.length },
  };
}
