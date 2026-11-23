"use client";

import { installCookieMigrationFetchGate } from "@/lib/auth/cookieMigrationGate";

// Modül yüklenirken (hidrasyon / bileşen efektlerinden ÖNCE) kurulur — ilk panel istekleri de kapıdan geçer.
installCookieMigrationFetchGate();

/** HTTPONLY — eski token → çerez geçiş kapısı (bkz. lib/auth/cookieMigrationGate.ts). Görsel çıktı yok. */
export default function CookieMigrationGate() {
  return null;
}
