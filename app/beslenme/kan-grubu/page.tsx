"use client";
/**
 * Beslenme → Kan Grubuna Göre. traditional_profile + framework=blood_type.
 * Canonical kan grupları (BLOOD_TYPE_PROFILES: "0","A","B","AB") ORTAK
 * ProfileTopicPage ile gösterilir. "0" → "0 (Sıfır)" olarak gösterilir (0/O karışmasın).
 * Not: geleneksel içerik aktarımı AYRI bir adımdır; topic'i olmayan profil "oluştur" istemi gösterir.
 */
import { HeartPulse } from "lucide-react";
import { BLOOD_TYPE_PROFILES } from "@/lib/beslenme/contracts";
import {
  BeslenmeGate,
  useBeslenmeOwnerGuard,
} from "../_components/BeslenmeShell";
import { ProfileTopicPage, type CanonicalProfile } from "../_components/ProfileTopicPage";

const PROFILES: CanonicalProfile[] = BLOOD_TYPE_PROFILES.map((b) => ({
  matchTitle: b,
  label: b === "0" ? "0 (Sıfır)" : b,
  sub: "Kan Grubu",
}));

export default function KanGrubuPage() {
  const guard = useBeslenmeOwnerGuard();
  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  return (
    <ProfileTopicPage
      frameworkCode="blood_type"
      profiles={PROFILES}
      title="Kan Grubuna Göre Beslenme"
      subtitle="0, A, B ve AB kan grupları için beslenme profilleri. Her profil bölümler, ilişkili besinler ve kaynaklarla yapılandırılır."
      icon={<HeartPulse className="h-32 w-32" strokeWidth={1} />}
    />
  );
}
