// AŞAMA 3C — Human Design profili ↔ merkezî Danışan Yolculuğu danışanı (public.clients).
//
// YALNIZ SUNUCU (service_role). Kurallar:
//   • tenant_id + user_id YALNIZ route guard'ından; gövdeden ASLA alınmaz.
//   • İsimle/doğum tarihiyle OTOMATİK bağlama YOK. Birebir eşleşen danışanlar yalnız ÖNERİ olarak döner;
//     bağlantıyı uzman açık eylemle kurar.
//   • Bağlantı DB'de tenant-güvenli bileşik FK + kısmi UNIQUE (migration 20271010000000) ile korunur;
//     uygulama ayrıca her iki satırı da aynı tenant'ta okuyup doğrular (savunma derinliği).
//   • Merkezî danışan oluşturma Danışan Yolculuğu ile AYNI doğrulama + idempotency + burç türetimini
//     kullanır (validateClientWrite / createClientIdempotent / computeBurc) — ayrı bir CRM yok.
//   • Roxy hesap katmanına DOKUNMAZ: HD profilinin kimliği (input_hash girdisi) değişmez.
//   • Ham DB hatası istemciye dönmez (hdSafeDbError / sabit mesajlar).

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant, tenantInsertPayload } from "./tenantScope";
import { hdSafeDbError } from "./safeError";
import { resolveClientLocationFields } from "./clientPersistence";
import { HD_CHART_IMAGE_BUCKET } from "./hdStorage";
import { isOwnedChartImagePath, isOwnedReportSnapshotPath } from "./chartImagePath";
import { validateClientWrite } from "@/lib/danisan/clientValidation";
import { createClientIdempotent, isUuid, resolveCreateRequestId } from "@/lib/danisan/clientCreate";
import { computeBurc } from "@/lib/danisan/burc";
import { istanbulToday } from "@/lib/danisan/istanbulTime";

const HD = "human_design_clients";

export type JourneyClientDto = { id: string; ad: string; soyad: string; dogum: string | null };
export type JourneySearchRow = JourneyClientDto & { hd_client_id: string | null };

export type JourneyFail = { ok: false; status: 400 | 404 | 409 | 500; code: string; error: string; hdClientId?: string };
type Ok<T> = { ok: true } & T;

const fail = (status: JourneyFail["status"], code: string, error: string, extra: Partial<JourneyFail> = {}): JourneyFail => ({
  ok: false,
  status,
  code,
  error,
  ...extra,
});

const pgCode = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;

/**
 * Migration 20271010000000 henüz uygulanmamışsa (journey_client_id kolonu / HD tablosu yok) bağlı HD
 * profili OLAMAZ → kalıcı silme ön izlemesi/akışı "bağlı HD yok" kabul eder (rollout güvenliği: kod
 * migration'dan önce yayına çıksa bile danışan silme kilitlenmez). Diğer DB hataları fail-closed kalır.
 */
function isSchemaNotReady(e: unknown): boolean {
  const c = pgCode(e);
  const m = String((e as { message?: string } | null)?.message ?? "");
  return c === "42703" || c === "42P01" || c === "PGRST204" || c === "PGRST205" || /journey_client_id|does not exist|Could not find/i.test(m);
}
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toDto(r: Record<string, unknown>): JourneyClientDto {
  return {
    id: String(r.id),
    ad: typeof r.ad === "string" ? r.ad : "",
    soyad: typeof r.soyad === "string" ? r.soyad : "",
    dogum: typeof r.dogum === "string" && r.dogum ? r.dogum.slice(0, 10) : null,
  };
}

export function journeyFullName(c: Pick<JourneyClientDto, "ad" | "soyad">): string {
  return `${c.ad ?? ""} ${c.soyad ?? ""}`.replace(/\s+/g, " ").trim();
}

const trLower = (s: string) => s.normalize("NFC").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

async function readJourneyClient(db: SupabaseClient, tenantId: string, id: string): Promise<{ row: JourneyClientDto | null; error: string | null }> {
  const { data, error } = await withTenant(db.from("clients").select("id, ad, soyad, dogum"), tenantId, "journey.readClient")
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("journey.readClient", error) };
  return { row: data ? toDto(data as Record<string, unknown>) : null, error: null };
}

type HdProfileRow = {
  id: string;
  name: string;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  journey_client_id: string | null;
};

