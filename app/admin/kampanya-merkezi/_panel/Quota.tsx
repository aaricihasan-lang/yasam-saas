"use client";

// Kota ve Maliyet — ortak ayarlar (sürüm denetimli) + bugünkü GERÇEK sayaçlar (campaign_usage_daily). Örnek/DEMO sayı yok.
import { useState } from "react";
import { MODULE_UI } from "@/lib/campaign/catalogUi";
import { campaignPost } from "./api";
import { crText, fmt, fmtDT, globalUsage, maxCr, selectedOf, techUsage, type Settings } from "./model";
import type { PanelCtx } from "./KampanyaPanel";

type Form = {
  kill_switch: boolean; global_daily_credit_budget: string; global_daily_analysis_limit: string; provider_monthly_quota: string;
  expert_reserve_pct: string; provider_quota_mismatch_pct: string; provider_minute_limit: string;
};
const RANGES: Record<Exclude<keyof Form, "kill_switch">, [number, number, boolean]> = {
  global_daily_credit_budget: [0, 1000000, false],
  global_daily_analysis_limit: [0, 1000000, true],
  provider_monthly_quota: [1, 100000000, true],
  expert_reserve_pct: [0, 95, false],
  provider_quota_mismatch_pct: [0, 50, false],
  provider_minute_limit: [1, 10000, false],
};

const formOf = (s: Settings): Form => ({
  kill_switch: s.kill_switch,
  global_daily_credit_budget: String(s.global_daily_credit_budget),
  global_daily_analysis_limit: s.global_daily_analysis_limit == null ? "" : String(s.global_daily_analysis_limit),
  provider_monthly_quota: s.provider_monthly_quota == null ? "" : String(s.provider_monthly_quota),
  expert_reserve_pct: String(s.expert_reserve_pct),
  provider_quota_mismatch_pct: String(s.provider_quota_mismatch_pct),
  provider_minute_limit: String(s.provider_minute_limit),
});

