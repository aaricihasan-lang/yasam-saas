"use client";

type Props = { className?: string };

export function DemoUrunStokBanner({ className = "" }: Props) {
  return (
    <div
      className={`mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="font-black">Demo Hesabı — </span>
      Bu sayfadaki ürün, stok, fiyat ve satış bilgileri demo hesabı için temsili olarak hazırlanmıştır. Gerçek satış, stok veya mali kayıt değildir.{" "}
      Bu sayfadaki fiyatlar ve stok değerleri demo amaçlı hazırlanmıştır. Güncel piyasa koşullarını yansıtmayabilir.
    </div>
  );
}
