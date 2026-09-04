"use client";
/**
 * Plan editörü — bağlı danışanın kaçınılan besin id'leri (FAZ 7 §17).
 * Provider değeri sayfada tutulur (PlanClientContext tek fetch'ten besler);
 * derin item satırları prop-drilling olmadan okur. Non-blocking advisory içindir.
 */
import { createContext, useContext } from "react";

const AvoidedFoodIdsContext = createContext<ReadonlySet<string>>(new Set());

export function AvoidedFoodIdsProvider({
  value,
  children,
}: {
  value: ReadonlySet<string>;
  children: React.ReactNode;
}) {
  return <AvoidedFoodIdsContext.Provider value={value}>{children}</AvoidedFoodIdsContext.Provider>;
}

export function useAvoidedFoodIds(): ReadonlySet<string> {
  return useContext(AvoidedFoodIdsContext);
}
