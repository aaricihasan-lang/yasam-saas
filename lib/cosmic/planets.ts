/**
 * lib/cosmic/planets.ts
 * Güncel gezegen burç pozisyonları.
 *
 * Güneş   : algoritmik (ay/gün sınırları — Batı astrolojisi standardı, ±1 gün)
 * Ay       : moon.ts → getMoonSign() kullanılır (sidereal hesaplama)
 * Diğerleri: tarih aralığı tablosu, 2025-2028 kapsam.
 *
 * Kaynak: in-the-sky.org, prokerala.com, astroseek.com
 * Hassasiyet: günlük; dakikalık kesinlik hedeflenmez.
 */

// ─── Tip tanımları ────────────────────────────────────────────────────────────

export type PlanetKey =
  | "Güneş" | "Merkür" | "Venüs" | "Mars"
  | "Jüpiter" | "Satürn" | "Uranüs" | "Neptün" | "Plüton";

export type PlanetInfo = {
  key:        PlanetKey;
  symbol:     string;
  sign:       string;       // Turkish sign name
  signSymbol: string;       // Unicode zodiac symbol
};

const ZODIAC_SYMBOL: Record<string, string> = {
  "Koç":     "♈", "Boğa":    "♉", "İkizler": "♊",
  "Yengeç":  "♋", "Aslan":   "♌", "Başak":   "♍",
  "Terazi":  "♎", "Akrep":   "♏", "Yay":     "♐",
  "Oğlak":   "♑", "Kova":    "♒", "Balık":   "♓",
};

// ─── Güneş (algoritmik) ───────────────────────────────────────────────────────

