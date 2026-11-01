"use client";
/**
 * Gece operasyonu — ücretli analiz formunda bot doğrulaması (Cloudflare Turnstile, açık oluşturma).
 * Betik yalnız bu bileşen görünürken yüklenir; belirteç TEK KULLANIMLIKTIR → her gönderimden sonra reset() çağrılır.
 * Sunucu belirteci siteverify ile doğrular (lib/campaign/visitor/botCheck); istemcideki belirteç tek başına yetki vermez.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type BotCheckHandle = { reset: () => void };

export const BotCheck = forwardRef<BotCheckHandle, { siteKey: string; action: string; onToken: (t: string | null) => void }>(function BotCheck({ siteKey, action, onToken }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    reset() {
      cb.current(null);
      if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
    },
  }));

  useEffect(() => {
    let alive = true;
    loadTurnstile()
      .then((t) => {
        if (!alive || !box.current) return;
        widget.current = t.render(box.current, {
          sitekey: siteKey,
          action,
          language: "tr",
          theme: "auto",
          size: "flexible",
          callback: (token: string) => cb.current(token),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, action]);

  return (
    <div className="vzBot">
      <div ref={box} data-bot-check="turnstile" />
      {failed && <p className="vzErr" role="alert">Güvenlik doğrulaması yüklenemedi. Sayfayı yenileyip tekrar deneyin.</p>}
    </div>
  );
});
