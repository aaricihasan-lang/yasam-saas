"use client";

type Props = {
  message: string;
  className?: string;
};

/**
 * Standart demo hesap amber banner — tüm modüllerde ortak kullanım için.
 * Aynı görsel tasarım DemoUrunStokBanner ile örtüşür.
 */
export function DemoModuleBanner({ message, className = "" }: Props) {
  return (
    <div
      className={`mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="font-black">Demo Hesabı — </span>
      {message}
    </div>
  );
}
