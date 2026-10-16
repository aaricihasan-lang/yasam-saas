// HD — olası mükerrer danışan / analiz ADAYLARI (YALNIZ SUNUCU, service_role).
//
//   • Her sorgu withTenant (tenant SUNUCUDAN). Başka tenant'ın adı bile dönmez.
//   • Daraltma: aynı doğum TARİHİ (gerçek tarih eşitliği) → tenant'ın tamamı taranır (ilk 10/50 kayıtla
//     sınırlı istemci listesi değil). Karşılaştırma kuralları hdIdentity.ts (otomatik karar YOK).
//   • Sorgu hatası "aday yok" SAYILMAZ: { error } döner → çağıran FAIL-CLOSED davranır (kayıt/ücretli
//     çağrı yapılmaz).
//   • Dönen alanlar yalnız uyarıda gösterilenler (ad, tarih, saat, yer, bağlantı durumu).

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "./tenantScope";
import { hdSafeDbError } from "./safeError";
import {
  compareHdIdentity,
  hdHhMm,
  hdIsoDate,
  normalizeHdPersonName,
  type HdDuplicateCandidate,
  type HdIdentityInput,
} from "./hdIdentity";

const SCAN_LIMIT = 500;
const MAX_CANDIDATES = 10;

type ProfileRow = {
  id: string;
  name: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  birth_location_id?: string | null;
  journey_client_id: string | null;
};

type ChartRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  location_id?: string | null;
  input?: Record<string, unknown> | null;
  provider?: string | null;
};

type Result = { candidates: HdDuplicateCandidate[]; error: string | null };

function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(err.message ?? "");
}

async function profilesByDate(db: SupabaseClient, tenantId: string, date: string): Promise<{ rows: ProfileRow[]; error: string | null }> {
  const cols = "id, name, birth_date, birth_time, birth_place, birth_location_id, journey_client_id";
  const first = await withTenant(db.from("human_design_clients").select(cols), tenantId, "dup.profiles").eq("birth_date", date).limit(SCAN_LIMIT);
  let data: unknown[] | null = first.data;
  let error = first.error;
  if (error && isMissingColumn(error)) {
    const legacy = await withTenant(
      db.from("human_design_clients").select("id, name, birth_date, birth_time, birth_place, journey_client_id"),
      tenantId,
      "dup.profiles.legacy",
    ).eq("birth_date", date).limit(SCAN_LIMIT);
    data = legacy.data;
    error = legacy.error;
  }
  if (error) return { rows: [], error: hdSafeDbError("dup.profiles", error) };
  return { rows: (data ?? []) as ProfileRow[], error: null };
}

async function profilesByIds(db: SupabaseClient, tenantId: string, ids: string[]): Promise<{ rows: ProfileRow[]; error: string | null }> {
  if (ids.length === 0) return { rows: [], error: null };
  const { data, error } = await withTenant(
    db.from("human_design_clients").select("id, name, birth_date, birth_time, birth_place, journey_client_id"),
    tenantId,
    "dup.profilesById",
  ).in("id", ids.slice(0, SCAN_LIMIT));
  if (error) return { rows: [], error: hdSafeDbError("dup.profilesById", error) };
  return { rows: (data ?? []) as ProfileRow[], error: null };
}

function profileCandidate(p: ProfileRow, match: HdDuplicateCandidate["match"]): HdDuplicateCandidate {
  return {
    key: `hd:${p.id}`,
    kind: "hd_profile",
    match,
    hdClientId: p.id,
    journeyClientId: p.journey_client_id ?? null,
    chartId: null,
    name: (p.name ?? "").trim(),
    birthDate: hdIsoDate(p.birth_date),
    birthTime: hdHhMm(p.birth_time),
    birthPlace: p.birth_place ?? null,
    linkedToJourney: !!p.journey_client_id,
  };
}

function rank(list: HdDuplicateCandidate[]): HdDuplicateCandidate[] {
  return [...list]
    .sort((a, b) => (a.match === b.match ? a.key.localeCompare(b.key) : a.match === "exact" ? -1 : 1))
    .slice(0, MAX_CANDIDATES);
}

/**
 * YENİ HD profili kaydedilmeden ÖNCE: aynı tenant'ın HD profilleri + Danışan Yolculuğu danışanları +
 * kayıtlı HD analizleri arasında aynı kişi olabilecek adaylar.
 */
