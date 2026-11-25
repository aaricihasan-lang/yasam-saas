/**
 * I18N ATLAS-V — Vedik panel çevirisi için ortak vaka üreticisi (yalnız test; ağ / DB / sağlayıcı YOK).
 *
 * Gerçek sağlayıcı golden yanıtları (fixtures/golden) üretim normalizer'larıyla projekte edilir (hesap yok); panel çizimleri
 * için D1 (KB yok / boş / dolu, yoga + savaş + bastırılmış yoga varyantları), varga (D2…D60: eşleşen / desteklenmeyen /
 * uyuşmayan BPHS denetimi) ve Vimshottari / KP dasha (5 düzey, güncel zincir, drill sütunu) vakaları verir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoxyVedicD1, projectRoxyVedicDasha, projectRoxyVedicDashaCurrent, projectRoxyVedicVarga } from "@/lib/astrology/providers/roxy/vedic";
import type { VedicD1Technical, VedicDashaTechnical, VedicGrahaId, VedicVargaTechnical } from "@/lib/astrology/model/vedic";

/** Panellerin "bugün / şimdi" kararı için sabit an (golden üretimi ve test AYNI anı kullanır). */
export const FROZEN_NOW = Date.parse("2026-11-01T09:00:00Z");

export function freezeNow(): () => void {
  const real = Date.now;
  Date.now = () => FROZEN_NOW;
  return () => {
    Date.now = real;
  };
}

type Raw = { response: unknown };
const BIRTH_LOCAL = "1990-07-15T14:30:00";

function ok<T>(r: { ok: boolean; technical?: T; errors?: string[] }, name: string): T {
  if (!r.ok || !r.technical) throw new Error(`${name}: projeksiyon başarısız ${JSON.stringify(r.errors)}`);
  return r.technical;
}

export type KbEntry = { topicKey: string; topicLabel: string; title: string; body: string };
const KB_FULL = (keys: string[]): KbEntry[] => keys.slice(0, 2).map((k, i) => ({ topicKey: k, topicLabel: `Konu ${i + 1}`, title: `Başlık ${k}`, body: `Gövde ${i + 1}\nikinci satır` }));
const KB_EMPTY = (): KbEntry[] => [];

export type VedicCase =
  | { name: string; kind: "d1"; t: VedicD1Technical; kb: ((keys: string[]) => KbEntry[]) | null }
  | { name: string; kind: "varga"; t: VedicVargaTechnical; kb: ((keys: string[]) => KbEntry[]) | null }
  | { name: string; kind: "dasha"; t: VedicDashaTechnical; kb: ((keys: string[]) => KbEntry[]) | null; drill: boolean; openLevel: boolean }
  | { name: string; kind: "yoga"; t: VedicD1Technical };

