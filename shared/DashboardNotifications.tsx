"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { runInEffect } from "@/lib/runInEffect";
import { supabase } from "@/lib/supabase";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const WARNING_MINUTES = 30;

type Appointment = {
  id: string;
  title: string | null;
  appointment_date: string;
  client_id: string | null;
};

export default function DashboardNotifications() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [open, setOpen] = useState(false);
  const warnedIdsRef = useRef<Set<string>>(new Set());

  async function loadAppointments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const { data, error } = await supabase
      .from("appointments")
      .select("id, title, appointment_date, client_id")
      .eq("tenant_id", TENANT_ID)
      .gte("appointment_date", today.toISOString())
      .lt("appointment_date", tomorrow.toISOString())
      .order("appointment_date", { ascending: true });

    if (error) {
      console.error("Bildirim randevu okuma hatası:", error);
      return;
    }

    setAppointments(data || []);
  }

  function checkUpcomingAppointments() {
    const now = new Date().getTime();

    appointments.forEach((item) => {
      const appointmentTime = new Date(item.appointment_date).getTime();
      const diffMinutes = Math.floor((appointmentTime - now) / 1000 / 60);

      if (
        diffMinutes === WARNING_MINUTES &&
        !warnedIdsRef.current.has(item.id)
      ) {
        warnedIdsRef.current.add(item.id);
        alert(`${WARNING_MINUTES} dakika sonra ${item.title || "Randevu"} görüşmeniz var 🔔`);
      }
    });
  }

  useEffect(() => {
    runInEffect(() => {
      void loadAppointments();
    });

    const refreshInterval = setInterval(() => {
      void loadAppointments();
    }, 5 * 60 * 1000);

    const warningInterval = setInterval(() => {
      checkUpcomingAppointments();
    }, 60 * 1000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(warningInterval);
    };
  }, []);

  const todayCount = useMemo(() => appointments.length, [appointments]);

  if (todayCount === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 18,
        right: 18,
        zIndex: 9999,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 46,
          height: 46,
          borderRadius: 15,
          border: "none",
          cursor: "pointer",
          background: "linear-gradient(135deg,#4f46e5,#db2777)",
          color: "white",
          fontSize: 20,
          fontWeight: 900,
          boxShadow: "0 10px 24px rgba(79,70,229,0.28)",
          position: "relative",
        }}
      >
        🔔

        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 21,
            height: 21,
            padding: "0 6px",
            borderRadius: 999,
            background: "#ef4444",
            color: "white",
            fontSize: 11,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid white",
          }}
        >
          {todayCount}
        </div>
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            width: 310,
            background: "white",
            borderRadius: 18,
            border: "1px solid #e2e8f0",
            boxShadow: "0 18px 36px rgba(15,23,42,0.16)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 14,
              background: "linear-gradient(135deg,#111827,#4f46e5,#db2777)",
              color: "white",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.85 }}>
              Yaşam Sistemi
            </div>

            <div style={{ marginTop: 3, fontSize: 18, fontWeight: 900 }}>
              Bugünkü Randevular
            </div>
          </div>

          <div
            style={{
              maxHeight: 360,
              overflowY: "auto",
              padding: 12,
              display: "grid",
              gap: 8,
            }}
          >
            {appointments.map((item, index) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                  padding: 10,
                  background: "linear-gradient(135deg,#ffffff,#f8fafc)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      background: "linear-gradient(135deg,#7c3aed,#db2777)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    {index + 1}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 14,
                        color: "#0f172a",
                      }}
                    >
                      {item.title || "Randevu"}
                    </div>

                    <div
                      style={{
                        marginTop: 2,
                        color: "#4f46e5",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {new Date(item.appointment_date).toLocaleString("tr-TR")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}