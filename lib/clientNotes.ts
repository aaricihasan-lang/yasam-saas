/**
 * client_notes.notlar çok-not (multi-note) formatı.
 *
 * Tasarım kararı: Mevcut tenant/auth/RLS yapısına ve veritabanı şemasına
 * DOKUNMADAN birden fazla notu desteklemek için, tek `notlar` metin alanını
 * geriye dönük uyumlu bir JSON dizisi olarak saklıyoruz.
 *
 *   - Yeni format:  JSON.stringify(ClientNoteItem[])  → `[{"id":..,"content":..}]`
 *   - Eski format:  düz metin                          → tek bir nota dönüştürülür
 *   - Boş/null:     []                                  → not yok
 *
 * Bu sayede mevcut `/api/clients/[id]/notes` GET/PATCH uçları, yedekleme/restore
 * ve word raporu aynı sütunla çalışmaya devam eder; yalnızca okuyan taraflar
 * `parseClientNotes`/`notesToPlainText` üzerinden geçer.
 */

export type ClientNoteItem = {
  /** İstemci tarafında üretilen kararlı kimlik. */
  id: string;
  /** Not metni. */
  content: string;
  /** ISO tarih (oluşturma). Eski kayıtlarda boş olabilir. */
  createdAt: string;
  /** ISO tarih (son güncelleme). Yalnızca düzenlenince set edilir. */
  updatedAt?: string;
};

type RawNote = Partial<ClientNoteItem> & Record<string, unknown>;

function normalize(note: RawNote, index: number): ClientNoteItem | null {
  if (!note || typeof note !== "object") return null;
  if (typeof note.content !== "string") return null;
  return {
    id: typeof note.id === "string" && note.id ? note.id : `n-${index}`,
    content: note.content,
    createdAt: typeof note.createdAt === "string" ? note.createdAt : "",
    updatedAt:
      typeof note.updatedAt === "string" && note.updatedAt
        ? note.updatedAt
        : undefined,
  };
}

/**
 * Ham `notlar` değerini not dizisine çevirir.
 * - Geçerli JSON dizisi → notlar
 * - Boş JSON dizisi (`[]`) → not yok
 * - Geçersiz/eski düz metin → tek not (legacy)
 */
export function parseClientNotes(raw: string | null | undefined): ClientNoteItem[] {
  if (raw == null) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const items = parsed
          .map((n, i) => normalize(n as RawNote, i))
          .filter((n): n is ClientNoteItem => n !== null);
        // Geçerli JSON dizisi (boş da olsa) yeni format kabul edilir.
        if (items.length > 0 || parsed.length === 0) return items;
      }
    } catch {
      // JSON değil → aşağıda eski düz metin olarak değerlendirilir.
    }
  }

  // Eski format: düz metin tek not.
  return [{ id: "legacy", content: raw, createdAt: "", updatedAt: undefined }];
}

/** Not dizisini `notlar` sütununda saklanacak ham metne çevirir. */
export function serializeClientNotes(items: ClientNoteItem[]): string {
  if (!items.length) return "";
  return JSON.stringify(items);
}

/**
 * Word raporu / salt-okunur gösterimler için not dizisini tek düz metne çevirir.
 * Tek (legacy) notta önceki davranışla bire bir aynı çıktıyı verir.
 */
export function notesToPlainText(raw: string | null | undefined): string {
  return parseClientNotes(raw)
    .map((n) => n.content.trim())
    .filter(Boolean)
    .join("\n\n———\n\n");
}
