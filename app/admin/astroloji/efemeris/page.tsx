import { notFound } from "next/navigation";
import { isProEphemerisEnabled } from "@/lib/astrology/pro/ephemeris/flags";
import SkyToolsDesk from "../_components/ephemeris/SkyToolsDesk";

/**
 * Gökyüzü Atlası — GÖKYÜZÜ ARAÇLARI (Efemeris · Ay Evreleri ve Tutulmalar · Derece Geçişleri). 02.11.2026'dan beri VARSAYILAN AÇIK;
 * ATLAS_PRO_EPHEMERIS_ENABLED=0 (acil kapatma) ise notFound(). Owner kabuğu (app/admin/astroloji/layout.tsx owner kapısı) altında çalışır;
 * Atlas menüsündeki bağlantı da aynı bayrakla (erişim yoklaması) görünür.
 * Veri yetkisi her istekte sunucuda (requireAstrologyAccess).
 */
export default function ProEphemerisPage() {
  if (!isProEphemerisEnabled()) notFound();
  return <SkyToolsDesk />;
}

export const dynamic = "force-dynamic";
