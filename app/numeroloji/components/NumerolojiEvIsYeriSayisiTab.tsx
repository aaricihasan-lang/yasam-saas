"use client";

import { useState } from "react";

// ─── Sabit yorumlar (kitap 2. seviye, değiştirilmez) ─────────────

const EV_YORUMLARI: Record<number, string> = {
  1: "Numeroloji sayısı 1 olan ev ya da ofisler, burada yaşayanları bağımsızlığa teşvik eder ve yeni başlangıçlar için mükemmel bir tercihtir. Numeroloji sayısı 1 olan konutlarda yaşayanlar sürekli meşgul olur. Hızlı bir tempoda zamanın çok hızlı aktığı bu ev ya da ofisler zaman zaman hukuki problemlerle de karşı karşıya kalabilir, dikkatli olmalarında fayda var!",
  2: "Numeroloji sayısı 2 olan evler samimiyete, yaratıcılığa ve sabırlı olmaya teşvik eder. Huzur ve sakinlik istiyorsanız numeroloji sayısı 2 olan evler tam size göre! Eğer çekingen bir yapınız varsa, bu numara daha çok evde vakit geçirmenizi sağlayacaktır.",
  3: "En şanslı numaradır! Numeroloji sayısı 3 olan ev ya da ofislerin en önemli özelliği iletişime açık olmasıdır. Bu numaradaki ev ve ofisler toplantılar için ideal, çocuk yetiştirmek için çok uygundur. Numeroloji sayısı 3 olan evlerin olumsuz yanıysa, genellikle ya çok kirli ya da çok disiplinli olması!",
  4: "Güvenli evlerin numarasıdır 4... Bu ev ya da ofislerde kendinizi güvenli hissedersiniz ve yaşadığınız / çalıştığınız yere bağlılığınız artar.",
  5: "Numeroloji sayısı 5 olan evler gezginler ve gece kuşları için idealdir... Bu evde yaşayanlar dışa dönük, iletişime açık, gezmeyi seven insanlardır.",
  6: "Genellikle güzel aileler, düzenli ev işleri ve evcil hayvanlar için mükemmel bir evdir. Tam bir sıcak yuvadır. Ancak numeroloji sayısı 6 olan evler dış özellikleriyle sahiplerini üzebilir, bahçeleri varsa daha fazla bakım isteyebilir.",
  7: "Sürekli doğayla iç içe mi olmak istiyorsunuz? O zaman numeroloji sayısı 7 olan evler tam size göre. Doğayı seven ve kişisel alana ihtiyaç duyanlar için mükemmel bir evdir! Bu ev veya ofislerin ön ya da arka taraflarında genellikle ağaç olur. Ancak 7 sayısının münzevi bir enerjisi bulunduğu için, yalnız yaşamayı sevmeyenlerin numeroloji sayısı 7 olan evlerden uzak durması gerekiyor.",
  8: "Bu sayı Çin'de para sayısıdır ve uzun vadede iyi getirisi olur. Bu numara ev sahibine/oturana güç getirir. 8 sayısı sonsuzluk sembolü şeklindedir ve 'ne ekersen onu biçersin' bu evler/ofisler için geçerlidir. Evinize ya da ofisinize yatırım yaparsanız her zaman karşılığını alırsınız. Küçük bir uyarı; bu ev ya da ofislere sigorta yaptırmayı unutmayın!",
  9: "Numeroloji sayısı 9 olan ev ya da ofisler, farklı uluslardan insanların bir araya geldiği lokasyonlardır. Eğer ev ise farklı uluslardan kişilerin oluşturduğu bir aile olabilir. Ya da uluslararası bir ofis için de uygun bir sayıdır. Ancak bu sayı misafirleri çok sevmez...",
};

