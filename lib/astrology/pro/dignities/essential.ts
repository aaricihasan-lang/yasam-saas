// Gökyüzü Atlası — PROFESYONEL klasik asalet: ASAL (essential) asalet, açıklanabilir puan satırlarıyla (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Hesap mevcut `essentialDignity` (calc.ts) fonksiyonundadır ve DEĞİŞMEZ. Bu dosya onun sonucunu kaynaklı satırlara açar,
// puan politikasını uygular ve sınır yakınlığını (burç / terim / yüz sınırına kalan yay) ölçer. Satırların toplamı, Lilly
// ekolünde `essentialDignity(...).score` ile BİREBİR aynıdır (testte sınanır).

import { essentialDignity, type EssentialDignity } from "../../horary/western/calc";
import { TERMS, TRIPLICITY, degInSign, elementOf, signOf, type ClassicalPlanet } from "../../horary/western/tables";
import { DIGNITY_SCHOOLS, LILLY_SCORE, SOURCES, type DignitySchoolId, type ScorePolicyId } from "./schools";

export const n360 = (x: number) => ((x % 360) + 360) % 360;

export type EssentialReasonKey = "domicile" | "exaltation" | "triplicity" | "term" | "face" | "detriment" | "fall" | "peregrine";
export type EssentialReason = { key: EssentialReasonKey; points: number | null; source: string; note?: string };

export type BoundaryInfo = {
  /** Burç başlangıcından / sonundan yay (yay dakikası). */
  signStartArcmin: number;
  signEndArcmin: number;
  /** En yakın terim sınırına (burç sınırları dahil) yay dakikası. */
  termBoundaryArcmin: number;
  /** En yakın yüz (dekan) sınırına yay dakikası. */
  faceBoundaryArcmin: number;
  /** Herhangi bir sınıra `limitArcmin` içinde mi? (ör. 1′ = efemeris farkı sonucu değiştirebilir) */
  near: boolean;
  limitArcmin: number;
};

export type NatalEssential = {
  planet: ClassicalPlanet;
  lon: number;
  sign: string;
  degree: number;
  isDay: boolean;
  school: DignitySchoolId;
  scorePolicy: ScorePolicyId;
  /** Ekolün tablosu Lilly değilken Lilly puanı uygulandı. */
  mixedPolicy: boolean;
  essential: EssentialDignity;
  reasons: EssentialReason[];
  score: number | null;
  /** Dorothean setinde ortak üçlü yöneticisi olarak sayıldı mı (calc.ts davranışı). */
  triplicityAsParticipating: boolean;
  boundary: BoundaryInfo;
};

export function boundaryInfo(lon: number, terms: "egyptian" | "lilly", limitArcmin = 1): BoundaryInfo {
  const d = degInSign(lon);
  const row = TERMS[terms][signOf(lon)];
  const edges = [0, ...row.map(([, e]) => e)];
  const termDist = Math.min(...edges.map((e) => Math.abs(d - e))) * 60;
  const faceDist = Math.min(...[0, 10, 20, 30].map((e) => Math.abs(d - e))) * 60;
  const signStart = d * 60;
  const signEnd = (30 - d) * 60;
  return { signStartArcmin: signStart, signEndArcmin: signEnd, termBoundaryArcmin: termDist, faceBoundaryArcmin: faceDist, near: Math.min(signStart, signEnd, termDist, faceDist) < limitArcmin, limitArcmin };
}

export function natalEssential(planet: ClassicalPlanet, lon: number, isDay: boolean, schoolId: DignitySchoolId, scorePolicy: ScorePolicyId = "school", boundaryArcmin = 1): NatalEssential {
  const school = DIGNITY_SCHOOLS[schoolId];
  const p = school.profile;
  const ess = essentialDignity(planet, lon, isDay, p);
  const useLilly = scorePolicy === "lilly_ca115" || (scorePolicy === "school" && p.methodology.scoring === "lilly_ca115");
  const mixedPolicy = useLilly && (p.terms !== "lilly" || p.triplicity !== "lilly");
  const pts = (n: number) => (useLilly ? n : null);
  const src = SOURCES.ca104.id;
  const reasons: EssentialReason[] = [];
  const trip = TRIPLICITY[p.triplicity][elementOf(signOf(lon))];
  const sectRuler = isDay ? trip[0] : trip[1];
  const asParticipating = ess.triplicity && sectRuler !== planet && trip[2] === planet;
  if (ess.domicile) reasons.push({ key: "domicile", points: pts(LILLY_SCORE.domicile), source: src });
  if (ess.exaltation) reasons.push({ key: "exaltation", points: pts(LILLY_SCORE.exaltation), source: src, note: "burç düzeyi (yücelme derecesi yalnız bilgi)" });
  if (ess.triplicity) reasons.push({ key: "triplicity", points: pts(LILLY_SCORE.triplicity), source: p.triplicity === "lilly" ? src : SOURCES.dorotheus.id, note: asParticipating ? "ortak (participating) üçlü yöneticisi" : isDay ? "gündüz yöneticisi" : "gece yöneticisi" });
  if (ess.term) reasons.push({ key: "term", points: pts(LILLY_SCORE.term), source: p.terms === "lilly" ? src : SOURCES.tetrabiblos120.id, note: `${p.terms} terimleri` });
  if (ess.face) reasons.push({ key: "face", points: pts(LILLY_SCORE.face), source: src, note: "Kalde sırası, Koç 0° Mars" });
  if (ess.detriment) reasons.push({ key: "detriment", points: pts(LILLY_SCORE.detriment), source: src });
  if (ess.fall) reasons.push({ key: "fall", points: pts(LILLY_SCORE.fall), source: src });
  if (ess.peregrine) reasons.push({ key: "peregrine", points: pts(LILLY_SCORE.peregrine), source: SOURCES.ca115.id, note: "beş asaletin hiçbiri yok" });
  const score = useLilly ? reasons.reduce((t, r) => t + (r.points as number), 0) : null;
  return {
    planet,
    lon: n360(lon),
    sign: ess.sign,
    degree: degInSign(lon),
    isDay,
    school: schoolId,
    scorePolicy,
    mixedPolicy,
    essential: ess,
    reasons,
    score,
    triplicityAsParticipating: asParticipating,
    boundary: boundaryInfo(lon, p.terms, boundaryArcmin),
  };
}
