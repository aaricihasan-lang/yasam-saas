"use client";

/**
 * notesSync — Klinik Notlar sunucu senkronu (P1-1 + REF-003/004/007 + FA-03/04/25).
 *
 * FA-03: yalnız KİRLİ (dirty) notlar + kalıcı silme outbox'ı gönderilir; sunucu
 *   not-başına sonuç döner. Reddedilen not rozetle işaretlenir ve düzenlenene dek
 *   yeniden gönderilmez; diğer notlar senkron olur.
 * FA-25: silme sunucu-önce — `deleteNoteWithSync` outbox'a yazar (kalıcı tombstone),
 *   sunucu sonucunu BEKLER ve sonucu döndürür; çağıran navigasyonu buna göre yapar.
 * FA-04: tüm veri o anki kullanıcının kapsamlı deposundan okunur; uçuştayken kullanıcı
 *   değişirse sonuç UYGULANMAZ. Modül durumu çıkışta `resetReflexologyRuntime` ile sıfırlanır.
 *
 * EŞZAMANLILIK (REF-003): her not `baseUpdatedAt` ile gönderilir (CAS). Stale
 *   güncelleme `conflict` → yerel metin korunur, "yeniden yükle" yolu sunulur.
 *
 * Güvenlik: tenant_id sunucuda oturumdan; istemci yalnız kimlik başlıkları gönderir.
 * Demo/oturumsuz/kapsamsız durumda senkron atlanır.
 */

import { setReflexologySyncStatus, isOffline } from "@/lib/refleksoloji/syncStatus";
import type { NoteSyncResult } from "@/lib/refleksoloji/notesConcurrency";
import {
  applySyncResults,
  classifyLegacyNotes,
  importQuarantinedNotes,
  mergeNotesWithServer,
  planNoteSyncChunks,
  selectNotesToPush,
  toWireNote,
  type NoteSyncChunk,
} from "@/lib/refleksoloji/notesClientCore";
import { NOTE_SYNC_REQUEST_SAFE_BYTES } from "@/lib/refleksoloji/notesValidation";
import { registerReflexologyRuntimeReset } from "@/lib/refleksoloji/runtimeReset";
import {
  currentReflexScopeId,
  isReflexSyncEligible,
  reflexUserHeaders,
} from "@/lib/refleksoloji/reflexStore";
import type { SavedClinicalNote } from "../types";
import {
  CLINICAL_NOTES_UPDATED_EVENT,
  loadLegacyNotes,
  loadNotesFromStorage,
  loadNotesOutbox,
  loadQuarantinedNotes,
  newNoteId,
  parseStoredNote,
  saveNotesOutbox,
  saveNotesToStorage,
  saveQuarantinedNotes,
  writeLegacyNotes,
} from "./noteStorage";

const ENDPOINT = "/api/refleksoloji/notes";
const DEBOUNCE_MS = 500;

// Hydrate sırasında yerel yazma → sunucuya geri-yankı PUT'unu engelle.
let suspended = false;
export function setNotesSyncSuspended(v: boolean): void {
  suspended = v;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Seri PUT zinciri — aynı anda tek istek (tek uçuş). */
let chain: Promise<unknown> | null = null;
/** Çıkışta artar → uçuştaki eski kullanıcı yanıtı uygulanmaz. */
let generation = 0;

registerReflexologyRuntimeReset(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  suspended = false;
  chain = null;
  generation += 1;
});

function notifyNotesUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CLINICAL_NOTES_UPDATED_EVENT));
  }
}

/** Yerel kayıt + (uygunsa) debounce'lu senkron. Kota hatasında false. */
export function saveNotesAndSync(notes: SavedClinicalNote[]): boolean {
  const ok = saveNotesToStorage(notes);
  if (ok) scheduleNotesSync();
  return ok;
}

/** Bekleyen yerel iş (kirli not / outbox) varsa debounce'lu senkron planlar. */
export function scheduleNotesSync(): void {
  if (suspended || !isReflexSyncEligible()) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushNotesNow();
  }, DEBOUNCE_MS);
}

/** "Yeniden dene". */
export function retryNotesSync(): void {
  void flushNotesNow();
}

export type NotesFlushOutcome = {
  status: "skipped" | "noop" | "ok" | "conflict" | "rejected" | "error" | "offline";
  results: NoteSyncResult[];
};

/** Hemen senkronla (tek uçuş: önceki istek bitince çalışır). */
export function flushNotesNow(): Promise<NotesFlushOutcome> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const prev = chain ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => doFlush());
  chain = run;
  void run.finally(() => {
    if (chain === run) chain = null;
  });
  return run;
}

