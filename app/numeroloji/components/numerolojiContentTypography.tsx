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
        body: "w-full min-w-0 text-xl leading-9 font-medium text-slate-700",
        pre: "w-full min-w-0 text-xl leading-9 font-mono text-slate-700",
        label: "text-xl font-black tracking-wide text-slate-600",
        caption: "w-full min-w-0 text-xl leading-9 font-medium text-slate-700",
        sectionTitle: "text-xl font-black tracking-wide text-slate-800",
        display: "text-5xl font-black text-slate-950",
        boxPadding: "rounded-[28px] p-7",
        infoBoxPadding: "rounded-[28px] p-7",
      };
    case "xlarge":
      return {
        body: "w-full min-w-0 text-2xl leading-9 font-medium text-slate-700",
        pre: "w-full min-w-0 text-2xl leading-9 font-mono text-slate-700",
        label: "text-2xl font-black tracking-wide text-slate-600",
        caption: "w-full min-w-0 text-2xl leading-9 font-medium text-slate-700",
        sectionTitle: "text-2xl font-black tracking-wide text-slate-800",
        display: "text-6xl font-black text-slate-950",
        boxPadding: "rounded-[28px] p-7",
        infoBoxPadding: "rounded-[28px] p-7",
      };
    default:
      return {
        body: "w-full min-w-0 text-lg leading-9 font-medium text-slate-700",
        pre: "w-full min-w-0 text-lg leading-9 font-mono text-slate-700",
        label: "text-lg font-black tracking-wide text-slate-600",
        caption: "w-full min-w-0 text-lg leading-9 font-medium text-slate-700",
        sectionTitle: "text-lg font-black tracking-wide text-slate-800",
        display: "text-5xl font-black text-slate-950",
        boxPadding: "rounded-[28px] p-7",
        infoBoxPadding: "rounded-[28px] p-7",
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
  "inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-bold transition-all";

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
      className="flex flex-wrap items-center gap-1.5 rounded-xl border border-violet-200 bg-white/80 p-2 shadow-sm sm:gap-2"
      role="group"
      aria-label="Yazı boyutu"
    >
      <span className="hidden text-sm font-bold text-slate-600 sm:inline">Yazı boyutu</span>
      <button
        type="button"
        onClick={decrease}
        disabled={value === "normal"}
        className={`${fontBtnBase} border-2 border-violet-100 bg-white text-violet-900 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45`}
        aria-label="Yazıyı küçült"
      >
        A−
      </button>
      <div className="flex gap-1">
        {segmentOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${
              value === opt.id ? "bg-violet-500 text-white shadow-sm" : "text-slate-700 hover:bg-violet-50"
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
        className={`${fontBtnBase} border-2 border-violet-100 bg-white text-violet-900 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-45`}
        aria-label="Yazıyı büyüt"
      >
        A+
      </button>
    </div>
  );
}