export function TabKota({ ctx }: { ctx: PanelCtx }) {
  const { ov, d, cat, cur } = ctx;
  const s = ov.settings;
  const [f, setF] = useState<Form | null>(s ? formOf(s) : null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!s || !f) return <section className="card"><div className="notice err" role="alert">Ortak kampanya ayarı okunamadı — sistem fail-closed (hiçbir analiz kabul edilmez).</div></section>;

  const changed: Record<string, unknown> = {};
  const nextErrs: Record<string, string> = {};
  if (f.kill_switch !== s.kill_switch) changed.kill_switch = f.kill_switch;
  for (const [k, [min, max, nullable]] of Object.entries(RANGES) as [keyof typeof RANGES, [number, number, boolean]][]) {
    const raw = f[k].trim();
    let v: number | null;
    if (raw === "") {
      if (!nullable) { nextErrs[k] = "Zorunlu."; continue; }
      v = null;
    } else {
      v = Number(raw);
      if (!Number.isInteger(v) || v < min || v > max) { nextErrs[k] = `${fmt(min)}–${fmt(max)} arası tam sayı.`; continue; }
    }
    if (v !== (s[k] ?? null)) changed[k] = v;
  }
  const hasErr = Object.keys(nextErrs).length > 0;
  const dirty = Object.keys(changed).length > 0 || hasErr;

  async function save() {
    if (saving) return;
    setErrs(nextErrs);
    if (hasErr || !dirty) return;
    setSaving(true);
    const r = await campaignPost({ action: "updateSettings", expectedVersion: s!.version, fields: changed });
    setSaving(false);
    if (!r.ok) {
      setMsg(r.error);
      return;
    }
    setMsg(null);
    ctx.toast("Ortak ayarlar kaydedildi. Bugünkü kullanım sıfırlanmadı.");
    await ctx.refresh();
  }

  const num = (k: keyof typeof RANGES, label: string, hint?: string, placeholder?: string) => (
    <div className="field">
      <label htmlFor={`g-${k}`}>{label}{hint ? <span className="hint"> {hint}</span> : null}</label>
      <input id={`g-${k}`} className="input num" type="number" inputMode="numeric" min={RANGES[k][0]} max={RANGES[k][1]} placeholder={placeholder} value={f[k]}
        aria-invalid={errs[k] ? true : undefined} aria-describedby={errs[k] ? `g-${k}-e` : undefined}
        onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {errs[k] && <span className="fieldErr" id={`g-${k}-e`}>{errs[k]}</span>}
    </div>
  );

  const g = globalUsage(ov.usageToday);
  const spent = g?.spent_credits ?? 0, reservedKr = g?.reserved_credits ?? 0, usedAn = g?.used_analyses ?? 0, reservedAn = g?.reserved_analyses ?? 0;
  const sel = selectedOf(d, cat);
  const sumBudget = sel.reduce((a, x) => a + (maxCr(x.e) > 0 ? x.s.credit : 0), 0);
  const monthly = s.provider_monthly_quota ?? 0;
  const expert = Math.round((monthly * s.expert_reserve_pct) / 100);
  const free = Math.max(0, monthly - expert);
  const p = ov.provider;

  return (
    <>
      <section className="card">
        <div className="cardHead">
          <div>
            <p className="eyebrow">Ortak bütçe · tüm kampanyalar</p>
            <h2 className="h2">Günlük kredi ve analiz sınırı</h2>
            <p className="lead">Limitler gün içinde değiştirilebilir. Limit düşürülürse o günkü kullanım <b>sıfırlanmaz</b>; yalnız yeni analiz kabulü durur. Kredi, kota veya sağlayıcı bilgisi eksikse sistem kapalı kalır (fail-closed).</p>
          </div>
          <span className="saveState">{dirty ? <span className="tag warn">Kaydedilmemiş ayar</span> : <span className="tag ok">Kayıtlı · {fmtDT(s.updated_at)}</span>}</span>
        </div>
        <div className="libItem" style={{ marginBottom: 14 }}>
          <div><p><b>Acil durdurma</b></p><p className="small muted">Açıkken hiçbir kampanya analizi kabul edilmez (kampanya durumlarından bağımsız).</p></div>
          <button className="switch" role="switch" aria-checked={f.kill_switch} aria-label="Acil durdurma" onClick={() => setF({ ...f, kill_switch: !f.kill_switch })} />
        </div>
        <div className="grid2">
          {num("global_daily_credit_budget", "Ortak günlük kredi bütçesi", "tüm teknikler toplamı")}
          {num("global_daily_analysis_limit", "Ortak günlük analiz sınırı", "boş = ayrı sınır yok", "Sınır yok")}
          {num("provider_monthly_quota", "Aylık sağlayıcı plan kredisi", "sağlayıcı panelinden", "Bilinmiyor")}
          {num("provider_minute_limit", "Dakikalık çağrı sınırı (kampanya)")}
          {num("provider_quota_mismatch_pct", "Kota uyuşmazlık toleransı %", "gözlenen ↔ girilen")}
          <div className="field">
            <label htmlFor="g-expert_reserve_pct">Ücretli uzmanlara ayrılan kapasite <span className="hint">%{f.expert_reserve_pct}</span></label>
            <input id="g-expert_reserve_pct" type="range" min={0} max={95} step={5} value={Number(f.expert_reserve_pct) || 0} onChange={(e) => setF({ ...f, expert_reserve_pct: e.target.value })} style={{ accentColor: "var(--green)" }} aria-valuetext={`yüzde ${f.expert_reserve_pct}`} />
          </div>
        </div>
        {msg && <div className="notice err" role="alert" style={{ marginTop: 10 }}>{msg}</div>}
        <div className="actionRow">
          <button className="btn primary" disabled={saving || !dirty} onClick={() => void save()}>Ortak ayarları kaydet</button>
          {dirty && <button className="btn ghost" onClick={() => { setF(formOf(s)); setErrs({}); }}>Değişiklikleri geri al</button>}
        </div>
        <div className="reserve">
          {!monthly ? (
            <div className="notice warn">Aylık plan kredisi girilmedi. Kredi harcayan analizler sağlayıcı kotası bilinmediği için kapalı kalır; yalnız 0 kredili teknikler (ör. Kozmik Takvim, Lilly) analiz hakkı oldukça çalışabilir.</div>
          ) : (
            <>
              <div className="reserveBar" aria-hidden="true"><span className="r-exp" style={{ width: `${s.expert_reserve_pct}%` }} /><span className="r-free" style={{ width: `${100 - s.expert_reserve_pct}%` }} /></div>
              <p className="unitLegend"><span><i className="u-an" />Uzmanlara ayrılan: <b>{fmt(expert)}</b> kredi/ay</span><span><i className="u-kr" />Kampanyaya açılabilir: <b>{fmt(free)}</b> kredi/ay (≈ {fmt(Math.floor(free / 30))}/gün)</span></p>
              {s.global_daily_credit_budget > Math.floor(free / 30) && <div className="notice warn">Ortak günlük bütçe ({fmt(s.global_daily_credit_budget)}) uzman rezervinden sonra kalan günlük ortalamayı ({fmt(Math.floor(free / 30))}) aşıyor. Sistem rezerv tabanının altına inmez; kampanya erken durur.</div>}
            </>
          )}
        </div>
        <div className="bars" style={{ marginTop: 14 }}>
          <Bar label="Bugün harcanan kredi / ortak bütçe" used={spent} limit={s.global_daily_credit_budget} kind="kr" unit="kredi" />
          <Bar label="Bugün tamamlanan analiz / ortak sınır" used={usedAn} limit={s.global_daily_analysis_limit} kind="an" unit="analiz" />
          <Bar label="Bu kampanyanın teknik bütçeleri / ortak bütçe" used={sumBudget} limit={s.global_daily_credit_budget} kind="kr" unit="kredi" />
          {(reservedKr > 0 || reservedAn > 0) && <p className="small muted" style={{ gridColumn: "1/-1", margin: 0 }}>Şu an süren (rezerve) işlemler: {fmt(reservedAn)} analiz · {fmt(reservedKr)} kredi. Tamamlanınca harcamaya geçer veya iade edilir.</p>}
          {spent >= s.global_daily_credit_budget && s.global_daily_credit_budget >= 0 && spent > 0 && <div className="notice err" style={{ gridColumn: "1/-1" }} role="alert">Ortak günlük bütçe doldu — bugün yeni ücretli analiz kabul edilmez (fail-closed).</div>}
        </div>
      </section>
      <section className="card">
        <div className="cardHead"><div><p className="eyebrow">Sağlayıcı kotası</p><h2 className="h2">Gözlenen durum</h2></div></div>
        {p && p.observed_at ? (
          <dl className="dlGrid">
            <dt>Kalan kredi (hesap)</dt><dd>{p.remaining == null ? "—" : fmt(p.remaining)}</dd>
            <dt>Plan sınırı</dt><dd>{p.quota_limit == null ? "Gözlenmedi" : fmt(p.quota_limit)}</dd>
            <dt>Son gözlem</dt><dd>{fmtDT(p.observed_at)}</dd>
            <dt>Son gerçek doğrulama</dt><dd>{p.usage_observed_at ? fmtDT(p.usage_observed_at) : "Yapılmadı"}</dd>
            <dt>Başlık − hesap farkı</dt><dd>{p.remaining_gap == null ? "Bilinmiyor" : `${fmt(p.remaining_gap)} kredi`}</dd>
            <dt>Bekleme</dt><dd>{p.cooldown_until && Date.parse(p.cooldown_until) > ctx.nowMs ? `${fmtDT(p.cooldown_until)} tarihine kadar` : "Yok"}</dd>
          </dl>
        ) : (
          <p className="muted">Henüz sağlayıcı gözlemi yok. Gözlem yokken veya bilgi bayatsa kredi harcayan analizler kapalı kalır (fail-closed).</p>
        )}
        <UsageRefresh ctx={ctx} />
      </section>
      <section className="card">
        <div className="cardHead"><div><p className="eyebrow">Bugünkü kullanım · {ov.dayTr}</p><h2 className="h2">“{cur.name}” — teknik bazında hak ve kredi</h2></div><p className="unitLegend"><span><i className="u-an" />Analiz hakkı</span><span><i className="u-kr" />Kredi</span></p></div>
        {sel.length ? (
          <div className="quotaTable">
            {sel.map(({ e, s: t }) => {
              const u = techUsage(ov.usageToday, cur.id, e.key);
              const w: string[] = [];
              if (u.an >= t.daily) w.push(u.an > t.daily ? `Limit bugünkü kullanımın altında (${u.an}/${t.daily}). Kullanım sıfırlanmadı; yeni analiz kabul edilmez.` : "Günlük analiz hakkı doldu.");
              if (maxCr(e) > 0 && u.kr >= t.credit && (u.kr > 0 || t.credit === 0)) w.push(u.kr > t.credit ? `Kredi bütçesi bugünkü harcamanın altında (${u.kr}/${t.credit}). Yeni ücretli çağrı yapılmaz.` : "Günlük kredi bütçesi doldu — yeni ücretli çağrı yapılmaz.");
              return (
                <div className="qRow" key={e.key} data-q={e.key}>
                  <div className="qHead"><b>{MODULE_UI[e.module].title} — {e.title}</b><span className="small muted">{t.ip} analiz / IP / gün · {crText(e)} kredi/analiz</span></div>
                  <div className="bars">
                    <Bar label="Analiz hakkı" used={u.an} limit={t.daily} kind="an" unit="analiz" />
                    {maxCr(e) > 0 ? <Bar label="Kredi" used={u.kr} limit={t.credit} kind="kr" unit="kredi" /> : <div className="bar"><div className="barLabel"><span>Kredi</span><span>0 — kredi harcamaz</span></div></div>}
                  </div>
                  {w.map((x) => <div className="notice warn" key={x}>{x}</div>)}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">Bu kampanyada açık analiz yok.</p>
        )}
        <p className="small muted" style={{ margin: "10px 0 0" }}>Sayaçlar gerçek kayıttır. Ücretsiz analiz ziyaretçiye henüz açılmadığı için (KM-3) normalde sıfırdır.</p>
      </section>
    </>
  );
}

export function Bar({ label, used, limit, kind, unit }: { label: string; used: number; limit: number | null; kind: "an" | "kr"; unit: string }) {
  if (limit == null) return <div className="bar"><div className="barLabel"><span>{label}</span><span><b>{fmt(used)}</b> {unit} · ayrı sınır yok</span></div></div>;
  const over = used > limit;
  const w = limit > 0 ? Math.min(100, (used / limit) * 100) : used > 0 ? 100 : 0;
  return (
    <div className="bar">
      <div className="barLabel"><span>{label}</span><span><b>{fmt(used)}</b> / {fmt(limit)} {unit}</span></div>
      <div className="barTrack"><span className={`barFill ${over ? "over" : kind}`} style={{ width: `${w}%` }} /></div>
    </div>
  );
}

/** Gerçek hesap kalanını sağlayıcının /usage ucundan BİR kez okur (sağlayıcı bunu 1 birim sayar) — açık onayla. */
function UsageRefresh({ ctx }: { ctx: PanelCtx }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    if (busy) return;
    setBusy(true);
    const r = await campaignPost<{ remaining: number; gap: number | null }>({ action: "refreshProviderUsage", confirm: true });
    setBusy(false);
    setAsk(false);
    if (!r.ok) return setMsg(r.error);
    setMsg(`Gerçek kalan ${fmt(r.data.remaining)} kredi kaydedildi${r.data.gap !== null ? ` (başlık farkı ${fmt(r.data.gap)})` : ""}.`);
    await ctx.refresh();
  }
  return (
    <div style={{ marginTop: 12 }}>
      <p className="small muted" style={{ margin: "0 0 8px" }}>Ücretli analizler, hesabın gerçek kalan kredisi doğrulanmadan ve başlık farkı bilinmeden açılmaz. Doğrulama sağlayıcıdan 1 kredi düşer; sonraki çağrılar farkı kullanarak durumu tazeler.</p>
      {ask ? (
        <div className="notice warn inlineConfirm" role="alertdialog" aria-labelledby="usageQ">
          <div>
            <b id="usageQ">Sağlayıcıdan gerçek kullanım okunsun mu?</b> Bu işlem 1 kredi harcar.
            <div className="actionRow" style={{ marginTop: 8 }}>
              <button className="btn sm primary" disabled={busy} onClick={() => void run()}>{busy ? "Okunuyor…" : "Evet, doğrula"}</button>
              <button className="btn sm" onClick={() => setAsk(false)}>Vazgeç</button>
            </div>
          </div>
        </div>
      ) : (
        <button className="btn sm" onClick={() => { setAsk(true); setMsg(null); }}>Gerçek kullanımı doğrula (1 kredi)</button>
      )}
      {msg && <p className="small" role="status" style={{ margin: "8px 0 0" }}>{msg}</p>}
    </div>
  );
}
