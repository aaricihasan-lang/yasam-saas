"use client";

// İstatistikler — YALNIZ gerçekten toplanan kampanya sayaçları (campaign_usage_daily) ve Owner durum kayıtları.
// Ziyaret / tekil ziyaretçi / kaynak / üyelik dönüşümü HENÜZ TOPLANMIYOR: sahte veya örnek sayı gösterilmez.
import { useEffect, useState } from "react";
import { getCatalogEntry } from "@/lib/campaign/catalog";
import { MODULE_UI } from "@/lib/campaign/catalogUi";
import { campaignGet } from "./api";
import { fmt, type Stats } from "./model";
import type { PanelCtx } from "./KampanyaPanel";

type Period = 7 | 30 | 90;
type Day = { day: string; an: number; kr: number; open: boolean };

function dayList(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end && out.length < 400; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Owner durum kayıtlarından gün bazında "kampanya açık mıydı" (gün içinde herhangi bir an Aktif). */
function openDays(days: string[], events: Stats["statusEvents"]): Set<string> {
  const ev = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const status = new Map<string, string>();
  const open = new Set<string>();
  let i = 0;
  for (const day of days) {
    const dayStart = Date.parse(`${day}T00:00:00+03:00`);
    const dayEnd = dayStart + 86_400_000;
    while (i < ev.length && Date.parse(ev[i].at) < dayStart) {
      if (ev[i].campaignId) status.set(ev[i].campaignId!, ev[i].status);
      i++;
    }
    let any = [...status.values()].includes("aktif");
    while (i < ev.length && Date.parse(ev[i].at) < dayEnd) {
      if (ev[i].campaignId) status.set(ev[i].campaignId!, ev[i].status);
      if (ev[i].status === "aktif") any = true;
      i++;
    }
    if (any) open.add(day);
  }
  return open;
}

export function TabIstatistik({ ctx }: { ctx: PanelCtx }) {
  const [period, setPeriod] = useState<Period>(30);
  const [st, setSt] = useState<{ p: Period; t: number; data: Stats | null; err: string | null } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    void campaignGet<Stats>(`?istatistik=${period}`).then((r) => {
      if (alive) setSt({ p: period, t: tick, data: r.ok ? r.data : null, err: r.ok ? null : r.error });
    });
    return () => {
      alive = false;
    };
  }, [period, tick]);

  const loading = !st || st.p !== period || st.t !== tick;

  return (
    <>
      <section className="card">
        <div className="cardHead">
          <div><p className="eyebrow">Performans · gerçek sayaçlar</p><h2 className="h2">Kampanya istatistikleri</h2></div>
          <div className="seg" role="group" aria-label="Dönem">
            {([7, 30, 90] as Period[]).map((p) => <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{p} gün</button>)}
          </div>
        </div>
        {loading ? (
          <div aria-busy="true"><p className="muted">Yükleniyor…</p><div className="loadingBar" /></div>
        ) : st!.err ? (
          <div className="notice err" role="alert">{st!.err} <button className="linkBtn" onClick={() => setTick((t) => t + 1)}>Tekrar dene</button></div>
        ) : (
          <StatsBody ctx={ctx} s={st!.data!} />
        )}
      </section>
      <section className="card">
        <div className="cardHead"><div><p className="eyebrow">Henüz toplanmayan ölçümler</p><h2 className="h2">Ziyaret, kaynak ve dönüşüm</h2></div></div>
        <div className="kpiGrid">
          <NoData k="Ziyaret" /><NoData k="Tekil ziyaretçi" /><NoData k="Rapor indirme" /><NoData k="Profesyonel üyelik tıklaması" /><NoData k="Üyelik başvurusu / dönüşüm" /><NoData k="Kaynaklar (sosyal medya, UTM)" />
        </div>
        <p className="small muted" style={{ margin: "10px 0 0" }}>Bu ölçümler ziyaretçi akışı (KM-3) ve ayrı, kişisel veri içermeyen sayaç kaydı kurulunca toplanacak. Mevcut analitik sorgu dizgisini attığı için kaynak (UTM) bilgisi ayrıca kaydedilmelidir.</p>
      </section>
    </>
  );
}

function NoData({ k }: { k: string }) {
  return <div className="kpi nodata"><div className="k">{k}</div><div className="v">Veri henüz toplanmıyor</div></div>;
}

