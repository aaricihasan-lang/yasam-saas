/**
 * lib/cosmic/planets.ts
 * Güncel gezegen burç pozisyonları.
 *
 * Güneş   : astronomy-engine GeoVector+Ecliptic (FAZ 5B) — dakika hassasiyeti
 * Ay       : moon.ts → getMoonSign() kullanılır (sidereal hesaplama)
 * Diğerleri: astronomy-engine GeoVector+Ecliptic birincil (FAZ 1A) — tarih sınırı yok;
 *            hardcoded tablolar yalnızca getPlanetSigns AE-hata fallback'i için tutulur.
 * getPlanetSignPeriod: AE ingress (FAZ 1D) — kesin bitişik kalış aralığı, tarih sınırı yok.
 *
 * Kaynak: in-the-sky.org, prokerala.com, astroseek.com
 * Retrograde tarihleri retro.ts ile çakıştırıldı (2026-2030).
 * Hassasiyet: günlük; dakikalık kesinlik hedeflenmez.
 */

import * as AE from "astronomy-engine";

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type PlanetKey =
  | "Güneş" | "Merkür" | "Venüs" | "Mars"
  | "Jüpiter" | "Satürn" | "Uranüs" | "Neptün" | "Plüton";

export type PlanetInfo = {
  key:        PlanetKey;
  symbol:     string;
  sign:       string;      // boş string → outOfRange true
  signSymbol: string;
  outOfRange: boolean;     // tablo kapsamı dışı; sign güvenilmez
};

const ZODIAC_SYMBOL: Record<string, string> = {
  "Koç":     "♈", "Boğa":    "♉", "İkizler": "♊",
  "Yengeç":  "♋", "Aslan":   "♌", "Başak":   "♍",
  "Terazi":  "♎", "Akrep":   "♏", "Yay":     "♐",
  "Oğlak":   "♑", "Kova":    "♒", "Balık":   "♓",
};

// ─── Güneş burcu ─────────────────────────────────────────────────────────────

// Tropikal zodyak: 0°=Koç, 30°=Boğa, … 330°=Balık (AE MoonPhase ile aynı referans sistemi)
const SUN_ZODIAC_NAMES = [
  "Koç","Boğa","İkizler","Yengeç","Aslan","Başak",
  "Terazi","Akrep","Yay","Oğlak","Kova","Balık",
] as const;

/**
 * Güneş burcu — legacy ay/gün sınır tablosu.
 * Hata: cusp günlerde ±1 gün (saat dikkate alınmaz).
 * Sadece AE başarısız olursa kullanılır.
 */
function _legacySunSign(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 1)  return d >= 20 ? "Kova"     : "Oğlak";
  if (m === 2)  return d >= 19 ? "Balık"    : "Kova";
  if (m === 3)  return d >= 20 ? "Koç"      : "Balık";
  if (m === 4)  return d >= 20 ? "Boğa"     : "Koç";
  if (m === 5)  return d >= 21 ? "İkizler"  : "Boğa";
  if (m === 6)  return d >= 21 ? "Yengeç"   : "İkizler";
  if (m === 7)  return d >= 23 ? "Aslan"    : "Yengeç";
  if (m === 8)  return d >= 23 ? "Başak"    : "Aslan";
  if (m === 9)  return d >= 23 ? "Terazi"   : "Başak";
  if (m === 10) return d >= 23 ? "Akrep"    : "Terazi";
  if (m === 11) return d >= 22 ? "Yay"      : "Akrep";
  if (m === 12) return d >= 22 ? "Oğlak"    : "Yay";
  return "Oğlak";
}

/**
 * Güneş burcu — astronomy-engine ekliptik boylam (FAZ 5B).
 * GeoVector(Sun) → Ecliptic() → elon (0-360°) → 30°'lik dilimler.
 * Cusp hatası ortadan kalkar; dakika hassasiyeti.
 * Fallback: legacy ay/gün tablosu.
 */
function getSunSign(date: Date): string {
  try {
    const vec = AE.GeoVector(AE.Body.Sun, date, true);
    const ecl = AE.Ecliptic(vec);
    const idx  = Math.floor(ecl.elon / 30) % 12;
    return SUN_ZODIAC_NAMES[idx] ?? _legacySunSign(date);
  } catch {
    return _legacySunSign(date);
  }
}

/** Güneş burcu + emoji — dış bileşenler için (app/page.tsx, audit). */
export function getSunSignInfo(date: Date): { name: string; emoji: string } {
  const name = getSunSign(date);
  return { name, emoji: ZODIAC_SYMBOL[name] ?? "☉" };
}

/** Legacy Güneş burcu — audit/karşılaştırma için. */
export function getSunSignLegacy(date: Date): string {
  return _legacySunSign(date);
}

// ─── Ortak AE ekliptik burç hesabı (FAZ 5C) ──────────────────────────────────

/**
 * Herhangi bir gezegen için AE ekliptik boylam → burç adı.
 * GeoVector(body, date, aberration=true) → Ecliptic() → elon/30 → tropikal burç.
 * AE başarısız olursa fallback string döner (tablo sonucu veya sabit).
 */
function getEclipticSignAE(body: AE.Body, date: Date, fallback: string): string {
  try {
    const vec = AE.GeoVector(body, date, true);
    const ecl = AE.Ecliptic(vec);
    const idx = Math.floor(ecl.elon / 30) % 12;
    return SUN_ZODIAC_NAMES[idx] ?? fallback;
  } catch {
    return fallback;
  }
}

// ─── Tarih tablosu yardımcısı ────────────────────────────────────────────────

type SignPeriod = { from: string; to: string; sign: string };

