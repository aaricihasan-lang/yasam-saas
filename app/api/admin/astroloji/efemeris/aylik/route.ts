import type { NextRequest } from "next/server";
import { requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { readJsonBody } from "@/lib/astrology/http";
import { parseMonthlyRequest } from "@/lib/astrology/pro/monthly/contract";
import { anyRate, json, localizeBody, monthlyDeps, monthlyAfterGate, MONTHLY_ERROR_STATUS } from "@/lib/astrology/pro/monthly/routeKit";
import { resolveOutputLocale } from "@/lib/i18n/output";
import { monthlyText } from "@/lib/astrology/pro/monthly/text";
import { getMonthlyEphemeris } from "@/lib/astrology/pro/monthly/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST — AYLIK EFEMERİS tablosu. Gövde: { kind: "western" | "vedic", year, month }.
 * Önce önbellek (süreç + kalıcı); yoksa sağlayıcıya AYIN TAMAMI için TEK istek (12:00 UTC günlük konumlar) → katı izdüşüm → bağımsız
 * DE440 kontrolü. Tutarsız/kontrolden geçmeyen tablo gösterilmez ve saklanmaz. Hiçbir şey kullanıcı adına kaydedilmez (kayıt ayrı uç).
 */
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAstrologyAccess(req);
  if (!gate.ok) return gate.response;
  const off = monthlyAfterGate(gate.ctx);
  if (off) return off;
  const g = gate;
  const L = monthlyText(resolveOutputLocale(req).locale); // I18N: hata metni ekran dilinde (sonuç verisi dil-bağımsız, değişmez)
  const b = await readJsonBody(req);
  if (!b.ok) return b.response;
  const parsed = parseMonthlyRequest(b.body);
  if (!parsed.ok) return json(localizeBody({ ok: false, ...parsed.error }, L), 400);
  const rl = await anyRate(g.ctx, L);
  if (rl) return rl;
  const r = await getMonthlyEphemeris(parsed.value, monthlyDeps(g.ctx, true), { allowProvider: true });
  if (!r.ok) return json(localizeBody({ ok: false, ...r.error }, L), MONTHLY_ERROR_STATUS[r.error.code] ?? 500);
  return json({ ok: true, result: r.result, cache: r.cache, providerCalls: r.providerCalls });
}
