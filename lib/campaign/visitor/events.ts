/**
 * Gece operasyonu — kampanya istatistik olayları (YALNIZ SUNUCU). Toplu sayaç; kişisel veri YOK.
 *
 *   sayfa / rapor_indir / uyelik_tikla : tarayıcıdan /api/kampanya/olay (aynı köken, küçük gövde, IP hız sınırı).
 *   analiz_baslat / analiz_tamam       : YALNIZ sunucu (pipeline) — istemci bunları gönderemez (sahte artırma yok).
 *   Tekil ziyaret: YALNIZ analitik onayı veren tarayıcının yerel rastgele kimliği (aid) → sunucuda günlük HMAC özeti.
 *                  Onay yoksa / kimlik geçersizse yalnız toplu sayaç artar.
 *   UTM: yalnız utm_source, küçük harf, [a-z0-9_.-]{0,40}; başka her değer boş kaynak sayılır.
 * Kayıt hatası analiz akışını ASLA bozmaz (en iyi çaba).
 */
import { createHmac } from "node:crypto";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subjectSecret, turkeyDay } from "../subject";

assertServerOnly("lib/campaign/visitor/events");

type Db = Pick<SupabaseClient, "rpc">;
export const PUBLIC_EVENTS = ["sayfa", "rapor_indir", "uyelik_tikla"] as const;
export type PublicEvent = (typeof PUBLIC_EVENTS)[number];
export type CampaignEvent = PublicEvent | "analiz_baslat" | "analiz_tamam";
const AID_RE = /^[A-Za-z0-9_-]{22,64}$/;
const TECH_RE = /^[a-z0-9_]{1,20}:[a-z0-9_.]{1,60}$/;

export function cleanUtm(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const v = raw.trim().toLowerCase();
  return /^[a-z0-9_.-]{1,40}$/.test(v) ? v : "";
}

/** Onaylı analitik kimliği → günlük HMAC özeti (64 hex) veya null. */
export function eventSubjectHash(aid: unknown, consent: unknown, now: Date, env: NodeJS.ProcessEnv = process.env): string | null {
  if (consent !== true || typeof aid !== "string" || !AID_RE.test(aid)) return null;
  const secret = subjectSecret(env);
  if (!secret) return null;
  return createHmac("sha256", secret).update(`km|olay|${turkeyDay(now)}|${aid}`).digest("hex");
}

export async function recordCampaignEvent(
  db: Db,
  e: { campaignId: string; event: CampaignEvent; techniqueKey?: string | null; utm?: string; subjectHash?: string | null; now?: Date },
): Promise<boolean> {
  try {
    const tech = e.techniqueKey && TECH_RE.test(e.techniqueKey) ? e.techniqueKey : null;
    const { data, error } = await db.rpc("campaign_record_event", {
      p_campaign_id: e.campaignId,
      p_event: e.event,
      p_technique_key: tech,
      p_utm_source: cleanUtm(e.utm),
      p_subject_hash: e.subjectHash ?? null,
      p_now: e.now ? e.now.toISOString() : null,
    });
    return !error && !!data && (data as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}
