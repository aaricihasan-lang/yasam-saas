"use client";

/**
 * USAGE360 — MERKEZÎ KULLANIM İZLEYİCİ (root layout; tek örnek).
 *
 * `enabled=false` (USAGE360_ENABLED kapalı — varsayılan) → hiçbir dinleyici/zamanlayıcı/ağ isteği YOK.
 *
 * Toplanan tek istemci durumu bellekteki `lastInteractionAt` zaman damgasıdır: pointerdown /
 * keydown / touchstart / wheel / scroll olayının İÇERİĞİ (tuş, koordinat, kaydırma konumu)
 * okunmaz ve gönderilmez. Pathname gönderilmez; yalnız allowlist modül anahtarı gider.
 *
 * Ping kuralı (lib/usage/activeTime.ts shouldSendPing): görünür ∧ son 5 dk etkileşim ∧
 * son ping ≥ 60 sn. Gizli sekme veya etkileşimsizlik → ping durur. Modül değişince tek
 * `module_opened` sinyali (sunucu aynı ziyarette tekrar saymaz). Tüm hatalar yutulur.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { shouldSendPing, VISIT_GAP_SECONDS } from "@/lib/usage/activeTime";
import { resolveUsageModuleFromPath } from "@/lib/usage/usageRouteModules";
import type { ModuleGateKey } from "@/lib/auth/moduleAccess";

const BEACON_URL = "/api/usage/beacon";
const TICK_MS = 15_000;
const INTERACTION_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"] as const;

type BeaconBody = { kind: "ping"; module?: ModuleGateKey } | { kind: "module_opened"; module: ModuleGateKey };

function sendBeacon(body: BeaconBody): void {
  const user = readYasamUser();
  const token = readSessionToken();
  // Uzman değilse / demo / oturumsuz → gönderme (sunucu da ayrıca no-op yapar).
  if (!user || !token || user.role !== "expert" || user.is_demo_account === true) return;
  void fetch(BEACON_URL, {
    method: "POST",
    keepalive: true,
    cache: "no-store",
    headers: { "content-type": "application/json", "x-user-id": user.id, "x-session-token": token },
    body: JSON.stringify(body),
  }).catch(() => {
    /* telemetri hatası kullanıcıyı etkilemez */
  });
}

export default function UsageTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const moduleRef = useRef<ModuleGateKey | null>(null);
  const lastInteractionRef = useRef<number | null>(null);
  const lastPingRef = useRef<number | null>(null);

  // Aktif modül + modül açılışı sinyali (yalnız anahtar; ham yol gönderilmez).
  useEffect(() => {
    if (!enabled) return;
    const next = resolveUsageModuleFromPath(pathname);
    const prev = moduleRef.current;
    moduleRef.current = next;
    if (next && next !== prev) {
      sendBeacon({ kind: "module_opened", module: next });
      // Sunucu modül geçişinde ping tabanını sıfırlar; istemci de aynı şekilde sayar.
      lastPingRef.current = Date.now();
    }
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled) return;

    const tryPing = () => {
      const now = Date.now();
      if (
        !shouldSendPing({
          visible: document.visibilityState === "visible",
          nowMs: now,
          lastInteractionMs: lastInteractionRef.current,
          lastPingMs: lastPingRef.current,
        })
      ) {
        return;
      }
      // 30 dk+ aradan sonra aynı modül sayfasında devam: sunucu yeni ziyaret açar; modül
      // girişinin o ziyarette de sayılması için ping yerine module_opened gönderilir.
      const resumed = lastPingRef.current == null || now - lastPingRef.current >= VISIT_GAP_SECONDS * 1000;
      lastPingRef.current = now;
      const mod = moduleRef.current;
      if (mod && resumed) sendBeacon({ kind: "module_opened", module: mod });
      else sendBeacon(mod ? { kind: "ping", module: mod } : { kind: "ping" });
    };

    const onInteraction = () => {
      lastInteractionRef.current = Date.now();
      tryPing();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") tryPing();
    };

    for (const ev of INTERACTION_EVENTS) {
      window.addEventListener(ev, onInteraction, { passive: true, capture: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    const tick = window.setInterval(tryPing, TICK_MS);

    return () => {
      for (const ev of INTERACTION_EVENTS) {
        window.removeEventListener(ev, onInteraction, { capture: true });
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(tick);
    };
  }, [enabled]);

  return null;
}
