"use client";

/**
 * EK NOKTALAR görünümü (2026-10-22): asteroitler, Hermetik lotlar, Kara Ay Lilith (ortalama + gerçek).
 * Yalnız kayıtlı teknik veriyi çizer (yeni hesap YOK). Natal çerçeve önbellekte varsa natal çark + ek noktalar DIŞ HALKASI;
 * natal tekniğin kendi çarkı değişmez (bu bileşen ayrı çizimdir). Ortalama ve gerçek Lilith ayrı etiket + ayrı renk.
 * Sağlayıcı adı kullanıcı metninde yok.
 */

import type { ReactNode } from "react";
import { BODY_GLYPHS, BODY_LABELS, HOUSE_SYSTEM_LABELS, SIGN_ELEMENT, SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { SIGN_IDS, type BodyId, type SignId } from "@/lib/astrology/model/western";
import {
  ASTEROID_COLOR,
  ASTEROID_GLYPHS,
  ASTEROID_LABELS,
  CONSISTENCY_LABELS,
  EXTRA_NATAL_MISSING_NOTE,
  EXTRA_POINTS_METHOD_TEXT,
  EXTRA_SECTION_LABELS,
  FORTUNE_SINGLE_SOURCE_NOTE,
  LILITH_COLORS,
  LILITH_LABELS,
  LILITH_SHORT,
  LOT_COLOR,
  LOT_LABELS,
  LOT_NONTRADITIONAL_NOTE,
  LOT_SHORT,
  LOT_VICTORY_LOCAL_NOTE,
  LOT_VICTORY_NOTE,
  LOT_WITHHELD_CELL,
  LOTS_METHOD_TEXT,
  SECT_LABELS,
  fmtDiffDeg,
  lotFormulaText,
} from "@/lib/astrology/labels/extraPoints";
import { EXTRA_POINTS_INTERP_NOTE, lotPositionWithheld, type ConsistencyStatus, type ExtraNatalFrame, type ExtraPointsInterpretation, type ExtraPointsTechnical, type LilithVariant, type LotId } from "@/lib/astrology/model/westernExtraPoints";

const pos = (sign: SignId, d: number) => `${SIGN_GLYPHS[sign]} ${SIGN_LABELS[sign]} ${formatDegree(d)}`;
const fx = (n: number, d = 4) => n.toFixed(d).replace(".", ",");
const th = "whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "whitespace-nowrap px-2 py-1.5 align-top";

function Box({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white/80 p-3 max-sm:p-2" data-testid={testId}>
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </section>
  );
}
function Scroll({ children }: { children: ReactNode }) {
  return <div className="max-w-full overflow-x-auto">{children}</div>;
}

const STATUS_TONE: Record<ConsistencyStatus, string> = { consistent: "text-emerald-700", inconsistent: "text-rose-700", unavailable: "text-slate-500" };

export function ExtraPointsPanel({ t, timeUnknownMasked }: { t: ExtraPointsTechnical; timeUnknownMasked: boolean }) {
  const missing = t.sections.filter((s) => t[s] === null);
  const nc = t.natalCheck ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-extra-points">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {t.sections.map((s) => (
          <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700" data-extra-section={s}>
            {EXTRA_SECTION_LABELS[s]}
          </span>
        ))}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Ev sistemi: {HOUSE_SYSTEM_LABELS[t.houseSystem]}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">Tropikal</span>
      </div>
      {missing.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="astro-extra-missing">
          Gösterilmeyen bölüm: {missing.map((s) => EXTRA_SECTION_LABELS[s]).join(", ")}
          {timeUnknownMasked ? " (doğum saati bilinmiyor)." : "."}
        </p>
      )}

      {t.natalFrame ? (
        <Box title="Natal çark + ek noktalar katmanı" testId="astro-extra-wheel">
          <ExtraPointsWheel t={t} frame={t.natalFrame} />
          <Legend t={t} />
        </Box>
      ) : (
        !timeUnknownMasked && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="astro-extra-no-natal">
            {EXTRA_NATAL_MISSING_NOTE}
          </p>
        )
      )}

      {t.asteroids && (
        <Box title="Asteroitler" testId="astro-extra-asteroids">
          <Scroll>
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>Asteroit</th>
                  <th className={th}>Burç ve derece</th>
                  <th className={th}>Boylam</th>
                  <th className={th}>Enlem</th>
                  <th className={th}>Ev</th>
                  <th className={th}>Günlük hız</th>
                  <th className={th}>Hareket</th>
                </tr>
              </thead>
              <tbody>
                {t.asteroids.bodies.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100" data-asteroid={b.id}>
                    <td className={td}>
                      <span style={{ color: ASTEROID_COLOR }}>{ASTEROID_GLYPHS[b.id]}</span> {ASTEROID_LABELS[b.id]}
                    </td>
                    <td className={td}>{pos(b.sign, b.degreeInSign)}</td>
                    <td className={td}>{fx(b.longitude)}°</td>
                    <td className={td}>{fx(b.latitude, 2)}°</td>
                    <td className={td}>{b.house === null ? "—" : `${b.house}. ev`}</td>
                    <td className={td}>{fx(b.speed)}°/gün</td>
                    <td className={td}>{b.retrograde ? "Geri (℞)" : "İleri"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
          <p className="mt-2 text-[11px] text-slate-500">{EXTRA_POINTS_METHOD_TEXT}</p>
        </Box>
      )}

      {t.lilith && (
        <Box title="Kara Ay Lilith — ortalama ve gerçek (ayrı noktalar)" testId="astro-extra-lilith">
          <Scroll>
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>Değişken</th>
                  <th className={th}>Burç ve derece</th>
                  <th className={th}>Boylam</th>
                  <th className={th}>Enlem</th>
                  <th className={th}>Ev</th>
                  <th className={th}>Günlük hız</th>
                  <th className={th}>Hareket</th>
                </tr>
              </thead>
              <tbody>
                {(["mean", "true"] as LilithVariant[]).map((v) => {
                  const x = t.lilith![v];
                  return (
                    <tr key={v} className="border-t border-slate-100" data-lilith={v}>
                      <td className={td}>
                        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: LILITH_COLORS[v] }} aria-hidden />
                        <span style={{ color: LILITH_COLORS[v] }} className="font-medium">
                          {LILITH_LABELS[v]}
                        </span>
                      </td>
                      <td className={td}>{pos(x.sign, x.degreeInSign)}</td>
                      <td className={td}>{fx(x.longitude)}°</td>
                      <td className={td}>{fx(x.latitude, 2)}°</td>
                      <td className={td}>{x.house === null ? "—" : `${x.house}. ev`}</td>
                      <td className={td}>{fx(x.speed)}°/gün</td>
                      <td className={td}>{x.retrograde ? "Geri (℞)" : "İleri"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Scroll>
          <p className="mt-2 text-[11px] text-slate-500">
            Ortalama ile gerçek Lilith arasındaki fark: {fx(Math.abs(((t.lilith.mean.longitude - t.lilith.true.longitude + 540) % 360) - 180), 2)}°. İki değer birbirinin yerine kullanılmaz; natal haritadaki Kara Ay Lilith ortalama değerdir.
          </p>
        </Box>
      )}

      {t.lots && (
        <Box title="Hermetik lotlar" testId="astro-extra-lots">
          <p className="mb-2 text-xs text-slate-700" data-testid="astro-extra-sect">
            {SECT_LABELS[t.lots.sect]}
          </p>
          <Scroll>
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className={th}>Lot</th>
                  <th className={th}>Burç ve derece</th>
                  <th className={th}>Boylam</th>
                  <th className={th}>Kullanılan formül</th>
                  <th className={th}>Gelenek</th>
                </tr>
              </thead>
              <tbody>
                {t.lots.lots.map((l) => {
                  // Metodolojisi doğrulanmamış lot: burç/derece ve boylam gösterilmez (kayıtlı veri değişmez).
                  const held = lotPositionWithheld(l);
                  return (
                    <tr key={l.id} className="border-t border-slate-100" data-lot={l.id} data-lot-withheld={held ? "1" : undefined}>
                      <td className={td}>{LOT_LABELS[l.id]}</td>
                      <td className={td}>{held ? <span className="italic text-slate-500">{LOT_WITHHELD_CELL}</span> : pos(l.sign, l.degreeInSign)}</td>
                      <td className={td}>{held ? "—" : `${fx(l.longitude)}°`}</td>
                      <td className={td}>{lotFormulaText(l)}</td>
                      <td className={td}>
                        {l.localFrom && !held ? (
                          <span className="font-medium text-indigo-800" data-testid={`astro-extra-lot-local-${l.id}`} title={LOT_VICTORY_LOCAL_NOTE}>
                            Paulus (yerel hesap) †
                          </span>
                        ) : l.traditional && !held ? (
                          <span className="text-emerald-700">Paulus ile aynı</span>
                        ) : (
                          <span className="font-medium text-amber-800" data-testid={`astro-extra-lot-nontrad-${l.id}`}>
                            {l.traditional ? "Doğrulanıyor *" : "Yöntem farkı *"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Scroll>
          {t.lots.lots.some((l) => lotPositionWithheld(l)) && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="astro-extra-lot-note">
              * {t.lots.lots.some((l) => lotPositionWithheld(l) && l.id === "victory") ? LOT_VICTORY_NOTE : LOT_NONTRADITIONAL_NOTE}
            </p>
          )}
          {t.lots.lots.some((l) => l.localFrom && !lotPositionWithheld(l)) && (
            <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900" data-testid="astro-extra-lot-local-note">
              † {LOT_VICTORY_LOCAL_NOTE}
            </p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">{LOTS_METHOD_TEXT}</p>
          <p className="mt-1 text-[11px] text-slate-500">{FORTUNE_SINGLE_SOURCE_NOTE}</p>
        </Box>
      )}

      {nc && (t.lots || t.lilith) && (
        <Box title="Natal harita ile tutarlılık" testId="astro-extra-natal-check">
          <ul className="flex flex-col gap-1 text-xs">
            {t.lilith && (
              <li data-check="mean-lilith">
                Ortalama Lilith ↔ natal Kara Ay Lilith: <b className={STATUS_TONE[nc.meanLilith.status]}>{CONSISTENCY_LABELS[nc.meanLilith.status]}</b> (fark {fmtDiffDeg(nc.meanLilith.diffDeg)})
              </li>
            )}
            {t.lots && (
              <li data-check="fortune">
                Şans Noktası ↔ natal Şans Noktası: <b className={STATUS_TONE[nc.fortune.status]}>{CONSISTENCY_LABELS[nc.fortune.status]}</b> (fark {fmtDiffDeg(nc.fortune.diffDeg)}; lot {nc.fortune.lotSect === "night" ? "gece" : "gündüz"}, natal {nc.fortune.natalSect === null ? "—" : nc.fortune.natalSect === "night" ? "gece" : "gündüz"})
              </li>
            )}
            {t.lots && (
              <li data-check="lot-formulas">
                Yedi lotun natal Yükselen ve gezegenlerden aritmetik denetimi: <b className={STATUS_TONE[nc.lotFormulas.status]}>{CONSISTENCY_LABELS[nc.lotFormulas.status]}</b> (en büyük fark {fmtDiffDeg(nc.lotFormulas.maxDiffDeg)})
              </li>
            )}
          </ul>
        </Box>
      )}
    </div>
  );
}

const LOT_LEGEND_WORD: Record<LotId, string> = { fortune: "Şans", spirit: "Ruh", eros: "Eros", necessity: "Zorunluluk", courage: "Cesaret", victory: "Zafer", nemesis: "Nemesis" };

function Legend({ t }: { t: ExtraPointsTechnical }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
      <span>İç halka: natal harita</span>
      {t.asteroids && <span style={{ color: ASTEROID_COLOR }}>⚳⚴⚵⚶ asteroitler</span>}
      {t.lilith && <span style={{ color: LILITH_COLORS.mean }}>{LILITH_SHORT.mean}: ortalama Lilith</span>}
      {t.lilith && <span style={{ color: LILITH_COLORS.true }}>{LILITH_SHORT.true}: gerçek Lilith</span>}
      {t.lots && (
        <span style={{ color: LOT_COLOR }}>
          {t.lots.lots
            .filter((l) => !lotPositionWithheld(l))
            .map((l) => `${LOT_SHORT[l.id]} ${LOT_LEGEND_WORD[l.id]}`)
            .join(" · ")}
        </span>
      )}
    </div>
  );
}

// ─── Çark (natal iç halka + ek noktalar dış halkası) ──────────────────────────
const SIZE = 560;
const C = SIZE / 2;
const R_OUT = 236;
const R_SIGN_IN = 204;
const R_GLYPH = 182;
const R_HOUSE_IN = 110;
const RING = 58;
const ELEMENT_COLOR: Record<string, string> = { fire: "#dc2626", earth: "#15803d", air: "#ca8a04", water: "#2563eb" };
const norm = (x: number) => ((x % 360) + 360) % 360;

type OuterPoint = { key: string; longitude: number; label: string; color: string; title: string };

function spread<T extends { key: string; longitude: number }>(items: T[], minSep: number): Map<string, number> {
  const disp = new Map(items.map((i) => [i.key, i.longitude]));
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    const order = [...items].sort((a, b) => norm(disp.get(a.key)!) - norm(disp.get(b.key)!));
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      const b = order[(i + 1) % order.length];
      if (a.key === b.key) continue;
      const gap = norm(disp.get(b.key)! - disp.get(a.key)!);
      if (gap < minSep) {
        const push = (minSep - gap) / 2 + 0.05;
        disp.set(a.key, disp.get(a.key)! - push);
        disp.set(b.key, disp.get(b.key)! + push);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return disp;
}

export function extraOuterPoints(t: ExtraPointsTechnical): OuterPoint[] {
  const out: OuterPoint[] = [];
  for (const b of t.asteroids?.bodies ?? []) out.push({ key: `a:${b.id}`, longitude: b.longitude, label: ASTEROID_GLYPHS[b.id], color: ASTEROID_COLOR, title: `${ASTEROID_LABELS[b.id]} — ${pos(b.sign, b.degreeInSign)}${b.retrograde ? " ℞" : ""}` });
  if (t.lilith)
    for (const v of ["mean", "true"] as LilithVariant[]) {
      const x = t.lilith[v];
      out.push({ key: `l:${v}`, longitude: x.longitude, label: LILITH_SHORT[v], color: LILITH_COLORS[v], title: `${LILITH_LABELS[v]} — ${pos(x.sign, x.degreeInSign)}${x.retrograde ? " ℞" : ""}` });
    }
  for (const l of (t.lots?.lots ?? []).filter((x) => !lotPositionWithheld(x))) out.push({ key: `o:${l.id}`, longitude: l.longitude, label: LOT_SHORT[l.id], color: LOT_COLOR, title: `${LOT_LABELS[l.id]} — ${pos(l.sign, l.degreeInSign)}` });
  return out;
}

export function ExtraPointsWheel({ t, frame }: { t: ExtraPointsTechnical; frame: ExtraNatalFrame }) {
  const asc = frame.angles.ascendant.longitude;
  const pt = (r: number, lon: number) => {
    const a = ((180 + (lon - asc)) * Math.PI) / 180;
    return { x: C + r * Math.cos(a), y: C - r * Math.sin(a) };
  };
  // Natal iç halka: ortalama Lilith natalde de var → ek noktalar katmanında çizildiği için iç halkada tekrar ÇİZİLMEZ (karışmasın).
  const inner = frame.bodies.filter((b) => (t.lilith ? b.id !== "lilith" : true) && (b.id as string) in BODY_GLYPHS);
  const innerDisp = spread(inner.map((b) => ({ key: b.id, longitude: b.longitude })), 7);
  const outer = extraOuterPoints(t);
  const outerDisp = spread(outer, 6.5);
  const pad = RING + 12;
  return (
    <svg viewBox={`${-pad} ${-pad} ${SIZE + 2 * pad} ${SIZE + 2 * pad}`} role="img" aria-label="Natal çark ve ek noktalar" className="mx-auto h-auto w-full max-w-[560px] select-none" data-testid="astro-extra-wheel-svg">
      <circle cx={C} cy={C} r={R_OUT + RING} fill="#fbfaff" stroke="#7c3aed" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_OUT} fill="#fffdf7" stroke="#334155" strokeWidth={1.4} />
      <circle cx={C} cy={C} r={R_SIGN_IN} fill="#ffffff" stroke="#334155" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_HOUSE_IN} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.8} />
      {SIGN_IDS.map((s, i) => {
        const p1 = pt(R_SIGN_IN, i * 30);
        const p2 = pt(R_OUT, i * 30);
        const g = pt((R_SIGN_IN + R_OUT) / 2, i * 30 + 15);
        return (
          <g key={s}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#334155" strokeWidth={0.8} />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={17} fill={ELEMENT_COLOR[SIGN_ELEMENT[s]]}>
              <title>{SIGN_LABELS[s]}</title>
              {SIGN_GLYPHS[s]}
            </text>
          </g>
        );
      })}
      {frame.houses.map((h, i) => {
        const next = frame.houses[(i + 1) % frame.houses.length];
        const a = [1, 4, 7, 10].includes(h.number);
        const p1 = pt(R_HOUSE_IN, h.longitude);
        const p2 = pt(a ? R_OUT + 4 : R_SIGN_IN, h.longitude);
        const mid = pt(R_HOUSE_IN - 14, h.longitude + norm(next.longitude - h.longitude) / 2);
        return (
          <g key={h.number}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={a ? "#0f172a" : "#94a3b8"} strokeWidth={a ? 1.5 : 0.7} />
            <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#475569">
              {h.number}
            </text>
          </g>
        );
      })}
      {inner.map((b) => {
        const d = innerDisp.get(b.id) ?? b.longitude;
        const t1 = pt(R_SIGN_IN, b.longitude);
        const t2 = pt(R_SIGN_IN - 8, b.longitude);
        const g = pt(R_GLYPH, d);
        return (
          <g key={b.id} data-natal-body={b.id}>
            <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="#0f172a" strokeWidth={1.1} />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={16} fill="#0f172a">
              <title>{`Natal ${BODY_LABELS[b.id as BodyId]} — ${pos(b.sign, b.degreeInSign)}${b.retrograde ? " ℞" : ""}`}</title>
              {BODY_GLYPHS[b.id as BodyId]}
            </text>
          </g>
        );
      })}
      {outer.map((p) => {
        const d = outerDisp.get(p.key) ?? p.longitude;
        const t1 = pt(R_OUT, p.longitude);
        const t2 = pt(R_OUT + 8, p.longitude);
        const g = pt(R_OUT + 30, d);
        return (
          <g key={p.key} data-extra-point={p.key}>
            <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={p.color} strokeWidth={1.5} />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={p.label.length > 2 ? 10 : 15} fontWeight={600} fill={p.color}>
              <title>{p.title}</title>
              {p.label}
            </text>
          </g>
        );
      })}
      {[
        { lon: asc, t: "ASC" },
        { lon: frame.angles.midheaven.longitude, t: "MC" },
      ].map((a) => {
        const q = pt(R_HOUSE_IN - 30, a.lon);
        return (
          <text key={a.t} x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" fontSize={9.5} fontWeight={700} fill="#0f172a">
            {a.t}
          </text>
        );
      })}
    </svg>
  );
}

/** Sistem Yorumu: nokta başına kısa sağlayıcı açıklaması AYNEN (düz metin; React kaçışlı). */
export function ExtraPointsInterpretationView({ c }: { c: ExtraPointsInterpretation }) {
  const item = (key: string, title: ReactNode, text: string | null, note?: string | null) =>
    text ? (
      <div key={key} className="rounded-lg bg-white px-3 py-2 max-sm:px-2">
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 whitespace-pre-line">{text}</p>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
    ) : null;
  return (
    <div className="flex flex-col gap-2" data-testid="astro-extra-interp">
      <p className="text-xs text-slate-500">{EXTRA_POINTS_INTERP_NOTE}</p>
      {c.asteroids?.items.map((x) => item(`a${x.id}`, `${ASTEROID_GLYPHS[x.id]} ${ASTEROID_LABELS[x.id]}`, x.text))}
      {c.lilith?.items.map((x) => item(`l${x.variant}`, <span style={{ color: LILITH_COLORS[x.variant] }}>{LILITH_LABELS[x.variant]}</span>, x.text, x.note))}
      {/* Gizlenen lotun açıklaması burcunu söyler → gösterilmez. */}
      {c.lots?.items.filter((x) => !lotPositionWithheld({ id: x.id })).map((x) => item(`o${x.id}`, LOT_LABELS[x.id], x.text))}
    </div>
  );
}
