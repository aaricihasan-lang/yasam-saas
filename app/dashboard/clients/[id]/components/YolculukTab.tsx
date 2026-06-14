"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";

// ─── Public type ─────────────────────────────────────────────────────────────
export type TimelineEntry = {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  dateRaw: string;
  href?: string;
  badge?: string;
};

type SessionProcess = {
  totalSeans: number;
  ilkSeans: string | null;
  sonSeans: string | null;
  gunFarki: number | null;
  yaklasanRandevu: string | null;
  durum: "aktif" | "takip" | "pasif" | "baslamadi";
  avgDurationMin: number | null;
  totalFee: number | null;
  avgSiklikGun: number | null;
};

type HomeworkProcess = {
  total: number;
  tamamlanan: number;
  devamEden: number;
  yuzde: number;
  sonOdevTarihi: string | null;
  aktifOdevBaslik: string | null;
  durum: "yok" | "baslangic" | "devam" | "iyi" | "tamamlandi";
};

type AlertItem = {
  id: string;
  message: string;
  category: "kritik" | "takip" | "bilgi" | "olumlu";
};

// ─── Props ───────────────────────────────────────────────────────────────────
type YolculukTabProps = {
  clientId: string;
  tenantId: string | null;
  clientName: string;
  clientPhone?: string;
  clientLastSession?: string;
  clientNextAppointment?: string;
  clientAd?: string;
  clientSoyad?: string;
  clientDogum?: string;
  onNavigate?: (tabId: string) => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isoToTR(isoDate: string | null | undefined): string {
  if (!isoDate) return "-";
  const datePart = isoDate.split("T")[0];
  const parts = datePart.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function statusLabel(status: string | null | undefined): string {
  if (status === "tamamlandi") return "Tamamlandı";
  if (status === "iptal") return "İptal edildi";
  return "Bekliyor";
}


function calcAge(dogum: string): number | null {
  try {
    const [year, month, day] = dogum.split("-").map(Number);
    if (!year || !month || !day) return null;
    const today = new Date();
    const birth = new Date(year, month - 1, day);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : null;
  } catch {
    return null;
  }
}

// ─── Sol menü tanımları ──────────────────────────────────────────────────────
type MenuItem = {
  id: string;
  label: string;
  icon: string;
  color: string;
  tabId: string | null;
};

const menuItems: MenuItem[] = [
  { id: "genel",        label: "Genel Bilgiler", icon: "◈", color: "#2563eb", tabId: "genel"      },
  { id: "numeroloji",   label: "Numeroloji",     icon: "∞", color: "#7c3aed", tabId: null         },
  { id: "dogaltas",     label: "Doğaltaş",       icon: "◆", color: "#0891b2", tabId: "taslar"    },
  { id: "refleksoloji", label: "Refleksoloji",   icon: "◎", color: "#db2777", tabId: null         },
  { id: "biyoenerji",   label: "Biyoenerji",     icon: "⚡", color: "#ea580c", tabId: null         },
  { id: "notlar",       label: "Notlar",          icon: "✎", color: "#6d28d9", tabId: "notlar"    },
  { id: "randevular",   label: "Randevular",     icon: "◷", color: "#16a34a", tabId: "randevular" },
  { id: "dosyalar",     label: "Dosyalar",        icon: "▣", color: "#475569", tabId: null         },
];

// ─── Tip → görsel eşleşmesi ──────────────────────────────────────────────────
const TYPE_META: Record<string, { color: string; accent: string; icon: string }> = {
  numeroloji:   { color: "#7c3aed", accent: "#ede9fe", icon: "∞" },
  dogaltas:     { color: "#0891b2", accent: "#e0f2fe", icon: "◆" },
  refleksoloji: { color: "#db2777", accent: "#fce7f3", icon: "◎" },
  biyoenerji:   { color: "#ea580c", accent: "#fff7ed", icon: "⚡" },
  not:          { color: "#6d28d9", accent: "#ede9fe", icon: "✎" },
  seans:        { color: "#16a34a", accent: "#dcfce7", icon: "◈" },
  randevu:      { color: "#9333ea", accent: "#f3e8ff", icon: "◷" },
  analiz:       { color: "#8b5cf6", accent: "#f5f3ff", icon: "◎" },
  odev:         { color: "#ef4444", accent: "#fee2e2", icon: "✏" },
};

const DEFAULT_META = { color: "#64748b", accent: "#f1f5f9", icon: "◈" };

function getMeta(type: string) {
  return TYPE_META[type] ?? DEFAULT_META;
}

// ─── Durum sabitleri ──────────────────────────────────────────────────────────
const DURUM_META = {
  aktif:     { label: "Aktif Süreç",     color: "#10b981", bg: "#d1fae5" },
  takip:     { label: "Takip Gerekiyor", color: "#f59e0b", bg: "#fef3c7" },
  pasif:     { label: "Pasif Danışan",   color: "#ef4444", bg: "#fee2e2" },
  baslamadi: { label: "Henüz Başlamadı", color: "#94a3b8", bg: "#f1f5f9" },
} as const;

const ODEV_DURUM_META = {
  yok:        { label: "Henüz Ödev Yok", color: "#94a3b8", bg: "#f1f5f9", bar: "#e2e8f0" },
  baslangic:  { label: "Başlangıç",       color: "#ef4444", bg: "#fee2e2", bar: "#ef4444" },
  devam:      { label: "Devam Ediyor",    color: "#f59e0b", bg: "#fef3c7", bar: "#f59e0b" },
  iyi:        { label: "İyi İlerliyor",   color: "#3b82f6", bg: "#dbeafe", bar: "#3b82f6" },
  tamamlandi: { label: "Tamamlandı",      color: "#10b981", bg: "#d1fae5", bar: "#10b981" },
} as const;

const ALERT_META = {
  kritik: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "⚠",  label: "Kritik"          },
  takip:  { color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "◎",  label: "Takip Gerekiyor" },
  bilgi:  { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "ℹ",  label: "Bilgilendirme"   },
  olumlu: { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "✓",  label: "Durum"           },
} as const;

const SCORE_CRITERIA: { key: keyof LifeScoreProps; label: string; missingLabel: string }[] = [
  { key: "hasDogum",   label: "Doğum Tarihi", missingLabel: "Doğum tarihi eksik"  },
  { key: "hasTelefon", label: "Telefon",       missingLabel: "Telefon eksik"        },
  { key: "hasNot",     label: "Not",           missingLabel: "Henüz not yok"        },
  { key: "hasSeans",   label: "Seans",         missingLabel: "Henüz seans yok"      },
  { key: "hasRandevu", label: "Randevu",       missingLabel: "Henüz randevu yok"    },
  { key: "hasAnaliz",  label: "Analiz",        missingLabel: "Henüz analiz yok"     },
  { key: "hasTas",     label: "Taş Kaydı",    missingLabel: "Henüz taş kaydı yok"  },
  { key: "hasOdev",    label: "Ödev",          missingLabel: "Henüz ödev yok"       },
];

// ─── buildAlerts ─────────────────────────────────────────────────────────────
function buildAlerts({
  clientDogum,
  clientPhone,
  counts,
  sessionProcess,
  homeworkProcess,
  extraAlertData,
}: {
  clientDogum: string | undefined;
  clientPhone: string | undefined;
  counts: { analizler: number; seanslar: number; randevular: number; notlar: number; taslar: number; odevler: number };
  sessionProcess: SessionProcess;
  homeworkProcess: HomeworkProcess;
  extraAlertData: { lastPastRandevuDaysAgo: number | null; lastAnalizDaysAgo: number | null };
}): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (!clientDogum)
    alerts.push({ id: "no-dogum", message: "Doğum tarihi eksik", category: "kritik" });

  if (!clientPhone)
    alerts.push({ id: "no-phone", message: "Telefon numarası eksik", category: "kritik" });

  if (sessionProcess.gunFarki != null && sessionProcess.gunFarki >= 30)
    alerts.push({ id: "seans-30", message: `${sessionProcess.gunFarki} gündür seans yok`, category: "kritik" });

  if (extraAlertData.lastPastRandevuDaysAgo != null && extraAlertData.lastPastRandevuDaysAgo >= 60)
    alerts.push({ id: "randevu-60", message: `${extraAlertData.lastPastRandevuDaysAgo} gündür randevu yok`, category: "kritik" });

  if (counts.analizler === 0)
    alerts.push({ id: "no-analiz", message: "Hiç analiz yapılmamış", category: "kritik" });

  if (!sessionProcess.yaklasanRandevu)
    alerts.push({ id: "no-upcoming", message: "Yaklaşan randevu yok", category: "takip" });

  if (homeworkProcess.devamEden > 0)
    alerts.push({ id: "hw-pending", message: `${homeworkProcess.devamEden} tamamlanmamış ödev var`, category: "takip" });

  if (counts.taslar === 0)
    alerts.push({ id: "no-tas", message: "Hiç taş önerisi girilmemiş", category: "takip" });

  if (counts.notlar === 0)
    alerts.push({ id: "no-not", message: "Hiç not girilmemiş", category: "takip" });

  if (counts.seanslar === 0)
    alerts.push({ id: "no-seans", message: "Henüz seans yapılmamış", category: "takip" });

  if (sessionProcess.gunFarki != null && sessionProcess.gunFarki >= 14 && sessionProcess.gunFarki < 30)
    alerts.push({ id: "seans-14", message: `Son seanstan ${sessionProcess.gunFarki} gün geçti`, category: "bilgi" });

  if (extraAlertData.lastAnalizDaysAgo != null && extraAlertData.lastAnalizDaysAgo >= 60)
    alerts.push({ id: "analiz-old", message: `Son analizden ${extraAlertData.lastAnalizDaysAgo} gün geçti`, category: "bilgi" });

  if (counts.seanslar === 0 && counts.randevular === 0)
    alerts.push({ id: "new-client", message: "Danışan yeni kayıt — süreç henüz başlamamış", category: "bilgi" });

  const hasProblem = alerts.some((a) => a.category === "kritik" || a.category === "takip");
  if (!hasProblem) {
    alerts.push({ id: "ok-1", message: "Danışan süreci düzenli ilerliyor", category: "olumlu" });
    alerts.push({ id: "ok-2", message: "Takip gerektiren kritik durum bulunamadı", category: "olumlu" });
  }

  return alerts;
}

