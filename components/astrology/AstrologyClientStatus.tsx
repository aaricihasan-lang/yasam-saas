"use client";

/**
 * Danışan Yolculuğu → küçük Astroloji DURUM rozeti (Aşama 7B). Yeni analiz ekranı DEĞİLDİR.
 *
 *   • Yalnız durum: "Astroloji analizi mevcut" / "Henüz Astroloji analizi yok" / "Astroloji bağlantısı bulunmuyor".
 *     Harita, teknik hesap, yorum, not veya rapor GÖSTERİLMEZ ve bu bileşene gelmez.
 *   • Durum, uzmanın eşleştirilmiş Astroloji profillerindeki GERÇEK kayıtlı analizden hesaplanır (sunucu;
 *     sağlayıcı çağrılmaz). Doğum profili tek başına "analiz var" sayılmaz.
 *   • Görünürlük: Astroloji modülüne yetkili kullanıcı (bugün yalnız system owner). Admin olmayan oturumda
 *     istek bile atılmaz; sunucu kapısı (requireAstrologyOwner) yetkisizde tek tip 404 döner → hiçbir şey çizilmez.
 *     Hata/ağ sorunu da sessizce gizlenir: Danışan Yolculuğu akışı hiçbir koşulda etkilenmez.
 */

import { useEffect, useState } from "react";
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";

type Status = "has_analyses" | "no_analyses" | "not_linked";

const LABELS: Record<Status, string> = {
  has_analyses: "Astroloji analizi mevcut",
  no_analyses: "Henüz Astroloji analizi yok",
  not_linked: "Astroloji bağlantısı bulunmuyor",
};

const STYLES: Record<Status, string> = {
  has_analyses: "bg-violet-100 text-violet-800",
  no_analyses: "bg-slate-100 text-slate-700",
  not_linked: "bg-slate-50 text-slate-500 ring-1 ring-slate-200",
};

export default function AstrologyClientStatus({ clientId }: { clientId: string }) {
  const [state, setState] = useState<{ id: string; status: Status; count: number } | null>(null);

  useEffect(() => {
    const user = readYasamUser();
    const token = readSessionToken();
    if (!user || user.role !== "admin" || !token) return; // uzman / demo / oturumsuz → istek yok
    let alive = true;
    void fetch(`/api/admin/astroloji/client-status?clientId=${encodeURIComponent(clientId)}`, {
      headers: { "x-admin-id": user.id, "x-session-token": token },
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const b = (await r.json()) as { ok?: boolean; status?: Status; analysisCount?: number };
        return b.ok === true && b.status && b.status in LABELS ? b : null;
      })
      .catch(() => null)
      .then((b) => {
        if (alive && b) setState({ id: clientId, status: b.status as Status, count: Number(b.analysisCount ?? 0) });
      });
    return () => {
      alive = false;
    };
  }, [clientId]);

  if (!state || state.id !== clientId) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${STYLES[state.status]}`}
      title="Astroloji kendi modülünde yönetilir; burada yalnız eşleştirme ve analiz bulunma durumu gösterilir."
      data-testid="dy-astrology-status"
      data-status={state.status}
    >
      {LABELS[state.status]}
      {state.status === "has_analyses" && state.count > 0 ? ` (${state.count})` : ""}
    </span>
  );
}
