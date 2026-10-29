"use client";

// Danışan dosyası · Numeroloji sekmesi altında "Klasik Numeroloji" bölümü (Numeroloji Merkezi).
// Mevcut Numeroloji sekmesine (NumerolojiTab) DOKUNMAZ; onun ALTINDA ayrı bir kart olarak görünür.
// Sunucu bayrağı kapalıysa (/api/numeroloji-klasik/** → 404) ya da yetki yoksa (401/403) HİÇBİR ŞEY çizmez.
// Liste: GET /api/numeroloji-klasik/analyses?clientId= (numerology + clients izni + oturum tenant'ı; 0 sağlayıcı çağrısı).

import Link from "next/link";
import { useEffect, useState } from "react";
import { readYasamUser, sessionTokenHeader } from "@/lib/auth/yasamUser";

type Row = { id: string; kind: string; title: string; status: "complete" | "partial"; createdAt: string };

const KIND_TR: Record<string, string> = { person: "Kişi analizi", relationship: "İlişki uyumu", business: "İşletme adı", names: "İsim seçenekleri" };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export default function KlasikNumerolojiPanel({ clientId }: { clientId: string }) {
  const [state, setState] = useState<{ status: "loading" | "hidden" | "error" | "ready"; rows: Row[] }>({ status: "loading", rows: [] });

  useEffect(() => {
    const ac = new AbortController();
    const id = readYasamUser()?.id ?? "";
    const headers: Record<string, string> = { ...sessionTokenHeader(), ...(id ? { "x-user-id": id } : {}) };
    fetch(`/api/numeroloji-klasik/analyses?clientId=${encodeURIComponent(clientId)}`, { headers, cache: "no-store", credentials: "same-origin", signal: ac.signal })
      .then(async (r) => {
        if (r.status === 404 || r.status === 401 || r.status === 403) return setState({ status: "hidden", rows: [] });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; rows?: unknown } | null;
        if (!r.ok || !j?.ok || !Array.isArray(j.rows)) return setState({ status: "error", rows: [] });
        const rows = j.rows.filter((x): x is Row => !!x && typeof (x as Row).id === "string" && typeof (x as Row).createdAt === "string");
        setState({ status: "ready", rows });
      })
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") setState({ status: "error", rows: [] });
      });
    return () => ac.abort();
  }, [clientId]);

  if (state.status === "hidden" || state.status === "loading") return null;
  const newHref = `/numeroloji-klasik/yeni?clientId=${encodeURIComponent(clientId)}`;
  return (
    <section
      aria-labelledby="klasik-numeroloji-baslik"
      data-testid="klasik-numeroloji-panel"
      style={{ marginTop: 20, padding: 16, borderRadius: 16, border: "1px solid #e4e1f0", background: "#fbfaff" }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <h3 id="klasik-numeroloji-baslik" style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#2c2257" }}>Klasik Numeroloji</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#5b5677" }}>Numeroloji Merkezi’ndeki Klasik Numeroloji analizleri (yukarıdaki Bütüncül Numeroloji kayıtlarından ayrıdır).</p>
        </div>
        <Link href={newHref} data-testid="klasik-numeroloji-yeni" style={{ display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 14px", borderRadius: 999, background: "#3b2a7a", color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
          Yeni Klasik Numeroloji analizi
        </Link>
      </div>
      {state.status === "error" ? (
        <p role="alert" style={{ margin: "12px 0 0", fontSize: 13, color: "#b42318" }}>Klasik Numeroloji kayıtları şu an yüklenemedi.</p>
      ) : state.rows.length === 0 ? (
        <p style={{ margin: "12px 0 0", fontSize: 13, color: "#5b5677" }}>Bu danışana bağlı Klasik Numeroloji analizi yok.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 8 }}>
          {state.rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/numeroloji-klasik/analiz/${encodeURIComponent(r.id)}`}
                data-testid="klasik-numeroloji-kayit"
                style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", padding: "10px 12px", borderRadius: 12, background: "#fff", border: "1px solid #ebe8f5", color: "#2c2257", textDecoration: "none", fontSize: 14 }}
              >
                <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>{r.title || KIND_TR[r.kind] || "Analiz"}</span>
                <span style={{ color: "#5b5677", fontSize: 12.5 }}>
                  {KIND_TR[r.kind] ?? "Analiz"} · {fmtDate(r.createdAt)}{r.status === "partial" ? " · kısmi" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
