"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { resolveGuardedLinkTarget, SIFA_LEAVE_CONFIRM } from "@/lib/sifa-rehberi/leaveGuard";

/**
 * Şifa Rehberi — UYGULAMA-İÇİ link navigasyonu için kaydedilmemiş-değişiklik koruması (SIFA-2).
 *
 * Kapsam: global logo (`AppLogoLink`) dahil TÜM aynı-origin `<a>` / Next `<Link>` tıklamaları.
 * Belge seviyesinde CAPTURE-phase dinleyici → React kökündeki Next Link onClick'inden ÖNCE
 * çalışır; dirty iken tıklamayı durdurur ve uygulama-içi onay penceresi (ConfirmProvider) açar:
 *   - "Sayfada kal"        → hiçbir şey olmaz (taslak korunur).
 *   - "Kaydetmeden ayrıl"  → `onDiscard` (varsa) çağrılır, sonra `router.push(hedef)`.
 * Karar mantığı SAF: `lib/sifa-rehberi/leaveGuard.ts#resolveGuardedLinkTarget`.
 *
 * Diğer yollar MEVCUT hook'larla kalır (davranışları DEĞİŞMEDİ):
 *   - yenileme/sekme kapatma → `useUnsavedGuard` (beforeunload)
 *   - tarayıcı geri/ileri    → `useBackNavigationGuard` (popstate)
 * Modül-yerel: paylaşılan hook/AppLogoLink'e DOKUNULMAZ → diğer modüllerin davranışı aynı.
 * dirty=false iken hiçbir uyarı çıkmaz.
 */
export function useSifaLinkLeaveGuard(dirty: boolean, onDiscard?: () => void): void {
  const router = useRouter();
  const { confirm } = useConfirm();
  const dirtyRef = useRef(dirty);
  const confirmRef = useRef(confirm);
  const onDiscardRef = useRef(onDiscard);
  const leavingRef = useRef(false);
  const askingRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
    confirmRef.current = confirm;
    onDiscardRef.current = onDiscard;
    // Kaydedildi / vazgeçildi / aynı sayfada başka görünüme geçildi → kilit serbest.
    if (!dirty) leavingRef.current = false;
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const target = resolveGuardedLinkTarget({
        dirty: dirtyRef.current,
        leaving: leavingRef.current,
        defaultPrevented: e.defaultPrevented,
        button: e.button,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        anchor: a ? { href: a.href, target: a.target, download: a.hasAttribute("download") } : null,
        currentHref: window.location.href,
      });
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      if (askingRef.current) return;
      askingRef.current = true;
      void confirmRef.current({ ...SIFA_LEAVE_CONFIRM }).then((ok) => {
        askingRef.current = false;
        if (!ok) return;
        leavingRef.current = true;
        onDiscardRef.current?.();
        router.push(target);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);
}
