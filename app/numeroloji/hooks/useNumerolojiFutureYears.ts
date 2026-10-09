"use client";

// Numeroloji "Gelecek Yılları Göster" alt-yetkisi — SUNUCU kararını okuyan istemci store'u.
//
//   • Kaynak: GET /api/numeroloji/entitlements (oturum + numerology modülü + doğrulanmış profil).
//     localStorage'daki izin haritası KULLANILMAZ → istemci tarafı değer oynaması yetki açmaz.
//   • Fail-closed: yanıt gelene kadar, hata/ağ sorunu/401/403'te değer FALSE (önceki davranış).
//   • Kullanıcı başına önbellek (x-user-id değişirse sıfırlanır) + 60 sn tazelik: admin yetkiyi
//     kapattığında açık sekme odak/görünürlük dönüşünde veya yeni sayfada yeniden doğrular.
//   • Tüm bileşenler tek isteği paylaşır (in-flight dedupe); polling YOK.

import { useSyncExternalStore } from "react";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { numApi } from "../helpers/numApiClient";

const STALE_MS = 60_000;

type State = { userId: string; value: boolean; fetchedAt: number };
let state: State = { userId: "", value: false, fetchedAt: 0 };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function currentUserId(): string {
  try {
    return readYasamUser()?.id ?? "";
  } catch {
    return "";
  }
}

function refresh(force = false): void {
  const uid = currentUserId();
  if (uid !== state.userId) {
    // Farklı kullanıcı → önceki kullanıcının yetkisi ASLA taşınmaz.
    const changed = state.value;
    state = { userId: uid, value: false, fetchedAt: 0 };
    if (changed) emit();
  }
  if (!uid) return;
  if (inflight) return;
  if (!force && state.fetchedAt && Date.now() - state.fetchedAt < STALE_MS) return;
  inflight = numApi("/api/numeroloji/entitlements", { cache: "no-store" })
    .then((r) => {
      if (currentUserId() !== uid) return; // yanıt beklerken kullanıcı değişti → yok say
      const next = r.ok && r.json.futureYears === true;
      const prev = state.value;
      state = { userId: uid, value: next, fetchedAt: Date.now() };
      if (prev !== next) emit();
    })
    .catch(() => {
      // fail-closed: değer değiştirilmez (ilk yüklemede zaten false).
    })
    .finally(() => {
      inflight = null;
    });
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  refresh();
  const recheck = () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") refresh();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", recheck);
  if (typeof window !== "undefined") window.addEventListener("focus", recheck);
  return () => {
    listeners.delete(onStoreChange);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", recheck);
    if (typeof window !== "undefined") window.removeEventListener("focus", recheck);
  };
}

const getSnapshot = () => (state.userId === currentUserId() ? state.value : false);
const getServerSnapshot = () => false;

/** Sunucuda doğrulanmış "Gelecek Yılları Göster" yetkisi (bilinmiyorsa false). */
export function useNumerolojiFutureYears(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
