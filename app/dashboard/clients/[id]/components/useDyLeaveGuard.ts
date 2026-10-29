"use client";

import { useEffect, useRef } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";

/**
 * H-05 — Danışan Yolculuğu: kaydedilmemiş düzenleme varken UYGULAMA-İÇİ bağlantıdan ayrılma koruması.
 *
 * Yalnız Danışan Yolculuğu sekmeleri (Seanslar / Taşlar / Ödevler / Analizler) kullanır; ortak menü,
 * bildirim zili, Numeroloji bağlantısı ve page.tsx'e DOKUNULMAZ. Belge düzeyinde capture-fazı click
 * dinleyicisi aynı-origin `<a>` / Next `<Link>` tıklamalarını, React kökündeki işleyicilerden ÖNCE yakalar.
 *
 *  - TEK kayıt defteri: kaç sekmede değişiklik olursa olsun TEK dinleyici + TEK onay penceresi.
 *    Bir sekme kaydedilince diğerinin koruması sürer; hiçbirinde değişiklik yoksa hiçbir şey yakalanmaz.
 *  - Aynı sayfa (aynı yol; yalnız ?tab= / #hash farkı) yakalanmaz → sekmeler arası geçiş eski davranış.
 *  - Ctrl/Cmd/Shift/Alt, orta tuş, target≠_self, download, dış origin, mailto/tel → dokunulmaz.
 *  - "Ayrıl" → AYNI bağlantıya tıklama eşzamanlı yeniden verilir (geçiş bayrağıyla bu kez yakalanmaz):
 *    bağlantının kendi onClick'i (bildirim "görüldü", panel/menü kapanması) ve Next yönlendirmesi
 *    birebir eski sırayla çalışır. Sonsuz döngü yok: bayrak yalnız o eşzamanlı tıklama süresince açık.
 *  - Onay penceresi açıkken mousedown/touchstart belge dinleyicilerine ulaştırılmaz → "dışarı tıklama"
 *    ile kapanan paneller (bildirim zili) açık kalır, bağlantı DOM'da durur. Onay penceresi click/keydown
 *    kullandığından etkilenmez.
 *  - Bağlantı yine de DOM'dan kalkmışsa sessiz router.push YAPILMAZ: kullanıcı sayfada kalır, uyarılır.
 *  - Sekme kapatma / yenileme ayrı: mevcut `useUnsavedGuard` (beforeunload). Geri tuşu kapsam dışı (B2 yok).
 */

export type DyLeaveTexts = { title: string; message: string; confirm: string; cancel: string; linkGone: string };

const dirtySources = new Set<string>();
let mounted = 0;
let asking = false;
let passThrough = false;
let latest: { confirm: (o: { title: string; message: string; tone: "warning"; confirmText: string; cancelText: string }) => Promise<boolean>; texts: DyLeaveTexts; notify: (m: string) => void } | null = null;

/** Tıklama yakalanmalı mı? Yakalanacaksa bağlantı elemanı döner. */
function guardedAnchor(e: MouseEvent): HTMLAnchorElement | null {
  if (passThrough || dirtySources.size === 0) return null;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a) return null;
  if (a.target && a.target !== "_self") return null;
  if (a.hasAttribute("download")) return null;
  let url: URL;
  try { url = new URL(a.href, window.location.href); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname) return null; // aynı danışan sayfası → veri kaybı yok
  return a;
}

const swallowPointer = (e: Event) => { e.stopPropagation(); };

/**
 * Açık "ayrılma" onayı (aynı anda en fazla bir). `settle` TEK KEZ çalışır: engelleyicileri kaldırır,
 * `asking`'i sıfırlar; yalnız kullanıcı "Ayrıl" dediyse bağlantıyı yeniden tıklatır.
 */
let pending: { settle: (leave: boolean) => void; message: string; cancelText: string } | null = null;

/** Bizim onay penceremiz (mesajımızı taşıyan alertdialog) şu an ekranda mı? */
function ourDialog(message: string): HTMLElement | null {
  for (const d of Array.from(document.querySelectorAll<HTMLElement>('[role="alertdialog"]'))) {
    if (d.textContent?.includes(message)) return d;
  }
  return null;
}

