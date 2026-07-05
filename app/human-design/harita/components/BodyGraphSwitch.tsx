"use client";

// V2-5A — BodyGraph feature-flag switch (A/B geçiş).
//
// Varsayılan V1 (eski BodyGraph) → canlı davranış DEĞİŞMEZ; hiçbir kullanıcı otomatik V2 görmez.
// A/B: URL query param  ?bg=v2  → PremiumBodyGraph V2  ·  ?bg=v1 → eski.
// V2-5B'de (live QA onayı sonrası) DEFAULT_VERSION "v2"ye çevrilecek (canlı geçiş).
//
// Not: useSearchParams KULLANILMIYOR (Suspense/versiyon riskini atlamak için); query param
// window.location'dan useEffect içinde okunur → SSR/ilk render = DEFAULT (v1), hydration mismatch YOK.

import { useEffect, useState } from "react";
import { BodyGraph } from "./BodyGraph";
import { PremiumBodyGraph } from "./premium";
import type { HdChartResult } from "@/lib/human-design/engine/contract";

const DEFAULT_VERSION: "v1" | "v2" = "v1";

export function BodyGraphSwitch({ result }: { result: HdChartResult }) {
  const [version, setVersion] = useState<"v1" | "v2">(DEFAULT_VERSION);

  useEffect(() => {
    const bg = new URLSearchParams(window.location.search).get("bg");
    if (bg === "v2" || bg === "v1") setVersion(bg);
  }, []);

  return version === "v2" ? (
    <PremiumBodyGraph result={result} />
  ) : (
    <BodyGraph result={result} />
  );
}
