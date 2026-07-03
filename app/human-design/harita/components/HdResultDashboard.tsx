"use client";

// FAZ 10A — Premium BodyGraph Dashboard 2.0 (koyu shell).
//
// Sonuç ekranını koyu premium 3-sütun dashboard'a taşır:
//   sol bilgi paneli | orta BodyGraph sahnesi | sağ kart paneli
// BodyGraph iç SVG'ye DOKUNMAZ (yalnız yerleştirilir). Gezegen sütunları (10B)
// ve zengin ikon-kart/%bar/cross-figürü (10D) sonraki fazlarda.
// Motor/compute/contract'a dokunmaz; yalnız hesaplanmış result'ı sunar.

import { BodyGraph } from "./BodyGraph";
import type { HdChartResult } from "@/lib/human-design/engine/contract";

const CENTER_TR: Record<string, string> = {
  Head: "Baş", Ajna: "Anja", Throat: "Boğaz", G: "G (Kimlik)", Heart: "Ego / Kalp",
  Spleen: "Dalak", SolarPlexus: "Solar Pleksus", Sacral: "Sakral", Root: "Kök",
};

type SaveState = { status: "idle" | "saving" | "done" | "error"; msg?: string };

type Props = {
  result: HdChartResult;
  birth: { date: string; time: string; place: string; timezone: string };
  saveState: SaveState;
  onSave: () => void;
};

// ── Koyu premium tasarım token'ları ──────────────────────────────────────────
const dashCls =
  "relative overflow-hidden rounded-[28px] border border-amber-300/15 bg-[radial-gradient(ellipse_at_top,#111c30_0%,#0b1220_55%,#070c16_100%)] p-4 text-slate-200 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)] sm:p-6";
const glassCls =
  "rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_10px_34px_-16px_rgba(0,0,0,0.6)] backdrop-blur-sm";
const kickerCls = "text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/80";

function GlassCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={glassCls}>
      <p className={`mb-3 ${kickerCls}`}>{title}</p>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 py-1.5 last:border-0">
      <span className="text-[11px] font-semibold text-slate-400">{label}</span>
      <span className="max-w-[62%] text-right text-[13px] font-bold text-slate-100">{value || "—"}</span>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex flex-col rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300/70">{label}</span>
      <span className="text-xs font-black text-slate-100">{value}</span>
    </span>
  );
}

