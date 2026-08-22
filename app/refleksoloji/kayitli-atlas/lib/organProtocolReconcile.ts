"use client";

import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import {
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
} from "@/app/refleksoloji/protokol-haritasi/lib/protocolStorage";

/**
 * Atlas organ rename/delete ile protokolleri uzlaştırma yardımcıları (BUG-3).
 * Server tarafı /api/refleksoloji/protocols/organ; ayrıca localStorage'daki
 * Protokol Haritası kayıtları (SavedProtocol.organs) da güncellenir/sorgulanır.
 */

const NORM = (s: string) => s.trim().toLocaleLowerCase("tr");

function userHeaders(): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return {
    "x-user-id": uid ?? "",
    ...(token ? { "x-session-token": token } : {}),
  };
}

/** Yerel Protokol Haritası kayıtlarında organı kullananların sayısı. */
function localUsageCount(name: string): number {
  const t = NORM(name);
  return loadProtocolsFromStorage().filter((p) => p.organs.some((o) => NORM(o) === t)).length;
}

/** Bu organı kullanan protokol sayısı + başlıkları (server + yerel birleşik). */
export async function getOrganProtocolUsage(
  name: string,
): Promise<{ count: number; titles: string[] }> {
  const isDemo = readYasamUser()?.is_demo_account === true;
  let serverCount = 0;
  let titles: string[] = [];
  if (!isDemo) {
    try {
      const res = await fetch(
        `/api/refleksoloji/protocols/organ?name=${encodeURIComponent(name)}`,
        { headers: userHeaders(), cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; count?: number; titles?: string[] }
        | null;
      if (res.ok && json?.ok) {
        serverCount = json.count ?? 0;
        titles = Array.isArray(json.titles) ? json.titles : [];
      }
    } catch {
      // sessiz — yerel sayıya düş.
    }
  }
  const local = localUsageCount(name);
  // Server ve yerel çoğunlukla aynı kayıtlardır; en güvenli üst sınır max.
  return { count: Math.max(serverCount, local), titles };
}

/** Yerel Protokol Haritası kayıtlarında organ adını değiştir (Türkçe-duyarsız). */
function renameOrganInLocalProtocols(oldName: string, newName: string): void {
  const list = loadProtocolsFromStorage();
  let changed = false;
  const next = list.map((p) => {
    if (!p.organs.some((o) => NORM(o) === NORM(oldName))) return p;
    changed = true;
    const seen = new Set<string>();
    const organs: string[] = [];
    for (const o of p.organs) {
      const value = NORM(o) === NORM(oldName) ? newName : o;
      const key = NORM(value);
      if (seen.has(key)) continue;
      seen.add(key);
      organs.push(value);
    }
    return { ...p, organs, updatedAt: new Date().toISOString() };
  });
  if (changed) saveProtocolsToStorage(next);
}

/**
 * Organ rename cascade: sunucudaki tüm protokoller + yerel kayıtlar güncellenir.
 * Böylece rename sonrası protokol↔atlas eşleşmesi (harita/detay/Word) bozulmaz.
 */
export async function cascadeOrganRename(
  oldName: string,
  newName: string,
): Promise<{ ok: boolean; updated: number; error?: string }> {
  renameOrganInLocalProtocols(oldName, newName);

  const isDemo = readYasamUser()?.is_demo_account === true;
  if (isDemo) return { ok: true, updated: 0 };

  try {
    const res = await fetch("/api/refleksoloji/protocols/organ", {
      method: "POST",
      headers: { ...userHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName }),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; updated?: number; error?: string }
      | null;
    if (!res.ok || !json?.ok) {
      return { ok: false, updated: 0, error: json?.error ?? "Protokoller güncellenemedi." };
    }
    return { ok: true, updated: json.updated ?? 0 };
  } catch {
    return { ok: false, updated: 0, error: "Protokoller güncellenemedi (bağlantı)." };
  }
}
