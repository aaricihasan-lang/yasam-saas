// RoxyAPI POST /human-design/bodygraph — RUNTIME yanıt doğrulaması (SAF).
//
// Sözleşme gerçek bir Roxy yanıtından (scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json)
// alınmıştır; tahmin edilmez. Yalnız hesap için GEREKLİ alanlar katı doğrulanır. Açıklama
// metinleri (typeDescription, gateDescription …) doğrulanmaz/kullanılmaz — ham yanıtta kalır.
// Geçersiz yanıt → hata listesi (çağıran DB'ye BAŞARILI hesap olarak YAZMAZ).

export type RoxySide = "personality" | "design";

export type RoxyActivation = { planet: string; side: RoxySide; gate: number; line: number };
export type RoxyCenter = { id: string; name: string; defined: boolean; gates: number[] };
export type RoxyChannel = { gateA: number; gateB: number; name: string; centers: [string, string] };
export type RoxyCross = {
  gates: [number, number, number, number];
  angle: string;
  angleCode: string | null;
  name: string;
};

/** Doğrulanmış (hesap için yeterli) Roxy bodygraph özeti. */
export type RoxyBodygraph = {
  type: string;
  strategy: string;
  authority: string;
  signature: string;
  notSelf: string;
  profile: string;
  definition: string;
  designInstantUtc: string;
  incarnationCross: RoxyCross;
  centers: RoxyCenter[];
  channels: RoxyChannel[];
  activations: RoxyActivation[];
};

export type RoxyValidation = { ok: true; value: RoxyBodygraph } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export const ROXY_ACTIVATIONS_PER_SIDE = 13;
export const ROXY_CENTER_COUNT = 9;

export function validateRoxyBodygraph(raw: unknown): RoxyValidation {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["yanıt bir JSON nesnesi değil"] };

  const str = (k: string): string => {
    const v = raw[k];
    if (!isStr(v)) {
      errors.push(`${k}: boş olmayan metin bekleniyor`);
      return "";
    }
    return v.trim();
  };

  const type = str("type");
  const strategy = str("strategy");
  const authority = str("authority");
  const signature = str("signature");
  const notSelf = str("notSelf");
  const profile = str("profile");
  const definition = str("definition");
  const designInstantUtc = str("designInstantUtc");
  if (designInstantUtc && Number.isNaN(Date.parse(designInstantUtc))) {
    errors.push("designInstantUtc: geçerli ISO tarih değil");
  }

  // ── incarnationCross ──
  let incarnationCross: RoxyCross = { gates: [0, 0, 0, 0], angle: "", angleCode: null, name: "" };
  const xc = raw.incarnationCross;
  if (!isObj(xc)) {
    errors.push("incarnationCross: nesne bekleniyor");
  } else {
    const g = xc.gates;
    if (!Array.isArray(g) || g.length !== 4 || !g.every((n) => isInt(n, 1, 64))) {
      errors.push("incarnationCross.gates: 1–64 aralığında 4 kapı bekleniyor");
    }
    if (!isStr(xc.angle)) errors.push("incarnationCross.angle: metin bekleniyor");
    if (!isStr(xc.name)) errors.push("incarnationCross.name: metin bekleniyor");
    if (xc.angleCode !== undefined && xc.angleCode !== null && typeof xc.angleCode !== "string") {
      errors.push("incarnationCross.angleCode: metin bekleniyor");
    }
    if (Array.isArray(g) && g.length === 4 && g.every((n) => isInt(n, 1, 64)) && isStr(xc.angle) && isStr(xc.name)) {
      incarnationCross = {
        gates: [g[0], g[1], g[2], g[3]] as [number, number, number, number],
        angle: xc.angle.trim(),
        angleCode: typeof xc.angleCode === "string" && xc.angleCode.trim() ? xc.angleCode.trim() : null,
        name: xc.name.trim(),
      };
    }
  }

  // ── centers ──
  const centers: RoxyCenter[] = [];
  if (!Array.isArray(raw.centers) || raw.centers.length !== ROXY_CENTER_COUNT) {
    errors.push(`centers: tam ${ROXY_CENTER_COUNT} merkez bekleniyor`);
  } else {
    raw.centers.forEach((c, i) => {
      if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || typeof c.defined !== "boolean") {
        errors.push(`centers[${i}]: id/name/defined eksik veya hatalı`);
        return;
      }
      const gates = Array.isArray(c.gates) ? c.gates : [];
      if (!gates.every((n) => isInt(n, 1, 64))) {
        errors.push(`centers[${i}].gates: geçersiz kapı`);
        return;
      }
      centers.push({ id: c.id.trim(), name: c.name.trim(), defined: c.defined, gates: gates as number[] });
    });
  }

  // ── channels ──
  const channels: RoxyChannel[] = [];
  if (!Array.isArray(raw.channels)) {
    errors.push("channels: dizi bekleniyor");
  } else {
    raw.channels.forEach((c, i) => {
      if (
        !isObj(c) ||
        !isInt(c.gateA, 1, 64) ||
        !isInt(c.gateB, 1, 64) ||
        !isStr(c.name) ||
        !Array.isArray(c.centers) ||
        c.centers.length !== 2 ||
        !c.centers.every(isStr)
      ) {
        errors.push(`channels[${i}]: gateA/gateB/name/centers eksik veya hatalı`);
        return;
      }
      channels.push({
        gateA: c.gateA,
        gateB: c.gateB,
        name: c.name.trim(),
        centers: [String(c.centers[0]).trim(), String(c.centers[1]).trim()],
      });
    });
  }

  // ── gates (= 26 gezegensel aktivasyon) ──
  const activations: RoxyActivation[] = [];
  if (!Array.isArray(raw.gates)) {
    errors.push("gates: dizi bekleniyor");
  } else {
    raw.gates.forEach((a, i) => {
      if (
        !isObj(a) ||
        !isStr(a.planet) ||
        (a.side !== "personality" && a.side !== "design") ||
        !isInt(a.gate, 1, 64) ||
        !isInt(a.line, 1, 6)
      ) {
        errors.push(`gates[${i}]: planet/side/gate/line eksik veya hatalı`);
        return;
      }
      activations.push({ planet: a.planet.trim(), side: a.side, gate: a.gate, line: a.line });
    });
    const p = activations.filter((a) => a.side === "personality").length;
    const d = activations.filter((a) => a.side === "design").length;
    if (p !== ROXY_ACTIVATIONS_PER_SIDE || d !== ROXY_ACTIVATIONS_PER_SIDE) {
      errors.push(
        `gates: ${ROXY_ACTIVATIONS_PER_SIDE} personality + ${ROXY_ACTIVATIONS_PER_SIDE} design bekleniyor (gelen ${p}+${d})`,
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      type,
      strategy,
      authority,
      signature,
      notSelf,
      profile,
      definition,
      designInstantUtc,
      incarnationCross,
      centers,
      channels,
      activations,
    },
  };
}
