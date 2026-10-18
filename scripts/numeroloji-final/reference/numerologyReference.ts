/**
 * BAĞIMSIZ NUMEROLOJİ REFERANS HESAPLAYICISI — Ana/Yan Kulvar + Ana Kulvar çakra desteği.
 *
 * ÜRETİM KODUNDAN HİÇBİR ŞEY İMPORT ETMEZ (lib/numeroloji/** yok). Kurallar kaynaklardan
 * yeniden yazılmıştır; amaç üretim motorunu dışarıdan sınamaktır:
 *   - Harf tablosu + sesli/sessiz: eğitim notu "NUMOROLOJİ HESAPLAMALARI" s.1 (çakra harfleri),
 *     I ve İ = 9 (K1 s.167/208).
 *   - Parça değeri: kelime başına topla; 11/19/22/33 ise korunur, değilse sadeleştir, sadeleştirirken
 *     11/19/22/33'e varılırsa dur (K1 s.16; Kitap PDF-1 s.11; uzman inceleme kitabı 2. Ders Adım 2).
 *   - Ana Kulvar Durum 1–4 (uzman inceleme kitabı 11.10.2026, 2. Ders "Dört durum" tablosu —
 *     ürünün belgelenmiş kuralı; Durum 4 "kalanlı özel çift" Kitap PDF-1 s.11 ATATÜRK 5+6=11, kalan 5).
 *   - Ara kontrol parantezi: kalan yoksa "(19)" (2026-10-18 owner talimatı: sahte "/0" yok).
 *   - Yalnız iki parçalı özel çift, dışarıda parça yok: sonuç yalnız özel sayı (5+6 → "11");
 *     yapay ikinci sayı yok (OWNER NİHAİ KARARI 2026-10-18, eski "11/5" küçük-parça kuralı kalktı).
 *   - Çakra (sol sütun, Ana Kulvar) — eğitim notu s.2 + 03.10.2026 + OWNER NİHAİ KARARI 2026-10-18:
 *       özel oluşum (özel parça / özel çift / toplamın kendisi özel) → 10. çakraya TEK destek;
 *       özel oluşuma girmeyen özel olmayan GERÇEK kalan (1–9) varsa onun çakrası; özel sayı
 *       sadeleştirilerek ikinci destek üretilmez; özel sayıyı oluşturan parçalar ayrıca sayılmaz.
 *       Özel değilse her parçanın sadeleşmiş değeri + Ana Kulvar'ın tek hanesi (1-6-8-6 örneği).
 *   - Alternatifler: ayrık özel gruplar (≥2 parça veya tek özel parça), her özel parça bir grupta,
 *     kalan sadeleşir; kanonik yol hariç — ÜRETİMDEN FARKLI ALGORİTMA (atama ağacı, bitmask yok).
 *
 * A/B/C/D belirsizlikleri owner tarafından 2026-10-18'de karara bağlandı; yeni belirsizlik bulunursa
 * `kararlar` alanında işaretlenir ve harness PASS saymaz.
 */

export const OZEL = [11, 19, 22, 33] as const;
const isOzel = (n: number) => (OZEL as readonly number[]).includes(n);

const HARF: Record<string, number> = {};
for (const [n, letters] of [
  [1, "AJSŞ"], [2, "BKT"], [3, "CÇLUÜ"], [4, "DMV"], [5, "ENW"], [6, "FOÖX"], [7, "GĞPY"], [8, "HQZ"], [9, "IİR"],
] as const) for (const ch of letters) HARF[ch] = n;
const SESLI = new Set(Array.from("AEIİOÖUÜ"));

export function rakamToplami(n: number): number {
  return String(Math.abs(n)).split("").reduce((a, c) => a + Number(c), 0);
}
/** 11/19/22/33'te durarak sadeleştir. */
export function sadeOzelDur(n: number): number {
  let c = Math.abs(n);
  while (c > 9 && !isOzel(c)) c = rakamToplami(c);
  return c;
}
/** Tek haneye kadar sadeleştir (özel korunmaz). */
export function tekHane(n: number): number {
  let c = Math.abs(n);
  while (c > 9) c = rakamToplami(c);
  return c;
}
/** Parça ham toplamı → parça değeri (0 = sesli/sessiz harfi yok). */
export function parcaDegeri(ham: number): number {
  return ham <= 0 ? 0 : sadeOzelDur(ham);
}

function buyukHarf(s: string): string {
  return (s || "").toLocaleUpperCase("tr-TR");
}
export function parcalar(ad: string, soyad: string): string[] {
  return `${ad} ${soyad}`.trim().split(/\s+/).filter(Boolean);
}
export function hamSesli(kelime: string): number {
  return Array.from(buyukHarf(kelime)).reduce((t, ch) => t + (SESLI.has(ch) ? HARF[ch] ?? 0 : 0), 0);
}
export function hamSessiz(kelime: string): number {
  return Array.from(buyukHarf(kelime)).reduce((t, ch) => t + (!SESLI.has(ch) ? HARF[ch] ?? 0 : 0), 0);
}