/**
 * Türkiye UTC+3 sabit offsetiyle YYYY-MM-DD tarih anahtarı üretir.
 * toISOString() UTC günü verir; 21:00–00:00 TR saatleri arasında
 * tablo aramaları yanlış güne düşer. Bu fonksiyon bunu önler.
 */
function toTRDateKey(date: Date): string {
  const ms  = date.getTime() + 3 * 3_600_000;
  const d   = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function lookupSign(periods: ReadonlyArray<SignPeriod>, date: Date, fallback: string): string {
  const iso = toTRDateKey(date);
  for (const p of periods) {
    if (iso >= p.from && iso <= p.to) return p.sign;
  }
  return fallback;
}

/** Tablo araması; kapsam dışıysa outOfRange: true döner, sign boş kalır. */
function lookupSignSafe(
  periods: ReadonlyArray<SignPeriod>,
  date: Date,
): { sign: string; outOfRange: boolean } {
  const iso = toTRDateKey(date);
  for (const p of periods) {
    if (iso >= p.from && iso <= p.to) return { sign: p.sign, outOfRange: false };
  }
  return { sign: "", outOfRange: true };
}

// ─── Merkür ☿ ─────────────────────────────────────────────────────────────────
// retro.ts retrograde tarihleriyle hizalandı:
// 2026: Feb 26–Mar 20, Jun 29–Jul 23, Oct 24–Nov 13
// 2027: Feb 9–Mar 3, Jun 10–Jul 4, Oct 7–28
// 2028: Jan 24–Feb 14, May 21–Jun 14, Sep 19–Oct 11
// 2029: Jan 7–27, May 1–25, Sep 2–24, Dec 22–Jan 11 2030
// 2030: Apr 12–May 6, Aug 15–Sep 8, Dec 5–25

const MERCURY_PERIODS: ReadonlyArray<SignPeriod> = [
  // ── 2025 ──
  { from: "2025-01-01", to: "2025-01-08", sign: "Yay"      },
  { from: "2025-01-09", to: "2025-01-27", sign: "Oğlak"    },
  { from: "2025-01-28", to: "2025-02-14", sign: "Kova"     },
  { from: "2025-02-15", to: "2025-03-02", sign: "Balık"    },
  { from: "2025-03-03", to: "2025-03-26", sign: "Koç"      },
  { from: "2025-03-27", to: "2025-04-14", sign: "Balık"    }, // retro ≈ Mar 15–Apr 7
  { from: "2025-04-15", to: "2025-05-01", sign: "Koç"      },
  { from: "2025-05-02", to: "2025-05-18", sign: "Boğa"     },
  { from: "2025-05-19", to: "2025-06-07", sign: "İkizler"  },
  { from: "2025-06-08", to: "2025-07-01", sign: "Yengeç"   },
  { from: "2025-07-02", to: "2025-07-27", sign: "Aslan"    },
  { from: "2025-07-28", to: "2025-08-19", sign: "Başak"    }, // retro ≈ Jul 18–Aug 11
  { from: "2025-08-20", to: "2025-09-05", sign: "Başak"    },
  { from: "2025-09-06", to: "2025-09-27", sign: "Terazi"   },
  { from: "2025-09-28", to: "2025-11-09", sign: "Akrep"    }, // retro ≈ Sep 21–Oct 13
  { from: "2025-11-10", to: "2025-11-29", sign: "Yay"      },
  { from: "2025-11-30", to: "2025-12-31", sign: "Oğlak"    },
  // ── 2026 — retro: Feb 26–Mar 20, Jun 29–Jul 23, Oct 24–Nov 13 ──
  { from: "2026-01-01", to: "2026-01-12", sign: "Oğlak"    },
  { from: "2026-01-13", to: "2026-02-02", sign: "Kova"     },
  { from: "2026-02-03", to: "2026-02-25", sign: "Balık"    },
  { from: "2026-02-26", to: "2026-03-19", sign: "Kova"     }, // retro ← Balık→Kova
  { from: "2026-03-20", to: "2026-04-06", sign: "Balık"    },
  { from: "2026-04-07", to: "2026-04-23", sign: "Koç"      },
  { from: "2026-04-24", to: "2026-05-09", sign: "Boğa"     },
  { from: "2026-05-10", to: "2026-05-28", sign: "İkizler"  },
  { from: "2026-05-29", to: "2026-07-09", sign: "Yengeç"   }, // ← bugün ✓
  { from: "2026-07-10", to: "2026-07-23", sign: "İkizler"  }, // retro dibe
  { from: "2026-07-24", to: "2026-08-14", sign: "Yengeç"   },
  { from: "2026-08-15", to: "2026-09-01", sign: "Aslan"    },
  { from: "2026-09-02", to: "2026-09-28", sign: "Başak"    },
  { from: "2026-09-29", to: "2026-10-23", sign: "Terazi"   },
  { from: "2026-10-24", to: "2026-11-13", sign: "Akrep"    }, // retro ← Terazi→Akrep
  { from: "2026-11-14", to: "2026-12-02", sign: "Terazi"   },
  { from: "2026-12-03", to: "2026-12-22", sign: "Akrep"    },
  { from: "2026-12-23", to: "2026-12-31", sign: "Yay"      },
  // ── 2027 — retro: Feb 9–Mar 3, Jun 10–Jul 4, Oct 7–28 ──
  { from: "2027-01-01", to: "2027-01-20", sign: "Oğlak"    },
  { from: "2027-01-21", to: "2027-02-08", sign: "Kova"     },
  { from: "2027-02-09", to: "2027-03-02", sign: "Oğlak"    }, // retro
  { from: "2027-03-03", to: "2027-03-22", sign: "Kova"     },
  { from: "2027-03-23", to: "2027-04-10", sign: "Balık"    },
  { from: "2027-04-11", to: "2027-04-28", sign: "Koç"      },
  { from: "2027-04-29", to: "2027-05-18", sign: "Boğa"     },
  { from: "2027-05-19", to: "2027-06-09", sign: "İkizler"  },
  { from: "2027-06-10", to: "2027-07-04", sign: "İkizler"  }, // retro ← Yengeç→İkizler
  { from: "2027-07-05", to: "2027-07-28", sign: "Yengeç"   },
  { from: "2027-07-29", to: "2027-08-15", sign: "Aslan"    },
  { from: "2027-08-16", to: "2027-09-04", sign: "Başak"    },
  { from: "2027-09-05", to: "2027-10-06", sign: "Terazi"   },
  { from: "2027-10-07", to: "2027-10-27", sign: "Başak"    }, // retro ← Terazi→Başak
  { from: "2027-10-28", to: "2027-11-18", sign: "Terazi"   },
  { from: "2027-11-19", to: "2027-12-08", sign: "Akrep"    },
  { from: "2027-12-09", to: "2027-12-31", sign: "Yay"      },
  // ── 2028 — retro: Jan 24–Feb 14, May 21–Jun 14, Sep 19–Oct 11 ──
  { from: "2028-01-01", to: "2028-01-23", sign: "Oğlak"    },
  { from: "2028-01-24", to: "2028-02-14", sign: "Yay"      }, // retro ← Oğlak→Yay
  { from: "2028-02-15", to: "2028-03-10", sign: "Kova"     },
  { from: "2028-03-11", to: "2028-03-28", sign: "Balık"    },
  { from: "2028-03-29", to: "2028-04-14", sign: "Koç"      },
  { from: "2028-04-15", to: "2028-05-07", sign: "Boğa"     },
  { from: "2028-05-08", to: "2028-05-20", sign: "İkizler"  },
  { from: "2028-05-21", to: "2028-06-14", sign: "Boğa"     }, // retro ← İkizler→Boğa
  { from: "2028-06-15", to: "2028-07-10", sign: "İkizler"  },
  { from: "2028-07-11", to: "2028-07-31", sign: "Yengeç"   },
  { from: "2028-08-01", to: "2028-08-18", sign: "Aslan"    },
  { from: "2028-08-19", to: "2028-09-04", sign: "Başak"    },
  { from: "2028-09-05", to: "2028-09-18", sign: "Terazi"   },
  { from: "2028-09-19", to: "2028-10-11", sign: "Başak"    }, // retro ← Terazi→Başak
  { from: "2028-10-12", to: "2028-11-02", sign: "Terazi"   },
  { from: "2028-11-03", to: "2028-11-22", sign: "Akrep"    },
  { from: "2028-11-23", to: "2028-12-12", sign: "Yay"      },
  { from: "2028-12-13", to: "2028-12-31", sign: "Oğlak"    },
  // ── 2029 — retro: Jan 7–27, May 1–25, Sep 2–24, Dec 22–Jan 11 2030 ──
  { from: "2029-01-01", to: "2029-01-06", sign: "Kova"     },
  { from: "2029-01-07", to: "2029-01-16", sign: "Oğlak"    }, // retro (Kova→Oğlak)
  { from: "2029-01-17", to: "2029-01-27", sign: "Yay"      }, // retro dibe
  { from: "2029-01-28", to: "2029-02-03", sign: "Oğlak"    }, // direct ileri
  { from: "2029-02-04", to: "2029-02-23", sign: "Kova"     },
  { from: "2029-02-24", to: "2029-03-13", sign: "Balık"    },
  { from: "2029-03-14", to: "2029-03-30", sign: "Koç"      },
  { from: "2029-03-31", to: "2029-04-17", sign: "Boğa"     },
  { from: "2029-04-18", to: "2029-04-30", sign: "İkizler"  },
  { from: "2029-05-01", to: "2029-05-11", sign: "İkizler"  }, // retro (İkizler'de)
  { from: "2029-05-12", to: "2029-05-25", sign: "Boğa"     }, // retro dibe
  { from: "2029-05-26", to: "2029-06-15", sign: "İkizler"  }, // direct ileri
  { from: "2029-06-16", to: "2029-07-05", sign: "Yengeç"   },
  { from: "2029-07-06", to: "2029-07-25", sign: "Aslan"    },
  { from: "2029-07-26", to: "2029-08-14", sign: "Başak"    },
  { from: "2029-08-15", to: "2029-09-01", sign: "Terazi"   },
  { from: "2029-09-02", to: "2029-09-11", sign: "Terazi"   }, // retro (Terazi'de)
  { from: "2029-09-12", to: "2029-09-24", sign: "Başak"    }, // retro dibe
  { from: "2029-09-25", to: "2029-10-14", sign: "Terazi"   }, // direct ileri
  { from: "2029-10-15", to: "2029-11-03", sign: "Akrep"    },
  { from: "2029-11-04", to: "2029-11-23", sign: "Yay"      },
  { from: "2029-11-24", to: "2029-12-13", sign: "Oğlak"    },
  { from: "2029-12-14", to: "2029-12-21", sign: "Kova"     },
  { from: "2029-12-22", to: "2029-12-31", sign: "Oğlak"    }, // retro (Kova→Oğlak)
  // ── 2030 — retro: (Jan 1–11 devam), Apr 12–May 6, Aug 15–Sep 8, Dec 5–25 ──
  { from: "2030-01-01", to: "2030-01-11", sign: "Oğlak"    }, // retro devam
  { from: "2030-01-12", to: "2030-01-31", sign: "Oğlak"    }, // direct ileri
  { from: "2030-02-01", to: "2030-02-20", sign: "Kova"     },
  { from: "2030-02-21", to: "2030-03-11", sign: "Balık"    },
  { from: "2030-03-12", to: "2030-03-28", sign: "Koç"      },
  { from: "2030-03-29", to: "2030-04-11", sign: "Boğa"     },
  { from: "2030-04-12", to: "2030-04-22", sign: "Boğa"     }, // retro (Boğa'da)
  { from: "2030-04-23", to: "2030-05-06", sign: "Koç"      }, // retro dibe
  { from: "2030-05-07", to: "2030-05-25", sign: "Boğa"     }, // direct ileri
  { from: "2030-05-26", to: "2030-06-14", sign: "İkizler"  },
  { from: "2030-06-15", to: "2030-07-04", sign: "Yengeç"   },
  { from: "2030-07-05", to: "2030-07-24", sign: "Aslan"    },
  { from: "2030-07-25", to: "2030-08-14", sign: "Başak"    },
  { from: "2030-08-15", to: "2030-08-26", sign: "Başak"    }, // retro (Başak'ta)
  { from: "2030-08-27", to: "2030-09-08", sign: "Aslan"    }, // retro dibe
  { from: "2030-09-09", to: "2030-09-30", sign: "Başak"    }, // direct ileri
  { from: "2030-10-01", to: "2030-10-20", sign: "Terazi"   },
  { from: "2030-10-21", to: "2030-11-09", sign: "Akrep"    },
  { from: "2030-11-10", to: "2030-11-29", sign: "Yay"      },
  { from: "2030-11-30", to: "2030-12-04", sign: "Oğlak"    },
  { from: "2030-12-05", to: "2030-12-25", sign: "Yay"      }, // retro ← Oğlak→Yay
  { from: "2030-12-26", to: "2030-12-31", sign: "Oğlak"    }, // direct ileri
];

// ─── Venüs ♀ ──────────────────────────────────────────────────────────────────
// retro.ts: 2026-10-03–11-13, 2028-05-10–06-22, 2029-12-16–2030-01-26

const VENUS_PERIODS: ReadonlyArray<SignPeriod> = [
  // ── 2025 ── retro: Jul 22–Sep 3 (Aslan içinde)
  { from: "2025-01-01", to: "2025-01-02", sign: "Kova"     },
  { from: "2025-01-03", to: "2025-01-30", sign: "Balık"    },
  { from: "2025-01-31", to: "2025-02-26", sign: "Koç"      },
  { from: "2025-02-27", to: "2025-03-26", sign: "Boğa"     },
  { from: "2025-03-27", to: "2025-04-30", sign: "İkizler"  },
  { from: "2025-05-01", to: "2025-06-05", sign: "Yengeç"   },
  { from: "2025-06-06", to: "2025-10-12", sign: "Aslan"    }, // retro Jul 22–Sep 3 Aslan içinde
  { from: "2025-10-13", to: "2025-11-09", sign: "Başak"    },
  { from: "2025-11-10", to: "2025-12-07", sign: "Terazi"   },
  { from: "2025-12-08", to: "2025-12-31", sign: "Akrep"    },
  // ── 2026 — retro: Oct 3–Nov 13 (Akrep→Terazi) — AE GeoVector tabanlı (FAZ 5D) ──
  { from: "2026-01-01", to: "2026-01-17", sign: "Oğlak"   }, // AE: 280–300°
  { from: "2026-01-18", to: "2026-02-09", sign: "Kova"    }, // AE: 300–330°
  { from: "2026-02-10", to: "2026-03-05", sign: "Balık"   }, // AE: 330–360°
  { from: "2026-03-06", to: "2026-03-30", sign: "Koç"     }, // AE: 0–30°
  { from: "2026-03-31", to: "2026-04-23", sign: "Boğa"    }, // AE: 30–60°
  { from: "2026-04-24", to: "2026-05-18", sign: "İkizler" }, // AE: 60–90°
  { from: "2026-05-19", to: "2026-06-12", sign: "Yengeç"  }, // AE: 90–120°
  { from: "2026-06-13", to: "2026-07-09", sign: "Aslan"   }, // AE: 120–150°
  { from: "2026-07-10", to: "2026-08-06", sign: "Başak"   }, // AE: 150–180°
  { from: "2026-08-07", to: "2026-09-09", sign: "Terazi"  }, // AE: 180–210°
  { from: "2026-09-10", to: "2026-10-24", sign: "Akrep"   }, // AE: 210°+ / retro Oct 3
  { from: "2026-10-25", to: "2026-12-03", sign: "Terazi"  }, // retro ← Akrep→Terazi
  { from: "2026-12-04", to: "2026-12-31", sign: "Akrep"   }, // direct ileri
  // ── 2027 — retro yok ──
  { from: "2027-01-01", to: "2027-01-10", sign: "Akrep"    },
  { from: "2027-01-11", to: "2027-02-08", sign: "Yay"      },
  { from: "2027-02-09", to: "2027-03-09", sign: "Oğlak"    },
  { from: "2027-03-10", to: "2027-04-06", sign: "Kova"     },
  { from: "2027-04-07", to: "2027-05-04", sign: "Balık"    },
  { from: "2027-05-05", to: "2027-06-01", sign: "Koç"      },
  { from: "2027-06-02", to: "2027-06-29", sign: "Boğa"     },
  { from: "2027-06-30", to: "2027-07-27", sign: "İkizler"  },
  { from: "2027-07-28", to: "2027-08-24", sign: "Yengeç"   },
  { from: "2027-08-25", to: "2027-09-20", sign: "Aslan"    },
  { from: "2027-09-21", to: "2027-10-17", sign: "Başak"    },
  { from: "2027-10-18", to: "2027-11-11", sign: "Terazi"   },
  { from: "2027-11-12", to: "2027-12-06", sign: "Akrep"    },
  { from: "2027-12-07", to: "2027-12-31", sign: "Yay"      },
  // ── 2028 — retro: May 10–Jun 22 (Boğa→Koç) ──
  { from: "2028-01-01", to: "2028-01-03", sign: "Yay"      },
  { from: "2028-01-04", to: "2028-01-31", sign: "Oğlak"    },
  { from: "2028-02-01", to: "2028-02-28", sign: "Kova"     },
  { from: "2028-03-01", to: "2028-03-29", sign: "Balık"    },
  { from: "2028-03-30", to: "2028-04-26", sign: "Koç"      },
  { from: "2028-04-27", to: "2028-05-09", sign: "Boğa"     },
  { from: "2028-05-10", to: "2028-05-22", sign: "Boğa"     }, // retro (Boğa'da)
  { from: "2028-05-23", to: "2028-06-22", sign: "Koç"      }, // retro dibe
  { from: "2028-06-23", to: "2028-07-15", sign: "Koç"      }, // direct ileri
  { from: "2028-07-16", to: "2028-08-12", sign: "Boğa"     },
  { from: "2028-08-13", to: "2028-09-09", sign: "İkizler"  },
  { from: "2028-09-10", to: "2028-10-07", sign: "Yengeç"   },
  { from: "2028-10-08", to: "2028-11-04", sign: "Aslan"    },
  { from: "2028-11-05", to: "2028-12-02", sign: "Başak"    },
  { from: "2028-12-03", to: "2028-12-31", sign: "Terazi"   },
  // ── 2029 — retro: Dec 16–Jan 26 2030 (Yay→Akrep) ──
  { from: "2029-01-01", to: "2029-01-02", sign: "Terazi"   },
  { from: "2029-01-03", to: "2029-01-31", sign: "Akrep"    },
  { from: "2029-02-01", to: "2029-03-01", sign: "Yay"      },
  { from: "2029-03-02", to: "2029-03-30", sign: "Oğlak"    },
  { from: "2029-03-31", to: "2029-04-27", sign: "Kova"     },
  { from: "2029-04-28", to: "2029-05-25", sign: "Balık"    },
  { from: "2029-05-26", to: "2029-06-22", sign: "Koç"      },
  { from: "2029-06-23", to: "2029-07-20", sign: "Boğa"     },
  { from: "2029-07-21", to: "2029-08-17", sign: "İkizler"  },
  { from: "2029-08-18", to: "2029-09-14", sign: "Yengeç"   },
  { from: "2029-09-15", to: "2029-10-12", sign: "Aslan"    },
  { from: "2029-10-13", to: "2029-11-09", sign: "Başak"    },
  { from: "2029-11-10", to: "2029-12-04", sign: "Terazi"   },
  { from: "2029-12-05", to: "2029-12-31", sign: "Yay"      }, // retro başlangıcı Dec 16
  // ── 2030 — retro devam: Jan 1–26 ──
  { from: "2030-01-01", to: "2030-01-22", sign: "Yay"      }, // retro devam
  { from: "2030-01-23", to: "2030-01-26", sign: "Akrep"    }, // retro dibe
  { from: "2030-01-27", to: "2030-01-29", sign: "Akrep"    }, // direct
  { from: "2030-01-30", to: "2030-02-23", sign: "Yay"      }, // ileri
  { from: "2030-02-24", to: "2030-03-20", sign: "Oğlak"    },
  { from: "2030-03-21", to: "2030-04-14", sign: "Kova"     },
  { from: "2030-04-15", to: "2030-05-09", sign: "Balık"    },
  { from: "2030-05-10", to: "2030-06-03", sign: "Koç"      },
  { from: "2030-06-04", to: "2030-06-28", sign: "Boğa"     },
  { from: "2030-06-29", to: "2030-07-23", sign: "İkizler"  },
  { from: "2030-07-24", to: "2030-08-17", sign: "Yengeç"   },
  { from: "2030-08-18", to: "2030-09-11", sign: "Aslan"    },
  { from: "2030-09-12", to: "2030-10-06", sign: "Başak"    },
  { from: "2030-10-07", to: "2030-10-31", sign: "Terazi"   },
  { from: "2030-11-01", to: "2030-11-25", sign: "Akrep"    },
  { from: "2030-11-26", to: "2030-12-20", sign: "Yay"      },
  { from: "2030-12-21", to: "2030-12-31", sign: "Oğlak"    },
];

// ─── Mars ♂ ───────────────────────────────────────────────────────────────────
// retro.ts: 2027-01-10–04-01 (Kova→Oğlak), 2029-02-14–05-05 (Yay→Akrep)
// 2025-2026: Mars retrosu yoktu (superior konjunksiyondaydı); AE GeoVector tabanlı (FAZ 5D)

const MARS_PERIODS: ReadonlyArray<SignPeriod> = [
  // ── 2025 ──
  { from: "2025-01-01", to: "2025-04-17", sign: "Yengeç"   },
  { from: "2025-04-18", to: "2025-06-16", sign: "Aslan"    },
  { from: "2025-06-17", to: "2025-08-05", sign: "Başak"    },
  { from: "2025-08-06", to: "2025-09-21", sign: "Terazi"   },
  { from: "2025-09-22", to: "2025-12-05", sign: "Aslan"    },
  // ── 2025-12-06 sonrası: Mars retrosu yoktu, AE GeoVector tabanlı (FAZ 5D) ──
  { from: "2025-12-06", to: "2025-12-14", sign: "Yay"      }, // AE: 263°, ileri hareket
  { from: "2025-12-15", to: "2026-01-22", sign: "Oğlak"    }, // AE: 270–300°
  { from: "2026-01-23", to: "2026-03-02", sign: "Kova"     }, // AE: 300–330°
  { from: "2026-03-03", to: "2026-04-09", sign: "Balık"    }, // AE: 330–360°
  { from: "2026-04-10", to: "2026-05-18", sign: "Koç"      }, // AE: 0–30°
  { from: "2026-05-19", to: "2026-06-28", sign: "Boğa"     }, // AE: 30–60°
  { from: "2026-06-29", to: "2026-08-10", sign: "İkizler"  }, // AE: 60–90°
  { from: "2026-08-11", to: "2026-09-27", sign: "Yengeç"   }, // AE: 90–120°
  { from: "2026-09-28", to: "2026-11-25", sign: "Aslan"    }, // AE: 120–150°
  { from: "2026-11-26", to: "2026-12-31", sign: "Başak"    }, // AE: 150°+
  // ── 2027 — retro: Jan 10–Apr 1 (Kova→Oğlak) ──
  { from: "2027-01-01", to: "2027-01-09", sign: "Kova"     },
  { from: "2027-01-10", to: "2027-03-10", sign: "Kova"     }, // retro Kova'da
  { from: "2027-03-11", to: "2027-04-01", sign: "Oğlak"    }, // retro dibe Oğlak
  { from: "2027-04-02", to: "2027-04-18", sign: "Oğlak"    }, // direct ileri
  { from: "2027-04-19", to: "2027-06-24", sign: "Kova"     },
  { from: "2027-06-25", to: "2027-08-29", sign: "Balık"    },
  { from: "2027-08-30", to: "2027-11-04", sign: "Koç"      },
  { from: "2027-11-05", to: "2027-12-31", sign: "Boğa"     },
  // ── 2028 — retro yok ──
  { from: "2028-01-01", to: "2028-01-13", sign: "Boğa"     },
  { from: "2028-01-14", to: "2028-03-21", sign: "İkizler"  },
  { from: "2028-03-22", to: "2028-05-28", sign: "Yengeç"   },
  { from: "2028-05-29", to: "2028-08-04", sign: "Aslan"    },
  { from: "2028-08-05", to: "2028-10-11", sign: "Başak"    },
  { from: "2028-10-12", to: "2028-12-18", sign: "Terazi"   },
  { from: "2028-12-19", to: "2028-12-31", sign: "Akrep"    },
  // ── 2029 — retro: Feb 14–May 5 (Yay→Akrep) ──
  { from: "2029-01-01", to: "2029-01-18", sign: "Akrep"    },
  { from: "2029-01-19", to: "2029-02-13", sign: "Yay"      },
  { from: "2029-02-14", to: "2029-04-14", sign: "Yay"      }, // retro Yay'da
  { from: "2029-04-15", to: "2029-05-05", sign: "Akrep"    }, // retro dibe Akrep
  { from: "2029-05-06", to: "2029-06-03", sign: "Akrep"    }, // direct ileri
  { from: "2029-06-04", to: "2029-08-02", sign: "Yay"      },
  { from: "2029-08-03", to: "2029-10-01", sign: "Oğlak"    },
  { from: "2029-10-02", to: "2029-11-30", sign: "Kova"     },
  { from: "2029-12-01", to: "2029-12-31", sign: "Balık"    },
  // ── 2030 — retro yok ──
  { from: "2030-01-01", to: "2030-01-17", sign: "Balık"    },
  { from: "2030-01-18", to: "2030-03-25", sign: "Koç"      },
  { from: "2030-03-26", to: "2030-05-31", sign: "Boğa"     },
  { from: "2030-06-01", to: "2030-08-06", sign: "İkizler"  },
  { from: "2030-08-07", to: "2030-10-12", sign: "Yengeç"   },
  { from: "2030-10-13", to: "2030-12-18", sign: "Aslan"    },
  { from: "2030-12-19", to: "2030-12-31", sign: "Başak"    },
];

// ─── Jüpiter ♃ ────────────────────────────────────────────────────────────────
// retro.ts: 2026-12-12–2027-04-12, 2028-01-12–05-13, 2029-02-10–06-13, 2030-03-13–07-14
// AE doğrulaması (2026-06-20 audit): tüm geçiş tarihleri AE GeoVector+Ecliptic 12sa adımla teyit edildi.

const JUPITER_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2024-05-25", to: "2025-06-08", sign: "Boğa"     },
  { from: "2025-06-09", to: "2026-06-29", sign: "Yengeç"   }, // AE: Yengeç son gün 2026-06-29 (119.84°)
  { from: "2026-06-30", to: "2027-07-25", sign: "Aslan"    }, // AE: 2026-06-30 12:00 UTC = 120.05° | retro Dec 12–Apr 12 Aslan içinde
  { from: "2027-07-26", to: "2028-08-23", sign: "Başak"    }, // AE: 2028-08-23 son Başak (179.86°) | retro Jan 12–May 13 Başak içinde
  { from: "2028-08-24", to: "2029-09-23", sign: "Terazi"   }, // AE: 2028-08-24 = 180.06° | retro Feb 10–Jun 13 Terazi içinde
  { from: "2029-09-24", to: "2030-10-22", sign: "Akrep"    }, // AE: 2029-09-24 = 210.05° | retro Mar 13–Jul 14 Akrep içinde
  { from: "2030-10-23", to: "2032-01-15", sign: "Yay"      }, // AE: 2030-10-23 = 240.11°
];

