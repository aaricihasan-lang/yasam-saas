"use client";

/**
 * D2 (05.11.2026) — Mükerrer analiz kaydı uyarısı (Bütüncül Numeroloji).
 * Seçenekler: Mevcut Kaydı Aç (yeni sekmede; buradaki kaydedilmemiş çalışma korunur) ·
 * Yine de Yeni Kaydet (ayrı, bağımsız kayıt) · Vazgeç (hiçbir şey kaydedilmez, girilen bilgiler kalır).
 * Birden fazla eşleşmede açılacak kayıt kullanıcı tarafından seçilir. Escape / dış tık = Vazgeç.
 * Mobil uyumlu (dikey buton yığını, kaydırılabilir liste).
 * document.body'ye PORTAL ile çizilir: kayıt düğmesi transform / backdrop-filter taşıyan premium kartların
 * içinde durduğu için `position: fixed` aksi hâlde karta göre konumlanır ve görüş alanı dışında kırpılır.
 */

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { recordDetailHref, type DuplicateCandidate } from "../helpers/duplicateRecord";

function fmtCreated(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type DialogProps = {
  open: boolean;
  matches: DuplicateCandidate[];
  saving: boolean;
  onSaveAnyway: () => void;
  onCancel: () => void;
};

/** Sayfaya bağlı (portal) diyalog — uygulamada kullanılan. */
export function DuplicateRecordDialog(props: DialogProps) {
  // Yalnız kullanıcı tıklamasıyla açılır (sunucu çiziminde open=false) → hidrasyon farkı yok.
  if (!props.open || props.matches.length === 0 || typeof document === "undefined") return null;
  return createPortal(<DuplicateRecordDialogView {...props} />, document.body);
}

/** Diyalog içeriği (portal yok; statik test ve portal içi çizim için). */
export function DuplicateRecordDialogView({
  open,
  matches,
  saving,
  onSaveAnyway,
  onCancel,
}: DialogProps) {
  const titleId = useId();
  const firstRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, saving, onCancel]);

  if (!open || matches.length === 0) return null;
  const single = matches.length === 1;
  const btn = "flex h-11 w-full items-center justify-center rounded-2xl px-5 text-sm font-black tracking-wide shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-3 backdrop-blur-sm sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
      data-testid="num-duplicate-dialog"
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-4 text-white sm:px-6 sm:py-5">
          <div id={titleId} className="text-base font-black sm:text-lg">Bu kişi için kayıtlı analiz var</div>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-[15px] font-semibold leading-relaxed text-slate-700">
            Bu isim, soyisim ve doğum tarihiyle daha önce kaydedilmiş {single ? "bir analiziniz" : `${matches.length} analiziniz`} bulunuyor. Mevcut kaydı açmak mı, yoksa yeni bir analiz kaydetmek mi istersiniz?
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-500">Mevcut kayıt yeni sekmede açılır; bu sayfadaki çalışmanız kaybolmaz. Eski kayıt değiştirilmez.</p>
          {!single ? (
            <ul className="mt-4 flex flex-col gap-2" aria-label="Eşleşen kayıtlar">
              {matches.map((m, i) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-2">
                  <span className="min-w-0 text-sm font-bold text-slate-800">
                    <span className="block break-words">{m.name} {m.surname}</span>
                    <span className="block text-xs font-semibold text-slate-500">Doğum {m.birth_date}{fmtCreated(m.created_at) ? ` · Kayıt ${fmtCreated(m.created_at)}` : ""}</span>
                  </span>
                  <a
                    ref={i === 0 ? (el) => { firstRef.current = el; } : undefined}
                    href={recordDetailHref(m.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onCancel}
                    className="shrink-0 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-black text-white"
                    data-testid="num-duplicate-open"
                  >
                    Bu Kaydı Aç
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Kayıt: {matches[0].name} {matches[0].surname} · Doğum {matches[0].birth_date}{fmtCreated(matches[0].created_at) ? ` · ${fmtCreated(matches[0].created_at)}` : ""}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2.5">
            {single ? (
              <a
                ref={(el) => { firstRef.current = el; }}
                href={recordDetailHref(matches[0].id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCancel}
                className={`${btn} bg-gradient-to-r from-violet-600 to-indigo-600 text-white`}
                data-testid="num-duplicate-open"
              >
                Mevcut Kaydı Aç
              </a>
            ) : null}
            <button type="button" onClick={onSaveAnyway} disabled={saving} className={`${btn} border border-violet-200 bg-white text-violet-800`} data-testid="num-duplicate-save">
              {saving ? "Kaydediliyor…" : "Yine de Yeni Kaydet"}
            </button>
            <button type="button" onClick={onCancel} disabled={saving} className={`${btn} border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200`} data-testid="num-duplicate-cancel">
              Vazgeç
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
