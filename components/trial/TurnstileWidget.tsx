"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * TRIAL7 — Cloudflare Turnstile (Free). Mod (Managed) Cloudflare panelinde site anahtarına tanımlanır;
 * istemci yalnız widget'ı açık (explicit) render eder. Belirteç tek kullanımlıktır ve YALNIZ sunucuda
 * Siteverify ile doğrulanır (app/api/register) — istemci tarafı sonuç hiçbir zaman yeterli sayılmaz.
 * Betik challenges.cloudflare.com'dan yüklenir (CSP: yalnız /register dokümanında — lib/security/campaignCsp isTurnstileDocumentPath, proxy.ts).
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("turnstile-load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export type TurnstileHandle = { reset: () => void };

type Props = {
  siteKey: string;
  onToken: (token: string | null) => void;
  /** Sunucu Siteverify'da aynı action'ı bekler (TURNSTILE_ACTION = "register"). */
  action?: string;
};

const TurnstileWidget = forwardRef<TurnstileHandle, Props>(function TurnstileWidget(
  { siteKey, onToken, action = "register" },
  ref,
) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (idRef.current && window.turnstile) window.turnstile.reset(idRef.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !boxRef.current || !window.turnstile || idRef.current) return;
        idRef.current = window.turnstile.render(boxRef.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          language: "tr",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
    };
  }, [siteKey, action]);

  return <div ref={boxRef} className="flex min-h-[65px] justify-center" />;
});

export default TurnstileWidget;
