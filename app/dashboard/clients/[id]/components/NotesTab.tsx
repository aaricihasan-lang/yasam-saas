"use client";

type Props = {
  noteText: string;
  setNoteText: (value: string) => void;
  onSave: () => void;
  saving: boolean;
};

export default function NotesTab({
  noteText,
  setNoteText,
  onSave,
  saving,
}: Props) {
  return (
    <div style={wrapperStyle}>
      <div style={topAreaStyle}>
        <div>
          <div style={pillStyle}>DANIŞAN NOT ALANI</div>

          <h2 style={titleStyle}>Danışan Notları</h2>

          <p style={descStyle}>
            Seans gözlemleri, özel bilgiler ve süreç notları.
          </p>
        </div>
      </div>

      <textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="Danışan hakkında özel notlar..."
        style={textareaStyle}
      />

      <button
        onClick={onSave}
        disabled={saving}
        style={{
          ...buttonStyle,
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Kaydediliyor..." : "Notları Kaydet"}
      </button>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const topAreaStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  background: "#ede9fe",
  color: "#6d28d9",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1.1,
};

const descStyle: React.CSSProperties = {
  marginTop: 4,
  marginBottom: 0,
  fontSize: 13,
  color: "#64748b",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 120,
  borderRadius: 14,
  border: "1px solid #dbe2ea",
  padding: 12,
  fontSize: 14,
  resize: "vertical",
  outline: "none",
  boxSizing: "border-box",
  background: "white",
};

const buttonStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
  color: "white",
  border: "none",
  borderRadius: 12,
  padding: "10px 16px",
  fontWeight: 900,
  fontSize: 13,
  cursor: "pointer",
  alignSelf: "flex-start",
};