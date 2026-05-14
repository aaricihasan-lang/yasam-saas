import {
  hesaplaNumeroloji,
  type NumerolojiResult,
  type HarfYankilanisiSegment,
  type ElementResult,
  type PinKoduBoxes,
} from "@/lib/numeroloji";

export type NumerolojiMotorOut = ReturnType<typeof hesaplaNumeroloji>;

export function nrDisplay(r: NumerolojiResult): string {
  return (r.display || "—").trim() || "—";
}

export function pinOneLine(pin: PinKoduBoxes): string {
  return `[${pin.k1}] [${pin.k2}] [${pin.k3}] [${pin.k4}] | [${pin.k5}] [${pin.k6}] [${pin.k7}] | [${pin.k8}] [${pin.k9}]`;
}

export function elementShort(el: ElementResult): string {
  const d = (el.display || "").trim();
  const k = (el.key || "").trim();
  if (!d && !k) return "—";
  if (k) return `${d}  (Baskın: ${k})`;
  return d || "—";
}

export function harfSegmentsToText(segments: HarfYankilanisiSegment[]): string {
  if (!segments.length) return "—";
  return segments
    .map((seg, idx) => {
      const y =
        seg.yearStart != null
          ? `  yıl ${seg.yearStart}${seg.yearEnd != null ? `–${seg.yearEnd}` : ""}`
          : "";
      return `${idx + 1}. ${seg.letter}  çakra ${seg.chakra}  yaş ${seg.ageStart}–${seg.ageEnd}${y}`;
    })
    .join("\n");
}

export function buildPlainAnalizFull(out: NumerolojiMotorOut): string {
  const chunks: string[] = [];

  const pushNum = (title: string, r: NumerolojiResult) => {
    chunks.push(title, "", r.display || "—");
    if (r.steps?.length) chunks.push("", ...r.steps);
    chunks.push("", "——————————", "");
  };

  pushNum("ANA KULVAR", out.anaKulvar);
  pushNum("YAN KULVAR", out.yanKulvar);
  pushNum("İFADE SAYISI", out.ifadeSayisi);
  pushNum("HAYAT YOLU / DM", out.hayatYolu);

  chunks.push("PIN KODU", "", pinOneLine(out.pinKodu), "", out.pinKoduMetni || "—", "", "——————————", "");
  chunks.push("ÇAKRA OMURGASI", "", out.cakraOmurgasiMetni || "—", "", "——————————", "");
  chunks.push("ELEMENTLER", "", out.elementlerMetni || "—");
  if (out.elementler.steps?.length) chunks.push("", ...out.elementler.steps);
  chunks.push("", "——————————", "");
  chunks.push("DEĞİŞİM — DÖNÜŞÜM", "", out.degisimDonusumMetni || "—", "", "——————————", "");
  chunks.push("ZİRVE YILLARI", "", out.zirveYillariMetni || "—", "", "——————————", "");
  chunks.push("MÜCADELE YILLARI", "", out.mucadeleYillariMetni || "—", "", "——————————", "");

  chunks.push("HARFLERİN YANKILANIŞI", "");
  const hy = out.harflerinYankilanisi;
  if (Array.isArray(hy) && hy.length) chunks.push(harfSegmentsToText(hy), "");
  if (out.harflerinYankilanisiMetni?.trim()) chunks.push(out.harflerinYankilanisiMetni);

  return chunks.join("\n").trim();
}
