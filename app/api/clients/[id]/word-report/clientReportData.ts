/**
 * Danışan Word raporu — VERİ OKUMA (tekli + toplu ortak).
 *
 * WT7: toplu Word artık her danışan için TEKLİ tam raporun aynı içeriğini üretir. Tekli rapor
 * danışan başına 8 sorgu yapar; toplu raporda bu N×8 sorgu (N+1) yerine tablo başına
 * `.in("client_id", chunk)` + sayfalı (range) okuma yapılır ve satırlar danışana göre gruplanır.
 * Sıralama tekli raporla AYNI (+ `id` eşitlik kırıcı → sayfalama deterministik).
 *
 * Tenant: her sorgu `.eq("tenant_id", tenantId)` — çağıran guard'dan gelen tenant'ı verir.
 * Görseller: analiz görseli PRIVATE bucket'tan deterministik path ile (service_role),
 * profil görseli SSRF-güvenli `fetchProfileImageBuffer` ile.
 *
 * AŞAMA 2 / W1 — DY-02: alt sorgu hatası ARTIK YUTULMAZ. Herhangi bir tablo/depolama okuma
 * hatası `ClientReportReadError` fırlatır → route 500 döner, eksik rapor ÜRETİLMEZ.
 * Yalnız "nesne yok" (silinmiş analiz görseli) görselsiz devam eder. Profil görseli
 * dekoratiftir (SSRF-güvenli harici URL) → okunamazsa görselsiz devam eder (davranış aynı).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchProfileImageBuffer } from "@/lib/clients/profileImageFetch";
import sharp from "sharp";
import { fetchStorageImageBuffer, getImgDimensions, type ReportChild } from "@/lib/docx/reportHelpers";
import { STONE_PHOTO_BUCKET, isOwnedClientStonePhotoPath } from "@/lib/clients/stonePhotoStorage";
import { getCanonicalReportForDownload } from "@/lib/human-design/api/reportPersistence";
import { isOwnedChartImagePath, isOwnedReportSnapshotPath } from "@/lib/human-design/api/chartImagePath";
import { applyDownloadPermissions, isHdReportSnapshotV2 } from "@/lib/human-design/reporting/reportSnapshotV2";
import { buildHdReportV2Children } from "@/lib/human-design/reporting/wordReportV2";
import type {
  AppointmentRow,
  ClientAnalysisRow,
  ClientChargeRow,
  ClientDataset,
  ClientHomeworkRow,
  ClientNoteRow,
  ClientRow,
  ClientSessionRow,
  ClientStoneRow,
} from "./clientReportBuilder";

// ─── Analiz görseli okuma (PRIVATE bucket, service_role) ─────────────────────
// Görsel PRIVATE bucket'ta tutulur; okuma yalnız server-side service_role ile,
// DETERMINISTIK object path üzerinden yapılır: {tenantId}/{clientId}/{analysisId}.png.
// image_url alanı yalnız "görsel var mı" göstergesi olarak kullanılır (path/URL fark
// etmez) → eski (absolute public URL) ve yeni (object path) satırlar TEK yoldan okunur,
// public URL'ye bağımlılık kalmaz. Bucket public de olsa private de olsa çalışır.
const ANALYSIS_IMAGE_BUCKET = "client-analysis-images";

/** DY-02: rapor verisi okunamadı → çağıran 500 döner (eksik rapor üretilmez). */
export class ClientReportReadError extends Error {
  constructor(public table: string, public cause: unknown) {
    super(`client report read failed: ${table}`);
  }
}

export function isClientReportReadError(e: unknown): e is ClientReportReadError {
  return e instanceof ClientReportReadError;
}

/** Depolama "nesne yok" hatası mı? (silinmiş/hiç yüklenmemiş görsel → görselsiz devam). */
function isStorageNotFound(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown; originalError?: { status?: unknown } } | null;
  const status = Number(e?.status ?? e?.statusCode ?? e?.originalError?.status ?? NaN);
  if (status === 404) return true;
  return /not\s*found|does not exist|no such/i.test(String(e?.message ?? ""));
}

