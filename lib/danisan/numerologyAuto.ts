/**
 * DANIŞAN YOLCULUĞU — OTOMATİK TAM NUMEROLOJİ ANALİZİ (owner kararı 24.10.2026).
 *
 * Numeroloji yetkili uzman danışanı kaydettiğinde / ad-soyad-doğum tarihini değiştirdiğinde ve
 * danışanın Numeroloji sekmesi ilk açıldığında, danışanın TAM kişi analizi Numeroloji modülünün
 * KENDİ kayıt biçimiyle (`numerology_records`, analysis_data v1 + sunucu metodoloji damgası)
 * oluşturulur ve danışana bağlanır (`client_id`). Uzman ayrıca hesapla / kaydet / bağla yapmaz.
 *
 * - Motor DEĞİŞMEZ ve KOPYALANMAZ: `hesaplaNumeroloji` (modülün kaydettiği motor) aynen çağrılır;
 *   özet metni modülün `buildAnalizOzeti`'siyle üretilir; damga NUMEROLOJI_METHODOLOGY_VERSION.
 * - Kopya kayıt YOK: önce danışana bağlı, aynı girdili ve GÜNCEL metodolojili kayıt aranır
 *   (elle kaydedilip bağlanmış analiz dahil) → varsa o kullanılır. Yoksa kimlik, girdilerden
 *   (tenant + danışan + ad + soyad + doğum + metodoloji) DETERMİNİSTİK üretilir → iki sekme aynı
 *   anda tetiklese bile PK çakışması tek kayda düşer (migration / kilit gerekmez).
 * - Geçmiş korunur: girdi ya da metodoloji değişince YENİ kayıt oluşur; eski kayıtlar
 *   (önceki metodoloji dahil) hiçbir alanıyla DEĞİŞTİRİLMEZ ve danışan bağları kalır.
 * - Doğum tarihi yoksa sahte sonuç üretilmez (`missing_birth`); tarih girilince bir sonraki
 *   tetiklemede analiz otomatik hazırlanır.
 * - Yetki ÇAĞIRANIN sorumluluğundadır (clients + numerology); burada tenant + danışan bağlanır.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { birthDateForEngine, NUMEROLOJI_METHODOLOGY_VERSION } from "@/lib/numeroloji/methodology";
import { recordMethodologyStamp } from "@/app/numeroloji/utils/analysisJson";
import { buildAnalizOzeti } from "@/app/numeroloji/utils/numerolojiPlainMetin";
import { isMissingClientIdColumn } from "@/lib/danisan/numerologyLink";

export type AutoClientRow = { id: string; ad?: unknown; soyad?: unknown; dogum?: unknown };

export type AutoNumerologyRecord = {
  id: string;
  name: string;
  surname: string;
  birth_date: string;
  analysis_data: unknown;
  created_at: string | null;
};

export type EnsureResult =
  | { status: "ok"; record: AutoNumerologyRecord; created: boolean }
  | { status: "missing_birth" }
  | { status: "missing_name" }
  | { status: "unavailable" }
  | { status: "error" };

const RECORD_COLUMNS = "id, name, surname, birth_date, analysis_data, created_at";
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const cmp = (v: unknown) => norm(v).toLocaleLowerCase("tr-TR");

/** Danışan kaydından motor girdileri. Doğum tarihi ISO (YYYY-MM-DD) → kayıt biçimi GG/AA/YYYY. */
export function autoNumerologyInputs(client: AutoClientRow):
  | { ok: true; name: string; surname: string; birthIso: string; birthDisplay: string; birthEngine: string }
  | { ok: false; reason: "missing_birth" | "missing_name" } {
  const name = norm(client.ad);
  const surname = norm(client.soyad);
  if (!name || !surname) return { ok: false, reason: "missing_name" };
  const m = ISO_DATE_RE.exec(norm(client.dogum));
  if (!m) return { ok: false, reason: "missing_birth" };
  const birthIso = `${m[1]}-${m[2]}-${m[3]}`;
  return { ok: true, name, surname, birthIso, birthDisplay: `${m[3]}/${m[2]}/${m[1]}`, birthEngine: birthDateForEngine(birthIso) };
}

