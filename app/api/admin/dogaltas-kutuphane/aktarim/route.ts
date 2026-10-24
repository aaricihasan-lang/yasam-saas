import type { NextRequest } from "next/server";
import { runCrystalImport } from "@/lib/stone-library/import/runner";
import { CRYSTALS_DEFAULT_BASE_URL } from "@/lib/stone-library/import/roxyCrystalsClient";
import { IMPORT_DEADLINE_MS, IMPORT_MAX_CREDITS_PER_RUN, IMPORT_QUOTA_FLOOR } from "@/lib/stone-library/import/limits";
import { ownerRpc } from "@/lib/stone-library/import/ownerRpc";
import { OwnerInputError, ownerBadRequest, ownerJson, pickEnum, pickString, pickUuid, readOwnerBody, withOwner } from "@/lib/stone-library/ownerApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/dogaltas-kutuphane/aktarim — owner kontrollü kristal aktarımı.
 *   { action: "run", source_id, license_grant_id?, credit_cap, terms_sha256, include_images?, include_birthstones?, include_vocab?, force_refetch? }
 * • Ücretli çağrı yalnız bu açık istekle başlar; her çağrı önce DB'de ayrılır (tavan DB'de zorunlu).
 * • Daha önce başarıyla çekilmiş yanıtlar yeniden kullanılır (tekrar aktarımda kredi harcanmaz).
 * • Hiçbir şey yayımlanmaz: taşlar taslak, içerik / görseller owner incelemesi bekler.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return withOwner(req, async ({ db, ownerId }) => {
    const body = await readOwnerBody(req);
    const action = pickEnum(body, "action", ["run", "recover"] as const);
    if (action === "recover") {
      // Süre aşımı / çökme sonrası 'running' kalan paketi 'stopped' yapar; sonraki çalıştırma kaldığı yerden devam eder.
      const status = await ownerRpc<string>(db, "stone_library_batch_recover", { p_actor: ownerId, p_batch_id: pickUuid(body, "batch_id"), p_note: pickString(body, "note", 500) });
      return ownerJson({ ok: true, status });
    }
    const apiKey = process.env.ROXY_API_KEY;
    if (!apiKey) return ownerBadRequest("NOT_CONFIGURED", "Sağlayıcı anahtarı sunucuda tanımlı değil.", 503);
    const cap = Number(body.credit_cap);
    if (!Number.isInteger(cap) || cap < 1 || cap > IMPORT_MAX_CREDITS_PER_RUN) throw new OwnerInputError(`credit_cap 1–${IMPORT_MAX_CREDITS_PER_RUN} olmalı.`);
    const terms = pickString(body, "terms_sha256", 64);
    if (!terms || !/^[0-9a-f]{64}$/.test(terms)) throw new OwnerInputError("terms_sha256 gerekli.");
    const licenseGrantId = body.license_grant_id == null ? null : pickUuid(body, "license_grant_id");
    const base = (process.env.ROXY_API_BASE_URL ?? CRYSTALS_DEFAULT_BASE_URL).trim();
    const summary = await runCrystalImport({
      db, actor: ownerId, sourceId: pickUuid(body, "source_id"), licenseGrantId,
      client: { baseUrl: base, apiKey },
      includeImages: body.include_images === true && licenseGrantId !== null,
      includeBirthstones: body.include_birthstones !== false,
      includeVocabLists: body.include_vocab !== false,
      forceRefetch: body.force_refetch === true,
      creditCap: cap, allowanceRemaining: cap, quotaFloor: IMPORT_QUOTA_FLOOR, termsSha256: terms,
      // Vercel 300 sn sınırından önce zarif durma (paket 'stopped', sonraki çağrı kaldığı yerden devam eder).
      deadlineMs: IMPORT_DEADLINE_MS,
    });
    const { details: _details, ...rest } = summary;
    void _details;
    return ownerJson({ ok: true, summary: rest });
  });
}