function getSunSign(date: Date): string {
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

// ─── Tarih tablosu (Merkür–Plüton) ──────────────────────────────────────────

type SignPeriod = { from: string; to: string; sign: string };

/**
 * Bir gezegen için tarih aralığı listesini arar.
 * from dahil, to dahil. Eşleşme yoksa `fallback` döner.
 */
function lookupSign(periods: ReadonlyArray<SignPeriod>, date: Date, fallback: string): string {
  const iso = date.toISOString().slice(0, 10); // YYYY-MM-DD
  for (const p of periods) {
    if (iso >= p.from && iso <= p.to) return p.sign;
  }
  return fallback;
}

// ─── Merkür ☿ ─────────────────────────────────────────────────────────────────
// Retrograde başlangıç/bitiş: retro.ts verileriyle hizalandı (2026-2028).
// Retro dönemlerinde burç retroda gidiş yönüne göre değişebilir.

const MERCURY_PERIODS: ReadonlyArray<SignPeriod> = [
  // 2025
  { from: "2025-01-01", to: "2025-01-08", sign: "Yay"      },
  { from: "2025-01-09", to: "2025-01-27", sign: "Oğlak"    },
  { from: "2025-01-28", to: "2025-02-14", sign: "Kova"      },
  { from: "2025-02-15", to: "2025-03-02", sign: "Balık"     },
  { from: "2025-03-03", to: "2025-03-26", sign: "Koç"       },
  { from: "2025-03-27", to: "2025-04-14", sign: "Balık"     }, // retro ≈ Mar 15 – Apr 7
  { from: "2025-04-15", to: "2025-05-01", sign: "Koç"       },
  { from: "2025-05-02", to: "2025-05-18", sign: "Boğa"      },
  { from: "2025-05-19", to: "2025-06-07", sign: "İkizler"   },
  { from: "2025-06-08", to: "2025-07-01", sign: "Yengeç"    },
  { from: "2025-07-02", to: "2025-07-27", sign: "Aslan"     },
  { from: "2025-07-28", to: "2025-08-19", sign: "Başak"     }, // retro ≈ Jul 18 – Aug 11 Leo→Virgo
  { from: "2025-08-20", to: "2025-09-05", sign: "Başak"     },
  { from: "2025-09-06", to: "2025-09-27", sign: "Terazi"    },
  { from: "2025-09-28", to: "2025-11-09", sign: "Akrep"     }, // retro ≈ Sep 21 – Oct 13 Scorpio
  { from: "2025-11-10", to: "2025-11-29", sign: "Yay"       },
  { from: "2025-11-30", to: "2025-12-31", sign: "Oğlak"     },
  // 2026 — retrograde tarihler retro.ts'den: Feb 26–Mar 20, Jun 29–Jul 23, Oct 24–Nov 13
  { from: "2026-01-01", to: "2026-01-12", sign: "Oğlak"     },
  { from: "2026-01-13", to: "2026-02-02", sign: "Kova"       },
  { from: "2026-02-03", to: "2026-02-25", sign: "Balık"      },
  { from: "2026-02-26", to: "2026-03-19", sign: "Kova"       }, // retro ← Balık→Kova
  { from: "2026-03-20", to: "2026-04-06", sign: "Balık"      }, // direct, ilerliyor
  { from: "2026-04-07", to: "2026-04-23", sign: "Koç"        },
  { from: "2026-04-24", to: "2026-05-09", sign: "Boğa"       },
  { from: "2026-05-10", to: "2026-05-28", sign: "İkizler"    },
  { from: "2026-05-29", to: "2026-06-09", sign: "Yengeç"     },
  { from: "2026-06-10", to: "2026-07-09", sign: "Yengeç"     }, // ← bugün (19 Haz) ✓
  { from: "2026-07-10", to: "2026-07-23", sign: "İkizler"    }, // retro dibe (← Yengeç)
  { from: "2026-07-24", to: "2026-08-14", sign: "Yengeç"     }, // direct ileri
  { from: "2026-08-15", to: "2026-09-01", sign: "Aslan"      },
  { from: "2026-09-02", to: "2026-09-28", sign: "Başak"      },
  { from: "2026-09-29", to: "2026-10-23", sign: "Terazi"     },
  { from: "2026-10-24", to: "2026-11-13", sign: "Akrep"      }, // retro ← Terazi→Akrep
  { from: "2026-11-14", to: "2026-12-02", sign: "Terazi"     }, // direct ileri
  { from: "2026-12-03", to: "2026-12-22", sign: "Akrep"      },
  { from: "2026-12-23", to: "2026-12-31", sign: "Yay"        },
  // 2027 — retrograde: Feb 9–Mar 3, Jun 10–Jul 4, Oct 7–28
  { from: "2027-01-01", to: "2027-01-20", sign: "Oğlak"      },
  { from: "2027-01-21", to: "2027-02-08", sign: "Kova"        },
  { from: "2027-02-09", to: "2027-03-02", sign: "Oğlak"       }, // retro
  { from: "2027-03-03", to: "2027-03-22", sign: "Kova"        },
  { from: "2027-03-23", to: "2027-04-10", sign: "Balık"       },
  { from: "2027-04-11", to: "2027-04-28", sign: "Koç"         },
  { from: "2027-04-29", to: "2027-05-18", sign: "Boğa"        },
  { from: "2027-05-19", to: "2027-06-09", sign: "İkizler"     },
  { from: "2027-06-10", to: "2027-07-04", sign: "İkizler"     }, // retro ← Yengeç→İkizler
  { from: "2027-07-05", to: "2027-07-28", sign: "Yengeç"      },
  { from: "2027-07-29", to: "2027-08-15", sign: "Aslan"       },
  { from: "2027-08-16", to: "2027-09-04", sign: "Başak"       },
  { from: "2027-09-05", to: "2027-10-06", sign: "Terazi"      },
  { from: "2027-10-07", to: "2027-10-27", sign: "Başak"       }, // retro ← Terazi→Başak
  { from: "2027-10-28", to: "2027-11-18", sign: "Terazi"      },
  { from: "2027-11-19", to: "2027-12-08", sign: "Akrep"       },
  { from: "2027-12-09", to: "2027-12-31", sign: "Yay"         },
  // 2028
  { from: "2028-01-01", to: "2028-01-23", sign: "Oğlak"       },
  { from: "2028-01-24", to: "2028-02-14", sign: "Yay"         }, // retro
  { from: "2028-02-15", to: "2028-03-10", sign: "Kova"        },
  { from: "2028-03-11", to: "2028-03-28", sign: "Balık"       },
  { from: "2028-03-29", to: "2028-04-14", sign: "Koç"         },
  { from: "2028-04-15", to: "2028-05-07", sign: "Boğa"        },
  { from: "2028-05-08", to: "2028-05-20", sign: "İkizler"     },
  { from: "2028-05-21", to: "2028-06-14", sign: "Boğa"        }, // retro ← Gemini→Taurus
  { from: "2028-06-15", to: "2028-07-10", sign: "İkizler"     },
  { from: "2028-07-11", to: "2028-07-31", sign: "Yengeç"      },
  { from: "2028-08-01", to: "2028-08-18", sign: "Aslan"       },
  { from: "2028-08-19", to: "2028-09-04", sign: "Başak"       },
  { from: "2028-09-05", to: "2028-09-18", sign: "Terazi"      },
  { from: "2028-09-19", to: "2028-10-11", sign: "Başak"       }, // retro
  { from: "2028-10-12", to: "2028-11-02", sign: "Terazi"      },
  { from: "2028-11-03", to: "2028-11-22", sign: "Akrep"       },
  { from: "2028-11-23", to: "2028-12-12", sign: "Yay"         },
  { from: "2028-12-13", to: "2028-12-31", sign: "Oğlak"       },
];

// ─── Venüs ♀ ──────────────────────────────────────────────────────────────────
// 2025 retrograde: Jul 22 – Sep 3 (Aslan); 2026 retro: Oct 3 – Nov 13

const VENUS_PERIODS: ReadonlyArray<SignPeriod> = [
  // 2025
  { from: "2025-01-01", to: "2025-01-02", sign: "Kova"      },
  { from: "2025-01-03", to: "2025-01-30", sign: "Balık"     },
  { from: "2025-01-31", to: "2025-02-26", sign: "Koç"       },
  { from: "2025-02-27", to: "2025-03-26", sign: "Boğa"      },
  { from: "2025-03-27", to: "2025-04-30", sign: "İkizler"   },
  { from: "2025-05-01", to: "2025-06-05", sign: "Yengeç"    },
  { from: "2025-06-06", to: "2025-07-21", sign: "Aslan"     },
  { from: "2025-07-22", to: "2025-09-02", sign: "Aslan"     }, // retrograde (Aslan içinde)
  { from: "2025-09-03", to: "2025-10-12", sign: "Aslan"     }, // direct, still Aslan
  { from: "2025-10-13", to: "2025-11-09", sign: "Başak"     },
  { from: "2025-11-10", to: "2025-12-07", sign: "Terazi"    },
  { from: "2025-12-08", to: "2025-12-31", sign: "Akrep"     },
  // 2026
  { from: "2026-01-01", to: "2026-01-09", sign: "Akrep"     },
  { from: "2026-01-10", to: "2026-02-07", sign: "Yay"       },
  { from: "2026-02-08", to: "2026-03-08", sign: "Oğlak"     },
  { from: "2026-03-09", to: "2026-04-05", sign: "Kova"       },
  { from: "2026-04-06", to: "2026-05-02", sign: "Balık"     },
  { from: "2026-05-03", to: "2026-05-31", sign: "Koç"       },
  { from: "2026-06-01", to: "2026-06-27", sign: "Boğa"      }, // ← bugün (19 Haz) ✓
  { from: "2026-06-28", to: "2026-07-25", sign: "İkizler"   },
  { from: "2026-07-26", to: "2026-09-01", sign: "Yengeç"    },
  { from: "2026-09-02", to: "2026-10-02", sign: "Aslan"     },
  { from: "2026-10-03", to: "2026-11-13", sign: "Akrep"     }, // retrograde
  { from: "2026-11-14", to: "2026-12-01", sign: "Terazi"    }, // direct, geri dönen
  { from: "2026-12-02", to: "2026-12-31", sign: "Akrep"     },
  // 2027
  { from: "2027-01-01", to: "2027-01-10", sign: "Akrep"     },
  { from: "2027-01-11", to: "2027-02-08", sign: "Yay"       },
  { from: "2027-02-09", to: "2027-03-09", sign: "Oğlak"     },
  { from: "2027-03-10", to: "2027-04-06", sign: "Kova"       },
  { from: "2027-04-07", to: "2027-05-04", sign: "Balık"     },
  { from: "2027-05-05", to: "2027-06-01", sign: "Koç"       },
  { from: "2027-06-02", to: "2027-06-29", sign: "Boğa"      },
  { from: "2027-06-30", to: "2027-07-27", sign: "İkizler"   },
  { from: "2027-07-28", to: "2027-08-24", sign: "Yengeç"    },
  { from: "2027-08-25", to: "2027-09-20", sign: "Aslan"     },
  { from: "2027-09-21", to: "2027-10-17", sign: "Başak"     },
  { from: "2027-10-18", to: "2027-11-11", sign: "Terazi"    },
  { from: "2027-11-12", to: "2027-12-06", sign: "Akrep"     },
  { from: "2027-12-07", to: "2027-12-31", sign: "Yay"       },
];

// ─── Mars ♂ ───────────────────────────────────────────────────────────────────
// 2025-26 retrograde: Dec 6, 2025 – Feb 23, 2026 (Aslan → Yengeç)

const MARS_PERIODS: ReadonlyArray<SignPeriod> = [
  // 2025
  { from: "2025-01-01", to: "2025-04-17", sign: "Yengeç"   },
  { from: "2025-04-18", to: "2025-06-16", sign: "Aslan"     },
  { from: "2025-06-17", to: "2025-08-05", sign: "Başak"     },
  { from: "2025-08-06", to: "2025-09-21", sign: "Terazi"    },
  { from: "2025-09-22", to: "2025-12-05", sign: "Aslan"     }, // ← Mars Aslan'a girdi
  // 2025-2026 retrograde dönemi
  { from: "2025-12-06", to: "2026-01-14", sign: "Aslan"     }, // retro başlangıcı (Aslan'da)
  { from: "2026-01-15", to: "2026-02-22", sign: "Yengeç"    }, // retro dibe (← Aslan→Yengeç)
  { from: "2026-02-23", to: "2026-03-20", sign: "Yengeç"    }, // direct, Yengeç'te ileri
  { from: "2026-03-21", to: "2026-05-09", sign: "Aslan"     }, // Aslan'a geri girdi
  { from: "2026-05-10", to: "2026-06-25", sign: "Başak"     }, // ← bugün (19 Haz) ✓
  { from: "2026-06-26", to: "2026-08-09", sign: "Terazi"    },
  { from: "2026-08-10", to: "2026-09-22", sign: "Akrep"     },
  { from: "2026-09-23", to: "2026-11-03", sign: "Yay"       },
  { from: "2026-11-04", to: "2026-12-15", sign: "Oğlak"     },
  { from: "2026-12-16", to: "2026-12-31", sign: "Kova"       },
  // 2027
  { from: "2027-01-01", to: "2027-01-26", sign: "Kova"       },
  { from: "2027-01-27", to: "2027-03-10", sign: "Balık"     },
  { from: "2027-03-11", to: "2027-04-22", sign: "Koç"       },
  { from: "2027-04-23", to: "2027-06-04", sign: "Boğa"      },
  { from: "2027-06-05", to: "2027-07-19", sign: "İkizler"   },
  { from: "2027-07-20", to: "2027-09-03", sign: "Yengeç"    },
  { from: "2027-09-04", to: "2027-10-20", sign: "Aslan"     },
  { from: "2027-10-21", to: "2027-12-31", sign: "Başak"     },
];

// ─── Jüpiter ♃ ────────────────────────────────────────────────────────────────
// Yengeç: Jun 9, 2025 → Jun 30, 2026; Aslan: Jul 1, 2026 →

const JUPITER_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2024-05-25", to: "2025-06-08", sign: "Boğa"      },
  { from: "2025-06-09", to: "2026-06-30", sign: "Yengeç"    }, // ← bugün (19 Haz) ✓
  { from: "2026-07-01", to: "2027-07-25", sign: "Aslan"      },
  { from: "2027-07-26", to: "2028-08-24", sign: "Başak"      },
];

