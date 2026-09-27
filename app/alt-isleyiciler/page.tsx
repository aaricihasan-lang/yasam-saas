import type { Metadata } from "next";
import LegalPageShell from "@/components/kvkk/LegalPageShell";
import { SUBPROCESSORS } from "@/lib/legal/subprocessors";
import { getDataResidency } from "@/lib/legal/dataResidency";

export const metadata: Metadata = {
  title: "Alt İşleyiciler (Taslak) — Yaşam Sistemi",
  description: "Yaşam Sistemi'nin kullandığı hizmet sağlayıcılar ve kapsamları (taslak).",
};

/** Alt İşleyiciler — TASLAK (FAZ1 FINAL HARDENING — INFRA). Liste: lib/legal/subprocessors.ts. */
export default function AltIsleyicilerPage() {
  const residency = getDataResidency();
  return (
    <LegalPageShell title="Alt İşleyiciler" currentHref="/alt-isleyiciler">
      <p>
        Yaşam Sistemi, platformun çalışması için aşağıdaki hizmet sağlayıcılardan yararlanır. Kapsam
        sütunu, sağlayıcıya hangi verinin hangi durumda ulaşabileceğini özetler.
      </p>

      <div className="not-prose mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Sağlayıcı</th>
              <th className="py-2 pr-3">Amaç</th>
              <th className="py-2">Kapsam</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="border-b border-slate-100 align-top">
                <td className="py-3 pr-3 font-bold text-slate-900">{s.name}</td>
                <td className="py-3 pr-3 text-slate-700">{s.purpose}</td>
                <td className="py-3 text-slate-700">
                  {s.dataScope}
                  {s.scopeNote ? <span className="mt-1 block text-xs text-slate-500">{s.scopeNote}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6">
        Veritabanı/depolama bölgesi: <strong>{residency.label}</strong>
        {residency.note ? ` — ${residency.note}` : ""}. Sağlayıcı listesinde değişiklik olduğunda bu
        sayfa güncellenir.
      </p>
    </LegalPageShell>
  );
}