function StatsBody({ ctx, s }: { ctx: PanelCtx; s: Stats }) {
  const days = dayList(s.from, s.to);
  const open = openDays(days, s.statusEvents);
  const g = new Map(s.usage.filter((u) => u.scope === "global").map((u) => [u.day_tr, u]));
  const series: Day[] = days.map((day) => ({ day, an: g.get(day)?.used_analyses ?? 0, kr: g.get(day)?.spent_credits ?? 0, open: open.has(day) }));
  const sum = (arr: Day[], k: "an" | "kr") => arr.reduce((a, x) => a + x[k], 0);
  const totAn = sum(series, "an"), totKr = sum(series, "kr");
  const act = series.filter((x) => x.open), pas = series.filter((x) => !x.open);
  const per = (arr: Day[], k: "an" | "kr") => (arr.length ? (sum(arr, k) / arr.length).toFixed(1).replace(".", ",") : "—");
  const today = s.usage.find((u) => u.scope === "global" && u.day_tr === s.to);

  const byTech = new Map<string, { cid: string; key: string; an: number; kr: number }>();
  for (const u of s.usage) {
    const m = /^tech:([0-9a-f-]{36}):(.+)$/.exec(u.scope);
    if (!m) continue;
    const r = byTech.get(u.scope) ?? { cid: m[1], key: m[2], an: 0, kr: 0 };
    r.an += u.used_analyses;
    r.kr += u.spent_credits;
    byTech.set(u.scope, r);
  }
  const techRows = [...byTech.values()].sort((a, b) => b.an - a.an);
  const name = (cid: string) => ctx.ov.campaigns.find((c) => c.id === cid)?.name ?? "Silinmiş (arşiv) kampanya";

  return (
    <>
      <div className="kpiGrid">
        <Kpi k="Tamamlanan analiz" v={fmt(totAn)} d={`${s.days} gün · ${s.from} – ${s.to}`} />
        <Kpi k="Harcanan kredi" v={fmt(totKr)} d={totAn ? `≈ ${(totKr / totAn).toFixed(2).replace(".", ",")} kredi/analiz` : "analiz yok"} />
        <Kpi k="Bugün süren (rezerve)" v={`${fmt(today?.reserved_analyses ?? 0)} / ${fmt(today?.reserved_credits ?? 0)}`} d="analiz / kredi" />
        <Kpi k="Kampanyanın açık olduğu gün" v={fmt(act.length)} d={`${s.days} günün içinde`} />
      </div>
      {totAn === 0 && totKr === 0 ? (
        <p className="muted" style={{ marginTop: 14 }}>Bu dönemde kayıtlı kampanya kullanımı yok. Ücretsiz analiz ziyaretçiye açılana kadar (KM-3) sayaçlar sıfır kalır.</p>
      ) : (
        <div className="chartWrap" style={{ marginTop: 14 }}><Chart series={series} /></div>
      )}
      <div className="cmp" style={{ marginTop: 14 }}>
        <div className="cmpCol"><h4>Kampanya açıkken ({act.length} gün)</h4><dl><dt>Analiz / gün</dt><dd>{per(act, "an")}</dd><dt>Kredi / gün</dt><dd>{per(act, "kr")}</dd></dl></div>
        <div className="cmpCol"><h4>Kampanya kapalıyken ({pas.length} gün)</h4><dl><dt>Analiz / gün</dt><dd>{per(pas, "an")}</dd><dt>Kredi / gün</dt><dd>{per(pas, "kr")}</dd></dl></div>
      </div>
      <p className="small muted" style={{ margin: "8px 0 0" }}>Açık/kapalı gün, Owner durum değişikliği kayıtlarından hesaplanır (gün içinde herhangi bir an Aktif = açık).</p>
      {techRows.length > 0 && (
        <table className="mx cmpTable" id="techStats" style={{ marginTop: 14 }}>
          <thead><tr><th>Kampanya</th><th>Teknik</th><th>Tamamlanan analiz</th><th>Harcanan kredi</th></tr></thead>
          <tbody>
            {techRows.map((r) => {
              const e = getCatalogEntry(r.key);
              return (
                <tr key={`${r.cid}:${r.key}`}>
                  <td data-l="Kampanya"><b>{name(r.cid)}</b></td>
                  <td data-l="Teknik">{e ? `${MODULE_UI[e.module].title} — ${e.title}` : r.key}</td>
                  <td data-l="Tamamlanan analiz">{fmt(r.an)}</td>
                  <td data-l="Harcanan kredi">{fmt(r.kr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function Kpi({ k, v, d }: { k: string; v: string; d: string }) {
  return <div className="kpi"><div className="k">{k}</div><div className="v">{v}</div><span className="d">{d}</span></div>;
}

function Chart({ series }: { series: Day[] }) {
  const W = 900, H = 240, P = { l: 40, r: 10, t: 14, b: 26 };
  const maxV = Math.max(1, ...series.map((x) => Math.max(x.an, x.kr))) * 1.1;
  const bw = (W - P.l - P.r) / series.length;
  const y = (v: number) => H - P.b - (v / maxV) * (H - P.t - P.b);
  const step = series.length > 40 ? 15 : series.length > 10 ? 5 : 1;
  const line = series.map((x, i) => `${i ? "L" : "M"}${P.l + i * bw + bw / 2},${y(x.kr)}`).join("");
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Günlük tamamlanan analiz ve harcanan kredi grafiği">
        {series.map((x, i) => x.open ? <rect key={`o${i}`} x={P.l + i * bw} y={P.t} width={bw + 0.5} height={H - P.t - P.b} fill="#e3efe6" /> : null)}
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const v = Math.round((maxV * f) / 1.1);
          return <g key={f}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="rgba(70,80,60,.12)" /><text x={P.l - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#6a7773">{v}</text></g>;
        })}
        {series.map((x, i) => (
          <rect key={`b${i}`} x={P.l + i * bw + bw * 0.18} y={y(x.an)} width={Math.max(1, bw * 0.64)} height={H - P.b - y(x.an)} rx={Math.min(3, bw * 0.2)} fill="#2c7a56" opacity=".85">
            <title>{`${x.day} · ${x.an} analiz · ${x.kr} kredi`}</title>
          </rect>
        ))}
        <path d={line} fill="none" stroke="#b8862b" strokeWidth="2.5" />
        {series.map((x, i) => (i % step === 0 ? <text key={`t${i}`} x={P.l + i * bw + bw / 2} y={H - 8} fontSize="11" textAnchor="middle" fill="#6a7773">{x.day.slice(8, 10)}.{x.day.slice(5, 7)}</text> : null))}
      </svg>
      <p className="unitLegend"><span><i style={{ background: "#cfe3d5" }} />Kampanya açık</span><span><i className="u-an" />Tamamlanan analiz</span><span><i className="u-kr" />Harcanan kredi</span></p>
    </>
  );
}

