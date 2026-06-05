"use client";

import React, { useState } from "react";

type YolculukTabProps = {
  clientName: string;
  clientPhone?: string;
  clientLastSession?: string;
  clientNextAppointment?: string;
};

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  color: string;
};

type TimelineItem = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  color: string;
  accent: string;
  icon: string;
  date: string;
};

const menuItems: MenuItem[] = [
  { id: "genel", label: "Genel Bilgiler", icon: "◈", color: "#2563eb" },
  { id: "numeroloji", label: "Numeroloji", icon: "∞", color: "#7c3aed" },
  { id: "dogaltas", label: "Doğaltaş", icon: "◆", color: "#0891b2" },
  { id: "refleksoloji", label: "Refleksoloji", icon: "◎", color: "#db2777" },
  { id: "biyoenerji", label: "Biyoenerji", icon: "⚡", color: "#ea580c" },
  { id: "notlar", label: "Notlar", icon: "✎", color: "#6d28d9" },
  { id: "randevular", label: "Randevular", icon: "◷", color: "#16a34a" },
  { id: "dosyalar", label: "Dosyalar", icon: "▣", color: "#475569" },
];

const timelineItems: TimelineItem[] = [
  {
    id: "1",
    title: "Numeroloji Analizi Tamamlandı",
    subtitle: "Kişisel yıl ve yaşam yolu hesabı",
    detail: "Kişisel Yıl: 7 · Yaşam Yolu: 33",
    color: "#7c3aed",
    accent: "#ede9fe",
    icon: "∞",
    date: "28 Mayıs 2026",
  },
  {
    id: "2",
    title: "Refleksoloji Protokolü Eklendi",
    subtitle: "Ayak haritası · 3 bölge",
    detail: "Karaciğer · Böbrek · Lenf sistemi",
    color: "#db2777",
    accent: "#fce7f3",
    icon: "◎",
    date: "22 Mayıs 2026",
  },
  {
    id: "3",
    title: "Doğaltaş Önerisi Kaydedildi",
    subtitle: "Ametist + Labradorit kombinasyonu",
    detail: "Zihinsel berraklık ve enerji dengesi protokolü",
    color: "#0891b2",
    accent: "#e0f2fe",
    icon: "◆",
    date: "15 Mayıs 2026",
  },
  {
    id: "4",
    title: "Seans Notu Eklendi",
    subtitle: "45 dk · 3. seans",
    detail: "Duygusal blokaj üzerine çalışma",
    color: "#16a34a",
    accent: "#dcfce7",
    icon: "✎",
    date: "8 Mayıs 2026",
  },
  {
    id: "5",
    title: "Yeni Randevu Oluşturuldu",
    subtitle: "12 Haziran 2026 · 14:00",
    detail: "4. seans · Online",
    color: "#9333ea",
    accent: "#f3e8ff",
    icon: "◷",
    date: "5 Mayıs 2026",
  },
];

export default function YolculukTab({
  clientName,
  clientPhone,
  clientLastSession,
  clientNextAppointment,
}: YolculukTabProps) {
  const [activeMenu, setActiveMenu] = useState("genel");

  return (
    <div style={wrapper}>
      {/* Üst özet kartlar */}
      <div style={statsRow}>
        <SummaryCard label="Analizler" value={5} color="#7c3aed" bg="#faf5ff" icon="∞" />
        <SummaryCard label="Seanslar" value={8} color="#16a34a" bg="#f0fdf4" icon="◈" />
        <SummaryCard label="Randevular" value={3} color="#db2777" bg="#fdf2f8" icon="◷" />
        <SummaryCard label="Notlar" value={12} color="#2563eb" bg="#eff6ff" icon="✎" />
      </div>

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
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveMenu(item.id)}
                  style={{
                    ...menuBtn,
                    background: isActive ? `${item.color}12` : "transparent",
                    borderLeft: isActive
                      ? `3px solid ${item.color}`
                      : "3px solid transparent",
                    color: isActive ? item.color : "#475569",
                  }}
                >
                  <span
                    style={{
                      ...menuIcon,
                      color: item.color,
                      opacity: isActive ? 1 : 0.6,
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
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

          <div style={timelineList}>
            {timelineItems.map((item, idx) => (
              <TimelineCard key={item.id} item={item} isLast={idx === timelineItems.length - 1} />
            ))}
          </div>
        </main>
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
    <div
      style={{
        ...summaryCard,
        background: bg,
        borderColor: `${color}22`,
      }}
    >
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
  item,
  isLast,
}: {
  item: TimelineItem;
  isLast: boolean;
}) {
  return (
    <div style={timelineRow}>
      {/* Zaman çizgisi */}
      <div style={timelineTrack}>
        <div
          style={{
            ...timelineDot,
            background: item.color,
            boxShadow: `0 0 0 4px ${item.accent}`,
          }}
        >
          <span style={{ fontSize: 11, color: "white", lineHeight: 1 }}>{item.icon}</span>
        </div>
        {!isLast && <div style={{ ...timelineLine, background: `${item.color}22` }} />}
      </div>

      {/* Kart */}
      <div
        style={{
          ...timelineCard,
          borderColor: `${item.color}22`,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  ...timelineTag,
                  background: item.accent,
                  color: item.color,
                }}
              >
                {item.subtitle}
              </span>
            </div>
            <div style={timelineCardTitle}>{item.title}</div>
            <div style={timelineCardDetail}>{item.detail}</div>
          </div>
          <div style={{ ...timelineDate, color: `${item.color}cc` }}>{item.date}</div>
        </div>

        {/* Alt renk çubuğu */}
        <div
          style={{
            marginTop: 14,
            height: 2,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${item.color}55, transparent)`,
          }}
        />
      </div>
    </div>
  );
}

/* ─── Styles ─── */

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
  transition: "box-shadow 0.2s",
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
  cursor: "pointer",
  border: "none",
  borderRadius: 0,
  transition: "background 0.15s, color 0.15s",
  textAlign: "left",
};

const menuIcon: React.CSSProperties = {
  fontSize: 14,
  width: 18,
  textAlign: "center",
  lineHeight: 1,
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
