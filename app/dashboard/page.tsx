export default function DashboardPage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", background: "#f4f7fb" }}>
      <aside style={{ width: 260, background: "#111827", color: "white", padding: 30 }}>
        <h2>Yaşam Sistemi</h2>
        <p style={{ color: "#9ca3af" }}>SaaS Panel</p>

        <nav style={{ marginTop: 40, display: "grid", gap: 16 }}>
          <div>🏠 Dashboard</div>
          <div>👥 Danışanlar</div>
          <div>📅 Randevular</div>
          <div>🔢 Numeroloji</div>
          <div>🦶 Refleksoloji</div>
          <div>💎 Doğaltaş</div>
        </nav>
      </aside>

      <section style={{ flex: 1, padding: 40 }}>
        <h1>Dashboard 🚀</h1>

        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {["Danışanlar", "Randevular", "Numeroloji", "Refleksoloji", "Doğaltaş", "Kullanıcılar"].map((item) => (
            <div
              key={item}
              style={{
                background: "white",
                padding: 25,
                borderRadius: 18,
                boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                fontWeight: "bold",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}