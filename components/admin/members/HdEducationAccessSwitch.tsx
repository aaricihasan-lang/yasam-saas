"use client";

import { useEffect, useState } from "react";
import { readSessionToken } from "@/lib/auth/yasamUser";

/**
 * FAZ 8 — Modül İzinleri · "Human Design Eğitim Haritaları" TEK anahtarı.
 * Açık: merkezî Hazır Eğitim Haritaları + eğitmenin özel eğitim arşivi. Kapalı: tüm eğitim erişimi kapanır, veri silinmez.
 * YALNIZ platform owner görür: sunucu diğer herkese 404 döner → bileşen hiç çizilmez (normal admin anahtarı görmez).
 * Owner kararı 30.10.2026: anahtar global hazırlık kapılarından bağımsız görünür; kapılar kapalıyken yetki kaydedilir ama
 * içerik açılmaz — durum bilgisi açıkça yazılır.
 */
type Access = { userId: string; enabled: boolean; eligible: boolean; reason: string | null; grantedAt: string | null };
type Gates = { catalogEnabled: boolean; privateEnabled: boolean };
type State = { phase: "loading" } | { phase: "hidden" } | { phase: "ready"; label: string; access: Access; gates: Gates };
const GATES_CLOSED: Gates = { catalogEnabled: false, privateEnabled: false };

const API = "/api/admin/hd/education/training-access";

function headers(adminId: string, json = false): Record<string, string> {
  const h: Record<string, string> = { "x-admin-id": adminId };
  const token = readSessionToken();
  if (token) h["x-session-token"] = token;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export function HdEducationAccessSwitch({ userId, adminId, refreshKey }: { userId: string; adminId: string; refreshKey: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!userId || !adminId) return;
    let alive = true;
    fetch(`${API}?userId=${encodeURIComponent(userId)}`, { headers: headers(adminId), credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { ok?: boolean; label?: string; access?: Access; gates?: Gates } | null;
        if (!alive) return;
        if (res.ok && body?.ok && body.access) setState({ phase: "ready", label: body.label ?? "Human Design Eğitim Haritaları", access: body.access, gates: body.gates ?? GATES_CLOSED });
        else setState({ phase: "hidden" });
      })
      .catch(() => { if (alive) setState({ phase: "hidden" }); });
    return () => { alive = false; };
  }, [userId, adminId, refreshKey]);

  if (state.phase !== "ready") return null;
  const { access, label, gates } = state;
  const disabled = busy || (!access.enabled && !access.eligible);
  const live = gates.catalogEnabled || gates.privateEnabled;

  const toggle = async () => {
    if (disabled) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: headers(adminId, true),
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ userId, enabled: !access.enabled }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; access?: Access; gates?: Gates; error?: string } | null;
      if (res.ok && body?.ok && body.access) {
        const g = body.gates ?? gates;
        setState({ phase: "ready", label, access: body.access, gates: g });
        setMsg({
          ok: true,
          text: !body.access.enabled ? "Eğitim haritaları erişimi kapatıldı. Kayıtlar silinmedi."
            : g.catalogEnabled || g.privateEnabled ? "Eğitim haritaları erişimi açıldı."
            : "Yetki kaydedildi. Uzman erişimi henüz kapalı — Eğitim Merkezi yayına açılınca geçerli olur.",
        });
      } else {
        setMsg({ ok: false, text: body?.error ?? "İşlem tamamlanamadı." });
      }
    } catch {
      setMsg({ ok: false, text: "Ağ hatası — işlem doğrulanamadı." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border-2 border-amber-100 bg-amber-50/50 p-4 md:p-5" data-hd-edu-access>
      <p className="text-xs font-medium text-slate-600">
        Yalnız platform owner görür ve değiştirir. Tek yetki: merkezî eğitim haritaları ve eğitmenin özel eğitim arşivi birlikte açılır/kapanır.
      </p>
      {live ? null : (
        <p role="note" className="mt-2 rounded-xl border border-amber-300 bg-amber-100/80 px-3 py-2 text-xs font-bold text-amber-950" data-hd-edu-access-gate="closed">
          Uzman erişimi kapalı — yayın hazırlığı tamamlanmadı. Bu anahtarla verilen yetki kaydedilir ve değişiklik geçmişine işlenir; ancak Eğitim Merkezi yayına açılana kadar uzman hiçbir eğitim içeriğini göremez.
        </p>
      )}
      <label className={`mt-3 flex min-h-[64px] items-center justify-between gap-4 rounded-xl border border-white/80 bg-white/90 px-4 py-3 ${disabled && !busy ? "opacity-70" : ""}`}>
        <div className="min-w-0 flex-1">
          {/* Owner'ın yazımı (tr-TR büyük harf "DESIGN"ı "DESİGN" yapar → sabit metin). */}
          <span className="block text-sm font-bold text-slate-800">HUMAN DESIGN EĞİTİM HARİTALARI</span>
          <span className="mt-0.5 block text-[11px] font-medium leading-snug text-slate-500">
            {access.enabled
              ? `${live ? "Açık" : "Yetki verildi"}${access.grantedAt ? ` · ${new Date(access.grantedAt).toLocaleDateString("tr-TR")}` : ""}.${live ? "" : " Uzman erişimi henüz kapalı (yayın hazırlığı)."} Kapatınca menü, bağlantılar ve açık oturumlar dahil tüm eğitim erişimi kapanır; veriler silinmez.`
              : access.eligible ? (live ? "Kapalı. Açınca eğitim merkezi ve özel eğitim arşivi bu uzmana açılır." : "Kapalı. Açarsanız yetki kaydedilir; içerik Eğitim Merkezi yayına açılınca görünür.") : `Verilemez: ${access.reason ?? "uygun değil"}.`}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={access.enabled}
          aria-label={label}
          disabled={disabled}
          onClick={() => void toggle()}
          data-hd-edu-access-switch
          className={`relative h-10 w-[4.5rem] shrink-0 rounded-full transition disabled:cursor-not-allowed ${access.enabled ? "bg-emerald-500" : "bg-slate-300"} ${busy ? "opacity-60" : ""}`}
        >
          <span className={`absolute top-1 h-8 w-8 rounded-full bg-white shadow-md transition ${access.enabled ? "left-[calc(100%-2.25rem)]" : "left-1"}`} />
        </button>
      </label>
      {msg ? (
        <p role="status" className={`mt-2 text-xs font-bold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`} data-hd-edu-access-msg>{msg.text}</p>
      ) : null}
    </div>
  );
}
