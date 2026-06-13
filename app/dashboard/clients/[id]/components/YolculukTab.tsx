"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";

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

function calcPersonalYear(dogum: string): string {
  try {
    const parts = dogum.split("-");
    if (parts.length !== 3) return "-";
    const syntheticDate = `${parts[2]}.${parts[1]}.${new Date().getFullYear()}`;
    const digits = Array.from(syntheticDate)
      .filter((c) => /\d/.test(c))
      .map(Number);
    let total = digits.reduce((a, b) => a + b, 0);
    const specials = new Set([11, 22, 33]);
    while (total > 9 && !specials.has(total)) {
      total = Array.from(String(total)).reduce((a, c) => a + Number(c), 0);
    }
    return String(total);
  } catch {
    return "-";
  }
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
  { id: "genel",        label: "Genel Bilgiler", icon: "◈", color: "#2563eb", tabId: "genel"     },
  { id: "numeroloji",   label: "Numeroloji",     icon: "∞", color: "#7c3aed", tabId: null        },
  { id: "dogaltas",     label: "Doğaltaş",       icon: "◆", color: "#0891b2", tabId: "taslar"   },
  { id: "refleksoloji", label: "Refleksoloji",   icon: "◎", color: "#db2777", tabId: null        },
  { id: "biyoenerji",   label: "Biyoenerji",     icon: "⚡", color: "#ea580c", tabId: null        },
  { id: "notlar",       label: "Notlar",          icon: "✎", color: "#6d28d9", tabId: "notlar"   },
  { id: "randevular",   label: "Randevular",     icon: "◷", color: "#16a34a", tabId: "randevular"},
  { id: "dosyalar",     label: "Dosyalar",        icon: "▣", color: "#475569", tabId: null        },
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

// ─── Bileşen ─────────────────────────────────────────────────────────────────
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
            supabase
              .from("client_sessions")
              .select("*")
              .eq("client_id", clientId)
              .eq("tenant_id", tenantId),
            supabase
              .from("appointments")
              .select("*")
              .eq("client_id", clientId)
              .eq("tenant_id", tenantId),
            supabase
              .from("client_stones")
              .select("*")
              .eq("client_id", clientId)
              .eq("tenant_id", tenantId),
            supabase
              .from("client_analyses")
              .select("*")
              .eq("client_id", clientId)
              .eq("tenant_id", tenantId),
            supabase
              .from("client_homeworks")
              .select("*")
              .eq("client_id", clientId)
              .eq("tenant_id", tenantId),
            supabase
              .from("client_notes")
              .select("*")
              .eq("client_id", clientId)
              .maybeSingle(),
          ]);

        const normalized: TimelineEntry[] = [];

        // Seanslar
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of (sessionsRes.data ?? []) as any[]) {
          normalized.push({
            id: `seans-${s.id}`,
            type: "seans",
            title: s.session_type || "Seans",
            description:
              ([s.session_note, s.actions_done] as (string | null)[])
                .filter(Boolean)
                .join(" • ")
                .slice(0, 150) || "Seans gerçekleşti",
            date: isoToTR(s.session_date || s.created_at),
            dateRaw: s.session_date || s.created_at || "",
          });
        }

        // Randevular
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

        // Taşlar
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of (stonesRes.data ?? []) as any[]) {
          normalized.push({
            id: `tas-${t.id}`,
            type: "dogaltas",
            title: t.stone_name || "Doğaltaş",
            description:
              ([t.usage_area, t.stone_type] as (string | null)[])
                .filter(Boolean)
                .join(" — ") ||
              t.note ||
              "",
            date: isoToTR(t.stone_date || t.created_at),
            dateRaw: t.stone_date || t.created_at || "",
          });
        }

        // Analizler
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

        // Ödevler
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const hw of (homeworksRes.data ?? []) as any[]) {
          normalized.push({
            id: `odev-${hw.id}`,
            type: "odev",
            title: hw.title || hw.homework_type || "Ödev",
            description:
              ([hw.description, hw.expert_note] as (string | null)[])
                .filter(Boolean)
                .join(" • ")
                .slice(0, 150) || "",
            date: isoToTR(hw.start_date || hw.created_at),
            dateRaw: hw.start_date || hw.created_at || "",
          });
        }

        // Notlar — tek yapısal kayıt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const noteData = notesRes.data as any;
        if (noteData) {
          const noteText = (
            [noteData.notlar, noteData.oneriler, noteData.saglik_notu] as (
              | string
              | null
              | undefined
            )[]
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

        // Numeroloji — doğum tarihi ve isim varsa otomatik hesap
        if (clientDogum && (clientAd || clientSoyad)) {
          try {
            const firstName = clientAd || "";
            const lastName = clientSoyad || "";
            const hayatYolu = calcHayatYolu(clientDogum).display;
            const kaderSayisi = calcIfadeSayisi(firstName, lastName).display;
            const ruhSayisi = calcAnaKulvar(firstName, lastName).display;
            const kisilikSayisi = calcYanKulvar(firstName, lastName).display;
            const kisiselYil = calcPersonalYear(clientDogum);
            const yas = calcAge(clientDogum);

            const descParts: string[] = [
              `Yaşam Yolu: ${hayatYolu}`,
              `Kader Sayısı: ${kaderSayisi}`,
              `Ruh Sayısı: ${ruhSayisi}`,
              `Kişilik Sayısı: ${kisilikSayisi}`,
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

        // Tarihe göre yeniden eskiye sırala
        normalized.sort((a, b) =>
          b.dateRaw > a.dateRaw ? 1 : b.dateRaw < a.dateRaw ? -1 : 0
        );

        // Seans süreci hesabı
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
        };

        const seansWithDate = sessionList
          .filter((s) => s.session_date)
          .sort((a, b) => (a.session_date < b.session_date ? -1 : 1));

        if (seansWithDate.length > 0) {
          newProcess.ilkSeans = isoToTR(seansWithDate[0].session_date);
          const last = seansWithDate[seansWithDate.length - 1];
          newProcess.sonSeans = isoToTR(last.session_date);
          const diffDays = Math.floor(
            (Date.now() - new Date(last.session_date).getTime()) / 86400000
          );
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

        setSessionProcess(newProcess);

        // Ödev takibi hesabı
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hwList = (homeworksRes.data ?? []) as any[];
        const hwTamamlanan = hwList.filter((h) => h.status === "tamamlandi");
        const hwDevam = hwList.filter((h) => h.status !== "tamamlandi");
        const hwTotal = hwList.length;
        const hwYuzde =
          hwTotal === 0 ? 0 : Math.round((hwTamamlanan.length / hwTotal) * 100);

        const hwSonTarih = hwList
          .map((h) => h.end_date || h.start_date || h.created_at || "")
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null;

        const hwAktifBaslik =
          hwDevam
            .sort((a, b) => {
              const da = a.start_date || a.created_at || "";
              const db = b.start_date || b.created_at || "";
              return db > da ? 1 : -1;
            })[0]?.title ?? null;

        const hwDurum: HomeworkProcess["durum"] =
          hwTotal === 0
            ? "yok"
            : hwYuzde === 100
            ? "tamamlandi"
            : hwYuzde >= 71
            ? "iyi"
            : hwYuzde >= 31
            ? "devam"
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

        // Uyarı sistemi için ek veriler
        const pastRandevular = appointmentList
          .filter((a) => a.appointment_date && a.appointment_date < nowIso)
          .sort((a, b) => (b.appointment_date > a.appointment_date ? 1 : -1));
        const lastPastRandevuDaysAgo = pastRandevular[0]?.appointment_date
          ? Math.floor(
              (Date.now() - new Date(pastRandevular[0].appointment_date).getTime()) /
                86400000
            )
          : null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const analysisSorted = ((analysesRes.data ?? []) as any[])
          .filter((a) => a.created_at)
          .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
        const lastAnalizDaysAgo = analysisSorted[0]?.created_at
          ? Math.floor(
              (Date.now() - new Date(analysisSorted[0].created_at).getTime()) / 86400000
            )
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
            ([noteData.notlar, noteData.oneriler, noteData.saglik_notu] as (
              | string
              | null
              | undefined
            )[]).some(Boolean)
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

  return (
    <div style={wrapper}>
      {/* Üst özet kartlar */}
      <div style={statsRow}>
        <SummaryCard label="Analizler"  value={counts.analizler}  color="#7c3aed" bg="#faf5ff" icon="∞" />
        <SummaryCard label="Seanslar"   value={counts.seanslar}   color="#16a34a" bg="#f0fdf4" icon="◈" />
        <SummaryCard label="Randevular" value={counts.randevular} color="#db2777" bg="#fdf2f8" icon="◷" />
        <SummaryCard label="Notlar"     value={counts.notlar}     color="#2563eb" bg="#eff6ff" icon="✎" />
      </div>

      {/* Danışan Yaşam Skoru */}
      {!timelineLoading && (
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
      )}

      {/* Seans Süreci */}
      {!timelineLoading && (
        <SeansCard process={sessionProcess} />
      )}

      {/* Ödev Takibi */}
      {!timelineLoading && (
        <OdevCard process={homeworkProcess} />
      )}

      {/* Akıllı Uyarılar */}
      {!timelineLoading && (
        <AlertCard
          alerts={buildAlerts({
            clientDogum,
            clientPhone,
            counts,
            sessionProcess,
            homeworkProcess,
            extraAlertData,
          })}
        />
      )}

      {/* Ana içerik: sol panel + orta alan */}
      <div style={mainLayout}>
        {/* Sol Panel */}
        <aside style={sidebar}>
          {/* Danışan Özeti */}
          <div style={clientSummaryCard}>
            <div style={clientAvatarBox}>
              {clientName ? clientName.charAt(0).toUpperCase() : "D"}
            </div>
            <div style={clientSummaryBody}>
              <div style={clientNameStyle}>{clientName || "İsimsiz Danışan"}</div>
              <div style={clientMetaRow}>
                <span style={clientMetaLabel}>Telefon</span>
                <span style={clientMetaValue}>{clientPhone || "—"}</span>
              </div>
              <div style={clientMetaRow}>
                <span style={clientMetaLabel}>Son Görüşme</span>
                <span style={clientMetaValue}>{clientLastSession || "—"}</span>
              </div>
              <div style={clientMetaRow}>
                <span style={clientMetaLabel}>Sonraki Randevu</span>
                <span style={{ ...clientMetaValue, color: "#16a34a", fontWeight: 900 }}>
                  {clientNextAppointment || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Modül menüsü */}
          <nav style={menuList}>
            {menuItems.map((item) => {
              const isActive = activeMenu === item.id;
              const hasTab = Boolean(item.tabId && onNavigate);
              return (
                <button
                  key={item.id}
                  onClick={() => handleMenuClick(item)}
                  title={!hasTab ? "Bu modül henüz mevcut sekmede açılmıyor" : undefined}
                  style={{
                    ...menuBtn,
                    background: isActive ? `${item.color}12` : "transparent",
                    borderLeft: isActive
                      ? `3px solid ${item.color}`
                      : "3px solid transparent",
                    color: isActive ? item.color : "#475569",
                    opacity: hasTab || isActive ? 1 : 0.55,
                    cursor: hasTab ? "pointer" : "default",
                  }}
                >
                  <span
                    style={{
                      ...menuIcon,
                      color: item.color,
                      opacity: isActive ? 1 : 0.65,
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                  {hasTab && <span style={menuArrow}>→</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Orta alan: timeline */}
        <main style={centerArea}>
          <div style={timelineHeader}>
            <div style={timelinePill}>Yolculuk</div>
            <h2 style={timelineTitle}>Son Çalışmalar</h2>
            <p style={timelineSubtitle}>
              Danışana ait tüm modül çalışmalarının kronolojik özeti
            </p>
          </div>

          {timelineLoading ? (
            <div style={emptyBox}>
              <div style={{ ...emptyTitle, color: "#94a3b8" }}>Yükleniyor...</div>
            </div>
          ) : entries.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={timelineList}>
              {entries.map((entry, idx) => (
                <TimelineCard
                  key={entry.id}
                  entry={entry}
                  isLast={idx === entries.length - 1}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Alt bileşenler ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={emptyBox}>
      <div style={emptyIcon}>◌</div>
      <div style={emptyTitle}>Bu danışan için henüz kayıtlı çalışma yok.</div>
      <div style={emptyDesc}>
        Numeroloji, doğaltaş, refleksoloji, biyoenerji, not veya randevu
        eklendiğinde burada kronolojik olarak görünecek.
      </div>
    </div>
  );
}

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
    <div style={{ ...summaryCard, background: bg, borderColor: `${color}22` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: `${color}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            color,
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#64748b", letterSpacing: "0.04em" }}>
          {label.toUpperCase()}
        </span>
      </div>
      <div style={{ fontSize: 32, fontWeight: 950, color, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          marginTop: 8,
          height: 3,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${color}, ${color}44)`,
          width: "60%",
        }}
      />
    </div>
  );
}

function TimelineCard({
  entry,
  isLast,
}: {
  entry: TimelineEntry;
  isLast: boolean;
}) {
  const meta = getMeta(entry.type);

  const cardContent = (
    <div
      style={{
        ...timelineCard,
        borderColor: `${meta.color}22`,
        cursor: entry.href ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ ...timelineTag, background: meta.accent, color: meta.color }}>
              {entry.type}
            </span>
            {entry.badge && (
              <span style={{ ...timelineTag, background: "#f0fdf4", color: "#15803d" }}>
                {entry.badge}
              </span>
            )}
          </div>
          <div style={timelineCardTitle}>{entry.title}</div>
          <div style={timelineCardDetail}>{entry.description}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ ...timelineDate, color: `${meta.color}cc` }}>{entry.date}</div>
          {entry.href && (
            <span style={{ fontSize: 10, color: meta.color, fontWeight: 850 }}>Detay →</span>
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: 14,
          height: 2,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${meta.color}55, transparent)`,
        }}
      />
    </div>
  );

  return (
    <div style={timelineRow}>
      {/* Zaman çizgisi */}
      <div style={timelineTrack}>
        <div
          style={{
            ...timelineDot,
            background: meta.color,
            boxShadow: `0 0 0 4px ${meta.accent}`,
          }}
        >
          <span style={{ fontSize: 11, color: "white", lineHeight: 1 }}>{meta.icon}</span>
        </div>
        {!isLast && <div style={{ ...timelineLine, background: `${meta.color}22` }} />}
      </div>

      {/* Kart — href varsa link, yoksa div */}
      {entry.href ? (
        <Link href={entry.href} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
          {cardContent}
        </Link>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>{cardContent}</div>
      )}
    </div>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────────*/

const wrapper: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const statsRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const summaryCard: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: "16px 18px",
  boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
};

const mainLayout: React.CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const sidebar: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: 220,
  minWidth: 180,
  flexShrink: 0,
};

const clientSummaryCard: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 16,
  boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const clientAvatarBox: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #2563eb, #7c3aed, #db2777)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 22,
  fontWeight: 900,
  color: "white",
  boxShadow: "0 6px 18px rgba(124,58,237,0.28)",
};

const clientSummaryBody: React.CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const clientNameStyle: React.CSSProperties = {
  fontWeight: 900,
  fontSize: 14,
  color: "#0f172a",
  textAlign: "center",
  marginBottom: 4,
};

const clientMetaRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 6,
};

const clientMetaLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: "#94a3b8",
  letterSpacing: "0.04em",
};

const clientMetaValue: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 850,
  color: "#0f172a",
};

const menuList: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: "8px 0",
  boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
  display: "flex",
  flexDirection: "column",
};

const menuBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 14px",
  fontSize: 12,
  fontWeight: 850,
  border: "none",
  borderRadius: 0,
  transition: "background 0.15s, color 0.15s",
  textAlign: "left",
  width: "100%",
};

const menuIcon: React.CSSProperties = {
  fontSize: 14,
  width: 18,
  textAlign: "center",
  lineHeight: 1,
  flexShrink: 0,
};

const menuArrow: React.CSSProperties = {
  marginLeft: "auto",
  fontSize: 11,
  opacity: 0.5,
};

const centerArea: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const timelineHeader: React.CSSProperties = {
  marginBottom: 20,
};

const timelinePill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: "linear-gradient(135deg, #ede9fe, #fce7f3)",
  color: "#7c3aed",
  borderRadius: 999,
  padding: "3px 12px",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.08em",
  marginBottom: 8,
};

const timelineTitle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 950,
  color: "#0f172a",
  margin: "0 0 4px",
  letterSpacing: "-0.01em",
};

const timelineSubtitle: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 750,
  margin: 0,
};

const emptyBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "48px 24px",
  background: "white",
  borderRadius: 16,
  border: "1px dashed #cbd5e1",
  textAlign: "center",
};

const emptyIcon: React.CSSProperties = {
  fontSize: 40,
  color: "#cbd5e1",
  lineHeight: 1,
};

const emptyTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  color: "#334155",
};

const emptyDesc: React.CSSProperties = {
  fontSize: 12,
  color: "#94a3b8",
  fontWeight: 750,
  maxWidth: 360,
  lineHeight: 1.6,
};

const timelineList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const timelineRow: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
};

const timelineTrack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  flexShrink: 0,
  paddingTop: 4,
};

const timelineDot: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  zIndex: 1,
  position: "relative",
};

const timelineLine: React.CSSProperties = {
  width: 2,
  flex: 1,
  minHeight: 24,
  borderRadius: 999,
  margin: "4px 0",
};

const timelineCard: React.CSSProperties = {
  flex: 1,
  background: "white",
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  padding: "14px 16px",
  boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
  marginBottom: 12,
  minWidth: 0,
};

const timelineTag: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "2px 9px",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.02em",
  textTransform: "capitalize",
};

const timelineCardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "#0f172a",
  marginBottom: 4,
};

const timelineCardDetail: React.CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 750,
};

const timelineDate: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 850,
  whiteSpace: "nowrap",
  marginTop: 2,
};

/* ─── Yaşam Skoru ────────────────────────────────────────────────────────────*/

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

const SCORE_CRITERIA: { key: keyof LifeScoreProps; label: string; missingLabel: string }[] = [
  { key: "hasDogum",   label: "Doğum Tarihi", missingLabel: "Doğum tarihi eksik"   },
  { key: "hasTelefon", label: "Telefon",       missingLabel: "Telefon eksik"         },
  { key: "hasNot",     label: "Not",           missingLabel: "Henüz not yok"         },
  { key: "hasSeans",   label: "Seans",         missingLabel: "Henüz seans yok"       },
  { key: "hasRandevu", label: "Randevu",       missingLabel: "Henüz randevu yok"     },
  { key: "hasAnaliz",  label: "Analiz",        missingLabel: "Henüz analiz yok"      },
  { key: "hasTas",     label: "Taş Kaydı",    missingLabel: "Henüz taş kaydı yok"   },
  { key: "hasOdev",    label: "Ödev",          missingLabel: "Henüz ödev yok"        },
];

function getScoreStage(score: number): { label: string; color: string; bg: string } {
  if (score <= 30) return { label: "Başlangıç",    color: "#ef4444", bg: "#fee2e2" };
  if (score <= 60) return { label: "Gelişimde",    color: "#f59e0b", bg: "#fef3c7" };
  if (score <= 80) return { label: "Aktif Takip",  color: "#3b82f6", bg: "#dbeafe" };
  return              { label: "Güçlü Süreç",  color: "#10b981", bg: "#d1fae5" };
}

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

function LifeScoreCard(props: LifeScoreProps) {
  const completed = SCORE_CRITERIA.filter((c) => props[c.key]).length;
  const score = Math.round((completed / SCORE_CRITERIA.length) * 100);
  const stage = getScoreStage(score);
  const missing = SCORE_CRITERIA.filter((c) => !props[c.key]).map((c) => c.missingLabel);

  return (
    <div style={scoreCardStyle}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Sol: Daire + Aşama */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <ScoreCircle score={score} color={stage.color} />
          <span style={{ ...stagePillStyle, background: stage.bg, color: stage.color }}>
            {stage.label}
          </span>
        </div>

        {/* Orta: Başlık + Kriter ızgarası */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={scoreTitleStyle}>Danışan Yaşam Skoru</div>
          <div style={scoreSubtitleStyle}>
            {completed}/{SCORE_CRITERIA.length} kriter tamamlandı
          </div>
          <div style={criteriaGrid}>
            {SCORE_CRITERIA.map((c) => {
              const ok = props[c.key];
              return (
                <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ color: ok ? "#10b981" : "#cbd5e1", fontSize: 12, lineHeight: 1 }}>
                    {ok ? "✓" : "○"}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 850, color: ok ? "#0f172a" : "#94a3b8" }}>
                    {c.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sağ: Eksikler */}
        {missing.length > 0 && (
          <div style={missingBox}>
            <div style={missingBoxTitle}>Eksik Bilgiler</div>
            {missing.map((m) => (
              <div key={m} style={missingItem}>
                <span style={{ color: "#f59e0b", fontSize: 11 }}>⚠</span>
                <span>{m}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const scoreCardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: "18px 20px",
  boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
};

const stagePillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "3px 12px",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.04em",
};

const scoreTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 950,
  color: "#0f172a",
  marginBottom: 2,
  letterSpacing: "-0.01em",
};

const scoreSubtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 750,
  marginBottom: 12,
};

const criteriaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "6px 16px",
};

const missingBox: React.CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 12,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 180,
};

const missingBoxTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: "#92400e",
  letterSpacing: "0.04em",
  marginBottom: 2,
};

const missingItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  fontWeight: 850,
  color: "#b45309",
};

/* ─── Seans Süreci ───────────────────────────────────────────────────────────*/

const DURUM_META = {
  aktif:     { label: "Aktif Süreç",       color: "#10b981", bg: "#d1fae5" },
  takip:     { label: "Takip Gerekiyor",   color: "#f59e0b", bg: "#fef3c7" },
  pasif:     { label: "Pasif Danışan",     color: "#ef4444", bg: "#fee2e2" },
  baslamadi: { label: "Henüz Başlamadı",   color: "#94a3b8", bg: "#f1f5f9" },
} as const;

function SeansCard({ process }: { process: SessionProcess }) {
  const meta = DURUM_META[process.durum];

  return (
    <div style={seansCardStyle}>
      {/* Başlık satırı */}
      <div style={seansCardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, color: meta.color }}>◈</span>
          <span style={{ fontSize: 14, fontWeight: 950, color: "#0f172a", letterSpacing: "-0.01em" }}>
            Seans Süreci
          </span>
        </div>
        <span style={{ ...durumBadgeStyle, background: meta.bg, color: meta.color }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: meta.color,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {meta.label}
        </span>
      </div>

      {/* İstatistik ızgarası */}
      <div style={seansStatsGrid}>
        <SeansStat
          label="Toplam Seans"
          value={String(process.totalSeans)}
          color="#0f172a"
          accent="#f8fafc"
        />
        <SeansStat
          label="İlk Seans"
          value={process.ilkSeans ?? "—"}
          color="#64748b"
          accent="#f8fafc"
        />
        <SeansStat
          label="Son Seans"
          value={process.sonSeans ?? "—"}
          color="#64748b"
          accent="#f8fafc"
        />
        <SeansStat
          label="Son Görüşmeden Bu Yana"
          value={process.gunFarki != null ? `${process.gunFarki} gün` : "—"}
          color={
            process.gunFarki == null
              ? "#94a3b8"
              : process.gunFarki <= 14
              ? "#10b981"
              : process.gunFarki <= 30
              ? "#f59e0b"
              : "#ef4444"
          }
          accent={
            process.gunFarki == null
              ? "#f8fafc"
              : process.gunFarki <= 14
              ? "#f0fdf4"
              : process.gunFarki <= 30
              ? "#fffbeb"
              : "#fff1f2"
          }
        />
      </div>

      {/* Yaklaşan randevu */}
      {process.yaklasanRandevu ? (
        <div style={yaklasanBox}>
          <span style={{ fontSize: 13 }}>◷</span>
          <span style={{ fontSize: 12, fontWeight: 850, color: "#15803d" }}>
            Yaklaşan Randevu: <strong>{process.yaklasanRandevu}</strong>
          </span>
        </div>
      ) : (
        <div style={{ ...yaklasanBox, background: "#f8fafc", borderColor: "#e2e8f0" }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>◷</span>
          <span style={{ fontSize: 12, fontWeight: 850, color: "#94a3b8" }}>
            Yaklaşan randevu yok
          </span>
        </div>
      )}
    </div>
  );
}

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
    <div style={{ ...seansStatItem, background: accent }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          color: "#94a3b8",
          letterSpacing: "0.06em",
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 950, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const seansCardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: "18px 20px",
  boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const seansCardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 8,
};

const durumBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 11,
  fontWeight: 900,
};

const seansStatsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
};

const seansStatItem: React.CSSProperties = {
  borderRadius: 12,
  padding: "10px 14px",
  border: "1px solid #f1f5f9",
};

const yaklasanBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 14px",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: 10,
};

/* ─── Ödev Takibi ────────────────────────────────────────────────────────────*/

const ODEV_DURUM_META = {
  yok:        { label: "Henüz Ödev Yok", color: "#94a3b8", bg: "#f1f5f9", bar: "#e2e8f0" },
  baslangic:  { label: "Başlangıç",       color: "#ef4444", bg: "#fee2e2", bar: "#ef4444" },
  devam:      { label: "Devam Ediyor",    color: "#f59e0b", bg: "#fef3c7", bar: "#f59e0b" },
  iyi:        { label: "İyi İlerliyor",   color: "#3b82f6", bg: "#dbeafe", bar: "#3b82f6" },
  tamamlandi: { label: "Tamamlandı",      color: "#10b981", bg: "#d1fae5", bar: "#10b981" },
} as const;

function OdevCard({ process }: { process: HomeworkProcess }) {
  const meta = ODEV_DURUM_META[process.durum];

  return (
    <div style={odevCardStyle}>
      {/* Başlık satırı */}
      <div style={seansCardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16, color: meta.color }}>✏</span>
          <span style={{ fontSize: 14, fontWeight: 950, color: "#0f172a", letterSpacing: "-0.01em" }}>
            Ödev Takibi
          </span>
        </div>
        <span style={{ ...durumBadgeStyle, background: meta.bg, color: meta.color }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: meta.color,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {meta.label}
        </span>
      </div>

      {/* İstatistik ızgarası */}
      <div style={seansStatsGrid}>
        <SeansStat
          label="Toplam Ödev"
          value={String(process.total)}
          color="#0f172a"
          accent="#f8fafc"
        />
        <SeansStat
          label="Tamamlanan"
          value={String(process.tamamlanan)}
          color="#10b981"
          accent="#f0fdf4"
        />
        <SeansStat
          label="Devam Eden"
          value={String(process.devamEden)}
          color={process.devamEden > 0 ? "#f59e0b" : "#94a3b8"}
          accent={process.devamEden > 0 ? "#fffbeb" : "#f8fafc"}
        />
        <SeansStat
          label="Son Ödev Tarihi"
          value={process.sonOdevTarihi ?? "—"}
          color="#64748b"
          accent="#f8fafc"
        />
      </div>

      {/* Progress bar */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b" }}>
            Tamamlama Yüzdesi
          </span>
          <span style={{ fontSize: 14, fontWeight: 950, color: meta.color }}>
            %{process.yuzde}
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: "#f1f5f9",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 999,
              width: `${process.yuzde}%`,
              background:
                process.yuzde === 0
                  ? "#e2e8f0"
                  : `linear-gradient(90deg, ${meta.bar}, ${meta.bar}bb)`,
              transition: "width 0.6s ease",
            }}
          />
        </div>
      </div>

      {/* Aktif ödev */}
      {process.aktifOdevBaslik && (
        <div style={aktifOdevBox}>
          <span style={{ fontSize: 12 }}>✏</span>
          <span style={{ fontSize: 12, fontWeight: 850, color: "#92400e" }}>
            Aktif Ödev:{" "}
            <strong style={{ color: "#78350f" }}>{process.aktifOdevBaslik}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

const odevCardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: "18px 20px",
  boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const aktifOdevBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "9px 14px",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 10,
};

/* ─── Akıllı Uyarı Sistemi ───────────────────────────────────────────────────*/

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

  // ── Kritik ───────────────────────────────────────────────────────────────
  if (!clientDogum)
    alerts.push({ id: "no-dogum", message: "Doğum tarihi eksik", category: "kritik" });

  if (!clientPhone)
    alerts.push({ id: "no-phone", message: "Telefon numarası eksik", category: "kritik" });

  if (sessionProcess.gunFarki != null && sessionProcess.gunFarki >= 30)
    alerts.push({
      id: "seans-30",
      message: `${sessionProcess.gunFarki} gündür seans yok`,
      category: "kritik",
    });

  if (
    extraAlertData.lastPastRandevuDaysAgo != null &&
    extraAlertData.lastPastRandevuDaysAgo >= 60
  )
    alerts.push({
      id: "randevu-60",
      message: `${extraAlertData.lastPastRandevuDaysAgo} gündür randevu yok`,
      category: "kritik",
    });

  if (counts.analizler === 0)
    alerts.push({ id: "no-analiz", message: "Hiç analiz yapılmamış", category: "kritik" });

  // ── Takip Gerekiyor ───────────────────────────────────────────────────────
  if (!sessionProcess.yaklasanRandevu)
    alerts.push({ id: "no-upcoming", message: "Yaklaşan randevu yok", category: "takip" });

  if (homeworkProcess.devamEden > 0)
    alerts.push({
      id: "hw-pending",
      message: `${homeworkProcess.devamEden} tamamlanmamış ödev var`,
      category: "takip",
    });

  if (counts.taslar === 0)
    alerts.push({ id: "no-tas", message: "Hiç taş önerisi girilmemiş", category: "takip" });

  if (counts.notlar === 0)
    alerts.push({ id: "no-not", message: "Hiç not girilmemiş", category: "takip" });

  if (counts.seanslar === 0)
    alerts.push({ id: "no-seans", message: "Henüz seans yapılmamış", category: "takip" });

  // ── Bilgilendirme ─────────────────────────────────────────────────────────
  if (
    sessionProcess.gunFarki != null &&
    sessionProcess.gunFarki >= 14 &&
    sessionProcess.gunFarki < 30
  )
    alerts.push({
      id: "seans-14",
      message: `Son seanstan ${sessionProcess.gunFarki} gün geçti`,
      category: "bilgi",
    });

  if (
    extraAlertData.lastAnalizDaysAgo != null &&
    extraAlertData.lastAnalizDaysAgo >= 60
  )
    alerts.push({
      id: "analiz-old",
      message: `Son analizden ${extraAlertData.lastAnalizDaysAgo} gün geçti`,
      category: "bilgi",
    });

  if (counts.seanslar === 0 && counts.randevular === 0)
    alerts.push({
      id: "new-client",
      message: "Danışan yeni kayıt — süreç henüz başlamamış",
      category: "bilgi",
    });

  // ── Olumlu — kritik/takip uyarısı yoksa ──────────────────────────────────
  const hasProblem = alerts.some(
    (a) => a.category === "kritik" || a.category === "takip"
  );
  if (!hasProblem) {
    alerts.push({
      id: "ok-1",
      message: "Danışan süreci düzenli ilerliyor",
      category: "olumlu",
    });
    alerts.push({
      id: "ok-2",
      message: "Takip gerektiren kritik durum bulunamadı",
      category: "olumlu",
    });
  }

  return alerts;
}

const ALERT_META = {
  kritik: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "⚠",  label: "Kritik"           },
  takip:  { color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: "◎",  label: "Takip Gerekiyor"  },
  bilgi:  { color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: "ℹ",  label: "Bilgilendirme"    },
  olumlu: { color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "✓",  label: "Durum"            },
} as const;

function AlertCard({ alerts }: { alerts: AlertItem[] }) {
  const kritikler = alerts.filter((a) => a.category === "kritik");
  const takipler  = alerts.filter((a) => a.category === "takip");
  const bilgiler  = alerts.filter((a) => a.category === "bilgi");
  const olumluler = alerts.filter((a) => a.category === "olumlu");

  const groups = [
    { items: kritikler, meta: ALERT_META.kritik },
    { items: takipler,  meta: ALERT_META.takip  },
    { items: bilgiler,  meta: ALERT_META.bilgi   },
    { items: olumluler, meta: ALERT_META.olumlu  },
  ].filter((g) => g.items.length > 0);

  return (
    <div style={alertCardStyle}>
      {/* Başlık + rozetler */}
      <div style={alertCardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>◈</span>
          <span style={{ fontSize: 14, fontWeight: 950, color: "#0f172a", letterSpacing: "-0.01em" }}>
            Akıllı Uyarılar ve Öneriler
          </span>
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {kritikler.length > 0 && (
            <span style={{ ...alertCountBadge, background: "#fef2f2", color: "#dc2626" }}>
              {kritikler.length} Kritik
            </span>
          )}
          {takipler.length > 0 && (
            <span style={{ ...alertCountBadge, background: "#fffbeb", color: "#d97706" }}>
              {takipler.length} Takip
            </span>
          )}
          {bilgiler.length > 0 && (
            <span style={{ ...alertCountBadge, background: "#eff6ff", color: "#2563eb" }}>
              {bilgiler.length} Bilgi
            </span>
          )}
        </div>
      </div>

      {/* Gruplar */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map(({ items, meta }) => (
          <div
            key={meta.label}
            style={{
              ...alertGroup,
              background: meta.bg,
              borderColor: meta.border,
            }}
          >
            <div style={alertGroupTitle}>
              <span style={{ color: meta.color, fontSize: 12 }}>{meta.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 900, color: meta.color, letterSpacing: "0.05em" }}>
                {meta.label.toUpperCase()}
              </span>
            </div>
            {items.map((item) => (
              <div key={item.id} style={alertRow}>
                <span style={{ color: meta.color, fontSize: 10, flexShrink: 0 }}>→</span>
                <span style={{ fontSize: 12, fontWeight: 850, color: "#374151" }}>
                  {item.message}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const alertCardStyle: React.CSSProperties = {
  background: "white",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: "18px 20px",
  boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const alertCardHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 8,
};

const alertCountBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 10,
  fontWeight: 900,
};

const alertGroup: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid",
  padding: "10px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const alertGroupTitle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  marginBottom: 4,
};

const alertRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 7,
  paddingLeft: 4,
};