// ─── Satürn ♄ ─────────────────────────────────────────────────────────────────
// Koç: May 24, 2025 → ~Aug 10, 2025 (sonra retro ile Balık'a döner)
// Balık: ~Aug 11 – ~Jan 5, 2026 (retro dönemi)
// Koç: ~Jan 6, 2026 → ~2028

const SATURN_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2023-03-07", to: "2025-05-23", sign: "Balık"     },
  { from: "2025-05-24", to: "2025-08-10", sign: "Koç"       },
  { from: "2025-08-11", to: "2026-01-05", sign: "Balık"     }, // retro (Balık'a geri döndü)
  { from: "2026-01-06", to: "2028-04-12", sign: "Koç"       }, // ← bugün (19 Haz 2026) ✓
  { from: "2028-04-13", to: "2030-06-01", sign: "Boğa"      },
];

// ─── Uranüs ♅ ─────────────────────────────────────────────────────────────────
// İkizler: Jul 7, 2025 → Nov 6, 2025 (sonra retro ile Boğa'ya döner)
// Boğa: Nov 7, 2025 → Apr 24, 2026
// İkizler: Apr 25, 2026 → ~2033

const URANUS_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2019-03-06", to: "2025-07-06", sign: "Boğa"      },
  { from: "2025-07-07", to: "2025-11-06", sign: "İkizler"   },
  { from: "2025-11-07", to: "2026-04-24", sign: "Boğa"      }, // retro (geri döndü)
  { from: "2026-04-25", to: "2033-08-03", sign: "İkizler"   }, // ← bugün (19 Haz) ✓
];

