"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, CalendarCheck } from "lucide-react";
import { DEMO_CLIENTS } from "@/lib/demo/demoClients";
import { DemoGate } from "@/components/demo/DemoGate";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { initDemoSession, recordDemoClientView } from "@/lib/demo/demoSession";

const DEMO_MSG =
  "Bu bilgiler demo sürümünde gizlenmiştir. Tam içeriğe erişmek için uzman hesabı gereklidir.";

const TABS = [
  { id: "genel",      label: "Genel Bilgiler",      color: "#2563eb" },
  { id: "notlar",     label: "Notlar",               color: "#7c3aed" },
  { id: "randevular", label: "Randevular",            color: "#db2777" },
  { id: "taslar",     label: "Taşlar",               color: "#0891b2" },
  { id: "seanslar",   label: "Seanslar",             color: "#16a34a" },
  { id: "odevler",    label: "Ödevler",              color: "#dc2626" },
  { id: "analizler",  label: "Analizler",            color: "#9333ea" },
  { id: "yolculuk",   label: "✦ Danışan Yolculuğu", color: "#4f46e5" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Numeroloji (gerçek motor — Eylül Karaca, 1990-03-21) ────────────────────
const DEMO0_NUM = hesaplaNumeroloji({
  firstName: "Eylül",
  lastName: "Karaca",
  birthDate: "1990-03-21",
});
const DEMO0_KISISEL_YIL = calcKisiselYil("1990-03-21");

// ─── Demo-0 (Eylül Karaca) — tam açık içerik ─────────────────────────────────

function GenelContent() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Doğum Tarihi", value: "21.03.1990" },
          { label: "Burç", value: "Koç ♈" },
          { label: "Yaş", value: "36" },
          { label: "Telefon", value: "0532 111 2233" },
          { label: "Kan Grubu", value: "A Rh+" },
          { label: "Mizaç", value: "Safra" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Adres</p>
        <p className="mt-0.5 text-sm font-bold text-slate-900">Yıldız Mahallesi, Bağcılar / İstanbul</p>
      </div>
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3.5">
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-amber-600">Sağlık Notu</p>
        <p className="text-[13px] leading-relaxed text-slate-700">
          Stres kaynaklı baş ağrısı şikayeti mevcut. B vitamini eksikliği doktor onaylıdır.
          Uyku düzensizliği gözlemleniyor; sirkadyen ritim çalışması başlatıldı.
        </p>
      </div>
      <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3.5">
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-violet-600">Öneriler</p>
        <p className="text-[13px] leading-relaxed text-slate-700">
          Günlük 15 dk sabah meditasyonu · Saat 21:00'den sonra ekran kapalı ·
          Haftada 3×30 dk tempolu yürüyüş · B vitamini takviyesi (doktor önerisiyle)
        </p>
      </div>
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
        <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">Hedef</p>
        <p className="text-[13px] leading-relaxed text-slate-700">
          Enerji dengesi ve stres yönetimi · Boğaz çakrası bloğunu çözmek ·
          Duygusal şifa ve sezgisel farkındalık geliştirme
        </p>
      </div>
    </div>
  );
}

function NotlarContent() {
  const notes = [
    { date: "05.06.2026", text: "İlk görüşmede yüksek stres seviyesi saptandı. Sol omuz ve boyun bölgesinde enerji bloku mevcut. Ametist ve roze kuvars kombinasyonu önerildi. İlk izlenim: çok açık ve çalışmaya hazır." },
    { date: "12.06.2026", text: "Çakra dengeleme sonrası uyku kalitesi belirgin arttı. 'Sabahları daha zinde uyanıyorum' ifadesi kullandı. B vitamini takviyesine başlamış. Yürüyüş alışkanlığı kazanmaya çalışıyor." },
    { date: "15.06.2026", text: "Telefon görüşmesi: Meditasyon pratiği düzenlilik kazanıyor. 4-7-8 nefes tekniği stres anında çok iyi sonuç vermiş. Günlük yansıma defterini düzenli tutuyor." },
    { date: "19.06.2026", text: "Taş yerleşimi seansı çok olumlu geçti. Seans sonrası 2 saat derin uyku rapor edildi. Obsidyen evin giriş kapısına yerleştirildi." },
    { date: "20.06.2026", text: "WhatsApp: Ekran kullanım alışkanlığı değişmeye başlamış. Geceleri 21:30'da telefonu kapatıyor. Motivasyon yüksek, süreçten memnun." },
    { date: "22.06.2026", text: "Numeroloji analizi hazırlandı. Kişisel yıl 7 — içe dönüş ve derinleşme yılı. Hayat yolu 25/7 ile kombinasyonu güçlü analitik ve sezgisel enerji işaret ediyor." },
    { date: "23.06.2026", text: "Lapis lazuli eklendi. Toplantılarda iletişim güçlüğü çektiğini belirtti. Boğaz çakrası desteği için çalışma planı hazırlanacak." },
  ];
  return (
    <div className="space-y-2.5">
      {notes.map((n, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-700">{i + 1}</span>
            <span className="text-[11px] font-bold text-slate-400">{n.date}</span>
          </div>
          <p className="text-[13px] leading-relaxed text-slate-700">{n.text}</p>
        </div>
      ))}
    </div>
  );
}

function RandevularContent() {
  const apts = [
    { date: "05.06.2026 14:00", title: "İlk Değerlendirme Seansı",  status: "tamamlandi", notes: "Enerji haritası çıkarıldı. Stres seviyesi tespit edildi." },
    { date: "12.06.2026 15:30", title: "Çakra Dengesi Görüşmesi",   status: "tamamlandi", notes: "Çakra dengeleme uygulandı. Olumlu geri bildirim alındı." },
    { date: "03.07.2026 15:00", title: "Numeroloji & Taş Seansı",   status: "bekliyor",   notes: "Numeroloji analizi paylaşılacak. Lapis lazuli çalışması." },
    { date: "17.07.2026 14:30", title: "İlerleme Değerlendirmesi",  status: "bekliyor",   notes: "İkinci ay kapsamlı değerlendirme. Yolculuk takibi." },
    { date: "31.07.2026 16:00", title: "Aylık Kapanış Seansı",      status: "bekliyor",   notes: "Bir sonraki dönem planlaması ve hedef güncelleme." },
  ];
  return (
    <div className="space-y-2.5">
      {apts.map((a, i) => (
        <div key={i} className={`flex gap-3 rounded-xl border-l-4 border border-slate-200 bg-white p-3.5 shadow-sm ${
          a.status === "tamamlandi" ? "border-l-emerald-500" : "border-l-cyan-500"
        }`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-black text-slate-900">{a.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                a.status === "tamamlandi" ? "bg-emerald-100 text-emerald-700" : "bg-cyan-100 text-cyan-700"
              }`}>{a.status === "tamamlandi" ? "Tamamlandı" : "Yaklaşan"}</span>
            </div>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{a.date}</p>
            <p className="mt-1 text-[12px] text-slate-600">{a.notes}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaslarContent() {
  const stones = [
    { name: "Ametist",      chakra: "Üçüncü Göz · Taç", purpose: "Stres azaltma, uyku kalitesi",      note: "Her gece yastık altına. Dolunay'da ay ışığında şarj edilecek." },
    { name: "Roze Kuvars",  chakra: "Kalp",              purpose: "Duygusal şifa, sevgi frekansı",     note: "Gün içinde sol cepte taşınacak." },
    { name: "Obsidyen",     chakra: "Kök",               purpose: "Negatif enerji koruması",           note: "Evin giriş kapısı eşiğine ve çalışma masası köşesine yerleştirildi." },
    { name: "Sitrin",       chakra: "Solar Pleksus",     purpose: "Güven, motivasyon, bolluk",         note: "Çalışma masasında güneş ışığı alan yerde." },
    { name: "Ay Taşı",      chakra: "Sakral · Taç",      purpose: "Sezgi, hormonal denge",             note: "Dolunay gecesi su dolu kaseye bırakılarak şarj edilecek." },
    { name: "Lapis Lazuli", chakra: "Boğaz",             purpose: "İfade, iletişim, netlik",           note: "Önemli toplantı ve sunum günlerinde yanında taşınacak." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {stones.map((s) => (
        <div key={s.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 text-lg">💎</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-black text-slate-900">{s.name}</span>
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">{s.chakra}</span>
              </div>
              <p className="mt-0.5 text-[12px] font-semibold text-violet-700">{s.purpose}</p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">{s.note}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SeanslarContent() {
  const sessions = [
    { no: 1, date: "05.06.2026", status: "past",     note: "Enerji haritası çıkarıldı. Kök ve kalp çakrasında blok tespit edildi. Taş önerileri yapıldı." },
    { no: 2, date: "12.06.2026", status: "past",     note: "Çakra dengeleme seansı. Ametist ve roze kuvars yerleştirildi. Belirgin rahatlama gözlemlendi." },
    { no: 3, date: "19.06.2026", status: "past",     note: "Taş terapi seansı. Obsidyen eklendi. Seans sonrası 2 saat derin uyku rapor edildi." },
    { no: 4, date: "03.07.2026", status: "upcoming", note: "Numeroloji analizi paylaşımı. Kişisel yıl ve hayat yolu değerlendirmesi." },
    { no: 5, date: "17.07.2026", status: "upcoming", note: "İlerleme değerlendirme seansı. Lapis lazuli çalışması." },
    { no: 6, date: "31.07.2026", status: "upcoming", note: "Aylık kapanış ve yolculuk özeti. Bir sonraki dönem planlaması." },
  ];
  return (
    <div className="space-y-2.5">
      {sessions.map((s) => (
        <div key={s.no} className={`flex gap-3 rounded-xl border p-3.5 ${
          s.status === "past" ? "border-emerald-200 bg-emerald-50/50" : "border-cyan-200 bg-cyan-50/50"
        }`}>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${
            s.status === "past" ? "bg-emerald-600 text-white" : "bg-cyan-500 text-white"
          }`}>{s.no}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-black text-slate-900">Seans {s.no}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                s.status === "past" ? "bg-emerald-100 text-emerald-700" : "bg-cyan-100 text-cyan-700"
              }`}>{s.status === "past" ? "Tamamlandı" : "Yaklaşan"}</span>
              <span className="text-[11px] font-semibold text-slate-400">{s.date}</span>
            </div>
            <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{s.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OdevlerContent() {
  const homeworks = [
    { title: "Sabah Meditasyonu",   detail: "15 dk → Bilinçli nefes ve beden tarama",             period: "10.06 – 10.07.2026", status: "devam" },
    { title: "Günlük Yansıma",      detail: "Her gece yatmadan önce güne dair 3 gözlemi not et",  period: "10.06 – 10.07.2026", status: "devam" },
    { title: "4-7-8 Nefes Tekniği", detail: "Stres anında ve uyku öncesi uygulanacak",             period: "05.06 – 19.06.2026", status: "tamamlandı" },
    { title: "Ekran Kısıtlaması",   detail: "21:00'den sonra telefon ve bilgisayar kapalı",         period: "12.06 – devam",      status: "devam" },
    { title: "Ametist ile Uyuma",   detail: "Her gece yastık altına veya yanına koy",               period: "12.06 – devam",      status: "devam" },
    { title: "Yürüyüş Programı",    detail: "Haftada 3 kez 30 dk tempolu yürüyüş",                 period: "19.06 – devam",      status: "devam" },
  ];
  return (
    <div className="space-y-2.5">
      {homeworks.map((hw, i) => (
        <div key={i} className={`rounded-xl border p-3.5 ${
          hw.status === "tamamlandı" ? "border-emerald-200 bg-emerald-50/50" : "border-blue-200 bg-blue-50/30"
        }`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-black text-slate-900">{hw.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              hw.status === "tamamlandı" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
            }`}>{hw.status === "tamamlandı" ? "✓ Tamamlandı" : "Devam Ediyor"}</span>
          </div>
          <p className="mt-0.5 text-[12px] text-slate-600">{hw.detail}</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">{hw.period}</p>
        </div>
      ))}
    </div>
  );
}

