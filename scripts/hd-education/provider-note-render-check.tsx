/**
 * HdComputedChartView `showProviderNote` sunum parametresi — sunucu tarafı render denetimi (DB/ağ yok).
 * Varsayılan (prop verilmez) → mevcut ekranlardaki "Hesaplama kaynağı: …" satırı AYNEN; `false` → yalnız bu satır yok,
 * BodyGraph ve diğer bölümler aynı. SENTETİK snapshot (repo fixture'ı + gerçek normalizasyon zinciri).
 * Çalıştır: npx tsx scripts/hd-education/provider-note-render-check.tsx
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HdComputedChartView } from "../../app/human-design/kayitli-haritalar/components/HdComputedChartView";
import type { HdComputedChart } from "../../lib/human-design/chart/computedChart";
import { syntheticEducationSnapshot } from "./syntheticSnapshot";

let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string) => { if (c) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.error(`  ✗ ${label}`); } };
const syn = syntheticEducationSnapshot("1869-11-22T02:50:39Z", 48.85, 2.35, 1);
const result = syn.computed_result as unknown as HdComputedChart;
const def = renderToStaticMarkup(createElement(HdComputedChartView, { result }));
const on = renderToStaticMarkup(createElement(HdComputedChartView, { result, showProviderNote: true }));
const off = renderToStaticMarkup(createElement(HdComputedChartView, { result, showProviderNote: false }));
ok(/Hesaplama kaynağı: RoxyAPI \(nodeType: true\)/.test(def), "varsayılan: mevcut sağlayıcı satırı AYNEN (kişisel HD ekranları değişmez)");
ok(def === on, "varsayılan ile showProviderNote=true çıktısı BİREBİR aynı");
ok(!/Hesaplama kaynağı/.test(off) && !/RoxyAPI/.test(off), "showProviderNote=false: satır yok, sağlayıcı adı yok");
const strip = (h: string) => h.replace(/<p class="text-\[11px\] text-slate-400">[\s\S]*?<\/p>/, "");
ok(strip(def) === off, "fark YALNIZ bu satır (BodyGraph, merkezler, kanallar, kapılar aynı)");
ok((off.match(/<svg/g) ?? []).length === (def.match(/<svg/g) ?? []).length && (off.match(/<svg/g) ?? []).length > 0, "BodyGraph svg sayısı aynı");
const legacy = renderToStaticMarkup(createElement(HdComputedChartView, { result: { ...result, provider: undefined } as unknown as HdComputedChart }));
ok(/Yaşam Sistemi dahili motoru/.test(legacy), "eski (sağlayıcısız) kayıt varsayılanı aynen");
console.log(`\nprovider-note render check: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