export async function findHdProfileDuplicates(
  db: SupabaseClient,
  tenantId: string,
  input: HdIdentityInput,
  opts: { excludeJourneyId?: string | null } = {},
): Promise<Result> {
  const date = hdIsoDate(input.birthDate);
  if (!date || !normalizeHdPersonName(input.name)) return { candidates: [], error: null };

  const out = new Map<string, HdDuplicateCandidate>();
  const profiles = await profilesByDate(db, tenantId, date);
  if (profiles.error) return { candidates: [], error: profiles.error };
  const profileIdsSeen = new Set<string>();
  for (const p of profiles.rows) {
    profileIdsSeen.add(p.id);
    if (opts.excludeJourneyId && p.journey_client_id === opts.excludeJourneyId) continue;
    const m = compareHdIdentity(input, { name: p.name, birthDate: p.birth_date, birthTime: p.birth_time, locationId: p.birth_location_id ?? null });
    if (m) out.set(`hd:${p.id}`, profileCandidate(p, m));
  }

  // Kayıtlı analizler (profil doğum bilgisi sonradan değişmiş olabilir).
  const { data: charts, error: chErr } = await withTenant(
    db.from("human_design_charts").select("id, client_id, client_name, birth_date, birth_time, birth_place, location_id"),
    tenantId,
    "dup.charts",
  ).eq("birth_date", date).limit(SCAN_LIMIT);
  if (chErr && !isMissingColumn(chErr)) return { candidates: [], error: hdSafeDbError("dup.charts", chErr) };
  const chartRows = (chErr ? [] : (charts ?? [])) as ChartRow[];
  const missingProfiles = [...new Set(chartRows.map((c) => c.client_id).filter((x): x is string => !!x && !profileIdsSeen.has(x)))];
  const extra = await profilesByIds(db, tenantId, missingProfiles);
  if (extra.error) return { candidates: [], error: extra.error };
  const byId = new Map<string, ProfileRow>([...profiles.rows, ...extra.rows].map((p) => [p.id, p]));
  for (const c of chartRows) {
    const prof = c.client_id ? byId.get(c.client_id) ?? null : null;
    if (prof && out.has(`hd:${prof.id}`)) continue;
    if (prof && opts.excludeJourneyId && prof.journey_client_id === opts.excludeJourneyId) continue;
    const m = compareHdIdentity(input, { name: prof?.name ?? c.client_name, birthDate: c.birth_date, birthTime: c.birth_time, locationId: c.location_id ?? null });
    if (!m) continue;
    const key = prof ? `hd:${prof.id}` : `chart:${c.id}`;
    if (out.has(key)) continue;
    out.set(key, {
      key,
      kind: prof ? "hd_profile" : "chart",
      match: m,
      hdClientId: prof?.id ?? null,
      journeyClientId: prof?.journey_client_id ?? null,
      chartId: c.id,
      name: (prof?.name ?? c.client_name ?? "").trim(),
      birthDate: hdIsoDate(c.birth_date),
      birthTime: hdHhMm(c.birth_time),
      birthPlace: c.birth_place ?? null,
      linkedToJourney: !!prof?.journey_client_id,
    });
  }

  // Danışan Yolculuğu (merkezî) danışanları: ad + soyad + doğum tarihi. Saat/yer orada yok → en çok "possible".
  const { data: jRows, error: jErr } = await withTenant(db.from("clients").select("id, ad, soyad, dogum"), tenantId, "dup.journey")
    .eq("dogum", date)
    .limit(SCAN_LIMIT);
  if (jErr) return { candidates: [], error: hdSafeDbError("dup.journey", jErr) };
  const jMatches = ((jRows ?? []) as { id: string; ad: string | null; soyad: string | null; dogum: string | null }[]).filter(
    (j) => j.id !== opts.excludeJourneyId && compareHdIdentity(input, { name: `${j.ad ?? ""} ${j.soyad ?? ""}`, birthDate: j.dogum, birthTime: null, locationId: null }) !== null,
  );
  if (jMatches.length > 0) {
    // Bu danışanın HD profili zaten var mı? Varsa profil (daha ayrıntılı alanlarla) karar verir.
    const { data: links, error: lErr } = await withTenant(db.from("human_design_clients").select("id, journey_client_id"), tenantId, "dup.journeyLinks").in(
      "journey_client_id",
      jMatches.map((j) => j.id),
    );
    if (lErr && !isMissingColumn(lErr)) return { candidates: [], error: hdSafeDbError("dup.journeyLinks", lErr) };
    const withProfile = new Set(((lErr ? [] : links) ?? []).map((l) => String((l as { journey_client_id: string }).journey_client_id)));
    for (const j of jMatches) {
      if (withProfile.has(j.id)) continue;
      out.set(`journey:${j.id}`, {
        key: `journey:${j.id}`,
        kind: "journey_client",
        match: "possible",
        hdClientId: null,
        journeyClientId: j.id,
        chartId: null,
        name: `${j.ad ?? ""} ${j.soyad ?? ""}`.replace(/\s+/g, " ").trim(),
        birthDate: hdIsoDate(j.dogum),
        birthTime: null,
        birthPlace: null,
        linkedToJourney: true,
      });
    }
  }
  return { candidates: rank([...out.values()]), error: null };
}

