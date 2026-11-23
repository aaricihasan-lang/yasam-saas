import type { ReactNode } from "react";
import SifaV2Prototype from "@/components/sifa-rehberi-v2/SifaV2Prototype";
import { sifaScreen, sifaV2EnabledFromEnv } from "@/lib/sifa-rehberi-v2/versionRoute";
import "@/components/sifa-rehberi-v2/sifaV2.css";

/**
 * Şifa Rehberi — SÜRÜM SEÇİMİ (Owner kararı, yöntem B). YENİ dosya; mevcut V1 sayfalarına dokunmaz.
 * SIFA_REHBERI_V2_ENABLED=1 → V2 ekranı (/sifa-rehberi ve alt yolları); aksi hâlde V1 sayfaları AYNEN.
 * Kullanıcıya V1/V2 düğmesi yok; aynı anda tek sürüm. Ayrıntılar: lib/sifa-rehberi-v2/versionRoute.ts
 */
export default function SifaRehberiSurumLayout({ children }: { children: ReactNode }) {
  return sifaScreen(sifaV2EnabledFromEnv()) === "v2" ? <SifaV2Prototype mode="canli" /> : children;
}
