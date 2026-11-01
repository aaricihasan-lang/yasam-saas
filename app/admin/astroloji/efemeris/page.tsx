import { notFound } from "next/navigation";
import { isProEphemerisEnabled } from "@/lib/astrology/pro/ephemeris/flags";
import EphemerisDesk from "../_components/ephemeris/EphemerisDesk";

/**
 * Gökyüzü Atlası — PROFESYONEL EFEMERİS (izole sayfa). VARSAYILAN KAPALI: ATLAS_PRO_EPHEMERIS_ENABLED=1 değilse notFound().
 * Owner kabuğu (app/admin/astroloji/layout.tsx owner kapısı) altında çalışır; menüye/gezinmeye bağlı DEĞİLDİR (yalnız doğrudan adres).
 * Veri yetkisi her istekte sunucuda (requireAstrologyAccess).
 */
export default function ProEphemerisPage() {
  if (!isProEphemerisEnabled()) notFound();
  return <EphemerisDesk />;
}

export const dynamic = "force-dynamic";