export type Karar = "A" | "B" | "C" | "D";
/** 2026-10-18 owner nihai kararıyla kapatılan sorular (rapor için). */
export const KARAR_ACIKLAMA: Record<Karar, string> = {
  A: "KAPANDI — toplamı özel olan parçalar (ör. [9,1,9] → 19) → [10]; parçalar ayrıca sayılmaz",
  B: "KAPANDI — 5+6=11 dışarıda parça yoksa yalnız '11' → [10]; yapay /5 yok. 5+6+5 → 11/5 → [10,5]",
  C: "KAPANDI — birden fazla özel sayıda 10. çakraya tek destek",
  D: "KAPANDI — özel sayı tek başına yalnız [10]; sadeleştirilerek ikinci destek üretilmez",
};

export type KulvarRef = {
  bilesen: number[];          // normalleştirilmiş parça değerleri (0 dahil, sıra korunur)
  durum: "bos" | "D1" | "D2" | "D3" | "tek-ozel" | "D4";
  ozelOlusumlar: { sayi: number; parcalar: number[]; tur: "parca" | "cift" | "kalan" | "toplam" }[];
  kalan: number[];            // ana sonuçta özel oluşuma girmeyen parçalar
  anaGosterim: string;        // parantezsiz
  parantez: string;           // "" veya "(22/4)" / "(19)" / "(22)"
  gosterim: string;           // anaGosterim + parantez
  anahtar: string;            // yorum sayısı (key)
};

/** Ana/Yan Kulvar yapısı — Durum 1–4 (bağımsız uygulama). */
export function kulvarRef(bilesen: number[]): KulvarRef {
  const nz = bilesen.filter((v) => v > 0);
  const bos: KulvarRef = { bilesen, durum: "bos", ozelOlusumlar: [], kalan: [], anaGosterim: "", parantez: "", gosterim: "", anahtar: "" };
  if (nz.length === 0) return bos;
  const ozelParca = nz.filter(isOzel);
  const normal = nz.filter((v) => !isOzel(v));

  // Özel çift adayları (parça indeksleriyle; sadeOzelDur ile)
  const ciftler: { s: number; i: number; j: number }[] = [];
  for (let i = 0; i < bilesen.length; i++)
    for (let j = i + 1; j < bilesen.length; j++) {
      if (!bilesen[i] || !bilesen[j]) continue;
      const s = sadeOzelDur(bilesen[i] + bilesen[j]);
      if (isOzel(s)) ciftler.push({ s, i, j });
    }

  // Durum 2: en az bir özel parça + en az bir normal parça
  if (ozelParca.length > 0 && normal.length > 0) {
    const r = sadeOzelDur(normal.reduce((a, b) => a + b, 0));
    const ana = `${[...ozelParca].sort((a, b) => b - a).join("/")}/${r}`;
    // Ara kontrol: ham ikili toplamı tam özel olan EN BÜYÜK çift (ilk bulunan); kalan tek ise kendisi, çoksa sadeleşmiş.
    let enIyi = 0;
    let par = "";
    for (let i = 0; i < nz.length; i++)
      for (let j = i + 1; j < nz.length; j++) {
        const s = nz[i] + nz[j];
        if (isOzel(s) && s > enIyi) {
          const geri = nz.filter((_, k) => k !== i && k !== j);
          enIyi = s;
          // F3-C: kalana özel sayı karışıp sadeleşiyorsa parantez yok
          par = geri.length > 1 && geri.some(isOzel) ? "" : geri.length === 0 ? `(${s})` : `(${s}/${geri.length === 1 ? geri[0] : sadeOzelDur(geri.reduce((a, b) => a + b, 0))})`;
        }
      }
    if (par.replace(/^\(|\)$/g, "") === ana) par = "";
    const olus: KulvarRef["ozelOlusumlar"] = ozelParca.map((s) => ({ sayi: s, parcalar: [s], tur: "parca" as const }));
    if (isOzel(r)) olus.push({ sayi: r, parcalar: normal, tur: "kalan" });
    return { bilesen, durum: "D2", ozelOlusumlar: olus, kalan: normal, anaGosterim: ana, parantez: par, gosterim: par ? `${ana} ${par}` : ana, anahtar: String(r) };
  }

  // Durum 3 / tek özel / Durum 4: en iyi aday (tekil özel parça öncelik 1, çift öncelik 2;
  // önce büyük sayı, eşitse çift; eşitlikte ilk bulunan).
  type Aday = { s: number; idx: number[]; p: number };
  const adaylar: Aday[] = [];
  bilesen.forEach((v, i) => { if (v && isOzel(v)) adaylar.push({ s: v, idx: [i], p: 1 }); });
  for (const c of ciftler) adaylar.push({ s: c.s, idx: [c.i, c.j], p: 2 });

  if (adaylar.length === 0) {
    // Durum 1
    const t = nz.reduce((a, b) => a + b, 0);
    const k = sadeOzelDur(t);
    return {
      bilesen, durum: "D1", ozelOlusumlar: isOzel(k) ? [{ sayi: k, parcalar: nz, tur: "toplam" }] : [], kalan: nz,
      anaGosterim: String(k), parantez: "", gosterim: String(k), anahtar: String(k),
    };
  }
  let best = adaylar[0];
  for (const a of adaylar.slice(1)) if (a.s > best.s || (a.s === best.s && a.p > best.p)) best = a;
  const kullan = new Set(best.idx);
  const taban = bilesen.filter((v, i) => v > 0 && !kullan.has(i));
  const kullanilan = best.idx.map((i) => bilesen[i]);
  const anaHane =
    taban.length > 0
      ? sadeOzelDur(taban.reduce((a, b) => a + b, 0))
      : ozelParca.length === 0
        ? best.s // owner kararı: kalansız özel çift → yalnız özel sayı
        : kullanilan.length >= 2 ? Math.min(...kullanilan) : best.s;

  if (ozelParca.length > 0) {
    // Tüm parçalar özel
    if (nz.length >= 2) {
      const ana = nz.join("/");
      const t = nz.reduce((a, b) => a + b, 0);
      const par = t === 22 || t === 33 ? `(${t})` : "";
      const gost = par && par !== `(${ana})` ? `${ana} ${par}` : ana;
      return {
        bilesen, durum: "D3", ozelOlusumlar: nz.map((s) => ({ sayi: s, parcalar: [s], tur: "parca" as const })), kalan: [],
        anaGosterim: ana, parantez: gost === ana ? "" : par, gosterim: gost, anahtar: String(anaHane),
      };
    }
    return {
      bilesen, durum: "tek-ozel", ozelOlusumlar: [{ sayi: nz[0], parcalar: [nz[0]], tur: "parca" }], kalan: [],
      anaGosterim: String(nz[0]), parantez: "", gosterim: String(nz[0]), anahtar: String(anaHane),
    };
  }
  // Durum 4: yalnız özel çift
  const olus: KulvarRef["ozelOlusumlar"] = [{ sayi: best.s, parcalar: kullanilan, tur: "cift" }];
  if (taban.length > 0 && isOzel(anaHane)) olus.push({ sayi: anaHane, parcalar: taban, tur: "kalan" });
  const ana = taban.length > 0 ? `${best.s}/${anaHane}` : String(best.s);
  return { bilesen, durum: "D4", ozelOlusumlar: olus, kalan: taban, anaGosterim: ana, parantez: "", gosterim: ana, anahtar: String(anaHane) };
}

