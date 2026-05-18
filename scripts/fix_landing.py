# -*- coding: utf-8 -*-
from pathlib import Path

path = Path(__file__).resolve().parent.parent / "app" / "page.tsx"
s = path.read_text(encoding="utf-8")

pairs = [
    (
        """                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-2.5">
                  <div className="text-[13px] font-black text-emerald-700">
                    💻 Offline Masaüstü
                  </div>
                  <div className="mt-1 text-[10px] font-semibold leading-4 text-emerald-700">
                    İnternetsiz kullanım, lokal veri, gizlilik odaklı çalışma.
                  </motionlessPlaceholderDiv>
                </motionlessPlaceholderDiv>""".replace("motionlessPlaceholderDiv", "motionlessPlaceholderDiv"),
        """                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50/80 p-5">
                  <p className="text-base font-black text-emerald-800">
                    💻 Offline Masaüstü
                  </p>
                  <p className="mt-2 text-sm leading-6 text-emerald-800/90">
                    İnternetsiz kullanım, lokal veri ve gizlilik odaklı çalışma.
                  </p>
                </div>""",
    ),
]