async function readHdProfile(db: SupabaseClient, tenantId: string, id: string): Promise<{ row: HdProfileRow | null; error: string | null }> {
  const { data, error } = await withTenant(
    db.from(HD).select("id, name, birth_date, birth_time, birth_place, journey_client_id"),
    tenantId,
    "journey.readHdProfile",
  )
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("journey.readHdProfile", error) };
  return { row: (data as HdProfileRow | null) ?? null, error: null };
}

async function hdProfileForJourney(db: SupabaseClient, tenantId: string, journeyId: string): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await withTenant(db.from(HD).select("id"), tenantId, "journey.profileFor")
    .eq("journey_client_id", journeyId)
    .maybeSingle();
  if (error) return { id: null, error: hdSafeDbError("journey.profileFor", error) };
  return { id: data ? String((data as { id: string }).id) : null, error: null };
}

/** Bu istekte OLUŞTURULAN (replay değil) merkezî danışanı telafi amaçlı geri al (henüz çocuk satırı yok). */
async function compensateCreatedClient(db: SupabaseClient, tenantId: string, clientId: string): Promise<void> {
  const { error } = await withTenant(db.from("clients").delete(), tenantId, "journey.compensate").eq("id", clientId);
  if (error) console.error("[hd-journey] telafi silmesi başarısız:", hdSafeDbError("journey.compensate", error));
}

// ─── Arama (merkezî danışan seçici) ───────────────────────────────────────────

/**
 * Aynı tenant'taki merkezî danışanlar — YALNIZ id/ad/soyad/dogum (+ bağlı HD profil kimliği).
 * Telefon, notlar vb. dönmez. Sorgu /api/clients araması ile aynı desen (ad/soyad ilike), çok
 * kelimeli girişte her kelime ad+soyad içinde aranır (Türkçe küçük harf).
 */
export async function searchJourneyClients(
  db: SupabaseClient,
  tenantId: string,
  rawSearch: string,
  limit = 20,
): Promise<{ rows: JourneySearchRow[]; error: string | null }> {
  const cleaned = rawSearch.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const tokens = cleaned ? cleaned.split(" ").filter(Boolean) : [];
  const cap = Math.max(1, Math.min(limit, 50));
  let q = withTenant(db.from("clients").select("id, ad, soyad, dogum"), tenantId, "journey.search").order("created_at", { ascending: false });
  if (tokens.length > 0) {
    const longest = [...tokens].sort((a, b) => b.length - a.length)[0];
    q = q.or(`ad.ilike.%${longest}%,soyad.ilike.%${longest}%`);
  }
  const { data, error } = await q.limit(tokens.length > 1 ? 200 : cap);
  if (error) return { rows: [], error: hdSafeDbError("journey.search", error) };
  const wanted = tokens.map(trLower);
  const dtos = ((data ?? []) as Record<string, unknown>[])
    .map(toDto)
    .filter((c) => wanted.every((t) => trLower(journeyFullName(c)).includes(t)))
    .slice(0, cap);
  if (dtos.length === 0) return { rows: [], error: null };
  const { data: links, error: linkErr } = await withTenant(db.from(HD).select("id, journey_client_id"), tenantId, "journey.searchLinks").in(
    "journey_client_id",
    dtos.map((d) => d.id),
  );
  if (linkErr) return { rows: [], error: hdSafeDbError("journey.searchLinks", linkErr) };
  const byJourney = new Map<string, string>();
  for (const l of (links ?? []) as { id: string; journey_client_id: string | null }[]) {
    if (l.journey_client_id) byJourney.set(String(l.journey_client_id), String(l.id));
  }
  return { rows: dtos.map((d) => ({ ...d, hd_client_id: byJourney.get(d.id) ?? null })), error: null };
}

// ─── HD'ye özgü doğum alanları doğrulaması ─────────────────────────────────────

type HdBirthInput = { birth_time: string; locFields: Record<string, unknown>; place: string };

