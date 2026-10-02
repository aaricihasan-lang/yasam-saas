/**
 * Refleksoloji Klinik Notlar — istemci senkron çekirdeği (SAF; DOM/fetch yok).
 *
 * FA-03 / FA-25 / DL-007:
 *   - Yalnız KİRLİ (dirty) notlar push edilir (eskiden her kayıtta TÜM liste gidiyor
 *     ve her satır yeniden CAS-update ediliyordu).
 *   - Reddedilen not (`rejected`) rozetle işaretlenir; kullanıcı düzenleyene dek
 *     yeniden gönderilmez; diğer notlar senkron olur.
 *   - Silme KALICI outbox (tombstone) ile: sayfa yenilense de silme kaybolmaz ve
 *     sunucudan gelen kopya hydrate'te DİRİLMEZ.
 *   - Hydrate birleştirmesi artık "union" DEĞİL:
 *       · outbox'taki id düşer
 *       · baseUpdatedAt'i olup sunucuda olmayan (uzaktan silinmiş) temiz not düşer
 *       · hiç senkronlanmamış / kirli yerel not korunur
 *   - Eski (v1, sahipsiz) notlar: sahipliği sunucu ile kanıtlananlar benimsenir,
 *     hiç senkronlanmamışlar karantinaya; ASLA otomatik silme / başka kullanıcıya yükleme.
 */

import type { SavedClinicalNote } from "@/app/refleksoloji/notlar/types";
import { noteContentKey, type NoteSyncResult } from "./notesConcurrency";

export type NoteOutboxEntry = {
  uid: string;
  expected_updated_at: string | null;
  queuedAt: string;
};

function byUpdatedDesc(a: SavedClinicalNote, b: SavedClinicalNote): number {
  return String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
}

/** Sunucudan gelen notu temiz (senkron) yerel kayda çevirir. */
function cleanServerNote(s: SavedClinicalNote): SavedClinicalNote {
  const { dirty: _d, syncRejected: _r, ...rest } = s as SavedClinicalNote & {
    dirty?: boolean;
    syncRejected?: string;
  };
  void _d;
  void _r;
  return { ...rest };
}

/**
 * Hydrate birleştirmesi (sunucu GET sonrası).
 *   - outbox'ta bekleyen silme → not gösterilmez (dirilmez)
 *   - ortak id: yerel kirli ise yerel korunur; değilse sunucu sürümü
 *   - yalnız yerelde: hiç senkronlanmamış → korunur; senkronlanmış + temiz → uzaktan
 *     silinmiş sayılır ve DÜŞER; senkronlanmış + kirli → yerel düzenleme korunur,
 *     base düşürülür (yeniden oluşturulur — veri kaybı yok)
 */
export function mergeNotesWithServer(
  local: SavedClinicalNote[],
  server: SavedClinicalNote[],
  outboxUids: Set<string>,
): SavedClinicalNote[] {
  const localById = new Map(local.filter((n) => n && n.id).map((n) => [n.id, n]));
  const serverIds = new Set<string>();
  const out: SavedClinicalNote[] = [];

  for (const s of server) {
    if (!s || typeof s.id !== "string" || !s.id) continue;
    serverIds.add(s.id);
    if (outboxUids.has(s.id)) continue;
    const l = localById.get(s.id);
    if (l && l.dirty === true) {
      out.push(l);
    } else {
      out.push(cleanServerNote(s));
    }
  }

  for (const l of local) {
    if (!l || !l.id || serverIds.has(l.id) || outboxUids.has(l.id)) continue;
    if (!l.baseUpdatedAt) {
      out.push(l); // hiç senkronlanmamış → korunur (push edilecek)
    } else if (l.dirty === true) {
      // Uzaktan silinmiş ama bu cihazda kaydedilmemiş düzenleme var → düzenlemeyi
      // kaybetme: yeni not olarak yeniden oluşturulacak.
      const { baseUpdatedAt: _b, ...rest } = l;
      void _b;
      out.push({ ...rest, dirty: true });
    }
    // else: senkronlanmış + temiz + sunucuda yok → uzaktan silinmiş → düşer.
  }

  return out.sort(byUpdatedDesc);
}

/** Push edilecek notlar: kirli ve (düzenlenene dek) reddedilmemiş. */
export function selectNotesToPush(notes: SavedClinicalNote[]): SavedClinicalNote[] {
  return notes.filter((n) => n && n.dirty === true && !n.syncRejected);
}

/** Sunucuya gönderilen biçim — istemci bayrakları (dirty/syncRejected) HARİÇ. */
export function toWireNote(n: SavedClinicalNote): Record<string, unknown> {
  return {
    id: n.id,
    title: n.title,
    date: n.date,
    content: n.content,
    attachments: n.attachments,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    ...(n.baseUpdatedAt ? { baseUpdatedAt: n.baseUpdatedAt } : {}),
  };
}

