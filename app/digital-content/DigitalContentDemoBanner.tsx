"use client";

import { readYasamUser } from "@/lib/auth/yasamUser";
import { DemoModuleBanner } from "@/components/demo/DemoModuleBanner";
import { useDigitalContentDemo } from "./useDigitalContentDemo";

/**
 * Hub (modül girişi) için demo banner slotu.
 * Yeni banner tasarımı değil — ortak DemoModuleBanner'ı demo hesapta koşullu gösterir.
 */
export default function DigitalContentDemoBanner() {
  const isDemo = readYasamUser()?.is_demo_account === true;
  const { banner } = useDigitalContentDemo();
  if (!isDemo) return null;
  return <DemoModuleBanner message={banner} />;
}