function AnalizlerContent() {
  const chakras = [
    { name: "Kök",           pct: 65, color: "bg-red-500" },
    { name: "Sakral",        pct: 72, color: "bg-orange-500" },
    { name: "Solar Pleksus", pct: 58, color: "bg-yellow-500" },
    { name: "Kalp",          pct: 78, color: "bg-green-500" },
    { name: "Boğaz",         pct: 55, color: "bg-cyan-500" },
    { name: "Üçüncü Göz",   pct: 82, color: "bg-indigo-500" },
    { name: "Taç",           pct: 70, color: "bg-violet-500" },
  ];
  const lifeScores = [
    { label: "Fiziksel", score: 6.5 },
    { label: "Duygusal", score: 7.8 },
    { label: "Zihinsel", score: 7.5 },
    { label: "Ruhsal",   score: 7.0 },
  ];

  // Gerçek motor sonuçları
  const numItems = [
    { label: "Hayat Yolu",   value: DEMO0_NUM.hayatYolu.display,       note: "Analiz & Sezgi" },
    { label: "İfade Sayısı", value: DEMO0_NUM.ifadeSayisi.display,     note: "İletişim Gücü" },
    { label: "Kişisel Yıl",  value: DEMO0_KISISEL_YIL.display,        note: "İçe Dönüş Yılı" },
    { label: "Ana Kulvar",   value: DEMO0_NUM.anaKulvar.display,       note: "" },
    { label: "Yan Kulvar",   value: DEMO0_NUM.yanKulvar.display,       note: "" },
  ];

  return (
    <div className="space-y-5">
      {/* Çakra */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
        <h3 className="mb-3 text-sm font-black text-slate-900">Çakra Durumu</h3>
        <div className="space-y-2">
          {chakras.map((c) => (
            <div key={c.name} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[12px] font-bold text-slate-700">{c.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-2 rounded-full ${c.color}`} style={{ width: `${c.pct}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right text-[12px] font-black text-slate-700">%{c.pct}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Yaşam Skoru */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
        <h3 className="mb-3 text-sm font-black text-slate-900">Yaşam Skoru</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {lifeScores.map((ls) => (
            <div key={ls.label} className="rounded-lg border border-emerald-100 bg-white p-2.5 text-center">
              <span className="block text-xl font-black text-emerald-700">{ls.score}</span>
              <span className="text-[10px] font-bold text-slate-400">{ls.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-sm font-bold text-slate-600">
          <span className="text-2xl font-black text-slate-900">7.2</span> / 10 Genel Skor
        </p>
      </div>
      {/* Doğaltaş */}
      <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
        <h3 className="mb-3 text-sm font-black text-slate-900">Doğaltaş Analizi</h3>
        <div className="space-y-1.5">
          {[
            { role: "Ana Taş",       name: "Ametist",      detail: "Üçüncü Göz & Taç Çakrası aktivasyonu" },
            { role: "Destekleyici",  name: "Roze Kuvars",  detail: "Kalp Çakrası açılımı" },
            { role: "Koruyucu",      name: "Obsidyen",     detail: "Kök Çakra stabilizasyonu" },
            { role: "Güçlendirici",  name: "Lapis Lazuli", detail: "Boğaz Çakrası açılımı" },
          ].map((s) => (
            <div key={s.role} className="flex items-center gap-2 rounded-lg border border-cyan-100 bg-white px-3 py-2">
              <span className="w-24 shrink-0 text-[10px] font-black uppercase tracking-wide text-cyan-600">{s.role}</span>
              <span className="text-[13px] font-bold text-slate-800">{s.name}</span>
              <span className="ml-auto hidden text-[11px] text-slate-400 sm:block">{s.detail}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Numeroloji — gerçek motor */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h3 className="mb-3 text-sm font-black text-slate-900">Numeroloji Özeti</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {numItems.map((n) => (
            <div key={n.label} className="rounded-lg border border-amber-100 bg-white p-2.5 text-center">
              <span className="block text-xl font-black text-amber-700">{n.value || "—"}</span>
              <span className="mt-0.5 block text-[10px] font-bold text-slate-500">{n.label}</span>
              {n.note && <span className="block text-[10px] text-slate-400">{n.note}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function YolculukContent() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Başlangıç</span>
            <span className="text-lg font-black text-slate-900">05.06.2026</span>
          </div>
          <div className="flex-1 text-center text-2xl text-slate-300">→</div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] font-black uppercase tracking-wider text-violet-400">Tahmini Tamamlanma</span>
            <span className="text-lg font-black text-slate-900">Ağustos 2026</span>
          </div>
        </div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[12px] font-bold text-slate-600">İlerleme</span>
          <span className="text-[12px] font-black text-indigo-700">%50</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: "50%" }} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Tamamlanan Seans", value: "3", icon: "✅" },
          { label: "Kalan Seans",      value: "3", icon: "📅" },
          { label: "Aktif Ödev",       value: "5", icon: "📋" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl">{stat.icon}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{stat.value}</div>
            <div className="text-[11px] font-bold text-slate-400">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Bir Sonraki Hedef</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
          Boğaz çakrası güçlendirmesi ve duygusal denge çalışması. Lapis lazuli seansı
          ile iletişim blokunu çözmek. Temmuz sonunda kapsamlı analiz güncellemesi yapılacak.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Uzman Yorumu</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
          Eylül Hanım yolculuğuna güçlü bir başlangıç yaptı. İlk 3 seansta belirgin ilerleme
          kaydedildi. Uyku düzeni iyileşti, stres yönetimi gelişiyor. Ağustos sonunda tüm
          hedeflerin tamamlanması beklenmektedir.
        </p>
      </div>
    </div>
  );
}

// ─── Placeholder içerik (demo-0 dışı) ────────────────────────────────────────

function PlaceholderTabContent({ label }: { label: string }) {
  return (
    <div className="min-h-[160px] space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
      ))}
      <p className="text-center text-[11px] font-semibold text-slate-300">{label} verileri yüklendi</p>
    </div>
  );
}

// ─── Tab bileşeni ─────────────────────────────────────────────────────────────

function TabBtn({
  tab,
  activeTab,
  onSelect,
}: {
  tab: (typeof TABS)[number];
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  const isActive = activeTab === tab.id;
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      className={`shrink-0 rounded-xl px-3.5 py-2 text-[12px] font-black transition-all ${
        isActive
          ? "text-white shadow-md"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
      style={isActive ? { background: tab.color } : undefined}
    >
      {tab.label}
    </button>
  );
}

// ─── Helper — format date ─────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

function goreleSure(date: string | null): string {
  if (!date) return "";
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (diff < 1)   return "bugün";
  if (diff < 7)   return `${diff} gün önce`;
  if (diff < 30)  return `${Math.floor(diff / 7)} hafta önce`;
  if (diff < 365) return `${Math.floor(diff / 30)} ay önce`;
  return `${Math.floor(diff / 365)} yıl önce`;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DemoDanisanDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = (Array.isArray(params?.id) ? params.id[0] : params?.id) ?? "";
  const [activeTab, setActiveTab] = useState<TabId>("genel");

  const client = DEMO_CLIENTS.find((c) => c.id === clientId);
  const isOpen = clientId === "demo-0"; // ilk danışan tamamen açık

  // Demo session kayıt
  useEffect(() => {
    initDemoSession();
    if (clientId) recordDemoClientView(clientId);
  }, [clientId]);

  if (!client) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8]">
        <div className="rounded-2xl border border-white/80 bg-white/85 p-8 text-center shadow-lg">
          <p className="text-base font-black text-slate-700">Demo danışan bulunamadı.</p>
          <Link href="/danisan-yolculugu/liste" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Listeye Dön
          </Link>
        </div>
      </main>
    );
  }

  const fullName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();
  const initials = `${(client.ad ?? "")[0] ?? ""}${(client.soyad ?? "")[0] ?? ""}`.toUpperCase();
  const gorece = goreleSure(client.gorusme);

  function renderTabContent() {
    if (activeTab === "genel")      return isOpen ? <GenelContent />      : <PlaceholderTabContent label="Genel Bilgiler" />;
    if (activeTab === "notlar")     return isOpen ? <NotlarContent />     : <PlaceholderTabContent label="Notlar" />;
    if (activeTab === "randevular") return isOpen ? <RandevularContent /> : <PlaceholderTabContent label="Randevular" />;
    if (activeTab === "taslar")     return isOpen ? <TaslarContent />     : <PlaceholderTabContent label="Taşlar" />;
    if (activeTab === "seanslar")   return isOpen ? <SeanslarContent />   : <PlaceholderTabContent label="Seanslar" />;
    if (activeTab === "odevler")    return isOpen ? <OdevlerContent />    : <PlaceholderTabContent label="Ödevler" />;
    if (activeTab === "analizler")  return isOpen ? <AnalizlerContent />  : <PlaceholderTabContent label="Analizler" />;
    if (activeTab === "yolculuk")   return isOpen ? <YolculukContent />   : <PlaceholderTabContent label="Danışan Yolculuğu" />;
    return null;
  }

  const currentTab = TABS.find((t) => t.id === activeTab);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7fbff] via-[#f5f1ff] to-[#f5fff8] p-3.5 text-slate-950">

      {/* Geri link */}
      <div className="mb-3">
        <Link
          href="/danisan-yolculugu/liste"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-bold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Listeye Dön
        </Link>
      </div>

      {/* Demo-0 inceleme notu */}
      {isOpen && (
        <div className="mb-3 rounded-2xl border border-violet-200 bg-violet-50/90 px-4 py-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-base leading-none">📋</span>
            <div>
              <p className="text-[12px] font-black text-violet-900">İnceleme Notu — Demo Profil</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-violet-800">
                Bu danışan profili platform demo amacıyla oluşturulmuş örnek bir senaryodur.
                Tüm sekmeler ve veriler gerçek kullanımı birebir yansıtacak şekilde hazırlanmıştır.
                Numeroloji değerleri gerçek hesaplama motoru ile üretilmiştir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero card */}
      <section className="relative mb-3 flex items-center gap-3.5 overflow-hidden rounded-[22px] border border-white/80 bg-white/88 p-3.5 shadow-lg">
        <div className="pointer-events-none absolute -top-[45px] right-[70px] h-[120px] w-[120px] rounded-full bg-violet-300 opacity-40 blur-[36px]" />
        <div className="pointer-events-none absolute -bottom-[40px] -right-[25px] h-[105px] w-[105px] rounded-full bg-pink-300 opacity-45 blur-[34px]" />

        <div className="relative z-10 flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-blue-600 via-violet-600 to-pink-600 text-[26px] font-black text-white shadow-lg">
          {initials || "D"}
        </div>

        <div className="relative z-10 min-w-0 flex-1">
          <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-black text-indigo-700">
            {isOpen ? "Demo Danışan · Tam Görünüm" : "Demo Danışan · Kısıtlı Görünüm"}
          </span>
          <h1 className="mt-1.5 text-[22px] font-black text-slate-950 sm:text-[26px]">{fullName}</h1>
          <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
            {[
              { label: "Burç",     value: client.burc },
              { label: "Kan",      value: client.kan },
              { label: "Mizaç",    value: client.mizac },
              { label: "Son Görüşme", value: client.gorusme ? `${fmtDate(client.gorusme)}${gorece ? ` · ${gorece}` : ""}` : "—" },
            ].map(({ label, value }) => (
              value ? (
                <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
                  <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span>
                  <span className="block truncate text-[12px] font-bold text-slate-700">{value}</span>
                </div>
              ) : null
            ))}
          </div>
          {client.telefon && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {isOpen ? client.telefon : <span className="blur-sm select-none">{client.telefon}</span>}
            </div>
          )}
          {client.gorusme && (
            <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
              <CalendarCheck className="h-3.5 w-3.5 shrink-0" />
              Son görüşme: {fmtDate(client.gorusme)}
            </div>
          )}
        </div>
      </section>

      {/* Tabs */}
      <section className="rounded-[20px] border border-white/78 bg-white/92 px-3.5 pb-5 pt-3.5 shadow-lg">
        {/* Tab bar — mobilde yatay scroll */}
        <div className="relative mb-4">
          <div
            className="pointer-events-none absolute right-0 top-0 z-10 h-full w-14 bg-gradient-to-l from-white/95 to-transparent sm:hidden"
            aria-hidden
          />
          <div
            role="tablist"
            className="flex items-center gap-1.5 overflow-x-auto py-1 pb-1.5 pr-14 [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-x-visible sm:pb-1 sm:pr-0"
          >
            {TABS.map((tab) => (
              <TabBtn key={tab.id} tab={tab} activeTab={activeTab} onSelect={setActiveTab} />
            ))}
          </div>
        </div>

        {/* Tab content */}
        <DemoGate
          isProtected={!isOpen}
          message={DEMO_MSG}
          className="min-h-[200px]"
        >
          <div className="rounded-xl border border-slate-100 bg-white/60 p-4">
            {currentTab && (
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black text-white"
                  style={{ background: currentTab.color }}
                >
                  {currentTab.label}
                </span>
              </div>
            )}
            {renderTabContent()}
          </div>
        </DemoGate>
      </section>
    </main>
  );
}
