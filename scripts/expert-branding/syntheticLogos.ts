/**
 * F3A — SENTETİK uzman logoları (gerçek marka DEĞİL). sharp ile SVG → PNG.
 * yatay (600×180) · dikey (200×520) · kare (400×400, opak) · şeffaf (420×420, alfa kanallı).
 */
import sharp from "sharp";

const svg = (w: number, h: number, body: string, bg: string | null) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      (bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : "") +
      body +
      "</svg>",
  );

const mark = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0f766e"/>` +
  `<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="#f0fdfa" stroke-width="${r * 0.12}"/>` +
  `<path d="M ${cx - r * 0.35} ${cy + r * 0.2} Q ${cx} ${cy - r * 0.6} ${cx + r * 0.35} ${cy + r * 0.2}" fill="none" stroke="#f0fdfa" stroke-width="${r * 0.1}"/>`;

export type SyntheticLogoKind = "yatay" | "dikey" | "kare" | "seffaf";

export async function syntheticLogo(kind: SyntheticLogoKind): Promise<Buffer> {
  if (kind === "yatay") {
    return sharp(svg(600, 180, mark(90, 90, 70) + `<rect x="190" y="60" width="370" height="26" rx="6" fill="#134e4a"/><rect x="190" y="104" width="250" height="16" rx="5" fill="#5eead4"/>`, "#ffffff")).png().toBuffer();
  }
  if (kind === "dikey") {
    return sharp(svg(200, 520, mark(100, 110, 80) + `<rect x="30" y="240" width="140" height="24" rx="6" fill="#134e4a"/><rect x="50" y="282" width="100" height="14" rx="5" fill="#5eead4"/><rect x="60" y="420" width="80" height="60" rx="8" fill="#ccfbf1"/>`, "#ffffff")).png().toBuffer();
  }
  if (kind === "kare") {
    return sharp(svg(400, 400, mark(200, 170, 110) + `<rect x="90" y="315" width="220" height="26" rx="6" fill="#134e4a"/>`, "#f8fafc")).png().toBuffer();
  }
  return sharp(svg(420, 420, mark(210, 210, 150), null)).png().toBuffer();
}