export type CakraRef = { destekler: number[]; kararlar: Karar[]; aciklama: string };

/** Ana Kulvar çakra desteği — eğitim notu s.2 + 03.10.2026 + owner nihai kararı 2026-10-18. */
export function anaCakraRef(k: KulvarRef): CakraRef {
  const kararlar: Karar[] = [];
  if (k.durum === "bos") return { destekler: [], kararlar, aciklama: "parça yok" };
  if (k.durum === "D1") {
    const parca = k.kalan;
    const toplam = sadeOzelDur(parca.reduce((a, b) => a + b, 0));
    if (isOzel(toplam)) return { destekler: [10], kararlar, aciklama: `parçalar ${parca.join("+")} → ${toplam} özel sayıyı oluşturur: yalnız 10. çakra` };
    const ana = tekHane(toplam);
    return { destekler: [...parca, ana], kararlar, aciklama: `özel değil: parçalar ${parca.join("-")} + Ana Kulvar ${ana}` };
  }
  // Gerçek kalan: özel oluşuma GİRMEYEN, özel olmayan parçaların sadeleşmişi (1–9). D3/tek-özel: yok.
  let gercek: number | null = null;
  if (k.durum === "D2" || k.durum === "D4") {
    const normal = k.kalan.filter((v) => !isOzel(v));
    if (normal.length) {
      const r = sadeOzelDur(normal.reduce((a, b) => a + b, 0));
      if (r >= 1 && r <= 9) gercek = r;
    }
  }
  const out = gercek !== null ? [10, gercek] : [10];
  return {
    destekler: out,
    kararlar,
    aciklama: `özel (${k.ozelOlusumlar.map((o) => o.sayi).join(", ")}): 10. çakraya tek destek${gercek !== null ? ` + gerçek kalan ${gercek}` : " (gerçek kalan yok)"}`,
  };
}

