// Astroloji — KP lord ZİNCİRİ tutarlılık yardımcısı (SAF; 2026-10-22).
//
// Bir HESAP MOTORU DEĞİLDİR: hiçbir lord buradan üretilip gösterilmez. Boylam vermeyen uçlarda (ör. ruling planets aralık taraması)
// sağlayıcının verdiği sign / star / sub / sub-sub lord dörtlüsünün zodyakta GERÇEKTEN var olan bir KP alt-alt bölümüne karşılık
// geldiği denetlenir (verify/kpSub ile aynı kural: nakshatra → 9 sub → 9 sub-sub, Vimshottari yıl oranı; burç sınırını kesen dilim
// iki burcun lorduyla da geçerlidir). Var olmayan dörtlü → adaptör yanıtı REDDEDER (fail-closed).

import { NAKSHATRA_LORDS, VIMSHOTTARI_YEARS, type VedicGrahaId } from "../model/vedic";
import { SIGN_IDS } from "../model/western";
import { SIGN_LORDS } from "../model/kp";
import { nakshatraSubs } from "./kpSub";

let CHAINS: Set<string> | null = null;
function chains(): Set<string> {
  if (CHAINS) return CHAINS;
  const out = new Set<string>();
  for (let n = 0; n < 27; n++) {
    const star = NAKSHATRA_LORDS[n % 9];
    for (const s of nakshatraSubs(n)) {
      const i0 = NAKSHATRA_LORDS.indexOf(s.lord);
      const span = s.end - s.start;
      let acc = s.start;
      for (let k = 0; k < 9; k++) {
        const ss = NAKSHATRA_LORDS[(i0 + k) % 9];
        const end = k === 8 ? s.end : acc + (span * VIMSHOTTARI_YEARS[ss]) / 120;
        for (let si = Math.floor(acc / 30 + 1e-12); si <= Math.min(11, Math.floor((end - 1e-9) / 30)); si++) out.add(`${SIGN_LORDS[SIGN_IDS[si]]}|${star}|${s.lord}|${ss}`);
        acc = end;
      }
    }
  }
  CHAINS = out;
  return out;
}

/** sign / star / sub / sub-sub lord dörtlüsü zodyakta var olan bir KP alt-alt bölümü mü? */
export function kpLordChainExists(sign: VedicGrahaId, star: VedicGrahaId, sub: VedicGrahaId, subSub: VedicGrahaId): boolean {
  return chains().has(`${sign}|${star}|${sub}|${subSub}`);
}