/** Analiz görseli: nesne yok → null; diğer depolama hataları → ClientReportReadError. */
export async function downloadAnalysisImage(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  analysisId: string,
): Promise<Buffer | null> {
  const path = `${tenantId}/${clientId}/${analysisId}.png`;
  let data: Blob | null;
  let error: unknown;
  try {
    ({ data, error } = await db.storage.from(ANALYSIS_IMAGE_BUCKET).download(path));
  } catch (e) {
    throw new ClientReportReadError(`storage:${ANALYSIS_IMAGE_BUCKET}`, e);
  }
  if (error) {
    if (isStorageNotFound(error)) return null;
    throw new ClientReportReadError(`storage:${ANALYSIS_IMAGE_BUCKET}`, error);
  }
  if (!data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/** analyses sırasıyla hizalı (Buffer|null)[]; yalnız image_url dolu kayıtlar indirilir. Okuma hatası → fırlatır. */
export async function fetchAnalysisImages(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  analyses: ClientAnalysisRow[],
): Promise<(Buffer | null)[]> {
  const BATCH = 15;
  const out: (Buffer | null)[] = new Array(analyses.length).fill(null);
  for (let i = 0; i < analyses.length; i += BATCH) {
    const slice = analyses.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map((a) =>
        a.image_url?.trim()
          ? downloadAnalysisImage(db, tenantId, clientId, a.id)
          : Promise.resolve(null),
      ),
    );
    settled.forEach((r, j) => {
      if (r.status === "rejected") {
        throw r.reason instanceof ClientReportReadError ? r.reason : new ClientReportReadError("storage", r.reason);
      }
      out[i + j] = r.value;
    });
  }
  return out;
}

// ─── Tekli okuma (DY-02: hata yutulmaz) ──────────────────────────────────────

type Res<T> = { data: T | null; error: unknown };

function must<T>(table: string, r: Res<T>): T | null {
  if (r.error) throw new ClientReportReadError(table, r.error);
  return r.data;
}

/** Danışan satırı: bulunamadı → null; okuma hatası → fırlatır. */
// ─── C11 (2026-11-04): Taşlar Word'ü için danışan taş fotoğrafları ─────────────────
/**
 * Rapor geneli güvenlik tavanı (Word boyutu / sunucu süresi). Uygulamada taş başına fotoğraf
 * sınırı YOKTUR; bu yüzden taş başına kesme yapılmaz. Tavan aşılırsa eklenmeyen fotoğraf sayısı
 * ilgili taşın altında AÇIKÇA yazılır (sessiz eksiltme yok).
 */
export const STONE_REPORT_MAX_PHOTOS = 60;
/** Rapora girmeden önce uzun kenar bu piksele küçültülür (10 MB'lık orijinaller şişirmesin). */
export const STONE_REPORT_PHOTO_MAX_PX = 900;

/** Taş başına rapor fotoğraf özeti: eklenenler + toplam + eklenemeyenlerin nedeni. */
export type StoneReportPhotos = {
  images: Buffer[];
  /** Bu taşa kayıtlı fotoğraf sayısı (rapora girsin girmesin). */
  total: number;
  /** Rapor geneli tavan nedeniyle eklenmeyen. */
  omitted: number;
  /** Okunamayan / biçimi çözülemeyen / yolu doğrulanamayan. */
  unreadable: number;
};

/** Görseli Word'e uygun JPEG'e çevirir (PNG/JPEG/WEBP/GIF → JPEG); okunamazsa null. */
async function toReportJpeg(buf: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buf, { animated: false })
      .rotate()
      .resize({ width: STONE_REPORT_PHOTO_MAX_PX, height: STONE_REPORT_PHOTO_MAX_PX, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Raporlanan taşların fotoğrafları: yalnız bu tenant + danışan + taş satırları VE yalnız
 * `{tenant}/{client}/{stone}/` yoluna ait dosyalar (isOwnedClientStonePhotoPath). Tablo okuma
 * hatası DY-02 gereği fırlatılır; tekil dosya okunamazsa/çözülemezse o fotoğraf atlanır.
 */
export async function fetchClientStonePhotos(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  stones: ClientStoneRow[],
): Promise<Map<string, StoneReportPhotos>> {
  const out = new Map<string, StoneReportPhotos>();
  const ids = stones.map((s) => s.id).filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!ids.length) return out;
  const { data, error } = await db
    .from("client_stone_photos")
    .select("stone_id, file_path")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .in("stone_id", ids)
    .order("created_at", { ascending: true });
  if (error) {
    // Fotoğraf tablosu olmayan şema (ör. kısmi test ortamı) → fotoğrafsız; diğer hatalar DY-02.
    const code = (error as { code?: string }).code;
    if (code === "42P01" || code === "PGRST205") return out;
    throw new ClientReportReadError("client_stone_photos", error);
  }
  const entry = (id: string): StoneReportPhotos => {
    let e = out.get(id);
    if (!e) { e = { images: [], total: 0, omitted: 0, unreadable: 0 }; out.set(id, e); }
    return e;
  };
  // Taş → fotoğraf yolları (kayıt sırası). Yolu bu tenant/danışan/taşa ait değilse indirilmez
  // ama SAYILIR ("okunamadı") → rapordan sessizce düşmez.
  const byStone = new Map<string, string[]>();
  for (const r of (data ?? []) as Array<{ stone_id: string | null; file_path: string | null }>) {
    if (!r.stone_id || !ids.includes(r.stone_id)) continue;
    const e = entry(r.stone_id);
    e.total += 1;
    if (!isOwnedClientStonePhotoPath(r.file_path, tenantId, clientId, r.stone_id)) { e.unreadable += 1; continue; }
    byStone.set(r.stone_id, [...(byStone.get(r.stone_id) ?? []), r.file_path]);
  }
  // Rapor sırasıyla (taş taş) tavana kadar indirilecek iş listesi; tavan üstü → omitted.
  const jobs: Array<{ stoneId: string; path: string }> = [];
  for (const id of ids) {
    for (const p of byStone.get(id) ?? []) {
      if (jobs.length < STONE_REPORT_MAX_PHOTOS) jobs.push({ stoneId: id, path: p });
      else entry(id).omitted += 1;
    }
  }
  const BATCH = 8;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const slice = jobs.slice(i, i + BATCH);
    const bufs = await Promise.all(slice.map(async (j) => {
      const raw = await fetchStorageImageBuffer(db, STONE_PHOTO_BUCKET, j.path);
      return raw ? toReportJpeg(raw) : null;
    }));
    slice.forEach((j, k) => {
      const b = bufs[k];
      if (b) entry(j.stoneId).images.push(b);
      else entry(j.stoneId).unreadable += 1;
    });
  }
  return out;
}

export async function loadClientRow(db: SupabaseClient, tenantId: string, clientId: string): Promise<ClientRow | null> {
  const r = await db.from("clients").select("*").eq("id", clientId).eq("tenant_id", tenantId).maybeSingle();
  return must("clients", r) as ClientRow | null;
}

export async function loadClientNotes(db: SupabaseClient, tenantId: string, clientId: string): Promise<ClientNoteRow | null> {
  const r = await db.from("client_notes").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).maybeSingle();
  return must("client_notes", r) as ClientNoteRow | null;
}

