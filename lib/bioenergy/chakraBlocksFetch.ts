import { authHeaders } from "@/lib/biyoenerji/secureApi";
import type { ChakraContentBlock } from "./chakraWorkspace";

/**
 * FAZ 3.2C — bir çakranın rich içerik bloklarını server route üzerinden okur
 * (tarayıcıdan doğrudan tablo erişimi YOK). Foundation: migration DORMANT
 * olduğundan hata durumunda graceful boş listeye düşer (mevcut UI bozulmaz).
 */
export async function fetchChakraBlocks(
  chakraId: string,
): Promise<{ blocks: ChakraContentBlock[]; error: string | null }> {
  const id = chakraId.trim();
  if (!id) return { blocks: [], error: null };
  try {
    const res = await fetch(
      `/api/biyoenerji/chakra-blocks?chakraId=${encodeURIComponent(id)}`,
      { headers: authHeaders() },
    );
    if (!res.ok) return { blocks: [], error: `HTTP ${res.status}` };
    const json = (await res.json()) as { ok?: boolean; blocks?: unknown; error?: string };
    if (!json?.ok) return { blocks: [], error: json?.error ?? "unknown" };
    return {
      blocks: Array.isArray(json.blocks) ? (json.blocks as ChakraContentBlock[]) : [],
      error: null,
    };
  } catch (e) {
    return { blocks: [], error: e instanceof Error ? e.message : String(e) };
  }
}
