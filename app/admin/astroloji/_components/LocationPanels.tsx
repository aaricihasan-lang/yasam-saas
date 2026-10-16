"use client";

/**
 * Aşama 4 teknik görünümleri — Astrocartography · Relocation · Local Space. Yalnız kanonik teknik katman;
 * etiketler Yaşam sözlüğünden. Sağlayıcı yorumu burada YOK (ayrı panel). Harita/pusula çizimleri yalnız
 * sağlayıcının verdiği koordinat/azimutlardan üretilir (uydurma veri yok).
 */

import { useMemo, useState, type ReactNode } from "react";
import type { BodyId, SignId } from "@/lib/astrology/model/western";
import type { AcgAngle, AstrocartographyTechnical, LocalSpaceTechnical, RelocationTechnical } from "@/lib/astrology/model/westernLocation";
import { BODY_GLYPHS, BODY_LABELS, HOUSE_SYSTEM_LABELS, SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { ACG_ANGLE_LABEL, BODY_COLORS, CLASSICAL, acgMapLines, acgMcLabels, compassPoint, localSpaceMapLines, type MapLabel, type MapMarker } from "../_lib/locationMaps";
import WorldMap from "./WorldMap";

// 2026-10-15: saf çizgi üreticileri _lib/locationMaps.ts'e taşındı (Word/PDF raporu aynı fonksiyonları kullanır); eski dışa aktarımlar korunur.
export { BODY_COLORS, acgMapLines, compassPoint, localSpaceMapLines } from "../_lib/locationMaps";
import NatalWheel from "./NatalWheel";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";

export type Place = { lat: number; lon: number; label: string };

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        {right}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
function SignCell({ sign, degree }: { sign: SignId; degree: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1">{SIGN_GLYPHS[sign]}</span>
      {SIGN_LABELS[sign]} {formatDegree(degree)}
    </span>
  );
}
const lonText = (lon: number) => `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "D" : "B"}`;
const latText = (lat: number) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "K" : "G"}`;

// ─── Astrocartography ───────────────────────────────────────────────────────
export function AstrocartographyPanel({ t, birthplace }: { t: AstrocartographyTechnical; birthplace: Place | null }) {
  const available = t.bodies.map((b) => b.id);
  const [bodies, setBodies] = useState<Set<BodyId>>(() => new Set(available.filter((id) => CLASSICAL.has(id))));
  const [angles, setAngles] = useState<Set<AcgAngle>>(() => new Set<AcgAngle>(["mc", "ic", "asc", "dsc"]));
  const lines = useMemo(() => acgMapLines(t, bodies, angles), [t, bodies, angles]);
  const labels: MapLabel[] = useMemo(() => acgMcLabels(t, bodies, angles), [t, bodies, angles]);
  const markers: MapMarker[] = birthplace ? [{ key: "birth", lat: birthplace.lat, lon: birthplace.lon, label: `Doğum: ${birthplace.label}` }] : [];
  const toggle = <T,>(set: Set<T>, v: T, on: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    on(n);
  };
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-acg-panel">
      <p className="text-xs text-slate-500">
        Hatlar yalnız doğum ANINA bağlıdır: MC/IC sabit boylamlı meridyenler, AC/DC enleme göre eğrilen doğuş/batış hatlarıdır. Sağlayıcı örneklemesi:{" "}
        {t.sampling.latitudeMin}°…{t.sampling.latitudeMax}° enlem. Ay Düğümü hattı GERÇEK (true) düğümdür (golden doğrulaması; sağlayıcı belgesi &ldquo;ortalama&rdquo; der).
      </p>
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" data-testid="astro-acg-filters">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-600">Gök cisimleri:</span>
          {available.map((id) => (
            <label key={id} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${bodies.has(id) ? "border-slate-400 bg-white" : "border-slate-200 text-slate-400"}`}>
              <input type="checkbox" checked={bodies.has(id)} onChange={() => toggle(bodies, id, setBodies)} data-acg-body={id} />
              <span style={{ color: BODY_COLORS[id] }}>{BODY_GLYPHS[id]}</span> {BODY_LABELS[id]}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-600">Açılar:</span>
          {(["mc", "ic", "asc", "dsc"] as const).map((a) => (
            <label key={a} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${angles.has(a) ? "border-slate-400 bg-white" : "border-slate-200 text-slate-400"}`}>
              <input type="checkbox" checked={angles.has(a)} onChange={() => toggle(angles, a, setAngles)} data-acg-angle={a} />
              {ACG_ANGLE_LABEL[a]} <span className="text-slate-400">{a === "mc" || a === "asc" ? "———" : a === "ic" ? "– – –" : "· · ·"}</span>
            </label>
          ))}
          <button type="button" className="ml-auto rounded-lg border border-slate-300 px-2 py-0.5 text-xs" onClick={() => (setBodies(new Set(available)), setAngles(new Set<AcgAngle>(["mc", "ic", "asc", "dsc"])))}>
            Tümünü göster
          </button>
          <button type="button" className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs" onClick={() => setBodies(new Set())}>
            Tümünü gizle
          </button>
        </div>
        <span className="text-[11px] text-slate-500" data-testid="astro-acg-count">
          {lines.length} hat gösteriliyor
        </span>
      </div>
      <WorldMap lines={lines} markers={markers} labels={labels} ariaLabel="Astrocartography dünya haritası" />
      <Section title="Hat verileri (teknik)">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Gök cismi</th>
              <th className={th}>MC boylamı</th>
              <th className={th}>IC boylamı</th>
              <th className={th}>RA / Dec</th>
              <th className={th}>Kutup sınırı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bodies.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <span className="mr-1.5" style={{ color: BODY_COLORS[b.id] }}>
                    {BODY_GLYPHS[b.id]}
                  </span>
                  {BODY_LABELS[b.id]}
                </td>
                <td className={`${td} tabular-nums`}>{lonText(b.mcLongitude)}</td>
                <td className={`${td} tabular-nums`}>{lonText(b.icLongitude)}</td>
                <td className={`${td} tabular-nums text-xs`}>
                  {b.rightAscension.toFixed(2)}° / {b.declination.toFixed(2)}°
                </td>
                <td className={`${td} tabular-nums text-xs`}>{b.asc.circumpolarBeyond !== null ? `±${b.asc.circumpolarBeyond.toFixed(1)}°` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ─── Relocation ─────────────────────────────────────────────────────────────
export function RelocationPanel({ t, targetLabel, birthLabel }: { t: RelocationTechnical; targetLabel: string; birthLabel: string | null }) {
  const n = t.natal;
  const changed = new Map(t.changes.planetsChangedHouse.map((c) => [c.id, c]));
  const natalHouse = (id: BodyId) => changed.get(id)?.natalHouse ?? n?.bodyHouses.find((x) => x.id === id)?.house ?? null;
  const markers: MapMarker[] = [
    { key: "birth", lat: t.birthPlace.latitude, lon: t.birthPlace.longitude, label: `Doğum${birthLabel ? `: ${birthLabel}` : ""}`, color: "#64748b" },
    { key: "target", lat: t.target.latitude, lon: t.target.longitude, label: `Hedef: ${targetLabel}`, color: "#7c3aed" },
  ];
  const DIR: Record<string, string> = { n: "kuzey", nne: "kuzey-kuzeydoğu", ne: "kuzeydoğu", ene: "doğu-kuzeydoğu", e: "doğu", ese: "doğu-güneydoğu", se: "güneydoğu", sse: "güney-güneydoğu", s: "güney", ssw: "güney-güneybatı", sw: "güneybatı", wsw: "batı-güneybatı", w: "batı", wnw: "batı-kuzeybatı", nw: "kuzeybatı", nnw: "kuzey-kuzeybatı" };
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-relocation-panel">
      <p className="text-sm text-slate-700">
        <strong>Doğum anı aynı, yalnız konum değişti.</strong> Hedef: {targetLabel} ({latText(t.target.latitude)}, {lonText(t.target.longitude)}) · doğum yerinden{" "}
        {Math.round(t.changes.distanceKm).toLocaleString("tr-TR")} km{t.changes.direction ? `, ${DIR[t.changes.direction]}` : ""} · {HOUSE_SYSTEM_LABELS[t.houseSystem]}
      </p>
      <p className="text-xs text-slate-500">Gezegenlerin burç/derecesi natal ile aynıdır; değişen yalnız Yükselen/MC, ev başlangıçları ve gezegenlerin evleridir.</p>
      <div className="grid gap-3 xl:grid-cols-2">
        <NatalWheel technical={{ bodies: t.bodies, houses: t.houses, angles: t.angles, aspects: [] }} label="Relocation çarkı" />
        <WorldMap lines={[]} markers={markers} ariaLabel="Relocation hedef haritası" />
      </div>
      <Section title="Natal ↔ Relocation (teknik karşılaştırma)">
        <table className="min-w-full" data-testid="astro-relocation-compare">
          <thead>
            <tr>
              <th className={th}>Unsur</th>
              <th className={th}>Natal (doğum yeri)</th>
              <th className={`${th} normal-case`}>RELOCATION ({targetLabel})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className={t.changes.ascendantSignChanged ? "bg-amber-50" : ""}>
              <td className={td}>Yükselen (ASC)</td>
              <td className={td}>{n?.angles ? <SignCell sign={n.angles.ascendant.sign} degree={n.angles.ascendant.degreeInSign} /> : "—"}</td>
              <td className={td}>
                <SignCell sign={t.angles.ascendant.sign} degree={t.angles.ascendant.degreeInSign} />
              </td>
            </tr>
            <tr className={n?.angles && n.angles.midheaven.sign !== t.angles.midheaven.sign ? "bg-amber-50" : ""}>
              <td className={td}>Tepe Noktası (MC)</td>
              <td className={td}>{n?.angles ? <SignCell sign={n.angles.midheaven.sign} degree={n.angles.midheaven.degreeInSign} /> : "—"}</td>
              <td className={td}>
                <SignCell sign={t.angles.midheaven.sign} degree={t.angles.midheaven.degreeInSign} />
              </td>
            </tr>
            {t.houses.map((h) => {
              const nh = n?.houses.find((x) => x.number === h.number);
              return (
                <tr key={h.number}>
                  <td className={td}>{h.number}. ev başlangıcı</td>
                  <td className={td}>{nh ? <SignCell sign={nh.sign} degree={nh.degreeInSign} /> : "—"}</td>
                  <td className={td}>
                    <SignCell sign={h.sign} degree={h.degreeInSign} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!n && <p className="px-3 py-2 text-xs text-amber-800">Natal karşılaştırma birimi bu sonuçta yok (yalnız relocation gösteriliyor).</p>}
      </Section>
      <Section title="Gezegenlerin evleri">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Gök cismi</th>
              <th className={th}>Burç / derece (değişmez)</th>
              <th className={th}>Natal ev</th>
              <th className={th}>Relocation ev</th>
              <th className={th}>Açısal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bodies.map((b) => {
              const nh = natalHouse(b.id);
              const moved = nh !== null && b.house !== null && nh !== b.house;
              return (
                <tr key={b.id} className={moved ? "bg-violet-50/50" : ""}>
                  <td className={td}>
                    <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
                    {BODY_LABELS[b.id]}
                  </td>
                  <td className={td}>
                    <SignCell sign={b.sign} degree={b.degreeInSign} />
                  </td>
                  <td className={td}>{nh ?? "—"}</td>
                  <td className={`${td} font-semibold`}>
                    {b.house ?? "—"}
                    {moved ? " ←" : ""}
                  </td>
                  <td className={td}>{t.changes.angularBodies.includes(b.id) ? "≤3° açıya" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ─── Local Space ────────────────────────────────────────────────────────────
export function LocalSpacePanel({ t, referenceLabel }: { t: LocalSpaceTechnical; referenceLabel: string }) {
  const available = t.bodies.map((b) => b.id);
  const [bodies, setBodies] = useState<Set<BodyId>>(() => new Set(available.filter((id) => CLASSICAL.has(id))));
  const lines = useMemo(() => localSpaceMapLines(t, bodies), [t, bodies]);
  const C = 160;
  const R = 130;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-local-space-panel">
      <p className="text-sm text-slate-700">
        Referans (merkez): <strong>{referenceLabel}</strong> ({latText(t.reference.latitude)}, {lonText(t.reference.longitude)}) · doğum anındaki ufuk yönleri. Kesikli = ufuk altında.
      </p>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        {available.map((id) => (
          <label key={id} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${bodies.has(id) ? "border-slate-400 bg-white" : "border-slate-200 text-slate-400"}`}>
            <input
              type="checkbox"
              checked={bodies.has(id)}
              onChange={() => {
                const n = new Set(bodies);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                setBodies(n);
              }}
            />
            <span style={{ color: BODY_COLORS[id] }}>{BODY_GLYPHS[id]}</span> {BODY_LABELS[id]}
          </label>
        ))}
        <button type="button" className="ml-auto rounded-lg border border-slate-300 px-2 py-0.5 text-xs" onClick={() => setBodies(new Set(available))}>
          Tümünü göster
        </button>
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[320px_1fr]">
        <svg viewBox={`0 0 ${C * 2} ${C * 2}`} role="img" aria-label="Local space pusulası" className="mx-auto h-auto w-full max-w-[320px]">
          <circle cx={C} cy={C} r={R} fill="#f8fafc" stroke="#94a3b8" />
          {[0, 90, 180, 270].map((az) => {
            const [x, y] = compassPoint(C, C, R + 16, az);
            return (
              <text key={az} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="#0f172a">
                {az === 0 ? "K" : az === 90 ? "D" : az === 180 ? "G" : "B"}
              </text>
            );
          })}
          {t.bodies
            .filter((b) => bodies.has(b.id))
            .map((b) => {
              const [x, y] = compassPoint(C, C, R, b.azimuth);
              const [lx, ly] = compassPoint(C, C, R - 14, b.azimuth);
              return (
                <g key={b.id} data-ls-body={b.id}>
                  <line x1={C} y1={C} x2={x} y2={y} stroke={BODY_COLORS[b.id]} strokeWidth={1.5} strokeDasharray={b.aboveHorizon ? undefined : "4 3"} />
                  <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={13} fill={BODY_COLORS[b.id]}>
                    <title>{`${BODY_LABELS[b.id]} · azimut ${b.azimuth.toFixed(1)}° · ${b.compass.toUpperCase()}`}</title>
                    {BODY_GLYPHS[b.id]}
                  </text>
                </g>
              );
            })}
          <circle cx={C} cy={C} r={3} fill="#0f172a" />
        </svg>
        <WorldMap lines={lines} markers={[{ key: "ref", lat: t.reference.latitude, lon: t.reference.longitude, label: referenceLabel }]} ariaLabel="Local space dünya haritası" />
      </div>
      <Section title="Yönler (teknik)">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Gök cismi</th>
              <th className={th}>Azimut</th>
              <th className={th}>Yön</th>
              <th className={th}>Yükseklik</th>
              <th className={th}>Ufuk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...t.bodies]
              .sort((a, b) => a.azimuth - b.azimuth)
              .map((b) => (
                <tr key={b.id}>
                  <td className={td}>
                    <span className="mr-1.5" style={{ color: BODY_COLORS[b.id] }}>
                      {BODY_GLYPHS[b.id]}
                    </span>
                    {BODY_LABELS[b.id]}
                  </td>
                  <td className={`${td} tabular-nums`}>{b.azimuth.toFixed(2)}°</td>
                  <td className={td}>{b.compass.toUpperCase()}</td>
                  <td className={`${td} tabular-nums`}>{b.altitude.toFixed(2)}°</td>
                  <td className={td}>{b.aboveHorizon ? "üstünde" : "altında"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