// ─── CriticalBanner ──────────────────────────────────────────────────────────
function CriticalBanner({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 shadow-sm">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-red-500 text-sm font-black text-white">
        ⚠
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-[13px] font-black text-red-900">
          {alerts.length} Kritik Uyarı
        </p>
        <div className="flex flex-wrap gap-1.5">
          {alerts.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700"
            >
              {a.message}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SummaryCard ─────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  color,
  bg,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  icon: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4 shadow-sm"
      style={{ background: bg, borderColor: `${color}22` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-[34px] w-[34px] items-center justify-center rounded-xl text-base"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      </div>
      <div className="text-[32px] font-black leading-none" style={{ color }}>
        {value}
      </div>
      <div
        className="mt-2 h-[3px] w-[60%] rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}44)` }}
      />
    </div>
  );
}

// ─── ScoreCircle ─────────────────────────────────────────────────────────────
function ScoreCircle({ score, color }: { score: number; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
      <circle cx={44} cy={44} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
      <circle
        cx={44} cy={44} r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x={44} y={44}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={20}
        fontWeight={900}
        fill={color}
      >
        {score}
      </text>
    </svg>
  );
}

// ─── LifeScoreCard ───────────────────────────────────────────────────────────
type LifeScoreProps = {
  hasDogum: boolean;
  hasTelefon: boolean;
  hasNot: boolean;
  hasSeans: boolean;
  hasRandevu: boolean;
  hasAnaliz: boolean;
  hasTas: boolean;
  hasOdev: boolean;
};

function getScoreStage(score: number): { label: string; color: string; bg: string } {
  if (score <= 30) return { label: "Başlangıç",   color: "#ef4444", bg: "#fee2e2" };
  if (score <= 60) return { label: "Gelişimde",   color: "#f59e0b", bg: "#fef3c7" };
  if (score <= 80) return { label: "Aktif Takip", color: "#3b82f6", bg: "#dbeafe" };
  return               { label: "Güçlü Süreç", color: "#10b981", bg: "#d1fae5" };
}

function LifeScoreCard(props: LifeScoreProps) {
  const completed = SCORE_CRITERIA.filter((c) => props[c.key]).length;
  const score = Math.round((completed / SCORE_CRITERIA.length) * 100);
  const stage = getScoreStage(score);
  const missing = SCORE_CRITERIA.filter((c) => !props[c.key]).map((c) => c.missingLabel);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-base text-violet-600">◈</span>
        <span className="text-[14px] font-black tracking-tight text-slate-950">Danışan Yaşam Skoru</span>
      </div>

      <div className="flex flex-wrap gap-5">
        {/* Daire + aşama */}
        <div className="flex flex-col items-center gap-2">
          <ScoreCircle score={score} color={stage.color} />
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black tracking-wide"
            style={{ background: stage.bg, color: stage.color }}
          >
            {stage.label}
          </span>
        </div>

        {/* Kriter ızgarası */}
        <div className="min-w-[180px] flex-1">
          <p className="mb-0.5 text-[11px] font-bold text-slate-500">
            {completed}/{SCORE_CRITERIA.length} kriter tamamlandı
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {SCORE_CRITERIA.map((c) => {
              const ok = props[c.key];
              return (
                <div key={c.key} className="flex items-center gap-1.5">
                  <span className={`text-[12px] leading-none ${ok ? "text-emerald-500" : "text-slate-300"}`}>
                    {ok ? "✓" : "○"}
                  </span>
                  <span className={`text-[11px] font-extrabold ${ok ? "text-slate-900" : "text-slate-400"}`}>
                    {c.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Eksik bilgiler */}
      {missing.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-0.5 text-[11px] font-black tracking-wide text-amber-900">Eksik Bilgiler</p>
          {missing.map((m) => (
            <div key={m} className="flex items-center gap-1.5 text-[11px] font-extrabold text-amber-700">
              <span className="text-amber-500">⚠</span>
              <span>{m}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SeansStat ───────────────────────────────────────────────────────────────
function SeansStat({
  label,
  value,
  color,
  accent,
}: {
  label: string;
  value: string;
  color: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border border-slate-100 p-2.5"
      style={{ background: accent }}
    >
      <div className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </div>
      <div className="text-[17px] font-black leading-none" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ─── SeansCard ───────────────────────────────────────────────────────────────
function SeansCard({ process }: { process: SessionProcess }) {
  const meta = DURUM_META[process.durum];

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base" style={{ color: meta.color }}>◈</span>
          <span className="text-[14px] font-black tracking-tight text-slate-950">Seans Süreci</span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black"
          style={{ background: meta.bg, color: meta.color }}
        >
          <span
            className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
            style={{ background: meta.color }}
          />
          {meta.label}
        </span>
      </div>

      {/* Temel stats: tarihler + gün farkı */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SeansStat label="Toplam Seans" value={String(process.totalSeans)} color="#0f172a" accent="#f8fafc" />
        <SeansStat label="İlk Seans" value={process.ilkSeans ?? "—"} color="#64748b" accent="#f8fafc" />
        <SeansStat label="Son Seans" value={process.sonSeans ?? "—"} color="#64748b" accent="#f8fafc" />
        <SeansStat
          label="Son Görüşmeden Bu Yana"
          value={process.gunFarki != null ? `${process.gunFarki} gün` : "—"}
          color={
            process.gunFarki == null ? "#94a3b8"
            : process.gunFarki <= 14 ? "#10b981"
            : process.gunFarki <= 30 ? "#f59e0b"
            : "#ef4444"
          }
          accent={
            process.gunFarki == null ? "#f8fafc"
            : process.gunFarki <= 14 ? "#f0fdf4"
            : process.gunFarki <= 30 ? "#fffbeb"
            : "#fff1f2"
          }
        />
      </div>

      {/* Seans Sıklığı Özeti */}
      {process.totalSeans > 0 && (
        <>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Seans Sıklığı Özeti
            </span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <SeansStat
              label="Ort. Seans Süresi"
              value={process.avgDurationMin != null ? `${process.avgDurationMin} dk` : "—"}
              color={process.avgDurationMin != null ? "#7c3aed" : "#94a3b8"}
              accent={process.avgDurationMin != null ? "#f5f3ff" : "#f8fafc"}
            />
            <SeansStat
              label="Toplam Ücret"
              value={process.totalFee != null ? `${process.totalFee.toLocaleString("tr-TR")} ₺` : "—"}
              color={process.totalFee != null ? "#0891b2" : "#94a3b8"}
              accent={process.totalFee != null ? "#e0f2fe" : "#f8fafc"}
            />
            <SeansStat
              label="Ort. Sıklık"
              value={process.avgSiklikGun != null ? `${process.avgSiklikGun} günde bir` : "Yeterli veri yok"}
              color={process.avgSiklikGun != null ? "#16a34a" : "#94a3b8"}
              accent={process.avgSiklikGun != null ? "#f0fdf4" : "#f8fafc"}
            />
          </div>
        </>
      )}

      {process.yaklasanRandevu ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <span className="text-[13px]">◷</span>
          <span className="text-[12px] font-extrabold text-emerald-700">
            Yaklaşan Randevu:{" "}
            <strong className="text-emerald-900">{process.yaklasanRandevu}</strong>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <span className="text-[13px] text-slate-400">◷</span>
          <span className="text-[12px] font-extrabold text-slate-400">Yaklaşan randevu yok</span>
        </div>
      )}
    </div>
  );
}

// ─── OdevCard ────────────────────────────────────────────────────────────────
function OdevCard({ process }: { process: HomeworkProcess }) {
  const meta = ODEV_DURUM_META[process.durum];

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base" style={{ color: meta.color }}>✏</span>
          <span className="text-[14px] font-black tracking-tight text-slate-950">Ödev Takibi</span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black"
          style={{ background: meta.bg, color: meta.color }}
        >
          <span
            className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
            style={{ background: meta.color }}
          />
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SeansStat label="Toplam Ödev" value={String(process.total)} color="#0f172a" accent="#f8fafc" />
        <SeansStat label="Tamamlanan" value={String(process.tamamlanan)} color="#10b981" accent="#f0fdf4" />
        <SeansStat
          label="Devam Eden"
          value={String(process.devamEden)}
          color={process.devamEden > 0 ? "#f59e0b" : "#94a3b8"}
          accent={process.devamEden > 0 ? "#fffbeb" : "#f8fafc"}
        />
        <SeansStat label="Son Ödev Tarihi" value={process.sonOdevTarihi ?? "—"} color="#64748b" accent="#f8fafc" />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-slate-500">Tamamlama Yüzdesi</span>
          <span className="text-[14px] font-black" style={{ color: meta.color }}>
            %{process.yuzde}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${process.yuzde}%`,
              background:
                process.yuzde === 0
                  ? "#e2e8f0"
                  : `linear-gradient(90deg, ${meta.bar}, ${meta.bar}bb)`,
            }}
          />
        </div>
      </div>

      {process.aktifOdevBaslik && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
          <span className="text-[12px]">✏</span>
          <span className="text-[12px] font-extrabold text-amber-800">
            Aktif Ödev:{" "}
            <strong className="text-amber-900">{process.aktifOdevBaslik}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── AlertCard ───────────────────────────────────────────────────────────────
function AlertCard({ alerts }: { alerts: AlertItem[] }) {
  const kritikler  = alerts.filter((a) => a.category === "kritik");
  const takipler   = alerts.filter((a) => a.category === "takip");
  const bilgiler   = alerts.filter((a) => a.category === "bilgi");
  const olumluler  = alerts.filter((a) => a.category === "olumlu");

  const groups = [
    { items: kritikler,  meta: ALERT_META.kritik  },
    { items: takipler,   meta: ALERT_META.takip   },
    { items: bilgiler,   meta: ALERT_META.bilgi   },
    { items: olumluler,  meta: ALERT_META.olumlu  },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">◈</span>
          <span className="text-[14px] font-black tracking-tight text-slate-950">
            Akıllı Uyarılar ve Öneriler
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {kritikler.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-600">
              {kritikler.length} Kritik
            </span>
          )}
          {takipler.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-600">
              {takipler.length} Takip
            </span>
          )}
          {bilgiler.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-600">
              {bilgiler.length} Bilgi
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {groups.map(({ items, meta }) => (
          <div
            key={meta.label}
            className="flex flex-col gap-1.5 rounded-xl border p-3"
            style={{ background: meta.bg, borderColor: meta.border }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[12px]" style={{ color: meta.color }}>{meta.icon}</span>
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: meta.color }}
              >
                {meta.label}
              </span>
            </div>
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-1.5 pl-1">
                <span className="mt-0.5 flex-shrink-0 text-[10px]" style={{ color: meta.color }}>→</span>
                <span className="text-[12px] font-bold text-slate-700">{item.message}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="text-[40px] leading-none text-slate-300">◌</div>
      <div className="text-[15px] font-black text-slate-700">
        Bu danışan için henüz kayıtlı çalışma yok.
      </div>
      <div className="max-w-[360px] text-[12px] font-bold leading-relaxed text-slate-400">
        Numeroloji, doğaltaş, refleksoloji, biyoenerji, not veya randevu eklendiğinde burada kronolojik olarak görünecek.
      </div>
    </div>
  );
}

// ─── TimelineCard ─────────────────────────────────────────────────────────────
function TimelineCard({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const meta = getMeta(entry.type);

  const cardContent = (
    <div
      className="mb-3 min-w-0 flex-1 rounded-[14px] border bg-white p-3.5 shadow-sm"
      style={{ borderColor: `${meta.color}22`, cursor: entry.href ? "pointer" : "default" }}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black capitalize tracking-wide"
              style={{ background: meta.accent, color: meta.color }}
            >
              {entry.type}
            </span>
            {entry.badge && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                {entry.badge}
              </span>
            )}
          </div>
          <div className="mb-1 text-[14px] font-black text-slate-950">{entry.title}</div>
          <div className="text-[12px] font-bold text-slate-500">{entry.description}</div>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <div
            className="mt-0.5 whitespace-nowrap text-[10px] font-extrabold"
            style={{ color: `${meta.color}cc` }}
          >
            {entry.date}
          </div>
          {entry.href && (
            <span className="text-[10px] font-black" style={{ color: meta.color }}>
              Detay →
            </span>
          )}
        </div>
      </div>
      <div
        className="mt-3.5 h-0.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${meta.color}55, transparent)` }}
      />
    </div>
  );

  return (
    <div className="flex items-start gap-3.5">
      {/* Zaman çizgisi */}
      <div className="flex flex-shrink-0 flex-col items-center pt-1">
        <div
          className="relative z-10 flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: meta.color, boxShadow: `0 0 0 4px ${meta.accent}` }}
        >
          <span className="text-[11px] leading-none text-white">{meta.icon}</span>
        </div>
        {!isLast && (
          <div
            className="my-1 min-h-6 w-0.5 flex-1 rounded-full"
            style={{ background: `${meta.color}22` }}
          />
        )}
      </div>

      {entry.href ? (
        <Link href={entry.href} className="min-w-0 flex-1 no-underline">
          {cardContent}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{cardContent}</div>
      )}
    </div>
  );
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────
export default function YolculukTab({
  clientId,
  tenantId,
  clientName,
  clientPhone,
  clientLastSession,
  clientNextAppointment,
  clientAd,
  clientSoyad,
  clientDogum,
  onNavigate,
}: YolculukTabProps) {
  const [activeMenu, setActiveMenu] = useState("genel");
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [counts, setCounts] = useState({ analizler: 0, seanslar: 0, randevular: 0, notlar: 0, taslar: 0, odevler: 0 });
  const [sessionProcess, setSessionProcess] = useState<SessionProcess>({
    totalSeans: 0,
    ilkSeans: null,
    sonSeans: null,
    gunFarki: null,
    yaklasanRandevu: null,
    durum: "baslamadi",
    avgDurationMin: null,
    totalFee: null,
    avgSiklikGun: null,
  });
  const [homeworkProcess, setHomeworkProcess] = useState<HomeworkProcess>({
    total: 0,
    tamamlanan: 0,
    devamEden: 0,
    yuzde: 0,
    sonOdevTarihi: null,
    aktifOdevBaslik: null,
    durum: "yok",
  });
  const [extraAlertData, setExtraAlertData] = useState<{
    lastPastRandevuDaysAgo: number | null;
    lastAnalizDaysAgo: number | null;
  }>({ lastPastRandevuDaysAgo: null, lastAnalizDaysAgo: null });
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    if (!clientId || !tenantId) return;

    async function fetchTimeline() {
      setTimelineLoading(true);
      try {
        const [sessionsRes, appointmentsRes, stonesRes, analysesRes, homeworksRes, notesRes] =
          await Promise.all([
            supabase.from("client_sessions").select("*").eq("client_id", clientId).eq("tenant_id", tenantId),
            supabase.from("appointments").select("*").eq("client_id", clientId).eq("tenant_id", tenantId),
            supabase.from("client_stones").select("*").eq("client_id", clientId).eq("tenant_id", tenantId),
            supabase.from("client_analyses").select("*").eq("client_id", clientId).eq("tenant_id", tenantId),
            supabase.from("client_homeworks").select("*").eq("client_id", clientId).eq("tenant_id", tenantId),
            supabase.from("client_notes").select("*").eq("client_id", clientId).maybeSingle(),
          ]);

        const normalized: TimelineEntry[] = [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of (sessionsRes.data ?? []) as any[]) {
          normalized.push({
            id: `seans-${s.id}`,
            type: "seans",
            title: s.session_type || "Seans",
            description:
              ([s.session_note, s.actions_done] as (string | null)[]).filter(Boolean).join(" • ").slice(0, 150) ||
              "Seans gerçekleşti",
            date: isoToTR(s.session_date || s.created_at),
            dateRaw: s.session_date || s.created_at || "",
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of (appointmentsRes.data ?? []) as any[]) {
          normalized.push({
            id: `randevu-${a.id}`,
            type: "randevu",
            title: a.title || "Randevu",
            description: a.notes || statusLabel(a.status),
            date: isoToTR(a.appointment_date),
            dateRaw: a.appointment_date || "",
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of (stonesRes.data ?? []) as any[]) {
          normalized.push({
            id: `tas-${t.id}`,
            type: "dogaltas",
            title: t.stone_name || "Doğaltaş",
            description:
              ([t.usage_area, t.stone_type] as (string | null)[]).filter(Boolean).join(" — ") || t.note || "",
            date: isoToTR(t.stone_date || t.created_at),
            dateRaw: t.stone_date || t.created_at || "",
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const an of (analysesRes.data ?? []) as any[]) {
          normalized.push({
            id: `analiz-${an.id}`,
            type: "analiz",
            title: an.analysis_type || "Analiz",
            description: an.note || "",
            date: isoToTR(an.created_at),
            dateRaw: an.created_at || "",
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const hw of (homeworksRes.data ?? []) as any[]) {
          normalized.push({
            id: `odev-${hw.id}`,
            type: "odev",
            title: hw.title || hw.homework_type || "Ödev",
            description:
              ([hw.description, hw.expert_note] as (string | null)[]).filter(Boolean).join(" • ").slice(0, 150) || "",
            date: isoToTR(hw.start_date || hw.created_at),
            dateRaw: hw.start_date || hw.created_at || "",
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const noteData = notesRes.data as any;
        if (noteData) {
          const noteText = (
            [noteData.notlar, noteData.oneriler, noteData.saglik_notu] as (string | null | undefined)[]
          ).find(Boolean);
          if (noteText) {
            normalized.push({
              id: "not-genel",
              type: "not",
              title: "Danışan Notu",
              description: noteText.slice(0, 150),
              date: isoToTR(noteData.created_at ?? new Date().toISOString()),
              dateRaw: noteData.created_at ?? new Date(0).toISOString(),
            });
          }
        }

        if (clientDogum && (clientAd || clientSoyad)) {
          try {
            const firstName = clientAd || "";
            const lastName = clientSoyad || "";
            const hayatYolu = calcHayatYolu(clientDogum).display;
            const kaderSayisi = calcIfadeSayisi(firstName, lastName).display;
            const ruhSayisi = calcAnaKulvar(firstName, lastName).display;
            const kisilikSayisi = calcYanKulvar(firstName, lastName).display;
            const kisiselYil = calcKisiselYil(clientDogum).display;
            const yas = calcAge(clientDogum);

            const descParts: string[] = [
              `Hayat Yolu / DM: ${hayatYolu}`,
              `İfade Sayısı: ${kaderSayisi}`,
              `Ana Kulvar: ${ruhSayisi}`,
              `Yan Kulvar: ${kisilikSayisi}`,
              `Kişisel Yıl (${new Date().getFullYear()}): ${kisiselYil}`,
            ];
            if (yas != null) descParts.push(`Güncel Yaş: ${yas}`);

            const now = new Date().toISOString();
            normalized.push({
              id: "numeroloji-auto",
              type: "numeroloji",
              title: "Otomatik Numeroloji Özeti",
              description: descParts.join(" • "),
              date: isoToTR(now),
              dateRaw: now,
              badge: "Otomatik hesaplandı",
            });
          } catch {
            // numeroloji hatası sayfayı kırmasın
          }
        }

        normalized.sort((a, b) => (b.dateRaw > a.dateRaw ? 1 : b.dateRaw < a.dateRaw ? -1 : 0));

        // ── Seans süreci hesabı ────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessionList = (sessionsRes.data ?? []) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const appointmentList = (appointmentsRes.data ?? []) as any[];

        const newProcess: SessionProcess = {
          totalSeans: sessionList.length,
          ilkSeans: null,
          sonSeans: null,
          gunFarki: null,
          yaklasanRandevu: null,
          durum: "baslamadi",
          avgDurationMin: null,
          totalFee: null,
          avgSiklikGun: null,
        };

        const seansWithDate = sessionList
          .filter((s) => s.session_date)
          .sort((a, b) => (a.session_date < b.session_date ? -1 : 1));

        if (seansWithDate.length > 0) {
          newProcess.ilkSeans = isoToTR(seansWithDate[0].session_date);
          const last = seansWithDate[seansWithDate.length - 1];
          newProcess.sonSeans = isoToTR(last.session_date);
          const diffDays = Math.floor((Date.now() - new Date(last.session_date).getTime()) / 86400000);
          newProcess.gunFarki = diffDays;
          newProcess.durum = diffDays <= 14 ? "aktif" : diffDays <= 30 ? "takip" : "pasif";
        }

        const nowIso = new Date().toISOString();
        const upcoming = appointmentList
          .filter((a) => a.appointment_date > nowIso && a.status !== "iptal")
          .sort((a, b) => (a.appointment_date < b.appointment_date ? -1 : 1));
        if (upcoming.length > 0) {
          newProcess.yaklasanRandevu = isoToTR(upcoming[0].appointment_date);
        }

        // ── Seans sıklık özeti hesabı ──────────────────────────────────────
        // Ortalama süre: duration_minutes alanı olan seansların ortalaması
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sessionsWithDuration = sessionList.filter((s: any) => s.duration_minutes != null);
        if (sessionsWithDuration.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const totalMin = sessionsWithDuration.reduce((sum: number, s: any) => sum + (s.duration_minutes as number), 0);
          newProcess.avgDurationMin = Math.round(totalMin / sessionsWithDuration.length);
        }

        // Toplam ücret: en az bir seansta fee dolu ise topla, tümü null ise null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyFee = sessionList.some((s: any) => s.fee != null);
        if (anyFee) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          newProcess.totalFee = sessionList.reduce((sum: number, s: any) => sum + (s.fee ?? 0), 0);
        }

        // Ortalama sıklık: ilk ve son tarihli seans arasındaki gün / (toplam - 1) aralık
        // En az 2 tarihli seans gerekir
        if (seansWithDate.length >= 2) {
          const firstMs = new Date(seansWithDate[0].session_date).getTime();
          const lastMs  = new Date(seansWithDate[seansWithDate.length - 1].session_date).getTime();
          const totalDays = Math.floor((lastMs - firstMs) / 86400000);
          const computed  = Math.round(totalDays / (seansWithDate.length - 1));
          newProcess.avgSiklikGun = computed > 0 ? computed : null;
        }

        setSessionProcess(newProcess);

        // ── Ödev takibi hesabı ─────────────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hwList = (homeworksRes.data ?? []) as any[];
        const hwTamamlanan = hwList.filter((h) => h.status === "tamamlandi");
        const hwDevam = hwList.filter((h) => h.status !== "tamamlandi");
        const hwTotal = hwList.length;
        const hwYuzde = hwTotal === 0 ? 0 : Math.round((hwTamamlanan.length / hwTotal) * 100);

        const hwSonTarih =
          hwList
            .map((h) => h.end_date || h.start_date || h.created_at || "")
            .filter(Boolean)
            .sort()
            .reverse()[0] ?? null;

        const hwAktifBaslik =
          hwDevam.sort((a, b) => {
            const da = a.start_date || a.created_at || "";
            const db = b.start_date || b.created_at || "";
            return db > da ? 1 : -1;
          })[0]?.title ?? null;

        const hwDurum: HomeworkProcess["durum"] =
          hwTotal === 0 ? "yok"
          : hwYuzde === 100 ? "tamamlandi"
          : hwYuzde >= 71 ? "iyi"
          : hwYuzde >= 31 ? "devam"
          : "baslangic";

        setHomeworkProcess({
          total: hwTotal,
          tamamlanan: hwTamamlanan.length,
          devamEden: hwDevam.length,
          yuzde: hwYuzde,
          sonOdevTarihi: hwSonTarih ? isoToTR(hwSonTarih) : null,
          aktifOdevBaslik: hwAktifBaslik,
          durum: hwDurum,
        });

        // ── Uyarı sistemi ek verileri ──────────────────────────────────────
        const pastRandevular = appointmentList
          .filter((a) => a.appointment_date && a.appointment_date < nowIso)
          .sort((a, b) => (b.appointment_date > a.appointment_date ? 1 : -1));
        const lastPastRandevuDaysAgo = pastRandevular[0]?.appointment_date
          ? Math.floor((Date.now() - new Date(pastRandevular[0].appointment_date).getTime()) / 86400000)
          : null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const analysisSorted = ((analysesRes.data ?? []) as any[])
          .filter((a) => a.created_at)
          .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
        const lastAnalizDaysAgo = analysisSorted[0]?.created_at
          ? Math.floor((Date.now() - new Date(analysisSorted[0].created_at).getTime()) / 86400000)
          : null;

        setExtraAlertData({ lastPastRandevuDaysAgo, lastAnalizDaysAgo });

        setEntries(normalized);
        setCounts({
          analizler: analysesRes.data?.length ?? 0,
          seanslar: sessionsRes.data?.length ?? 0,
          randevular: appointmentsRes.data?.length ?? 0,
          taslar: stonesRes.data?.length ?? 0,
          odevler: homeworksRes.data?.length ?? 0,
          notlar:
            noteData &&
            ([noteData.notlar, noteData.oneriler, noteData.saglik_notu] as (string | null | undefined)[]).some(Boolean)
              ? 1
              : 0,
        });
      } catch {
        // fetch hatası sayfayı kırmasın
      } finally {
        setTimelineLoading(false);
      }
    }

    void fetchTimeline();
  }, [clientId, tenantId, clientDogum, clientAd, clientSoyad]);

  function handleMenuClick(item: MenuItem) {
    setActiveMenu(item.id);
    if (item.tabId && onNavigate) {
      onNavigate(item.tabId);
    }
  }

  // Uyarıları bir kez hesapla — hem banner hem kart için
  const currentAlerts = !timelineLoading
    ? buildAlerts({ clientDogum, clientPhone, counts, sessionProcess, homeworkProcess, extraAlertData })
    : [];
  const kritikAlerts = currentAlerts.filter((a) => a.category === "kritik");

  return (
    <div className="flex flex-col gap-5">
      {/* Üst özet stat kartlar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Analizler"  value={counts.analizler}  color="#7c3aed" bg="#faf5ff" icon="∞" />
        <SummaryCard label="Seanslar"   value={counts.seanslar}   color="#16a34a" bg="#f0fdf4" icon="◈" />
        <SummaryCard label="Randevular" value={counts.randevular} color="#db2777" bg="#fdf2f8" icon="◷" />
        <SummaryCard label="Notlar"     value={counts.notlar}     color="#2563eb" bg="#eff6ff" icon="✎" />
      </div>

      {/* Kritik uyarı banner — sadece kritik uyarı varsa göster */}
      {!timelineLoading && kritikAlerts.length > 0 && (
        <CriticalBanner alerts={kritikAlerts} />
      )}

      {/* 2×2 Dashboard grid */}
      {timelineLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LifeScoreCard
            hasDogum={Boolean(clientDogum)}
            hasTelefon={Boolean(clientPhone)}
            hasNot={counts.notlar > 0}
            hasSeans={counts.seanslar > 0}
            hasRandevu={counts.randevular > 0}
            hasAnaliz={counts.analizler > 0}
            hasTas={counts.taslar > 0}
            hasOdev={counts.odevler > 0}
          />
          <SeansCard process={sessionProcess} />
          <OdevCard process={homeworkProcess} />
          <AlertCard alerts={currentAlerts} />
        </div>
      )}

      {/* Full-width Timeline */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Sol panel */}
        <aside className="flex w-full flex-col gap-3 lg:w-[220px] lg:min-w-[180px] lg:flex-shrink-0">
          {/* Danışan özeti */}
          <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div
              className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full text-[22px] font-black text-white"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed, #db2777)",
                boxShadow: "0 6px 18px rgba(124,58,237,0.28)",
              }}
            >
              {clientName ? clientName.charAt(0).toUpperCase() : "D"}
            </div>
            <div className="flex w-full flex-col gap-1.5">
              <div className="mb-1 text-center text-[14px] font-black text-slate-950">
                {clientName || "İsimsiz Danışan"}
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Telefon</span>
                <span className="text-[11px] font-extrabold text-slate-950">{clientPhone || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Son Görüşme</span>
                <span className="text-[11px] font-extrabold text-slate-950">{clientLastSession || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Sonraki Randevu</span>
                <span className="text-[11px] font-black text-emerald-600">{clientNextAppointment || "—"}</span>
              </div>
            </div>
          </div>

          {/* Modül menüsü */}
          <nav className="rounded-2xl border border-slate-200 bg-white py-2 shadow-sm">
            {menuItems.map((item) => {
              const isActive = activeMenu === item.id;
              const hasTab = Boolean(item.tabId && onNavigate);

              if (!hasTab) {
                return (
                  <div
                    key={item.id}
                    className="flex w-full items-center gap-2.5 border-l-[3px] border-l-transparent px-3.5 py-2.5 text-[12px] font-extrabold text-slate-400"
                  >
                    <span
                      className="w-[18px] flex-shrink-0 text-center text-[14px] leading-none"
                      style={{ color: `${item.color}88` }}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="ml-auto inline-flex flex-shrink-0 items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-slate-400">
                      Yakında
                    </span>
                  </div>
                );
              }

              return (
                <button
                  key={item.id}
                  onClick={() => handleMenuClick(item)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12px] font-extrabold transition-colors"
                  style={{
                    background: isActive ? `${item.color}12` : "transparent",
                    borderLeft: isActive ? `3px solid ${item.color}` : "3px solid transparent",
                    color: isActive ? item.color : "#475569",
                  }}
                >
                  <span
                    className="w-[18px] flex-shrink-0 text-center text-[14px] leading-none"
                    style={{ color: item.color, opacity: isActive ? 1 : 0.65 }}
                  >
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="ml-auto text-[11px] opacity-50">→</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Timeline orta alan */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mb-5">
            <span className="mb-2 inline-flex items-center rounded-full bg-gradient-to-r from-violet-100 to-pink-100 px-3 py-1 text-[10px] font-black tracking-widest text-violet-700">
              Yolculuk
            </span>
            <h2 className="mb-1 text-[20px] font-black tracking-tight text-slate-950">Son Çalışmalar</h2>
            <p className="text-[12px] font-bold text-slate-500">
              Danışana ait tüm modül çalışmalarının kronolojik özeti
            </p>
          </div>

          {timelineLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-12">
              <div className="text-[15px] font-black text-slate-400">Yükleniyor...</div>
            </div>
          ) : entries.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col">
              {entries.map((entry, idx) => (
                <TimelineCard key={entry.id} entry={entry} isLast={idx === entries.length - 1} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