// ─── Neptün ♆ ─────────────────────────────────────────────────────────────────
// Koç: Mar 30, 2025 → Oct 21, 2025 (ilk giriş)
// Balık: Oct 22, 2025 → Feb 21, 2026 (retro)
// Koç: Feb 22, 2026 → ~2039

const NEPTUNE_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2011-02-03", to: "2025-03-29", sign: "Balık"     },
  { from: "2025-03-30", to: "2025-10-21", sign: "Koç"       },
  { from: "2025-10-22", to: "2026-02-21", sign: "Balık"     }, // retro (geri döndü)
  { from: "2026-02-22", to: "2039-03-01", sign: "Koç"       }, // ← bugün (19 Haz) ✓
];

// ─── Plüton ♇ ─────────────────────────────────────────────────────────────────
// Kova: Nov 19, 2024 → 2044 (kalıcı giriş)

const PLUTO_PERIODS: ReadonlyArray<SignPeriod> = [
  { from: "2008-01-25", to: "2024-11-18", sign: "Oğlak"     },
  { from: "2024-11-19", to: "2044-01-18", sign: "Kova"       }, // ← bugün (19 Haz) ✓
];

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

/**
 * Verilen tarih için Güneş + 8 gezegen burç konumlarını döner.
 * Ay bu listede yer almaz; çağıran kod moon.ts → getMoonSign() kullanmalıdır.
 */