/**
 * RF-10: yerel düzenleme çakışması — not, düzenleme BAŞLADIKTAN sonra (aynı tarayıcıdaki
 * başka sekme veya hydrate ile gelen başka cihaz sürümü) değişti mi. Değiştiyse kayıt
 * sessizce EZMEZ; çağıran kullanıcıya sorar (force ile bilinçli üzerine yazma).
 */
export function hasLocalEditConflict(
  previous: Pick<SavedClinicalNote, "updatedAt"> | undefined,
  expectedUpdatedAt: string | null | undefined,
  force = false,
): boolean {
  if (!previous || force) return false;
  if (typeof expectedUpdatedAt !== "string") return false;
  return previous.updatedAt !== expectedUpdatedAt;
}

// ─── RF-04: bütçeli parça planı (tek büyük not diğerlerini kilitlemez) ────────

export type NoteSyncChunk = {
  notes: SavedClinicalNote[];
  deleted: NoteOutboxEntry[];
};

export type NoteSyncPlan = {
  chunks: NoteSyncChunk[];
  /** Tek başına bile güvenli istek sınırını aşan notlar — GÖNDERİLMEZ, yerelde işaretlenir. */
  oversize: SavedClinicalNote[];
};

function utf8Bytes(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return s.length * 2;
}

/**
 * Kirli notları + silme outbox'ını, her biri `safeBytes` (JSON gövdesi) ve `maxNotes`
 * sınırının altında kalan istek parçalarına böler. Silmeler küçük olduğundan ilk
 * parçaya gider. Bir not tek başına sınırı aşıyorsa `oversize` listesine alınır →
 * istek gönderilmeden kullanıcıya bildirilir; diğer notlar normal senkron olur.
 * Idempotent: aynı not aynı `id` + `baseUpdatedAt` ile gönderilir (retry duplicate üretmez).
 */
export function planNoteSyncChunks(
  notes: SavedClinicalNote[],
  outbox: NoteOutboxEntry[],
  opts: { safeBytes: number; maxNotes?: number; measure?: (s: string) => number },
): NoteSyncPlan {
  const measure = opts.measure ?? utf8Bytes;
  const maxNotes = opts.maxNotes ?? 25;
  const envelope = measure(JSON.stringify({ notes: [], deleted_uids: [] }));
  const deletedPayload = outbox.map((d) => ({ uid: d.uid, expected_updated_at: d.expected_updated_at }));
  const deletedBytes = measure(JSON.stringify(deletedPayload));

  const chunks: NoteSyncChunk[] = [];
  const oversize: SavedClinicalNote[] = [];
  let cur: NoteSyncChunk = { notes: [], deleted: outbox.length > 0 ? [...outbox] : [] };
  let curBytes = envelope + (outbox.length > 0 ? deletedBytes : 0);

  for (const n of notes) {
    const size = measure(JSON.stringify(toWireNote(n))) + 1;
    if (envelope + size > opts.safeBytes) {
      oversize.push(n);
      continue;
    }
    if (cur.notes.length >= maxNotes || curBytes + size > opts.safeBytes) {
      if (cur.notes.length > 0 || cur.deleted.length > 0) chunks.push(cur);
      cur = { notes: [], deleted: [] };
      curBytes = envelope;
    }
    cur.notes.push(n);
    curBytes += size;
  }
  if (cur.notes.length > 0 || cur.deleted.length > 0) chunks.push(cur);
  return { chunks, oversize };
}

export type AppliedSync = {
  notes: SavedClinicalNote[];
  outbox: NoteOutboxEntry[];
  changed: boolean;
  rejected: Array<{ uid: string; reason: string }>;
  conflicts: string[];
  deleted: string[];
  deleteConflicts: string[];
};

/**
 * PUT sonucunu yerel duruma uygular. `sent`: gönderilen notların updatedAt'i —
 * uçuştayken tekrar düzenlenen notun kirli bayrağı SİLİNMEZ.
 */