export type AltRef = { yol: string; gruplar: number[][]; kalan: number[]; kalanDeger: number | null; ozelSayilar: number[]; destekler: number[]; kararlar: Karar[] };

/** Alternatif özel sayı kombinasyonları — atama ağacıyla (üretimden bağımsız algoritma). */
export function alternatiflerRef(bilesen: number[]): AltRef[] {
  const v = bilesen.filter((x) => x > 0);
  if (v.length < 2) return [];
  const yollar = new Map<string, AltRef>();
  const gruplar: number[][] = [];
  const kalan: number[] = [];
  const bitir = () => {
    if (gruplar.length === 0) return; // en az bir özel grup
    const ozelGrup = gruplar.every((g) => isOzel(g.reduce((a, b) => a + b, 0)) && (g.length >= 2 || isOzel(g[0])));
    if (!ozelGrup) return;
    const toplamlar = gruplar.map((g) => g.reduce((a, b) => a + b, 0)).sort((a, b) => b - a);
    const kd = kalan.length ? sadeOzelDur(kalan.reduce((a, b) => a + b, 0)) : null;
    const yol = [...toplamlar, ...(kd !== null ? [kd] : [])].join("/");
    if (!yol || yollar.has(yol)) return;
    const ozelSayilar = [...toplamlar, ...(kd !== null && isOzel(kd) ? [kd] : [])];
    const destekler = [10, ...(kd !== null && kd >= 1 && kd <= 9 ? [kd] : [])];
    const kararlar: Karar[] = [];
    yollar.set(yol, { yol, gruplar: gruplar.map((g) => [...g]), kalan: [...kalan], kalanDeger: kd, ozelSayilar, destekler, kararlar });
  };
  const ata = (i: number) => {
    if (i === v.length) return bitir();
    for (const g of gruplar) { g.push(v[i]); ata(i + 1); g.pop(); }
    gruplar.push([v[i]]); ata(i + 1); gruplar.pop();
    if (!isOzel(v[i])) { kalan.push(v[i]); ata(i + 1); kalan.pop(); }
  };
  ata(0);
  // Ana sonucun kendi oluşumu hariç (Durum 2/3/tek: her özel parça kendi başına + normaller kalan;
  // Durum 4: seçilen özel çift + kalanlar; Durum 1: tüm parçalar kalan).
  const k = kulvarRef(v);
  const ozelCift = k.durum === "D4" ? k.ozelOlusumlar.find((o) => o.tur === "cift") : undefined;
  let kanonik: string;
  if (ozelCift) {
    kanonik = [ozelCift.sayi, ...(k.kalan.length ? [sadeOzelDur(k.kalan.reduce((a, b) => a + b, 0))] : [])].join("/");
  } else {
    const oz = v.filter(isOzel).sort((a, b) => b - a);
    const nr = v.filter((x) => !isOzel(x));
    kanonik = [...oz, ...(nr.length ? [sadeOzelDur(nr.reduce((a, b) => a + b, 0))] : [])].join("/");
  }
  yollar.delete(kanonik);
  const cmp = (a: string, b: string) => {
    const pa = a.split("/").map(Number), pb = b.split("/").map(Number);
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return pa.length - pb.length;
  };
  return [...yollar.values()].sort((a, b) => cmp(a.yol, b.yol));
}

/** Hayat Yolu (K1 s.51/58 + 03.10 sunum kararı) ve çakra desteği (eğitim notu s.2). */
export function hayatYoluRef(gg: number, aa: number, yyyy: number): { gosterim: string; destekler: number[] } {
  const t = rakamToplami(Number(`${String(gg).padStart(2, "0")}${String(aa).padStart(2, "0")}${yyyy}`));
  const gosterim = t === 10 ? "10/1" : t <= 11 ? String(t) : `${t}/${rakamToplami(t)}`;
  const [sol, sag] = gosterim.split("/").map(Number);
  const d: number[] = [];
  for (const ch of String(sol)) if (Number(ch) >= 1) d.push(Number(ch));
  if (sag !== undefined) d.push(sag >= 10 ? 10 : sag);
  return { gosterim, destekler: d.filter((x) => x >= 1) };
}
/** PİN (eğitim notu s.1) — 9 hane; çakraya ilk 8 hane. */
export function pinRef(gg: number, aa: number, yyyy: number): number[] {
  const k1 = tekHane(rakamToplami(gg)), k2 = tekHane(rakamToplami(aa)), k3 = tekHane(rakamToplami(yyyy));
  const k4 = tekHane(k1 + k2 + k3), k5 = tekHane(k1 + k4), k6 = tekHane(k1 + k2), k7 = tekHane(k2 + k3), k8 = tekHane(k6 + k7);
  const k9 = tekHane(k1 + k2 + k3 + k4 + k5 + k6 + k7 + k8);
  return [k1, k2, k3, k4, k5, k6, k7, k8, k9];
}
