/**
 * ÜYE YÖNETİMİ FAZ 2 — SAF MANTIK + KAYNAK SÖZLEŞMESİ harness (DB/ağ YOK).
 * Çalıştır: npx tsx scripts/uye-yonetimi-faz2/unit.harness.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  YH_SOURCE_MODULE_GATES,
  filterByYhScope,
  isYhSourceModuleInScope,
  resolveYhModuleScope,
} from "../../lib/yasam-hafizasi/moduleScope";
import { YH_SOURCE_MODULES } from "../../lib/yasam-hafizasi/config";
import { YH_CLIENT_INDEX_SOURCES } from "../../lib/yasam-hafizasi/client/clientSources";
import { MODULE_ALIASES } from "../../lib/auth/moduleAccessCore";
import { passwordPolicyError, REGISTER_PASSWORD_MIN, validateRegisterBody } from "../../lib/auth/registerValidation";
import { NEW_PASSWORD_MIN_LENGTH } from "../../lib/auth/loginThrottle";
import { MIN_PASSWORD_LENGTH } from "../../lib/admin/accountSessionControls";
import {
  DEFAULT_MEMBER_LIST_QUERY,
  MEMBER_LIST_RETURN_KEY,
  foldTr,
  memberListQueryToSearch,
  memberListReturnHref,
  parseMemberCounts,
  parseMemberListQuery,
  roleMatchFromQuery,
} from "../../lib/admin/memberListQuery";
import { classifyFetchFailure, FETCH_FAILURE_COPY } from "../../lib/admin/fetchState";
import { ADMIN_MODULE_UI_KEYS, ADMIN_MODULE_UI_LABELS, PAYMENT_STATUS_LABELS } from "../../lib/admin/userManagement";
import { APPROVAL_LABELS, PAYMENT_LABELS_UI, ROLE_LABELS } from "../../components/admin/members/MemberBadges";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const sp = (qs: string) => new URLSearchParams(qs);

// ─── Yaşam Hafızası kapsamı ────────────────────────────────────────────────────
console.log("\n[YH] Aktif kapsam = module_permissions (tek kaynak)");
const allYh = [...YH_SOURCE_MODULES, ...YH_CLIENT_INDEX_SOURCES.map((s) => s.sourceModule), "human_design"];
const unmapped = allYh.filter((m) => !(m in YH_SOURCE_MODULE_GATES) && m !== "yebs");
ok(unmapped.length === 0, `her Hafıza kaynağı bir modül kapısına eşli (eşlemesiz: ${unmapped.join(",") || "yok"}; yebs admin-only)`);
const gateKeys = new Set(Object.keys(MODULE_ALIASES));
ok(Object.values(YH_SOURCE_MODULE_GATES).flat().every((g) => gateKeys.has(g)), "eşlenen tüm kapılar gerçek ModuleGateKey");
ok(Object.values(YH_SOURCE_MODULE_GATES).flat().every((g) => (ADMIN_MODULE_UI_KEYS as readonly string[]).includes(g)), "eşlenen tüm kapılar admin panelinden yönetilebilir");
const AB = resolveYhModuleScope("expert", { numerology: true, reflexology: true });
ok([...AB.activeSourceModules].sort().join(",") === "numeroloji,refleksoloji", "A+B açık → YH A+B");
const ABC = resolveYhModuleScope("expert", { numerology: true, reflexology: true, stones: true });
ok(ABC.activeSourceModules.has("dogaltas") && ABC.activeSourceModules.size === 3, "C açılınca (ayrı ayar yok) → YH A+B+C");
const AC = resolveYhModuleScope("expert", { numerology: true, reflexology: false, stones: true });
ok(!AC.activeSourceModules.has("refleksoloji") && AC.activeSourceModules.size === 2, "B kapatılınca → YH A+C");
const rows = [{ module: "numeroloji" }, { module: "refleksoloji" }, { module: "dogaltas" }];
ok(filterByYhScope(AC, rows).length === 2 && rows.length === 3, "filtre sunumdan çıkarır; kaynak dizi (kayıtlar) değişmez");
ok(resolveYhModuleScope("expert", { dogaltas: true, kupa: true, biyoenerji: true, refleksoloji: true }).activeSourceModules.size === 4, "TR alias'lar (dogaltas, kupa, biyoenerji, refleksoloji) kapsamı açar");
ok(resolveYhModuleScope("expert", { hacamat_terapi: true }).activeSourceModules.has("kupa_hacamat"), "hacamat_terapi alias → kupa_hacamat");
const admin = resolveYhModuleScope("admin", {});
ok(isYhSourceModuleInScope(admin, "yebs") && isYhSourceModuleInScope(admin, "dogaltas"), "admin → tüm modüller");
ok(!isYhSourceModuleInScope(resolveYhModuleScope("expert", { numerology: true }), "yebs"), "yebs (eşlemesiz) uzman için fail-closed");
ok(!isYhSourceModuleInScope(resolveYhModuleScope("expert", {}), "numeroloji"), "0 modül → boş kapsam");
ok(resolveYhModuleScope("expert", { clients: true }).activeSourceModules.has("danisan_seans") && !resolveYhModuleScope("expert", { clients: true }).activeSourceModules.has("randevu"), "danışan kayıtları clients, randevu appointments kapısında");
ok(resolveYhModuleScope("expert", { yasam_hafizasi: true }).activeSourceModules.size === 0, "yasam_hafizasi izni tek başına modül kapsamı AÇMAZ (erişim ≠ kapsam)");
for (const f of [
  "app/api/yasam-hafizasi/search/route.ts",
  "app/api/yasam-hafizasi/client-search/route.ts",
  "app/api/clients/[id]/yasam-hafizasi/search/route.ts",
]) {
  const src = read(f);
  const scopeIdx = src.indexOf("resolveYhModuleScope(profile?.role, profile?.module_permissions)");
  const facetIdx = src.search(/compute(?:Tenant|Client)?Facets\(/);
  ok(scopeIdx > 0 && facetIdx > scopeIdx && /filterByYhScope\(scope/.test(src), `${f.split("/").slice(-3).join("/")}: kapsam facet/sonuçtan ÖNCE uygulanır`);
}
const snapRoute = read("app/api/clients/[id]/yasam-hafizasi/snapshots/route.ts");
const snapStore = read("lib/yasam-hafizasi/client/snapshotStore.ts");
ok(/isSourceModuleInScope:/.test(snapRoute) && /ctx\.isSourceModuleInScope && !ctx\.isSourceModuleInScope\(cand\.sourceModule\)/.test(snapStore), "yeni snapshot yalnız aktif kapsamdan (kapsam dışı → skipped)");
const scopeSrc = read("lib/yasam-hafizasi/moduleScope.ts");
ok(!/\.delete\(|DELETE FROM|deindex/i.test(scopeSrc.replace(/\/\*[\s\S]*?\*\//g, "")), "kapsam modülü hiçbir kaydı SİLMEZ");
const yhUi = [
  "app/yasam-hafizasi",
  "components/yasam-hafizasi",
].flatMap((d) => {
  try {
    return readdirSync(path.join(process.cwd(), d), { recursive: true }).map((f) => path.join(d, String(f)));
  } catch {
    return [];
  }
}).filter((f) => /\.tsx?$/.test(f));
ok(yhUi.every((f) => !/module_permissions|moduleSelection|enabledModules/.test(read(f))), "YH arayüzünde ikinci/manuel modül seçim durumu YOK");
const approveModal = read("app/admin/users/[id]/page.tsx");
ok(!/Yaşam Hafızası için/.test(approveModal), "onay modalında ayrı 'Yaşam Hafızası modülleri' seçimi YOK");

// ─── MEM-012 Register ─────────────────────────────────────────────────────────
console.log("\n[MEM-012] Kayıt doğrulama");
const base = { fullName: "Ad Soyad", email: "a@b.co", password: "abcd123456" };
ok(validateRegisterBody(base).ok, "geçerli kayıt");
ok(passwordPolicyError("abcdefghij") === "weak_password" && passwordPolicyError("1234567890") === "weak_password" && passwordPolicyError("abcd1234") === "weak_password", "parola: harf+rakam+10 (8 karakter artık yetmez)");
ok(passwordPolicyError("şifrem12345") === null, "Türkçe harf + rakam kabul");
ok(REGISTER_PASSWORD_MIN === NEW_PASSWORD_MIN_LENGTH && REGISTER_PASSWORD_MIN === MIN_PASSWORD_LENGTH, "parola minimumu main (NEW_PASSWORD_MIN_LENGTH / MIN_PASSWORD_LENGTH) ile birebir");
ok(passwordPolicyError("a".repeat(125) + "1234") === "weak_password", "129 karakter parola reddedilir");
ok(passwordPolicyError("a@b.co1", "a@b.co1") === "weak_password", "e-posta ile aynı parola reddedilir");
const hp = validateRegisterBody({ ...base, website: "x" });
ok(hp.ok && hp.bot === true, "honeypot dolu → bot=true");
ok(!validateRegisterBody({ ...base, website: 5 }).ok, "honeypot tipi yanlış → reddedilir");
ok(!validateRegisterBody({ ...base, role: "admin" }).ok, "bilinmeyen alan reddedilir");
const n = validateRegisterBody({ fullName: "  Ad   Soyad ", email: " A@B.CO ", password: " abcd123456 " });
ok(n.ok && n.value.fullName === "Ad Soyad" && n.value.email === "a@b.co" && n.value.password === "abcd123456", "normalize: ad boşluk, e-posta küçük harf, parola kırpılır (giriş ile tutarlı)");
const regRoute = read("app/api/register/route.ts");
ok(regRoute.indexOf("reg-ip") < regRoute.indexOf("readLimitedJsonBody(req)"), "IP rate limit doğrulamadan ÖNCE (her deneme sayılır)");
ok(regRoute.indexOf("reg-email") > 0 && regRoute.indexOf("reg-email") < regRoute.indexOf("rpc(\"hash_password\""), "rate limit bcrypt hash'ten ÖNCE");
ok(!/error\.message/.test(regRoute), "kayıt: ham DB hatası dönmez");
const dbRl = read("lib/security/dbRateLimit.ts");
ok(/createHmac\("sha256"/.test(dbRl) && /mode: "memory"/.test(dbRl), "kova HMAC'li; RPC yoksa bellek-içi fallback AÇIKÇA işaretli");

// ─── MEM-015 Admin cookie ─────────────────────────────────────────────────────
console.log("\n[MEM-015] Admin kabuğu");
const layout = read("app/admin/layout.tsx");
const proxy = read("proxy.ts");
const sess = read("app/api/auth/admin-session/route.ts");
ok(/resolveAdminShellUserId\(getServerDb\(\), token\)/.test(layout) && !/yasam_admin_id/.test(layout), "layout token'ı API kuralıyla doğrular (UUID cookie'ye güvenmez)");
ok(/yasam_admin_session/.test(proxy) && !/get\("yasam_admin_id"\)/.test(proxy), "proxy yeni oturum cookie'sine bakar");
ok(/set\(ADMIN_SESSION_COOKIE, sessionToken/.test(sess) && /LEGACY_ADMIN_ID_COOKIE, ""/.test(sess), "admin-session: token cookie + eski UUID cookie temizliği");
const shell = read("lib/auth/adminShellSession.ts");
ok(/httpOnly: true/.test(shell) && /sameSite: "strict"/.test(shell) && /secure: isProduction/.test(shell) && /path: "\/"/.test(shell), "cookie bayrakları: HttpOnly, SameSite=Strict, Secure(prod), Path=/");

// ─── MEM-016 Liste sorgusu ────────────────────────────────────────────────────
console.log("\n[MEM-016] Liste sorgusu / Türkçe katlama");
ok(foldTr("ŞİŞGİN") === "sisgin" && foldTr("Arıcı") === "arici" && foldTr("ARICI") === "arici" && foldTr("İlknur IŞIK") === "ilknur isik", "Türkçe katlama (Ş/İ/I/ı)");
ok(foldTr("ÇĞÖÜ çğöü") === "cgou cgou", "Ç/Ğ/Ö/Ü katlama");
ok(roleMatchFromQuery("uzman") === "expert" && roleMatchFromQuery("UZM") === "expert" && roleMatchFromQuery("Yönetici") === "admin" && roleMatchFromQuery("admin") === "admin", "rol kelimesi eşlemesi");
ok(roleMatchFromQuery("uz") === null && roleMatchFromQuery("ahmet") === null && roleMatchFromQuery("uzman ali") === null, "kısa/isim/çok kelime rol sayılmaz");
const pq = parseMemberListQuery(sp("q=ali&approval=pending&active=passive&role=expert&payment=paid&page=3&pageSize=50&view=members"));
ok(pq.ok && pq.value.page === 3 && pq.value.pageSize === 50 && pq.value.approval === "pending", "URL → filtre");
ok(pq.ok && memberListQueryToSearch(pq.value) === "q=ali&approval=pending&active=passive&role=expert&payment=paid&page=3&pageSize=50", "filtre → URL (varsayılanlar yazılmaz)");
ok(memberListQueryToSearch(DEFAULT_MEMBER_LIST_QUERY) === "", "varsayılan → temiz URL");
for (const bad of ["approval=x", "page=0", "page=1.5", "pageSize=15", "view=all", `q=${"a".repeat(121)}`]) {
  ok(!parseMemberListQuery(sp(bad)).ok, `geçersiz sorgu reddedilir (${bad.slice(0, 20)})`);
}
const cnt = parseMemberCounts({ experts_total: "9", pending: 2, approved_active: 4, archived: 1, rejected: 2, admins: -3 });
ok(cnt.experts_total === 9 && cnt.admins === 0, "sayaç ayrıştırma (negatif → 0)");
const mig2 = read("supabase/migrations/20270130000000_admin_member_phase2.sql");
ok(/'İIıŞşĞğÜüÖöÇçÂâÎîÛû', 'iiissgguuooccaaiiuu'/.test(mig2), "SQL katlama eşlemesi TS ile aynı");
ok(/replace\(replace\(replace\(v_q, '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\)/.test(mig2), "LIKE joker kaçışı");
ok(/LIMIT v_limit OFFSET v_offset/.test(mig2) && /LEAST\(GREATEST\(coalesce\(p_limit, 20\), 1\), 100\)/.test(mig2), "sunucu sayfalama + üst sınır 100");

// ─── MEM-018 Terminoloji ──────────────────────────────────────────────────────
console.log("\n[MEM-018] Terminoloji");
ok(ROLE_LABELS.expert === "Uzman" && ROLE_LABELS.admin === "Yönetici", "rol etiketleri Türkçe");
ok(APPROVAL_LABELS.pending === "Onay Bekliyor" && APPROVAL_LABELS.approved === "Onaylandı", "onay etiketleri");
ok(PAYMENT_LABELS_UI.exempt === "Ödemeden Muaf" && PAYMENT_STATUS_LABELS.exempt === "Ödemeden Muaf", "ödeme muafiyeti ≠ güvenlik istisnası (ayrı kelime)");
const listPage = read("app/admin/users/page.tsx");
const detailPage = read("app/admin/users/[id]/page.tsx");
const uiText = listPage + detailPage + read("components/admin/members/MemberBadges.tsx");
ok(!/>\s*(expert|admin)\s*</.test(uiText) && !/"expert" : "admin"|isAdmin \? "admin" : "expert"/.test(uiText), "ham rol enum'u (expert/admin) UI metni olarak gösterilmez");
ok(!/label: "Kayıt"|"Kayıt"\s*}/.test(listPage) && /label="Onay Durumu"/.test(listPage), "\"Kayıt\" filtresi → \"Onay Durumu\"");
ok(!/Hazır Presetler/.test(detailPage) && /Hazır Ayarlar/.test(detailPage), "\"Hazır Presetler\" → \"Hazır Ayarlar\"");
ok(!/Kullanıcı detay\b/.test(detailPage) && /Uzman Detayı/.test(detailPage), "\"Kullanıcı detay\" → \"Uzman/Yönetici Detayı\"");
ok(!/\b(Deneme|Pro paket|trial|Trial)\b/.test(listPage.replace(/\/\/.*$/gm, "")) && !/"Deneme"|>Deneme<|Pro paket/.test(detailPage), "Deneme/Pro ürün metni geri gelmedi");
ok(ADMIN_MODULE_UI_KEYS.every((k) => !/_/.test(ADMIN_MODULE_UI_LABELS[k])), "modül etiketlerinde teknik anahtar yok");
ok(ADMIN_MODULE_UI_LABELS.human_design === "Human Design" && /Kozmik/.test(ADMIN_MODULE_UI_LABELS.cosmic_calendar) && /Kupa/.test(ADMIN_MODULE_UI_LABELS.cupping), "HD / Kozmik / Kupa ayrı ve doğru etiketli");

// ─── MEM-019 Hata durumları ───────────────────────────────────────────────────
console.log("\n[MEM-019] Hata / boş durumları");
ok(classifyFetchFailure(401) === "unauthorized" && classifyFetchFailure(403) === "forbidden" && classifyFetchFailure(404) === "not_found" && classifyFetchFailure(500) === "server" && classifyFetchFailure(null) === "network" && classifyFetchFailure(400) === "invalid", "HTTP → ayrık durum");
ok(FETCH_FAILURE_COPY.server.retry && FETCH_FAILURE_COPY.network.retry && !FETCH_FAILURE_COPY.forbidden.retry, "yalnız geçici hatalarda \"Tekrar Dene\"");
ok(Object.values(FETCH_FAILURE_COPY).every((c) => !/error|exception|stack|PGRST|supabase/i.test(c.message)), "kullanıcı metninde teknik hata yok");
ok(/list\.kind === "error" \?\s*\(\s*<ErrorPanel/.test(listPage) && /Bu arama\/filtrelerle eşleşen üye yok/.test(listPage), "liste: hata ≠ boş sonuç");
ok(/FETCH_FAILURE_COPY\[loadFailure/.test(detailPage) && !/Üye bulunamadı<\/p>/.test(detailPage), "detay: 401/403/500 artık \"Üye bulunamadı\" değil");
ok(/Güvenlik verisi alınamadı/.test(detailPage), "güvenlik verisi hatası sessiz değil");

// ─── MEM-020 / Cache ──────────────────────────────────────────────────────────
console.log("\n[MEM-020] Gereksiz çağrı + cache");
const notif = read("shared/DashboardNotifications.tsx");
ok(/pathname === "\/admin" \|\|\s*\(pathname \?\? ""\)\.startsWith\("\/admin\/"\)/.test(notif), "/admin sayfalarında /api/appointments çağrılmaz");
for (const f of ["app/api/admin/users/route.ts", "app/api/admin/users/archive/route.ts", "app/api/admin/users/[id]/audit/route.ts", "app/api/admin/users/[id]/payment-history/route.ts", "app/api/admin/users/[id]/security-events/route.ts"]) {
  const src = read(f);
  ok(/no-store/.test(src) && !/Cache-Control"?:\s*"public/.test(src) && !/error: error\.message/.test(src), `${f.split("/").slice(-2).join("/")}: no-store + ham hata yok`);
}

// ─── Aksiyon hiyerarşisi / erişilebilirlik ───────────────────────────────────
console.log("\n[UX] Aksiyon hiyerarşisi + erişilebilirlik");
ok(/Tehlikeli İşlemler/.test(detailPage) && /Hesap Yönetimi/.test(detailPage), "aksiyonlar gruplu (Onay / Hesap Yönetimi / Tehlikeli İşlemler)");
const danger = detailPage.slice(detailPage.indexOf("Tehlikeli İşlemler"), detailPage.indexOf("{passwordOpen"));
ok(!/emerald/.test(danger), "tehlikeli işlemlerde yeşil stil YOK");
ok((detailPage.match(/ref=\{dialogRefs\["/g) ?? []).length === 7 && /useDialogA11y/.test(detailPage), "7 modal: odak + Escape (useDialogA11y)");
ok(/aria-describedby=\{descId\}/.test(read("components/admin/members/ModuleCheckboxGrid.tsx")), "modül onay kutuları açıklamaya bağlı (aria-describedby)");
ok(/aria-pressed=\{value === o\.key\}/.test(listPage) && /aria-label="Sayfalama"/.test(listPage), "filtre düğmeleri aria-pressed; sayfalama etiketli");
ok(!/Üye Profil İzleme/.test(detailPage) && !/Paket \/ Üyelik Yönetimi/.test(detailPage), "mükerrer modül/paket bölümleri kaldırıldı");
ok(/"Oturum \/ Cihaz"|>Oturum \/ Cihaz</.test(detailPage) && />Ödeme Durumu</.test(detailPage) && />Modül Erişimi</.test(detailPage), "profil özeti: oturum/cihaz, ödeme, modül erişimi ayrı alan");

// ─── Owner kararı (cold verification sonrası): YH snapshot okuma + Word teslim eki ─────
console.log("\n[YH-SNAP] Kapalı modül snapshot'ları okuma/Word'de gösterilmez, silinmez");
const snapStoreSrc = read("lib/yasam-hafizasi/client/snapshotStore.ts");
ok(/selectionGroup: string;\s*scope: YhModuleScope;\s*\},\s*\): Promise<SnapshotReportItem\[\]>/.test(snapStoreSrc), "readSnapshotsForDelivery: scope ZORUNLU parametre (kapsamsız çağrı derlenmez)");
ok(/\.filter\(\(r\) => isYhSourceModuleInScope\(args\.scope, r\.source_module\)\)/.test(snapStoreSrc), "Word teslim okuması source_module'ü aktif kapsamla süzer");
ok(/items: visibleRows\(ctx, res\.rows\)\.map\(toSnapshotDto\)/.test(snapStoreSrc) && /const rows = after\.ok \? visibleRows\(ctx, after\.rows\) : \[\]/.test(snapStoreSrc), "snapshot GET + POST yanıtı yalnız aktif kapsamı döner");
ok(!/\.delete\(\)[\s\S]{0,200}source_module/.test(snapStoreSrc), "kapsam dışı snapshot için SİLME yolu yok (yalnız gizleme)");
for (const f of ["app/api/clients/[id]/word-report/route.ts", "app/api/sifa-rehberi/word-report/route.ts", "app/api/refleksoloji/protocol-report/route.ts"]) {
  const src = read(f);
  ok(/resolveYhModuleScope\(guard\.profile\?\.role, guard\.profile\?\.module_permissions\)/.test(src) && /readSnapshotsForDelivery\(db, \{[\s\S]{0,260}scope/.test(src), `${f.split("/").slice(2, -1).join("/")}: Word eki GÜNCEL module_permissions kapsamıyla`);
}

// ─── P3: liste geçmişi + "Üye Listesine Dön" + focus trap + terminoloji ─────────
console.log("\n[P3] Geri/İleri geçmişi, liste dönüşü, focus trap, terminoloji");
ok(/router\.push\(href, \{ scroll: false \}\)/.test(listPage) && !/router\.replace\(qs \?/.test(listPage), "filtre/sayfa değişimi router.push (Geri/İleri adım adım)");
ok(!/onClick=\{\(\) => setQuery\(|onSelect=\{\([a-z]+\) => setQuery\(|onChange=\{\(e\) => setQuery\(/.test(listPage), "tüm ayrık liste eylemleri navigate() (push) kullanır");
ok(/searchHistoryMode\.current = "replace"/.test(listPage) && /onBlur=\{\(\) => \{ searchHistoryMode\.current = "push"; \}\}/.test(listPage), "arama yazımı: oturum başına tek geçmiş adımı (ilk push, sonrası replace)");
ok(/if \(!ownQs\.includes\(query\.q\)\) \{\s*setSearchText\(query\.q\);/.test(listPage) && /setOwnQs\(\(prev\) => \[\.\.\.prev\.slice\(-4\), nextQ\]\)/.test(listPage), "arama yarışı: geç tamamlanan kendi gezinmesi yazılan metni ezmez");
ok(/sessionStorage\.setItem\(MEMBER_LIST_RETURN_KEY, queryKey\)/.test(listPage), "liste mevcut sorguyu dönüş için saklar (sekme-yerel)");
ok(!/href="\/admin\/users"/.test(detailPage) && (detailPage.match(/href=\{listHref\}/g) ?? []).length === 2 && /router\.push\(listHref\)/.test(detailPage), "detay: tüm liste dönüşleri korunmuş sorguyla");
ok(MEMBER_LIST_RETURN_KEY.length > 0 && memberListReturnHref("approval=approved&page=2&pageSize=10") === "/admin/users?approval=approved&page=2&pageSize=10", "dönüş adresi: filtre + sayfa korunur");
ok(memberListReturnHref("") === "/admin/users" && memberListReturnHref(null) === "/admin/users", "saklı sorgu yoksa düz liste");
ok(memberListReturnHref("approval=HACK") === "/admin/users" && memberListReturnHref("page=0") === "/admin/users", "geçersiz saklı değer → düz liste (doğrulanmadan kullanılmaz)");
ok(memberListReturnHref("//evil.example/x?q=1").startsWith("/admin/users") && memberListReturnHref("q=%2F%2Fevil").startsWith("/admin/users?"), "açık yönlendirme yok (adres daima /admin/users)");
ok(memberListReturnHref("?q=ar%C4%B1c%C4%B1&foo=bar") === "/admin/users?q=ar%C4%B1c%C4%B1", "bilinmeyen parametre atılır, Türkçe arama korunur");
const dlg = read("components/admin/members/useDialogA11y.ts");
ok(/e\.key !== "Tab"/.test(dlg) && /last\.focus\(\)/.test(dlg) && /first\.focus\(\)/.test(dlg) && /e\.shiftKey/.test(dlg), "modal focus trap: Tab / Shift+Tab diyalog içinde döner");
const denied = read("components/auth/ModuleAccessDenied.tsx");
ok(!/Deneme süreniz|Üyelik Süresi Doldu/.test(denied) && /Üyeliğiniz Aktif Değil/.test(denied), "erişim ekranı: Deneme/süre dili yok (Premium-only)");
ok(!/Admin · Üye Yönetimi|Admin Yönetim Merkezi/.test(listPage) && !/içerikleri admin tarafından/.test(detailPage), "üye yönetimi ekranlarında \"Admin\" etiketi yok (Yönetim / yönetici)");

console.log(`\n──────────\nFAZ 2 UNIT: PASS ${passed} · FAIL ${failed}`);
if (failed > 0) process.exit(1);