/** Girdilerden deterministik kayıt kimliği (aynı girdi + metodoloji → aynı id). */
export function autoNumerologyRecordId(tenantId: string, clientId: string, name: string, surname: string, birthIso: string): string {
  const h = createHash("sha256")
    .update(["dy-auto-numerology", tenantId, clientId, cmp(name), cmp(surname), birthIso, NUMEROLOJI_METHODOLOGY_VERSION].join("\u001f"))
    .digest("hex");
  // RFC 4122 biçimi: sürüm 8 (özel), varyant 10xx.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function sameInputs(row: { name?: unknown; surname?: unknown; birth_date?: unknown }, inp: { name: string; surname: string; birthEngine: string }): boolean {
  return cmp(row.name) === cmp(inp.name) && cmp(row.surname) === cmp(inp.surname) && birthDateForEngine(String(row.birth_date ?? "")) === inp.birthEngine;
}

/** Motoru çalıştırıp Numeroloji modülünün kayıt biçiminde analysis_data üretir (DB'ye yazmaz). */
export function buildAutoAnalysisData(inp: { name: string; surname: string; birthEngine: string }, clientId: string, now = new Date()) {
  const motor = JSON.parse(JSON.stringify(hesaplaNumeroloji({ firstName: inp.name, lastName: inp.surname, birthDate: inp.birthEngine })));
  return {
    version: 1 as const,
    motor,
    summary: buildAnalizOzeti(motor),
    calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION, stampedAt: now.toISOString() },
    auto: { source: "danisan_yolculugu", clientId },
  };
}

/**
 * Danışanın güncel girdileri + güncel metodoloji için bağlı tam analizi döndürür; yoksa oluşturur.
 * `persist: false` (demo vitrin) → DB'ye yazmadan geçici sonuç.
 */
export async function ensureClientNumerologyAnalysis(
  db: SupabaseClient,
  tenantId: string,
  client: AutoClientRow,
  opts: { persist?: boolean } = {},
): Promise<EnsureResult> {
  const inp = autoNumerologyInputs(client);
  if (!inp.ok) return { status: inp.reason };
  const clientId = String(client.id);
  try {
    if (opts.persist === false) {
      const id = autoNumerologyRecordId(tenantId, clientId, inp.name, inp.surname, inp.birthIso);
      return { status: "ok", created: false, record: { id, name: inp.name, surname: inp.surname, birth_date: inp.birthDisplay, analysis_data: buildAutoAnalysisData(inp, clientId), created_at: null } };
    }
    // 1) Mevcut bağlı kayıt (elle kaydedilmiş + bağlanmış olanlar dahil): aynı girdi + GÜNCEL metodoloji.
    const { data: linked, error: lErr } = await db.from("numerology_records").select(RECORD_COLUMNS)
      .eq("tenant_id", tenantId).eq("client_id", clientId).order("created_at", { ascending: false }).limit(50);
    if (lErr) return isMissingClientIdColumn(lErr) ? { status: "unavailable" } : { status: "error" };
    const hit = ((linked ?? []) as AutoNumerologyRecord[]).find((r) =>
      sameInputs(r, inp) && recordMethodologyStamp(r.analysis_data) === NUMEROLOJI_METHODOLOGY_VERSION);
    if (hit) return { status: "ok", record: hit, created: false };

    // 2) Yeni kayıt — deterministik id (yarışta tek kayıt).
    const id = autoNumerologyRecordId(tenantId, clientId, inp.name, inp.surname, inp.birthIso);
    const row = { id, tenant_id: tenantId, client_id: clientId, name: inp.name, surname: inp.surname, birth_date: inp.birthDisplay, analysis_data: buildAutoAnalysisData(inp, clientId) };
    const { data: ins, error: iErr } = await db.from("numerology_records").insert(row).select(RECORD_COLUMNS).single();
    if (!iErr && ins) return { status: "ok", record: ins as AutoNumerologyRecord, created: true };
    if (iErr && isMissingClientIdColumn(iErr)) return { status: "unavailable" };
    if ((iErr as { code?: string } | null)?.code !== "23505") return { status: "error" };

    // 3) Aynı id zaten var (eşzamanlı istek ya da bağı sonradan kaldırılmış kayıt): yeniden kullan.
    const { data: ex, error: eErr } = await db.from("numerology_records").select(`${RECORD_COLUMNS}, client_id`)
      .eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (eErr || !ex) return { status: "error" };
    const exRow = ex as AutoNumerologyRecord & { client_id: string | null };
    if (exRow.client_id && exRow.client_id !== clientId) return { status: "error" };
    if (!exRow.client_id) {
      const { error: uErr } = await db.from("numerology_records").update({ client_id: clientId })
        .eq("tenant_id", tenantId).eq("id", id).is("client_id", null);
      if (uErr) return { status: "error" };
    }
    const { client_id: _c, ...rest } = exRow;
    void _c;
    return { status: "ok", record: rest, created: false };
  } catch {
    return { status: "error" };
  }
}
