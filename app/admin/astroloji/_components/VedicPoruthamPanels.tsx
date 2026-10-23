"use client";

/**
 * 2026-10-22 gece — Güney Hint On Porutham (Dashakoot) ve Papasamyam TEKNİK görünümleri. Yalnız kanonik teknik katman
 * (sağlayıcı yanıtının doğrulanmış alanları) gösterilir; sağlayıcının hüküm / öneri / açıklama cümleleri BU panellerde YOK —
 * yalnız yorum yetkisiyle ayrı "Otomatik Yorum" panelinde. Kısıt gerekçeleri Yaşam'ın nötr şablonudur. Hesap YAPILMAZ:
 * tablo / sayım / çubuk yalnız düzenlemedir. Canlı sonuç ve kayıtlı analiz (arşiv) aynı bileşenleri kullanır. Mobil (390) ve
 * tablet (768): tablolar yatay kaydırılır, kartlar tek sütuna iner. Gun Milan paneliyle AYNI tasarım dili, AYRI bölüm.
 */

import { formatDegree, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS, NAKSHATRA_LABELS } from "@/lib/astrology/topics/vedic";
import { AYANAMSA_SHORT, type MatchMoon } from "@/lib/astrology/model/vedicMatch";
import {
  DASHAKOOT_DIRECTION_TEXT,
  DASHAKOOT_METHOD_TEXT,
  DASHAKOOT_VERDICT_LABELS,
  PAPA_REFERENCE_LABELS,
  PAPASAMYAM_METHOD_TEXT,
  PAPASAMYAM_VERDICT_LABELS,
  PORUTHAM_BASIS,
  PORUTHAM_COUNT_NOTE,
  PORUTHAM_DIRECTIONAL,
  PORUTHAM_LABELS,
  PORUTHAM_ROLE_LABELS,
  poruthamRoleNames,
  rajjuReasonText,
  vedhaReasonText,
  type PapaPerson,
  type VedicDashakootInterpretation,
  type VedicDashakootTechnical,
  type VedicPapasamyamInterpretation,
  type VedicPapasamyamTechnical,
} from "@/lib/astrology/model/vedicPorutham";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const trNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace(".", ","));

function MoonCell({ m }: { m: MatchMoon | null | undefined }) {
  if (!m) return <span className="text-slate-400">—</span>;
  return (
    <span>
      <span className="mr-1">{SIGN_GLYPHS[m.rashi]}</span>
      {SIGN_LABELS[m.rashi]} · {NAKSHATRA_LABELS[m.nakshatra] ?? m.nakshatra} {m.pada}. pada
    </span>
  );
}

function Roles({ names, testid, order }: { names: [string, string]; testid: string; order: string }) {
  return (
    <div className="mt-2 grid min-w-0 gap-1 text-xs text-slate-700 sm:grid-cols-2" data-testid={testid} data-order={order}>
      <span>
        {PORUTHAM_ROLE_LABELS.person1}: <strong>{names[0]}</strong>
      </span>
      <span>
        {PORUTHAM_ROLE_LABELS.person2}: <strong>{names[1]}</strong>
      </span>
    </div>
  );
}