export type HdChartIdentity = {
  clientId: string;
  name: string | null;
  date: string;
  /** HH:mm:ss (kayıtla aynı biçim). */
  time: string;
  timezone: string;
  latitude: number;
  longitude: number;
  nodeType: string;
  lang: string;
};

/**
 * ÜCRETLİ Roxy çağrısından hemen ÖNCE: aynı tenant'ta BAŞKA bir HD profili altında, aynı kişi
 * (normalize ad) + birebir aynı hesap girdisiyle (tarih, saat, saat dilimi, koordinat, düğüm, dil)
 * kaydedilmiş Roxy analizi. Başka profilin analizi asla otomatik bağlanmaz/yeniden kullanılmaz.
 */
export async function findCrossProfileRoxyDuplicates(
  db: SupabaseClient,
  tenantId: string,
  i: HdChartIdentity,
  providerId: string,
): Promise<Result> {
  if (!normalizeHdPersonName(i.name)) return { candidates: [], error: null };
  const { data, error } = await withTenant(
    db.from("human_design_charts").select("id, client_id, client_name, birth_date, birth_time, birth_place, input, provider"),
    tenantId,
    "dup.roxyCharts",
  )
    .eq("provider", providerId)
    .eq("birth_date", i.date)
    .eq("birth_time", i.time)
    .eq("timezone", i.timezone)
    .limit(SCAN_LIMIT);
  if (error) return { candidates: [], error: hdSafeDbError("dup.roxyCharts", error) };
  const same = (a: unknown, b: number) => typeof a === "number" && a.toFixed(6) === b.toFixed(6);
  const rows = ((data ?? []) as ChartRow[]).filter((r) => {
    if (r.client_id === i.clientId) return false;
    const inp = r.input ?? {};
    return same(inp.latitude, i.latitude) && same(inp.longitude, i.longitude) && inp.nodeType === i.nodeType && inp.lang === i.lang;
  });
  if (rows.length === 0) return { candidates: [], error: null };
  const prof = await profilesByIds(db, tenantId, [...new Set(rows.map((r) => r.client_id).filter((x): x is string => !!x))]);
  if (prof.error) return { candidates: [], error: prof.error };
  const byId = new Map(prof.rows.map((p) => [p.id, p]));
  const target = normalizeHdPersonName(i.name);
  const out: HdDuplicateCandidate[] = [];
  for (const r of rows) {
    const p = r.client_id ? byId.get(r.client_id) ?? null : null;
    if (normalizeHdPersonName(p?.name ?? r.client_name) !== target) continue;
    out.push({
      key: `chart:${r.id}`,
      kind: "chart",
      match: "exact",
      hdClientId: p?.id ?? null,
      journeyClientId: p?.journey_client_id ?? null,
      chartId: r.id,
      name: (p?.name ?? r.client_name ?? "").trim(),
      birthDate: hdIsoDate(r.birth_date),
      birthTime: hdHhMm(r.birth_time),
      birthPlace: r.birth_place ?? null,
      linkedToJourney: !!p?.journey_client_id,
    });
  }
  return { candidates: rank(out), error: null };
}
