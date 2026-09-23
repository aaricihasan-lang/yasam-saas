"use client";
/**
 * Beslenme → Besinler (OWNER). Tam küratör besin yönetimi (Kaynaklar + Geleneksel + Detaylı Ekle).
 * Ekran gövdesi ortak BesinYonetimiScreen'de; bu sayfa yalnız owner-guard + mount.
 */
import {
  BeslenmeGate,
  useBeslenmeOwnerGuard,
} from "../_components/BeslenmeShell";
import { BesinYonetimiScreen } from "../_components/BesinYonetimiScreen";

export default function BesinlerPage() {
  const guard = useBeslenmeOwnerGuard();
  if (guard !== "ok") return <BeslenmeGate state={guard} />;
  return <BesinYonetimiScreen mode="owner" />;
}
