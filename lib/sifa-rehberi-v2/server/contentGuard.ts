/**
 * Şifa Rehberi V2 — kayıt öncesi İÇERİK BÜTÇESİ (sunucu). Storage hattının aşılmasını ve DB'nin gereksiz
 * büyütülmesini önler; eski kayıtları DÖNÜŞTÜRMEZ/SİLMEZ.
 *
 * Kural:
 *  - Yeni görsel YALNIZ güvenli depo referansı `sifa-asset:<uuid>` olabilir.
 *  - Gömülü (data:image/…) veya harici (https://…) görsel kaynağı YALNIZ aynı kutunun KAYITLI içeriğinde
 *    birebir aynı kaynakla zaten varsa kabul edilir (eski editörle kaydedilmiş görsel; düzenlenince korunur).
 *    Başka kutuya kopyalama ya da yeni ekleme → 422 (hiçbir şey yazılmaz).
 *  - Kutu içeriği (eski görsel kaynakları HARİÇ) en fazla MAX_BLOCK_CONTENT_CHARS karakter.
 */
import type { JSONContent } from "@tiptap/core";
import { ASSET_SRC_RE } from "@/lib/sifa-rehberi-v2/contentSafety";

export const MAX_BLOCK_CONTENT_CHARS = 1_500_000;

export type GuardIssue = { status: 413 | 422; code: string; error: string };

function figureSrcs(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  const n = node as JSONContent;
  if (n.type === "figure" && typeof n.attrs?.src === "string") out.push(n.attrs.src);
  if (Array.isArray(n.content)) for (const c of n.content) figureSrcs(c, out);
  return out;
}

type IncomingBlock = { id: string; content: unknown };

/** Ham kayıt gövdesinden değişen kutular (biçim hatası → boş; asıl doğrulama parseChangeset'te). */
export function incomingBlocks(body: unknown): IncomingBlock[] {
  const blocks = (body as { blocks?: unknown })?.blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b) => ({ id: String(b.id ?? ""), content: b.content_json }));
}

/** Kayıtlı içerik okunması GEREKİYOR mu? (yalnız gömülü/harici görsel kaynağı varsa — nadir yol) */
export function needsStoredContent(blocks: IncomingBlock[]): boolean {
  return blocks.some((b) => figureSrcs(b.content).some((s) => !ASSET_SRC_RE.test(s)));
}

/**
 * @param stored kutu kimliği → KAYITLI içerik (yalnız çağıranın kendi kayıtları).
 */
export function checkContentBudget(blocks: IncomingBlock[], stored: Map<string, unknown>): GuardIssue | null {
  for (const b of blocks) {
    const srcs = figureSrcs(b.content);
    const inline = srcs.filter((s) => !ASSET_SRC_RE.test(s));
    if (inline.length) {
      const before = new Set(figureSrcs(stored.get(b.id)).filter((s) => !ASSET_SRC_RE.test(s)));
      if (inline.some((s) => !before.has(s))) {
        return {
          status: 422,
          code: "SIFA_V2_INLINE_IMAGE",
          error: "Yeni görseller yalnız “Görsel ekle” ile güvenli depoya yüklenerek eklenebilir. Hiçbir değişiklik yazılmadı.",
        };
      }
    }
    let size = JSON.stringify(b.content ?? null).length;
    for (const s of inline) size -= s.length;
    if (size > MAX_BLOCK_CONTENT_CHARS) {
      return { status: 413, code: "SIFA_V2_BLOCK_TOO_LARGE", error: "Bir içerik kutusu çok büyük. Metni birden fazla kutuya bölün. Hiçbir değişiklik yazılmadı." };
    }
  }
  return null;
}