// ─── Satürn ♄ ─────────────────────────────────────────────────────────────────
// retro.ts: 2026-07-26–12-10, 2027-08-09–12-23, 2028-08-22–2029-01-05,
//           2029-09-06–2030-01-18, 2030-09-20–2031-02-01
// AE doğrulaması: 2028 retrosu Satürn'ü Koç'a GERİ ÇEKMİYOR.
// Satürn 2028-08-22 retroda Boğa'da (~41°) başlıyor, minimum 34.41° (Oca 2029),
// hiç 30°'nin altına inmiyor — Koç dönüşü yok. Boğa Haziran 2030'a kadar sürer.
// AE: 2030-06-01 = 60.05° → Boğa→İkizler. 2030 retrosu minimum ~62° → Boğa'ya dönmüyor.

const SATURN_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2023-03-07", to: "2025-05-23", sign: "Balık"    },
  { from: "2025-05-24", to: "2025-08-10", sign: "Koç"      },
  { from: "2025-08-11", to: "2026-02-13", sign: "Balık"    }, // retro + dönüş; AE kalıcı Koç öncesi son Balık = 2026-02-13 (359.94°)
  { from: "2026-02-14", to: "2028-04-12", sign: "Koç"      }, // AE: 2026-02-14 = 0.05° (kalıcı giriş)
  { from: "2028-04-13", to: "2030-05-31", sign: "Boğa"     }, // AE: 2028-04-13 = 30.04° | phantom Koç kaldırıldı
  { from: "2030-06-01", to: "2030-12-31", sign: "İkizler"  }, // AE: 2030-06-01 = 60.05° | sistem destek aralığı sonu (31.12.2030)
];

