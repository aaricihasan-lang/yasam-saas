/**
 * KM-3 — ziyaretçi kampanya durumu (YALNIZ SUNUCU; service-role SELECT; kişisel veri yok).
 *
 * Görünürlük üç kapıdan geçer (hepsi gerekli):
 *   1) Ortam: CAMPAIGN_PUBLIC_ENABLED === "true" (varsayılan KAPALI → kod yayına çıksa bile ziyaretçi hiçbir şey görmez);
 *   2) DB: yayındaki tek kampanya (Aktif/Yakında) + tarih penceresi + acil durdurma kapalı;
 *   3) Teknik: Owner açtı + katalogda "hazır" + gerçek çalıştırıcısı var (visitorRunnerFor).
 * Kalan kontenjan gerçek sayaçtan (campaign_usage_daily: kullanılan + süren rezervasyon) hesaplanır.
 */
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogEntry, type CampaignModule } from "../catalog";
import { MODULE_UI, imageSrc, techniqueUi } from "../catalogUi";
import { turkeyDay } from "../subject";
import { visitorRunnerFor } from "./runners";
import type { VisitorCampaignState, VisitorTechnique } from "./types";

assertServerOnly("lib/campaign/visitor/publicState");

type Db = Pick<SupabaseClient, "from">;
const MODULE_ORDER: CampaignModule[] = ["hd", "numk", "numb", "atlas", "kozmik"];

export function publicEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CAMPAIGN_PUBLIC_ENABLED === "true";
}

type CampaignRow = {
  id: string; status: string; undated: boolean; starts_at: string | null; ends_at: string | null; slogan: string; alt_slogan: string;
  description: string; affirmation: string; cta_text: string; cta_target: string; image_ref: string | null;
  hd_options: { word?: boolean; kb?: boolean } | null; module_comments: Record<string, boolean> | null;
};
export type LiveCampaign = { row: CampaignRow; effective: "yakinda" | "aktif" };

/** Yayındaki kampanya + etkin durum (tarih penceresi). Acil durdurma veya ortam kapısı → null. */
export async function loadLiveCampaign(db: Db, now: Date, env: Record<string, string | undefined> = process.env): Promise<LiveCampaign | null> {
  if (!publicEnabled(env)) return null;
  const [s, c] = await Promise.all([
    db.from("campaign_settings").select("kill_switch").maybeSingle(),
    db.from("campaigns")
      .select("id, status, undated, starts_at, ends_at, slogan, alt_slogan, description, affirmation, cta_text, cta_target, image_ref, hd_options, module_comments")
      .is("archived_at", null)
      .in("status", ["aktif", "yakinda"])
      .limit(1),
  ]);
  if (s.error || c.error || !s.data || (s.data as { kill_switch: boolean }).kill_switch) return null;
  const row = ((c.data ?? []) as CampaignRow[])[0];
  if (!row) return null;
  const t = now.getTime();
  if (!row.undated) {
    const st = row.starts_at ? Date.parse(row.starts_at) : null;
    const en = row.ends_at ? Date.parse(row.ends_at) : null;
    if (en !== null && t > en) return null;
    if (st !== null && t < st) return { row, effective: "yakinda" };
  }
  return { row, effective: row.status === "aktif" ? "aktif" : "yakinda" };
}

export async function loadVisitorState(db: Db, now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<VisitorCampaignState> {
  try {
    const live = await loadLiveCampaign(db, now, env);
    if (!live) return { state: "kapali" };
    const { row } = live;
    const day = turkeyDay(now);
    const [techs, usage] = await Promise.all([
      db.from("campaign_techniques").select("technique_key, enabled, ip_daily_limit, daily_analysis_limit, comments_enabled").eq("campaign_id", row.id).eq("enabled", true),
      db.from("campaign_usage_daily").select("scope, used_analyses, reserved_analyses").eq("day_tr", day),
    ]);
    if (techs.error || usage.error) return { state: "kapali" };
    const used = new Map(((usage.data ?? []) as { scope: string; used_analyses: number; reserved_analyses: number }[]).map((u) => [u.scope, u.used_analyses + u.reserved_analyses]));
    const mc = row.module_comments ?? {};
    const byModule = new Map<CampaignModule, VisitorTechnique[]>();
    for (const t of (techs.data ?? []) as { technique_key: string; ip_daily_limit: number; daily_analysis_limit: number; comments_enabled: boolean }[]) {
      const entry = getCatalogEntry(t.technique_key);
      const runner = visitorRunnerFor(t.technique_key);
      if (!entry || !runner) continue;
      const ui = techniqueUi(entry.key);
      const total = t.daily_analysis_limit;
      const remaining = Math.max(0, total - (used.get(`tech:${row.id}:${entry.key}`) ?? 0));
      const list = byModule.get(entry.module) ?? [];
      list.push({
        key: entry.key,
        module: entry.module,
        title: entry.title,
        visitorName: ui.visitorName ?? entry.title,
        formLabel: runner.formLabel,
        fields: runner.fields,
        kind: runner.kind,
        remaining,
        total,
        ipDaily: t.ip_daily_limit,
        commentsEnabled: t.comments_enabled && mc[entry.module] === true && entry.comments.length > 0,
        hasReport: !!runner.hasReport && (entry.module !== "hd" || row.hd_options?.word !== false),
      });
      byModule.set(entry.module, list);
    }
    return {
      state: live.effective,
      campaignId: row.id,
      slogan: row.slogan,
      altSlogan: row.alt_slogan,
      description: row.description,
      affirmation: row.affirmation,
      ctaText: row.cta_text,
      ctaTarget: row.cta_target,
      imageSrc: imageSrc(row.image_ref),
      startsAt: row.undated ? null : row.starts_at,
      dayTr: day,
      modules: MODULE_ORDER.filter((m) => byModule.has(m)).map((m) => ({ module: m, title: MODULE_UI[m].title, visitorShort: MODULE_UI[m].visitorShort, img: MODULE_UI[m].img, techniques: byModule.get(m)! })),
    };
  } catch {
    return { state: "kapali" };
  }
}
