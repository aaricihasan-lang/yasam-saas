// KAMPANYA MERKEZİ — form içi KVKK aydınlatması (lib/campaign/visitor/dataNotice.ts) ↔ gerçek çalıştırıcı türü eşliği.
// Sağlayıcıya veri gönderen her teknikte form bunu söylemeli; yerel teknikte "gönderilmez" demeli; Klasik Numeroloji'de ad
// gittiği, HD / Atlas'ta gitmediği yazmalı. Ayrıntılı metin sayfası ve bağlantısı var olmalı; formda onay kutusu olmamalı.
// Çalıştırma: npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/data-notice.test.ts
import fs from "node:fs";
import path from "node:path";
import { CAMPAIGN_CATALOG } from "@/lib/campaign/catalog";
import { visitorRunnerFor } from "@/lib/campaign/visitor/runners";
import { CAMPAIGN_NOTICE_HREF, visitorDataNotice } from "@/lib/campaign/visitor/dataNotice";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const bad: string[] = [];
let provider = 0;
let local = 0;
for (const e of CAMPAIGN_CATALOG) {
  const r = visitorRunnerFor(e.key);
  if (!r) continue;
  const n = visitorDataNotice({ key: e.key, kind: r.kind });
  if (r.kind === "provider") provider++;
  else local++;
  if (n.sentToProvider !== (r.kind === "provider") || !n.text.includes("yurt dışındaki hesaplama sağlayıcısına aktarılabilir")) bad.push(e.key);
}
check("N01 her bağlı teknikte form bildirimi var ve sağlayıcıya aktarım olasılığını söyler (Owner kısa metni)", bad.length === 0 && provider > 0 && local > 0, bad.join("; "));
for (const [k, kind] of [["hd:bodygraph", "provider"], ["numk:core", "provider"], ["atlas:western.natal", "provider"], ["atlas:western.transit", "provider"], ["numb:analysis", "local"], ["numb:timing", "local"], ["numb:place", "local"]] as const) {
  check(`N02 yayın tekniği ${k} → ${kind}`, visitorRunnerFor(k)?.kind === kind, String(visitorRunnerFor(k)?.kind));
}
const page = `app${CAMPAIGN_NOTICE_HREF}/page.tsx`;
const pageCode = fs.existsSync(page) ? read(page).replace(/\/\*[\s\S]*?\*\//g, "") : "";
check("N03 ayrıntılı aydınlatma sayfası var ve kampanya kapısından bağımsız (yayın bayrağı / ortam okunmaz)", pageCode.length > 0 && !pageCode.includes("CAMPAIGN_PUBLIC_ENABLED") && !/process\.env|publicState/.test(pageCode));
const p = read(page);
for (const s of ["Veri sorumlusu ve iletişim", "hukuki sebepler", "Veriler kimlere aktarılır?", "Verilerin saklanması ve silinmesi", "Başkasına ait bilgiler", "KVKK kapsamındaki haklarınız", "5/2-c", "5/2-f", "9. maddesi", "30 günün sonunda", "Sinastri ve İlişki Analizi", "Bütüncül Numeroloji analizleri, harici hesaplama"]) {
  check(`N04 aydınlatma sayfası içerir: ${s}`, p.includes(s));
}
const app = read("app/ucretsiz-analiz/_ziyaretci/VisitorApp.tsx");
check("N05 form bildirimi formun içinde ve gönder düğmesinden önce", app.indexOf("<DataNotice tech={tech} />") > 0 && app.indexOf("<DataNotice tech={tech} />") < app.indexOf("Ücretsiz analizi başlat"));
check("N06 ziyaretçi formunda onay kutusu (checkbox) yok — aydınlatma rızaya bağlanmaz", !/type="checkbox"/.test(app));
check("N07 hukuk sayfaları gezinmesinde yeni sayfa var", read("lib/legal/legalMeta.ts").includes(CAMPAIGN_NOTICE_HREF));
const subs = read("lib/legal/subprocessors.ts");
check("N08 alt işleyici listesinde hesaplama sağlayıcısı ve Cloudflare (Turnstile) var", subs.includes("Hesaplama hizmet sağlayıcısı") && subs.includes("Cloudflare (Turnstile)"));
check("N09 kullanıcıya görünen metinlerde sağlayıcı marka adı yok", ![p, app, subs, read("lib/campaign/visitor/dataNotice.ts").replace(/^\s*\*.*$/gm, "")].some((t) => /roxy/i.test(t.replace(/\/\/.*$/gm, ""))));

const visible = [p, subs, read("lib/campaign/visitor/dataNotice.ts"), app, read("app/_campaign/VisitorCampaignView.tsx")].join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
check("N10 kullanıcıya görünen metin doğrulanmamış sözleşme / aktarım güvencesi iddia etmez (yalnız gereklilik kipi)", !/standart sözleşme|imzalan|güvence(ler)? sağlan|güvencelere dayanılarak|süreci yürütülmekte/i.test(visible));
check("N11 yer tutucu yayımlanmaz: köşeli parantez / tamamlanmalı ifadesi yok; ad ve adres yalnız legalIdentity doluysa", !/tamamlanmalı|\[Gerçek kişi|\[Hukuken uygun/i.test(pageCode) && pageCode.includes("id.legalName") && pageCode.includes("id.address"));

console.log(`\ndata-notice: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
