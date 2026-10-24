"use client";

/**
 * Hızlı Erişim Menüsü ile üst çubuktaki (AppLogoLink) menü düğmesi arasındaki küçük paylaşılan durum.
 * Kök layout'ta ikisi kardeş bileşen olduğundan sağlayıcı (context) yerine dış depo kullanılır.
 */
import { useSyncExternalStore } from "react";

type QuickNavState = {
  /** Menü bu sayfada çekmece/panel olarak açılabilir mi (oturum var + gizli adres değil). */
  available: boolean;
  /** Masaüstünde de yalnız panel olarak açılan hassas ekran mı. */
  overlay: boolean;
  drawerOpen: boolean;
};

let state: QuickNavState = { available: false, overlay: false, drawerOpen: false };
const listeners = new Set<() => void>();
const SERVER_STATE: QuickNavState = { available: false, overlay: false, drawerOpen: false };

export function setQuickNavState(patch: Partial<QuickNavState>): void {
  const next = { ...state, ...patch };
  if (next.available === state.available && next.overlay === state.overlay && next.drawerOpen === state.drawerOpen) return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useQuickNavState(): QuickNavState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}