// ─── Uranüs ♅ ─────────────────────────────────────────────────────────────────
// 2025 Jul→Nov ilk giriş İkizler, geri döner, Apr 2026 kalıcı giriş

const URANUS_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2019-03-06", to: "2025-07-06", sign: "Boğa"     },
  { from: "2025-07-07", to: "2025-11-06", sign: "İkizler"  },
  { from: "2025-11-07", to: "2026-04-24", sign: "Boğa"     }, // retro
  { from: "2026-04-25", to: "2033-08-03", sign: "İkizler"  }, // ← bugün ✓
];

// ─── Neptün ♆ ─────────────────────────────────────────────────────────────────
// 2025 Mar ilk giriş Koç, Oct retro Balık, Oca 2026 kalıcı giriş Koç
// AE doğrulaması: kalıcı Koç girişi 2026-01-26 14:30 UTC (TR: 17:30)

const NEPTUNE_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2011-02-03", to: "2025-03-29", sign: "Balık"    },
  { from: "2025-03-30", to: "2025-10-21", sign: "Koç"      },
  { from: "2025-10-22", to: "2026-01-25", sign: "Balık"    }, // retro
  { from: "2026-01-26", to: "2039-03-01", sign: "Koç"      }, // AE: 2026-01-26 14:30 UTC
];

