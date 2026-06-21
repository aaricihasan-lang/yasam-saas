"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { getRegionsForOrgan, loadAtlas } from "@/lib/atlasStorage";
import type { Region } from "@/app/refleksoloji/bolge-haritasi/types";
import {
  footSideLabel,
  regionCoordSummary,
  shapeLabel,
  viewLabel,
} from "../lib/organSummary";

type AtlasEditModalProps = {
  open: boolean;
  organName: string;
  onClose: () => void;
  onRename: (oldName: string, newName: string) => { ok: boolean; error?: string };
  onDeleteRegion: (organ: string, regionId: string) => boolean;
};

export function AtlasEditModal({
  open,
  organName,
  onClose,
  onRename,
  onDeleteRegion,
}: AtlasEditModalProps) {
  const { confirm } = useConfirm();
  const [mounted, setMounted] = useState(false);
  const [nameDraft, setNameDraft] = useState(organName);
  const [regions, setRegions] = useState<Region[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [noRegionsWarning, setNoRegionsWarning] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setNameDraft(organName);
    setSaveError(null);
    setNoRegionsWarning(false);
    try {
      setRegions(getRegionsForOrgan(loadAtlas(), organName));
    } catch {
      setRegions([]);
    }
  }, [open, organName]);

  // Focus restore: kayıt açılmadan önce odaklanan elementi yakala
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    return () => {
      previousFocus?.focus();
    };
  }, [open]);

  // İlk odak: name input
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [open]);

  // Escape + Tab trap
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const handleSaveName = () => {
    const result = onRename(organName, nameDraft);
    if (!result.ok) {
      setSaveError(result.error ?? "Kaydedilemedi.");
      return;
    }
    setSaveError(null);
    onClose();
  };

  const handleDeleteRegion = async (regionId: string) => {
    const ok = await confirm({
      message: "Bu bölge silinsin mi? Bu işlem geri alınamaz.",
      confirmText: "Bölgeyi Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!ok) return;

    const deleted = onDeleteRegion(organName, regionId);
    if (!deleted) return;
    const next = regions.filter((r) => r.id !== regionId);
    setRegions(next);
    if (next.length === 0) {
      setNoRegionsWarning(true);
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/45 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="atlas-edit-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="flex max-h-[calc(100vh-64px)] w-[min(920px,calc(100vw-32px))] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-violet-700">
              Atlas Düzenle
            </p>
            <h2 id="atlas-edit-title" className="mt-1 text-2xl font-black text-slate-900">
              {organName}
            </h2>
            <p className="mt-1 text-base font-medium text-slate-500">
              Organ adını güncelleyin veya kayıtlı bölgeleri silin. Koordinat düzenleme Bölge
              Haritası&apos;nda yapılır.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
          >
            Kapat
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <div>
            <label
              htmlFor="atlas-organ-name"
              className="mb-2 block text-sm font-bold uppercase tracking-wide text-violet-900"
            >
              Organ Adı
            </label>
            <input
              id="atlas-organ-name"
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="w-full rounded-xl border border-violet-200/90 bg-white px-4 py-3 text-base font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {noRegionsWarning ? (
            <p className="rounded-xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-base font-semibold text-amber-950">
              Bu organın kayıtlı bölgesi kalmadı.
            </p>
          ) : null}

          <div>
            <h3 className="text-lg font-bold text-violet-900">Kayıtlı Bölgeler</h3>
            {regions.length === 0 ? (
              <p className="mt-2 text-base font-medium text-slate-500">
                Kayıtlı bölge yok. Yeni bölge eklemek için{" "}
                <Link href="/refleksoloji/bolge-haritasi" className="font-bold text-violet-700 underline">
                  Bölge Haritası
                </Link>
                &apos;nı kullanın.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {regions.map((region) => (
                  <li
                    key={region.id}
                    className="rounded-xl border border-violet-100/90 bg-violet-50/40 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-900">
                          {shapeLabel(region.shape)} · {viewLabel(region.view)} ·{" "}
                          {footSideLabel(region.footSide)}
                        </p>
                        <p className="mt-1 font-mono text-sm font-medium text-slate-600">
                          {regionCoordSummary(region)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteRegion(region.id)}
                        className="shrink-0 rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-100"
                      >
                        Bölge Sil
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {saveError ? (
            <p className="rounded-xl border border-rose-300/80 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
              {saveError}
            </p>
          ) : null}
        </div>

        <footer className="mt-5 flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
          <Link
            href="/refleksoloji/bolge-haritasi"
            className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-900 transition hover:bg-violet-100"
          >
            Bölge Haritasına Git
          </Link>
          <button
            type="button"
            onClick={handleSaveName}
            className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-md transition hover:bg-emerald-700"
          >
            Organ Adını Kaydet
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
