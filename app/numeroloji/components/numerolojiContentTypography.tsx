"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ContentFontSize = "normal" | "large" | "xlarge";

export type ContentTypography = {
  body: string;
  pre: string;
  label: string;
  caption: string;
  sectionTitle: string;
  display: string;
  boxPadding: string;
  infoBoxPadding: string;
};

export function getContentTypography(size: ContentFontSize): ContentTypography {
  switch (size) {
    case "large":
      return {
        body: "text-lg leading-8",
        pre: "text-base leading-8 font-mono",
        label: "text-sm leading-7 font-black uppercase tracking-[0.14em]",
        caption: "text-base leading-7",
        sectionTitle: "text-xs leading-7 font-black uppercase tracking-[0.16em]",
        display: "text-2xl sm:text-3xl font-black tracking-tight",
        boxPadding: "p-5 sm:p-6",
        infoBoxPadding: "p-5 sm:p-7",
      };
    case "xlarge":
      return {
        body: "text-xl leading-9",
        pre: "text-lg leading-9 font-mono",
        label: "text-base leading-8 font-black uppercase tracking-[0.14em]",
        caption: "text-lg leading-8",
        sectionTitle: "text-sm leading-8 font-black uppercase tracking-[0.16em]",
        display: "text-3xl sm:text-4xl font-black tracking-tight",
        boxPadding: "p-6 sm:p-7",
        infoBoxPadding: "p-6 sm:p-8",
      };
    default:
      return {
        body: "text-base leading-7",
        pre: "text-sm leading-7 font-mono",
        label: "text-xs leading-6 font-black uppercase tracking-[0.14em]",
        caption: "text-sm leading-7",
        sectionTitle: "text-[11px] leading-6 font-black uppercase tracking-[0.16em]",
        display: "text-xl sm:text-2xl font-black tracking-tight",
        boxPadding: "p-4 sm:p-5",
        infoBoxPadding: "p-4 sm:p-6",
      };
  }
}

const ContentFontSizeContext = createContext<ContentFontSize>("normal");

export function ContentFontSizeProvider({
  size,
  children,
}: {
  size: ContentFontSize;
  children: ReactNode;
}) {
  return <ContentFontSizeContext.Provider value={size}>{children}</ContentFontSizeContext.Provider>;
}

export function useContentTypography(): ContentTypography {
  return getContentTypography(useContext(ContentFontSizeContext));
}

const fontBtnBase =
  "inline-flex min-h-[44px] min-w-[3.25rem] items-center justify-center rounded-xl border-2 px-4 py-2 text-sm font-black transition-all sm:min-h-[48px] sm:px-5 sm:text-base";

export function NumerolojiFontSizeControl({
  value,
  onChange,
}: {
  value: ContentFontSize;
  onChange: (size: ContentFontSize) => void;
}) {
  function decrease() {
    if (value === "xlarge") onChange("large");
    else if (value === "large") onChange("normal");
  }

  function increase() {
    if (value === "normal") onChange("large");
    else if (value === "large") onChange("xlarge");
  }

  const segmentOptions: { id: ContentFontSize; label: string }[] = [
    { id: "normal", label: "Normal" },
    { id: "large", label: "Büyük" },
    { id: "xlarge", label: "Çok Büyük" },
  ];

  return (
    <div
      className="flex flex-wrap items-center gap-2 sm:gap-3"
      role="group"
      aria-label="Yazı boyutu"
    >
      <span className="hidden text-sm font-bold text-slate-600 sm:inline">Yazı boyutu</span>
      <button
        type="button"
        onClick={decrease}
        disabled={value === "normal"}
        className={`${fontBtnBase} border-violet-200/90 bg-white text-violet-900 hover:border-violet-300 hover:bg-violet-50/80 disabled:cursor-not-allowed disabled:opacity-45`}
        aria-label="Yazıyı küçült"
      >
        A−
      </button>
      <div className="flex rounded-xl border-2 border-violet-200/90 bg-white/90 p-1 shadow-sm ring-1 ring-violet-100/60">
        {segmentOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-lg px-3 py-2 text-xs font-black transition sm:px-4 sm:text-sm ${
              value === opt.id
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md"
                : "text-slate-600 hover:bg-violet-50/90 hover:text-violet-900"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={increase}
        disabled={value === "xlarge"}
        className={`${fontBtnBase} border-violet-200/90 bg-white text-violet-900 hover:border-violet-300 hover:bg-violet-50/80 disabled:cursor-not-allowed disabled:opacity-45`}
        aria-label="Yazıyı büyüt"
      >
        A+
      </button>
    </div>
  );
}