const ANALYSIS_COLS = "id, analysis_type, analysis_data, note, created_at, image_url";

/** Sekme/tam rapor tablo okumaları — önceki tekli raporla AYNI sıralama. */
const CLIENT_TABLE_READS = {
  appointments: (db: SupabaseClient, t: string, c: string) =>
    db.from("appointments").select("*").eq("client_id", c).eq("tenant_id", t).order("appointment_date", { ascending: true }),
  client_stones: (db: SupabaseClient, t: string, c: string) =>
    db.from("client_stones").select("*").eq("client_id", c).eq("tenant_id", t).order("stone_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
  client_sessions: (db: SupabaseClient, t: string, c: string) =>
    db.from("client_sessions").select("*").eq("client_id", c).eq("tenant_id", t).order("session_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
  client_homeworks: (db: SupabaseClient, t: string, c: string) =>
    db.from("client_homeworks").select("*").eq("client_id", c).eq("tenant_id", t).order("created_at", { ascending: false }),
  client_analyses: (db: SupabaseClient, t: string, c: string) =>
    db.from("client_analyses").select(ANALYSIS_COLS).eq("client_id", c).eq("tenant_id", t).order("created_at", { ascending: false }),
  // B5: Taşlar Word'ü — danışana kayıtlı kombinasyonlar (yalnız bu tenant + danışan).
  client_combinations: (db: SupabaseClient, t: string, c: string) =>
    db.from("client_combinations").select("id, name, description, note, stones_text, notes_text, notes_text_2, created_at").eq("client_id", c).eq("tenant_id", t).order("created_at", { ascending: false }),
  client_charges: (db: SupabaseClient, t: string, c: string) =>
    db.from("client_charges").select("*").eq("client_id", c).eq("tenant_id", t).order("charge_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
} as const;
export type ClientReportTable = keyof typeof CLIENT_TABLE_READS;

export async function loadClientTable<T>(db: SupabaseClient, tenantId: string, clientId: string, table: ClientReportTable): Promise<T[]> {
  const r = (await CLIENT_TABLE_READS[table](db, tenantId, clientId)) as Res<unknown[]>;
  return (must(table, r) ?? []) as T[];
}

/** Tek analiz (danışan + tenant kapsamlı): bulunamadı → null; hata → fırlatır. */
export async function loadClientAnalysis(db: SupabaseClient, tenantId: string, clientId: string, analysisId: string): Promise<ClientAnalysisRow | null> {
  const r = await db.from("client_analyses").select(ANALYSIS_COLS).eq("id", analysisId).eq("client_id", clientId).eq("tenant_id", tenantId).maybeSingle();
  return must("client_analyses", r) as ClientAnalysisRow | null;
}

/**
 * Tam veri kümesi. Danışan bulunamadı → null. HERHANGİ bir alt tablo okuma hatası →
 * ClientReportReadError (eskiden `data || []` ile sessizce boş bölüm üretiliyordu — DY-02).
 */
export async function loadClientDataset(db: SupabaseClient, tenantId: string, clientId: string): Promise<ClientDataset | null> {
  const [client, notes, appointments, stones, sessions, homeworks, analyses, charges] = await Promise.all([
    loadClientRow(db, tenantId, clientId),
    loadClientNotes(db, tenantId, clientId),
    loadClientTable<AppointmentRow>(db, tenantId, clientId, "appointments"),
    loadClientTable<ClientStoneRow>(db, tenantId, clientId, "client_stones"),
    loadClientTable<ClientSessionRow>(db, tenantId, clientId, "client_sessions"),
    loadClientTable<ClientHomeworkRow>(db, tenantId, clientId, "client_homeworks"),
    loadClientTable<ClientAnalysisRow>(db, tenantId, clientId, "client_analyses"),
    loadClientTable<ClientChargeRow>(db, tenantId, clientId, "client_charges"),
  ]);
  if (!client) return null;
  return { client, notes, appointments, stones, sessions, homeworks, analyses, charges };
}

// ─── Human Design (DONMUŞ snapshot; HD motoru/hesaplama ÇAĞRILMAZ) ───────────

const HD_IMAGE_BUCKET = "hd-chart-images";

/** Tablo/kolon henüz yok (şema hazır değil) → HD bölümü yok sayılır; diğer hatalar fırlatılır. */
function isSchemaMissing(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code ?? "");
  return code === "42P01" || code === "42703" || code === "PGRST205" || code === "PGRST204";
}

export type ClientHdReportOption = { id: string; createdAt: string };

/**
 * Danışana (merkezî clients.id) bağlı HD profilinin profesyonel (canonical, hd-report-2)
 * raporları — en yeni önce. Bağ: human_design_clients.journey_client_id (tenant kapsamlı).
 * Ad/doğum benzerliğiyle EŞLEŞTİRME YAPILMAZ.
 */
export async function listClientHdReports(db: SupabaseClient, tenantId: string, clientId: string): Promise<ClientHdReportOption[]> {
  const prof = await db.from("human_design_clients").select("id").eq("tenant_id", tenantId).eq("journey_client_id", clientId).maybeSingle();
  if (prof.error) {
    if (isSchemaMissing(prof.error)) return [];
    throw new ClientReportReadError("human_design_clients", prof.error);
  }
  const hdId = (prof.data as { id: string } | null)?.id;
  if (!hdId) return [];
  const reps = await db.from("human_design_reports")
    .select("id, created_at, schema_version")
    .eq("tenant_id", tenantId)
    .eq("client_id", hdId)
    .eq("report_kind", "canonical")
    .order("created_at", { ascending: false });
  if (reps.error) {
    if (isSchemaMissing(reps.error)) return [];
    throw new ClientReportReadError("human_design_reports", reps.error);
  }
  return ((reps.data ?? []) as { id: string; created_at: string; schema_version: string | null }[])
    .filter((r) => r.schema_version === "hd-report-2")
    .map((r) => ({ id: r.id, createdAt: r.created_at }));
}

/**
 * Seçili (yoksa en yeni) HD profesyonel raporun DONMUŞ snapshot gövdesi. Rapor danışana bağlı
 * değilse/bulunmazsa null. Sistem Yorumu yetkisi HD indirme ucuyla AYNI kuralla uygulanır.
 */
export async function loadClientHdSection(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  opts: { reportId?: string | null; systemReadingPermitted: boolean },
): Promise<{ children: ReportChild[]; generatedAt: string; reportId: string } | null> {
  const options = await listClientHdReports(db, tenantId, clientId);
  if (!options.length) return null;
  const pick = opts.reportId ? options.find((o) => o.id === opts.reportId) : options[0];
  if (!pick) return null;
  const read = await getCanonicalReportForDownload(db, tenantId, pick.id);
  if (!read.data) {
    if (read.status >= 500) throw new ClientReportReadError("human_design_reports", read.error);
    return null;
  }
  const { snapshot, clientId: hdClientId } = read.data;
  if (!isHdReportSnapshotV2(snapshot)) return null;
  const view = applyDownloadPermissions(snapshot, opts.systemReadingPermitted);

  // BodyGraph: yalnız tenant'a ait private yol (HD indirme ucuyla aynı sahiplik kuralı; keyfi URL YOK).
  let bodygraph: Buffer | null = null;
  const imgPath = snapshot.chartImage?.storagePath ?? null;
  const owned = !!imgPath && (isOwnedReportSnapshotPath(imgPath, tenantId) || (!!hdClientId && isOwnedChartImagePath(imgPath, tenantId, hdClientId)));
  if (imgPath && owned) {
    const buf = await fetchStorageImageBuffer(db, HD_IMAGE_BUCKET, imgPath);
    if (buf && getImgDimensions(buf)) bodygraph = buf;
  }
  const { body } = buildHdReportV2Children(view.snapshot, {
    bodygraphImage: bodygraph,
    logo: null,
    expertName: null,
    systemReadingRedacted: view.systemReadingRedacted,
  });
  return { children: body, generatedAt: snapshot.generatedAt, reportId: pick.id };
}

// ─── Toplu okuma ─────────────────────────────────────────────────────────────

/** `.in()` URL uzunluğu için danışan id parçası (36 karakter uuid × 150 ≈ 5.6 KB). */
const ID_CHUNK = 150;
/** PostgREST max-rows (1000) altında sayfa boyutu → hiçbir tabloda sessiz kesilme olmaz. */
const PAGE = 1000;

type Order = { col: string; ascending: boolean; nullsFirst?: boolean };

class BulkReadError extends Error {
  constructor(public table: string, public cause: unknown) {
    super(`bulk read failed: ${table}`);
  }
}

/** Bir tablodan verilen danışanların TÜM satırlarını (sayfalı, deterministik sıra) okur. */
async function readAllRows<T>(
  db: SupabaseClient,
  table: string,
  select: string,
  tenantId: string,
  clientIds: string[],
  orders: Order[],
): Promise<T[]> {
  const out: T[] = [];
  for (let c = 0; c < clientIds.length; c += ID_CHUNK) {
    const chunk = clientIds.slice(c, c + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      let q = db.from(table).select(select).eq("tenant_id", tenantId).in("client_id", chunk);
      for (const o of orders) q = q.order(o.col, { ascending: o.ascending, ...(o.nullsFirst === undefined ? {} : { nullsFirst: o.nullsFirst }) });
      q = q.order("id", { ascending: true });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw new BulkReadError(table, error);
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

function groupBy<T extends { client_id?: string | null }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = String(r.client_id ?? "");
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Sınırlı eşzamanlılıkla map (görsel indirmeleri bellek/bağlantı patlatmasın). */
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

export type BulkClientInput = {
  data: ClientDataset;
  profileImg: Buffer | null;
  analysisImages: (Buffer | null)[];
};

/**
 * Verilen danışanların tekli rapordaki TAM veri kümesini toplu okur.
 * `clients` sırası korunur (çağıran sıralamayı belirler). Hata → BulkReadError fırlatır.
 */
export async function loadClientDatasetsBulk(
  db: SupabaseClient,
  tenantId: string,
  clients: ClientRow[],
  opts: { imageConcurrency?: number } = {},
): Promise<BulkClientInput[]> {
  const ids = clients.map((c) => c.id);
  const [notes, appointments, stones, sessions, homeworks, analyses, charges] = await Promise.all([
    readAllRows<ClientNoteRow & { client_id: string }>(db, "client_notes", "*", tenantId, ids, []),
    readAllRows<AppointmentRow & { client_id: string }>(db, "appointments", "*", tenantId, ids, [{ col: "appointment_date", ascending: true }]),
    readAllRows<ClientStoneRow & { client_id: string }>(db, "client_stones", "*", tenantId, ids, [{ col: "stone_date", ascending: false, nullsFirst: false }, { col: "created_at", ascending: false }]),
    readAllRows<ClientSessionRow & { client_id: string }>(db, "client_sessions", "*", tenantId, ids, [{ col: "session_date", ascending: false, nullsFirst: false }, { col: "created_at", ascending: false }]),
    readAllRows<ClientHomeworkRow & { client_id: string }>(db, "client_homeworks", "*", tenantId, ids, [{ col: "created_at", ascending: false }]),
    readAllRows<ClientAnalysisRow & { client_id: string }>(db, "client_analyses", "id, client_id, analysis_type, analysis_data, note, created_at, image_url", tenantId, ids, [{ col: "created_at", ascending: false }]),
    readAllRows<ClientChargeRow & { client_id: string }>(db, "client_charges", "*", tenantId, ids, [{ col: "charge_date", ascending: false, nullsFirst: false }, { col: "created_at", ascending: false }]),
  ]);
  const gNotes = groupBy(notes);
  const gApt = groupBy(appointments);
  const gStone = groupBy(stones);
  const gSess = groupBy(sessions);
  const gHw = groupBy(homeworks);
  const gAn = groupBy(analyses);
  const gCh = groupBy(charges);

  const datasets: ClientDataset[] = clients.map((client) => ({
    client,
    notes: (gNotes.get(client.id)?.[0] ?? null) as ClientNoteRow | null,
    appointments: gApt.get(client.id) ?? [],
    stones: gStone.get(client.id) ?? [],
    sessions: gSess.get(client.id) ?? [],
    homeworks: gHw.get(client.id) ?? [],
    analyses: gAn.get(client.id) ?? [],
    charges: gCh.get(client.id) ?? [],
  }));

  // Görseller: danışan başına sırayla (profil + analiz), danışanlar arası sınırlı paralel.
  return mapPool(datasets, opts.imageConcurrency ?? 6, async (data) => {
    const profileImg = data.client.profile_image_url?.trim()
      ? await fetchProfileImageBuffer(data.client.profile_image_url)
      : null;
    const analysisImages = await fetchAnalysisImages(db, tenantId, data.client.id, data.analyses);
    return { data, profileImg, analysisImages };
  });
}

export function isBulkReadError(e: unknown): e is BulkReadError {
  return e instanceof BulkReadError;
}
