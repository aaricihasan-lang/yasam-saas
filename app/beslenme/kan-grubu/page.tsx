"use client";
/**
 * Beslenme → Kan Grubuna Göre. traditional_profile + framework=blood_type.
 * Canonical kan grupları (BLOOD_TYPE_PROFILES: "0","A","B","AB") ORTAK
 * ProfileTopicPage ile gösterilir. "0" → "0 (Sıfır)" olarak gösterilir (0/O karışmasın).
 * Not: geleneksel içerik aktarımı AYRI bir adımdır; topic'i olmayan profil "oluştur" istemi gösterir.
 */
import { HeartPulse } from "lucide-react";
import { useTranslations } from "next-intl";
import { BLOOD_TYPE_PROFILES } from "@/lib/beslenme/contracts";
import {
  BeslenmeGate,
  useBeslenmeModuleGuard,
} from "../_components/BeslenmeShell";
import { ProfileTopicPage, type CanonicalProfile } from "../_components/ProfileTopicPage";


export default function KanGrubuPage() {
  const guard = useBeslenmeModuleGuard();
  const ts = useTranslations("beslenme.shell");
  // matchTitle kanonik ("0","A","B","AB"; DB eşleşmesi) DEĞİŞMEZ; yalnız gösterim etiketi çevrilir (EN "0" → "O").
  const PROFILES: CanonicalProfile[] = BLOOD_TYPE_PROFILES.map((b) => ({
    matchTitle: b,
    label: b === "0" ? ts("bloodZero") : b,
    sub: ts("bloodSub"),
  }));
  if (guard !== "ok") return <BeslenmeGate state={guard} />;

  return (
    <ProfileTopicPage
      frameworkCode="blood_type"
      profiles={PROFILES}
      title={ts("bloodTitle")}
      subtitle={ts("bloodSubtitle")}
      icon={<HeartPulse className="h-32 w-32" strokeWidth={1} />}
    />
  );
}
