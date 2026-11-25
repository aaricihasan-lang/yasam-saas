"use client";

/**
 * D2 (05.11.2026) — Mükerrer analiz kaydı uyarısı (Bütüncül Numeroloji).
 *
 * İki kip:
 *   • "duplicate"   — Mevcut Kaydı Aç (yeni sekmede; buradaki kaydedilmemiş çalışma korunur) ·
 *                     Yine de Yeni Kaydet (ayrı, bağımsız kayıt) · Vazgeç. Çoklu eşleşmede kullanıcı kaydı seçer.
 *   • "checkFailed" — Önceki kayıtlar kontrol edilemedi (liste okunamadı / zaman aşımı): Tekrar Dene ·
 *                     Yine de Kaydet · Vazgeç. Otomatik kayıt YAPILMAZ.
 * Escape / dış tık = Vazgeç (işlem sürerken kapatılamaz). Mobil uyumlu (dikey buton yığını, kaydırılabilir liste).
 * document.body'ye PORTAL ile çizilir: kayıt düğmesi transform / backdrop-filter taşıyan premium kartların
 * içinde durduğu için `position: fixed` aksi hâlde karta göre konumlanır ve görüş alanı dışında kırpılır.
 */

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { localeTag } from "@/lib/i18n/format";
import { isActiveLocale } from "@/lib/i18n/locales";
import { recordDetailHref, type DuplicateCandidate } from "../helpers/duplicateRecord";

function fmtCreated(v: string | null | undefined, tag: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(tag, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export type DuplicateDialogMode = "duplicate" | "checkFailed";

type DialogProps = {
  open: boolean;
  mode?: DuplicateDialogMode;
  matches: DuplicateCandidate[];
  /** Kayıt sürüyor (Yine de Kaydet). */
  saving: boolean;
  /** Tekrar kontrol sürüyor (Tekrar Dene). */
  checking?: boolean;
  onSaveAnyway: () => void;
  onRetry?: () => void;
  onCancel: () => void;
};

function visible(p: DialogProps): boolean {
  if (!p.open) return false;
  return (p.mode ?? "duplicate") === "checkFailed" ? true : p.matches.length > 0;
}

/** Sayfaya bağlı (portal) diyalog — uygulamada kullanılan. */
export function DuplicateRecordDialog(props: DialogProps) {
  // Yalnız kullanıcı tıklamasıyla açılır (sunucu çiziminde open=false) → hidrasyon farkı yok.
  if (!visible(props) || typeof document === "undefined") return null;
  return createPortal(<DuplicateRecordDialogView {...props} />, document.body);
}

/** Diyalog içeriği (portal yok; statik test ve portal içi çizim için). */
export function DuplicateRecordDialogView(props: DialogProps) {
  const { open, matches, saving, onSaveAnyway, onRetry, onCancel } = props;
  const mode: DuplicateDialogMode = props.mode ?? "duplicate";
  const checking = props.checking === true;
  const busy = saving || checking;
  const titleId = useId();
  const t = useTranslations("numerology.app.duplicate");
  const locale = useLocale();
  const tag = localeTag(isActiveLocale(locale) ? locale : undefined);
  const firstRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!visible(props)) return null;
  const single = matches.length === 1;
  const failed = mode === "checkFailed";
  const btn = "flex h-11 w-full items-center justify-center rounded-2xl px-5 text-sm font-black tracking-wide shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";
  const primary = `${btn} bg-gradient-to-r from-violet-600 to-indigo-600 text-white`;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 px-3 backdrop-blur-sm sm:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      data-testid="num-duplicate-dialog"
      data-mode={mode}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl">
        <div className={`${failed ? "bg-gradient-to-r from-amber-600 to-orange-600" : "bg-gradient-to-r from-violet-600 to-indigo-700"} px-5 py-4 text-white sm:px-6 sm:py-5`}>
          <div id={titleId} className="text-base font-black sm:text-lg">
            {failed ? t("titleFailed") : t("titleDuplicate")}
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {failed ? (
            <>
              <p className="text-[15px] font-semibold leading-relaxed text-slate-700">
                {t("failedBody")}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{t("failedNote")}</p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold leading-relaxed text-slate-700">
                {single ? t("bodySingle") : t("bodyMany", { countText: String(matches.length) })}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{t("note")}</p>
              {!single ? (
                <ul className="mt-4 flex flex-col gap-2" aria-label={t("matchesAria")}>
                  {matches.map((m, i) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-2">
                      <span className="min-w-0 text-sm font-bold text-slate-800">
                        <span className="block break-words">{m.name} {m.surname}</span>
                        <span className="block text-xs font-semibold text-slate-500">{t("birth", { date: m.birth_date ?? "" })}{fmtCreated(m.created_at, tag) ? t("createdSuffix", { date: fmtCreated(m.created_at, tag) }) : ""}</span>
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
                        {t("openThis")}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  {t("singleRecord", { name: matches[0].name ?? "", surname: matches[0].surname ?? "", birth: matches[0].birth_date ?? "" })}{fmtCreated(matches[0].created_at, tag) ? ` · ${fmtCreated(matches[0].created_at, tag)}` : ""}
                </p>
              )}
            </>
          )}
          <div className="mt-5 flex flex-col gap-2.5">
            {failed ? (
              <button
                ref={(el) => { firstRef.current = el; }}
                type="button"
                onClick={onRetry}
                disabled={busy}
                className={primary}
                data-testid="num-duplicate-retry"
              >
                {checking ? t("checking") : t("retry")}
              </button>
            ) : single ? (
              <a
                ref={(el) => { firstRef.current = el; }}
                href={recordDetailHref(matches[0].id)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCancel}
                className={primary}
                data-testid="num-duplicate-open"
              >
                {t("openExisting")}
              </a>
            ) : null}
            <button type="button" onClick={onSaveAnyway} disabled={busy} className={`${btn} border border-violet-200 bg-white text-violet-800`} data-testid="num-duplicate-save">
              {saving ? t("saving") : failed ? t("saveAnyway") : t("saveNewAnyway")}
            </button>
            <button type="button" onClick={onCancel} disabled={busy} className={`${btn} border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200`} data-testid="num-duplicate-cancel">
              {t("cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