export function vedicCases(fixDir: string): VedicCase[] {
  const g = (n: string): Raw => JSON.parse(readFileSync(join(fixDir, "golden", `${n}.json`), "utf8"));
  const out: VedicCase[] = [];

  // ── D1 ──
  const d1 = ok<VedicD1Technical>(projectRoxyVedicD1(structuredClone(g("vedic-d1").response), { ayanamsa: "lahiri" }), "vedic-d1");
  out.push({ name: "d1-kb-null", kind: "d1", t: d1, kb: null });
  out.push({ name: "d1-kb-empty", kind: "d1", t: d1, kb: KB_EMPTY });
  out.push({ name: "d1-kb-full", kind: "d1", t: d1, kb: KB_FULL });
  // Varyant: savaş + bastırılmış yoga + yoga yok + Abhijit + retro/asta (görüntü dalları; hesap değil).
  const d1b: VedicD1Technical = structuredClone(d1);
  d1b.planetaryWar = [
    { a: "mars", b: "venus", distance: 0.4321, winner: "venus" },
    { a: "mercury", b: "jupiter", distance: null, winner: null },
  ];
  if (d1b.yogas.length > 0) {
    d1b.yogas = d1b.yogas.map((y, i) => (i === 0 ? { ...y, present: false, suppressedBy: "akriti" as const, evidence: y.evidence ?? "evidence text" } : y));
  }
  d1b.lagna = { ...d1b.lagna, nakshatra: { ...d1b.lagna.nakshatra, abhijit: true } };
  out.push({ name: "d1-war-suppressed", kind: "d1", t: d1b, kb: KB_FULL });
  const d1c: VedicD1Technical = structuredClone(d1);
  d1c.yogas = d1c.yogas.map((y) => ({ ...y, present: false, suppressedBy: undefined }));
  d1c.combustion = [];
  out.push({ name: "d1-no-yoga", kind: "d1", t: d1c, kb: null });
  out.push({ name: "yoga-table-d1", kind: "yoga", t: d1 });

  // ── Varga ──
  for (const n of [2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60]) {
    const v = ok<VedicVargaTechnical>(projectRoxyVedicVarga(structuredClone(g(`vedic-d${n}`).response), { ayanamsa: "lahiri", division: n } as never), `vedic-d${n}`);
    out.push({ name: `varga-d${n}`, kind: "varga", t: v, kb: n === 9 ? KB_FULL : n === 10 ? KB_EMPTY : null });
  }
  // Uyuşmayan BPHS denetimi (bir rashi bozulur → "Doğrulanmadı" dalı).
  const d9 = ok<VedicVargaTechnical>(projectRoxyVedicVarga(structuredClone(g("vedic-d9").response), { ayanamsa: "lahiri", division: 9 } as never), "vedic-d9");
  const bad: VedicVargaTechnical = structuredClone(d9);
  const sun = bad.grahas.find((x) => x.id === "sun")!;
  sun.rashi = sun.rashi === "aries" ? "taurus" : "aries";
  bad.lagna = { ...bad.lagna, rashi: bad.lagna.rashi === "leo" ? "virgo" : "leo" };
  out.push({ name: "varga-d9-mismatch", kind: "varga", t: bad, kb: null });
  const noVgt: VedicVargaTechnical = { ...structuredClone(d9), vargottama: [] };
  out.push({ name: "varga-d9-no-vargottama", kind: "varga", t: noVgt, kb: null });

  // ── Dasha ──
  const dasha = (n: string, path: (VedicGrahaId | null)[], kp = false): VedicDashaTechnical =>
    ok<VedicDashaTechnical>(
      projectRoxyVedicDasha(structuredClone(g(n).response), {
        ayanamsa: kp ? "kp-newcomb" : "lahiri",
        mahadasha: path[0] ?? null,
        antardasha: path[1] ?? null,
        pratyantardasha: path[2] ?? null,
        sookshma: path[3] ?? null,
        birthLocal: BIRTH_LOCAL,
        utcOffsetHours: 3,
        kp,
      }),
      n,
    );
  const cur = (n: string, kp: boolean) =>
    ok(projectRoxyVedicDashaCurrent(structuredClone(g(n).response), { ayanamsa: kp ? "kp-newcomb" : "lahiri", birthLocal: BIRTH_LOCAL, atUtc: "2026-11-01T09:00", atLocal: "2026-11-01T12:00:00", utcOffsetHours: 3, kp }), n);
  const major = dasha("vedic-dasha-major", []);
  out.push({ name: "dasha-major", kind: "dasha", t: major, kb: null, drill: false, openLevel: false });
  out.push({ name: "dasha-major-drill-kb", kind: "dasha", t: major, kb: KB_FULL, drill: true, openLevel: true });
  out.push({ name: "dasha-major-current", kind: "dasha", t: { ...major, current: cur("vedic-dasha-current", false) } as VedicDashaTechnical, kb: KB_EMPTY, drill: true, openLevel: false });
  out.push({ name: "dasha-sub-md", kind: "dasha", t: dasha("vedic-dasha-sub-md", ["mercury"]), kb: null, drill: true, openLevel: false });
  out.push({ name: "dasha-sub-md-ad", kind: "dasha", t: dasha("vedic-dasha-sub-md-ad", ["moon", "rahu"]), kb: null, drill: false, openLevel: false });
  out.push({ name: "dasha-sookshma", kind: "dasha", t: dasha("vedic-dasha-sub-md-ad-pd", ["moon", "rahu", "ketu"]), kb: null, drill: true, openLevel: false });
  out.push({ name: "dasha-prana", kind: "dasha", t: dasha("vedic-dasha-sub-md-ad-pd-sd", ["moon", "rahu", "ketu", "moon"]), kb: KB_EMPTY, drill: true, openLevel: false });
  const kpMajor = dasha("kp-dasha-major", [], true);
  out.push({ name: "kp-dasha-major", kind: "dasha", t: kpMajor, kb: KB_FULL, drill: true, openLevel: false });
  out.push({ name: "kp-dasha-current", kind: "dasha", t: { ...kpMajor, current: cur("kp-dasha-current", true) } as VedicDashaTechnical, kb: null, drill: false, openLevel: false });
  out.push({ name: "kp-dasha-sub-md", kind: "dasha", t: dasha("kp-dasha-sub-md", ["moon"], true), kb: null, drill: true, openLevel: false });
  // Doğumla kesilmiş ilk dönem + negatif ofset etiketi + bakiye yok (görüntü dalları).
  const cut: VedicDashaTechnical = structuredClone(major);
  cut.periods[0] = { ...cut.periods[0], nominalStart: cut.periods[0].nominalStart ?? "1985-03-02T10:11:00" };
  cut.utcOffsetHours = -5.5;
  cut.balance = null;
  out.push({ name: "dasha-cut-negoffset", kind: "dasha", t: cut, kb: null, drill: false, openLevel: false });
  return out;
}