function formatDate(val: string): string {
  if (!val) return "—";
  try {
    return new Date(`${val}T00:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return val;
  }
}

export function HdResultDashboard({ result, birth, saveState, onSave }: Props) {
  const definedTR = result.centers.defined.map((c) => CENTER_TR[c] ?? c);
  const openTR = result.centers.open.map((c) => CENTER_TR[c] ?? c);
  const saving = saveState.status === "saving";

  return (
    <section className={dashCls} aria-label="Human Design premium harita paneli">
      {/* Dekoratif ışıklar */}
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-amber-400/10 blur-[110px]" />
      <div aria-hidden className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-indigo-500/10 blur-[120px]" />

      {/* Üst şerit */}
      <header className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <span className="text-amber-300">✦</span>
          <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-100">Human Design Haritası</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip label="Enerji Tipi" value={result.type} />
          <Chip label="Otorite" value={result.authority} />
          <Chip label="Profil" value={result.profile} />
          <Chip label="Tanım" value={result.definition.kind} />
        </div>
      </header>

      {/* 3 sütun — mobilde sahne önce (order-1) */}
      <div className="relative grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">

        {/* SOL — bilgi paneli */}
        <div className="order-2 space-y-4 xl:order-none">
          <GlassCard title="Kimlik & Doğum">
            <p className="mb-2 text-base font-black text-slate-100">Kişisel Harita</p>
            <InfoRow label="Tarih" value={formatDate(birth.date)} />
            <InfoRow label="Saat" value={birth.time} />
            <InfoRow label="Yer" value={birth.place} />
            <InfoRow label="Saat Dilimi" value={birth.timezone} />
          </GlassCard>

          <GlassCard title="Temel Bilgiler">
            <InfoRow label="Tip" value={result.type} />
            <InfoRow label="Otorite" value={result.authority} />
            <InfoRow label="Profil" value={result.profile} />
            <InfoRow label="Tanım" value={`${result.definition.kind} · ${result.definition.componentCount} bileşen`} />
          </GlassCard>

          <GlassCard title={`Kanallar (${result.channels.length})`}>
            {result.channels.length === 0 ? (
              <p className="text-xs text-slate-500">Tanımlı kanal yok.</p>
            ) : (
              <ul className="space-y-1.5">
                {result.channels.map((ch) => (
                  <li key={ch.id} className="flex items-center gap-2 text-[13px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span className="font-black text-slate-100">{ch.id}</span>
                    <span className="font-medium text-slate-400">{ch.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard title="Merkezler">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300/90">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Tanımlı ({definedTR.length})
            </p>
            <p className="mb-3 text-[13px] text-slate-200">{definedTR.join(", ") || "—"}</p>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Açık ({openTR.length})
            </p>
            <p className="text-[13px] text-slate-400">{openTR.join(", ") || "—"}</p>
          </GlassCard>

          {/* Kaydet — sol panel altı */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-2.5 text-sm font-black text-slate-900 shadow-[0_10px_28px_-10px_rgba(232,200,116,0.55)] transition hover:brightness-105 disabled:opacity-60"
            >
              {saving ? "Kaydediliyor…" : "Haritayı Kaydet"}
            </button>
            {saveState.status === "done" ? (
              <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                {saveState.msg}
              </p>
            ) : saveState.status === "error" ? (
              <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs font-semibold text-rose-300">
                {saveState.msg}
              </p>
            ) : null}
          </div>
        </div>

        {/* ORTA — BodyGraph sahnesi (mobilde önce) */}
        <div className="order-1 xl:order-none">
          <div className="relative flex min-h-[440px] items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(ellipse_at_center,rgba(232,200,116,0.07),transparent_70%)] p-3 sm:p-5">
            {/* 10B: Design / Personality gezegen sütunları buraya gelecek */}
            <BodyGraph result={result} />
          </div>
        </div>

        {/* SAĞ — kart paneli */}
        <div className="order-3 space-y-4 xl:order-none">
          <GlassCard title="Kart Bilgileri">
            <div className="grid grid-cols-2 gap-2">
              <Chip label="Enerji Tipi" value={result.type} />
              <Chip label="Otorite" value={result.authority} />
              <Chip label="Profil" value={result.profile} />
              <Chip label="Tanım" value={result.definition.kind} />
            </div>
          </GlassCard>

          <GlassCard title="Incarnation Cross">
            <p className="text-[13px] font-bold text-slate-100">
              {result.incarnationCross.angle ? `${result.incarnationCross.angle} Cross` : "Cross"}
            </p>
            <p className="mt-1 text-[13px] text-slate-300">Gates {result.incarnationCross.gates.join("/")}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Cross tema adı gösterilmez (doğrulanmış referans tablosu yok).
            </p>
          </GlassCard>

          <GlassCard title="Doğrulama">
            {result.validation.overall === "validated" ? (
              <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                Doğrulanmış kapsam
              </span>
            ) : (
              <div>
                <span className="inline-flex rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                  Doğrulama beklemede
                </span>
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-200/80">
                  {result.validation.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </GlassCard>

          {result.warnings.length > 0 && (
            <GlassCard title="Uyarılar">
              <ul className="list-disc pl-5 text-xs text-amber-200/80">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </GlassCard>
          )}

          <p className="px-1 text-[11px] leading-4 text-slate-500">
            {result.meta.disclaimer} Bu ekran yorum içermez; yalnız hesaplanmış değerleri gösterir.
          </p>
        </div>
      </div>
    </section>
  );
}