// ─── Plüton ♇ ─────────────────────────────────────────────────────────────────
// Nov 2024 kalıcı giriş Kova

const PLUTO_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2008-01-25", to: "2024-11-18", sign: "Oğlak"    },
  { from: "2024-11-19", to: "2044-01-18", sign: "Kova"     }, // ← bugün ✓
];

// ─── AE ingress dönem motoru (FAZ 1D) ────────────────────────────────────────
// getPlanetSignPeriod için: gezegenin SEÇİLİ TARİHTEKİ burcunda KESİN BİTİŞİK kalış
// aralığı (from = bu burca son giriş, to = sonraki çıkış; Türkiye saati). Retro
// kaynaklı kısa wobble'lar bitişik kalışı doğal olarak böler. AE → tarih sınırı yok.
// (Eski SUN_BOUNDARIES tablosu ve getSunSignBoundaries kaldırıldı; Güneş de AE ile.)

const SIGN_PERIOD_BODY: Record<PlanetKey, AE.Body> = {
  "Güneş":   AE.Body.Sun,     "Merkür": AE.Body.Mercury, "Venüs":  AE.Body.Venus,
  "Mars":    AE.Body.Mars,    "Jüpiter": AE.Body.Jupiter, "Satürn": AE.Body.Saturn,
  "Uranüs":  AE.Body.Uranus,  "Neptün": AE.Body.Neptune,  "Plüton": AE.Body.Pluto,
};
// Adım, en kısa olası bitişik kalıştan küçük olmalı (hızlı gezegen 1g, yavaş 3g güvenli).
const SIGN_PERIOD_STEP_DAYS: Record<PlanetKey, number> = {
  "Güneş": 1, "Merkür": 1, "Venüs": 1, "Mars": 1,
  "Jüpiter": 3, "Satürn": 3, "Uranüs": 3, "Neptün": 3, "Plüton": 3,
};
const SIGN_PERIOD_TR_OFFSET = 3 * 3_600_000;          // Türkiye UTC+3 sabit
const SIGN_PERIOD_CAP_MS = 40 * 365 * 86_400_000;     // arama tavanı (Plüton ~20y/burç)