export function getPlanetSigns(date: Date): PlanetInfo[] {
  const planets: Array<{
    key: PlanetKey;
    symbol: string;
    periods: ReadonlyArray<SignPeriod>;
    fallback: string;
    algo?: (d: Date) => string;
  }> = [
    { key: "Güneş",  symbol: "☉", periods: [], fallback: "",        algo: getSunSign },
    { key: "Merkür", symbol: "☿", periods: MERCURY_PERIODS,         fallback: "Oğlak" },
    { key: "Venüs",  symbol: "♀", periods: VENUS_PERIODS,           fallback: "Kova"  },
    { key: "Mars",   symbol: "♂", periods: MARS_PERIODS,            fallback: "Koç"   },
    { key: "Jüpiter",symbol: "♃", periods: JUPITER_PERIODS,         fallback: "Boğa"  },
    { key: "Satürn", symbol: "♄", periods: SATURN_PERIODS,          fallback: "Balık" },
    { key: "Uranüs", symbol: "♅", periods: URANUS_PERIODS,          fallback: "İkizler" },
    { key: "Neptün", symbol: "♆", periods: NEPTUNE_PERIODS,         fallback: "Koç"   },
    { key: "Plüton", symbol: "♇", periods: PLUTO_PERIODS,           fallback: "Kova"  },
  ];

  return planets.map(({ key, symbol, periods, fallback, algo }) => {
    const sign = algo ? algo(date) : lookupSign(periods, date, fallback);
    return { key, symbol, sign, signSymbol: ZODIAC_SYMBOL[sign] ?? "" };
  });
}
