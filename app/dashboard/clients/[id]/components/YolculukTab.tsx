"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { calcElementleri } from "@/lib/numeroloji/elementler";
import { calcZirveYillari } from "@/lib/numeroloji/zirveYillari";
import { hesaplaPinKodu } from "@/lib/numeroloji/pinKodu";
import { odevDurumColor, aggregateHomeworks } from "@/lib/odevStatus";
import { notesToPlainText } from "@/lib/clientNotes";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawData?: any;
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
  gecikti: number;
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

// i18n translator tipi (namespace-scoped t fonksiyonu). Modül-seviyesi saf
// fonksiyonlara t geçirmek için kullanılır (canonical kod → görünen etiket).
type T = ReturnType<typeof useTranslations>;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isoToTR(isoDate: string | null | undefined): string {
  if (!isoDate) return "-";
  const datePart = isoDate.split("T")[0];
  const parts = datePart.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// Randevu canonical statü kodu → görünen etiket (kod DEĞİŞMEZ; yalnız DISPLAY).
function statusLabel(status: string | null | undefined, t: T): string {
  if (status === "tamamlandi") return t("randevuStatus.tamamlandi");
  if (status === "iptal") return t("randevuStatus.iptal");
  return t("randevuStatus.bekliyor");
}

// Canonical ödev statü kodu → yerelleştirilmiş etiket (bilinmeyen→ham, null→"Bilinmiyor").
// Renk paylaşımlı odevDurumColor'dan; write payload/kod DEĞİŞMEZ.
function homeworkStatusLabel(s: string | null | undefined, t: T): string {
  return s && t.has(`homeworkStatus.${s}`) ? t(`homeworkStatus.${s}`) : (s || t("homeworkStatus.unknown"));
}

// analysis_type kodu → yerelleştirilmiş etiket (paylaşımlı analysisTypeLabel helper
// server Word-route için TR döndürmeye devam eder; UI display i18n).
function analysisTypeI18n(code: string | null | undefined, t: T): string {
  return code && t.has(`analysisType.${code}`) ? t(`analysisType.${code}`) : t("analysisType.default");
}

// element canonical DATA anahtarı ("Hava" vb.) → yerelleştirilmiş etiket; DATA aynen kalır.
function localizeElement(name: string, t: T): string {
  return t.has(`element.${name}`) ? t(`element.${name}`) : name;
}

// ─── WEB-16: Randevu zaman/gün yardımcıları (Europe/Istanbul otoriter) ───────────
// appointment_date leksikal string karşılaştırılmaz — parse edilip mutlak zamana
// çevrilir (DB "+00:00" offset'li gelebilir; "Z" ile string-compare kırılgandır).
// Tarih-only ("YYYY-MM-DD") değerler gün-bazlı, datetime değerler mutlak-zaman bazlı
// işlenir. Geçersiz tarih → güvenli (yaklaşan/geçmiş sayılmaz).
const IST_TZ = "Europe/Istanbul";

function isDateOnlyAppt(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

// Bir randevu değerinin İstanbul takvim günü (YYYY-MM-DD). Geçersiz → "".
function istanbulDay(dateStr: string): string {
  const s = dateStr.trim();
  if (isDateOnlyAppt(s)) return s; // saatsiz değer literal günüdür
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(d);
}

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ }).format(new Date());
}

// Randevu şu andan sonra mı? (iptal filtresini çağıran uygular.)
// Datetime: mutlak zaman > now. Tarih-only: İstanbul günü >= bugün.
function isUpcomingAppt(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const s = String(dateStr).trim();
  if (isDateOnlyAppt(s)) return istanbulDay(s) >= istanbulToday();
  const t = new Date(s).getTime();
  return Number.isFinite(t) && t > Date.now();
}

// Randevu geçmişte mi gerçekleşti? (iptal filtresini çağıran uygular.)
function isPastAppt(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const s = String(dateStr).trim();
  if (isDateOnlyAppt(s)) return istanbulDay(s) < istanbulToday();
  const t = new Date(s).getTime();
  return Number.isFinite(t) && t <= Date.now();
}

// İki İstanbul günü ("YYYY-MM-DD") arasındaki tam gün farkı (to - from).
// UTC-öğle referansı DST/gün kaymasını önler.
function istanbulDayDiff(fromDay: string, toDay: string): number {
  if (!fromDay || !toDay) return 0;
  const f = new Date(fromDay + "T12:00:00Z").getTime();
  const t = new Date(toDay + "T12:00:00Z").getTime();
  return Math.round((t - f) / 86400000);
}

// Sıralama için güvenli mutlak-ms (geçersiz → Infinity, sona atılır).
function apptMs(dateStr: string | null | undefined): number {
  const t = new Date(String(dateStr ?? "")).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
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

function isoToDDMMYYYY(iso: string): string {
  const p = iso.split("-");
  if (p.length !== 3 || p[0].length !== 4) return "";
  return `${p[2]}.${p[1]}.${p[0]}`;
}

// ─── Sol menü tanımları ──────────────────────────────────────────────────────
type MenuItem = {
  id: string;
  icon: string;
  color: string;
  tabId: string | null;
  typeFilter: string | null; // null = tüm kayıtlar; string = o tipe filtrele
};

// NOT: label alanı i18n'e taşındı — görünen etiket t(`menu.${item.id}`) ile çözülür.
// id/typeFilter canonical'dır (filtreleme mantığı buna bağlı) ve DEĞİŞMEZ.
const menuItems: MenuItem[] = [
  { id: "genel",        icon: "◈", color: "#2563eb", tabId: "genel",      typeFilter: null            },
  { id: "numeroloji",   icon: "∞", color: "#7c3aed", tabId: null,         typeFilter: "numeroloji"    },
  { id: "dogaltas",     icon: "◆", color: "#0891b2", tabId: "taslar",     typeFilter: "dogaltas"      },
  { id: "refleksoloji", icon: "◎", color: "#db2777", tabId: null,         typeFilter: "refleksoloji"  },
  { id: "biyoenerji",   icon: "⚡", color: "#ea580c", tabId: null,         typeFilter: "biyoenerji"    },
  { id: "notlar",       icon: "✎", color: "#6d28d9", tabId: "notlar",     typeFilter: "not"           },
  { id: "randevular",   icon: "◷", color: "#16a34a", tabId: "randevular", typeFilter: "randevu"       },
  { id: "dosyalar",     icon: "▣", color: "#475569", tabId: null,         typeFilter: null            },
];

// ─── Tip → görsel eşleşmesi ──────────────────────────────────────────────────
// KEY (numeroloji/dogaltas/...) canonical `type` kodudur — filtre/getMeta buna
// bağlı, DEĞİŞMEZ. Görünen etiket i18n'dedir: typeLabel(type, t).
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

// Canonical timeline `type` kodu → görünen etiket (bilinmeyen → "Diğer").
function typeLabel(type: string, t: T): string {
  return type in TYPE_META ? t(`type.${type}`) : t("type.default");
}

// ─── Durum sabitleri ──────────────────────────────────────────────────────────
// KEY'ler canonical durum kodudur (DEĞİŞMEZ). Görünen etiketler i18n'dedir:
// t(`durum.${code}`), t(`odevDurum.${code}`), t(`alertCat.${code}`).
const DURUM_META = {
  aktif:     { color: "#10b981", bg: "#d1fae5" },
  takip:     { color: "#f59e0b", bg: "#fef3c7" },
  pasif:     { color: "#ef4444", bg: "#fee2e2" },
  baslamadi: { color: "#94a3b8", bg: "#f1f5f9" },
} as const;

const ODEV_DURUM_META = {
  yok:        { color: "#94a3b8", bg: "#f1f5f9", bar: "#e2e8f0" },
  baslangic:  { color: "#ef4444", bg: "#fee2e2", bar: "#ef4444" },
  devam:      { color: "#f59e0b", bg: "#fef3c7", bar: "#f59e0b" },
  iyi:        { color: "#3b82f6", bg: "#dbeafe", bar: "#3b82f6" },
  tamamlandi: { color: "#10b981", bg: "#d1fae5", bar: "#10b981" },
} as const;

const ALERT_META = {
  kritik: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "⚠" },
  takip:  { color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "◎" },
  bilgi:  { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "ℹ" },
  olumlu: { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "✓" },
} as const;