async function doFlush(): Promise<NotesFlushOutcome> {
  const headers = reflexUserHeaders();
  if (!headers || !isReflexSyncEligible()) return { status: "skipped", results: [] };

  const scopeAtStart = currentReflexScopeId();
  const gen = generation;

  const push = selectNotesToPush(loadNotesFromStorage());
  const outbox = loadNotesOutbox();
  if (push.length === 0 && outbox.length === 0) return { status: "noop", results: [] };

  // RF-04: TÜM kirli notlar artık tek dev PUT'a bağlanmaz. Bütçeli parçalar sırayla
  // gönderilir; tek başına platform sınırını aşan not istek GÖNDERİLMEDEN yerelde
  // işaretlenir → diğer notların senkronu bloke olmaz.
  const plan = planNoteSyncChunks(push, outbox, { safeBytes: NOTE_SYNC_REQUEST_SAFE_BYTES });
  if (plan.oversize.length > 0) markNotesRejected(plan.oversize.map((n) => n.id), OVERSIZE_MESSAGE);
  if (plan.chunks.length === 0) {
    setReflexologySyncStatus({
      state: "error",
      message: `${plan.oversize.length} not çok büyük olduğu için sunucuya gönderilemedi (ekler en fazla 3 MB). Eki küçültüp notu yeniden kaydedin.`,
    });
    return { status: "rejected", results: [] };
  }

  setReflexologySyncStatus({ state: "syncing", message: "Notlar eşitleniyor…" });

  const allResults: NoteSyncResult[] = [];
  const sent = new Map<string, string>();
  let conflicts = 0;
  let rejected = plan.oversize.length;
  let failure: "offline" | "error" | null = null;

  for (const chunk of plan.chunks) {
    const r = await sendNoteChunk(headers, chunk, gen, scopeAtStart);
    if (r.kind === "stale") return { status: "skipped", results: allResults };
    if (r.kind === "network") {
      failure = isOffline() ? "offline" : "error";
      break; // kalan parçalar kirli kalır → sonraki denemede gönderilir
    }
    for (const n of chunk.notes) sent.set(n.id, n.updatedAt);
    allResults.push(...r.results);
    conflicts += r.conflicts;
    rejected += r.rejected;
    if (r.kind === "http-error") failure = "error";
  }

  if (failure === "offline" || (failure === "error" && allResults.length === 0)) {
    setReflexologySyncStatus(
      failure === "offline"
        ? { state: "offline", message: "Çevrimdışı — notlar cihazda saklandı." }
        : { state: "error", message: "Notlar eşitlenemedi.", retry: retryNotesSync },
    );
    return { status: failure === "offline" ? "offline" : "error", results: allResults };
  }

  if (conflicts > 0) {
    setReflexologySyncStatus({
      state: "conflict",
      message:
        "Bazı notlar başka bir cihazda veya sekmede değiştirilmiş. Yerel metniniz korundu; sunucudaki güncel sürümü yeniden yükleyebilirsiniz.",
      retry: reloadNotesFromServer,
    });
    return { status: "conflict", results: allResults };
  }
  if (rejected > 0) {
    setReflexologySyncStatus({
      state: "error",
      message: `${rejected} not eşitlenemedi (geçersiz içerik veya ekler çok büyük). İşaretli notu düzenleyip yeniden kaydedin; diğer notlar eşitlendi.`,
    });
    return { status: "rejected", results: allResults };
  }
  if (failure === "error") {
    setReflexologySyncStatus({ state: "error", message: "Notların bir kısmı eşitlenemedi.", retry: retryNotesSync });
    return { status: "error", results: allResults };
  }
  setReflexologySyncStatus({ state: "synced", message: "Notlar eşitlendi" });
  // Uçuştayken YENİ değişiklik olduysa onu da gönder (aynı sürümü tekrar gönderme → döngü yok).
  const sentDeletes = new Set(outbox.map((d) => d.uid));
  const newWork =
    selectNotesToPush(loadNotesFromStorage()).some((n) => sent.get(n.id) !== n.updatedAt) ||
    loadNotesOutbox().some((d) => !sentDeletes.has(d.uid));
  if (newWork) scheduleNotesSync();
  return { status: "ok", results: allResults };
}

const OVERSIZE_MESSAGE =
  "Bu notun ekleri sunucu sınırını aşıyor (ekler toplam en fazla 3 MB). Eki küçültüp/kaldırıp notu yeniden kaydedin; not bu cihazda saklı.";

