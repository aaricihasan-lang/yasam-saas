"use client";
/**
 * Beslenme → Besinler. TAM besin yönetimi (Kaynaklar + Geleneksel + Detaylı Ekle + CUSTOM besin
 * ekle/düzenle/sil) — admin ve Beslenme modül izinli uzman AYNI ekranı görür (module guard).
 * Yazma DAİMA tenant-scoped CUSTOM (SYSTEM salt-okunur). Ayrı "Besinlerim"/manuel-besin ekranı
 * KALDIRILDI; bu tek canonical tam-Beslenme besin ekranıdır.
 */
import {
  BeslenmeGate,
  useBeslenmeModuleGuard,
} from "../_components/BeslenmeShell";
import { BesinYonetimiScreen } from "../_components/BesinYonetimiScreen";

export default function BesinlerPage() {
  const guard = useBeslenmeModuleGuard();
  if (guard !== "ok") return <BeslenmeGate state={guard} />;
  return <BesinYonetimiScreen />;
}