function validateHdBirth(input: Record<string, unknown>): { ok: true; v: HdBirthInput } | JourneyFail {
  const time = typeof input.birth_time === "string" ? input.birth_time.trim() : "";
  if (!HM_RE.test(time)) return fail(400, "BIRTH_TIME_REQUIRED", "Doğum saati zorunludur (SS:DD).");
  if (typeof input.birth_location_ref !== "string" || !input.birth_location_ref.trim()) {
    return fail(400, "BIRTH_PLACE_REQUIRED", "Doğum yeri listeden seçilmelidir.");
  }
  const loc = resolveClientLocationFields({ birth_location_ref: input.birth_location_ref });
  if (loc.error || !loc.fields) return fail(400, "BIRTH_PLACE_INVALID", loc.error ?? "Doğum yeri doğrulanamadı. Lütfen listeden yeniden seçin.");
  return { ok: true, v: { birth_time: time.slice(0, 5), locFields: loc.fields, place: String(loc.fields.birth_location_label ?? "") } };
}

async function insertLinkedHdProfile(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  journey: JourneyClientDto,
  birthDate: string,
  birth: HdBirthInput,
): Promise<{ id: string | null; unique: boolean; error: string | null }> {
  const payload = tenantInsertPayload(tenantId, {
    name: journeyFullName(journey),
    birth_date: birthDate,
    birth_time: birth.birth_time,
    birth_place: birth.place || null,
    ...birth.locFields,
    user_id: userId,
    journey_client_id: journey.id,
    updated_at: new Date().toISOString(),
  });
  const { data, error } = await db.from(HD).insert(payload).select("id").single();
  if (error) return { id: null, unique: pgCode(error) === "23505", error: hdSafeDbError("journey.insertProfile", error) };
  return { id: String((data as { id: string }).id), unique: false, error: null };
}

// ─── Yeni merkezî danışan + HD profili ─────────────────────────────────────────