/** Notları yerelde "reddedildi" olarak işaretle (kullanıcı düzenleyene dek yeniden gönderilmez). */
function markNotesRejected(ids: string[], message: string): void {
  const set = new Set(ids);
  const list = loadNotesFromStorage();
  let changed = false;
  const next = list.map((n) => {
    if (!set.has(n.id) || n.syncRejected === message) return n;
    changed = true;
    return { ...n, syncRejected: message };
  });
  if (changed && saveNotesToStorage(next)) notifyNotesUpdated();
}

type ChunkOutcome =
  | { kind: "ok" | "http-error"; results: NoteSyncResult[]; conflicts: number; rejected: number }
  | { kind: "network" }
  | { kind: "stale" };

/** Tek parça PUT; sonuçları yerele uygular. 413'te parça not-not bölünür / not reddedilir. */
async function sendNoteChunk(
  headers: Record<string, string>,
  chunk: NoteSyncChunk,
  gen: number,
  scopeAtStart: string | null,
): Promise<ChunkOutcome> {
  let res: Response;
  try {
    res = await fetchNotesWithTimeout(ENDPOINT, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: chunk.notes.map(toWireNote),
        deleted_uids: chunk.deleted.map((d) => ({ uid: d.uid, expected_updated_at: d.expected_updated_at })),
      }),
    });
  } catch {
    if (gen !== generation) return { kind: "stale" };
    return { kind: "network" };
  }
  if (gen !== generation || currentReflexScopeId() !== scopeAtStart) return { kind: "stale" };

  // Platform 413 (tahmin yetmediyse): tek notluk parça → o not reddedilir; çoklu → tek tek dene.
  if (res.status === 413) {
    if (chunk.notes.length <= 1 && chunk.deleted.length === 0) {
      markNotesRejected(chunk.notes.map((n) => n.id), OVERSIZE_MESSAGE);
      return { kind: "ok", results: [], conflicts: 0, rejected: chunk.notes.length };
    }
    const agg: NoteSyncResult[] = [];
    let conflicts = 0;
    let rejected = 0;
    let httpError = false;
    const parts: NoteSyncChunk[] = [
      ...(chunk.deleted.length > 0 ? [{ notes: [], deleted: chunk.deleted }] : []),
      ...chunk.notes.map((n) => ({ notes: [n], deleted: [] })),
    ];
    for (const p of parts) {
      const r = await sendNoteChunk(headers, p, gen, scopeAtStart);
      if (r.kind === "stale" || r.kind === "network") return r;
      agg.push(...r.results);
      conflicts += r.conflicts;
      rejected += r.rejected;
      if (r.kind === "http-error") httpError = true;
    }
    return { kind: httpError ? "http-error" : "ok", results: agg, conflicts, rejected };
  }

  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; results?: NoteSyncResult[]; conflicts?: number; rejected?: number }
    | null;
  const results = Array.isArray(json?.results) ? (json!.results as NoteSyncResult[]) : [];
  if (results.length > 0) {
    const sent = new Map(chunk.notes.map((n) => [n.id, n.updatedAt]));
    const applied = applySyncResults(loadNotesFromStorage(), loadNotesOutbox(), results, sent, parseStoredNote);
    if (applied.changed) {
      saveNotesToStorage(applied.notes);
      saveNotesOutbox(applied.outbox);
      notifyNotesUpdated();
    }
  }
  const conflicts =
    (typeof json?.conflicts === "number" ? json.conflicts : 0) + (res.status === 409 && !json?.conflicts ? 1 : 0);
  const rejected = results.filter((r) => r.outcome === "rejected").length;
  const ok = res.ok || res.status === 409;
  return { kind: ok ? "ok" : "http-error", results, conflicts, rejected };
}

/**
 * Askıda kalan istek senkron zincirini kilitlemesin (zaman aşımı → ağ hatası) AMA yavaş
 * bağlantıdaki meşru büyük yüklemeyi de kesmesin: taban 30 sn + gövdenin her 32 KB'ı için
 * 1 sn (≈4 MB ek → ~155 sn ≈ 26 KB/s'ye kadar yavaş bağlantı tolere edilir).
 */
function notesRequestTimeoutMs(body: BodyInit | null | undefined): number {
  const bytes = typeof body === "string" ? body.length : 0;
  return 30_000 + Math.ceil(bytes / 32_768) * 1_000;
}

async function fetchNotesWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), notesRequestTimeoutMs(init.body));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sunucudan notları indirir. Dönüş: sunucu listesi (senkron aktifse) veya null
 * (demo/oturumsuz/erişilemez → çağıran yereli korur).
 */
