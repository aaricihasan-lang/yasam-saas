// Human Design — Hazır Eğitim Haritaları · FAZ 10 "HAYAT HİKÂYESİ" · VERİ ERİŞİM KATMANI (YALNIZ SUNUCU).
// Çağıran route educationAccess kapısını (eğitmen: requireEducationViewer · owner: requireEducationOwner) GEÇTİKTEN sonra
// kullanır. Biyografi tabloları tenant'sızdır (merkezî katalog). Hesap tablolarına YAZILMAZ; snapshot gövdesi okunmaz.
// Sunucu, kaynak bağlantılarını ASLA indirmez / yoklamaz (SSRF yüzeyi yok) — yalnız doğrulanmış metin olarak saklar.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { EDU_TABLES, EDU_UUID_RE } from "../educationContract";
import { isPublishedSubject } from "../educationStore";
import {
  BIO_LANGS, BIO_ROW_COLS, BIO_TABLES, contentToRow, rowToContent,
  type BioCardMeta, type BioContent, type BioContentStatus, type BioLang, type BioOwnerDetail, type BioOwnerRow, type BioRow, type BioTrainerResponse,
} from "./biographyContract";

assertServerOnly("lib/human-design/education/biography/biographyStore");

export class BioStoreError extends Error {
  constructor(public readonly code: "DB_ERROR" | "NOT_FOUND" | "CONFLICT" | "PUBLISH_BLOCKED", public readonly current?: number) {
    super(code);
  }
}

/**
 * Eğitmen: YAYIMLI merkezî haritanın YAYIMLI biyografisi. Kişi okuma anında yayımlı değilse null (route → 404).
 * İstenen dil yoksa biography=null + mevcut diller (uydurma çeviri gösterilmez).
 */
export async function getTrainerBiography(db: SupabaseClient, subjectId: string, lang: BioLang): Promise<BioTrainerResponse | null> {
  if (!EDU_UUID_RE.test(subjectId)) return null;
  if (!(await isPublishedSubject(db, subjectId))) return null;
  const r = await db.from(BIO_TABLES.biographies).select(BIO_ROW_COLS).eq("subject_id", subjectId).eq("publish_status", "published");
  if (r.error) throw new BioStoreError("DB_ERROR");
  const rows = (r.data ?? []) as unknown as BioRow[];
  const availableLangs = BIO_LANGS.filter((l) => rows.some((x) => x.lang === l));
  const row = rows.find((x) => x.lang === lang) ?? null;
  return {
    lang,
    availableLangs,
    biography: row ? { ...rowToContent(row), lang: row.lang, revision: row.revision, updatedAt: row.updated_at } : null,
  };
}

/** Katalog araması için yayımlı biyografi özeti (yalnız zaten yayımlı kartların kimlikleri için; hata → boş harita). */
export async function listPublishedBioMeta(db: SupabaseClient, subjectIds: string[], lang: BioLang): Promise<Map<string, BioCardMeta>> {
  const out = new Map<string, BioCardMeta>();
  const ids = subjectIds.filter((x) => EDU_UUID_RE.test(x));
  if (!ids.length) return out;
  const r = await db.from(BIO_TABLES.biographies).select("subject_id, profession, country, era, life_span")
    .in("subject_id", ids).eq("publish_status", "published").eq("lang", lang);
  if (r.error) return out;
  for (const x of (r.data ?? []) as Array<{ subject_id: string; profession: string | null; country: string | null; era: string | null; life_span: string | null }>) {
    out.set(x.subject_id, { profession: x.profession, country: x.country, era: x.era, lifeSpan: x.life_span });
  }
  return out;
}
type SubjLite = { id: string; natural_key: string; display_name: string; is_living: boolean; utc_status: string; revision: number };

