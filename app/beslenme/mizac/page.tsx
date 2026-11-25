"use client";
/**
 * Beslenme → Mizaca Göre. traditional_profile + framework=mizac.
 * Canonical 4 mizaç (MIZAC_PROFILES) ORTAK ProfileTopicPage ile gösterilir.
 */
import { Compass } from "lucide-react";
import { useTranslations } from "next-intl";
import { MIZAC_PROFILES } from "@/lib/beslenme/contracts";
import {
  BeslenmeGate,
  useBeslenmeModuleGuard,
} from "../_components/BeslenmeShell";
import { ProfileTopicPage, type CanonicalProfile } from "../_components/ProfileTopicPage";


export default function MizacPage() {
  const guard = useBeslenmeModuleGuard();
  const ts = useTranslations("beslenme.shell");
  // matchTitle KANONİK (DB konu başlığı "Dem/Safra/Sovdavi/Balgam" ile eşleşme) — çevrilmez. Yalnız görünen etiket
  // ekran dilinde: TR "Dem/Safra/Sovdavi/Balgam" (birebir), EN Sanguine/Choleric/Melancholic/Phlegmatic (Owner teknik standardı).
  const PROFILES: CanonicalProfile[] = MIZAC_PROFILES.map((p) => ({
    matchTitle: p.title,
    label: ts(`mizacName.${p.code}`),
    sub: ts(`mizacQuality.${p.code}`),
  }));
  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  return (
    <ProfileTopicPage
      frameworkCode="mizac"
      profiles={PROFILES}
      title={ts("mizacTitle")}
      subtitle={ts("mizacSubtitle")}
      icon={<Compass className="h-32 w-32" strokeWidth={1} />}
    />
  );
}