// ─── On Porutham (Dashakoot) ─────────────────────────────────────────────────
export function DashakootPanel({ t, names: who }: { t: VedicDashakootTechnical; names: [string, string] }) {
  const names = poruthamRoleNames(t, who);
  const anyConstraint = t.rajju.active || t.vedha.active;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-dashakoot-panel">
      <section className={`${card} p-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-700">On Porutham (Dashakoot) — teknik değerlendirme</h4>
          <span className="text-xs text-slate-500">
            sidereal · {AYANAMSA_SHORT[t.frame.ayanamsa]} ({formatDegree(t.frame.ayanamsaDegrees)})
          </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-indigo-950" data-testid="astro-dashakoot-total">
          {t.total} <span className="text-base font-normal text-slate-500">/ 10 kriter karşılandı</span>
        </p>
        <div className="mt-1 grid grid-cols-10 gap-0.5" aria-hidden="true">
          {t.rows.map((r) => (
            <span key={r.id} className={`h-2 rounded-sm ${r.matched ? "bg-indigo-500" : "bg-slate-200"}`} />
          ))}
        </div>
        <Roles names={names} testid="astro-dashakoot-roles" order={t.order ?? "client_first"} />
        <p className="mt-1 text-xs text-slate-500" data-testid="astro-dashakoot-direction">
          {DASHAKOOT_DIRECTION_TEXT}
        </p>
      </section>

      <section className={`${card} p-3`} data-testid="astro-dashakoot-constraints">
        <h4 className="text-sm font-semibold text-slate-700">Kesin kısıtlar (Rajju / Vedha)</h4>
        <ul className="mt-2 grid min-w-0 gap-2 md:grid-cols-2">
          <li className={`min-w-0 rounded-lg border px-3 py-2 text-sm ${t.rajju.active ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-slate-50"}`} data-testid="astro-dashakoot-rajju" data-active={String(t.rajju.active)}>
            <div className="font-medium text-slate-800">Rajju kısıtı: {t.rajju.active ? "etkin" : "etkin değil"}</div>
            <div className="text-xs text-slate-600">{rajjuReasonText(t.rajju)}</div>
          </li>
          <li className={`min-w-0 rounded-lg border px-3 py-2 text-sm ${t.vedha.active ? "border-amber-300 bg-amber-50" : "border-slate-100 bg-slate-50"}`} data-testid="astro-dashakoot-vedha" data-active={String(t.vedha.active)}>
            <div className="font-medium text-slate-800">Vedha kısıtı: {t.vedha.active ? "etkin" : "etkin değil"}</div>
            <div className="text-xs text-slate-600">{vedhaReasonText(t.vedha)}</div>
          </li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">
          {anyConstraint
            ? "Gelenekte etkin bir kesin kısıt, karşılanan kriter sayısından bağımsız olarak ayrıca değerlendirilir."
            : "Kesin kısıt etkin değil; değerlendirme kriter tablosuyla birlikte yapılır."}
        </p>
      </section>

      {t.moons && (
        <section className={`${card} overflow-x-auto`} data-testid="astro-dashakoot-moons">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={th}>Rol</th>
                <th className={th}>Doğumdaki Ay (Vedik D1 kaydından)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className={td}>1. rol — {names[0]}</td>
                <td className={td}>
                  <MoonCell m={t.moons.person1} />
                </td>
              </tr>
              <tr>
                <td className={td}>2. rol — {names[1]}</td>
                <td className={td}>
                  <MoonCell m={t.moons.person2} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[44rem]" data-testid="astro-dashakoot-table">
          <thead>
            <tr>
              <th className={th}>Kriter</th>
              <th className={th}>Neye bakılır</th>
              <th className={th}>1. rol — {names[0]}</th>
              <th className={th}>2. rol — {names[1]}</th>
              <th className={th}>Sayım</th>
              <th className={th}>Sonuç</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.rows.map((r) => (
              <tr key={r.id} data-testid={`astro-porutham-${r.id}`} data-matched={String(r.matched)}>
                <td className={`${td} font-medium`}>
                  {PORUTHAM_LABELS[r.id]}
                  {PORUTHAM_DIRECTIONAL.has(r.id) && <span className="ml-1 text-[11px] font-normal text-slate-500">(yönlü)</span>}
                </td>
                <td className={`${td} text-xs text-slate-600`}>{PORUTHAM_BASIS[r.id]}</td>
                <td className={td}>{r.person1.label}</td>
                <td className={td}>{r.person2.label}</td>
                <td className={`${td} tabular-nums`}>{r.count ?? "—"}</td>
                <td className={td}>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${r.matched ? "bg-indigo-50 text-indigo-800" : "bg-slate-100 text-slate-600"}`}>
                    {r.matched ? "karşılandı · 1" : "karşılanmadı · 0"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-2 pb-2 text-xs text-slate-500">{PORUTHAM_COUNT_NOTE}</p>
      </section>
      <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-dashakoot-method">
        {DASHAKOOT_METHOD_TEXT}
      </p>
    </div>
  );
}

// ─── Papasamyam ──────────────────────────────────────────────────────────────
function PapaCard({ p, title, testid }: { p: PapaPerson; title: string; testid: string }) {
  return (
    <section className={`${card} overflow-x-auto`} data-testid={testid}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <span className="text-sm tabular-nums text-slate-800">
          toplam <strong>{trNum(p.total)}</strong>
        </span>
      </div>
      <table className="w-full min-w-[26rem]">
        <thead>
          <tr>
            <th className={th}>Referans</th>
            <th className={th}>Ağırlık</th>
            <th className={th}>Malefik — ev</th>
            <th className={th}>Katkı</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {p.byReference.map((r) => (
            <tr key={r.reference} data-testid={`${testid}-${r.reference}`}>
              <td className={`${td} font-medium`}>{PAPA_REFERENCE_LABELS[r.reference]}</td>
              <td className={`${td} tabular-nums`}>{trNum(r.weight)}</td>
              <td className={td}>{r.afflictions.length ? r.afflictions.map((a) => `${GRAHA_LABELS[a.graha] ?? a.graha} — ${a.house}. ev`).join(" · ") : <span className="text-slate-500">katkı yok</span>}</td>
              <td className={`${td} tabular-nums`}>
                {r.afflictions.length} × {trNum(r.weight)} = {trNum(r.points)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function PapasamyamPanel({ t, names: who }: { t: VedicPapasamyamTechnical; names: [string, string] }) {
  const names = poruthamRoleNames(t, who);
  const max = Math.max(t.person1.total, t.person2.total, 0.25);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-papasamyam-panel">
      <section className={`${card} p-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-700">Papasamyam — teknik değerlendirme</h4>
          <span className="text-xs text-slate-500">
            sidereal · {AYANAMSA_SHORT[t.frame.ayanamsa]} ({formatDegree(t.frame.ayanamsaDegrees)})
          </span>
        </div>
        <div className="mt-2 flex flex-col gap-1.5" data-testid="astro-papasamyam-totals">
          {(
            [
              ["person1", t.person1.total],
              ["person2", t.person2.total],
            ] as const
          ).map(([k, v], i) => (
            <div key={k} className="grid min-w-0 grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-sm max-sm:grid-cols-[1fr_auto]">
              <span className="truncate text-slate-700">
                {PORUTHAM_ROLE_LABELS[k]} — {names[i]}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-slate-100 max-sm:col-span-2 max-sm:row-start-2" aria-hidden="true">
                <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${(v / max) * 100}%` }} />
              </span>
              <span className="tabular-nums text-slate-900">{trNum(v)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-800" data-testid="astro-papasamyam-comparison" data-comparison={t.comparison}>
          Karşılaştırma kuralı (2. rol toplamı ≤ 1. rol toplamı):{" "}
          <strong>{t.comparison === "within" ? "sağlanıyor" : "sağlanmıyor"}</strong> · fark (1. rol − 2. rol): {trNum(t.difference)}
        </p>
        <Roles names={names} testid="astro-papasamyam-roles" order={t.order ?? "client_first"} />
      </section>
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <PapaCard p={t.person1} title={`1. rol — ${names[0]}`} testid="astro-papa-1" />
        <PapaCard p={t.person2} title={`2. rol — ${names[1]}`} testid="astro-papa-2" />
      </div>
      <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-papasamyam-method">
        {PAPASAMYAM_METHOD_TEXT}
      </p>
    </div>
  );
}

// ─── Yorum katmanı (yalnız yorum yetkisiyle; ProviderInterpretationPanel çağırır) ───
const WARN =
  "Bu bölüm hesaplama servisinin otomatik değerlendirme cümleleridir ve hüküm dili içerebilir; kriter sonuçları ve kısıtlar teknik bölümdedir. Uzman değerlendirmesi değildir; evlilik kararı için tek başına kullanılmamalıdır.";

export function DashakootInterpContent({ c }: { c: VedicDashakootInterpretation }) {
  return (
    <div className="flex flex-col gap-2" data-testid="astro-dashakoot-interp">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{WARN}</p>
      {c.verdict && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Servisin genel değerlendirmesi</div>
          <p className="mt-0.5">{DASHAKOOT_VERDICT_LABELS[c.verdict]} (eşik servis geleneğidir; gelenek bir puan değil, kriter kümesi adlandırır).</p>
        </div>
      )}
      {c.recommendation && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Otomatik değerlendirme cümlesi</div>
          <p className="mt-0.5 whitespace-pre-line">{c.recommendation}</p>
        </div>
      )}
      {(c.rajjuReason || c.vedhaReason) && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Kısıt açıklamaları</div>
          {c.rajjuReason && <p className="mt-0.5">Rajju: {c.rajjuReason}</p>}
          {c.vedhaReason && <p className="mt-0.5">Vedha: {c.vedhaReason}</p>}
        </div>
      )}
      {c.notes.length > 0 && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Kriter açıklamaları</div>
          <ul className="ml-4 mt-0.5 list-disc">
            {c.notes.map((n) => (
              <li key={n.id}>
                <span className="font-medium">{PORUTHAM_LABELS[n.id]}:</span> {n.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PapasamyamInterpContent({ c }: { c: VedicPapasamyamInterpretation }) {
  return (
    <div className="flex flex-col gap-2" data-testid="astro-papasamyam-interp">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{WARN}</p>
      {c.verdict && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Servisin genel değerlendirmesi</div>
          <p className="mt-0.5">{PAPASAMYAM_VERDICT_LABELS[c.verdict]}</p>
        </div>
      )}
      {c.recommendation && (
        <div className="rounded-lg bg-white px-3 py-2 max-sm:px-0">
          <div className="font-medium">Otomatik değerlendirme cümlesi</div>
          <p className="mt-0.5 whitespace-pre-line">{c.recommendation}</p>
        </div>
      )}
    </div>
  );
}
