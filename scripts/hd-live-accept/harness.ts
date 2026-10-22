/**
 * HD CANLI KABUL DÜZELTMELERİ (owner talimatı 2026-10-17) — sunucu + kaynak sözleşmesi.
 *   N — "Danışanı Oluştur ve Analiz Et": oluştur → MEVCUT Roxy hattı → kayıtlı harita (tek eylem; kredi güvenliği)
 *   L — Tek liste Türkçe alfabetik (tüm küme sıralanır, sonra sayfalanır; arama da alfabetik)
 *   D — Tek "Sil" (iki onay) → tüm HD kayıtları; Danışan Yolculuğu + diğer danışanlar korunur; çift gönderim güvenli
 *   S — Arayüz sözleşmesi (liste gizlenir, ikinci hesapla düğmesi yok, analizsizde sil yok, tarih kutusu yok,
 *       küçük rapor düğmesi, eski tekil silme yolları kapalı)
 *
 * GERÇEK yerel gömülü Postgres + GERÇEK route handler'ları + sahte Roxy (çağrılar SAYILIR; gerçek anahtar/ağ
 * YOK). Tüm veri SENTETİK. Çalıştırma: npx tsx scripts/hd-live-accept/harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TA, TB, BODYGRAPH, FIXTURE, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { boundBodygraphDataUrl } from "../hd-roxy/consistentFixture";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = path.resolve(__dirname, "../..");
const src = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const L1 = "trd-42-selcuklu";
const COLL = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

async function main() {
  // ══ S — Arayüz sözleşmesi (kaynak) ═════════════════════════════════════════
  section("S — Arayüz sözleşmesi");
  const page = src("app/human-design/danisanlar/page.tsx");
  const form = src("app/human-design/danisanlar/components/HdClientForm.tsx");
  const groups = src("app/human-design/danisanlar/components/HdAnalysisGroupList.tsx");
  const dialog = src("app/human-design/danisanlar/components/HdFullDeleteDialog.tsx");
  const modal = src("app/human-design/kayitli-haritalar/components/HdComputedChartModal.tsx");
  const detail = src("app/human-design/danisanlar/[id]/HdDanisanDetayContent.tsx");
  const legacy = src("app/human-design/kayitli-haritalar/page.tsx");
  const btn = src("app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx");
  const start = src("app/human-design/danisanlar/components/HdJourneyProfileStart.tsx");
  const charts = src("lib/human-design/api/chartsClient.ts");

  // 2026-10-20 owner GÖRSEL PASS (human-design-calisma-alani) + entegrasyon talimatı: "Yeni Hesaplama" ve
  // "Danışan Listesi" iki AYRI alan olarak yan yana. 10-17 "form ya da liste" düzeninin yerini alır; korunan amaç:
  // tek liste (bir kez render) ve formun içinde/altında ikinci liste yok (S2).
  ok((code(page).match(/<HdAnalysisGroupList\b/g) ?? []).length === 1 && (code(page).match(/<HdClientForm\b/g) ?? []).length === 1
    && /data-hd-workspace-client[\s\S]*?<HdClientForm[\s\S]*?<\/section>[\s\S]*?<HdAnalysisGroupList\b/.test(page),
    "S1 tek liste: ana liste bir kez render edilir; Yeni Hesaplama formu ayrı panelde (ikinci liste yok)");
  ok(!/HdAnalysisGroupList|HdJourneyClientPicker|HdClientListesi|fetchHdAnalysisGroups/.test(code(form)), "S2 formun içinde/altında danışan listesi, arama tablosu veya profil seçicisi yok");
  ok(/"Danışanı Oluştur ve Analiz Et"/.test(form) && !/Danışanı Oluştur ve Devam Et/.test(form), "S3 düğme metni: 'Danışanı Oluştur ve Analiz Et'");
  ok(/await analyze\(\{ hdClientId: r\.hdClientId/.test(form) && /computeRoxyChartSettled/.test(form) && /onAnalyzed\(\{ chartId: r\.id/.test(form),
    "S4 tek eylem: danışan oluşturulunca AYNI akışta mevcut Roxy hattı çağrılır ve harita doğrudan açılır");
  ok(!/router\.push\(`\/human-design\/danisanlar\/\$\{r\.hdClientId\}`\)/.test(code(form).split("async function openExisting")[0] ?? ""), "S5 başarılı yeni danışan akışında ara sayfaya (ikinci 'Hesapla') yönlendirme yok");
  ok(!/Haritasını Hesapla|Haritayı Hesapla/.test(code(form) + code(page)), "S6 yeni danışan ekranında 'Haritayı Hesapla' düğmesi yok");
  ok(/busyRef\.current\) return/.test(form) && /busyRef\.current = true/.test(form), "S7 çift tıklama kilidi (tek istek)");
  ok(/"Analizi Tekrar Dene"/.test(form) && /if \(created\) return retryAnalyze\(\)/.test(form) && /disabled=\{!!created \|\| saving\}/.test(form),
    "S8 hesap başarısızsa danışan TEKRAR oluşturulmaz; 'Analizi Tekrar Dene' yalnız hesabı ister; bilgiler korunur (alanlar kilitli)");
  ok(/code === "IN_PROGRESS"/.test(charts) && /computeRoxyChart\(clientId, "client", acknowledgedDuplicateKeys\)/.test(charts) && !/code === "(?!IN_PROGRESS)[A-Z_]+"[^\n]*computeRoxyChart\(/.test(charts),
    "S9 yeniden sorma YALNIZ 'hesap sürüyor' (IN_PROGRESS) durumunda; başka hatada kör ikinci istek yok");
  ok(/"Oluştur ve Analiz Et"/.test(start) && /computeRoxyChartSettled\(hdClientId\)/.test(start), "S10 Danışan Yolculuğu kaydı için 'Human Design Başlat' da tek eylemle analiz eder");

  ok(!/data-hd-first-analysis-toggle|İlk analiz tarihini göster|safeLocalStorageSetItem|showFirst/.test(code(groups)) && /clearLegacyFirstAnalysisPref/.test(groups),
    "S11 'İlk analiz tarihini göster' kutusu ve tercih kodu kaldırıldı (eski anahtar temizlenir)");
  ok(/\{r\.firstAnalysisAt \? <span data-hd-group-first>/.test(groups) && /data-hd-group-last/.test(groups) && /data-hd-group-count/.test(groups),
    "S12 ilk analiz + son analiz + analiz sayısı kayıt varsa HER ZAMAN gösterilir");

  ok(/useState<1 \| 2>/.test(dialog) && !/nameOk|data-hd-full-delete-name|"SİL"|Adım \{step\} \/ 3/.test(code(dialog)), "S13 silme: iki onay; ad / 'SİL' yazdırma yok, üçüncü onay yok");
  ok(dialog.includes("Bu danışana ait bütün Human Design analizleri, haritaları ve raporları kalıcı olarak silinecek. Danışan Yolculuğu&apos;ndaki ana kayıt korunacaktır. Devam etmek istiyor musunuz?")
    && dialog.includes("{name} için tüm Human Design kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?")
    && /Devam Et/.test(dialog) && /Evet, Sil/.test(dialog), "S14 owner'ın iki onay metni ve düğmeleri birebir");
  ok(/data-hd-full-delete-counts/.test(dialog) && /\{step === 1 \?[\s\S]*\{counts\}/.test(dialog), "S15 iki aşamada da doğru danışan adı + kesin kapsam (analiz/rapor sayısı)");
  ok((code(modal).match(/data-hd-delete-open/g) ?? []).length === 1 && !/Analizi Sil|Tamamen Sil|previewHdAnalysisDelete|deleteComputedChart/.test(code(modal)),
    "S16 analiz penceresinde TEK 'Sil' (Analizi Sil / Tamamen Sil seçimi yok)");
  ok(!/data-hd-danger-zone|HdFullDeleteDialog|Tamamen Sil/.test(code(detail)), "S17 danışan çalışma sayfasında (analiz öncesi dahil) büyük tehlikeli silme paneli yok");
  ok(!/handleDelete|deleteHdChart|"Sil"/.test(code(legacy)), "S18 eski 'Kayıtlı Haritalar' satırlarında ayrı 'Sil' yok (eski tekil silme yolu kapalı)");
  ok(!/HdFullDeleteDialog|data-hd-delete/.test(code(form) + code(start)), "S19 yeni danışan / başlatma akışında silme kontrolü yok");

  ok(/data-hd-word-download[\s\S]{0,400}inline-flex h-8[^"]*text-xs/.test(btn) && !/data-hd-word-download[\s\S]{0,400}bg-gradient/.test(btn) && /"Raporu Hazırla"/.test(btn) && /"Raporu İndir"/.test(btn),
    "S20 rapor düğmesi küçük (h-8, text-xs), nötr; parlak gradyan yok; kısa etiket");
  ok(/data-hd-actions/.test(modal) && !/h-9[^"]*uppercase/.test(modal.split("data-hd-actions")[1]?.split("{/* İçerik */}")[0] ?? "x") && /Kapat <span aria-hidden="true">✕<\/span>/.test(modal),
    "S21 işlem çubuğu: rapor, Sil, Kapat aynı küçük ölçek (büyük/büyük harf düğme yok)");

  // ══ Sunucu ═════════════════════════════════════════════════════════════════
  const env = await startHdFlowEnv({ port: 54441, dirName: "hd-live-accept-pgdata" });
  const su = env.su;
  const roxy = installFakeRoxy();
  try {
    const PERMS = { human_design: true, clients: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "LAA", TA, PERMS);
    const UB: Auth = await mkUser(su, "LAB", TB, PERMS);
    const R = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      clients: await import("../../app/api/hd/clients/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
      charts: await import("../../app/api/hd/charts/route"),
      analyses: await import("../../app/api/hd/analyses/route"),
      professional: await import("../../app/api/hd/reports/professional/route"),
    };
    const journey = (u: Auth, b: Json) => callRoute(R.journey.POST, "POST", u, b);
    const compute = (u: Auth, hd: string) => callRoute(R.roxy.POST, "POST", u, { client_id: hd, location_id: "client" });
    const list = (u: Auth, q = "", offset = 0, limit = 50) => callRoute(R.analyses.GET, "GET", u, undefined, `?${new URLSearchParams({ q, offset: String(offset), limit: String(limit) })}`);
    const getChart = (u: Auth, id: string) => callRoute(R.charts.GET, "GET", u, undefined, `?id=${id}`);
    const previewFull = (u: Auth, id: string) => callRoute(R.clients.GET, "GET", u, undefined, `?id=${id}&delete_preview=1`);
    const delFull = (u: Auth, id: string, a: number, r: number) => callRoute(R.clients.DELETE, "DELETE", u, undefined, `?id=${id}&expect_analyses=${a}&expect_reports=${r}`);
    const word = (u: Auth, chartId: string) => callRoute(R.professional.POST, "POST", u, { chartId, requestId: randomUUID(), commentary: "none", bodygraphPng: boundBodygraphDataUrl(BODYGRAPH, chartId, FIXTURE) });
    const n = async (sql: string, args: unknown[] = []) => Number((await su.query(sql, args)).rows[0].n);
    const newClient = (o: Json = {}) => ({ action: "create_new", ad: "Deniz", soyad: "Yıldız", dogum: "1991-03-03", birth_time: "07:15", birth_location_ref: L1, request_id: randomUUID(), ...o });

    // ══ N — Danışanı Oluştur ve Analiz Et ═══════════════════════════════════
    section("N — Danışanı Oluştur ve Analiz Et (sunucu hattı)");
    const c0 = roxy.state.calls;
    const hd0 = await n(`select count(*)::int n from public.human_design_clients where tenant_id=$1`, [TA]);
    const bad1 = await journey(UA, newClient({ dogum: "2023-02-29" }));
    const bad2 = await journey(UA, newClient({ birth_time: "25:61" }));
    const bad3 = await journey(UA, newClient({ birth_location_ref: "yok-boyle-yer" }));
    ok(bad1.status >= 400 && bad2.status >= 400 && bad3.status >= 400 && roxy.state.calls === c0 && (await n(`select count(*)::int n from public.human_design_clients where tenant_id=$1`, [TA])) === hd0,
      "N1 geçersiz tarih / saat / doğrulanmamış doğum yeri → kayıt yok, hesap başlamaz, Roxy 0", [bad1.status, bad2.status, bad3.status]);
    const reqId = randomUUID();
    const [k1, k2] = await Promise.all([journey(UA, newClient({ request_id: reqId })), journey(UA, newClient({ request_id: reqId }))]);
    const P = String(k1.json.hd_client_id);
    ok(k1.status === 200 && k2.status === 200 && P === String(k2.json.hd_client_id) && (await n(`select count(*)::int n from public.human_design_clients where tenant_id=$1`, [TA])) === hd0 + 1,
      "N2 çift tıklama (aynı istek kimliği) tek danışan oluşturur", [k1.json, k2.json]);
    const [x1, x2] = await Promise.all([compute(UA, P), compute(UA, P)]);
    const okOnes = [x1, x2].filter((x) => x.json.ok === true);
    const inProg = [x1, x2].filter((x) => x.json.code === "IN_PROGRESS");
    ok(roxy.state.calls === c0 + 1 && okOnes.length >= 1 && okOnes.length + inProg.length === 2, "N3 eşzamanlı çift 'Analiz Et' → yalnız 1 Roxy çağrısı (diğeri kayıtlıyı alır ya da 'sürüyor')", [x1.json, x2.json, roxy.state.calls - c0]);
    const A = String(okOnes[0]!.json.id);
    const again = await compute(UA, P);
    ok(again.json.ok === true && again.json.reused === true && String(again.json.id) === A && roxy.state.calls === c0 + 1, "N4 yeniden deneme / gecikmeli ikinci istek: tamamlanmış hesap YENİDEN KULLANILIR (Roxy yok)", again.json);
    const g = await getChart(UA, A);
    ok(g.status === 200 && (g.json.data as Json).client_id === P && !!(g.json.data as Json).computed_result, "N5 açılan harita doğru danışanın kayıtlı profesyonel haritası");
    const callsOpen = roxy.state.calls;
    await getChart(UA, A);
    await list(UA);
    ok(roxy.state.calls === callsOpen, "N6 kayıtlı analizi görüntülemek / listede gezinmek Roxy çağrısı üretmez");
    // Hesap başarısız → danışan korunur; yeniden deneme yalnız hesabı ister ve başarıda tek analiz oluşur.
    const kf = await journey(UA, newClient({ ad: "Hata", soyad: "Deneme", dogum: "1985-05-05" }));
    const PF = String(kf.json.hd_client_id);
    roxy.state.fail = "network";
    const failed = await compute(UA, PF);
    roxy.state.fail = "none";
    ok(failed.json.ok !== true && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [PF])) === 0 && (await n(`select count(*)::int n from public.human_design_clients where id=$1`, [PF])) === 1,
      "N7 Roxy hatası → sahte başarı yok, yarım analiz kaydı yok, danışan kaydı korunur", failed.json);
    // İstemci (computeRoxyChartSettled) gibi: "sürüyor" (20 sn'lik kilit penceresi) → kısa bekle, yeniden sor.
    // Pencere dolduğunda kayıtlı analiz yoksa (önceki çağrı başarısız) TEK yeni çağrı yapılır.
    let retry = await compute(UA, PF);
    const callsBeforeRetry = roxy.state.calls;
    for (let i = 0; retry.json.code === "IN_PROGRESS" && i < 6; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      retry = await compute(UA, PF);
    }
    ok(roxy.state.calls - callsBeforeRetry <= 1, "N8a hata sonrası yeniden deneme en çok 1 yeni ücretli çağrı (kilit penceresinde kör istek yok)", roxy.state.calls - callsBeforeRetry);
    ok(retry.json.ok === true && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [PF])) === 1 && (await n(`select count(*)::int n from public.human_design_clients where tenant_id=$1 and name ilike 'hata deneme'`, [TA])) === 1,
      "N8 'Analizi Tekrar Dene' → tek analiz; danışan tekrar oluşturulmadı", retry.json);
    const dupC = await journey(UA, newClient({ request_id: randomUUID() }));
    ok(dupC.status === 409 && dupC.json.code === "POSSIBLE_DUPLICATE_CLIENT", "N9 aynı kişi yeni istekle tekrar → mükerrer koruması (kayıt oluşmaz)", dupC.json);

    // ══ L — Alfabetik liste ═════════════════════════════════════════════════
    section("L — Türkçe alfabetik tek liste");
    const NAMES = ["Zeynep Ak", "ömer Bal", "Ali Can", "Çağrı Er", "İsmail Gül", "Işık Han", "Hasan İz", "Haluk Kum", "Şule Ok", "Ümit Su", "Osman Tan", "ali can"];
    const ids: Record<string, string> = {};
    for (const [i, nm] of NAMES.entries()) {
      const [ad, soyad] = nm.split(" ");
      const r = await journey(UA, newClient({ ad, soyad, dogum: `19${60 + i}-01-0${(i % 9) + 1}`, request_id: randomUUID(), acknowledged_duplicate_keys: [] }));
      ids[nm] = String(r.json.hd_client_id ?? "");
    }
    ok(Object.values(ids).every((v) => v && v !== "undefined"), "tohum: Türkçe karakterli 12 danışan (aynı ad farklı kişi dahil)", ids);
    const full = ((await list(UA, "", 0, 50)).json.rows ?? []) as Json[];
    const names = full.map((r) => String(r.name));
    ok(names.every((nm, i) => i === 0 || COLL.compare(names[i - 1]!, nm) <= 0), "L1 tüm liste Türkçe alfabetik", names);
    const pos = (nm: string) => full.findIndex((r) => r.hdClientId === ids[nm]);
    const order = ["Ali Can", "Çağrı Er", "Haluk Kum", "Hasan İz", "Işık Han", "İsmail Gül", "Osman Tan", "ömer Bal", "Şule Ok", "Ümit Su", "Zeynep Ak"];
    ok(order.every((nm, i) => i === 0 || pos(order[i - 1]!) < pos(nm)), "L2 Ç/Ğ/I/İ/Ö/Ş/Ü doğru yerde; büyük/küçük harf sırayı bozmaz", order.map((nm) => [nm, pos(nm)]));
    ok(pos("Ali Can") >= 0 && pos("ali can") >= 0 && pos("Ali Can") !== pos("ali can"), "L3 aynı isimli farklı kayıtlar ayrı satır (birleştirilmez)");
    const zBefore = pos("Zeynep Ak");
    await compute(UA, ids["Zeynep Ak"]!);
    const full2 = ((await list(UA, "", 0, 50)).json.rows ?? []) as Json[];
    ok(full2.findIndex((r) => r.hdClientId === ids["Zeynep Ak"]) === zBefore && zBefore > 0, "L4 yeni analiz danışanı listenin en üstüne taşımaz", { zBefore });
    const paged: string[] = [];
    for (let off = 0; ; off += 4) {
      const pg = ((await list(UA, "", off, 4)).json.rows ?? []) as Json[];
      paged.push(...pg.map((r) => String(r.key)));
      if (pg.length < 4) break;
    }
    ok(paged.join(",") === full2.map((r) => String(r.key)).join(","), "L5 sayfalama: önce TÜM küme sıralanır, sonra sayfalanır (4'erli sayfalar = tam sıra)");
    const sr = ((await list(UA, "a")).json.rows ?? []) as Json[];
    const sn = sr.map((r) => String(r.name));
    ok(sr.length >= 5 && sn.every((nm, i) => i === 0 || COLL.compare(sn[i - 1]!, nm) <= 0), "L6 arama sonuçları da alfabetik", sn);
    const zrow = full2.find((r) => r.hdClientId === ids["Zeynep Ak"]);
    ok(!!zrow?.firstAnalysisAt && !!zrow.lastAnalysisAt && zrow.analysisCount === 1, "L7 analizli satırda ilk/son analiz tarihi + sayı (sunucu)", zrow);
    ok(full2.find((r) => r.hdClientId === ids["Ali Can"])?.firstAnalysisAt === null, "L8 analizsiz yeni danışanda uydurma tarih yok");

    // ══ D — Tek Sil (tüm HD kayıtları) ══════════════════════════════════════
    section("D — Tek 'Sil' → tüm HD kayıtları; Danışan Yolculuğu korunur");
    await su.query(`update public.human_design_clients set birth_time='09:00' where id=$1`, [P]);
    const A2 = String((await compute(UA, P)).json.id);
    const w1 = await word(UA, A);
    const w2 = await word(UA, A2);
    ok(w1.json.ok === true && w2.json.ok === true && A2 !== A, "tohum: danışanın 2 analizi + 2 Word raporu");
    const JP = String(k1.json.journey_client_id);
    const twin = await journey(UA, newClient({ request_id: randomUUID(), dogum: "1992-04-04", acknowledged_duplicate_keys: [] }));
    const TWIN = String(twin.json.hd_client_id);
    const tb = await journey(UB, newClient());
    const TBP = String(tb.json.hd_client_id);
    await compute(UB, TBP);
    const tables = (await su.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not like 'human_design_%' order by 1`)).rows.map((r) => String(r.table_name));
    const snapshot = async () => {
      const out: Record<string, number> = {};
      for (const t of tables) out[t] = await n(`select count(*)::int n from public."${t}"`);
      return out;
    };
    const before = await snapshot();
    const pv = await previewFull(UA, P);
    ok(pv.status === 200 && pv.json.analyses === 2 && pv.json.reports === 2, "D1 onay kapsamı (salt okuma): 2 analiz + 2 Word raporu; önizleme hiçbir şey silmez", pv.json);
    ok((await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [P])) === 2, "D2 onay aşamaları (önizleme) veri silmez");
    const [d1, d2] = await Promise.all([delFull(UA, P, 2, 2), delFull(UA, P, 2, 2)]);
    ok([d1, d2].filter((d) => d.status === 200).length === 1, "D3 iki kez gönderilen silme: yalnız biri uygulanır", [d1.status, d2.status]);
    const d3 = await delFull(UA, P, 2, 2);
    ok(d3.status === 404, "D4 tekrar gönderim → 404 (veri bütünlüğü bozulmaz)", d3.json);
    ok((await n(`select count(*)::int n from public.human_design_clients where id=$1`, [P])) === 0 && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1 or id in ($2,$3)`, [P, A, A2])) === 0
      && (await n(`select count(*)::int n from public.human_design_reports where id in ($1,$2)`, [String(w1.json.id), String(w2.json.id)])) === 0, "D5 profil + TÜM analizler + TÜM Word raporları silindi");
    ok((await n(`select count(*)::int n from public.clients where id=$1`, [JP])) === 1, "D6 Danışan Yolculuğu ana kaydı korundu");
    const after = await snapshot();
    const changed = tables.filter((t) => after[t] !== before[t] && !/rate_limit|usage|audit|session/i.test(t));
    ok(changed.length === 0, "D7 HD dışındaki tüm tablolar (diğer modüller) değişmedi", changed);
    ok((await n(`select count(*)::int n from public.human_design_clients where id=$1`, [TWIN])) === 1 && (await n(`select count(*)::int n from public.human_design_charts where client_id=$1`, [TBP])) === 1,
      "D8 aynı isimli başka danışan ve başka tenant etkilenmedi");
    const again2 = ((await list(UA, "deniz yıldız")).json.rows ?? []) as Json[];
    ok(again2.some((r) => r.kind === "journey" && r.journeyClientId === JP) && !again2.some((r) => r.hdClientId === P), "D9 silme sonrası aynı merkezî danışan yeniden seçilebilir; silinen HD kaydı geri gelmez", again2);

    ok(roxy.state.external.length === 0, "harici ağ isteği yok", roxy.state.external.slice(0, 3));
  } finally {
    roxy.restore();
    await env.stop();
  }
  console.log(`\nHD CANLI KABUL: ${pass} PASS / ${fail} FAIL`);
  if (fail) { for (const f of fails) console.log(" -", f); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