function onClickCapture(e: MouseEvent) {
  const a = guardedAnchor(e);
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  if (asking || !latest) return;
  const { confirm, texts, notify } = latest;
  asking = true;
  window.addEventListener("mousedown", swallowPointer, true);
  window.addEventListener("touchstart", swallowPointer, true);
  let settled = false;
  let seen = false;
  let appearTimer = 0;
  let goneTimer = 0;
  let observer: MutationObserver | null = null;
  const settle = (leave: boolean) => {
    if (settled) return;
    settled = true;
    observer?.disconnect();
    window.clearTimeout(appearTimer);
    window.clearTimeout(goneTimer);
    window.removeEventListener("mousedown", swallowPointer, true);
    window.removeEventListener("touchstart", swallowPointer, true);
    asking = false;
    if (pending?.settle === settle) pending = null;
    if (!leave) return; // "Sayfada kal" → hiçbir şey olmaz; taslaklar korunur
    if (!a.isConnected) { notify(texts.linkGone); return; }
    passThrough = true;
    try { a.click(); } finally { passThrough = false; }
  };
  pending = { settle, message: texts.message, cancelText: texts.cancel };
  // H-05: ConfirmProvider açık bir onayın üzerine ikinci confirm() gelirse ilk Promise'i hiç sonuçlandırmaz.
  // Bizim pencere ekrandan Promise sonuçlanmadan kalkarsa bu "Kal" sayılır (yönlendirme YOK, taslak korunur);
  // aksi hâlde asking ve pointer engelleyicileri kalıcı olarak takılı kalırdı. Zaman aşımıyla ASLA "Ayrıl" seçilmez.
  observer = new MutationObserver(() => {
    if (ourDialog(texts.message)) { seen = true; window.clearTimeout(goneTimer); goneTimer = 0; return; }
    if (seen && !goneTimer) {
      goneTimer = window.setTimeout(() => { goneTimer = 0; if (!ourDialog(texts.message)) settle(false); }, 150);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  appearTimer = window.setTimeout(() => { if (!seen && !ourDialog(texts.message)) settle(false); }, 5000);
  void confirm({ title: texts.title, message: texts.message, tone: "warning", confirmText: texts.confirm, cancelText: texts.cancel })
    .then((leave) => settle(leave));
}

/**
 * @param source  sekmeye özgü anahtar (ör. "seanslar")
 * @param dirty   bu sekmede kaydedilmemiş düzenleme var mı
 */
export function useDyLeaveGuard(source: string, dirty: boolean, texts: DyLeaveTexts, notify: (m: string) => void): void {
  const { confirm } = useConfirm();
  const ref = useRef({ confirm, texts, notify });
  useEffect(() => {
    ref.current = { confirm, texts, notify };
    if (dirty) latest = ref.current;
  });

  useEffect(() => {
    if (mounted++ === 0) document.addEventListener("click", onClickCapture, true);
    return () => {
      dirtySources.delete(source);
      if (--mounted === 0) {
        document.removeEventListener("click", onClickCapture, true);
        latest = null;
        // H-05: onay açıkken Danışan Yolculuğu kapandı (ör. geri tuşu) → "Kal" olarak kapat: engelleyiciler
        // ve asking temizlenir, yönlendirme yapılmaz. Ekranda yalnız BİZİM pencere kaldıysa kendi "Kal"
        // düğmesiyle kapatılır (başka bir onay penceresine dokunulmaz).
        if (pending) {
          const p = pending;
          p.settle(false);
          window.setTimeout(() => {
            const btn = Array.from(ourDialog(p.message)?.querySelectorAll("button") ?? []).find((b) => b.textContent?.trim() === p.cancelText);
            btn?.click();
          }, 0);
        }
      }
    };
  }, [source]);

  useEffect(() => {
    if (dirty) {
      dirtySources.add(source);
      latest = ref.current;
    } else {
      dirtySources.delete(source);
    }
  }, [source, dirty]);
}
