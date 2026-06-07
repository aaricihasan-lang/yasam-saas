"use client";

import { GATE_TECHNICAL_DATA, resolveUniqueGates } from "@/lib/human-design/gateTechnicalData";

type Props = {
  gates: number[];
  channels: string[];
};

export function GateTechnicalInfo({ gates, channels }: Props) {
  const allGates = resolveUniqueGates(gates, channels);
  if (allGates.length === 0) return null;

  const rows = allGates
    .map((n) => GATE_TECHNICAL_DATA[n])
    .filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-indigo-200/80 bg-white/70 overflow-hidden">
      <div className="bg-indigo-50/80 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-700">
        Kapı Teknik Bilgileri
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-indigo-100/80 bg-indigo-50/40">
              <th className="px-3 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">Kapı</th>
              <th className="px-3 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">Merkez</th>
              <th className="px-3 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">Merkez Tipi</th>
              <th className="px-3 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">Kısa Bilgi</th>
              <th className="px-3 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">Burç</th>
              <th className="px-3 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">Derece</th>
              <th className="px-3 py-1.5 text-left font-bold text-slate-600 whitespace-nowrap">Antisya</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-indigo-50/80">
            {rows.map((r) => (
              <tr key={r.kapi_no} className="bg-white hover:bg-indigo-50/20 transition-colors">
                <td className="px-3 py-1.5 font-bold text-indigo-700 whitespace-nowrap">{r.kapi_no}</td>
                <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.merkez}</td>
                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.merkez_tipi}</td>
                <td className="px-3 py-1.5 text-slate-800">{r.kisa_bilgi}</td>
                <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{r.burc}</td>
                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.burc_detay}</td>
                <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">{r.antisya_detay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
