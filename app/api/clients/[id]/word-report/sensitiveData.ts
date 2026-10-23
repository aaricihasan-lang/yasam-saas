/**
 * AŞAMA 2 / BUG-005 — Danışan Word'ü için Anamnez / Beslenme verisinin tenant-kapsamlı okunması (sunucu).
 *
 * Erişim: word-report route'u `clients` (Danışan Yolculuğu) modül kapısından geçer; Anamnez ve
 * Beslenme danışan sekmeleri/API'leri de AYNI kapıyı kullanır (requireModuleAccess("clients") +
 * tenant'taki danışan). Burada her sorgu tenant_id + client_id ile bağlanır.
 * Anamnez: yalnız status = 'completed' form + client_consents'teki son "açık rıza (özel nitelikli
 * veri)" kaydı 'granted' ise. Taslak, ek dosya ve iç kayıtlar okunmaz.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchExplicitConsent, isMissingRelation } from "@/lib/danisan/anamnez/server";
import {
  ANAMNEZ_REPORT_COLUMNS,
  BESLENME_MEASUREMENT_COLUMNS,
  BESLENME_MEASUREMENT_LIMIT,
  BESLENME_PROFILE_COLUMNS,
  type AnamnezReportRow,
  type BeslenmeReportInput,
} from "./sensitiveSections";

export type AnamnezOption = { id: string; title: string | null; kind: string; assessment_date: string | null; completed_at: string | null };
export type AnamnezOptions = { available: boolean; consent: boolean | null; completed: AnamnezOption[] };

/** Word penceresi seçenekleri: tamamlanmış formlar (en yeni önce) + açık rıza durumu. */
export async function loadAnamnezOptions(db: SupabaseClient, tenantId: string, clientId: string): Promise<AnamnezOptions> {
  const { data, error } = await db.from("client_anamneses")
    .select("id, title, kind, assessment_date, completed_at")
    .eq("tenant_id", tenantId).eq("client_id", clientId).eq("status", "completed")
    .order("completed_at", { ascending: false }).limit(50);
  if (error) {
    if (isMissingRelation(error)) return { available: false, consent: null, completed: [] };
    throw Object.assign(new Error("anamnez_options"), { cause: error });
  }
  const consent = await fetchExplicitConsent(db, tenantId, clientId);
  return { available: true, consent, completed: (data ?? []) as AnamnezOption[] };
}

export type AnamnezLoad =
  | { ok: true; row: AnamnezReportRow }
  | { ok: false; status: number; error: string };

/** Rapor için anamnez: açık rıza ŞART; id verilmezse en yeni tamamlanmış form. */
export async function loadAnamnezForReport(db: SupabaseClient, tenantId: string, clientId: string, anamnesisId: string | null): Promise<AnamnezLoad> {
  const consent = await fetchExplicitConsent(db, tenantId, clientId);
  if (consent !== true)
    return { ok: false, status: 409, error: "Anamnez rapora eklenemez: danışanın açık rıza kaydı bulunmuyor." };
  let q = db.from("client_anamneses").select(ANAMNEZ_REPORT_COLUMNS)
    .eq("tenant_id", tenantId).eq("client_id", clientId).eq("status", "completed");
  if (anamnesisId) q = q.eq("id", anamnesisId);
  const { data, error } = await q.order("completed_at", { ascending: false }).limit(1);
  if (error) {
    if (isMissingRelation(error)) return { ok: false, status: 404, error: "Tamamlanmış anamnez bulunamadı." };
    throw Object.assign(new Error("anamnez_read"), { cause: error });
  }
  const row = ((data ?? []) as AnamnezReportRow[])[0];
  if (!row) return { ok: false, status: 404, error: "Tamamlanmış anamnez bulunamadı." };
  return { ok: true, row };
}

/** Beslenme özeti: profil + beyan alerjiler (katalog adlarıyla) + son ölçümler. */
export async function loadBeslenmeForReport(db: SupabaseClient, tenantId: string, clientId: string): Promise<BeslenmeReportInput> {
  const [profileRes, allergenRes, measRes] = await Promise.all([
    db.from("nutrition_client_profiles").select(BESLENME_PROFILE_COLUMNS).eq("tenant_id", tenantId).eq("client_id", clientId).maybeSingle(),
    db.from("nutrition_client_allergens").select("allergen_id, custom_label, note").eq("tenant_id", tenantId).eq("client_id", clientId).limit(100),
    db.from("nutrition_client_measurements").select(BESLENME_MEASUREMENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId).eq("client_id", clientId)
      .order("measured_at", { ascending: false }).limit(BESLENME_MEASUREMENT_LIMIT),
  ]);
  for (const r of [profileRes, allergenRes, measRes]) {
    if (r.error && !isMissingRelation(r.error)) throw Object.assign(new Error("beslenme_read"), { cause: r.error });
  }
  const allergenRows = (allergenRes.error ? [] : allergenRes.data ?? []) as Array<{ allergen_id: string | null; custom_label: string | null; note: string | null }>;
  const ids = Array.from(new Set(allergenRows.map((a) => a.allergen_id).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await db.from("nutrition_allergens").select("id, name_tr").in("id", ids);
    if (error) throw Object.assign(new Error("beslenme_allergen_catalog"), { cause: error });
    for (const r of (data ?? []) as Array<{ id: string; name_tr: string }>) names.set(r.id, r.name_tr);
  }
  const measurements = (measRes.error ? [] : measRes.data ?? []) as BeslenmeReportInput["measurements"];
  return {
    profile: profileRes.error ? null : ((profileRes.data as BeslenmeReportInput["profile"]) ?? null),
    allergens: allergenRows
      .map((a) => ({ name: (a.allergen_id ? names.get(a.allergen_id) : a.custom_label) ?? a.custom_label ?? "", note: a.note }))
      .filter((a) => a.name.trim())
      .sort((x, y) => x.name.localeCompare(y.name, "tr")),
    measurements,
    measurementTotal: measRes.error ? 0 : (measRes.count ?? measurements.length),
  };
}

/** Pencere için: Beslenme özetinde gösterilecek veri var mı (içerik okunmadan sayımla). */
export async function beslenmeHasData(db: SupabaseClient, tenantId: string, clientId: string): Promise<boolean> {
  const counts = await Promise.all(["nutrition_client_profiles", "nutrition_client_allergens", "nutrition_client_measurements"].map((t) =>
    db.from(t).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("client_id", clientId)));
  return counts.some((r) => !r.error && (r.count ?? 0) > 0);
}
