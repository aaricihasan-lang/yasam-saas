"use client";

/**
 * Telefon/dar ekranda Bölge Haritası düzenleme kapalıyken gösterilen premium,
 * bilgilendirici (alarm/hata DEĞİL) panel. Harita ve kayıtlı bölgeler görünmeye
 * devam eder; yalnız hassas koordinat düzenleme masaüstüne yönlendirilir.
 */
export function MobileEditNoticePanel() {
  return (
    <div className="w-full px-2 pb-2">
      <aside
        className="flex w-full items-start gap-3 rounded-2xl border border-violet-200/80 bg-gradient-to-r from-violet-50/95 via-white/92 to-fuchsia-50/85 px-3.5 py-3 shadow-[0_10px_30px_-14px_rgba(91,33,182,0.28)] ring-1 ring-violet-100/70 backdrop-blur-md"
        role="note"
        aria-label="Bölge düzenleme bilgisi"
      >
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_6px_16px_-6px_rgba(139,92,246,0.7)]"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01M12 22a10 10 0 100-20 10 10 0 000 20z" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black tracking-tight text-violet-950">
            Bölge düzenleme bilgisayarda kullanılabilir
          </p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-violet-900/85">
            Refleksoloji bölgelerinin hassas ve doğru şekilde konumlandırılabilmesi için harita
            üzerinde bölge ekleme ve düzenleme işlemleri bilgisayardan yapılmaktadır. Kayıtlı
            atlasınızı ve bölgelerinizi bu cihazdan görüntülemeye devam edebilirsiniz.
          </p>
        </div>
      </aside>
    </div>
  );
}
