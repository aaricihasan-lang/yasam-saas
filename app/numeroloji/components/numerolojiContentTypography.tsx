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
        body: "w-full min-w-0 text-base leading-6 font-medium text-slate-700",
        pre: "w-full min-w-0 text-sm leading-5 font-mono text-slate-700",
        label: "text-sm font-black tracking-wide text-slate-600",
        caption: "w-full min-w-0 text-sm leading-5 font-medium text-slate-700",
        sectionTitle: "text-base font-black tracking-wide text-slate-800",
        display: "text-5xl font-black text-slate-950",
        boxPadding: "rounded-[16px] p-3.5",
        infoBoxPadding: "rounded-[14px] p-3",
      };
    case "xlarge":
      return {
        body: "w-full min-w-0 text-lg leading-7 font-medium text-slate-700",
        pre: "w-full min-w-0 text-base leading-6 font-mono text-slate-700",
        label: "text-base font-black tracking-wide text-slate-600",
        caption: "w-full min-w-0 text-base leading-6 font-medium text-slate-700",
        sectionTitle: "text-lg font-black tracking-wide text-slate-800",
        display: "text-6xl font-black text-slate-950",
        boxPadding: "rounded-[18px] p-4",
        infoBoxPadding: "rounded-[16px] p-3.5",
      };
    default:
      return {
        body: "w-full min-w-0 text-sm leading-5 font-medium text-slate-700",
        pre: "w-full min-w-0 text-xs leading-5 font-mono text-slate-700",
        label: "text-xs font-black tracking-wide text-slate-600",
        caption: "w-full min-w-0 text-xs leading-5 font-medium text-slate-700",
        sectionTitle: "text-sm font-black tracking-wide text-slate-800",
        display: "text-4xl font-black text-slate-950",
        boxPadding: "rounded-[14px] p-3",
        infoBoxPadding: "rounded-[12px] p-2.5",
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

  const sizeLabel = value === "normal" ? "S" : value === "large" ? "M" : "L";

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-violet-200 bg-white/80 px-1 py-0.5 shadow-sm"
      role="group"
      aria-label="Yazı boyutu"
    >
      <button
        type="button"
        onClick={decrease}
        disabled={value === "normal"}
        className="flex h-9 w-9 items-center justify-center rounded text-sm font-black text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Yazıyı küçült"
      >
        A−
      </button>
      <span className="min-w-[1.5rem] text-center text-[10px] font-bold text-slate-500">{sizeLabel}</span>
      <button
        type="button"
        onClick={increase}
        disabled={value === "xlarge"}
        className="flex h-9 w-9 items-center justify-center rounded text-sm font-black text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Yazıyı büyüt"
      >
        A+
      </button>
    </div>
  );
}
