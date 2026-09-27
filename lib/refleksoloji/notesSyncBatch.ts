/**
 * Refleksoloji Klinik Notlar — PUT gövdesini not-başına hazırlama (SAF) — FA-03.
 *
 * Eski davranış: `validateIncomingNotes` İLK bozuk notta tüm isteği 422 ile
 * reddediyordu → tek bozuk ek yüzünden HİÇBİR not senkronlanmıyordu (notlar
 * yalnız cihazda kalıyordu). Artık her not ayrı doğrulanır; bozuk olan
 * `rejected` sonucu alır, geçerli olanlar işlenir.
 */

import { validateNoteBatchEnvelope, validateSingleNote, type NoteValidationError } from "./notesValidation";
import type { IncomingDeletion, IncomingSyncNote, NoteFields } from "./notesConcurrency";

/** Sunucuya yazılan raw_json'da tutulan (kullanıcı) alanlar — istemci bayrakları HARİÇ. */
const RAW_NOTE_KEYS = ["id", "title", "date", "content", "attachments", "createdAt", "updatedAt"] as const;

export function sanitizeRawNote(n: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of RAW_NOTE_KEYS) {
    if (n[k] !== undefined) out[k] = n[k];
  }
  return out;
}

/** Bir not için DB kolon alanları (tenant/source_uid/updated_at HARİÇ). */
export function noteToFields(n: Record<string, unknown>): NoteFields {
  return {
    title: typeof n.title === "string" ? n.title : null,
    note_date: typeof n.date === "string" ? n.date : null,
    content: typeof n.content === "string" ? n.content : null,
    attachments: Array.isArray(n.attachments) ? n.attachments : [],
    raw_json: sanitizeRawNote(n),
  };
}

export type PreparedNoteBatch =
  | { ok: false; error: NoteValidationError }
  | {
      ok: true;
      valid: IncomingSyncNote[];
      rejected: Array<{ uid: string; reason: string }>;
      deletions: IncomingDeletion[];
    };

/** PUT gövdesini (notes + deleted_uids) not-başına doğrulanmış yüke çevirir. */
export function prepareNoteSyncBatch(body: {
  notes?: unknown;
  deleted_uids?: unknown;
}): PreparedNoteBatch {
  const incoming = Array.isArray(body.notes) ? (body.notes as unknown[]) : [];

  const envelope = validateNoteBatchEnvelope(incoming);
  if (envelope) return { ok: false, error: envelope };

  const valid: IncomingSyncNote[] = [];
  const rejected: Array<{ uid: string; reason: string }> = [];
  const seen = new Set<string>();

  incoming.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return; // kimliksiz → raporlanamaz, atlanır
    const n = raw as Record<string, unknown>;
    const uid = typeof n.id === "string" ? n.id.trim() : "";
    if (!uid || uid.length > 200) return;
    if (seen.has(uid)) return; // aynı istekte tekrar eden id → ilk kazanır
    seen.add(uid);

    const err = validateSingleNote(n, i);
    if (err) {
      rejected.push({ uid, reason: err.message });
      return;
    }
    valid.push({
      uid,
      baseUpdatedAt:
        typeof n.baseUpdatedAt === "string" && n.baseUpdatedAt.length > 0 ? n.baseUpdatedAt : null,
      fields: noteToFields(n),
    });
  });

  // Açık silme listesi (REF-004): string (legacy) veya {uid, expected_updated_at}.
  const deletions: IncomingDeletion[] = Array.isArray(body.deleted_uids)
    ? (body.deleted_uids as unknown[])
        .map((v): IncomingDeletion | null => {
          if (typeof v === "string" && v.length > 0) return { uid: v, expectedUpdatedAt: null };
          if (v && typeof v === "object") {
            const o = v as Record<string, unknown>;
            const uid = typeof o.uid === "string" ? o.uid : "";
            if (!uid) return null;
            const exp =
              typeof o.expected_updated_at === "string" && o.expected_updated_at.length > 0
                ? o.expected_updated_at
                : null;
            return { uid, expectedUpdatedAt: exp };
          }
          return null;
        })
        .filter((d): d is IncomingDeletion => d != null)
    : [];

  return { ok: true, valid, rejected, deletions };
}
