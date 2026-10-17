// HD — TEK DANIŞAN LİSTESİ ("HUMAN DESIGN ANALİZLERİM") (YALNIZ SUNUCU, service_role).
//
//   • Tek liste, tek arama: (1) analizli HD profilleri, (2) henüz analizi olmayan HD profilleri,
//     (3) ARAMADA ayrıca Human Design kaydı OLMAYAN Danışan Yolculuğu danışanları ("Human Design Başlat").
//     Başka danışan listesi / profil tablosu yoktur.
//   • Grup kimliği: HD profil kimliği (human_design_charts.client_id). Aynı AD-SOYAD farklı profiller
//     AYRI satırdır (isimle birleştirme YOK). Profilsiz eski analiz (client_id boş) kendi satırıdır.
//   • "Danışan Yolculuğu'na bağlı" yalnız doğrulanmış kayıt bağına (journey_client_id) dayanır.
//   • Arama SUNUCUDA, tenant'ın TÜM kayıtları üzerinde (sayfalı okuma; ilk N kayıtla sınırlı değil);
//     Türkçe küçük harf + çok kelime. DB collation'ına güvenilmez (İ/ı tuzağı) → normalize JS.
//   • Tarayıcıya yalnız istenen SAYFA döner (varsayılan 20, en çok 50). Okuma hatası kısmi liste
//     olarak gösterilmez → hata döner.
//   • Sıra (owner kararı 2026-10-17): TÜM sonuç kümesi Türkçe alfabetik ad-soyad; eşitlikte doğum tarihi,
//     sonra grup anahtarı (kararlı). Sayfalama sıralamadan SONRA uygulanır.
//   • İlk analiz tarihi = o profilin EN ESKİ analiz kaydının created_at değeri (sunucu verisi; uydurma yok).

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "./tenantScope";
import { hdSafeDbError } from "./safeError";
import { normalizeHdPersonName } from "./hdIdentity";

const PAGE_READ = 1000;
const MAX_ROWS = 50_000;

export type HdAnalysisGroupRow = {
  key: string;
  /** "hd" = HD profili, "orphan" = profilsiz eski analiz, "journey" = HD kaydı olmayan Danışan Yolculuğu danışanı. */
  kind: "hd" | "orphan" | "journey";
  hdClientId: string | null;
  journeyClientId: string | null;
  /** En son analiz (yoksa null). Profilsiz satırda o analizin kendisi. */
  latestChartId: string | null;
  latestKind: "computed" | "manual" | null;
  name: string;
  birthDate: string | null;
  typeCode: string | null;
  profileCode: string | null;
  lastAnalysisAt: string | null;
  firstAnalysisAt: string | null;
  analysisCount: number;
  linkedToJourney: boolean;
};

export type HdAnalysisListResult =
  | { ok: true; rows: HdAnalysisGroupRow[]; total: number; offset: number; limit: number; scanned: { charts: number; profiles: number; journey: number } }
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
type ProfileLite = { id: string; name: string | null; birth_date: string | null; journey_client_id: string | null; created_at: string };

/** Türkçe alfabetik karşılaştırma (Ç, Ğ, I/ı, İ/i, Ö, Ş, Ü); büyük/küçük harf ve aksan sırayı bozmaz. */
const HD_NAME_COLLATOR = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
function collateName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}
type JourneyLite = { id: string; ad: string | null; soyad: string | null; dogum: string | null };

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

function isMissingColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(e.message ?? ""));
}

