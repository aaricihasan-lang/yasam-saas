// Astroloji — BİLGİ BANKASI servisi (YALNIZ SUNUCU).
//
//   • Uzmanın KENDİ mesleki bilgisi: tenant + owner_user_id kapsamlı. Bir uzman başka uzmanın kaydını
//     göremez/düzenleyemez/silemez (her sorgu iki filtreyi birden taşır; yabancı kayıt = 404).
//   • Provider-bağımsız: konu anahtarı kanonik taksonomiyle DOĞRULANIR (serbest metin anahtar yok).
//   • Roxy içeriği ile doldurulmaz; yalnız uzmanın girdiği metin.
//   • Düzenle/sil iyimser kilitli (expectedRevision): bayat ekrandan yanlış sürümün üzerine yazma /
//     yanlış kaydı silme engellenir. Silme yalnız (tenant, uzman, id, revision) tam eşleşirse olur.
//   • Kayıtlı analizler kendi KB snapshot'ını taşır → KB düzenleme/silme geçmiş analizi DEĞİŞTİRMEZ.

import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { isSchemaMissing, isUuid, logAstroDbError } from "../persistence/repo";
import { TRADITIONS, type Tradition } from "../topics/western";
import { isKnownTopicKind, parseAnyTopicKey, topicLabelAny } from "../topics";
import type { EngineCtx, ServiceResponse } from "../engine/service";
import { ASTRO_NOT_READY } from "../engine/service";

assertServerOnly("lib/astrology/kb/service");

const TABLE = "astro_kb_entries";
const COLUMNS = "id, tradition, topic_key, title, body, source_note, tags, revision, created_at, updated_at";
const MAX_LIST = 2000;

export type KbRow = {
  id: string;
  tradition: Tradition;
  topic_key: string;
  title: string;
  body: string;
  source_note: string | null;
  tags: string[];
  revision: number;
  created_at: string;
  updated_at: string;
};

const fail = (status: number, code: string, error: string): ServiceResponse => ({ status, body: { ok: false, code, error } });
const dbFail = (ctx: string, err: { code?: string } | null | undefined): ServiceResponse => {
  if (isSchemaMissing(err)) return ASTRO_NOT_READY;
  logAstroDbError(ctx, err);
  return fail(500, "DB_ERROR", "İşlem tamamlanamadı.");
};
const notEntitled = (): ServiceResponse => fail(403, "KB_NOT_ENTITLED", "Bilgi Bankası yetkisi yok.");

