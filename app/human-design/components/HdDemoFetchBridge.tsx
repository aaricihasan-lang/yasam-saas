"use client";

import { readYasamUser } from "@/lib/auth/yasamUser";
import { installHdDemoFetchBridge } from "@/lib/human-design/demo/demoFetchBridge";

/**
 * D3 (owner 2026-11-02): demo hesabında Human Design okuma isteklerini salt okunur örnek uca yönlendiren köprü.
 * Modül yüklenirken kurulur (sayfa bileşenlerinin ilk veri isteklerinden ÖNCE). Hiçbir şey çizmez; normal oturumda etkisizdir.
 */
const isDemo = () => readYasamUser()?.is_demo_account === true;
installHdDemoFetchBridge(isDemo);

export function HdDemoFetchBridge() {
  installHdDemoFetchBridge(isDemo);
  return null;
}
