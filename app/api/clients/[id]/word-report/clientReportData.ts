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
 * profil görseli SSRF-güvenli `fetchProfileImageBuffer` ile; ikisi de hata → null (rapor üretilir).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchProfileImageBuffer } from "@/lib/clients/profileImageFetch";
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

export async function downloadAnalysisImage(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  analysisId: string,
): Promise<Buffer | null> {
  try {
    const path = `${tenantId}/${clientId}/${analysisId}.png`;
    const { data, error } = await db.storage.from(ANALYSIS_IMAGE_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** analyses sırasıyla hizalı (Buffer|null)[]; yalnız image_url dolu kayıtlar indirilir. */
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
      out[i + j] = r.status === "fulfilled" ? r.value : null;
    });
  }
  return out;
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