export function publicKbEntry(r: KbRow) {
  return {
    id: r.id,
    tradition: r.tradition,
    topicKey: r.topic_key,
    topicLabel: topicLabelAny(r.topic_key),
    title: r.title,
    body: r.body,
    sourceNote: r.source_note,
    tags: r.tags ?? [],
    revision: r.revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type KbInput = { tradition: Tradition; topicKey: string; title: string; body: string; sourceNote: string | null; tags: string[] };

export function parseKbInput(raw: unknown): { ok: true; v: KbInput } | { ok: false; r: ServiceResponse } {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return { ok: false, r: fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.") };
  const tradition = o.tradition ?? "western";
  if (!(TRADITIONS as readonly unknown[]).includes(tradition)) return { ok: false, r: fail(400, "INVALID_TRADITION", "Geçersiz gelenek.") };
  if (!parseAnyTopicKey(tradition, o.topicKey)) {
    return { ok: false, r: fail(400, "INVALID_TOPIC", "Konu anahtarı geçersiz (yalnız kanonik konular; bu aşamada Batı).") };
  }
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (title.length < 1 || title.length > 200) return { ok: false, r: fail(400, "INVALID_TITLE", "Başlık 1–200 karakter olmalıdır.") };
  const body = typeof o.body === "string" ? o.body.trim() : "";
  if (body.length < 1 || body.length > 20000) return { ok: false, r: fail(400, "INVALID_TEXT", "Metin 1–20000 karakter olmalıdır.") };
  let sourceNote: string | null = null;
  if (o.sourceNote !== undefined && o.sourceNote !== null && o.sourceNote !== "") {
    if (typeof o.sourceNote !== "string" || o.sourceNote.trim().length > 1000) {
      return { ok: false, r: fail(400, "INVALID_SOURCE", "Kaynak notu en fazla 1000 karakter olabilir.") };
    }
    sourceNote = o.sourceNote.trim() || null;
  }
  const tagsRaw = o.tags ?? [];
  if (!Array.isArray(tagsRaw) || tagsRaw.length > 20) return { ok: false, r: fail(400, "INVALID_TAGS", "En fazla 20 etiket.") };
  const tags: string[] = [];
  for (const t of tagsRaw) {
    if (typeof t !== "string") return { ok: false, r: fail(400, "INVALID_TAGS", "Etiketler metin olmalıdır.") };
    const v = t.trim().toLocaleLowerCase("tr-TR");
    if (v.length < 1 || v.length > 40) return { ok: false, r: fail(400, "INVALID_TAGS", "Etiket 1–40 karakter olmalıdır.") };
    if (!tags.includes(v)) tags.push(v);
  }
  return { ok: true, v: { tradition: tradition as Tradition, topicKey: o.topicKey as string, title, body, sourceNote, tags } };
}

async function loadOwnEntries(ctx: EngineCtx): Promise<{ rows: KbRow[]; error: { code?: string } | null }> {
  const { data, error } = await ctx.db
    .from(TABLE)
    .select(COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_LIST);
  return { rows: (data as KbRow[] | null) ?? [], error };
}

const fold = (s: string) => s.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/** Liste + arama + filtre (uygulama katmanında; PostgREST filtre dizesine kullanıcı girdisi konmaz). */
export async function listKb(ctx: EngineCtx, q: { search?: string | null; kind?: string | null; tag?: string | null; topicKey?: string | null }): Promise<ServiceResponse> {
  if (!ctx.entitlements.knowledgeBank) return notEntitled();
  const r = await loadOwnEntries(ctx);
  if (r.error) return dbFail("kb.list", r.error);
  let rows = r.rows;
  if (q.kind) {
    if (!isKnownTopicKind(q.kind)) return fail(400, "INVALID_KIND", "Geçersiz konu türü.");
    rows = rows.filter((x) => x.topic_key.startsWith(`${q.kind}:`));
  }
  if (q.topicKey) rows = rows.filter((x) => x.topic_key === q.topicKey);
  if (q.tag) {
    const tg = q.tag.trim().toLocaleLowerCase("tr-TR");
    rows = rows.filter((x) => (x.tags ?? []).includes(tg));
  }
  if (q.search && q.search.trim()) {
    const s = fold(q.search.trim().slice(0, 100));
    rows = rows.filter((x) => fold(`${x.title}\n${x.body}\n${x.source_note ?? ""}\n${topicLabelAny(x.topic_key)}\n${(x.tags ?? []).join(" ")}`).includes(s));
  }
  const allTags = [...new Set(r.rows.flatMap((x) => x.tags ?? []))].sort((a, b) => a.localeCompare(b, "tr"));
  return { status: 200, body: { ok: true, entries: rows.map(publicKbEntry), total: r.rows.length, tags: allTags } };
}

export async function getKbEntry(ctx: EngineCtx, id: string): Promise<ServiceResponse> {
  if (!ctx.entitlements.knowledgeBank) return notEntitled();
  if (!isUuid(id)) return fail(404, "KB_NOT_FOUND", "Kayıt bulunamadı.");
  const { data, error } = await ctx.db.from(TABLE).select(COLUMNS).eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId).eq("id", id).maybeSingle();
  if (error) return dbFail("kb.get", error);
  if (!data) return fail(404, "KB_NOT_FOUND", "Kayıt bulunamadı.");
  return { status: 200, body: { ok: true, entry: publicKbEntry(data as KbRow) } };
}

export async function createKb(ctx: EngineCtx, raw: unknown): Promise<ServiceResponse> {
  if (!ctx.entitlements.knowledgeBank) return notEntitled();
  const p = parseKbInput(raw);
  if (!p.ok) return p.r;
  const { data, error } = await ctx.db
    .from(TABLE)
    .insert({
      tenant_id: ctx.tenantId,
      owner_user_id: ctx.userId,
      tradition: p.v.tradition,
      topic_key: p.v.topicKey,
      title: p.v.title,
      body: p.v.body,
      source_note: p.v.sourceNote,
      tags: p.v.tags,
    })
    .select(COLUMNS)
    .single();
  if (error) return dbFail("kb.create", error);
  return { status: 201, body: { ok: true, entry: publicKbEntry(data as KbRow) } };
}

function parseExpected(raw: unknown): number | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const e = o.expectedRevision;
  return typeof e === "number" && Number.isInteger(e) && e >= 1 ? e : null;
}

export async function updateKb(ctx: EngineCtx, id: string, raw: unknown): Promise<ServiceResponse> {
  if (!ctx.entitlements.knowledgeBank) return notEntitled();
  if (!isUuid(id)) return fail(404, "KB_NOT_FOUND", "Kayıt bulunamadı.");
  const expected = parseExpected(raw);
  if (expected === null) return fail(400, "INVALID_EXPECTED_REVISION", "Beklenen revizyon gerekli.");
  const p = parseKbInput(raw);
  if (!p.ok) return p.r;
  const { data, error } = await ctx.db
    .from(TABLE)
    .update({
      tradition: p.v.tradition,
      topic_key: p.v.topicKey,
      title: p.v.title,
      body: p.v.body,
      source_note: p.v.sourceNote,
      tags: p.v.tags,
      revision: expected + 1,
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("id", id)
    .eq("revision", expected)
    .select(COLUMNS);
  if (error) return dbFail("kb.update", error);
  const rows = (data as KbRow[] | null) ?? [];
  if (rows.length === 1) return { status: 200, body: { ok: true, entry: publicKbEntry(rows[0]) } };
  return conflictOrMissing(ctx, id);
}

async function conflictOrMissing(ctx: EngineCtx, id: string): Promise<ServiceResponse> {
  const { data } = await ctx.db.from(TABLE).select("id").eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId).eq("id", id).maybeSingle();
  return data
    ? fail(409, "KB_REVISION_CONFLICT", "Kayıt bu arada değişmiş. Yenileyip tekrar deneyin.")
    : fail(404, "KB_NOT_FOUND", "Kayıt bulunamadı.");
}

export async function deleteKb(ctx: EngineCtx, id: string, expectedRevision: unknown): Promise<ServiceResponse> {
  if (!ctx.entitlements.knowledgeBank) return notEntitled();
  if (!isUuid(id)) return fail(404, "KB_NOT_FOUND", "Kayıt bulunamadı.");
  const expected = parseExpected({ expectedRevision });
  if (expected === null) return fail(400, "INVALID_EXPECTED_REVISION", "Beklenen revizyon gerekli.");
  const { data, error } = await ctx.db
    .from(TABLE)
    .delete()
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("id", id)
    .eq("revision", expected)
    .select("id");
  if (error) return dbFail("kb.delete", error);
  const rows = (data as { id: string }[] | null) ?? [];
  if (rows.length === 1 && rows[0].id === id) return { status: 200, body: { ok: true, deleted: id } };
  if (rows.length > 1) {
    // Savunma: tekil anahtar (id) ile birden fazla satır silinemez; görülürse loglanır.
    logAstroDbError("kb.delete.multi", { code: "UNEXPECTED_MULTI" });
  }
  return conflictOrMissing(ctx, id);
}

/** Konu anahtarlarına göre uzmanın KENDİ kayıtları (eşleşme + snapshot için). */
export async function matchKbEntries(ctx: EngineCtx, tradition: Tradition, topicKeys: string[]): Promise<{ rows: KbRow[]; error: { code?: string } | null }> {
  const keys = [...new Set(topicKeys.filter((k) => parseAnyTopicKey(tradition, k)))];
  if (keys.length === 0 || !ctx.entitlements.knowledgeBank) return { rows: [], error: null };
  const { data, error } = await ctx.db
    .from(TABLE)
    .select(COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("tradition", tradition)
    .in("topic_key", keys)
    .order("updated_at", { ascending: false })
    .limit(MAX_LIST);
  return { rows: (data as KbRow[] | null) ?? [], error };
}
