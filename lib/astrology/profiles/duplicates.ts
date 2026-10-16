// Astroloji — MÜKERRER DOĞUM PROFİLİ denetimi (YALNIZ SUNUCU). 2026-10-16.
//
//   • YALNIZ çağıran uzmanın kendi profilleri (tenant + owner_user_id; astro_profile_page RPC'si + listRevisions aynı
//     sahiplik kapısı). Başka uzman / tenant kaydı hiçbir koşulda sorgulanmaz ve yanıtta görünmez.
//   • Sağlayıcı (ücretli hesaplama) ÇAĞRILMAZ; yalnız DB okuması. Profil oluşturma zaten hiçbir hesaplama başlatmaz.
//   • Eşleşme kuralları: duplicateMatch.ts (kesin; yüzde benzerlik yok). Etkin + arşivli profiller birlikte denetlenir.
//   • Hiçbir kayıt birleştirilmez / taşınmaz / silinmez; yalnız liste döner.
//   • Migration GEREKMEZ (mevcut RPC'nin doğum tarihi filtresi güncel revizyona uygulanır).

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { BirthDataInput } from "../birth/profileInput";
import type { EngineCtx } from "../engine/service";
import { listRevisions } from "../persistence/repo";
import { nameKeys, sameBirthIdentity, sameName, type BirthIdentity } from "./duplicateMatch";

assertServerOnly("lib/astrology/profiles/duplicates");

export type DuplicateProfile = {
  profileId: string;
  label: string;
  clientName: string | null;
  birthDate: string;
  birthTime: string | null;
  timeKnown: boolean;
  timeAccuracy: string;
  locationLabel: string;
  archived: boolean;
  analysisCount: number;
  /** Başka bir profilin ortak (sinastri/kompozit) analizinde 2. kişi olarak yer aldığı kayıt sayısı (sahiplik o profilde). */
  partnerAnalysisCount: number;
};

type PageRow = {
  id: string;
  label: string;
  client_id: string | null;
  client_ad: string | null;
  client_soyad: string | null;
  current_revision: number;
  archived_at: string | null;
  analysis_count: number | string;
  total_count: number | string;
};

type DbErr = { code?: string; message?: string } | null;

/** Aynı doğum tarihli profil sayısı için güvenli üst sınır (sayfa 100; çok yüksek değer pratikte olmaz). */
const READ_CAP = 1000;

const full = (ad: string | null, soyad: string | null) => `${ad ?? ""} ${soyad ?? ""}`.replace(/\s+/g, " ").trim() || null;

export function identityOf(b: BirthDataInput): BirthIdentity {
  return {
    birthDate: b.birthDate,
    birthTime: b.birthTime,
    timeKnown: b.timeKnown,
    timeAccuracy: b.timeAccuracy,
    locationId: b.location.id,
    locationLabel: b.location.label,
    latitude: b.location.latitude,
    longitude: b.location.longitude,
    timezone: b.location.timezone,
    birthUtc: b.birthUtcIso,
  };
}

export async function findBirthDuplicates(
  ctx: EngineCtx,
  input: { names: (string | null | undefined)[]; birth: BirthDataInput; excludeProfileId?: string | null },
): Promise<{ rows: DuplicateProfile[]; error: DbErr }> {
  const keys = nameKeys(...input.names);
  if (keys.length === 0) return { rows: [], error: null };
  const target = identityOf(input.birth);

  // 1) Aynı doğum tarihli (güncel revizyon) kendi profilleri — etkin + arşivli.
  const cands: PageRow[] = [];
  for (const archived of [false, true]) {
    for (let offset = 0; offset < READ_CAP; offset += 100) {
      const { data, error } = await ctx.db.rpc("astro_profile_page", {
        p_tenant_id: ctx.tenantId,
        p_owner_user_id: ctx.userId,
        p_query: null,
        p_birth_date: target.birthDate,
        p_archived: archived,
        p_sort: "recent",
        p_limit: 100,
        p_offset: offset,
      });
      if (error) return { rows: [], error };
      const rows = (data as PageRow[] | null) ?? [];
      cands.push(...rows);
      if (rows.length < 100 || offset + rows.length >= Number(rows[0]?.total_count ?? 0)) break;
    }
  }
  // 2) Ad ön elemesi (kesin anahtar eşitliği).
  const named = cands.filter((p) => p.id !== input.excludeProfileId && sameName(keys, nameKeys(p.label, p.client_id ? full(p.client_ad, p.client_soyad) : null)));
  if (named.length === 0) return { rows: [], error: null };

  // 3) Güncel revizyonun tam doğum kimliği.
  const revs = await listRevisions(ctx.db, ctx.tenantId, ctx.userId, named.map((p) => p.id));
  if (revs.error) return { rows: [], error: revs.error };
  const matches: { p: PageRow; r: (typeof revs.rows)[number] }[] = [];
  for (const p of named) {
    const r = revs.rows.find((x) => x.profile_id === p.id && x.revision === p.current_revision);
    if (!r) continue;
    const id: BirthIdentity = {
      birthDate: String(r.birth_date).slice(0, 10),
      birthTime: r.birth_time,
      timeKnown: r.time_known,
      timeAccuracy: r.time_accuracy,
      locationId: r.location_id ?? "",
      locationLabel: r.location_label,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      timezone: r.timezone,
      birthUtc: r.birth_utc,
    };
    if (sameBirthIdentity(target, id)) matches.push({ p, r });
  }
  if (matches.length === 0) return { rows: [], error: null };

  // 4) Ortak analizlerde 2. kişi olarak yer alma sayısı (yalnız aynı uzmanın kayıtları; içerik okunmaz).
  const { data: pa, error: paErr } = await ctx.db
    .from("astro_analyses")
    .select("partner_profile_id")
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .in("partner_profile_id", matches.map((m) => m.p.id))
    .limit(5000);
  if (paErr) return { rows: [], error: paErr };
  const partnerCount = new Map<string, number>();
  for (const x of (pa as { partner_profile_id: string }[] | null) ?? []) partnerCount.set(x.partner_profile_id, (partnerCount.get(x.partner_profile_id) ?? 0) + 1);

  return {
    error: null,
    rows: matches.map(({ p, r }) => ({
      profileId: p.id,
      label: p.label,
      clientName: p.client_id ? full(p.client_ad, p.client_soyad) : null,
      birthDate: String(r.birth_date).slice(0, 10),
      birthTime: r.time_known ? r.birth_time : null,
      timeKnown: r.time_known,
      timeAccuracy: r.time_accuracy,
      locationLabel: r.location_label,
      archived: !!p.archived_at,
      analysisCount: Number(p.analysis_count) || 0,
      partnerAnalysisCount: partnerCount.get(p.id) ?? 0,
    })),
  };
}
