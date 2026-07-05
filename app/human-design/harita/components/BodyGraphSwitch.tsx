"use client";

// V2-5A → V3-0 — BodyGraph feature-flag switch (A/B/C geçiş).
//
// Varsayılan V1 (eski BodyGraph) → canlı davranış DEĞİŞMEZ; hiçbir kullanıcı otomatik V2/V3 görmez.
// A/B/C: URL query param  ?bg=v1 (eski) · ?bg=v2 (Premium V2) · ?bg=v3 (Premium V3, skeleton-driven).
//
// Not: useSearchParams KULLANILMIYOR (Suspense/versiyon riskini atlamak için); query param
// window.location'dan useEffect içinde okunur → SSR/ilk render = DEFAULT (v1), hydration mismatch YOK.

import { useEffect, useState } from "react";
import { BodyGraph } from "./BodyGraph";
import { PremiumBodyGraph } from "./premium";
import { PremiumBodyGraphV3 } from "./premium-v3";
import type { HdChartResult } from "@/lib/human-design/engine/contract";

type BgVersion = "v1" | "v2" | "v3";
const DEFAULT_VERSION: BgVersion = "v1";

export function BodyGraphSwitch({ result }: { result: HdChartResult }) {
  const [version, setVersion] = useState<BgVersion>(DEFAULT_VERSION);

  useEffect(() => {
    const bg = new URLSearchParams(window.location.search).get("bg");
    if (bg === "v1" || bg === "v2" || bg === "v3") setVersion(bg);
  }, []);

  if (version === "v3") return <PremiumBodyGraphV3 result={result} />;
  if (version === "v2") return <PremiumBodyGraph result={result} />;
  return <BodyGraph result={result} />;
}