export async function hydrateNotesFromServer(): Promise<SavedClinicalNote[] | null> {
  const headers = reflexUserHeaders();
  if (!headers || !isReflexSyncEligible()) return null;
  try {
    const res = await fetch(ENDPOINT, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; notes?: unknown[] }
      | null;
    if (!json?.ok || !Array.isArray(json.notes)) return null;
    return json.notes
      .map(parseStoredNote)
      .filter((n): n is SavedClinicalNote => n != null)
      .map((n) => {
        // Sunucudan gelen not asla "kirli" değildir.
        const { dirty: _d, syncRejected: _r, ...rest } = n;
        void _d;
        void _r;
        return rest;
      });
  } catch {
    return null;
  }
}

// ─── Eski (v1) notlar: kanıtlı benimseme + karantina ─────────────────────────

/**
 * Eski cihaz-geneli anahtardaki notları sunucu listesiyle sınıflandırır:
 *   - sahipliği kanıtlı + yerel düzenlemeli → kapsamlı depoya (kirli) alınır
 *   - sunucuyla birebir aynı → güvenle bırakılır (veri sunucuda)
 *   - hiç senkronlanmamış / belirsiz → karantina (kullanıcı kararı)
 *   - başka hesaba ait olabilecek senkronlu kopya → eski anahtarda KALIR
 * Yazma sırası: önce hedef, sonra kaynak (kota hatasında veri kaybı yok).
 * Dönüş: karantinadaki not sayısı.
 */
function processLegacyNotes(server: SavedClinicalNote[]): number {
  const legacy = loadLegacyNotes();
  if (legacy.length === 0) return loadQuarantinedNotes().length;

  const cls = classifyLegacyNotes(legacy, server);

  if (cls.adopt.length > 0) {
    const local = loadNotesFromStorage();
    const byId = new Map(local.map((n) => [n.id, n]));
    for (const a of cls.adopt) {
      const cur = byId.get(a.id);
      if (!cur || cur.dirty !== true) byId.set(a.id, a);
    }
    if (!saveNotesToStorage([...byId.values()])) return loadQuarantinedNotes().length;
  }

  let quarantine = loadQuarantinedNotes();
  if (cls.quarantine.length > 0) {
    const seen = new Set(quarantine.map((q) => `${q.id}|${q.updatedAt}`));
    const additions = cls.quarantine.filter((q) => !seen.has(`${q.id}|${q.updatedAt}`));
    quarantine = [...quarantine, ...additions];
    if (!saveQuarantinedNotes(quarantine)) return loadQuarantinedNotes().length;
  }

  writeLegacyNotes(cls.leave);
  return quarantine.length;
}

export function getQuarantinedNoteCount(): number {
  return loadQuarantinedNotes().length;
}

/** "Bana ait, içe aktar": karantinadaki notlar YENİ kimlikle bu hesaba eklenir ve senkronlanır. */
export function importQuarantinedNotesToAccount(): { imported: number; ok: boolean } {
  const q = loadQuarantinedNotes();
  if (q.length === 0) return { imported: 0, ok: true };
  const next = importQuarantinedNotes(loadNotesFromStorage(), q, newNoteId);
  if (!saveNotesAndSync(next)) return { imported: 0, ok: false };
  saveQuarantinedNotes([]);
  notifyNotesUpdated();
  return { imported: q.length, ok: true };
}

/** "Sil": karantinadaki sahibi belirsiz notları bu cihazdan kaldırır (açık kullanıcı kararı). */
export function discardQuarantinedNotes(): void {
  saveQuarantinedNotes([]);
}

/**
 * Açılış hidrasyonu: sunucu listesi + yerel (kirli/outbox) birleşimi + eski veri
 * sınıflandırması. Bekleyen yerel iş varsa (önceki başarısız denemeler) gönderilir.
 * Dönüş null → sunucu erişilemez/demo (yerel korunur).
 */
export async function hydrateAndMergeNotes(): Promise<{ quarantineCount: number } | null> {
  const scopeAtStart = currentReflexScopeId();
  const server = await hydrateNotesFromServer();
  if (!server || currentReflexScopeId() !== scopeAtStart) return null;

  const quarantineCount = processLegacyNotes(server);

  const outboxUids = new Set(loadNotesOutbox().map((d) => d.uid));
  const merged = mergeNotesWithServer(loadNotesFromStorage(), server, outboxUids);
  saveNotesToStorage(merged);
  notifyNotesUpdated();

  if (selectNotesToPush(merged).length > 0 || outboxUids.size > 0) {
    scheduleNotesSync();
  }
  return { quarantineCount };
}

