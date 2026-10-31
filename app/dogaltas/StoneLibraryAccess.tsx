"use client";

/**
 * Doğaltaş Kütüphanesi erişimi — sunucuda (app/dogaltas/layout.tsx, ilk çizim) verilen kararı istemci bileşenlerine taşır.
 * Varsayılan false (fail-closed). Yetki kararı burada VERİLMEZ; yalnız sunucudan gelen değer okunur.
 */
import { createContext, useContext, type ReactNode } from "react";

const StoneLibraryAccessContext = createContext(false);

export function StoneLibraryAccessProvider({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return <StoneLibraryAccessContext.Provider value={allowed}>{children}</StoneLibraryAccessContext.Provider>;
}

export const useStoneLibraryAccess = (): boolean => useContext(StoneLibraryAccessContext);
