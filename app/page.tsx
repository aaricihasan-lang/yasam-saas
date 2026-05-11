"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type User = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

export default function Home() {
  const [email, setEmail] = useState("admin@yasamsistemi.com");
  const [password, setPassword] = useState("123456");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("yasam_user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = async () => {
    setMessage("Giriş yapılıyor...");

    const { data, error } = await supabase.rpc("login_user", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      setMessage("Sistem hatası oluştu.");
      console.log(error);
      return;
    }

    if (!data || data.length === 0) {
      setMessage("Email veya şifre hatalı.");
      return;
    }

    const loggedUser = data[0];

    localStorage.setItem("yasam_user", JSON.stringify(loggedUser));
    setUser(loggedUser);
  };

  const logout = () => {
    localStorage.removeItem("yasam_user");
    setUser(null);
    setMessage("");
  };

  if (user) {
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
            <div>⚙️ Ayarlar</div>
          </nav>
        </aside>

        <section style={{ flex: 1, padding: 40 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <h1>Hoşgeldin, {user.name} 🚀</h1>
              <p>Rol: {user.role} | Durum: {user.status}</p>
            </div>

            <button onClick={logout} style={{ padding: "12px 18px", borderRadius: 10 }}>
              Çıkış Yap
            </button>
          </div>

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

  return (
    <main style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#f4f7fb" }}>
      <div style={{ width: 400, background: "white", padding: 40, borderRadius: 20, boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
        <h1>Yaşam Sistemi</h1>
        <p style={{ marginBottom: 30, color: "#666" }}>SaaS Yönetim Paneli</p>

        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={{ width: "100%", padding: 14, marginBottom: 15, borderRadius: 10, border: "1px solid #ddd" }} />

        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Şifre" style={{ width: "100%", padding: 14, marginBottom: 20, borderRadius: 10, border: "1px solid #ddd" }} />

        <button onClick={handleLogin} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: "#111827", color: "white", fontWeight: "bold" }}>
          Giriş Yap
        </button>

        <p style={{ marginTop: 20 }}>{message}</p>
      </div>
    </main>
  );
}