"use client";

/**
 * 2026-10-16 — MÜKERRER DANIŞAN HATIRLATMASI. Sunucu (409 DUPLICATE_PROFILE) yalnız bu uzmanın kayıtlarında KESİN eşleşme
 * bulduğunda açılır; profil henüz YAZILMAMIŞTIR ve hiçbir hesaplama başlatılmamıştır. Üç seçenek:
 *   1) Mevcut danışana geç — yeni profil oluşturulmaz, kayıtlı analizler yeniden hesaplanmaz (Danışan Dosyası açılır).
 *   2) Farklı kişi olarak devam et — açık onayla ayrı profil yazılır (kayıtlar/analizler/notlar karışmaz).
 *   3) İptal et — hiçbir kayda dokunulmaz.
 */

import { createPortal } from "react-dom";
import { TIME_ACCURACY_LABELS, type TimeAccuracy } from "@/lib/astrology/birth/profileInput";

export type DuplicateProfile = {
  profileId: string;
  label: string;
  clientName: string | null;
  birthDate: string;
  birthTime: string | null;
  timeKnown: boolean;
  timeAccuracy: string;
  locationLabel: string;
  archived: boolean;
  analysisCount: number;
  partnerAnalysisCount: number;
};

const dateTr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);

export default function DuplicateProfileDialog({
  mode,
  items,
  busy,
  onOpen,
  onContinue,
  onCancel,
}: {
  mode: "create" | "revise";
  items: DuplicateProfile[];
  busy: boolean;
  onOpen: ((profileId: string) => void) | null;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const single = items.length === 1;
  // Portal: üst kapsayıcıların overflow / backdrop-filter / transform'u konumu bozmasın (mobil dahil).
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#050816]/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="astro-dup-title"
      data-testid="astro-duplicate-dialog"
    >
      <div className="flex max-h-[90svh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 sm:px-5">
          <h3 id="astro-dup-title" className="text-base font-semibold text-amber-950">
            Bu doğum bilgileriyle kayıtlı {single ? "bir danışan" : `${items.length} danışan`} bulundu.
          </h3>
          <p className="mt-1 text-xs text-amber-900">
            {mode === "create"
              ? "Aynı kişinin daha önce analizi yapılmış olabilir. Yeni profil henüz oluşturulmadı ve hiçbir hesaplama başlatılmadı."
              : "Bu düzenleme, başka bir kayıtlı danışanla aynı doğum bilgilerini oluşturuyor. Değişiklik henüz kaydedilmedi."}
          </p>
        </div>
        <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto px-4 py-3 sm:px-5" data-testid="astro-duplicate-list">
          {items.map((d) => (
            <li key={d.profileId} className="rounded-xl border border-slate-200 p-3 text-sm" data-testid="astro-duplicate-item">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{d.label}</span>
                {d.archived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Arşivde</span>}
              </div>
              {d.clientName && <div className="text-xs text-slate-500">Danışan Yolculuğu: {d.clientName}</div>}
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs text-slate-700">
                <dt className="text-slate-500">Doğum tarihi</dt>
                <dd>{dateTr(d.birthDate)}</dd>
                <dt className="text-slate-500">Doğum saati</dt>
                <dd>
                  {d.timeKnown && d.birthTime ? d.birthTime.slice(0, 5) : "Bilinmiyor"}
                  {d.timeKnown ? ` · ${TIME_ACCURACY_LABELS[d.timeAccuracy as TimeAccuracy] ?? d.timeAccuracy}` : ""}
                </dd>
                <dt className="text-slate-500">Doğum yeri</dt>
                <dd className="[overflow-wrap:anywhere]">{d.locationLabel}</dd>
                <dt className="text-slate-500">Kayıtlı analiz</dt>
                <dd data-testid="astro-duplicate-count">
                  {d.analysisCount}
                  {d.partnerAnalysisCount > 0 ? ` · ayrıca ${d.partnerAnalysisCount} ortak analizde 2. kişi` : ""}
                </dd>
              </dl>
              {onOpen && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onOpen(d.profileId)}
                  className="mt-2 inline-flex min-h-[40px] w-full items-center justify-center rounded-lg bg-[#0b1430] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1a2b5c] disabled:opacity-60 sm:w-auto"
                  data-testid="astro-duplicate-open"
                >
                  Mevcut danışana geç
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button type="button" disabled={busy} onClick={onCancel} className="min-h-[40px] rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-60" data-testid="astro-duplicate-cancel">
            İptal et
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onContinue}
            className="min-h-[40px] rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60"
            data-testid="astro-duplicate-continue"
          >
            {busy ? "Kaydediliyor…" : mode === "create" ? "Farklı kişi olarak devam et" : "Farklı kişi — yine de kaydet"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
