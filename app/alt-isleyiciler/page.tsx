import type { Metadata } from "next";
import Link from "next/link";
import LegalPageShell from "@/components/kvkk/LegalPageShell";
import { SUBPROCESSORS } from "@/lib/legal/subprocessors";
import { getDataResidency } from "@/lib/legal/dataResidency";

export const metadata: Metadata = {
  title: "Alt İşleyiciler — Yaşam Sistemi",
  description: "Yaşam Sistemi'nin kullandığı hizmet sağlayıcılar, amaçları ve veri kapsamları.",
};

/**
 * Alt İşleyiciler (P1-6 — nihai ürün metni). Liste: lib/legal/subprocessors.ts.
 * Dar ekranda (390px) tablo yerine kart listesi; geniş ekranda tablo → yatay taşma yok.
 */
export default function AltIsleyicilerPage() {
  const residency = getDataResidency();
  return (
    <LegalPageShell title="Alt İşleyiciler" currentHref="/alt-isleyiciler">
      <p>
        Yaşam Sistemi, platformun çalışması için aşağıdaki hizmet sağlayıcılardan yararlanır. Kapsam,
        sağlayıcıya hangi verinin hangi durumda ulaşabileceğini özetler.
      </p>

      {/* Mobil: kart listesi */}
      <ul className="not-prose mt-6 space-y-3 sm:hidden">
        {SUBPROCESSORS.map((s) => (
          <li key={s.name} className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
            <p className="text-sm font-black text-slate-900">{s.name}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{s.purpose}</p>
            <p className="mt-2 break-words text-sm leading-6 text-slate-700">{s.dataScope}</p>
            {s.scopeNote ? <p className="mt-1 text-xs leading-5 text-slate-500">{s.scopeNote}</p> : null}
          </li>
        ))}
      </ul>

      {/* Geniş ekran: tablo */}
      <div className="not-prose mt-6 hidden sm:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="w-[22%] py-2 pr-3">Sağlayıcı</th>
              <th className="w-[28%] py-2 pr-3">Amaç</th>
              <th className="py-2">Kapsam</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="border-b border-slate-100 align-top">
                <td className="break-words py-3 pr-3 font-bold text-slate-900">{s.name}</td>
                <td className="break-words py-3 pr-3 text-slate-700">{s.purpose}</td>
                <td className="break-words py-3 text-slate-700">
                  {s.dataScope}
                  {s.scopeNote ? <span className="mt-1 block text-xs text-slate-500">{s.scopeNote}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6">
        {residency.configured ? (
          <>
            Veritabanı/depolama bölgesi: <strong>{residency.label}</strong>
            {residency.note ? ` — ${residency.note}` : ""}.{" "}
          </>
        ) : null}
        Sağlayıcı listesinde değişiklik olduğunda bu sayfa güncellenir ve sayfanın üstündeki
        &quot;Son güncelleme&quot; tarihi yenilenir. Rollere ve saklama sürelerine ilişkin ayrıntılar{" "}
        <Link href="/gizlilik-politikasi" className="text-violet-700 underline">
          Gizlilik Politikası
        </Link>{" "}
        ve{" "}
        <Link href="/veri-isleme-sozlesmesi" className="text-violet-700 underline">
          Veri İşleme Sözleşmesi
        </Link>
        &apos;nde yer alır.
      </p>
    </LegalPageShell>
  );
}