export async function listHdAnalysisGroups(
  db: SupabaseClient,
  tenantId: string,
  opts: { q?: string; offset?: number; limit?: number } = {},
): Promise<HdAnalysisListResult> {
  const limit = Math.max(1, Math.min(50, Math.floor(opts.limit ?? 20)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const tokens = hdSearchTokens(opts.q ?? "");

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
      withTenant(db.from("human_design_clients").select("id, name, birth_date, journey_client_id, created_at"), tenantId, "hdList.profiles")
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
      g.firstAnalysisAt = c.created_at; // created_at DESC → son görülen en eskidir
      continue; // ilk görülen en günceldir
    }
    groups.set(key, {
      key,
      kind: prof ? "hd" : "orphan",
      hdClientId: prof?.id ?? null,
      journeyClientId: prof?.journey_client_id ?? null,
      latestChartId: c.id,
      latestKind: c.source === "computed" ? "computed" : "manual",
      name: (prof?.name ?? c.client_name ?? "").trim() || "—",
      birthDate: (prof?.birth_date ?? c.birth_date ?? null)?.slice(0, 10) ?? null,
      typeCode: c.type_code,
      profileCode: c.profile_code,
      lastAnalysisAt: c.created_at,
      firstAnalysisAt: c.created_at,
      analysisCount: 1,
      linkedToJourney: !!prof?.journey_client_id,
    });
  }
  // Henüz analizi olmayan HD profilleri de AYNI listede (ayrı profil tablosu yok).
  for (const p of profiles.rows) {
    const key = `hd:${p.id}`;
    if (groups.has(key)) continue;
    groups.set(key, {
      key,
      kind: "hd",
      hdClientId: p.id,
      journeyClientId: p.journey_client_id ?? null,
      latestChartId: null,
      latestKind: null,
      name: (p.name ?? "").trim() || "—",
      birthDate: p.birth_date?.slice(0, 10) ?? null,
      typeCode: null,
      profileCode: null,
      lastAnalysisAt: null,
      firstAnalysisAt: null,
      analysisCount: 0,
      linkedToJourney: !!p.journey_client_id,
    });
  }

  // ARAMADA: Human Design kaydı OLMAYAN Danışan Yolculuğu danışanları ("Human Design Başlat").
  let journeyScanned = 0;
  if (tokens.length > 0) {
    const journey = await readAll<JourneyLite>(
      (from, to) => withTenant(db.from("clients").select("id, ad, soyad, dogum"), tenantId, "hdList.journey").order("id", { ascending: true }).range(from, to),
      "hdList.journey",
    );
    if (journey.error && !isMissingColumn(journey.error)) return { ok: false, error: journey.error };
    journeyScanned = journey.rows.length;
    const linked = new Set(profiles.rows.map((p) => p.journey_client_id).filter((x): x is string => !!x));
    for (const j of journey.rows) {
      if (linked.has(j.id)) continue;
      const name = `${j.ad ?? ""} ${j.soyad ?? ""}`.replace(/\s+/g, " ").trim();
      if (!name) continue;
      groups.set(`journey:${j.id}`, {
        key: `journey:${j.id}`,
        kind: "journey",
        hdClientId: null,
        journeyClientId: j.id,
        latestChartId: null,
        latestKind: null,
        name,
        birthDate: j.dogum?.slice(0, 10) ?? null,
        typeCode: null,
        profileCode: null,
        lastAnalysisAt: null,
        firstAnalysisAt: null,
        analysisCount: 0,
        linkedToJourney: true,
      });
    }
  }

  let rows = [...groups.values()];
  if (tokens.length > 0) {
    rows = rows.filter((r) => {
      const n = normalizeHdPersonName(r.name);
      return tokens.every((t) => n.includes(t));
    });
  }
  // Owner kararı 2026-10-17: liste HER ZAMAN Türkçe alfabetik ad-soyad sırasında (yeni analiz satırı
  // yukarı taşımaz). Önce TÜM sonuç kümesi sıralanır, sonra sayfalanır. Aynı ad = ayrı kayıtlar (birleştirilmez):
  // doğum tarihi, sonra kimlik ile kararlı sıra.
  rows.sort((a, b) => {
    const d = HD_NAME_COLLATOR.compare(collateName(a.name), collateName(b.name));
    if (d !== 0) return d;
    const bd = (a.birthDate ?? "").localeCompare(b.birthDate ?? "");
    if (bd !== 0) return bd;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return {
    ok: true,
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    offset,
    limit,
    scanned: { charts: charts.rows.length, profiles: profiles.rows.length, journey: journeyScanned },
  };
}
