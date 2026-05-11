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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("yasam_user");

    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setMessage("Email ve şifre giriniz.");
      return;
    }

    setLoading(true);
    setMessage("Giriş yapılıyor...");

    const { data, error } = await supabase.rpc("login_user", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      console.log(error);
      setMessage("Sistem hatası oluştu.");
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setMessage("Email veya şifre hatalı.");
      setLoading(false);
      return;
    }

    const loggedUser = data[0];

    localStorage.setItem("yasam_user", JSON.stringify(loggedUser));

    setUser(loggedUser);
    setMessage("");
    setLoading(false);
  };

  const logout = () => {
    localStorage.removeItem("yasam_user");
    setUser(null);
    setEmail("");
    setPassword("");
    setMessage("");
  };

  if (user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          background: "#f4f7fb",
        }}
      >
        <aside
          style={{
            width: 260,
            background: "#111827",
            color: "white",
            padding: 30,
          }}
        >
          <h2 style={{ fontSize: 24, marginBottom: 4 }}>
            Yaşam Sistemi
          </h2>

          <p style={{ color: "#9ca3af" }}>
            SaaS Yönetim Paneli
          </p>

          <nav
            style={{
              marginTop: 40,
              display: "grid",
              gap: 16,
            }}
          >
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 34,
                  fontWeight: "bold",
                  marginBottom: 8,
                }}
              >
                Hoşgeldin, {user.name} 🚀
              </h1>

              <p style={{ color: "#6b7280" }}>
                Rol: {user.role} | Durum: {user.status}
              </p>
            </div>

            <button
              onClick={logout}
              style={{
                padding: "12px 18px",
                borderRadius: 12,
                border: "none",
                background: "#111827",
                color: "white",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Çıkış Yap
            </button>
          </div>

          <div
            style={{
              marginTop: 40,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
            }}
          >
            {[
              "Danışanlar",
              "Randevular",
              "Numeroloji",
              "Refleksoloji",
              "Doğaltaş",
              "Kullanıcılar",
            ].map((item) => (
              <div
                key={item}
                style={{
                  background: "white",
                  padding: 25,
                  borderRadius: 18,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                  fontWeight: "bold",
                  fontSize: 18,
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
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background:
          "linear-gradient(135deg,#edf7ff 0%,#f5f0ff 45%,#f5fff8 100%)",
      }}
    >
      <div
        style={{
          width: 420,
          background: "rgba(255,255,255,0.92)",
          padding: 40,
          borderRadius: 28,
          boxShadow: "0 20px 50px rgba(0,0,0,0.08)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div style={{ marginBottom: 30 }}>
          <h1
            style={{
              fontSize: 34,
              fontWeight: "bold",
              marginBottom: 8,
            }}
          >
            Yaşam Sistemi
          </h1>

          <p
            style={{
              color: "#6b7280",
              fontSize: 15,
            }}
          >
            SaaS Yönetim Paneli
          </p>
        </div>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{
            width: "100%",
            padding: 15,
            marginBottom: 15,
            borderRadius: 14,
            border: "1px solid #dbe3ef",
            outline: "none",
            fontSize: 15,
          }}
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Şifre"
          style={{
            width: "100%",
            padding: 15,
            marginBottom: 20,
            borderRadius: 14,
            border: "1px solid #dbe3ef",
            outline: "none",
            fontSize: 15,
          }}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: 15,
            borderRadius: 14,
            border: "none",
            background: "#111827",
            color: "white",
            fontWeight: "bold",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          {loading ? "Giriş Yapılıyor..." : "Giriş Yap"}
        </button>

        {message && (
          <p
            style={{
              marginTop: 18,
              color: "#ef4444",
              fontWeight: 500,
            }}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}