type AlertCategory = keyof typeof ALERT_META;

// key = LifeScoreProps alan adı (canonical). Görünen etiketler i18n'de:
// t(`criteria.${key}`) ve t(`missing.${key}`).
const SCORE_CRITERIA: { key: keyof LifeScoreProps }[] = [
  { key: "hasDogum"   },
  { key: "hasTelefon" },
  { key: "hasNot"     },
  { key: "hasSeans"   },
  { key: "hasRandevu" },
  { key: "hasAnaliz"  },
  { key: "hasTas"     },
  { key: "hasOdev"    },
];

// ─── buildAlerts ─────────────────────────────────────────────────────────────
function buildAlerts({
  clientDogum,
  clientPhone,
  counts,
  sessionProcess,
  homeworkProcess,
  extraAlertData,
  t,
}: {
  clientDogum: string | undefined;
  clientPhone: string | undefined;
  counts: { analizler: number; seanslar: number; randevular: number; notlar: number; taslar: number; odevler: number };
  sessionProcess: SessionProcess;
  homeworkProcess: HomeworkProcess;
  extraAlertData: { lastPastRandevuDaysAgo: number | null; lastAnalizDaysAgo: number | null };
  t: T;
}): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (!clientDogum)
    alerts.push({ id: "no-dogum", message: t("alerts.noDogum"), category: "kritik" });

  if (!clientPhone)
    alerts.push({ id: "no-phone", message: t("alerts.noPhone"), category: "kritik" });

  if (sessionProcess.gunFarki != null && sessionProcess.gunFarki >= 30)
    alerts.push({ id: "seans-30", message: t("alerts.seans30", { days: sessionProcess.gunFarki }), category: "kritik" });

  // Yaklaşan aktif (iptal olmayan) randevu VARSA "randevu yok" kritik uyarısı çıkmaz;
  // bunun yerine aşağıdaki "Yaklaşan randevu" olumlu bilgisi korunur. Uyarı yalnızca
  // gelecekte planlı randevu yokken ve son geçmiş randevu 60+ gün önceyse anlamlıdır.
  if (
    !sessionProcess.yaklasanRandevu &&
    extraAlertData.lastPastRandevuDaysAgo != null &&
    extraAlertData.lastPastRandevuDaysAgo >= 60
  )
    alerts.push({ id: "randevu-60", message: t("alerts.randevu60", { days: extraAlertData.lastPastRandevuDaysAgo }), category: "kritik" });

  if (counts.analizler === 0)
    alerts.push({ id: "no-analiz", message: t("alerts.noAnaliz"), category: "kritik" });

  if (!sessionProcess.yaklasanRandevu)
    alerts.push({ id: "no-upcoming", message: t("alerts.noUpcoming"), category: "takip" });

  if (homeworkProcess.gecikti > 0)
    alerts.push({ id: "hw-gecikti", message: t("alerts.hwGecikti", { count: homeworkProcess.gecikti }), category: "kritik" });

  if (homeworkProcess.devamEden > 0)
    alerts.push({ id: "hw-pending", message: t("alerts.hwPending", { count: homeworkProcess.devamEden }), category: "takip" });

  if (counts.taslar === 0)
    alerts.push({ id: "no-tas", message: t("alerts.noTas"), category: "takip" });

  if (counts.notlar === 0)
    alerts.push({ id: "no-not", message: t("alerts.noNot"), category: "takip" });

  if (counts.seanslar === 0)
    alerts.push({ id: "no-seans", message: t("alerts.noSeans"), category: "takip" });

  if (sessionProcess.gunFarki != null && sessionProcess.gunFarki >= 14 && sessionProcess.gunFarki < 30)
    alerts.push({ id: "seans-14", message: t("alerts.seans14", { days: sessionProcess.gunFarki }), category: "bilgi" });

  if (extraAlertData.lastAnalizDaysAgo != null && extraAlertData.lastAnalizDaysAgo >= 60)
    alerts.push({ id: "analiz-old", message: t("alerts.analizOld", { days: extraAlertData.lastAnalizDaysAgo }), category: "bilgi" });

  if (counts.seanslar === 0 && counts.randevular === 0)
    alerts.push({ id: "new-client", message: t("alerts.newClient"), category: "bilgi" });

  if (counts.randevular > 0)
    alerts.push({ id: "randevu-count", message: t("alerts.randevuCount", { count: counts.randevular }), category: "bilgi" });

  if (sessionProcess.totalSeans > 0)
    alerts.push({ id: "seans-count", message: t("alerts.seansCount", { count: sessionProcess.totalSeans }), category: "bilgi" });

  if (clientDogum)
    alerts.push({ id: "numeroloji-ok", message: t("alerts.numerolojiOk"), category: "bilgi" });

  if (sessionProcess.gunFarki != null && sessionProcess.gunFarki < 14)
    alerts.push({ id: "seans-fresh", message: t("alerts.seansFresh", { days: sessionProcess.gunFarki }), category: "olumlu" });

  if (sessionProcess.yaklasanRandevu)
    alerts.push({ id: "upcoming-ok", message: t("alerts.upcomingOk", { date: sessionProcess.yaklasanRandevu }), category: "olumlu" });

  const hasProblem = alerts.some((a) => a.category === "kritik" || a.category === "takip");
  if (!hasProblem) {
    alerts.push({ id: "ok-1", message: t("alerts.ok1"), category: "olumlu" });
    alerts.push({ id: "ok-2", message: t("alerts.ok2"), category: "olumlu" });
  }

  return alerts;
}