function aeSignIndexAt(body: AE.Body, ms: number): number {
  const elon = AE.Ecliptic(AE.GeoVector(body, new Date(ms), true)).elon;
  return Math.floor((((elon % 360) + 360) % 360) / 30);
}
function aeSignPeriodTrDate(ms: number): string {
  const d = new Date(ms + SIGN_PERIOD_TR_OFFSET);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
/** inT s0 burcunda, outT farklı burçta → sınır anını ikili aramayla bulur (~dakika). */
function aeSignBoundary(body: AE.Body, inT: number, outT: number, s0: number): number {
  let i = inT, o = outT;
  for (let k = 0; k < 44; k++) {
    const mid = (i + o) / 2;
    if (aeSignIndexAt(body, mid) === s0) i = mid; else o = mid;
  }
  return i;
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

/**
 * Verilen tarih için Güneş + 8 gezegen burç konumlarını döner.
 * Ay bu listede yer almaz; çağıran kod moon.ts → getMoonSign() kullanmalıdır.
 * Güneş/Merkür/Venüs/Mars: AE GeoVector+Ecliptic (FAZ 5B-5C) — tarih sınırı yok.
 * Jüpiter–Plüton: AE GeoVector+Ecliptic birincil (FAZ 1A) — tarih sınırı yok;
 *   tablo yalnızca AE-hata fallback'i.
 */
export function getPlanetSigns(date: Date): PlanetInfo[] {
  const planets: Array<{
    key: PlanetKey;
    symbol: string;
    periods: ReadonlyArray<SignPeriod>;
    fallback: string;
    algo?: (d: Date) => string;
  }> = [
    { key: "Güneş",   symbol: "☉", periods: [],               fallback: "",
      algo: getSunSign },
    { key: "Merkür",  symbol: "☿", periods: MERCURY_PERIODS,  fallback: "Oğlak",
      algo: (d) => getEclipticSignAE(AE.Body.Mercury, d, lookupSign(MERCURY_PERIODS, d, "Oğlak")) },
    { key: "Venüs",   symbol: "♀", periods: VENUS_PERIODS,    fallback: "Kova",
      algo: (d) => getEclipticSignAE(AE.Body.Venus,   d, lookupSign(VENUS_PERIODS,   d, "Kova")) },
    { key: "Mars",    symbol: "♂", periods: MARS_PERIODS,     fallback: "Koç",
      algo: (d) => getEclipticSignAE(AE.Body.Mars,    d, lookupSign(MARS_PERIODS,    d, "Koç")) },
    { key: "Jüpiter", symbol: "♃", periods: JUPITER_PERIODS,  fallback: "Yay",
      algo: (d) => getEclipticSignAE(AE.Body.Jupiter, d, lookupSign(JUPITER_PERIODS, d, "Yay")) },
    { key: "Satürn",  symbol: "♄", periods: SATURN_PERIODS,   fallback: "Boğa",
      algo: (d) => getEclipticSignAE(AE.Body.Saturn,  d, lookupSign(SATURN_PERIODS,  d, "Boğa")) },
    { key: "Uranüs",  symbol: "♅", periods: URANUS_PERIODS,   fallback: "İkizler",
      algo: (d) => getEclipticSignAE(AE.Body.Uranus,  d, lookupSign(URANUS_PERIODS,  d, "İkizler")) },
    { key: "Neptün",  symbol: "♆", periods: NEPTUNE_PERIODS,  fallback: "Koç",
      algo: (d) => getEclipticSignAE(AE.Body.Neptune, d, lookupSign(NEPTUNE_PERIODS, d, "Koç")) },
    { key: "Plüton",  symbol: "♇", periods: PLUTO_PERIODS,    fallback: "Kova",
      algo: (d) => getEclipticSignAE(AE.Body.Pluto,   d, lookupSign(PLUTO_PERIODS,   d, "Kova")) },
  ];

  return planets.map(({ key, symbol, periods, fallback, algo }) => {
    if (algo) {
      const sign = algo(date);
      return { key, symbol, sign, signSymbol: ZODIAC_SYMBOL[sign] ?? "", outOfRange: false };
    }
    const { sign, outOfRange } = lookupSignSafe(periods, date);
    return { key, symbol, sign, signSymbol: ZODIAC_SYMBOL[sign] ?? "", outOfRange };
  });
}

/**
 * Verilen gezegen ve tarih için, gezegenin o tarihte bulunduğu burçta KESİN BİTİŞİK
 * kalış aralığını döner (from = bu burca son giriş, to = sonraki çıkış; Türkiye saati).
 * astronomy-engine ingress hesabı (FAZ 1D) — tarih sınırı yok; retro wobble'lar
 * bitişik kalışı doğal olarak böler. AE başarısız olursa null.
 */
export function getPlanetSignPeriod(
  key: PlanetKey,
  date: Date,
): { from: string; to: string } | null {
  try {
    const body = SIGN_PERIOD_BODY[key];
    const step = SIGN_PERIOD_STEP_DAYS[key] * 86_400_000;
    const t0   = date.getTime();
    const s0   = aeSignIndexAt(body, t0);

    // from: geriye doğru bu burca giriş anı
    let prev = t0, cur = t0 - step;
    const backCap = t0 - SIGN_PERIOD_CAP_MS;
    while (cur > backCap && aeSignIndexAt(body, cur) === s0) { prev = cur; cur -= step; }
    const fromMs = aeSignIndexAt(body, cur) === s0 ? cur : aeSignBoundary(body, prev, cur, s0);

    // to: ileriye doğru bu burçtan çıkış anı
    prev = t0; cur = t0 + step;
    const fwdCap = t0 + SIGN_PERIOD_CAP_MS;
    while (cur < fwdCap && aeSignIndexAt(body, cur) === s0) { prev = cur; cur += step; }
    const toMs = aeSignIndexAt(body, cur) === s0 ? cur : aeSignBoundary(body, prev, cur, s0);

    return { from: aeSignPeriodTrDate(fromMs), to: aeSignPeriodTrDate(toMs) };
  } catch {
    return null;
  }
}

// ─── Legacy tablo lookup — audit/karşılaştırma için (FAZ 5C) ─────────────────

/** Merkür burcu — tablo araması. Kapsam dışı → "outOfRange". Audit için. */
export function getMercurySignLegacy(date: Date): string {
  return lookupSign(MERCURY_PERIODS, date, "outOfRange");
}

/** Venüs burcu — tablo araması. Kapsam dışı → "outOfRange". Audit için. */
export function getVenusSignLegacy(date: Date): string {
  return lookupSign(VENUS_PERIODS, date, "outOfRange");
}

/** Mars burcu — tablo araması. Kapsam dışı → "outOfRange". Audit için. */
export function getMarsSignLegacy(date: Date): string {
  return lookupSign(MARS_PERIODS, date, "outOfRange");
}