export async function createJourneyClientWithHdProfile(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<Ok<{ hdClientId: string; journeyClientId: string; created: boolean }> | JourneyFail> {
  const verdict = validateClientWrite({ ad: input.ad, soyad: input.soyad, dogum: input.dogum }, "create", istanbulToday());
  if (!verdict.ok) return fail(400, verdict.code, verdict.error);
  const dogum = verdict.fields.dogum;
  if (!dogum) return fail(400, "BIRTH_DATE_REQUIRED", "Doğum tarihi zorunludur.");
  const birth = validateHdBirth(input);
  if (!birth.ok) return birth;

  const fields: Record<string, unknown> = { ...verdict.fields, burc: computeBurc(dogum) };
  const result = await createClientIdempotent(db, tenantId, fields, resolveCreateRequestId(input));
  if (result.kind === "error") return fail(500, "JOURNEY_CREATE_FAILED", "Danışan oluşturulamadı.");
  const journey = toDto(result.client);

  // Aynı istek tekrarı (replay) veya eşzamanlı tekrar → mevcut bağlı profil döner (çift profil yok).
  const existing = await hdProfileForJourney(db, tenantId, journey.id);
  if (existing.error) return fail(500, "DB_ERROR", existing.error);
  if (existing.id) return { ok: true, hdClientId: existing.id, journeyClientId: journey.id, created: false };

  const ins = await insertLinkedHdProfile(db, tenantId, userId, journey, dogum, birth.v);
  if (!ins.id) {
    if (ins.unique) {
      const again = await hdProfileForJourney(db, tenantId, journey.id);
      if (again.id) return { ok: true, hdClientId: again.id, journeyClientId: journey.id, created: false };
    }
    if (result.kind === "created") await compensateCreatedClient(db, tenantId, journey.id);
    return fail(500, "HD_PROFILE_CREATE_FAILED", "Human Design profili oluşturulamadı.");
  }
  return { ok: true, hdClientId: ins.id, journeyClientId: journey.id, created: result.kind === "created" };
}

// ─── Mevcut merkezî danışan için HD profili ───────────────────────────────────

export async function createHdProfileForJourneyClient(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<Ok<{ hdClientId: string; journeyClientId: string }> | JourneyFail> {
  const journeyId = typeof input.journey_client_id === "string" ? input.journey_client_id.trim() : "";
  if (!isUuid(journeyId)) return fail(400, "INVALID_ID", "Geçerli bir danışan seçilmelidir.");
  const birth = validateHdBirth(input);
  if (!birth.ok) return birth;

  const { row: journey, error } = await readJourneyClient(db, tenantId, journeyId);
  if (error) return fail(500, "DB_ERROR", error);
  if (!journey) return fail(404, "JOURNEY_NOT_FOUND", "Danışan bulunamadı.");
  if (!journey.ad.trim() || !journey.soyad.trim()) {
    return fail(400, "JOURNEY_NAME_INCOMPLETE", "Danışan Yolculuğu kaydında ad ve soyad eksik. Önce danışan kaydını tamamlayın.");
  }
  // Doğum tarihi: merkezî kayıt esastır. Merkezîde yoksa formdan alınır (merkezî kayda YAZILMAZ).
  let birthDate = journey.dogum;
  if (!birthDate) {
    const d = typeof input.birth_date === "string" ? input.birth_date.trim() : "";
    if (!ISO_DATE_RE.test(d) || d > istanbulToday()) return fail(400, "BIRTH_DATE_REQUIRED", "Doğum tarihi zorunludur.");
    birthDate = d;
  }

  const existing = await hdProfileForJourney(db, tenantId, journey.id);
  if (existing.error) return fail(500, "DB_ERROR", existing.error);
  if (existing.id) {
    return fail(409, "HD_PROFILE_EXISTS", "Bu danışanın zaten bir Human Design profili var.", { hdClientId: existing.id });
  }
  const ins = await insertLinkedHdProfile(db, tenantId, userId, journey, birthDate, birth.v);
  if (!ins.id) {
    if (ins.unique) {
      const again = await hdProfileForJourney(db, tenantId, journey.id);
      return fail(409, "HD_PROFILE_EXISTS", "Bu danışanın zaten bir Human Design profili var.", again.id ? { hdClientId: again.id } : {});
    }
    return fail(500, "HD_PROFILE_CREATE_FAILED", "Human Design profili oluşturulamadı.");
  }
  return { ok: true, hdClientId: ins.id, journeyClientId: journey.id };
}

// ─── Eski (bağlanmamış) HD profilini bağlama ──────────────────────────────────

async function attachJourney(
  db: SupabaseClient,
  tenantId: string,
  hdId: string,
  journeyId: string,
): Promise<Ok<Record<never, never>> | JourneyFail> {
  // Yalnız bağlı OLMAYAN profil bağlanır (koşullu güncelleme → eşzamanlı ikinci bağlama 0 satır).
  const { data, error } = await withTenant(db.from(HD).update({ journey_client_id: journeyId, updated_at: new Date().toISOString() }), tenantId, "journey.attach")
    .eq("id", hdId)
    .is("journey_client_id", null)
    .select("id");
  if (error) {
    const c = pgCode(error);
    if (c === "23505") return fail(409, "JOURNEY_HAS_PROFILE", "Bu danışan zaten başka bir Human Design profiline bağlı.");
    if (c === "23503") return fail(404, "JOURNEY_NOT_FOUND", "Danışan bulunamadı.");
    if (c === "23514") return fail(409, "PROFILE_NOT_LINKABLE", "Bu Human Design kaydı bağlanamıyor.");
    return fail(500, "DB_ERROR", hdSafeDbError("journey.attach", error));
  }
  if (!data || data.length === 0) return fail(409, "ALREADY_LINKED", "Bu Human Design profili zaten bir danışana bağlı.");
  return { ok: true };
}

export async function linkHdProfileToJourneyClient(
  db: SupabaseClient,
  tenantId: string,
  hdId: string,
  journeyId: string,
): Promise<Ok<{ hdClientId: string; journeyClientId: string }> | JourneyFail> {
  if (!isUuid(hdId) || !isUuid(journeyId)) return fail(400, "INVALID_ID", "Geçersiz kayıt.");
  const { row: profile, error } = await readHdProfile(db, tenantId, hdId);
  if (error) return fail(500, "DB_ERROR", error);
  if (!profile) return fail(404, "HD_NOT_FOUND", "Human Design kaydı bulunamadı.");
  if (profile.journey_client_id === journeyId) return { ok: true, hdClientId: hdId, journeyClientId: journeyId };
  if (profile.journey_client_id) return fail(409, "ALREADY_LINKED", "Bu Human Design profili zaten bir danışana bağlı.");
  const { row: journey, error: jErr } = await readJourneyClient(db, tenantId, journeyId);
  if (jErr) return fail(500, "DB_ERROR", jErr);
  if (!journey) return fail(404, "JOURNEY_NOT_FOUND", "Danışan bulunamadı.");
  const other = await hdProfileForJourney(db, tenantId, journeyId);
  if (other.error) return fail(500, "DB_ERROR", other.error);
  if (other.id) return fail(409, "JOURNEY_HAS_PROFILE", "Bu danışan zaten başka bir Human Design profiline bağlı.");
  const r = await attachJourney(db, tenantId, hdId, journeyId);
  if (!r.ok) return r;
  return { ok: true, hdClientId: hdId, journeyClientId: journeyId };
}

export async function linkHdProfileToNewJourneyClient(
  db: SupabaseClient,
  tenantId: string,
  hdId: string,
  input: Record<string, unknown>,
): Promise<Ok<{ hdClientId: string; journeyClientId: string }> | JourneyFail> {
  if (!isUuid(hdId)) return fail(400, "INVALID_ID", "Geçersiz kayıt.");
  const { row: profile, error } = await readHdProfile(db, tenantId, hdId);
  if (error) return fail(500, "DB_ERROR", error);
  if (!profile) return fail(404, "HD_NOT_FOUND", "Human Design kaydı bulunamadı.");
  if (profile.journey_client_id) return fail(409, "ALREADY_LINKED", "Bu Human Design profili zaten bir danışana bağlı.");
  const dogum = profile.birth_date ? profile.birth_date.slice(0, 10) : undefined;
  const verdict = validateClientWrite({ ad: input.ad, soyad: input.soyad, ...(dogum ? { dogum } : {}) }, "create", istanbulToday());
  if (!verdict.ok) return fail(400, verdict.code, verdict.error);
  const fields: Record<string, unknown> = { ...verdict.fields, burc: computeBurc(verdict.fields.dogum ?? null) };
  const result = await createClientIdempotent(db, tenantId, fields, resolveCreateRequestId(input));
  if (result.kind === "error") return fail(500, "JOURNEY_CREATE_FAILED", "Danışan oluşturulamadı.");
  const journeyId = String(result.client.id);
  const r = await attachJourney(db, tenantId, hdId, journeyId);
  if (!r.ok) {
    // Aynı isteğin tekrarı: profil zaten bu danışana bağlandıysa başarı.
    const again = await readHdProfile(db, tenantId, hdId);
    if (again.row?.journey_client_id === journeyId) return { ok: true, hdClientId: hdId, journeyClientId: journeyId };
    if (result.kind === "created") await compensateCreatedClient(db, tenantId, journeyId);
    return r;
  }
  return { ok: true, hdClientId: hdId, journeyClientId: journeyId };
}

/** Bağlantıyı kaldır — HD verisi SİLİNMEZ (yalnız ilişki koparılır). */
export async function unlinkHdProfile(db: SupabaseClient, tenantId: string, hdId: string): Promise<Ok<Record<never, never>> | JourneyFail> {
  if (!isUuid(hdId)) return fail(400, "INVALID_ID", "Geçersiz kayıt.");
  const { data, error } = await withTenant(db.from(HD).update({ journey_client_id: null, updated_at: new Date().toISOString() }), tenantId, "journey.unlink")
    .eq("id", hdId)
    .select("id");
  if (error) return fail(500, "DB_ERROR", hdSafeDbError("journey.unlink", error));
  if (!data || data.length === 0) return fail(404, "HD_NOT_FOUND", "Human Design kaydı bulunamadı.");
  return { ok: true };
}

/**
 * Doğum tarihi: MERKEZÎ → HD (tek yön, uzman açık eylemiyle). Yalnız HD profilinin birth_date'i
 * değişir; merkezî kayıt ve mevcut haritalar (hesap anı kaydı) DEĞİŞMEZ.
 */
export async function syncHdBirthDateFromJourney(
  db: SupabaseClient,
  tenantId: string,
  hdId: string,
): Promise<Ok<{ birthDate: string }> | JourneyFail> {
  if (!isUuid(hdId)) return fail(400, "INVALID_ID", "Geçersiz kayıt.");
  const { row: profile, error } = await readHdProfile(db, tenantId, hdId);
  if (error) return fail(500, "DB_ERROR", error);
  if (!profile) return fail(404, "HD_NOT_FOUND", "Human Design kaydı bulunamadı.");
  if (!profile.journey_client_id) return fail(409, "NOT_LINKED", "Bu Human Design profili bir danışana bağlı değil.");
  const { row: journey, error: jErr } = await readJourneyClient(db, tenantId, profile.journey_client_id);
  if (jErr) return fail(500, "DB_ERROR", jErr);
  if (!journey) return fail(404, "JOURNEY_NOT_FOUND", "Danışan bulunamadı.");
  if (!journey.dogum) return fail(409, "NO_JOURNEY_BIRTH_DATE", "Danışan Yolculuğu kaydında doğum tarihi yok.");
  const { data, error: upErr } = await withTenant(db.from(HD).update({ birth_date: journey.dogum, updated_at: new Date().toISOString() }), tenantId, "journey.syncBirth")
    .eq("id", hdId)
    .eq("journey_client_id", journey.id)
    .select("id");
  if (upErr) return fail(500, "DB_ERROR", hdSafeDbError("journey.syncBirth", upErr));
  if (!data || data.length === 0) return fail(409, "NOT_LINKED", "Bağlantı değişti; sayfayı yenileyin.");
  return { ok: true, birthDate: journey.dogum };
}

// ─── Okuma: profil için bağlantı bilgisi + öneriler ────────────────────────────

export type HdJourneyInfo = {
  journey: JourneyClientDto | null;
  /** Yalnız bağlanmamış profilde: aynı tenant + birebir ad soyad + doğum tarihi. OTOMATİK SEÇİLMEZ. */
  suggestions: JourneyClientDto[];
};

export async function getHdJourneyInfo(
  db: SupabaseClient,
  tenantId: string,
  profile: { name?: string | null; birth_date?: string | null; journey_client_id?: string | null },
): Promise<{ info: HdJourneyInfo; error: string | null }> {
  if (profile.journey_client_id) {
    const { row, error } = await readJourneyClient(db, tenantId, profile.journey_client_id);
    return { info: { journey: row, suggestions: [] }, error };
  }
  const date = profile.birth_date ? profile.birth_date.slice(0, 10) : "";
  const name = trLower(profile.name ?? "");
  if (!ISO_DATE_RE.test(date) || !name) return { info: { journey: null, suggestions: [] }, error: null };
  const { data, error } = await withTenant(db.from("clients").select("id, ad, soyad, dogum"), tenantId, "journey.suggest").eq("dogum", date).limit(50);
  if (error) return { info: { journey: null, suggestions: [] }, error: hdSafeDbError("journey.suggest", error) };
  const exact = ((data ?? []) as Record<string, unknown>[]).map(toDto).filter((c) => trLower(journeyFullName(c)) === name);
  if (exact.length === 0) return { info: { journey: null, suggestions: [] }, error: null };
  const { data: taken } = await withTenant(db.from(HD).select("journey_client_id"), tenantId, "journey.suggestTaken").in(
    "journey_client_id",
    exact.map((c) => c.id),
  );
  const takenSet = new Set(((taken ?? []) as { journey_client_id: string | null }[]).map((t) => String(t.journey_client_id)));
  return { info: { journey: null, suggestions: exact.filter((c) => !takenSet.has(c.id)).slice(0, 5) }, error: null };
}

// ─── Danışan Yolculuğu sekmesi: merkezî danışanın HD geçmişi (özet) ─────────────

export type JourneyHdAnalysis = {
  id: string;
  created_at: string;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  type_code: string | null;
  profile_code: string | null;
  authority_code: string | null;
  kind: "roxy" | "engine" | "manual";
};

export async function getJourneyHdSummary(
  db: SupabaseClient,
  tenantId: string,
  journeyId: string,
): Promise<{ profile: { id: string; name: string } | null; analyses: JourneyHdAnalysis[]; error: string | null }> {
  const { data: prof, error } = await withTenant(db.from(HD).select("id, name"), tenantId, "journey.summaryProfile")
    .eq("journey_client_id", journeyId)
    .maybeSingle();
  if (error) return { profile: null, analyses: [], error: hdSafeDbError("journey.summaryProfile", error) };
  if (!prof) return { profile: null, analyses: [], error: null };
  const p = prof as { id: string; name: string };
  const { data: charts, error: cErr } = await withTenant(
    db.from("human_design_charts").select("id, created_at, birth_date, birth_time, birth_place, type_code, profile_code, authority_code, source, provider"),
    tenantId,
    "journey.summaryCharts",
  )
    .eq("client_id", p.id)
    .order("created_at", { ascending: false });
  if (cErr) return { profile: { id: p.id, name: p.name }, analyses: [], error: hdSafeDbError("journey.summaryCharts", cErr) };
  const analyses = ((charts ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    created_at: String(c.created_at ?? ""),
    birth_date: (c.birth_date as string | null) ?? null,
    birth_time: (c.birth_time as string | null) ?? null,
    birth_place: (c.birth_place as string | null) ?? null,
    type_code: (c.type_code as string | null) ?? null,
    profile_code: (c.profile_code as string | null) ?? null,
    authority_code: (c.authority_code as string | null) ?? null,
    kind: (c.source === "computed" ? (c.provider === "roxyapi" ? "roxy" : "engine") : "manual") as JourneyHdAnalysis["kind"],
  }));
  return { profile: { id: p.id, name: p.name }, analyses, error: null };
}

// ─── Kalıcı danışan silme entegrasyonu ─────────────────────────────────────────

/** Silme ön izlemesi: merkezî danışana bağlı HD profili / analiz / rapor sayısı (hata → null). */
export async function countHdForJourneyClient(
  db: SupabaseClient,
  tenantId: string,
  journeyId: string,
): Promise<{ profiles: number; charts: number; reports: number } | null> {
  const { data, error } = await withTenant(db.from(HD).select("id"), tenantId, "journey.countProfiles").eq("journey_client_id", journeyId);
  if (error) return isSchemaNotReady(error) ? { profiles: 0, charts: 0, reports: 0 } : null;
  const ids = ((data ?? []) as { id: string }[]).map((r) => String(r.id));
  if (ids.length === 0) return { profiles: 0, charts: 0, reports: 0 };
  const count = async (table: string) => {
    const { count: n, error: e } = await withTenant(db.from(table).select("*", { count: "exact", head: true }), tenantId, `journey.count.${table}`).in(
      "client_id",
      ids,
    );
    return e || typeof n !== "number" ? null : n;
  };
  const [charts, reports] = await Promise.all([count("human_design_charts"), count("human_design_reports")]);
  if (charts === null || reports === null) return null;
  return { profiles: ids.length, charts, reports };
}

/**
 * Kalıcı silmeden ÖNCE: bağlı HD profillerinin storage nesneleri (danışan görsel klasörü + bu
 * profillere ait raporların snapshot görselleri). Yalnız bu tenant+profil öneki / rapor snapshot
 * yolları döner → yabancı nesneye dokunulmaz. Hata → ok:false (çağıran karar verir).
 */
export async function collectHdStoragePathsForJourneyClient(
  db: SupabaseClient,
  tenantId: string,
  journeyId: string,
): Promise<{ ok: boolean; paths: string[] }> {
  const { data, error } = await withTenant(db.from(HD).select("id"), tenantId, "journey.storageProfiles").eq("journey_client_id", journeyId);
  if (error) return isSchemaNotReady(error) ? { ok: true, paths: [] } : { ok: false, paths: [] };
  const ids = ((data ?? []) as { id: string }[]).map((r) => String(r.id));
  if (ids.length === 0) return { ok: true, paths: [] };
  const out = new Set<string>();
  for (const id of ids) {
    const prefix = `${tenantId}/${id}`;
    const { data: objs, error: lErr } = await db.storage.from(HD_CHART_IMAGE_BUCKET).list(prefix, { limit: 1000 });
    if (lErr) return { ok: false, paths: [] };
    for (const o of objs ?? []) {
      if (o && o.name && o.id !== null) {
        const p = `${prefix}/${o.name}`;
        if (isOwnedChartImagePath(p, tenantId, id)) out.add(p);
      }
    }
  }
  const { data: reps, error: rErr } = await withTenant(db.from("human_design_reports").select("id, snapshot"), tenantId, "journey.storageReports").in(
    "client_id",
    ids,
  );
  if (rErr) return { ok: false, paths: [] };
  for (const r of (reps ?? []) as Record<string, unknown>[]) {
    const snap = r.snapshot as { chartImage?: { storagePath?: unknown } } | null | undefined;
    const p = snap?.chartImage?.storagePath;
    if (typeof p !== "string" || !p) continue;
    if (isOwnedReportSnapshotPath(p, tenantId) || ids.some((id) => isOwnedChartImagePath(p, tenantId, id))) out.add(p);
  }
  return { ok: true, paths: [...out] };
}
