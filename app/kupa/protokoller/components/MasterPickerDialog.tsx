"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { kupaBtnGhost, kupaInput } from "@/app/kupa/components/KupaShell";
import { QuickCreateMasterForm, type QuickCreateConfig } from "./QuickCreateMasterForm";

export type PickerItem = { id: string; label: string; meta?: string };

/**
 * Master library seçici (point / technique / safety için ortak).
 *
 * KRİTİK (mobil tam-ekran): overlay `document.body`'ye PORTAL edilir. Aksi halde
 * `fixed inset-0`, `backdrop-filter` içeren bir ata (protokol bölüm kartı `kupaEdgeCard`)
 * tarafından o kutuya HAPSOLUR → <1024px'te picker viewport yerine bölüm kartını doldurur.
 * (BigNoteEditorDialog ile aynı çözülen problem sınıfı.)
 *
 * QUICK-CREATE (FAZ 3A): yalnız `quickCreate` prop'u VERİLDİĞİNDE (technique/safety) tek
 * surface içinde `pick ⇄ create` mode. Nested modal YOK. Nokta picker `quickCreate` ALMAZ
 * → "+ Yeni Bölge Oluştur" CTA'sı ASLA görünmez (40 canonical point korunur).
 */
export function MasterPickerDialog({
  open,
  title,
  items,
  selectedIds,
  emptyMessage,
  onPick,
  onClose,
  quickCreate,
}: {
  open: boolean;
  title: string;
  items: PickerItem[];
  selectedIds: string[];
  emptyMessage: string;
  onPick: (id: string) => void;
  onClose: () => void;
  quickCreate?: QuickCreateConfig;
}) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const searchRef = useRef<HTMLInputElement>(null);

  // Açılışta daima PICK view + arama sıfır + odak (deferred → cascading-render lint yok).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setQ("");
      setMode("pick");
      searchRef.current?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // create view'da Escape → picker'a dön; pick view'da → tüm picker'ı kapat.
      setMode((m) => {
        if (m === "create") return "pick";
        onClose();
        return m;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Açıkken alttaki belge scroll'unu kilitle (tam-ekran kontratı; BigNoteEditorDialog deseni).
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    if (!needle) return items;
    return items.filter(
      (it) =>
        it.label.toLocaleLowerCase("tr").includes(needle) ||
        (it.meta ? it.meta.toLocaleLowerCase("tr").includes(needle) : false),
    );
  }, [items, q]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const selected = new Set(selectedIds);
  const createCtaLabel =
    quickCreate?.entity === "technique"
      ? "+ Yeni Teknik Oluştur"
      : quickCreate?.entity === "safety"
        ? "+ Yeni Güvenlik Maddesi Oluştur"
        : null;
  const createTitle =
    quickCreate?.entity === "technique"
      ? "Yeni Teknik Oluştur"
      : "Yeni Güvenlik Maddesi Oluştur";

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-0 lg:items-center lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? createTitle : title}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl lg:h-[70vh] lg:max-w-lg lg:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          {mode === "create" ? (
            <button
              type="button"
              onClick={() => setMode("pick")}
              className="truncate text-sm font-black tracking-tight text-slate-800 hover:text-amber-700"
              aria-label="Listeye dön"
            >
              ‹ {createTitle}
            </button>
          ) : (
            <h3 className="truncate text-sm font-black tracking-tight text-slate-800">{title}</h3>
          )}
          <button type="button" onClick={onClose} className={kupaBtnGhost} aria-label="Kapat">
            Kapat
          </button>
        </div>

        {mode === "create" && quickCreate ? (
          <QuickCreateMasterForm
            config={quickCreate}
            onCancel={() => setMode("pick")}
            onSuccess={() => setMode("pick")}
          />
        ) : (
          <>
            <div className="border-b border-slate-100 p-3">
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ara…"
                className={kupaInput}
                aria-label="Ara"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {items.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
              ) : filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-slate-500">Aramanızla eşleşen kayıt bulunamadı.</p>
              ) : (
                <ul className="space-y-1.5">
                  {filtered.map((it) => {
                    const isSel = selected.has(it.id);
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          disabled={isSel}
                          onClick={() => onPick(it.id)}
                          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:opacity-60"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-800">{it.label}</span>
                            {it.meta ? <span className="block truncate text-[11px] text-slate-400">{it.meta}</span> : null}
                          </span>
                          <span className="shrink-0 text-[11px] font-semibold text-slate-400">
                            {isSel ? "Ekli" : "Ekle"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {/* Quick-create CTA — YALNIZ quickCreate verildiğinde (technique/safety). Nokta'da YOK. */}
            {quickCreate && createCtaLabel ? (
              <div className="border-t border-slate-100 p-3">
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2.5 text-sm font-bold text-amber-800 transition hover:border-amber-400 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  {createCtaLabel}
                </button>
                <p className="mt-1.5 text-center text-[11px] text-slate-400">Aradığınız kayıt yoksa yenisini oluşturun.</p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