const SAYI_RENK: Record<number, { chip: string; border: string; glow: string }> = {
  1: { chip: "from-rose-500 to-red-500",      border: "border-rose-200/70",   glow: "shadow-[0_8px_28px_rgba(244,63,94,0.32)]" },
  2: { chip: "from-orange-500 to-amber-400",  border: "border-orange-200/70", glow: "shadow-[0_8px_28px_rgba(249,115,22,0.30)]" },
  3: { chip: "from-amber-400 to-yellow-400",  border: "border-amber-200/70",  glow: "shadow-[0_8px_28px_rgba(251,191,36,0.30)]" },
  4: { chip: "from-lime-500 to-green-500",    border: "border-lime-200/70",   glow: "shadow-[0_8px_28px_rgba(132,204,22,0.30)]" },
  5: { chip: "from-emerald-500 to-teal-500",  border: "border-emerald-200/70",glow: "shadow-[0_8px_28px_rgba(16,185,129,0.30)]" },
  6: { chip: "from-teal-500 to-cyan-500",     border: "border-teal-200/70",   glow: "shadow-[0_8px_28px_rgba(20,184,166,0.30)]" },
  7: { chip: "from-sky-500 to-blue-500",      border: "border-sky-200/70",    glow: "shadow-[0_8px_28px_rgba(14,165,233,0.30)]" },
  8: { chip: "from-indigo-500 to-violet-500", border: "border-indigo-200/70", glow: "shadow-[0_8px_28px_rgba(99,102,241,0.32)]" },
  9: { chip: "from-violet-600 to-fuchsia-500",border: "border-violet-200/70", glow: "shadow-[0_8px_28px_rgba(139,92,246,0.35)]" },
};

// ─── Hesaplama ────────────────────────────────────────────────────

function sumDigits(n: number): number {
  return String(Math.abs(n))
    .split("")
    .reduce((acc, ch) => acc + Number(ch), 0);
}

type HesapSonuc = {
  toplam: number;
  sonuc: number;
  adimlar: string[];
};

function hesaplaEvSayisi(kapiNo: number, daireNo: number): HesapSonuc {
  const toplam = kapiNo + daireNo;
  const adimlar: string[] = [];
  let current = toplam;

  while (current > 9) {
    const digits = String(current).split("").map(Number);
    const next = digits.reduce((a, b) => a + b, 0);
    adimlar.push(`${digits.join(" + ")} = ${next}`);
    current = next;
  }

  return { toplam, sonuc: current, adimlar };
}

// ─── Style ────────────────────────────────────────────────────────

const inputClass =
  "h-9 w-full rounded-lg border border-violet-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50";

const labelClass = "mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500";

// ─── Component ───────────────────────────────────────────────────