const CONFLICT_KEPT_MESSAGE =
  "Bu not başka bir cihazda değiştirildi. Metniniz korundu; yeniden kaydederseniz sunucudaki sürümün yerine geçer.";

/**
 * Conflict "yeniden yükle" yolu (REF-003): sunucu listesini alır; ÇAKIŞAN kirli
 * notların yerel metnini KORUR, base'ini sunucu sürümüne çeker ve otomatik
 * gönderimi durdurur (kullanıcı yeniden kaydedince bilinçli olarak gönderilir).
 */
export async function reloadNotesFromServer(): Promise<void> {
  const scopeAtStart = currentReflexScopeId();
  const server = await hydrateNotesFromServer();
  if (!server || currentReflexScopeId() !== scopeAtStart) return;

  const serverById = new Map(server.map((s) => [s.id, s]));
  const local = loadNotesFromStorage();
  const conflicted = new Set(
    local
      .filter((n) => {
        const s = serverById.get(n.id);
        return n.dirty === true && !!s && !!n.baseUpdatedAt && s.baseUpdatedAt !== n.baseUpdatedAt;
      })
      .map((n) => n.id),
  );

  const outboxUids = new Set(loadNotesOutbox().map((d) => d.uid));
  const merged = mergeNotesWithServer(local, server, outboxUids).map((n) => {
    if (!conflicted.has(n.id)) return n;
    const s = serverById.get(n.id);
    return {
      ...n,
      ...(s?.baseUpdatedAt ? { baseUpdatedAt: s.baseUpdatedAt } : {}),
      dirty: true,
      syncRejected: CONFLICT_KEPT_MESSAGE,
    };
  });
  saveNotesToStorage(merged);
  notifyNotesUpdated();
  setReflexologySyncStatus({ state: "idle", message: "" });
}

// ─── Silme (sunucu-önce + kalıcı outbox) ─────────────────────────────────────

export type DeleteNoteOutcome =
  | { ok: true; state: "deleted" | "local" | "queued"; message?: string }
  | { ok: false; state: "conflict" | "missing" | "storage"; message: string };

/**
 * Notu siler: kalıcı outbox'a (tombstone) yazar, yerel listeden çıkarır ve —
 * senkron uygunsa — sunucu sonucunu BEKLER.
 *   deleted  → sunucuda silindi (veya zaten yoktu)
 *   queued   → ağ/sunucu hatası; silme cihazda kayıtlı, bağlantı gelince gönderilir
 *              (not hydrate'te DİRİLMEZ)
 *   conflict → not başka cihazda değişmiş; silinmedi, güncel hâli geri yüklendi
 *   local    → demo/oturumsuz: yalnız yerel
 */
export async function deleteNoteWithSync(id: string): Promise<DeleteNoteOutcome> {
  const list = loadNotesFromStorage();
  const target = list.find((n) => n.id === id);
  if (!target) {
    return { ok: false, state: "missing", message: "Not bulunamadı." };
  }

  const eligible = isReflexSyncEligible();
  if (eligible) {
    const outbox = loadNotesOutbox().filter((d) => d.uid !== id);
    outbox.push({
      uid: id,
      expected_updated_at: target.baseUpdatedAt ?? null,
      queuedAt: new Date().toISOString(),
    });
    if (!saveNotesOutbox(outbox)) {
      return { ok: false, state: "storage", message: "Silme kaydedilemedi (cihaz depolama alanı dolu)." };
    }
  }
  if (!saveNotesToStorage(list.filter((n) => n.id !== id))) {
    return { ok: false, state: "storage", message: "Silme kaydedilemedi (cihaz depolama alanı dolu)." };
  }
  notifyNotesUpdated();

  if (!eligible) return { ok: true, state: "local" };

  const outcome = await flushNotesNow();
  const r = outcome.results.find(
    (x) => x.uid === id && (x.outcome === "deleted" || x.outcome === "delete-noop" || x.outcome === "delete-conflict"),
  );
  if (r?.outcome === "deleted" || r?.outcome === "delete-noop") {
    return { ok: true, state: "deleted" };
  }
  if (r?.outcome === "delete-conflict") {
    return {
      ok: false,
      state: "conflict",
      message: "Not başka bir cihazda değiştirilmiş; silinmedi ve güncel hâli geri yüklendi.",
    };
  }
  return {
    ok: true,
    state: "queued",
    message: "Silme bu cihazda kaydedildi; bağlantı sağlanınca sunucuya iletilecek.",
  };
}
