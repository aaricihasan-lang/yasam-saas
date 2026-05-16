import type { ProtocolProblem } from "../types";

function oval(
  organ: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  view: "taban" | "yan" = "taban",
  footSide: "left" | "right" = "left",
): ProtocolProblem["organs"][0]["fallbackRegions"][0] {
  return {
    id: `${organ}-${cx}-${cy}`,
    organ,
    footSide,
    view,
    shape: "oval",
    cx,
    cy,
    rx,
    ry,
  };
}

/** Yerel örnek protokol kataloğu — ileride harici JSON veya API ile değiştirilebilir */
export const PROTOCOL_CATALOG: ProtocolProblem[] = [
  {
    id: "sindirim",
    title: "Sindirim",
    shortDescription: "Mide, bağırsak ve karaciğer refleks bölgeleri; sindirim dengesini destekler.",
    accentClass: "from-amber-200/90 to-orange-100/80 border-amber-300/70",
    organs: [
      {
        id: "mide",
        name: "Mide",
        protocolSummary: "Sol ayak taban — mide refleks zonu; saat yönünde nazik baskı.",
        applicationNotes: "5–7 dk, orta basınç. Öğün sonrası 45 dk bekleyin.",
        footView: "taban",
        footSide: "left",
        fallbackRegions: [oval("Mide", 0.42, 0.52, 0.09, 0.07)],
      },
      {
        id: "ince-bagirsak",
        name: "İnce Bağırsak",
        protocolSummary: "Taban orta bölge; bağırsak refleks şeridi boyunca süpürme.",
        applicationNotes: "Her iki ayakta 4–6 dk, hafif-orta basınç.",
        footView: "taban",
        footSide: "both",
        fallbackRegions: [
          oval("İnce Bağırsak", 0.38, 0.58, 0.08, 0.06),
          oval("İnce Bağırsak", 0.62, 0.58, 0.08, 0.06, "taban", "right"),
        ],
      },
      {
        id: "karaciger",
        name: "Karaciğer",
        protocolSummary: "Sağ ayak taban — karaciğer zonu; yukarıdan aşağı akış.",
        applicationNotes: "3–5 dk, yumuşak basınç. Sağ ayak öncelikli.",
        footView: "taban",
        footSide: "right",
        fallbackRegions: [oval("Karaciğer", 0.58, 0.48, 0.1, 0.08, "taban", "right")],
      },
    ],
  },
  {
    id: "stres",
    title: "Stres / Gerginlik",
    shortDescription: "Böbrek üstü bezi ve solar pleksus; sinir sistemini yatıştırır.",
    accentClass: "from-sky-200/90 to-cyan-100/80 border-sky-300/70",
    organs: [
      {
        id: "bobrek-ustu",
        name: "Böbrek Üstü Bezi",
        protocolSummary: "Ayak tabanı üst iç bölge; adrenal refleks noktaları.",
        applicationNotes: "2–3 dk nokta basısı, ardından çevre masajı.",
        footView: "taban",
        footSide: "both",
        fallbackRegions: [
          oval("Böbrek Üstü Bezi", 0.35, 0.38, 0.06, 0.05),
          oval("Böbrek Üstü Bezi", 0.65, 0.38, 0.06, 0.05, "taban", "right"),
        ],
      },
      {
        id: "solar-pleksus",
        name: "Solar Pleksus",
        protocolSummary: "Topuk üstü orta hat; nefes ile eşlik edilen yavaş baskı.",
        applicationNotes: "3–4 dk, çok hafif basınç. Seans sonunda uygulayın.",
        footView: "taban",
        footSide: "left",
        fallbackRegions: [oval("Solar Pleksus", 0.5, 0.72, 0.07, 0.05)],
      },
    ],
  },
  {
    id: "bas-agrisi",
    title: "Baş ağrısı",
    shortDescription: "Boyun, baş ve sinüs refleks alanları; gerginlik tipi baş ağrılarında.",
    accentClass: "from-violet-200/90 to-fuchsia-100/80 border-violet-300/70",
    organs: [
      {
        id: "bas-bolge",
        name: "Baş (Parmak uçları)",
        protocolSummary: "Her parmak ucu ve baş refleks zonu; dairesel mini baskı.",
        applicationNotes: "Parmak uçları 1–2 dk, baş zonu 3 dk.",
        footView: "taban",
        footSide: "both",
        fallbackRegions: [
          oval("Baş", 0.22, 0.18, 0.05, 0.04),
          oval("Baş", 0.78, 0.18, 0.05, 0.04, "taban", "right"),
        ],
      },
      {
        id: "boyun",
        name: "Boyun",
        protocolSummary: "Ayak başı üst şerit; boyun refleks hattı boyunca.",
        applicationNotes: "4 dk, orta basınç. Sıcak kompres sonrası uygulanabilir.",
        footView: "taban",
        footSide: "left",
        fallbackRegions: [oval("Boyun", 0.5, 0.22, 0.12, 0.04)],
      },
    ],
  },
  {
    id: "uyku",
    title: "Uyku",
    shortDescription: "Hipofiz ve pineal bez refleksleri; uyku düzenine destek.",
    accentClass: "from-indigo-200/90 to-blue-100/80 border-indigo-300/70",
    organs: [
      {
        id: "hipofiz",
        name: "Hipofiz",
        protocolSummary: "Baş parmak tabanı merkez; hipofiz refleks noktası.",
        applicationNotes: "1–2 dk nazik nokta basısı, akşam seansı önerilir.",
        footView: "taban",
        footSide: "left",
        fallbackRegions: [oval("Hipofiz", 0.5, 0.15, 0.04, 0.035)],
      },
      {
        id: "pineal",
        name: "Pineal Bez",
        protocolSummary: "Ayak orta iç hat üst bölge; pineal refleks zonu.",
        applicationNotes: "3 dk hafif basınç, seans bitiminde.",
        footView: "taban",
        footSide: "both",
        fallbackRegions: [
          oval("Pineal", 0.48, 0.32, 0.05, 0.04),
          oval("Pineal", 0.52, 0.32, 0.05, 0.04, "taban", "right"),
        ],
      },
    ],
  },
  {
    id: "bel-agrisi",
    title: "Bel ağrısı",
    shortDescription: "Lomber, sakrum ve iliak refleks bölgeleri; bel-basin hattı.",
    accentClass: "from-rose-200/90 to-pink-100/80 border-rose-300/70",
    organs: [
      {
        id: "lomber",
        name: "Lomber",
        protocolSummary: "İç ayak bileği hizası — lomber refleks şeridi.",
        applicationNotes: "5–6 dk, derinlemesine değil orta basınç.",
        footView: "yan",
        footSide: "left",
        fallbackRegions: [oval("Lomber", 0.5, 0.55, 0.1, 0.06, "yan")],
      },
      {
        id: "sakrum",
        name: "Sakrum",
        protocolSummary: "Topuk üstü merkez çizgi; sakrum refleks alanı.",
        applicationNotes: "4 dk, yavaş süpürme hareketi.",
        footView: "taban",
        footSide: "left",
        fallbackRegions: [oval("Sakrum", 0.5, 0.78, 0.08, 0.05)],
      },
    ],
  },
];

export function getProblemById(id: string | null) {
  if (!id) return null;
  return PROTOCOL_CATALOG.find((p) => p.id === id) ?? null;
}
