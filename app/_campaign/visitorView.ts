// Kampanya Merkezi — sunucu durumu (VisitorCampaignState) → ortak ziyaretçi görünümü (VisitorView). SAF; istemci + sunucu.
// Ziyaretçi sayfası (/ucretsiz-analiz) ve ana sayfa kampanya bölümü AYNI dönüştürücüyü kullanır (Owner önizlemesi de aynı
// sunum bileşenini kullanır) → üç yüzeyde aynı içerik.
import type { VisitorCampaignState } from "@/lib/campaign/visitor/types";
import type { VisitorView } from "./VisitorCampaignView";

export const KOZMIK_FEATURES = [
  { id: "moon", name: "Ay Fazları", by: "month" },
  { id: "retro", name: "Retro Takvimi", by: "month" },
  { id: "hours", name: "Gezegen Saatleri", by: "datePlace" },
  { id: "power", name: "Güçlü Günler", by: "month" },
  { id: "transits", name: "Transitler", by: "date" },
  { id: "hacamat", name: "Hacamat Takvimi", by: "month" },
] as const;

export function toVisitorView(s: VisitorCampaignState): VisitorView {
  if (s.state === "kapali") return { state: "kapali", slogan: "", altSlogan: "", description: "", affirmation: "", ctaText: "", imageSrc: null, startsLabel: null, modules: [] };
  return {
    state: s.state,
    slogan: s.slogan,
    altSlogan: s.altSlogan,
    description: s.description,
    affirmation: s.affirmation,
    ctaText: s.ctaText,
    imageSrc: s.imageSrc,
    startsLabel: s.startsAt ? new Date(s.startsAt).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null,
    modules: s.modules.map((m) => ({
      module: m.module,
      title: m.title,
      visitorShort: m.visitorShort,
      img: m.img,
      techniques: m.techniques.map((t) => ({
        key: t.key, name: t.visitorName, small: t.key === "kozmik:paket" ? "Altı özellik tek pakette — kayıt gerekmez" : t.formLabel,
        remaining: t.remaining, total: t.total, ipDaily: t.ipDaily, features: t.key === "kozmik:paket" ? KOZMIK_FEATURES.map((f) => f.name) : undefined,
      })),
    })),
  };
}
