"use client";
/**
 * Beslenme → Besinler. Tam besin yönetimi (Kaynaklar + Geleneksel + Detaylı Ekle) — admin ve
 * Beslenme modül izinli uzman AYNI ekranı görür (module guard). Yazma DAİMA tenant-scoped
 * CUSTOM (SYSTEM salt-okunur). "mode=owner" burada rol değil TAM-EKRAN sunumudur (besinlerim
 * legacy dar bayrak ekranıdır). Ekran gövdesi ortak BesinYonetimiScreen'de.
 */
import {
  BeslenmeGate,
  useBeslenmeModuleGuard,
} from "../_components/BeslenmeShell";
import { BesinYonetimiScreen } from "../_components/BesinYonetimiScreen";

export default function BesinlerPage() {
  const guard = useBeslenmeModuleGuard();
  if (guard !== "ok") return <BeslenmeGate state={guard} />;
  return <BesinYonetimiScreen mode="owner" />;
}