/** Owner: kişi bazında aşama tablosu — aday (biyografi var, harita kaydı yok) + harita kaydı olan herkes. */
export async function listBiographyStatus(db: SupabaseClient): Promise<BioOwnerRow[]> {
  const [bios, subj, pubs, charts] = await Promise.all([
    db.from(BIO_TABLES.biographies).select("id, person_key, lang, subject_id, display_name, is_living, content_status, publish_status, revision, sources, timeline, updated_at"),
    db.from(EDU_TABLES.subjects).select("id, natural_key, display_name, is_living, utc_status, revision"),
    db.from(EDU_TABLES.publications).select("subject_id, status"),
    db.from(EDU_TABLES.charts).select("subject_id, subject_revision, calc_status").eq("calc_status", "OK"),
  ]);
  if (bios.error || subj.error || pubs.error || charts.error) throw new BioStoreError("DB_ERROR");
  const subjects = (subj.data ?? []) as SubjLite[];
  const subjById = new Map(subjects.map((s) => [s.id, s]));
  const pubBy = new Map(((pubs.data ?? []) as Array<{ subject_id: string; status: string }>).map((p) => [p.subject_id, p.status]));
  const okCharts = (charts.data ?? []) as Array<{ subject_id: string; subject_revision: number }>;
  const rows = new Map<string, BioOwnerRow>();
  const subjectRow = (s: SubjLite, personKey: string): BioOwnerRow => ({
    personKey, displayName: s.display_name, subjectId: s.id, isLiving: s.is_living,
    birthData: s.utc_status === "VERIFIED" ? "dogrulandi" : "dogrulaniyor",
    hd: okCharts.some((c) => c.subject_id === s.id && c.subject_revision === s.revision) ? "hesaplandi" : "bekliyor",
    mapPublication: pubBy.get(s.id) ?? null, biographies: [],
  });
  for (const b of (bios.data ?? []) as Array<Record<string, unknown>>) {
    const personKey = String(b.person_key);
    const sid = (b.subject_id as string | null) ?? null;
    let row = rows.get(personKey);
    if (!row) {
      const s = sid ? subjById.get(sid) : undefined;
      row = s ? subjectRow(s, personKey) : {
        personKey, displayName: String(b.display_name), subjectId: null, isLiving: b.is_living === true,
        birthData: "kayit-yok", hd: "kayit-yok", mapPublication: null, biographies: [],
      };
      rows.set(personKey, row);
    }
    row.biographies.push({
      id: String(b.id), lang: b.lang as BioLang, contentStatus: b.content_status as BioContentStatus, publishStatus: b.publish_status as "hidden" | "published",
      revision: Number(b.revision), sourceCount: Array.isArray(b.sources) ? b.sources.length : 0, eventCount: Array.isArray(b.timeline) ? b.timeline.length : 0,
      updatedAt: String(b.updated_at),
    });
  }
  // Harita kaydı olup biyografisi olmayan kişiler de görünür ("Hayat hikâyesi: yok").
  const linked = new Set([...rows.values()].map((r) => r.subjectId).filter(Boolean));
  for (const s of subjects) if (!linked.has(s.id)) rows.set(`subject:${s.id}`, subjectRow(s, s.natural_key.replace(/-\d{4}-\d{2}-\d{2}$/, "")));
  return [...rows.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
}

export async function getOwnerBiography(db: SupabaseClient, id: string): Promise<BioOwnerDetail | null> {
  if (!EDU_UUID_RE.test(id)) return null;
  const [r, h] = await Promise.all([
    db.from(BIO_TABLES.biographies).select(BIO_ROW_COLS).eq("id", id).maybeSingle(),
    db.from(BIO_TABLES.revisions).select("created_at, action, revision").eq("biography_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (r.error || h.error) throw new BioStoreError("DB_ERROR");
  if (!r.data) return null;
  const row = r.data as unknown as BioRow;
  return {
    ...rowToContent(row), id: row.id, personKey: row.person_key, lang: row.lang, subjectId: row.subject_id, contentStatus: row.content_status,
    publishStatus: row.publish_status, revision: row.revision, publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at,
    history: ((h.data ?? []) as Array<{ created_at: string; action: string; revision: number }>).map((x) => ({ at: x.created_at, action: x.action, revision: x.revision })),
  };
}

/** Revizyon karşılaştırmalı (CAS) güncelleme. Başka owner oturumu önce kaydettiyse CONFLICT (güncel revizyonla). */
async function casUpdate(db: SupabaseClient, ownerId: string, id: string, expected: number, patch: Record<string, unknown>, action: string): Promise<number> {
  const next = expected + 1;
  const u = await db.from(BIO_TABLES.biographies)
    .update({ ...patch, revision: next, updated_by: ownerId })
    .eq("id", id).eq("revision", expected)
    .select(BIO_ROW_COLS);
  if (u.error) {
    if (/HD_EDU_BIO|check|violat/i.test(u.error.message ?? "")) throw new BioStoreError("PUBLISH_BLOCKED");
    throw new BioStoreError("DB_ERROR");
  }
  const rows = (u.data ?? []) as unknown as BioRow[];
  if (!rows.length) {
    const cur = await db.from(BIO_TABLES.biographies).select("revision").eq("id", id).maybeSingle();
    if (cur.error) throw new BioStoreError("DB_ERROR");
    if (!cur.data) throw new BioStoreError("NOT_FOUND");
    throw new BioStoreError("CONFLICT", Number((cur.data as { revision: number }).revision));
  }
  const row = rows[0];
  const ins = await db.from(BIO_TABLES.revisions).insert({ biography_id: id, revision: next, action, actor_user_id: ownerId, snapshot: { ...contentToRow(rowToContent(row)), content_status: row.content_status, publish_status: row.publish_status } });
  if (ins.error) throw new BioStoreError("DB_ERROR");
  return next;
}

/** Owner içerik düzenlemesi. Yayımlı kayıt düzenlenirse yayında kalır (aynı kişi, yeni revizyon); durum "owner_reviewed" olur. */
export async function updateBiography(db: SupabaseClient, ownerId: string, id: string, expected: number, content: BioContent): Promise<number> {
  return casUpdate(db, ownerId, id, expected, { ...contentToRow(content), content_status: "owner_reviewed" }, "owner_edit");
}

export async function setBiographyPublish(db: SupabaseClient, ownerId: string, id: string, expected: number, publish: boolean): Promise<number> {
  const patch = publish
    ? { publish_status: "published", published_at: new Date().toISOString(), published_by: ownerId }
    : { publish_status: "hidden" };
  return casUpdate(db, ownerId, id, expected, patch, publish ? "publish" : "unpublish");
}

export async function setBiographyReviewed(db: SupabaseClient, ownerId: string, id: string, expected: number): Promise<number> {
  return casUpdate(db, ownerId, id, expected, { content_status: "owner_reviewed" }, "status");
}