// ─── CriticalBanner ──────────────────────────────────────────────────────────
function CriticalBanner({ alerts }: { alerts: AlertItem[] }) {
  const t = useTranslations("clients.yolculuk");
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 shadow-sm">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-red-500 text-sm font-black text-white">
        ⚠
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-[13px] font-black text-red-900">
          {t("criticalBanner.count", { count: alerts.length })}
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

function getScoreStage(score: number): { key: string; color: string; bg: string } {
  if (score <= 30) return { key: "baslangic",  color: "#ef4444", bg: "#fee2e2" };
  if (score <= 60) return { key: "gelisimde",  color: "#f59e0b", bg: "#fef3c7" };
  if (score <= 80) return { key: "aktifTakip", color: "#3b82f6", bg: "#dbeafe" };
  return               { key: "gucluSurec", color: "#10b981", bg: "#d1fae5" };
}

function LifeScoreCard(props: LifeScoreProps) {
  const t = useTranslations("clients.yolculuk");
  const completed = SCORE_CRITERIA.filter((c) => props[c.key]).length;
  const score = Math.round((completed / SCORE_CRITERIA.length) * 100);
  const stage = getScoreStage(score);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-base text-violet-600">◈</span>
        <span className="text-[14px] font-black tracking-tight text-slate-950">{t("lifeScore.title")}</span>
      </div>

      <div className="flex flex-wrap gap-5">
        {/* Daire + aşama */}
        <div className="flex flex-col items-center gap-2">
          <ScoreCircle score={score} color={stage.color} />
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black tracking-wide"
            style={{ background: stage.bg, color: stage.color }}
          >
            {t(`scoreStage.${stage.key}`)}
          </span>
        </div>

        {/* Kriter ızgarası */}
        <div className="min-w-[180px] flex-1">
          <p className="mb-0.5 text-[11px] font-bold text-slate-500">
            {t("lifeScore.criteriaProgress", { completed, total: SCORE_CRITERIA.length })}
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
                    {t(`criteria.${c.key}`)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── EksikAlanlarCard ─────────────────────────────────────────────────────────
function EksikAlanlarCard(props: LifeScoreProps) {
  const t = useTranslations("clients.yolculuk");
  const missingKeys = SCORE_CRITERIA.filter((c) => !props[c.key]).map((c) => c.key);
  if (missingKeys.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-base text-amber-500">⚠</span>
        <span className="text-[14px] font-black tracking-tight text-amber-900">{t("eksikAlanlar.title")}</span>
        <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
          {t("eksikAlanlar.count", { count: missingKeys.length })}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {missingKeys.map((k) => (
          <div key={k} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 shadow-sm">
            <span className="flex-shrink-0 text-[11px] text-amber-400">⚠</span>
            <span className="text-[11px] font-extrabold text-amber-800">{t(`missing.${k}`)}</span>
          </div>
        ))}
      </div>
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
      className="min-w-0 rounded-xl border border-slate-100 p-2.5"
      style={{ background: accent }}
    >
      <div className="mb-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </div>
      <div className="break-words text-[17px] font-black leading-tight" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ─── SeansCard ───────────────────────────────────────────────────────────────
function SeansCard({ process }: { process: SessionProcess }) {
  const t = useTranslations("clients.yolculuk");
  const meta = DURUM_META[process.durum];

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base" style={{ color: meta.color }}>◈</span>
          <span className="text-[14px] font-black tracking-tight text-slate-950">{t("seansCard.title")}</span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black"
          style={{ background: meta.bg, color: meta.color }}
        >
          <span
            className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
            style={{ background: meta.color }}
          />
          {t(`durum.${process.durum}`)}
        </span>
      </div>

      {/* Temel stats: tarihler + gün farkı */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SeansStat label={t("seansCard.totalSeans")} value={String(process.totalSeans)} color="#0f172a" accent="#f8fafc" />
        <SeansStat label={t("seansCard.ilkSeans")} value={process.ilkSeans ?? "—"} color="#64748b" accent="#f8fafc" />
        <SeansStat label={t("seansCard.sonSeans")} value={process.sonSeans ?? "—"} color="#64748b" accent="#f8fafc" />
        <SeansStat
          label={t("seansCard.sinceLastSession")}
          value={process.gunFarki != null ? t("seansCard.days", { days: process.gunFarki }) : "—"}
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
              {t("seansCard.frequencyTitle")}
            </span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <SeansStat
              label={t("seansCard.avgDuration")}
              value={process.avgDurationMin != null ? `${process.avgDurationMin} ${t("unit.min")}` : "—"}
              color={process.avgDurationMin != null ? "#7c3aed" : "#94a3b8"}
              accent={process.avgDurationMin != null ? "#f5f3ff" : "#f8fafc"}
            />
            <SeansStat
              label={t("seansCard.totalFee")}
              value={process.totalFee != null ? `${process.totalFee.toLocaleString("tr-TR")} ₺` : "—"}
              color={process.totalFee != null ? "#0891b2" : "#94a3b8"}
              accent={process.totalFee != null ? "#e0f2fe" : "#f8fafc"}
            />
            <SeansStat
              label={t("seansCard.avgFrequency")}
              value={process.avgSiklikGun != null ? t("seansCard.everyNDays", { days: process.avgSiklikGun }) : t("seansCard.notEnoughData")}
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
            {t("seansCard.upcomingLabel")}{" "}
            <strong className="text-emerald-900">{process.yaklasanRandevu}</strong>
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <span className="text-[13px] text-slate-400">◷</span>
          <span className="text-[12px] font-extrabold text-slate-400">{t("seansCard.noUpcoming")}</span>
        </div>
      )}
    </div>
  );
}

// ─── OdevCard ────────────────────────────────────────────────────────────────
function OdevCard({ process }: { process: HomeworkProcess }) {
  const t = useTranslations("clients.yolculuk");
  const meta = ODEV_DURUM_META[process.durum];

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base" style={{ color: meta.color }}>✏</span>
          <span className="text-[14px] font-black tracking-tight text-slate-950">{t("odevCard.title")}</span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black"
          style={{ background: meta.bg, color: meta.color }}
        >
          <span
            className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
            style={{ background: meta.color }}
          />
          {t(`odevDurum.${process.durum}`)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SeansStat label={t("odevCard.totalOdev")} value={String(process.total)} color="#0f172a" accent="#f8fafc" />
        <SeansStat label={t("odevCard.tamamlanan")} value={String(process.tamamlanan)} color="#10b981" accent="#f0fdf4" />
        <SeansStat
          label={t("odevCard.devamEden")}
          value={String(process.devamEden)}
          color={process.devamEden > 0 ? "#f59e0b" : "#94a3b8"}
          accent={process.devamEden > 0 ? "#fffbeb" : "#f8fafc"}
        />
        <SeansStat label={t("odevCard.sonOdevTarihi")} value={process.sonOdevTarihi ?? "—"} color="#64748b" accent="#f8fafc" />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-slate-500">{t("odevCard.completionPercent")}</span>
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
            {t("odevCard.activeLabel")}{" "}
            <strong className="text-amber-900">{process.aktifOdevBaslik}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── AlertCard ───────────────────────────────────────────────────────────────
function AlertCard({ alerts }: { alerts: AlertItem[] }) {
  const t = useTranslations("clients.yolculuk");
  const kritikler  = alerts.filter((a) => a.category === "kritik");
  const takipler   = alerts.filter((a) => a.category === "takip");
  const bilgiler   = alerts.filter((a) => a.category === "bilgi");
  const olumluler  = alerts.filter((a) => a.category === "olumlu");

  const groups: { code: AlertCategory; items: AlertItem[]; meta: (typeof ALERT_META)[AlertCategory] }[] = [
    { code: "kritik" as AlertCategory, items: kritikler,  meta: ALERT_META.kritik  },
    { code: "takip"  as AlertCategory, items: takipler,   meta: ALERT_META.takip   },
    { code: "bilgi"  as AlertCategory, items: bilgiler,   meta: ALERT_META.bilgi   },
    { code: "olumlu" as AlertCategory, items: olumluler,  meta: ALERT_META.olumlu  },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">◈</span>
          <span className="text-[14px] font-black tracking-tight text-slate-950">
            {t("alertCard.title")}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {kritikler.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-600">
              {t("alertCard.kritikBadge", { count: kritikler.length })}
            </span>
          )}
          {takipler.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-600">
              {t("alertCard.takipBadge", { count: takipler.length })}
            </span>
          )}
          {bilgiler.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-600">
              {t("alertCard.bilgiBadge", { count: bilgiler.length })}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {groups.map(({ code, items, meta }) => (
          <div
            key={code}
            className="flex flex-col gap-1.5 rounded-xl border p-3"
            style={{ background: meta.bg, borderColor: meta.border }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[12px]" style={{ color: meta.color }}>{meta.icon}</span>
              <span
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: meta.color }}
              >
                {t(`alertCat.${code}`)}
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
  const t = useTranslations("clients.yolculuk");
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="text-[40px] leading-none text-slate-300">◌</div>
      <div className="text-[15px] font-black text-slate-700">
        {t("empty.title")}
      </div>
      <div className="max-w-[360px] text-[12px] font-bold leading-relaxed text-slate-400">
        {t("empty.hint")}
      </div>
    </div>
  );
}

// ─── TimelineDetailModal ──────────────────────────────────────────────────────

const FONT_SIZES = { sm: "text-[12px]", md: "text-[14px]", lg: "text-[16px]" } as const;
type FontSize = keyof typeof FONT_SIZES;

// type → modal başlığı i18n anahtarı (görünen başlık t ile çözülür).
const MODAL_TITLE_KEYS: Record<string, string> = {
  not:        "modalTitle.not",
  randevu:    "modalTitle.randevu",
  seans:      "modalTitle.seans",
  dogaltas:   "modalTitle.dogaltas",
  odev:       "modalTitle.odev",
  analiz:     "modalTitle.analiz",
  numeroloji: "modalTitle.numeroloji",
};

const ELEMENT_COLOR: Record<string, string> = { Hava: "#0284c7", Su: "#1d4ed8", "Ateş": "#c2410c", Toprak: "#92400e" };
const ELEMENT_BG:    Record<string, string> = { Hava: "#e0f2fe", Su: "#dbeafe", "Ateş": "#ffedd5", Toprak: "#fef3c7" };

function ModalRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
      <span className="text-[11px] font-black uppercase tracking-wide text-slate-400 sm:min-w-[130px] sm:flex-shrink-0">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[13px] font-bold text-slate-900 leading-snug">{value}</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderModalBody(entry: TimelineEntry, textSize: string, t: T): React.ReactNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = entry.rawData as any;

  if (entry.type === "seans") {
    return (
      <div className={`flex flex-col gap-2 ${textSize}`}>
        <ModalRow label={t("modal.seansType")}  value={d?.session_type || entry.title} />
        <ModalRow label={t("modal.date")}       value={entry.date} />
        {d?.duration_minutes != null && <ModalRow label={t("modal.duration")}     value={`${d.duration_minutes} ${t("unit.min")}`} />}
        {d?.fee              != null && <ModalRow label={t("modal.fee")}          value={`${d.fee} ₺`} />}
        {d?.session_note             && <ModalRow label={t("modal.seansNote")}    value={d.session_note} />}
        {d?.actions_done             && <ModalRow label={t("modal.actionsDone")}  value={d.actions_done} />}
        {d?.suggestions              && <ModalRow label={t("modal.suggestions")}  value={d.suggestions} />}
        {!d && <p className="text-slate-600 leading-relaxed">{entry.description || "—"}</p>}
      </div>
    );
  }

  if (entry.type === "randevu") {
    const durumRenk = d?.status === "tamamlandi" ? "#16a34a" : d?.status === "iptal" ? "#ef4444" : "#f59e0b";
    return (
      <div className={`flex flex-col gap-2 ${textSize}`}>
        <ModalRow label={t("modal.title")} value={d?.title || entry.title} />
        <ModalRow label={t("modal.date")}  value={entry.date} />
        {d?.status && (
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="min-w-[130px] flex-shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-400">{t("modal.status")}</span>
            <span className="text-[13px] font-black" style={{ color: durumRenk }}>{statusLabel(d.status, t)}</span>
          </div>
        )}
        {d?.notes && <ModalRow label={t("modal.note")} value={d.notes} />}
        {!d && <p className="text-slate-600 leading-relaxed">{entry.description || "—"}</p>}
      </div>
    );
  }

  if (entry.type === "dogaltas") {
    return (
      <div className={`flex flex-col gap-2 ${textSize}`}>
        <ModalRow label={t("modal.stoneName")}     value={d?.stone_name || entry.title} />
        <ModalRow label={t("modal.date")}          value={entry.date} />
        {d?.stone_type && <ModalRow label={t("modal.stoneType")}  value={d.stone_type} />}
        {d?.usage_area && <ModalRow label={t("modal.usage")}      value={d.usage_area} />}
        {d?.note       && <ModalRow label={t("modal.note")}       value={d.note} />}
        {!d && <p className="text-slate-600 leading-relaxed">{entry.description || "—"}</p>}
      </div>
    );
  }

  if (entry.type === "odev") {
    return (
      <div className={`flex flex-col gap-2 ${textSize}`}>
        <ModalRow label={t("modal.title")}     value={d?.title || entry.title} />
        {d?.start_date  && <ModalRow label={t("modal.startDate")}  value={isoToTR(d.start_date)} />}
        {d?.end_date    && <ModalRow label={t("modal.endDate")}    value={isoToTR(d.end_date)} />}
        {d?.status && (
          <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="min-w-[130px] flex-shrink-0 text-[11px] font-black uppercase tracking-wide text-slate-400">{t("modal.status")}</span>
            <span className="text-[13px] font-black" style={{ color: odevDurumColor(d.status) }}>{homeworkStatusLabel(d.status, t)}</span>
          </div>
        )}
        {d?.description && <ModalRow label={t("modal.description")}   value={d.description} />}
        {d?.expert_note && <ModalRow label={t("modal.expertNote")} value={d.expert_note} />}
        {!d && <p className="text-slate-600 leading-relaxed">{entry.description || "—"}</p>}
      </div>
    );
  }

  if (entry.type === "analiz") {
    return (
      <div className={`flex flex-col gap-2 ${textSize}`}>
        <ModalRow label={t("modal.analysisType")}   value={d?.analysis_type ? analysisTypeI18n(d.analysis_type, t) : entry.title} />
        <ModalRow label={t("modal.date")}         value={entry.date} />
        {d?.note && <ModalRow label={t("modal.resultSummary")} value={d.note} />}
        {!d && <p className="text-slate-600 leading-relaxed">{entry.description || "—"}</p>}
      </div>
    );
  }

  if (entry.type === "not") {
    // `notlar` çok-not JSON dizisi olarak saklanabilir; salt-okunur gösterim için
    // insan-okunur düz metne çevir (eski düz-metin kayıtlar aynen kalır). Ham JSON
    // ASLA kullanıcıya gösterilmez; parse başarısızsa kontrollü fallback döner.
    const notlarText = notesToPlainText(d?.notlar);
    return (
      <div className={`flex flex-col gap-2 ${textSize}`}>
        <ModalRow label={t("modal.date")} value={entry.date} />
        {notlarText     && <ModalRow label={t("modal.notes")}      value={notlarText} />}
        {d?.oneriler    && <ModalRow label={t("modal.suggestions")}    value={d.oneriler} />}
        {d?.saglik_notu && <ModalRow label={t("modal.healthNote")} value={d.saglik_notu} />}
        {!d && <p className="text-slate-600 leading-relaxed">{entry.description || "—"}</p>}
      </div>
    );
  }

  if (entry.type === "numeroloji") {
    const numItems = [
      { label: t("num.anaKulvar"),   value: d?.anaKulvar,    color: "#16a34a" },
      { label: t("num.yanKulvar"),   value: d?.yanKulvar,    color: "#db2777" },
      { label: t("num.ifadeSayisi"), value: d?.ifadeSayisi,  color: "#2563eb" },
      { label: t("num.hayatYolu"),   value: d?.hayatYolu,    color: "#7c3aed" },
      { label: t("num.kisiselYil"),  value: d?.kisiselYil,   color: "#ea580c" },
      ...(d?.yas != null ? [{ label: t("num.guncelYas"), value: String(d.yas), color: "#64748b" }] : []),
    ];
    return (
      <div className={`flex flex-col gap-3 ${textSize}`}>
        {/* Temel sayılar */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {numItems.map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-center rounded-xl border bg-white px-3 py-3 shadow-sm">
              <span className="text-[26px] font-black leading-none" style={{ color }}>{value || "—"}</span>
              <span className="mt-1.5 text-center text-[10px] font-extrabold text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Element dağılımı */}
        {d?.elementler && (
          <div className="flex flex-col gap-2 rounded-xl border bg-slate-50 p-3">
            <span className="text-[11px] font-black text-slate-500">{t("num.elementDist")}</span>
            <div className="flex flex-wrap gap-1.5">
              {/* NOT: element adları ("Hava"/"Su"/"Ateş"/"Toprak") persisted DATA
                  key'idir (counts index'i) — DEĞİŞMEZ; görünen etiket i18n (localizeElement). */}
              {(["Hava", "Su", "Ateş", "Toprak"] as const).map((name) => {
                const count = d.elementler?.counts?.[name] ?? 0;
                return (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-extrabold"
                    style={{ background: ELEMENT_BG[name], color: ELEMENT_COLOR[name] }}
                  >
                    {localizeElement(name, t)} <strong>{count}</strong>
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4">
              {d.elementler?.key && (
                <span className="text-[11px] font-bold text-slate-500">
                  {t("num.dominant")} <strong>{localizeElement(d.elementler.key, t)}</strong>
                </span>
              )}
              {d?.eksikElement?.length > 0 && (
                <span className="text-[11px] font-bold text-slate-500">
                  {t("num.missing")} <strong>{(d.eksikElement as string[]).map((e) => localizeElement(e, t)).join(", ")}</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Güçlü / Eksik sayılar */}
        {(d?.gucluSayilar?.length > 0 || d?.eksikSayilar?.length > 0) && (
          <div className="grid grid-cols-2 gap-2">
            {d?.gucluSayilar?.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl border bg-slate-50 p-3">
                <span className="text-[11px] font-black text-slate-500">{t("num.strongNumbers")}</span>
                <div className="flex flex-wrap gap-1">
                  {(d.gucluSayilar as number[]).map(n => (
                    <span key={n} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[12px] font-black text-emerald-700">{n}</span>
                  ))}
                </div>
              </div>
            )}
            {d?.eksikSayilar?.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-xl border bg-slate-50 p-3">
                <span className="text-[11px] font-black text-slate-500">{t("num.missingNumbers")}</span>
                <div className="flex flex-wrap gap-1">
                  {(d.eksikSayilar as number[]).map(n => (
                    <span key={n} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-[12px] font-black text-red-600">{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Zirve bilgisi */}
        {d?.zirve?.peaks?.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border bg-slate-50 p-3">
            <span className="text-[11px] font-black text-slate-500">{t("num.peakInfo")}</span>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(d.zirve.peaks as any[]).slice(0, 4).map((p) => (
              <div key={p.index} className="flex items-center gap-2 text-[12px] font-bold text-slate-700">
                <span className="font-black text-indigo-600">{t("num.peakN", { n: p.index })}</span>
                <span className="text-slate-400">·</span>
                <span>{t("num.ageYears", { age: p.age })}</span>
                <span className="text-slate-400">·</span>
                <span>{t("num.chakraN", { topic: p.topic })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={textSize}>
      <p className="leading-relaxed text-slate-700">{entry.description || "—"}</p>
    </div>
  );
}

function TimelineDetailModal({ entry, onClose }: { entry: TimelineEntry; onClose: () => void }) {
  const t = useTranslations("clients.yolculuk");
  const [fontSize, setFontSize] = useState<FontSize>("md");
  const meta = getMeta(entry.type);
  const titleKey = MODAL_TITLE_KEYS[entry.type];
  const modalTitle = titleKey ? t(titleKey) : entry.title;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex max-h-[90dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ border: `1px solid ${meta.color}33` }}
      >
        {/* Header */}
        <div
          className="flex flex-shrink-0 flex-wrap items-start gap-3 px-5 py-4"
          style={{
            background: `linear-gradient(135deg, ${meta.accent}, #ffffff)`,
            borderBottom: `1px solid ${meta.color}22`,
          }}
        >
          <div
            className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-xl text-[16px] text-white"
            style={{ background: meta.color }}
          >
            {meta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-black text-slate-950">{modalTitle}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400">{entry.date}</span>
              {entry.badge && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                  {entry.badge}
                </span>
              )}
            </div>
          </div>
          {/* Yazı boyutu + kapat */}
          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
            {(["sm", "md", "lg"] as FontSize[]).map((s) => (
              <button
                key={s}
                onClick={() => setFontSize(s)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-black transition-colors"
                style={{
                  background:   fontSize === s ? meta.color : "white",
                  color:        fontSize === s ? "white"    : meta.color,
                  borderColor:  `${meta.color}44`,
                }}
              >
                {s === "sm" ? "A−" : s === "lg" ? "A+" : "A"}
              </button>
            ))}
            <button
              onClick={onClose}
              className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[15px] font-black text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {renderModalBody(entry, FONT_SIZES[fontSize], t)}
        </div>
      </div>
    </div>
  );
}

// ─── TimelineCard ─────────────────────────────────────────────────────────────
function TimelineCard({
  entry,
  isLast,
  onOpen,
}: {
  entry: TimelineEntry;
  isLast: boolean;
  onOpen: (entry: TimelineEntry) => void;
}) {
  const t = useTranslations("clients.yolculuk");
  const meta = getMeta(entry.type);

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

      <button
        className="mb-1.5 min-w-0 flex-1 rounded-[14px] border bg-white px-3 py-2.5 text-left shadow-sm transition-shadow hover:shadow-md"
        style={{ borderColor: `${meta.color}22`, cursor: "pointer" }}
        onClick={() => onOpen(entry)}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black tracking-wide"
                style={{ background: meta.accent, color: meta.color }}
              >
                {typeLabel(entry.type, t)}
              </span>
              {entry.badge && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                  {entry.badge}
                </span>
              )}
            </div>
            <div className="mb-0.5 text-[13px] font-black text-slate-950">{entry.title}</div>
            {entry.description && (
              <div className="line-clamp-2 text-[11px] font-bold leading-snug text-slate-400">{entry.description}</div>
            )}
          </div>
          <div className="flex-shrink-0 whitespace-nowrap text-[10px] font-extrabold sm:ml-2" style={{ color: `${meta.color}cc` }}>
            {entry.date}
          </div>
        </div>
      </button>
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
  const t = useTranslations("clients.yolculuk");
  const INITIAL_COUNT = 5;
  const LOAD_STEP     = 5;

  const [activeMenu,    setActiveMenu]    = useState("genel");
  const [activeFilter,  setActiveFilter]  = useState<string | null>(null);
  const [displayCount,  setDisplayCount]  = useState(INITIAL_COUNT);
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
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
    gecikti: 0,
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
        const yUserId = readYasamUser()?.id;
        const yToken = readSessionToken();
        const yHeaders: Record<string, string> = {
          "x-user-id": yUserId ?? "",
          ...(yToken ? { "x-session-token": yToken } : {}),
        };
        // Güvenli service_role API'leri; downstream .data şekli korunur.
        const apiList = async (path: string, key: string): Promise<{ data: unknown[] }> => {
          const r = await fetch(path, { headers: yHeaders });
          if (!r.ok) return { data: [] };
          const j = (await r.json().catch(() => ({}))) as Record<string, unknown[]>;
          return { data: (j[key] ?? []) as unknown[] };
        };
        const [sessionsRes, appointmentsRes, stonesRes] =
          await Promise.all([
            apiList(`/api/clients/${clientId}/sessions`, "sessions"),
            apiList(`/api/clients/${clientId}/appointments`, "appointments"),
            apiList(`/api/clients/${clientId}/stones`, "stones"),
          ]);

        // client_homeworks artık güvenli API üzerinden okunur (publishable key ile doğrudan okunmaz).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let homeworksData: any[] = [];
        try {
          const userId = readYasamUser()?.id;
          const sessionToken = readSessionToken();
          const hRes = await fetch(`/api/clients/${clientId}/homeworks`, {
            headers: {
              "x-user-id": userId ?? "",
              ...(sessionToken ? { "x-session-token": sessionToken } : {}),
            },
          });
          if (hRes.ok) {
            const hJson = (await hRes.json().catch(() => ({}))) as { homeworks?: unknown[] };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            homeworksData = (hJson.homeworks ?? []) as any[];
          }
        } catch {
          /* sessiz — zaman çizelgesi ödevleri opsiyonel */
        }

        // client_analyses artık güvenli API üzerinden okunur (publishable key ile doğrudan okunmaz).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let analysesData: any[] = [];
        try {
          const userId = readYasamUser()?.id;
          const sessionToken = readSessionToken();
          const aRes = await fetch(`/api/clients/${clientId}/analyses`, {
            headers: {
              "x-user-id": userId ?? "",
              ...(sessionToken ? { "x-session-token": sessionToken } : {}),
            },
          });
          if (aRes.ok) {
            const aJson = (await aRes.json().catch(() => ({}))) as { analyses?: unknown[] };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            analysesData = (aJson.analyses ?? []) as any[];
          }
        } catch {
          /* sessiz — zaman çizelgesi analizleri opsiyonel */
        }

        // client_notes artık güvenli API üzerinden okunur (publishable key ile doğrudan okunmaz).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let noteData: any = null;
        try {
          const userId = readYasamUser()?.id;
          const sessionToken = readSessionToken();
          const notesRes = await fetch(`/api/clients/${clientId}/notes`, {
            headers: {
              "x-user-id": userId ?? "",
              ...(sessionToken ? { "x-session-token": sessionToken } : {}),
            },
          });
          if (notesRes.ok) {
            const notesJson = (await notesRes.json().catch(() => ({}))) as { note?: unknown };
            noteData = notesJson.note ?? null;
          }
        } catch {
          /* sessiz — zaman çizelgesi notu opsiyonel */
        }

        const normalized: TimelineEntry[] = [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of (sessionsRes.data ?? []) as any[]) {
          normalized.push({
            id: `seans-${s.id}`,
            type: "seans",
            title: s.session_type || t("entryFallback.seans"),
            description:
              ([s.session_note, s.actions_done] as (string | null)[]).filter(Boolean).join(" • ").slice(0, 150) ||
              t("entryFallback.seansDesc"),
            date: isoToTR(s.session_date || s.created_at),
            dateRaw: s.session_date || s.created_at || "",
            rawData: s,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const a of (appointmentsRes.data ?? []) as any[]) {
          normalized.push({
            id: `randevu-${a.id}`,
            type: "randevu",
            title: a.title || t("entryFallback.randevu"),
            description: a.notes || statusLabel(a.status, t),
            date: isoToTR(a.appointment_date),
            dateRaw: a.appointment_date || "",
            rawData: a,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const st of (stonesRes.data ?? []) as any[]) {
          normalized.push({
            id: `tas-${st.id}`,
            type: "dogaltas",
            title: st.stone_name || t("entryFallback.dogaltas"),
            description:
              ([st.usage_area, st.stone_type] as (string | null)[]).filter(Boolean).join(" — ") || st.note || "",
            date: isoToTR(st.stone_date || st.created_at),
            dateRaw: st.stone_date || st.created_at || "",
            rawData: st,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const an of analysesData as any[]) {
          normalized.push({
            id: `analiz-${an.id}`,
            type: "analiz",
            title: analysisTypeI18n(an.analysis_type, t),
            description: an.note || "",
            date: isoToTR(an.created_at),
            dateRaw: an.created_at || "",
            rawData: an,
          });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const hw of homeworksData as any[]) {
          normalized.push({
            id: `odev-${hw.id}`,
            type: "odev",
            title: hw.title || hw.homework_type || t("entryFallback.odev"),
            description:
              ([hw.description, hw.expert_note] as (string | null)[]).filter(Boolean).join(" • ").slice(0, 150) || "",
            date: isoToTR(hw.start_date || hw.created_at),
            dateRaw: hw.start_date || hw.created_at || "",
            rawData: hw,
          });
        }

        if (noteData) {
          // `notlar` çok-not JSON dizisi olabilir → önce düz metne çevir; ham JSON
          // envelope (id/content/createdAt…) timeline açıklamasında GÖSTERİLMEZ.
          const notlarText = notesToPlainText(noteData.notlar);
          const noteText = (
            [notlarText, noteData.oneriler, noteData.saglik_notu] as (string | null | undefined)[]
          ).find(Boolean);
          if (noteText) {
            normalized.push({
              id: "not-genel",
              type: "not",
              title: t("modalTitle.not"),
              description: noteText.slice(0, 150),
              date: isoToTR(noteData.created_at ?? new Date().toISOString()),
              dateRaw: noteData.created_at ?? new Date(0).toISOString(),
              rawData: noteData,
            });
          }
        }

        if (clientDogum && (clientAd || clientSoyad)) {
          try {
            const firstName = clientAd || "";
            const lastName = clientSoyad || "";
            const hayatYolu   = calcHayatYolu(clientDogum).display;
            const ifadeSayisi = calcIfadeSayisi(firstName, lastName).display;
            const anaKulvar   = calcAnaKulvar(firstName, lastName).display;
            const yanKulvar   = calcYanKulvar(firstName, lastName).display;
            const kisiselYil  = calcKisiselYil(clientDogum).display;
            const yas         = calcAge(clientDogum);

            const dogumTR = isoToDDMMYYYY(clientDogum);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let elementler: any = null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let zirve: any = null;
            let gucluSayilar: number[] = [];
            let eksikSayilar: number[] = [];
            let eksikElement: string[] = [];
            if (dogumTR) {
              try { elementler = calcElementleri(dogumTR); } catch { /* sessiz */ }
              try { zirve = calcZirveYillari(dogumTR); }    catch { /* sessiz */ }
              try {
                const pin = hesaplaPinKodu(dogumTR);
                const pinDigits = [pin.k1, pin.k2, pin.k3, pin.k4, pin.k5, pin.k6, pin.k7, pin.k8];
                const freq: Record<number, number> = {};
                for (const d of pinDigits) if (d >= 1 && d <= 9) freq[d] = (freq[d] ?? 0) + 1;
                gucluSayilar = [1,2,3,4,5,6,7,8,9].filter(n => (freq[n] ?? 0) >= 2);
                eksikSayilar = [1,2,3,4,5,6,7,8,9].filter(n => !(freq[n]));
              } catch { /* sessiz */ }
              if (elementler) {
                eksikElement = (["Hava","Su","Ateş","Toprak"] as const).filter(
                  e => (elementler.counts[e] ?? 0) === 0
                );
              }
            }

            const descParts: string[] = [
              `${t("num.anaKulvar")}: ${anaKulvar}`,
              `${t("num.yanKulvar")}: ${yanKulvar}`,
              `${t("num.ifadeSayisi")}: ${ifadeSayisi}`,
              `${t("num.hayatYolu")}: ${hayatYolu}`,
              `${t("num.kisiselYilYear", { year: new Date().getFullYear() })}: ${kisiselYil}`,
            ];
            if (yas != null) descParts.push(`${t("num.guncelYas")}: ${yas}`);

            const now = new Date().toISOString();
            normalized.push({
              id: "numeroloji-auto",
              type: "numeroloji",
              title: t("modalTitle.numeroloji"),
              description: descParts.join(" • "),
              date: isoToTR(now),
              dateRaw: now,
              badge: t("badge.autoCalc"),
              rawData: { hayatYolu, ifadeSayisi, anaKulvar, yanKulvar, kisiselYil, yas, elementler, zirve, gucluSayilar, eksikSayilar, eksikElement },
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

        // WEB-16: iptal hariç, gerçekten yaklaşan (aynı gün ileri saat dâhil) randevular.
        const upcoming = appointmentList
          .filter((a) => a.status !== "iptal" && isUpcomingAppt(a.appointment_date))
          .sort((a, b) => apptMs(a.appointment_date) - apptMs(b.appointment_date));
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
        const hwList = homeworksData as any[];
        // FAZ 2 F3: canonical toplama (lib/odevStatus). "Devam Eden" = yalnız `devam`
        // (iptal/gecikti/bekliyor DEĞİL); tamamlanma paydasından yalnız iptal çıkar;
        // "gecikti" = canonical overdue (gecikti VEYA devam+geçmiş end_date, İstanbul).
        const hwAgg = aggregateHomeworks(hwList, istanbulToday());
        const hwTotal = hwAgg.total;
        const hwYuzde = hwAgg.completionPercent;
        // Aktif ödev başlığı: yalnız `devam` statülü ödevlerden en yenisi.
        const hwDevamList = hwList.filter((h) => h.status === "devam");

        const hwSonTarih =
          hwList
            .map((h) => h.end_date || h.start_date || h.created_at || "")
            .filter(Boolean)
            .sort()
            .reverse()[0] ?? null;

        const hwAktifBaslik =
          hwDevamList.sort((a, b) => {
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
          tamamlanan: hwAgg.completed,
          devamEden: hwAgg.active,
          gecikti: hwAgg.overdue,
          yuzde: hwYuzde,
          sonOdevTarihi: hwSonTarih ? isoToTR(hwSonTarih) : null,
          aktifOdevBaslik: hwAktifBaslik,
          durum: hwDurum,
        });

        // ── Uyarı sistemi ek verileri ──────────────────────────────────────
        // WEB-16: iptal randevular son-randevu hesabına KATILMAZ; gün farkı İstanbul
        // takvim günüyle. Hiç geçmiş randevu yoksa null (uydurma gün sayısı üretilmez).
        const pastRandevular = appointmentList
          .filter((a) => a.status !== "iptal" && isPastAppt(a.appointment_date))
          .sort((a, b) => apptMs(b.appointment_date) - apptMs(a.appointment_date));
        const lastPastRandevuDaysAgo = pastRandevular[0]?.appointment_date
          ? Math.max(0, istanbulDayDiff(istanbulDay(String(pastRandevular[0].appointment_date)), istanbulToday()))
          : null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const analysisSorted = (analysesData as any[])
          .filter((a) => a.created_at)
          .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
        const lastAnalizDaysAgo = analysisSorted[0]?.created_at
          ? Math.floor((Date.now() - new Date(analysisSorted[0].created_at).getTime()) / 86400000)
          : null;

        setExtraAlertData({ lastPastRandevuDaysAgo, lastAnalizDaysAgo });

        setEntries(normalized);
        setCounts({
          analizler: analysesData.length,
          seanslar: sessionsRes.data?.length ?? 0,
          randevular: appointmentsRes.data?.length ?? 0,
          taslar: stonesRes.data?.length ?? 0,
          odevler: homeworksData.length,
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
  }, [clientId, tenantId, clientDogum, clientAd, clientSoyad, t]);

  function handleMenuClick(item: MenuItem) {
    setActiveMenu(item.id);
    setActiveFilter(item.typeFilter);
    setDisplayCount(INITIAL_COUNT);
  }

  // Uyarıları bir kez hesapla — hem banner hem kart için
  const currentAlerts = !timelineLoading
    ? buildAlerts({ clientDogum, clientPhone, counts, sessionProcess, homeworkProcess, extraAlertData, t })
    : [];
  const kritikAlerts = currentAlerts.filter((a) => a.category === "kritik");

  // Sayfa içi timeline filtresi + sayfalama
  const filteredEntries = activeFilter
    ? entries.filter((e) => e.type === activeFilter)
    : entries;
  const visibleEntries  = filteredEntries.slice(0, displayCount);
  const remainingCount  = filteredEntries.length - displayCount;

  // Yaşam skoru eksik listesi (LifeScoreCard ve EksikAlanlarCard paylaşıyor)
  const scoreProps = {
    hasDogum:    Boolean(clientDogum),
    hasTelefon:  Boolean(clientPhone),
    hasNot:      counts.notlar    > 0,
    hasSeans:    counts.seanslar  > 0,
    hasRandevu:  counts.randevular > 0,
    hasAnaliz:   counts.analizler > 0,
    hasTas:      counts.taslar    > 0,
    hasOdev:     counts.odevler   > 0,
  };

  return (
    <>
    {selectedEntry && (
      <TimelineDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    )}
    <div className="flex flex-col gap-5">
      {/* Üst özet stat kartlar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label={t("summary.analizler")}  value={counts.analizler}  color="#7c3aed" bg="#faf5ff" icon="∞" />
        <SummaryCard label={t("summary.seanslar")}   value={counts.seanslar}   color="#16a34a" bg="#f0fdf4" icon="◈" />
        <SummaryCard label={t("summary.randevular")} value={counts.randevular} color="#db2777" bg="#fdf2f8" icon="◷" />
        <SummaryCard label={t("summary.notlar")}     value={counts.notlar}     color="#2563eb" bg="#eff6ff" icon="✎" />
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
          <LifeScoreCard {...scoreProps} />
          <EksikAlanlarCard {...scoreProps} />
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
                {clientName || t("sidebar.unnamed")}
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t("sidebar.phone")}</span>
                <span className="text-[11px] font-extrabold text-slate-950">{clientPhone || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t("sidebar.lastSession")}</span>
                <span className="text-[11px] font-extrabold text-slate-950">{clientLastSession || "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t("sidebar.nextAppointment")}</span>
                <span className="text-[11px] font-black text-emerald-600">{clientNextAppointment || "—"}</span>
              </div>
            </div>
          </div>

          {/* Modül menüsü — tüm öğeler timeline'ı filtreler */}
          <nav className="rounded-2xl border border-slate-200 bg-white py-2 shadow-sm">
            {menuItems.map((item) => {
              const isActive   = activeMenu === item.id;
              // Filtrelenemez öğeler: typeFilter null VE "genel" değil VE "dosyalar"
              const isDisabled = item.typeFilter === null && item.id !== "genel";
              const filterCount = item.typeFilter
                ? entries.filter((e) => e.type === item.typeFilter).length
                : null;

              if (isDisabled) {
                return (
                  <div
                    key={item.id}
                    className="flex w-full items-center gap-2.5 border-l-[3px] border-l-transparent px-3.5 py-2.5 text-[12px] font-extrabold text-slate-400"
                  >
                    <span className="w-[18px] flex-shrink-0 text-center text-[14px] leading-none" style={{ color: `${item.color}88` }}>
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{t(`menu.${item.id}`)}</span>
                    <span className="ml-auto inline-flex flex-shrink-0 items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-slate-400">
                      {t("sidebar.soon")}
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
                    background:  isActive ? `${item.color}12` : "transparent",
                    borderLeft:  isActive ? `3px solid ${item.color}` : "3px solid transparent",
                    color:       isActive ? item.color : "#475569",
                  }}
                >
                  <span className="w-[18px] flex-shrink-0 text-center text-[14px] leading-none" style={{ color: item.color, opacity: isActive ? 1 : 0.65 }}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{t(`menu.${item.id}`)}</span>
                  {filterCount !== null && (
                    <span
                      className="ml-auto mr-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-black"
                      style={{ background: `${item.color}18`, color: item.color }}
                    >
                      {filterCount}
                    </span>
                  )}
                  {filterCount === null && <span className="ml-auto text-[11px] opacity-40">→</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Timeline orta alan */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mb-5">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gradient-to-r from-violet-100 to-pink-100 px-3 py-1 text-[10px] font-black tracking-widest text-violet-700">
                {t("timeline.chip")}
              </span>
              {activeFilter && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black"
                  style={{ background: `${getMeta(activeFilter).color}15`, color: getMeta(activeFilter).color }}
                >
                  {getMeta(activeFilter).icon} {t("timeline.filterChip", { label: typeLabel(activeFilter, t) })}
                  <button
                    onClick={() => { setActiveFilter(null); setActiveMenu("genel"); setDisplayCount(INITIAL_COUNT); }}
                    className="ml-1 opacity-60 hover:opacity-100"
                  >✕</button>
                </span>
              )}
            </div>
            <h2 className="mb-1 text-[20px] font-black tracking-tight text-slate-950">{t("timeline.title")}</h2>
            <p className="text-[12px] font-bold text-slate-500">
              {activeFilter
                ? t("timeline.subtitleFiltered", { count: filteredEntries.length, label: typeLabel(activeFilter, t) })
                : t("timeline.subtitleDefault")}
            </p>
          </div>

          {timelineLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-12">
              <div className="text-[15px] font-black text-slate-400">{t("timeline.loading")}</div>
            </div>
          ) : filteredEntries.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col">
              {visibleEntries.map((entry, idx) => (
                <TimelineCard
                  key={entry.id}
                  entry={entry}
                  isLast={idx === visibleEntries.length - 1 && remainingCount <= 0}
                  onOpen={setSelectedEntry}
                />
              ))}
              {remainingCount > 0 && (
                <button
                  onClick={() => setDisplayCount((c) => Math.min(c + LOAD_STEP, filteredEntries.length))}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white py-3.5 text-[12px] font-black text-slate-500 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                >
                  {t("timeline.loadMore", { count: remainingCount })}
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
    </>
  );
}