export function applySyncResults(
  notes: SavedClinicalNote[],
  outbox: NoteOutboxEntry[],
  results: NoteSyncResult[],
  sent: Map<string, string>,
  restore: (raw: unknown) => SavedClinicalNote | null,
): AppliedSync {
  const byId = new Map(notes.map((n) => [n.id, n]));
  let nextOutbox = [...outbox];
  let changed = false;
  const summary = {
    rejected: [] as Array<{ uid: string; reason: string }>,
    conflicts: [] as string[],
    deleted: [] as string[],
    deleteConflicts: [] as string[],
  };

  for (const r of results) {
    const note = byId.get(r.uid);
    const sameVersion = !!note && sent.get(r.uid) === note.updatedAt;
    switch (r.outcome) {
      case "created":
      case "updated":
      case "unchanged": {
        if (!note) break;
        const next: SavedClinicalNote = { ...note, baseUpdatedAt: r.updated_at };
        if (sameVersion) {
          delete next.dirty;
          delete next.syncRejected;
        }
        byId.set(r.uid, next);
        changed = true;
        break;
      }
      case "rejected": {
        summary.rejected.push({ uid: r.uid, reason: r.reason });
        if (note && sameVersion) {
          byId.set(r.uid, { ...note, dirty: true, syncRejected: r.reason });
          changed = true;
        }
        break;
      }
      case "conflict": {
        summary.conflicts.push(r.uid);
        break;
      }
      case "deleted":
      case "delete-noop": {
        summary.deleted.push(r.uid);
        const before = nextOutbox.length;
        nextOutbox = nextOutbox.filter((d) => d.uid !== r.uid);
        if (nextOutbox.length !== before) changed = true;
        break;
      }
      case "delete-conflict": {
        summary.deleteConflicts.push(r.uid);
        nextOutbox = nextOutbox.filter((d) => d.uid !== r.uid);
        // Başka cihazda değişmiş notu geri yükle (kör silme geri alınır).
        const restored = r.server != null ? restore(r.server) : null;
        if (restored && !byId.has(restored.id)) {
          byId.set(restored.id, {
            ...restored,
            ...(typeof r.server_updated_at === "string" ? { baseUpdatedAt: r.server_updated_at } : {}),
          });
        }
        changed = true;
        break;
      }
    }
  }

  return {
    notes: [...byId.values()].sort(byUpdatedDesc),
    outbox: nextOutbox,
    changed,
    ...summary,
  };
}

// ─── Eski (v1, sahipsiz) notlar ──────────────────────────────────────────────

export type LegacyNotesClassification = {
  /** Sahipliği kanıtlı (id + baseUpdatedAt sunucuyla eşleşir) ve yerelde düzenleme içeren. */
  adopt: SavedClinicalNote[];
  /** Sunucudaki kayıtla BİREBİR aynı içerik — hiçbir şey kaybolmadan bırakılabilir. */
  identical: SavedClinicalNote[];
  /** Hiç senkronlanmamış veya sahipliği kanıtlanamayan farklı içerik → kullanıcı kararı. */
  quarantine: SavedClinicalNote[];
  /**
   * Bir sunucuya senkronlanmış (base var) ama bu hesabın sunucusunda yok → başka
   * hesaba ait ya da uzaktan silinmiş olabilir. GÖSTERİLMEZ, SİLİNMEZ: eski anahtarda
   * kalır (sahibi giriş yaptığında kanıtla benimsenebilir).
   */
  leave: SavedClinicalNote[];
};

export function classifyLegacyNotes(
  legacy: SavedClinicalNote[],
  server: SavedClinicalNote[],
): LegacyNotesClassification {
  const serverById = new Map(server.filter((s) => s && s.id).map((s) => [s.id, s]));
  const out: LegacyNotesClassification = { adopt: [], identical: [], quarantine: [], leave: [] };

  for (const l of legacy) {
    if (!l || !l.id) continue;
    const s = serverById.get(l.id);
    const sameContent = !!s && noteContentKey(l) === noteContentKey(s);
    if (s && l.baseUpdatedAt && s.baseUpdatedAt && l.baseUpdatedAt === s.baseUpdatedAt) {
      if (sameContent) out.identical.push(l);
      else out.adopt.push({ ...l, dirty: true });
    } else if (sameContent) {
      out.identical.push(l);
    } else if (s) {
      // Aynı id sunucuda farklı içerik + base kanıtı yok → sahiplik belirsiz.
      out.quarantine.push(l);
    } else if (l.baseUpdatedAt) {
      out.leave.push(l);
    } else {
      out.quarantine.push(l); // hiç senkronlanmamış (ör. 422 hatası nedeniyle)
    }
  }
  return out;
}

/**
 * Kullanıcı "Bana ait, içe aktar" dediğinde: karantinadaki notlar YENİ kimlikle
 * (id çakışması / başka notu ezme olmasın) kirli olarak eklenir.
 */
export function importQuarantinedNotes(
  current: SavedClinicalNote[],
  quarantined: SavedClinicalNote[],
  newId: () => string,
): SavedClinicalNote[] {
  const imported = quarantined.map((q) => {
    const { baseUpdatedAt: _b, syncRejected: _r, ...rest } = q;
    void _b;
    void _r;
    return { ...rest, id: newId(), dirty: true } as SavedClinicalNote;
  });
  return [...imported, ...current].sort(byUpdatedDesc);
}
