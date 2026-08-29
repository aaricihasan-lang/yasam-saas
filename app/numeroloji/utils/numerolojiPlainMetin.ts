import {
  hesaplaNumeroloji,
  parseBirthDate,
  calcDegisimByYearOnly,
  calcDegisimByFullDate,
  type NumerolojiResult,
  type HarfYankilanisiSegment,
  type ElementResult,
  type PinKoduBoxes,
} from "@/lib/numeroloji";

export type NumerolojiMotorOut = ReturnType<typeof hesaplaNumeroloji>;

export function nrDisplay(r: NumerolojiResult | null | undefined): string {
  // Bozuk/eksik kayıtlarda r veya r.display undefined olabilir → çökmemeli.
  const d = r && typeof r.display === "string" ? r.display : "";
  return d.trim() || "—";
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

/** Kayıt listesi ve Supabase özeti için kısa metin. */
export function buildAnalizOzeti(out: NumerolojiMotorOut): string {
  return [
    `Ana kulvar: ${nrDisplay(out.anaKulvar)}`,
    `Yan kulvar: ${nrDisplay(out.yanKulvar)}`,
    `İfade: ${nrDisplay(out.ifadeSayisi)}`,
    `Hayat yolu: ${nrDisplay(out.hayatYolu)}`,
    `PIN: ${pinOneLine(out.pinKodu)}`,
  ].join(" · ");
}

function extractDogumTarihi(...sources: (string | undefined | null)[]): string | null {
  for (const s of sources) {
    if (!s) continue;
    const m = s.match(/Doğum Tarihi:\s*([^\n\r]+)/i);
    const v = m?.[1]?.trim();
    if (v) return v;
  }
  return null;
}

function degisimSonucSatirlari(metni: string): string {
  const picked: string[] = [];
  for (const raw of metni.split("\n")) {
    const line = raw.trim();
    if (/^\d+\.\s*Değişim:/.test(line)) picked.push(line);
    else if (line.startsWith("Etki Dönemi")) picked.push(`  ${line}`);
  }
  return picked.join("\n").trim();
}

function formatDegisimOzet(out: NumerolojiMotorOut): string {
  const bd = extractDogumTarihi(
    out.degisimDonusumMetni,
    out.elementlerMetni,
    out.zirveYillariMetni,
    out.mucadeleYillariMetni,
  );
  const parts = bd ? parseBirthDate(bd) : null;
  if (!parts) {
    const fallback = degisimSonucSatirlari(out.degisimDonusumMetni || "");
    return fallback || "—";
  }

  const { day, month, year } = parts;
  const lines: string[] = ["Doğum yılına göre:"];
  for (const r of calcDegisimByYearOnly(year, month, 5)) {
    lines.push(
      `  ${r.index}. Değişim ${r.changeYear} → ${r.chakra}. çakra (${r.effectStartYear}–${r.effectEndYear})`,
    );
  }
  lines.push("", "Gün ve ay dahil:");
  for (const r of calcDegisimByFullDate(day, month, year, 5)) {
    const md = String(r.effectMonth).padStart(2, "0");
    const dd = String(r.effectDay).padStart(2, "0");
    lines.push(
      `  ${r.index}. Değişim ${r.changeYear} → ${r.chakra}. çakra (${r.effectStartYear}.${md}.${dd} – ${r.effectEndYear}.${md}.${dd})`,
    );
  }
  return lines.join("\n");
}

function formatZirveOzet(out: NumerolojiMotorOut): string {
  const peaks = out.zirveYillari?.peaks;
  if (!peaks?.length) return "—";
  return peaks.map((p) => `${p.index}. zirve — yaş ${p.age}, konu ${p.topic}`).join("\n");
}

function formatMucadeleOzet(out: NumerolojiMotorOut): string {
  const m = out.mucadeleYillari;
  if (!m?.method1?.length) return "—";
  const lines: string[] = [];
  for (const p of m.method1) {
    lines.push(`${p.index}. mücadele — yaş ${p.age}, konu ${p.topic}`);
  }
  return lines.join("\n").trim() || "—";
}

/** Hesap Özetsiz sekme: yalnızca nihai sonuçlar (adım/formül yok). */
export function buildPlainAnalizFull(out: NumerolojiMotorOut): string {
  const chunks: string[] = [];

  const pushBlock = (title: string, body: string) => {
    chunks.push(title, "", (body || "—").trim(), "", "——————————", "");
  };

  pushBlock("ANA KULVAR", nrDisplay(out.anaKulvar));
  pushBlock("YAN KULVAR", nrDisplay(out.yanKulvar));
  pushBlock("İFADE SAYISI", nrDisplay(out.ifadeSayisi));
  pushBlock("HAYAT YOLU / DM", nrDisplay(out.hayatYolu));
  pushBlock("PIN KODU", pinOneLine(out.pinKodu));
  pushBlock("ÇAKRA OMURGASI", out.cakraOmurgasiMetni || "—");
  pushBlock("ELEMENTLER", elementShort(out.elementler));
  pushBlock("DEĞİŞİM — DÖNÜŞÜM", formatDegisimOzet(out));
  pushBlock("ZİRVE YILLARI", formatZirveOzet(out));
  pushBlock("MÜCADELE YILLARI", formatMucadeleOzet(out));

  chunks.push("HARFLERİN YANKILANIŞI", "");
  const hy = out.harflerinYankilanisi;
  chunks.push(Array.isArray(hy) && hy.length ? harfSegmentsToText(hy) : "—");

  return chunks.join("\n").trim();
}
