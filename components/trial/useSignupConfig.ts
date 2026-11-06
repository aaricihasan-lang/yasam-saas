"use client";

import { useEffect, useState } from "react";

/**
 * TRIAL7 — kayıt yapılandırması (GET /api/register): otomatik 7 günlük deneme açık mı + Turnstile site
 * anahtarı. Sunucu tek otoritedir (bayrak + anahtarlar); bilinmiyorken (yükleniyor / hata) eski
 * yönetici onaylı metinler gösterilir — yanlış "hemen başlar" vaadi verilmez.
 */
export type SignupConfig = { selfTrial: boolean; turnstileSiteKey: string | null };

let cached: Promise<SignupConfig> | null = null;

function load(): Promise<SignupConfig> {
  if (!cached) {
    cached = fetch("/api/register", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Partial<SignupConfig> | null) => ({
        selfTrial: j?.selfTrial === true,
        turnstileSiteKey: typeof j?.turnstileSiteKey === "string" ? j.turnstileSiteKey : null,
      }))
      .catch(() => {
        cached = null;
        return { selfTrial: false, turnstileSiteKey: null };
      });
  }
  return cached;
}

export function useSignupConfig(): SignupConfig | null {
  const [cfg, setCfg] = useState<SignupConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((c) => {
      if (alive) setCfg(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}
