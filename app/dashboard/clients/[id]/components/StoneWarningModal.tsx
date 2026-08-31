"use client";

import { useTranslations } from "next-intl";
import type { StoneWarningResult } from "@/lib/stones/stoneWarningService";

type Props = {
  warnings: StoneWarningResult[];
  onConfirm: () => void;
  onCancel: () => void;
};

export default function StoneWarningModal({ warnings, onConfirm, onCancel }: Props) {
  const t = useTranslations("clients.stones.warningModal");
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(6px)" }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl"
        style={{ maxHeight: "82vh" }}
      >
        {/* Başlık */}
        <div className="flex gap-3 border-b border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 px-5 py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl shadow-sm"
            style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "white" }}
          >
            ⚠️
          </div>
          <div>
            <span className="mb-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
              {t("badge")}
            </span>
            <h2 className="text-[17px] font-black leading-tight text-slate-900">
              {t("title")}
            </h2>
            <p className="mt-1 text-xs leading-snug text-slate-500">
              {t("subtitle")}
            </p>
          </div>
        </div>

        {/* Uyarı listesi */}
        <div className="flex flex-col gap-3 overflow-y-auto p-5">
          {warnings.map((w) => (
            <div
              key={w.stoneName}
              className="rounded-2xl border border-orange-200 p-4"
              style={{ background: "linear-gradient(135deg, #fff7ed, #fffbeb)" }}
            >
              {/* Taş adı */}
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-900">
                <span>💎</span>
                <span>{w.stoneName}</span>
              </div>

              {/* Uyarı etiketleri */}
              {w.warningTags && w.warningTags.length > 0 && (
                <div className={w.warningText ? "mb-3" : ""}>
                  <div className="mb-1.5 text-[11px] font-black text-amber-700">
                    {t("tagsLabel")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {w.warningTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Uyarı metni */}
              {w.warningText && (
                <div>
                  <div className="mb-1.5 text-[11px] font-black text-amber-700">
                    {t("textLabel")}
                  </div>
                  <p className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs leading-relaxed text-orange-950">
                    {w.warningText}
                  </p>
                </div>
              )}

              {/* Doğaltaş detay linki */}
              <div className="mt-3 border-t border-orange-100 pt-3">
                <a
                  href={`/dogaltas/dogaltas-listesi/${w.stoneId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-black text-amber-800 transition hover:bg-amber-100"
                >
                  <span>🔗</span>
                  <span>{t("openRecord")}</span>
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Aksiyon butonları */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="btn-soft"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary"
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