export function NumerolojiEvIsYeriSayisiTab() {
  const [kapiNoRaw, setKapiNoRaw] = useState("");
  const [daireNoRaw, setDaireNoRaw] = useState("");
  const [not, setNot] = useState("");

  const kapiNo = parseInt(kapiNoRaw, 10);
  const daireNo = parseInt(daireNoRaw, 10);
  const isValid =
    kapiNoRaw.trim() !== "" &&
    daireNoRaw.trim() !== "" &&
    !isNaN(kapiNo) &&
    !isNaN(daireNo) &&
    kapiNo > 0 &&
    daireNo > 0;

  const sonuc = isValid ? hesaplaEvSayisi(kapiNo, daireNo) : null;
  const renkSet = sonuc ? (SAYI_RENK[sonuc.sonuc] ?? SAYI_RENK[9]) : null;
  const yorum = sonuc ? (EV_YORUMLARI[sonuc.sonuc] ?? null) : null;

  return (
    <div className="space-y-3">

      {/* ── Açıklama ──────────────────────────────────────────────── */}
      <div className="rounded-[12px] border border-violet-200/60 bg-gradient-to-r from-violet-50/80 to-fuchsia-50/60 px-4 py-2.5">
        <p className="text-xs font-black uppercase tracking-wider text-violet-600">Ev / İş Yeri Sayısı</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Kapı/apartman numarası ile daire numarası toplanarak ev veya iş yeri numeroloji sayısı hesaplanır.
        </p>
      </div>

      {/* ── Giriş alanları ────────────────────────────────────────── */}
      <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3 shadow-[0_0_10px_rgba(139,92,246,0.05)]">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Kapı / Apartman No</label>
            <input
              type="text"
              inputMode="numeric"
              value={kapiNoRaw}
              onChange={(e) => setKapiNoRaw(e.target.value.replace(/\D/g, ""))}
              placeholder="4"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Daire No</label>
            <input
              type="text"
              inputMode="numeric"
              value={daireNoRaw}
              onChange={(e) => setDaireNoRaw(e.target.value.replace(/\D/g, ""))}
              placeholder="11"
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-2">
          <label className={labelClass}>Not / Açıklama (opsiyonel)</label>
          <input
            type="text"
            value={not}
            onChange={(e) => setNot(e.target.value)}
            placeholder="Örn. Ana ofis, kiralık daire…"
            className={inputClass}
          />
        </div>
      </div>

      {/* ── Sonuç ─────────────────────────────────────────────────── */}
      {sonuc && renkSet ? (
        <>
          {/* Hesap adımları */}
          <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3 shadow-[0_0_10px_rgba(139,92,246,0.05)]">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-violet-600">Hesap Adımları</p>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-black text-slate-700">
              {/* Kapi + Daire = Toplam */}
              <span className="rounded-md bg-violet-100 px-2 py-0.5 text-violet-800">{kapiNo}</span>
              <span className="text-slate-400">+</span>
              <span className="rounded-md bg-fuchsia-100 px-2 py-0.5 text-fuchsia-800">{daireNo}</span>
              <span className="text-slate-400">=</span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{sonuc.toplam}</span>

              {/* Sadeleştirme adımları */}
              {sonuc.adimlar.map((adim, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="text-slate-300">→</span>
                  <span className="text-[11px] font-semibold text-slate-500">{adim}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Büyük sonuç kartı */}
          <div className={`relative min-w-0 overflow-hidden rounded-[14px] border ${renkSet.border} bg-white/95 p-4 ${renkSet.glow}`}>
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-[0.06] blur-2xl" aria-hidden />
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Ev / İş Yeri Sayısı</p>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-4xl font-black text-white shadow-lg ${renkSet.chip}`}
              >
                {sonuc.sonuc}
              </span>
              <div className="min-w-0">
                {not.trim() && (
                  <p className="mb-0.5 text-[11px] font-semibold text-slate-400">{not.trim()}</p>
                )}
                <p className="text-xs text-slate-500 leading-snug">
                  No:{kapiNo} · D:{daireNo}
                  {sonuc.toplam !== sonuc.sonuc ? ` → ${sonuc.toplam} → ${sonuc.sonuc}` : ` → ${sonuc.sonuc}`}
                </p>
              </div>
            </div>
          </div>

          {/* Yorum */}
          {yorum && (
            <div className="min-w-0 rounded-[12px] border border-violet-200/70 bg-white/90 p-3 shadow-[0_0_10px_rgba(139,92,246,0.05)]">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-violet-600">
                {sonuc.sonuc} Sayısının Anlamı
              </p>
              <p className="text-xs leading-[1.75] text-slate-700">{yorum}</p>
            </div>
          )}

          {/* Nötr not */}
          <div className="flex min-w-0 items-start gap-2 rounded-[10px] border border-slate-200/80 bg-slate-50/80 px-3 py-2">
            <span className="mt-px shrink-0 text-slate-400 text-sm">ℹ</span>
            <p className="text-[10px] leading-[1.6] text-slate-500">
              Hesap kitaptaki yönteme göre yapılmıştır. Yorumlama uzman tarafından değerlendirilerek danışana aktarılmalıdır.
            </p>
          </div>
        </>
      ) : (
        <div className="min-w-0 rounded-[12px] border-2 border-dashed border-violet-200/60 bg-white/60 px-4 py-8 text-center">
          <p className="text-xs font-semibold text-slate-400">
            Kapı ve daire numarasını girerek hesaplamayı başlatın.
          </p>
        </div>
      )}
    </div>
  );
}
