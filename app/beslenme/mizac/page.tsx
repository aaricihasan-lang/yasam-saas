"use client";
/**
 * Beslenme → Mizaca Göre. traditional_profile + framework=mizac.
 * Canonical 4 mizaç (MIZAC_PROFILES) ORTAK ProfileTopicPage ile gösterilir.
 */
import { Compass } from "lucide-react";
import { MIZAC_PROFILES } from "@/lib/beslenme/contracts";
import {
  BeslenmeGate,
  useBeslenmeOwnerGuard,
} from "../_components/BeslenmeShell";
import { ProfileTopicPage, type CanonicalProfile } from "../_components/ProfileTopicPage";

const PROFILES: CanonicalProfile[] = MIZAC_PROFILES.map((p) => ({
  matchTitle: p.title,
  label: p.title,
  sub: p.quality,
}));

export default function MizacPage() {
  const guard = useBeslenmeOwnerGuard();
  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  return (
    <ProfileTopicPage
      frameworkCode="mizac"
      profiles={PROFILES}
      title="Mizaca Göre Beslenme"
      subtitle="Geleneksel dört mizaç (Dem, Safra, Sovdavi, Balgam) için beslenme profilleri. Her profil bölümler, ilişkili besinler ve kaynaklarla yapılandırılır."
      icon={<Compass className="h-32 w-32" strokeWidth={1} />}
    />
  );
}
