"use client";

import { useSearchParams } from "next/navigation";
import { RegionMapLayout } from "./RegionMapLayout";

export function BolgeHaritasiClient() {
  const searchParams = useSearchParams();
  const initialOrgan = searchParams.get("organ");

  return <RegionMapLayout initialOrgan={initialOrgan} />;
}
