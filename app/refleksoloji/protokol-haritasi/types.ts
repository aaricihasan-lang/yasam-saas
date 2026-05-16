/** İleride JSON / Supabase şemasına taşınacak protokol modeli */

export type ProtocolProblemId = string;

export type ProtocolFootView = "taban" | "yan";

export type ProtocolFootSide = "left" | "right" | "both";

/** Atlas ile uyumlu normalize bölge (salt okunur önizleme) */
export type ProtocolDisplayRegion = {
  id: string;
  organ: string;
  footSide: "left" | "right";
  view: ProtocolFootView;
  shape: "oval" | "rect";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type ProtocolOrgan = {
  id: string;
  name: string;
  protocolSummary: string;
  applicationNotes: string;
  footView: ProtocolFootView;
  footSide: ProtocolFootSide;
  fallbackRegions: ProtocolDisplayRegion[];
};

export type ProtocolProblem = {
  id: ProtocolProblemId;
  title: string;
  shortDescription: string;
  accentClass: string;
  organs: ProtocolOrgan[];
};

/** Form — fallback bölgeler korunur veya boş */
export type ProtocolOrganDraft = {
  id?: string;
  name: string;
  protocolSummary: string;
  applicationNotes: string;
  footView: ProtocolFootView;
  footSide: ProtocolFootSide;
};

export type ProtocolProblemDraft = {
  title: string;
  shortDescription: string;
  organs: ProtocolOrganDraft[];
};

export const PROTOCOL_ACCENT_PRESETS = [
  "from-amber-200/90 to-orange-100/80 border-amber-300/70",
  "from-sky-200/90 to-cyan-100/80 border-sky-300/70",
  "from-violet-200/90 to-fuchsia-100/80 border-violet-300/70",
  "from-indigo-200/90 to-blue-100/80 border-indigo-300/70",
  "from-rose-200/90 to-pink-100/80 border-rose-300/70",
  "from-emerald-200/90 to-teal-100/80 border-emerald-300/70",
] as const;
