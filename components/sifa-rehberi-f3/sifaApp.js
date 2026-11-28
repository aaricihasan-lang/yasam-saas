/*
 * Şifa Rehberi — ürün ekranı (F3). Görünüm ve davranış, Owner'ın onayladığı F2 Revizyon 7 prototipiyle BİREBİR aynıdır
 * (C:\YasamSistemi-Gorsel-Tasarim\sifa-rehberi-sade-F2-onayli-rev7\app.js). Farklar YALNIZ altyapıdır:
 *  - Veri: tarayıcı belleği yerine kişisel kütüphane API'si (/api/sifa-rehberi-v2/workspace — GET yükle, POST kaydet).
 *    Hiçbir şey kendiliğinden kaydedilmez; "Kaydet" tek işlemde sunucuya yazar, ardından kayıtlı hâl yeniden yüklenir.
 *  - Görsel: özel depoya yüklenir (prepare → yükleme → finalize); ekranda kısa ömürlü imzalı bağlantıyla gösterilir.
 *  - Word: sunucuda, KAYDEDİLMİŞ veriden .docx (/api/sifa-rehberi-v2/word).
 *  - Uygulama içi bağlantılarla (sol menü vb.) ayrılırken de kaydedilmemiş değişiklik için aynı 3 seçenekli pencere.
 *  - Prototipe özgü "ⓘ Prototip" paneli (örnek veriyi sıfırla / kayıt hatası benzetimi) yoktur.
 *  - Sunucudan her yüklemeden sonra açık ekran, prototipin "Kaydetmeden Çık" doğrulamasıyla (validRoute) denetlenir:
 *    konu başka sekmede/cihazda silindiyse Kütüphanem'e, başlık yoksa konunun ana başlığına dönülür (çökme yok).
 * Ekran yalnız mountSifaRehberi() ile verilen kök öğenin içinde çalışır; ayrılırken tüm dinleyiciler kaldırılır.
 */
import { TEMPLATE, NOTE_TYPES } from "./sifaData";

/**
 * @param {HTMLElement} $app kök öğe (sınıfı .sifa-f3)
 * @param {{ load: () => Promise<{state: any, meta: any}>, save: (saved: any, draft: any, meta: any) => Promise<void>,
 *   uploadImage: (file: File) => Promise<string>, signedUrls: (ids: string[]) => Promise<Record<string,string>>,
 *   downloadWord: (rootId: string, title: string) => Promise<void>, lastKeyPrefix: string }} env
 * @returns {() => void} ayırma (dinleyiciler + zamanlayıcılar temizlenir)
 */
export function mountSifaRehberi($app, env) {
const LAST = env.lastKeyPrefix;
// Ekran $view içine çizilir; bildirim (toast) kökte kalır → prototipteki gibi yeniden çizimde silinmez.
const $view = document.createElement("div");
$app.appendChild($view);
const offs = [];
const on = (target, type, fn, opts) => {
  target.addEventListener(type, fn, opts);
  offs.push(() => target.removeEventListener(type, fn, opts));
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const isMobile = () => window.matchMedia("(max-width: 820px)").matches;
const collator = new Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });
const TPL = new Map(TEMPLATE.map((t) => [t.key, t]));
const tplChildren = (key) => TEMPLATE.filter((t) => t.parent === key);
const FOLD = { ı: "i", ş: "s", ç: "c", ğ: "g", ü: "u", ö: "o", â: "a", î: "i", û: "u" };
const fold = (s) => String(s ?? "").toLocaleLowerCase("tr-TR").replace(/[ışçğüöâîû]/g, (c) => FOLD[c]).normalize("NFD").replace(/[̀-ͯ]/g, "");
const textOf = (html) => {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent || "";
};
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const NEW_NOTE = "__yeni__";

// ── Veri (sunucudan yüklenir; "Kaydet" tek işlemde yazar) ─────────────────────────
const EMPTY = () => ({ topics: [], nodes: [], notes: {}, links: [] });
let saved = EMPTY();
let draft = EMPTY();
let meta = { rows: {}, links: {} };
const dirty = () => JSON.stringify(draft) !== JSON.stringify(saved);
function applyLoaded(r) {
  saved = r.state;
  draft = clone(r.state);
  meta = r.meta;
}

const ui = {
  route: { view: "home" },
  editing: false,
  q: "",
  hl: "",
  reviewed: new Set(),
  expanded: new Set(),
  noteSel: {}, // başlık → seçili not
  menu: false,
  panel: null, // rename | move | link | type | delete | note-delete | addchild | source-new | source-edit:<id>
  sheet: false,
  sheetScroll: 0,
  sideScroll: 0,
  leave: null,
  loading: true,
  loadError: null,
  saving: false,
  newTitle: "",
  lightbox: null,
  manage: false,
  mEdit: null,
  mDel: null,
  dup: null, // R7 mükerrer konu uyarısı: { mode: "create" | "rename", title, ids, pick }
  renameDraft: null, // R7: uyarıda "Vazgeç" sonrası yazılan ad korunur
  expand: null, // büyütülmüş yazma penceresi: { box: null } = not metni · { box: <id> } = o içerik kutusu
  materialized: {}, // kayda dönüşen hazır başlık → sanal kimliği (Kaydetmeden Çık'ta aynı başlıkta kalmak için)
};

const liveTopics = () => draft.topics.filter((t) => !t.deletedAt).sort((a, b) => collator.compare(a.title, b.title));
const topicById = (id) => draft.topics.find((t) => t.id === id) ?? null;
const realNode = (id) => draft.nodes.find((n) => n.id === id && !n.deletedAt) ?? null;
const vid = (rootId, key) => `v|${rootId}|${key}`;
const parseV = (id) => (String(id).startsWith("v|") ? { rootId: id.split("|")[1], key: id.split("|")[2] } : null);
const findTpl = (rootId, key) => draft.nodes.find((n) => n.rootId === rootId && n.templateKey === key && !n.deletedAt) ?? null;
/** Konuya özel: bu konuda silinmiş (Silinenler'deki) hazır başlık satırı. Şablonun kendisi HİÇ değişmez. */
const tplDeleted = (rootId, key) => !findTpl(rootId, key) && draft.nodes.some((n) => n.rootId === rootId && n.templateKey === key && n.deletedAt);

function headingInfo(rootId, id) {
  if (id === rootId) {
    const t = topicById(rootId);
    return t && !t.deletedAt ? { id, title: t.title, icon: "📌", virtual: false, isRoot: true, templateKey: null, parentId: null } : null;
  }
  const v = parseV(id);
  if (v) {
    const real = findTpl(v.rootId, v.key);
    if (real) return headingInfo(rootId, real.id);
    const t = TPL.get(v.key);
    if (!t || tplDeleted(rootId, v.key)) return null;
    if (t.parent && !headingInfo(rootId, vid(rootId, t.parent))) return null; // üst grup bu konuda silinmiş
    return { id, title: t.label, icon: t.icon, virtual: true, templateKey: v.key, parentId: t.parent ? vid(rootId, t.parent) : null };
  }
  const n = realNode(id);
  if (!n) return null;
  const t = n.templateKey ? TPL.get(n.templateKey) : null;
  return { id, title: n.title, icon: t?.icon ?? "📄", virtual: false, templateKey: n.templateKey, parentId: n.parentId };
}
function childrenOf(rootId, parentId) {
  const parentKey = parentId == null ? null : headingInfo(rootId, parentId)?.templateKey ?? null;
  const realParent = parentId == null ? null : parseV(parentId) ? findTpl(rootId, parseV(parentId).key)?.id ?? null : parentId;
  const own = parentId != null && !realParent ? [] : draft.nodes.filter((n) => n.rootId === rootId && !n.deletedAt && !n.templateKey && n.parentId === realParent).sort((a, b) => a.order - b.order).map((n) => n.id);
  const tplList = parentId == null ? TEMPLATE.filter((t) => t.parent === null) : parentKey ? tplChildren(parentKey) : [];
  return { own, tpl: tplList.filter((t) => !tplDeleted(rootId, t.key)).map((t) => findTpl(rootId, t.key)?.id ?? vid(rootId, t.key)) };
}
/** Konunun bütün başlıkları (kök hariç), ağaç sırasıyla ve derinlikle — açık/kapalı durumundan bağımsız. */
function flatHeadings(rootId, from = null, depth = 0, out = []) {
  const { own, tpl } = childrenOf(rootId, from);
  for (const k of [...own, ...tpl]) {
    const h = headingInfo(rootId, k);
    if (!h) continue;
    out.push({ ...h, depth });
    flatHeadings(rootId, k, depth + 1, out);
  }
  return out;
}
function pathOf(rootId, id) {
  const out = [];
  let cur = headingInfo(rootId, id);
  for (let i = 0; cur && i < 30; i++) {
    out.unshift(cur);
    if (cur.isRoot) break;
    cur = cur.parentId ? headingInfo(rootId, cur.parentId) : headingInfo(rootId, rootId);
  }
  if (!out[0]?.isRoot) out.unshift(headingInfo(rootId, rootId));
  return out;
}
// ── Notlar (bir başlıkta birden fazla, bağımsız) ────────────────────────────────
const notesOf = (hid) => (draft.notes[hid] ?? []).filter((n) => !n.deletedAt);
function selectedNote(hid) {
  const list = notesOf(hid);
  return list.find((n) => n.id === ui.noteSel[hid]) ?? list[0] ?? null;
}
function filledCount(rootId, id) {
  const { own, tpl } = childrenOf(rootId, id);
  let n = notesOf(id).length;
  for (const c of [...own, ...tpl]) if (!parseV(c)) n += filledCount(rootId, c);
  return n;
}
function subtree(rootId, id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) for (const n of draft.nodes) if (n.parentId === ids[i] && !n.deletedAt) ids.push(n.id);
  return ids;
}
function materialize(rootId, id) {
  const v = parseV(id);
  if (!v) return id;
  const existing = findTpl(rootId, v.key);
  if (existing) return existing.id;
  const t = TPL.get(v.key);
  const parentReal = t.parent ? materialize(rootId, vid(rootId, t.parent)) : null;
  const n = { id: uid(), rootId, parentId: parentReal, title: t.label, templateKey: t.key, order: TEMPLATE.findIndex((x) => x.key === t.key), deletedAt: null };
  draft.nodes.push(n);
  return n.id;
}
/** Silme etkisi: görünen tüm alt başlıklar (hazır olanlar dahil) + gerçek not/görsel/kaynak sayıları. */
function impactOf(rootId, id) {
  const kids = id === rootId ? flatHeadings(rootId) : flatHeadings(rootId, id);
  const ids = [id, ...kids.map((k) => k.id)];
  const notes = ids.flatMap((k) => notesOf(k));
  return { kids: kids.length, notes: notes.length, imgs: notes.reduce((a, n) => a + (n.images?.length ?? 0), 0), srcs: notes.reduce((a, n) => a + (n.sources?.length ?? 0), 0) };
}
const impactText = (x) =>
  x.kids || x.notes
    ? `Altında <b>${x.kids} alt başlık</b>, <b>${x.notes} not</b>, <b>${x.imgs} görsel</b> ve <b>${x.srcs} kaynak</b> var; hepsi birlikte Silinenler'e taşınır, oradan geri alınabilir.`
    : "Altında başka başlık ya da not yok.";
/** Başlığı (hazır ya da kendi) bu konuda taslak olarak siler; Kaydet ile kesinleşir. */
function deleteHeading(rootId, id) {
  const real = materialize(rootId, id);
  const now = new Date().toISOString();
  const batch = uid();
  const ids = new Set(subtree(rootId, real));
  for (const n of draft.nodes) if (ids.has(n.id) && !n.deletedAt) { n.deletedAt = now; n.deleteBatch = batch; }
  for (const k of ids) for (const nt of draft.notes[k] ?? []) if (!nt.deletedAt) { nt.deletedAt = now; nt.deleteBatch = batch; nt.inBatch = true; }
}
/** Başlığın adını yalnız BU konuda değiştirir (hazır başlıkta şablon aynen kalır). */
function renameHeading(rootId, id, title) {
  if (id === rootId) topicById(rootId).title = title;
  else draft.nodes.find((n) => n.id === materialize(rootId, id)).title = title;
}
/** Bulunulan başlık silindiyse en yakın yaşayan üst başlığa geç. */
function fixRoute() {
  const r = ui.route;
  if (r.view !== "topic" || headingInfo(r.rootId, r.nodeId)) return;
  let cur = draft.nodes.find((n) => n.id === r.nodeId);
  let next = r.rootId;
  const v = parseV(r.nodeId);
  for (let t = v && TPL.get(v.key); t?.parent; t = TPL.get(t.parent)) {
    const p = headingInfo(r.rootId, vid(r.rootId, t.parent));
    if (p) { next = p.id; break; }
  }
  for (let i = 0; cur && i < 30; i++) {
    const p = cur.parentId && headingInfo(r.rootId, cur.parentId);
    if (p) { next = p.id; break; }
    cur = draft.nodes.find((n) => n.id === cur.parentId);
  }
  r.nodeId = next;
  history.replaceState(null, "", hashOf(r));
}

// ── Yönlendirme + çıkış koruması (kaydedilmemiş HER değişiklik için) ──────────────
const hashOf = (r) =>
  r.view === "topic" ? `#/konu/${r.rootId}/${encodeURIComponent(r.nodeId)}` : r.view === "read" ? `#/oku/${r.rootId}` : r.view === "trash" ? "#/silinenler" : r.view === "library" ? "#/kutuphane" : r.view === "new" ? "#/yeni" : "#/";
function fromHash() {
  const m = location.hash.match(/^#\/konu\/([^/]+)\/(.+)$/);
  if (m && topicById(m[1]) && !topicById(m[1]).deletedAt) return { view: "topic", rootId: m[1], nodeId: decodeURIComponent(m[2]) };
  const r = location.hash.match(/^#\/oku\/(.+)$/);
  if (r && topicById(r[1])) return { view: "read", rootId: r[1] };
  if (location.hash === "#/silinenler") return { view: "trash" };
  if (location.hash === "#/kutuphane") return { view: "library" };
  if (location.hash === "#/yeni") return { view: "new" };
  return { view: "home" };
}
/** Aynı konu içinde başlık değiştirmek çıkış değildir; başka her ekran çıkıştır. */
const leaves = (target) => !(target.view === "topic" && ui.route.view === "topic" && target.rootId === ui.route.rootId);
function go(target, { push = true } = {}) {
  if (dirty() && leaves(target)) {
    ui.leave = { target, push };
    render();
    return false;
  }
  navigate(target, { push });
  return true;
}
function navigate(target, { push = true, keepEditing = false } = {}) {
  const sameTopic = !leaves(target);
  if (!sameTopic && !keepEditing) ui.editing = false;
  if (ui.sheet) ui.sheetScroll = $app.querySelector(".sheet-body")?.scrollTop ?? ui.sheetScroll;
  ui.route = target;
  ui.menu = false;
  ui.panel = null;
  ui.sheet = false;
  ui.leave = null;
  const h = hashOf(target);
  if (push && location.hash !== h) history.pushState(null, "", h);
  if (target.view === "topic") {
    try {
      localStorage.setItem(LAST + target.rootId, target.nodeId);
    } catch {
      /* yoksay */
    }
    for (const p of pathOf(target.rootId, target.nodeId)) ui.expanded.add(p.id);
  }
  if (!sameTopic) ui.sideScroll = 0;
  render();
  // Sağ içerik başa döner; SOL liste kendi kaydırma konumunu korur (render içinde).
  window.scrollTo(0, 0);
  if (target.view === "topic" && ui.editing) focusEditor();
}
on(window, "popstate", () => {
  const target = fromHash();
  if (dirty() && leaves(target)) {
    history.pushState(null, "", hashOf(ui.route));
    ui.leave = { target, push: true };
    render();
    return;
  }
  navigate(target, { push: false, keepEditing: !leaves(target) });
});
on(window, "beforeunload", (e) => {
  if (dirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function openTopic(rootId, nodeId = null, noteId = null) {
  let last = nodeId;
  if (!last) {
    try {
      last = localStorage.getItem(LAST + rootId);
    } catch {
      last = null;
    }
  }
  const target = last && headingInfo(rootId, last) ? last : rootId;
  if (noteId) ui.noteSel[target] = noteId;
  go({ view: "topic", rootId, nodeId: target });
}

// ── Kaydet / Vazgeç ─────────────────────────────────────────────────────────────
// Silme / geri alma notun İÇERİĞİNİ değiştirmez → tarihleri de değiştirmez (sunucu: content_updated_at yalnız gerçek değişimde).
/** true = kayıt GERÇEKTEN tamamlandı (sunucu tek işlemde yazdı). Tarihler sunucuda yalnız gerçek değişiklikte yazılır. */
async function save() {
  if (!dirty()) return true;
  if (ui.saving) return false;
  ui.saving = true;
  document.activeElement?.blur?.();
  render();
  try {
    await env.save(saved, draft, meta);
  } catch (e) {
    ui.saving = false;
    toast(`Kaydedilemedi: ${e.message}. Değişiklikleriniz ekranda duruyor; tekrar deneyin.`, "err");
    render();
    return false;
  }
  try {
    applyLoaded(await env.load());
    validRoute(true);
  } catch {
    // Kayıt kesinleşti; yalnız yeniden yükleme başarısız → ekran güncel değil, yenileme istenir (çift kayıt riski yok).
    ui.saving = false;
    ui.loadError = "Kaydedildi; ancak kayıtlı hâl yeniden yüklenemedi. Lütfen sayfayı yenileyin.";
    render();
    return false;
  }
  ui.saving = false;
  toast("Kaydedildi.");
  return true;
}
function dropChanges() {
  draft = clone(saved);
  validRoute(false);
}
/**
 * Açık ekran hâlâ var mı? fromServer=false → prototipin dropChanges doğrulaması AYNEN.
 * fromServer=true (F3: sunucudan yeniden yüklemeden sonra) → ek olarak adres çubuğu ve okuma ekranı da düzeltilir.
 */
function validRoute(fromServer) {
  if (ui.route.view === "topic" && (!topicById(ui.route.rootId) || topicById(ui.route.rootId).deletedAt)) {
    ui.route = { view: "library" };
    if (fromServer) {
      ui.editing = false;
      history.replaceState(null, "", hashOf(ui.route));
    }
  }
  if (fromServer && ui.route.view === "read" && !topicById(ui.route.rootId)) {
    ui.route = { view: "library" };
    history.replaceState(null, "", hashOf(ui.route));
  }
  if (ui.route.view === "topic" && !headingInfo(ui.route.rootId, ui.route.nodeId)) {
    const v = ui.materialized[ui.route.nodeId];
    ui.route.nodeId = v && headingInfo(ui.route.rootId, v) ? v : ui.route.rootId;
    history.replaceState(null, "", hashOf(ui.route));
  }
}
function cancelEditing() {
  if (dirty()) {
    ui.leave = { target: { ...ui.route }, exitEdit: true };
    render();
    return;
  }
  ui.editing = false;
  ui.panel = null;
  render();
}
async function leaveChoice(choice) {
  const L = ui.leave;
  if (!L) return;
  if (choice === "devam") {
    ui.leave = null;
    render();
    focusEditor();
    return;
  }
  if (choice === "kaydet") {
    if (!(await save())) {
      ui.leave = null;
      render();
      return;
    }
  } else {
    dropChanges();
    toast("Kaydedilmemiş değişiklikler bırakıldı; kayıtlı bilgiler aynen duruyor.", "info");
  }
  ui.leave = null;
  ui.editing = false;
  ui.panel = null;
  if (L.external) {
    window.location.assign(L.external);
    return;
  }
  if (L.exitEdit) {
    if (ui.route.view === "topic" && !headingInfo(ui.route.rootId, ui.route.nodeId)) ui.route.nodeId = ui.route.rootId;
    render();
  } else navigate(L.target, { push: L.push !== false });
}

// ── Arama ───────────────────────────────────────────────────────────────────────
function searchResults(q) {
  const fq = fold(q).trim();
  if (fq.length < 2) return null;
  const out = [];
  const partHit = (x) => fold(`${x.title ?? ""} ${textOf(x.html)}`).includes(fq) || (x.sources ?? []).some((s) => fold(`${s.title} ${s.authors ?? ""}`).includes(fq)) || (x.images ?? []).some((g) => fold(g.caption).includes(fq)) || (x.links ?? []).some((l) => fold(`${l.title} ${l.url}`).includes(fq));
  const noteHit = (n) => partHit(n) || (n.boxes ?? []).some((b) => !b.deletedAt && partHit(b));
  for (const t of liveTopics()) {
    let hit = null;
    const tryHeading = (hid) => {
      const n = notesOf(hid).find(noteHit);
      if (n) hit = { nodeId: hid, noteId: n.id };
    };
    tryHeading(t.id);
    if (!hit && fold(t.title).includes(fq)) hit = { nodeId: t.id, noteId: null };
    for (const n of draft.nodes.filter((x) => x.rootId === t.id && !x.deletedAt)) {
      if (hit) break;
      tryHeading(n.id);
      if (!hit && !n.templateKey && fold(n.title).includes(fq)) hit = { nodeId: n.id, noteId: null };
    }
    if (hit) out.push({ topic: t, ...hit });
  }
  return out;
}
function markText(text, q) {
  const fq = fold(q).trim();
  if (fq.length < 2) return esc(text);
  const f = fold(text);
  let out = "";
  let at = 0;
  for (let i = f.indexOf(fq); i >= 0; i = f.indexOf(fq, i + fq.length)) {
    out += esc(text.slice(at, i)) + `<mark class="hit">${esc(text.slice(i, i + fq.length))}</mark>`;
    at = i + fq.length;
  }
  return out + esc(text.slice(at));
}
const markHtml = (html, q) => (fold(q).trim().length >= 2 ? `>${html}<`.replace(/>([^<]+)</g, (m, t) => `>${markText(t, q)}<`).slice(1, -1) : html);
function highlightEditor() {
  if (!("highlights" in CSS)) return;
  CSS.highlights.delete("ara");
  const eds = [...$app.querySelectorAll(".editor")];
  const fq = fold(ui.hl).trim();
  if (!eds.length || fq.length < 2) return;
  const ranges = [];
  for (const ed of eds) {
  const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const f = fold(n.data);
    for (let i = f.indexOf(fq); i >= 0; i = f.indexOf(fq, i + fq.length)) {
      const r = new Range();
      r.setStart(n, i);
      r.setEnd(n, i + fq.length);
      ranges.push(r);
    }
  }
  }
  if (ranges.length) CSS.highlights.set("ara", new Highlight(...ranges));
}

// ── Görünümler ──────────────────────────────────────────────────────────────────
/** Liste kaydırma konumu KORUNUR; seçili başlık görünmüyorsa yalnız gerektiği kadar kaydırılır. */
function keepScroll(sel, top, reveal = true) {
  const box = $app.querySelector(sel);
  if (!box) return;
  box.scrollTop = top;
  const on = reveal && box.querySelector(".trow.on");
  if (!on) return;
  const b = box.getBoundingClientRect();
  const r = on.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
}
function render() {
  const r = ui.route;
  const liveSide = $app.querySelector(".side-scroll");
  if (liveSide) ui.sideScroll = liveSide.scrollTop;
  const liveSheet = $app.querySelector(".sheet-body");
  if (liveSheet) ui.sheetScroll = liveSheet.scrollTop;
  $app.dataset.view = r.view;
  $app.dataset.mode = ui.editing ? "duzenleme" : "okuma";
  if (ui.loading || ui.loadError) {
    $view.innerHTML = statusView();
    return;
  }
  if (ui.expand && (!ui.editing || r.view !== "topic" || ui.leave)) ui.expand = null; // metin zaten taslakta; pencere yalnız kapanır
  if (ui.dup && r.view !== (ui.dup.mode === "create" ? "new" : "topic")) ui.dup = null; // sayfadan çıkıldıysa uyarı kalmaz
  if (ui.panel !== "rename") ui.renameDraft = null;
  $view.innerHTML =
    ({ topic: topicView, read: readView, trash: trashView, library: libraryView, new: newView }[r.view] ?? homeView)() +
    (ui.sheet ? sheetView() : "") +
    (ui.manage && r.view === "topic" ? manageView() : "") +
    (ui.leave ? leaveDialog() : "") +
    (ui.lightbox ? lightboxView() : "") +
    (ui.expand ? expandView() : "") +
    (ui.dup ? dupDialog() : "") +
    (ui.saving ? `<div class="busy" data-testid="saving" role="status" aria-live="polite"><span>Kaydediliyor…</span></div>` : "");
  if (r.view === "topic") {
    // Yalnız SEÇİM değiştiğinde (ve seçili başlık görünmüyorsa) en az kadar kaydır; diğer çizimlerde konum aynen kalır.
    const selKey = `${r.rootId}|${r.nodeId}`;
    keepScroll(".side-scroll", ui.sideScroll, ui.sideSel !== selKey);
    ui.sideSel = selKey;
    if (ui.sheet) keepScroll(".sheet-body", ui.sheetScroll);
    highlightEditor();
    if (ui.scrollToHit) {
      ui.scrollToHit = false;
      requestAnimationFrame(() => ($app.querySelector(".note.cur mark.hit") ?? $app.querySelector(".notes mark.hit"))?.scrollIntoView({ block: "center" }));
    }
  }
  if (r.view === "library" && ui.keepSearchFocus) {
    const inp = $app.querySelector("[data-testid=search]");
    inp?.focus();
    inp?.setSelectionRange(inp.value.length, inp.value.length);
  }
  if (ui.leave) requestAnimationFrame(() => $app.querySelector("[data-testid=leave-continue]")?.focus());
  if (ui.dup) requestAnimationFrame(() => $app.querySelector("[data-testid=dup-dialog] .dactions .btn, [data-testid=dup-dialog] .duplist .btn")?.focus());
  void resolveImages();
}
/** Yükleniyor / yüklenemedi (ürün altyapısı; F2 görünüm dilinde). */
function statusView() {
  if (ui.loading) return `<section class="sheetcard narrow" data-testid="loading"><p class="status" role="status" aria-live="polite">Araştırma kütüphaneniz yükleniyor…</p></section>`;
  return `<section class="sheetcard narrow" data-testid="load-error" role="alert"><p class="status">${esc(ui.loadError)}</p><button type="button" class="btn primary" data-act="reload" data-testid="reload">Yeniden dene</button></section>`;
}
/** Yazarken: yalnız üst durum + ağaç sayıları + not sekmeleri (editör yeniden çizilmez, sol liste konumu korunur). */
function renderChrome() {
  if (ui.route.view === "topic") {
    const h = headingInfo(ui.route.rootId, ui.route.nodeId) ?? headingInfo(ui.route.rootId, ui.route.rootId);
    const st = $app.querySelector("[data-testid=tools]");
    if (st) st.outerHTML = toolsView(h);
    const box = $app.querySelector(".side-scroll");
    if (box) {
      const top = box.scrollTop;
      box.innerHTML = treeView(ui.route.rootId, ui.route.nodeId);
      box.scrollTop = top;
    }
    const tabs = $app.querySelector("[data-testid=note-tabs]");
    if (tabs) tabs.outerHTML = noteTabs(h);
  }
  const sess = $app.querySelector("[data-testid=session]");
  if (sess) sess.outerHTML = sessionControls();
}

const BOTANIC = `<svg class="botanic" viewBox="0 0 420 220" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M40 210C120 160 170 96 212 18"/><path d="M110 156c-30-6-52-22-62-46 26-2 50 10 62 46z"/><path d="M150 118c-26-14-40-36-42-62 24 8 40 28 42 62z"/><path d="M184 76c-6-26 0-50 18-68 8 24 2 46-18 68z"/><path d="M128 138c26-14 54-14 78 2-24 16-52 16-78-2z"/><path d="M168 98c24-16 50-18 74-6-22 18-48 20-74 6z"/><path d="M262 214c40-50 90-80 150-90"/><path d="M322 156c-8-22-4-44 14-62 10 22 6 44-14 62z"/><path d="M364 134c16-18 38-26 58-24-12 20-32 28-58 24z"/></g></svg>`;
function homeView() {
  const n = liveTopics().length;
  const notes = Object.values(draft.notes).flat().filter((x) => !x.deletedAt).length;
  return `
  <section class="hero" data-testid="hero">
    ${BOTANIC}
    <p class="eyebrow">Doğal Destek &amp; Rehber</p>
    <h1 class="display">Şifa Rehberi</h1>
    <p class="lead">Araştırmalarınız, notlarınız ve kaynaklarınız — düzenli bir kişisel arşivde.</p>
  </section>
  <div class="home-cards">
    <a href="#/kutuphane" class="hcard" data-tone="violet" data-act="nav" data-view="library" data-testid="card-kutuphane">
      <span class="hcard-art" aria-hidden="true"><span class="hcard-ico">📚</span></span>
      <span class="hcard-body">
        <span class="hcard-kicker">Araştırma arşivi</span>
        <span class="hcard-title">Araştırma Kütüphanem</span>
        <span class="hcard-text">Kayıtlı konularınızı bulun, okuyun ve güncelleyin.</span>
        <span class="hcard-stats"><span><b>${n}</b> konu</span><span><b>${notes}</b> not</span></span>
        <span class="hcard-cta">Kütüphaneyi aç <span aria-hidden="true">→</span></span>
      </span>
    </a>
    <a href="#/yeni" class="hcard" data-tone="green" data-act="nav" data-view="new" data-testid="card-yeni">
      <span class="hcard-art" aria-hidden="true"><span class="hcard-ico">✍️</span></span>
      <span class="hcard-body">
        <span class="hcard-kicker">Yeni araştırma</span>
        <span class="hcard-title">Yeni Kayıt</span>
        <span class="hcard-text">Konunun adını yazın; hazır başlıklar kendiliğinden gelir.</span>
        <span class="hcard-stats"><span><b>25</b> hazır başlık</span><span>Hemen yazmaya başlayın</span></span>
        <span class="hcard-cta">Yeni kayıt başlat <span aria-hidden="true">→</span></span>
      </span>
    </a>
  </div>`;
}
/** Kaydedilmemiş değişiklik varken (ör. Silinenler'de geri alma, konu silme) sayfa başlığında Kaydet/Vazgeç. */
function sessionControls() {
  if (!dirty()) return `<span data-testid="session"></span>`;
  return `<div class="session" data-testid="session"><span class="dirty-pill" data-testid="save-status">● Kaydedilmemiş değişiklik</span><button type="button" class="btn ghost sm" data-act="cancel" data-testid="discard">Vazgeç</button><button type="button" class="btn primary sm" data-act="save" data-testid="save">💾 Kaydet</button></div>`;
}
function pageHead(title, sub, backLabel = "← Şifa Rehberi", backView = "home") {
  return `<div class="pagehead"><button type="button" class="btn ghost sm" data-act="nav" data-view="${backView}" data-testid="back">${backLabel}</button><div class="pagehead-t"><h1 class="ptitle">${title}</h1>${sub ? `<p class="psub">${sub}</p>` : ""}</div>${sessionControls()}</div>`;
}
function libraryView() {
  const res = searchResults(ui.q);
  const list = res ? res.map((r) => r.topic) : liveTopics();
  const reviewed = res ? res.filter((r) => ui.reviewed.has(r.topic.id)).length : 0;
  const groups = [];
  for (const t of list) {
    const L = (t.title.trim()[0] ?? "#").toLocaleUpperCase("tr-TR");
    const g = groups[groups.length - 1];
    g && g.L === L ? g.items.push(t) : groups.push({ L, items: [t] });
  }
  return `${pageHead("Araştırma Kütüphanem", "Konunuza dokunun; kayıtlı içerik okuma modunda açılır.")}
  <section class="sheetcard lib" data-testid="library">
    <div class="search">
      <span aria-hidden="true">⌕</span>
      <input type="search" value="${esc(ui.q)}" placeholder="Konu, not ya da kaynak içinde ara…" aria-label="Kütüphanede ara" data-testid="search" autocomplete="off" />
      ${ui.q ? `<button type="button" class="x" data-act="clear-search" aria-label="Aramayı temizle">✕</button>` : ""}
    </div>
    <p class="status" role="status" aria-live="polite" data-testid="lib-status">${
      res ? `“<b>${esc(ui.q.trim())}</b>” için <b>${list.length}</b> konu bulundu${list.length ? ` · ${reviewed} incelendi` : ""}` : fold(ui.q).trim().length === 1 ? "Aramak için en az 2 harf yazın." : `<b>${list.length}</b> konu · A'dan Z'ye`
    }</p>
    ${list.length ? `<div class="groups" data-testid="lib-list">${groups.map((g) => `<section class="lgroup"><h2 class="letter">${esc(g.L)}</h2><ul class="list">${g.items.map((t) => {
      const seen = res && ui.reviewed.has(t.id);
      return `<li><button type="button" class="row ${seen ? "seen" : ""}" data-act="open" data-id="${t.id}" data-testid="lib-item" data-title="${esc(t.title)}">
        ${res ? `<span class="dot ${seen ? "ok" : ""}" aria-hidden="true">${seen ? "✓" : ""}</span>` : ""}
        <span class="row-title">${markText(t.title, res ? ui.q : "")}</span>
        ${res ? `<span class="chip ${seen ? "ok" : "new"}">${seen ? "İncelendi" : "İncelenmedi"}</span>` : ""}
        <span class="chev" aria-hidden="true">›</span></button></li>`;
    }).join("")}</ul></section>`).join("")}</div>` : `<p class="empty">${res ? "Sonuç bulunamadı. Farklı bir kelime deneyin." : "Henüz konunuz yok. Ana sayfadaki “Yeni Kayıt” ile başlayın."}</p>`}
    <div class="foot"><button type="button" class="link" data-act="nav" data-view="trash" data-testid="open-trash">🗑 Silinenler</button></div>
  </section>`;
}
// ── R7: Mükerrer konu kontrolü ──────────────────────────────────────────────────
/** Karşılaştırma anahtarı: baş/son boşluk yok sayılır, Türkçe kurallarıyla küçük harf (İ→i, I→ı).
 *  Harfler SADELEŞTİRİLMEZ: ı≠i, ş≠s, ç≠c, ğ≠g, ö≠o, ü≠u. Kullanıcının yazdığı ad hiç değiştirilmez. */
const nameKey = (s) => String(s ?? "").normalize("NFC").trim().toLocaleLowerCase("tr-TR");
/** Aynı adlı mevcut (silinmemiş) konular; düzenlenen konu kendisiyle karşılaştırılmaz. */
const sameNameTopics = (title, exceptId = null) => liveTopics().filter((t) => t.id !== exceptId && nameKey(t.title) === nameKey(title));
const topicNoteCount = (id) => Object.entries(draft.notes).filter(([hid]) => hid === id || draft.nodes.some((n) => n.id === hid && n.rootId === id && !n.deletedAt)).reduce((c, [, arr]) => c + arr.filter((n) => !n.deletedAt).length, 0);
function createTopic(title) {
  const t = { id: uid(), title, createdAt: new Date().toISOString(), deletedAt: null };
  draft.topics.push(t);
  ui.newTitle = "";
  ui.editing = true;
  navigate({ view: "topic", rootId: t.id, nodeId: t.id }, { keepEditing: true });
}
function dupDialog() {
  const D = ui.dup;
  const list = D.ids.map(topicById).filter(Boolean);
  if (!list.length) return "";
  const many = list.length > 1;
  const name = list[0].title;
  const rename = D.mode === "rename";
  const q = rename ? "Mevcut konuyu açmak mı, yoksa bu konuya yine de aynı adı vermek mi istiyorsunuz?" : "Mevcut konuyu açmak mı, yoksa aynı isimle yeni bir konu oluşturmak mı istiyorsunuz?";
  const body = D.pick
    ? `<p class="dpick">Hangi konuyu açmak istiyorsunuz?</p>
      <ul class="duplist" data-testid="dup-list">${list.map((t) => `<li><button type="button" class="btn ghost dupitem" data-act="dup-open" data-id="${esc(t.id)}" data-testid="dup-item" data-title="${esc(t.title)}"><b>${esc(t.title)}</b><small>Oluşturuldu ${esc(fmtDate(t.createdAt))} · ${topicNoteCount(t.id)} not</small></button></li>`).join("")}</ul>
      <div class="dactions"><button type="button" class="btn ghost" data-act="dup-back" data-testid="dup-back">← Geri</button></div>`
    : `<div class="dactions">
      <button type="button" class="btn primary" data-act="dup-open" data-testid="dup-open">Mevcut Konuyu Aç</button>
      <button type="button" class="btn soft" data-act="dup-create" data-testid="dup-create">${rename ? "Yine de Bu Adı Ver" : "Yine de Oluştur"}</button>
      <button type="button" class="btn ghost" data-act="dup-cancel" data-testid="dup-cancel">Vazgeç</button>
    </div>`;
  return `<div class="overlay" data-testid="dup-overlay"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dup-t" aria-describedby="dup-d" data-testid="dup-dialog" data-mode="${D.mode}">
    <h2 id="dup-t">Bu isimde bir konu zaten mevcut.</h2>
    <p id="dup-d" data-testid="dup-text">Araştırma kütüphanenizde “${esc(name)}” isimli ${many ? `${list.length} konu` : "bir konu"} bulunuyor. ${q}</p>
    ${body}
  </div></div>`;
}
function dupChoice(choice, id) {
  const D = ui.dup;
  if (!D) return;
  if (choice === "cancel") {
    ui.dup = null;
    if (D.mode === "rename") ui.renameDraft = D.raw; // panel açık kalır, yazılan ad AYNEN korunur
    else ui.newTitle = D.raw;
    render();
    const inp = $app.querySelector(D.mode === "rename" ? "[data-testid=rename-input]" : "[data-testid=new-title]");
    inp?.focus();
    inp?.setSelectionRange?.(inp.value.length, inp.value.length);
    return;
  }
  if (choice === "open") {
    const target = id ?? (D.ids.length === 1 ? D.ids[0] : null);
    if (!target) {
      D.pick = true;
      return render();
    }
    ui.dup = null;
    ui.renameDraft = null;
    ui.panel = null;
    if (D.mode === "create") ui.newTitle = "";
    openTopic(target); // bekleyen ad değişikliği uygulanmaz; kaydedilmemiş başka değişiklik varsa 3 seçenekli pencere çıkar
    return;
  }
  // "Yine de Oluştur / Bu Adı Ver": son karar kullanıcının — ad AYNEN kullanılır, bağımsız kayıt
  ui.dup = null;
  ui.renameDraft = null;
  if (D.mode === "create") return createTopic(D.title);
  renameHeading(D.rootId, D.rootId, D.title);
  ui.panel = null;
  render();
}
function newView() {
  return `${pageHead("Yeni Kayıt", "Konunun adını yazın; açıldığında hazır başlıklar ve yazma alanı hazır olur.")}
  <section class="sheetcard narrow" data-testid="new-panel">
    <form data-act="create" data-testid="new-form">
      <label for="yeni-konu" class="lbl">Konunun adı</label>
      <input id="yeni-konu" class="big" value="${esc(ui.newTitle)}" placeholder="Örneğin: Dalak" maxlength="200" autocomplete="off" data-testid="new-title" />
      <p class="hint">Hazır başlıklar (Belirtiler, Bitkisel Yöntemler, Refleksoloji, Aromaterapi…) kendiliğinden gelir; isterseniz kendi alt başlıklarınızı da eklersiniz.</p>
      <button type="submit" class="btn primary wide" data-testid="new-create">Kaydı aç ve yazmaya başla →</button>
    </form>
  </section>`;
}

/** top = ana başlık (en üst seviye): grup olsun olmasın aynı yazı rengi, kalınlığı, boyutu ve hizası (R6). */
function treeRow(rootId, id, selId, top = false) {
  const h = headingInfo(rootId, id);
  if (!h) return "";
  const { own, tpl } = childrenOf(rootId, id);
  const kids = [...own, ...tpl];
  const open = ui.expanded.has(id);
  const filled = filledCount(rootId, id);
  const on = id === selId;
  return `<li>
    <div class="trow ${top ? "top" : ""} ${on ? "on" : ""} ${h.virtual && !filled ? "ghost" : ""} ${kids.length ? "has-kids" : ""} ${open && kids.length ? "open" : ""}">
      ${kids.length ? `<button type="button" class="tog" data-act="toggle" data-id="${esc(id)}" aria-label="${esc(h.title)} alt başlıklarını ${open ? "gizle" : "göster"}" aria-expanded="${open}" data-testid="tree-toggle" data-title="${esc(h.title)}"><span class="chev-ic" aria-hidden="true">›</span></button>` : `<span class="tog leaf" aria-hidden="true"></span>`}
      <button type="button" class="tbtn" data-act="select" data-id="${esc(id)}" data-testid="tree-item" data-title="${esc(h.title)}" ${isGroupH(h) ? `data-group="1"` : ""} aria-current="${on ? "page" : "false"}">
        <span aria-hidden="true" class="ti">${h.icon}</span><span class="ttl">${markText(h.title, ui.hl)}</span>
        ${kids.length ? `<span class="kids" title="${kids.length} alt başlık">${kids.length} alt</span>` : ""}
      </button>
      ${filled ? `<span class="cnt" title="${filled} not">${filled}</span>` : ""}
    </div>
    ${kids.length && open ? `<ul class="kidslist">${kids.map((k) => treeRow(rootId, k, selId)).join("")}</ul>` : ""}
  </li>`;
}
/** Sol panelin üstünde iki eşit düğme: + Başlık Ekle · Başlık Düzenle / Sil. */
const headActions = () => `<div class="hacts" data-testid="heading-actions">
    <button type="button" class="btn soft sm" data-act="addheading" data-testid="add-heading">＋ Başlık Ekle</button>
    <button type="button" class="btn soft sm" data-act="manage" data-testid="manage-headings">✎ Başlık Düzenle / Sil</button>
  </div>`;
function treeView(rootId, selId) {
  const t = topicById(rootId);
  const { own, tpl } = childrenOf(rootId, null);
  return `<nav class="tree" aria-label="${esc(t.title)} başlıkları" data-testid="tree">
    <ul><li>
      <div class="trow root ${selId === rootId ? "on" : ""}">
        <span class="tog leaf" aria-hidden="true"></span>
        <button type="button" class="tbtn" data-act="select" data-id="${rootId}" data-testid="tree-item" data-title="${esc(t.title)}" aria-current="${selId === rootId ? "page" : "false"}">
          <span aria-hidden="true" class="ti">📌</span><span class="ttl">${markText(t.title, ui.hl)} <small>· genel</small></span>
        </button>
        ${notesOf(rootId).length ? `<span class="cnt">${notesOf(rootId).length}</span>` : ""}
      </div>
    </li></ul>
    ${own.length ? `<p class="tsec">Kendi başlıklarım</p><ul>${own.map((k) => treeRow(rootId, k, selId, true)).join("")}</ul>` : ""}
    ${tpl.length ? `<p class="tsec">Hazır başlıklar</p><ul>${tpl.map((k) => treeRow(rootId, k, selId, true)).join("")}</ul>` : ""}
  </nav>`;
}
function toolsView(h) {
  const E = ui.editing;
  const d = dirty();
  return `<div class="tools" data-testid="tools">
    ${E ? `<span class="dirty-pill ${d ? "" : "clean"}" data-testid="save-status" role="status">${d ? `● Kaydedilmemiş<span class="hide-m"> değişiklik</span>` : "Değişiklik yok"}</span>` : `<button type="button" class="btn ghost sm hide-m" data-act="read" data-testid="read-all">📖 Tümünü oku</button><button type="button" class="btn ghost sm hide-m" data-act="word" data-testid="word">📄 Word</button>`}
    <div class="menuwrap">
      <button type="button" class="btn ghost sm" data-act="menu" aria-haspopup="menu" aria-expanded="${ui.menu}" data-testid="menu" aria-label="Diğer işlemler">⋯<span class="hide-m"> Diğer</span></button>
      ${ui.menu ? menuView(h) : ""}
    </div>
    ${E ? `<button type="button" class="btn ghost sm" data-act="cancel" data-testid="discard">Vazgeç</button><button type="button" class="btn primary sm" data-act="save" data-testid="save" ${d ? "" : "disabled"}>💾 Kaydet</button>`
        : `<button type="button" class="btn primary sm" data-act="edit" data-testid="edit">✎ Düzenle<span class="hide-m"> / Güncelle</span></button>`}
  </div>`;
}
/** Grup başlığı: hazır "grup:" başlıkları + kullanıcının "grup" olarak açtığı başlıklar. Not yazma alanı yoktur. */
const isGroupH = (h) => !!h && !h.isRoot && (String(h.templateKey ?? "").startsWith("grup:") || draft.nodes.find((n) => n.id === h.id)?.kind === "grup");
const TOOLBAR = `<div class="tb" role="toolbar" aria-label="Yazı araçları"><button type="button" data-cmd="bold" aria-label="Kalın"><b>K</b></button><button type="button" data-cmd="italic" aria-label="İtalik"><i>İ</i></button><button type="button" data-cmd="insertUnorderedList" aria-label="Madde listesi">• Liste</button><button type="button" data-cmd="insertOrderedList" aria-label="Numaralı liste">1. Liste</button></div>`;
/** Notlar alt alta; üstte yalnız kısa bir içindekiler (2+ not). R5: "+ Yeni Not" düğmesi yok. */
function noteTabs(h) {
  if (!h || isGroupH(h)) return "";
  const list = notesOf(h.id);
  const sel = selectedNote(h.id);
  if (!list.length) return ui.editing ? `<div class="ntabs-wrap" data-testid="note-tabs"><nav class="ntabs" aria-label="Bu başlıktaki notlar"><span class="ntabs-k">Henüz not yok</span></nav></div>` : `<div class="ntabs-wrap empty" data-testid="note-tabs"></div>`;
  return `<div class="ntabs-wrap" data-testid="note-tabs">
    <nav class="ntabs" aria-label="Bu başlıktaki notlar"><span class="ntabs-k">${list.length} not${list.length > 1 ? ":" : ""}</span>
    ${list.length > 1 ? list.map((n, i) => `<button type="button" class="ntab ${n.id === sel?.id ? "on" : ""}" aria-current="${n.id === sel?.id}" data-act="note" data-id="${n.id}" data-testid="note-tab" data-title="${esc(n.title)}"><span class="ntab-n">${i + 1}</span><span class="ntab-t">${markText(n.title || `Not ${i + 1}`, ui.hl)}</span></button>`).join("") : ""}
    </nav>
  </div>`;
}
function notesView(h, E, { legacy = false } = {}) {
  const list = notesOf(h.id);
  const cur = selectedNote(h.id);
  if (!list.length) {
    if (legacy) return "";
    return E ? `<div class="notes" data-testid="notes">${noteArticle(blankDraft(), true, true)}</div>` : `<div class="noteempty" data-testid="note-empty"><p>Bu başlıkta henüz not yok.</p><button type="button" class="btn primary sm" data-act="new-note">＋ İlk notu yaz</button></div>`;
  }
  return `<div class="notes" data-testid="notes">${list.map((n) => noteArticle(n, E && n.id === cur?.id, n.id === cur?.id)).join("")}</div>`;
}
const blankDraft = () => ({ id: NEW_NOTE, title: "", html: "", cls: "", sources: [], images: [], boxes: [], createdAt: null, updatedAt: null });
function noteArticle(n, edit, cur) {
  const typeLbl = NOTE_TYPES.find((x) => x.id === n.cls)?.label;
  const real = n.id !== NEW_NOTE;
  const acts = edit
    ? real ? `<button type="button" class="link sm danger" data-act="note-delete" data-id="${n.id}" data-testid="note-delete">🗑 Notu sil</button>` : ""
    : `<button type="button" class="btn ghost xs" data-act="note-edit" data-id="${n.id}" data-testid="note-edit">✎ Düzenle</button><button type="button" class="btn danger-ghost xs" data-act="note-delete" data-id="${n.id}" data-testid="note-delete">🗑 Sil</button>`;
  return `<article class="note ${cur ? "cur" : ""} ${edit ? "editing" : ""}" id="not-${esc(n.id)}" data-testid="note" data-note="${esc(n.id)}">
    <div class="nhead">
      ${edit ? `<input class="ntitle-in" value="${esc(n.title)}" placeholder="Not başlığı" aria-label="Not başlığı" data-testid="note-title-input" maxlength="160" />`
             : `<h2 class="ntitle ${n.title ? "" : "untitled"}" data-testid="note-title">${markText(n.title || "Başlıksız not", ui.hl)}</h2>`}
      <div class="nside">${typeLbl ? `<span class="tag" data-testid="note-type">${esc(typeLbl)}</span>` : ""}${acts}</div>
    </div>
    ${ui.panel === `note-delete:${n.id}` ? `<div class="pbar warn" role="alertdialog" data-testid="note-delete-confirm"><span>“${esc(n.title || "Adsız not")}” notu silinecek (görselleri, kaynakları ve içerik kutularıyla). <b>Kaydet</b>'e basınca kesinleşir; Silinenler'den geri alınabilir.</span><span class="sactions"><button type="button" class="btn danger sm" data-act="note-delete-yes" data-id="${n.id}" data-testid="note-delete-yes">Notu sil</button><button type="button" class="btn ghost sm" data-act="close-panel">Vazgeç</button></span></div>` : ""}
    <section class="nbody" aria-label="Not metni">
      ${edit ? `${TOOLBAR}<div class="edwrap"><div class="editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Not metni" data-placeholder="Notunuzu buraya yazın…" data-testid="editor">${n.html ?? ""}</div>${expandBtn("", "Not metnini geniş pencerede yaz")}</div>`
             : textOf(n.html).trim() ? `<div class="noteview" data-testid="note-view">${markHtml(n.html, ui.hl)}</div>` : `<p class="muted pad">Bu notta metin yok.</p>`}
    </section>
    ${imagesBox(n, edit)}
    ${sourcesBox(n, edit)}
    ${boxesView(n, edit)}
    <footer class="ndates" data-testid="note-dates">${n.createdAt ? `Oluşturuldu <time datetime="${n.createdAt}" data-testid="created">${fmtDate(n.createdAt)}</time><span aria-hidden="true"> · </span>Son güncelleme <time datetime="${n.updatedAt}" data-testid="updated">${fmtDate(n.updatedAt)}</time>` : `<span data-testid="not-saved-yet">Henüz kaydedilmedi — tarih, Kaydet'e bastığınızda yazılır.</span>`}</footer>
  </article>`;
}
const gallery = (list, edit, pre) => `<ul class="gallery">${list.map((g) => `<li class="gitem" data-testid="${pre}image-item">
    <button type="button" class="thumb" data-act="lightbox" data-id="${g.id}" aria-label="Görseli büyüt: ${esc(g.caption || "görsel")}"><img ${imgAttr(g)} alt="${esc(g.caption || "Görsel")}" /></button>
    ${edit ? `<input class="cap" value="${esc(g.caption)}" placeholder="Görsel açıklaması" aria-label="Görsel açıklaması" data-act="caption" data-id="${g.id}" data-testid="${pre}image-caption" maxlength="300" />
           <button type="button" class="link sm danger" data-act="image-remove" data-id="${g.id}" data-testid="${pre}image-remove">Kaldır</button>`
         : `<p class="capview">${g.caption ? markText(g.caption, ui.hl) : "<span class='muted'>Açıklama yok</span>"}</p>`}
  </li>`).join("")}</ul>`;
const sourceForm = (s) => `<form class="sform" data-act="source-save" data-id="${s?.id ?? ""}" data-testid="source-form">
    <input name="title" value="${esc(s?.title ?? "")}" placeholder="Kaynak adı (makale, kitap, site)" required aria-label="Kaynak adı" data-testid="source-title" />
    <input name="authors" value="${esc(s?.authors ?? "")}" placeholder="Yazar(lar) — isteğe bağlı" aria-label="Yazarlar" />
    <input name="year" value="${esc(s?.year ?? "")}" placeholder="Yıl" aria-label="Yıl" inputmode="numeric" maxlength="9" />
    <input name="link" value="${esc(s?.doi || s?.url || "")}" placeholder="DOI (10.xxxx/…) ya da bağlantı (https://…)" aria-label="DOI veya bağlantı" data-testid="source-link" />
    <div class="sactions"><button class="btn primary sm" type="submit" data-testid="source-submit">${s ? "Güncelle" : "Ekle"}</button><button class="btn ghost sm" type="button" data-act="close-panel">Vazgeç</button></div>
    <p class="serr" data-testid="source-error" role="alert"></p>
  </form>`;
const sourceList = (src, edit, pre) => `<ol class="slist">${src.map((s) => (edit && ui.panel === `source-edit:${s.id}` ? `<li>${sourceForm(s)}</li>` : `<li data-testid="${pre}source-item">
    <span class="stitle">${markText(s.title, ui.hl)}</span>${s.authors || s.year ? `<span class="smeta">${esc([s.authors, s.year].filter(Boolean).join(" · "))}</span>` : ""}
    <span class="slinks">${s.doi ? `<a href="https://doi.org/${esc(s.doi)}" target="_blank" rel="noopener noreferrer" data-testid="${pre}source-doi">DOI: ${esc(s.doi)}</a>` : ""}${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-testid="${pre}source-url">Bağlantıyı aç ↗</a>` : ""}
    ${edit ? `<button type="button" class="link sm" data-act="source-edit" data-id="${s.id}" data-testid="${pre}source-edit">Düzenle</button><button type="button" class="link sm danger" data-act="source-delete" data-id="${s.id}" data-testid="${pre}source-delete">Sil</button>` : ""}</span>
  </li>`)).join("")}</ol>`;
function imagesBox(n, E) {
  const imgs = n.images ?? [];
  if (!E && !imgs.length) return "";
  return `<section class="sect" aria-label="Görseller" data-testid="images">
    <div class="shead"><h3 class="slabel">Görseller <span class="count">${imgs.length}</span></h3>
      ${E ? `<label class="btn soft xs upl" data-testid="add-image" tabindex="0">＋ Görsel ekle<input type="file" accept="image/*" data-act="image" hidden /></label>` : ""}</div>
    ${imgs.length ? gallery(imgs, E, "") : `<p class="sempty">Bu notta görsel yok.</p>`}
  </section>`;
}
function sourcesBox(n, E) {
  const src = n.sources ?? [];
  if (!E && !src.length) return "";
  const open = ui.panel === "source-new@";
  return `<section class="sect" aria-label="Kaynaklar" data-testid="sources">
    <div class="shead"><h3 class="slabel">Kaynaklar <span class="count">${src.length}</span></h3>${E && !open ? `<button type="button" class="btn soft xs" data-act="source-new" data-testid="add-source">＋ Kaynak ekle</button>` : ""}</div>
    ${E && open ? sourceForm(null) : ""}
    ${src.length ? sourceList(src, E, "") : E && !open ? `<p class="sempty">Bu notta kaynak yok.</p>` : ""}
  </section>`;
}
/** Notun İÇİNDEKİ, kullanıcının adlandırdığı içerik kutuları (her kutunun kendi metni, görseli, kaynağı, bağlantısı). */
function savedBox(bid) {
  for (const arr of Object.values(saved.notes)) for (const n of arr) for (const b of n.boxes ?? []) if (b.id === bid) return b;
  return null;
}
function boxesView(n, edit) {
  const boxes = n.boxes ?? [];
  const live = boxes.filter((b) => !b.deletedAt);
  if (!edit) return live.length ? `<div class="cboxes" data-testid="boxes">${live.map((b) => boxRead(b)).join("")}</div>` : "";
  const rows = boxes.map((b) => (b.deletedAt ? "" : boxEdit(b))); // R5: silinen kutu taslaktan çıkarılır; geri al satırı yok
  return `<div class="cboxes" data-testid="boxes">${rows.join("")}
    <button type="button" class="btn soft sm boxadd" data-act="box-add" data-testid="box-add">＋ İçerik Kutusu Ekle</button></div>`;
}
function boxRead(b) {
  const links = b.links ?? [];
  return `<section class="cbox" data-box="${b.id}" data-testid="cbox" data-title="${esc(b.title)}">
    <h3 class="cbox-t" data-testid="box-title">${markText(b.title || "Adsız kutu", ui.hl)}</h3>
    ${textOf(b.html).trim() ? `<div class="noteview sm" data-testid="box-view">${markHtml(b.html, ui.hl)}</div>` : ""}
    ${(b.images ?? []).length ? gallery(b.images, false, "box-") : ""}
    ${(b.sources ?? []).length ? `<p class="cbox-k">Kaynaklar</p>${sourceList(b.sources, false, "box-")}` : ""}
    ${links.length ? `<p class="cbox-k">Bağlantılar</p>${linkList(links, false)}` : ""}
  </section>`;
}
const linkList = (links, edit) => `<ul class="llist">${links.map((l) => `<li data-testid="box-link-item"><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(l.title || l.url)} ↗</a>${edit ? ` <button type="button" class="link sm danger" data-act="link-delete" data-id="${l.id}" data-testid="box-link-delete">Sil</button>` : ""}</li>`).join("")}</ul>`;
function boxEdit(b) {
  const p = ui.panel ?? "";
  const srcOpen = p === `source-new@${b.id}`;
  const linkOpen = p === `link-new@${b.id}`;
  return `<section class="cbox editing" data-box="${b.id}" data-testid="cbox" data-title="${esc(b.title)}">
    <div class="cbox-h"><input class="cbox-title-in" value="${esc(b.title)}" placeholder="Kutu adı" aria-label="İçerik kutusunun adı" data-testid="box-title-input" maxlength="120" />
      <button type="button" class="link sm danger" data-act="box-delete" data-id="${b.id}" data-testid="box-delete">🗑 Kutuyu sil</button></div>
    <div class="edwrap"><div class="editor box-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(b.title || "Kutu")} metni" data-placeholder="Bu kutunun metnini yazın…" data-testid="box-editor">${b.html ?? ""}</div>${expandBtn(b.id, `“${b.title || "Adsız kutu"}” metnini geniş pencerede yaz`)}</div>
    ${(b.images ?? []).length ? gallery(b.images, true, "box-") : ""}
    ${(b.sources ?? []).length ? `<p class="cbox-k">Kaynaklar</p>${sourceList(b.sources, true, "box-")}` : ""}
    ${(b.links ?? []).length ? `<p class="cbox-k">Bağlantılar</p>${linkList(b.links, true)}` : ""}
    ${srcOpen ? sourceForm(null) : ""}
    ${linkOpen ? `<form class="sform" data-act="link-save" data-testid="link-form"><input name="title" placeholder="Bağlantı adı (isteğe bağlı)" aria-label="Bağlantı adı" data-testid="link-title" /><input name="url" placeholder="https://…" required aria-label="Web adresi" data-testid="link-url" /><div class="sactions"><button class="btn primary sm" type="submit" data-testid="link-submit">Ekle</button><button class="btn ghost sm" type="button" data-act="close-panel">Vazgeç</button></div><p class="serr" data-testid="link-error" role="alert"></p></form>` : ""}
    <div class="cbox-tools">
      <label class="btn soft xs upl" data-testid="box-add-image" tabindex="0">＋ Görsel<input type="file" accept="image/*" data-act="image" hidden /></label>
      <button type="button" class="btn soft xs" data-act="source-new" data-testid="box-add-source">＋ Kaynak</button>
      <button type="button" class="btn soft xs" data-act="link-new" data-testid="box-add-link">＋ Bağlantı</button>
    </div>
  </section>`;
}
/** Grup başlığı: not editörü yok; alt başlıklar sade liste. Önceden yazılmış notlar KORUNUR ve gösterilir. */
function groupView(h, rootId, E) {
  const { own, tpl } = childrenOf(rootId, h.id);
  const kids = [...own, ...tpl].map((k) => headingInfo(rootId, k)).filter(Boolean);
  const legacy = notesOf(h.id).length;
  return `<section class="groupview" data-testid="group-view">
    <p class="gv-hint">“${esc(h.title)}” bir <b>grup başlığıdır</b>. Notlarınızı aşağıdaki alt başlıklardan birine yazın.</p>
    ${kids.length ? `<ul class="gv-list">${kids.map((k) => {
      const c = filledCount(rootId, k.id);
      return `<li><button type="button" class="gv-item" data-act="select" data-id="${esc(k.id)}" data-testid="group-child" data-title="${esc(k.title)}"><span class="gv-ic" aria-hidden="true">${k.icon}</span><span class="gv-t">${esc(k.title)}</span><span class="gv-c ${c ? "has" : ""}">${c ? `${c} not` : "Henüz not yok"}</span><span class="chev" aria-hidden="true">›</span></button></li>`;
    }).join("")}</ul>` : `<p class="empty">Bu grupta henüz alt başlık yok. Soldaki “＋ Başlık Ekle” ile ekleyebilirsiniz.</p>`}
  </section>
  ${legacy ? `<section class="legacy" data-testid="group-legacy"><h2 class="slabel">Bu grup başlığına daha önce yazılmış notlar</h2><p class="legacy-hint">Bu notlar korunuyor. Yeni notlar alt başlıklara yazılır; isterseniz içeriği uygun alt başlığa kendiniz taşıyabilirsiniz.</p>${notesView(h, E, { legacy: true })}</section>` : ""}`;
}
function topicView() {
  const { rootId, nodeId } = ui.route;
  const t = topicById(rootId);
  const h = headingInfo(rootId, nodeId) ?? headingInfo(rootId, rootId);
  const path = pathOf(rootId, h.id);
  const E = ui.editing;
  const note = selectedNote(h.id);
  const crumbs = path
    .map((p, i) =>
      i === 0
        ? `<button type="button" class="crumb home" data-act="nav" data-view="library" data-testid="back" title="Kütüphaneye dön" aria-label="Kütüphaneye dön (${esc(p.title)})"><span class="crumb-ic" aria-hidden="true">‹</span>${esc(p.title)}</button>`
        : i === path.length - 1
          ? `<b aria-current="page">${esc(p.title)}</b>`
          : `<button type="button" class="crumb" data-act="select" data-id="${esc(p.id)}" data-testid="crumb">${esc(p.title)}</button>`,
    )
    .join(`<span aria-hidden="true" class="sep">›</span>`);
  const related = draft.links.filter((l) => l.a === rootId || l.b === rootId).map((l) => topicById(l.a === rootId ? l.b : l.a)).filter((x) => x && !x.deletedAt);
  return `
  <header class="topbar" data-testid="topbar">
    <nav class="crumbs" data-testid="crumbs" aria-label="Bulunduğunuz yer">${crumbs}</nav>
    <span class="mode ${E ? "edit" : "read"}" data-testid="mode">${E ? "Düzenleme" : "Okuma"}</span>
    ${toolsView(h)}
  </header>
  ${ui.hl ? `<div class="hlbar" role="status" data-testid="hl-bar"><span>🔎 <b>“${esc(ui.hl.trim())}”</b> sarı ile gösteriliyor</span> <button type="button" class="link sm" data-act="clear-search" data-testid="hl-clear">Vurguyu kaldır ✕</button></div>` : ""}
  <div class="workspace">
    ${isMobile() ? "" : `<aside class="side" aria-label="Başlıklar" data-testid="side"><div class="side-head"><span class="side-kicker">Konu</span><b>${esc(t.title)}</b>${headActions()}</div><div class="side-scroll" data-testid="side-scroll">${treeView(rootId, h.id)}</div></aside>`}
    <main class="content ${E ? "editing" : "reading"}" data-testid="note-area">
      <button type="button" class="pick show-m" data-act="sheet" data-testid="pick"><span class="pick-k">Başlık seç:</span> <b>${esc(h.title)}</b> <span aria-hidden="true">▾</span></button>
      <header class="hhead">
        <div class="hhead-main">
          ${ui.panel === "rename" ? `<form class="inline" data-act="rename-submit"><input value="${esc(ui.dup?.mode === "rename" ? ui.dup.raw : ui.renameDraft ?? h.title)}" aria-label="Yeni ad" data-testid="rename-input" maxlength="200" /><button class="btn primary sm" type="submit">Uygula</button><button class="btn ghost sm" type="button" data-act="close-panel">Vazgeç</button></form>`
            : `<h1 class="htitle" data-testid="heading-title"><span aria-hidden="true">${h.icon}</span> ${markText(h.title, ui.hl)}</h1>`}
          ${h.virtual && !isGroupH(h) ? `<p class="hnote" data-testid="ready-hint">Hazır başlık · ${E ? "ilk notla bu konuya eklenir" : "henüz not yok"}</p>` : ""}
        </div>
        ${!h.isRoot && E ? `<button type="button" class="btn danger-ghost sm" data-act="delete" data-testid="delete-heading">🗑 Başlığı sil</button>` : ""}
      </header>
      ${panelView(h, rootId)}
      ${isGroupH(h) ? groupView(h, rootId, E) : noteTabs(h) + notesView(h, E)}
      ${related.length && h.isRoot ? `<section class="related" data-testid="related"><h2 class="slabel">İlgili konular</h2><div class="chips">${related.map((x) => `<button type="button" class="chip link" data-act="open" data-id="${x.id}">${esc(x.title)} ›</button>`).join("")}</div></section>` : ""}
    </main>
  </div>`;
}
function menuView(h) {
  const item = (act, label, dis = false, why = "") => `<button type="button" role="menuitem" data-act="${act}" ${dis ? `disabled title="${esc(why)}"` : ""} data-testid="mi-${act}">${label}${dis && why ? `<small>${esc(why)}</small>` : ""}</button>`;
  const L = "Hazır başlığın adı ve yeri sabittir";
  const tplOrRoot = !!h.templateKey || h.isRoot;
  const note = selectedNote(h.id);
  return `<div class="menu" role="menu" data-testid="menu-list">
    ${item("rename", "✎ Bu başlığın adını değiştir")}
    ${item("up", "↑ Yukarı al", tplOrRoot, h.isRoot ? "" : L)}
    ${item("down", "↓ Aşağı al", tplOrRoot, h.isRoot ? "" : L)}
    ${item("move", "⇄ Başka başlığın altına taşı", tplOrRoot, h.isRoot ? "" : L)}
    <hr />
    ${item("type", "🏷 Notun türünü seç", !note, "Önce bir not yazın")}
    ${item("link", "🔗 İlgili konu bağla")}
    <hr />
    ${item("read", "📖 Tümünü oku")}
    ${item("word", "📄 Word raporu indir")}
    <hr />
    ${item("delete", h.isRoot ? "🗑 Bu konuyu sil" : "🗑 Bu başlığı sil")}
  </div>`;
}
function panelView(h, rootId) {
  if (ui.panel === "move") {
    return `<form class="pbar" data-act="move-submit"><label>Nereye taşınsın?</label><select data-testid="move-select">${parentOptions(rootId, h.id, h.parentId ?? "__root__")}</select><span class="sactions"><button class="btn primary sm" type="submit">Taşı</button><button class="btn ghost sm" type="button" data-act="close-panel">Vazgeç</button></span></form>`;
  }
  if (ui.panel === "addheading") return addHeadingPanel(h, rootId);
  if (ui.panel === "link") {
    const opts = liveTopics().filter((x) => x.id !== rootId);
    return `<form class="pbar" data-act="link-submit"><label>Hangi konuyla ilgili?</label><select>${opts.map((o) => `<option value="${o.id}">${esc(o.title)}</option>`).join("")}</select><span class="sactions"><button class="btn primary sm" type="submit">Bağla</button><button class="btn ghost sm" type="button" data-act="close-panel">Vazgeç</button></span></form>`;
  }
  if (ui.panel === "type") {
    const cur = selectedNote(h.id)?.cls ?? "";
    return `<form class="pbar" data-act="type-submit"><label>Notun türü</label><select>${[{ id: "", label: "Seçilmedi" }, ...NOTE_TYPES].map((o) => `<option value="${o.id}" ${o.id === cur ? "selected" : ""}>${o.label}</option>`).join("")}</select><span class="sactions"><button class="btn primary sm" type="submit">Uygula</button><button class="btn ghost sm" type="button" data-act="close-panel">Vazgeç</button></span></form>`;
  }
  if (ui.panel === "delete") {
    const impact = impactText(impactOf(rootId, h.id));
    return `<div class="pbar warn" role="alertdialog" aria-label="Silme onayı" data-testid="delete-confirm">
      <div><b>“${esc(h.title)}” ${h.isRoot ? "konusu" : "başlığı"} Silinenler'e taşınacak.</b><br/><span data-testid="delete-impact">${impact}</span> <b>Kaydet</b>'e basınca kesinleşir.${h.templateKey ? " Yalnız bu konudan kalkar; diğer konular ve yeni konular etkilenmez." : ""}</div>
      <div class="sactions"><button class="btn danger sm" type="button" data-act="delete-yes" data-testid="delete-yes">Silinenler'e taşı</button><button class="btn ghost sm" type="button" data-act="close-panel" data-testid="delete-no">Vazgeç</button></div>
    </div>`;
  }
  return "";
}
/** "Nereye?" seçenekleri: Ana başlık + konunun tüm başlıkları (girintili). exclude = taşınan başlık ve altı (döngü engeli). */
function parentOptions(rootId, excludeId = null, selected = null) {
  const banned = new Set();
  if (excludeId) {
    banned.add(excludeId);
    for (const k of excludeId === rootId ? [] : flatHeadings(rootId, excludeId)) banned.add(k.id);
  }
  const rows = flatHeadings(rootId).filter((x) => !banned.has(x.id));
  return [`<option value="__root__" ${selected === "__root__" ? "selected" : ""}>Ana başlık (en üst seviye)</option>`, ...rows.map((x) => `<option value="${esc(x.id)}" ${x.id === selected ? "selected" : ""}>${"\u00a0\u00a0".repeat(x.depth + 1)}${x.depth ? "└ " : ""}${esc(x.title)} altında</option>`)].join("");
}
function whereText(rootId, parent, name) {
  const base = parent === "__root__" ? [topicById(rootId).title] : pathOf(rootId, parent).map((p) => p.title);
  return `${base.map(esc).join(" › ")} › <b>${esc(name || "yeni başlık")}</b>`;
}
function addHeadingPanel(h, rootId) {
  const def = h.isRoot ? "__root__" : h.id;
  return `<form class="addpanel" data-act="addheading-submit" data-testid="addchild-form">
    <div class="addpanel-h"><b>Yeni başlık</b><span>Başlık yalnız bu konuya eklenir.</span></div>
    <div class="addpanel-g">
      <label>Başlığın adı<input data-testid="addchild-input" placeholder="Örn. Araştırmalarım" maxlength="200" autocomplete="off" required /></label>
      <label>Nereye eklensin?<select data-testid="addheading-parent">${parentOptions(rootId, null, def)}</select></label>
    </div>
    <fieldset class="kind" data-testid="addheading-kind"><legend>Bu başlık ne için?</legend>
      <label><input type="radio" name="kind" value="not" checked data-testid="kind-not" /> Not yazılacak</label>
      <label><input type="radio" name="kind" value="grup" data-testid="kind-grup" /> Yalnız alt başlıkları gruplayacak</label>
    </fieldset>
    <p class="where" data-testid="addheading-where">Konum: ${whereText(rootId, def, "")}</p>
    <div class="sactions"><button type="submit" class="btn primary sm" data-testid="addheading-submit">Başlığı oluştur</button><button type="button" class="btn ghost sm" data-act="close-panel">Vazgeç</button></div>
  </form>`;
}
/** Başlık Düzenle / Sil: konuya özel yönetim penceresi (hazır başlıklar dahil). */
function manageView() {
  const R = ui.route.rootId;
  const t = topicById(R);
  const rows = flatHeadings(R);
  const row = (x) => {
    const own = !x.templateKey;
    if (ui.mEdit === x.id) {
      return `<li class="mrow edit" style="--d:${x.depth}" data-testid="manage-row" data-title="${esc(x.title)}"><form class="mform" data-act="m-save" data-id="${esc(x.id)}" data-testid="m-form">
        <label>Başlığın adı<input value="${esc(x.title)}" data-testid="m-rename-input" maxlength="200" required /></label>
        ${own ? `<label>Yeri<select data-testid="m-move-select">${parentOptions(R, x.id, x.parentId ?? "__root__")}</select></label><label>Türü<select data-testid="m-kind-select"><option value="not">Not yazılır</option><option value="grup" ${isGroupH(x) ? "selected" : ""}>Grup (yalnız alt başlıklar)</option></select></label>` : `<p class="muted mnote">Hazır başlığın yeri ve türü sabittir; adı yalnız bu konuda değişir.</p>`}
        <div class="sactions"><button type="submit" class="btn primary sm" data-testid="m-apply">Uygula</button><button type="button" class="btn ghost sm" data-act="m-cancel">Vazgeç</button></div></form></li>`;
    }
    return `<li class="mrow" style="--d:${x.depth}" data-testid="manage-row" data-title="${esc(x.title)}">
      <span class="mt"><span aria-hidden="true">${x.icon}</span> ${esc(x.title)} <small>${own ? "sizin" : "hazır"}${isGroupH(x) ? " · grup" : ""}</small></span>
      <span class="mbtns"><button type="button" class="btn ghost xs" data-act="m-edit" data-id="${esc(x.id)}" data-testid="m-edit">✎ Düzenle</button><button type="button" class="btn danger-ghost xs" data-act="m-del" data-id="${esc(x.id)}" data-testid="m-delete">🗑 Sil</button></span>
      ${ui.mDel === x.id ? `<div class="pbar warn mconfirm" role="alertdialog" data-testid="m-delete-confirm"><div><b>“${esc(x.title)}” başlığı Silinenler'e taşınacak.</b><br/><span data-testid="m-delete-impact">${impactText(impactOf(R, x.id))}</span></div><div class="sactions"><button type="button" class="btn danger sm" data-act="m-del-yes" data-id="${esc(x.id)}" data-testid="m-delete-yes">Silinenler'e taşı</button><button type="button" class="btn ghost sm" data-act="m-cancel">Vazgeç</button></div></div>` : ""}
    </li>`;
  };
  return `<div class="overlay" data-testid="manage-overlay"><div class="dialog manage" role="dialog" aria-modal="true" aria-labelledby="mg-t" data-testid="manage">
    <div class="mhead"><div><h2 id="mg-t">Başlıkları düzenle</h2><p>Yalnız <b>${esc(t.title)}</b> konusu için. Hazır başlık şablonu ve diğer konular değişmez.</p></div><button type="button" class="btn primary sm" data-act="manage-close" data-testid="manage-close">Bitti</button></div>
    <ul class="mlist">${rows.map(row).join("") || `<li class="empty">Bu konuda başlık kalmadı. “＋ Başlık Ekle” ile yeni başlık açabilir, silinenleri Silinenler'den geri alabilirsiniz.</li>`}</ul>
    <p class="mfoot">Ad değişikliği, taşıma ve silme <b>Kaydet</b> ile kesinleşir; “Kaydetmeden Çık” hepsini geri alır. Silinenler'den geri alınabilir.</p>
  </div></div>`;
}
function sheetView() {
  const { rootId, nodeId } = ui.route;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="Başlık seç" data-testid="sheet">
    <div class="sheet-head"><b>${esc(topicById(rootId).title)} · başlık seçin</b><button type="button" class="btn ghost sm" data-act="sheet-close">Kapat ✕</button></div>
    <div class="sheet-body">${headActions()}${treeView(rootId, headingInfo(rootId, nodeId)?.id ?? rootId)}</div>
  </div>`;
}
function leaveDialog() {
  return `<div class="overlay" data-testid="leave-overlay"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="leave-t" aria-describedby="leave-d" data-testid="leave-dialog">
    <h2 id="leave-t">Kaydedilmemiş değişiklikleriniz var</h2>
    <p id="leave-d">Bu sayfadaki son değişiklikler henüz kaydedilmedi. Ne yapmak istersiniz?</p>
    <div class="dactions">
      <button type="button" class="btn primary" data-act="leave-save" data-testid="leave-save">💾 Kaydet ve Çık</button>
      <button type="button" class="btn danger-ghost" data-act="leave-drop" data-testid="leave-drop">Kaydetmeden Çık</button>
      <button type="button" class="btn ghost" data-act="leave-continue" data-testid="leave-continue">Düzenlemeye Devam Et</button>
    </div>
    <p class="dnote">“Kaydetmeden Çık” yalnız son, kaydedilmemiş değişiklikleri (silme ve geri almalar dahil) bırakır; daha önce kaydettiğiniz bilgiler aynen kalır.</p>
  </div></div>`;
}
function lightboxView() {
  const g = Object.values(draft.notes).flat().flatMap((n) => [...(n.images ?? []), ...(n.boxes ?? []).flatMap((b) => b.images ?? [])]).find((x) => x.id === ui.lightbox);
  if (!g) return "";
  return `<div class="overlay" data-act="lightbox-close" data-testid="lightbox"><figure class="lb"><img ${imgAttr(g)} alt="${esc(g.caption)}" /><figcaption>${esc(g.caption)}</figcaption><button type="button" class="btn ghost sm" data-act="lightbox-close">Kapat ✕</button></figure></div>`;
}
function readView() {
  const { rootId } = ui.route;
  const t = topicById(rootId);
  const secs = [];
  const walk = (id, num, depth) => {
    const { own, tpl } = childrenOf(rootId, id);
    let i = 0;
    for (const k of [...own, ...tpl]) {
      if (parseV(k) || !filledCount(rootId, k)) continue;
      i += 1;
      secs.push({ h: headingInfo(rootId, k), num: `${num}${i}`, depth });
      walk(k, `${num}${i}.`, depth + 1);
    }
  };
  walk(null, "", 1);
  const part = (x) => `${textOf(x.html).trim() ? `<div class="rnote">${markHtml(x.html, ui.hl)}</div>` : ""}${(x.images ?? []).length ? `<div class="rimgs">${x.images.map((g) => `<figure><img ${imgAttr(g)} alt="${esc(g.caption)}"/><figcaption>${esc(g.caption)}</figcaption></figure>`).join("")}</div>` : ""}${(x.sources ?? []).length ? `<p class="rsrc">Kaynaklar: ${x.sources.map((s) => esc(s.title) + (s.doi ? ` (DOI: ${esc(s.doi)})` : "")).join(" · ")}</p>` : ""}${(x.links ?? []).length ? `<p class="rsrc">Bağlantılar: ${x.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title || l.url)}</a>`).join(" · ")}</p>` : ""}`;
  const notesHtml = (hid) => notesOf(hid).map((n) => `<div class="rnoteblock" data-testid="read-note"><h3>${markText(n.title || "Adsız not", ui.hl)}</h3>${part(n)}${(n.boxes ?? []).filter((b) => !b.deletedAt).map((b) => `<div class="rbox" data-testid="read-box"><h4>${markText(b.title || "Adsız kutu", ui.hl)}</h4>${part(b)}</div>`).join("")}</div>`).join("");
  return `<header class="topbar"><button type="button" class="btn ghost sm" data-act="back-topic" data-testid="back-topic">← Konuya dön</button><p class="crumbs"><b>${esc(t.title)}</b> · tümünü oku</p><div class="tools"><button type="button" class="btn ghost sm" data-act="word">📄 Word</button></div></header>
  <main class="readview sheetcard" data-testid="read-view">
    <h1 class="ptitle big">${markText(t.title, ui.hl)}</h1>
    ${notesHtml(rootId)}
    ${secs.map((s) => `<section class="rsec" style="--d:${s.depth}"><h2><span class="num">${s.num}</span> ${markText(s.h.title, ui.hl)}</h2>${notesHtml(s.h.id)}</section>`).join("") || (notesOf(rootId).length ? "" : `<p class="empty">Bu konuda henüz not yok.</p>`)}
  </main>`;
}
function trashView() {
  // Kaynak = ekrandaki taslak: geri almalar Kaydet'e kadar BEKLER (başlıkta Kaydet/Vazgeç çıkar).
  const tt = draft.topics.filter((t) => t.deletedAt);
  const nn = draft.nodes.filter((n) => n.deletedAt && !draft.nodes.some((p) => p.id === n.parentId && p.deletedAt && p.deleteBatch && p.deleteBatch === n.deleteBatch));
  const notes = [];
  for (const [hid, arr] of Object.entries(draft.notes)) {
    for (const n of arr) {
      if (n.deletedAt) continue;
      for (const b of n.boxes ?? []) if (b.deletedAt && savedBox(b.id)?.deletedAt) notes.push({ id: b.id, kind: "kutu", title: `${b.title || "Adsız kutu"} · ${n.title || "Adsız not"}`, hid });
    }
    for (const n of arr) {
      if (!n.deletedAt || n.inBatch) continue;
      const node = draft.nodes.find((x) => x.id === hid);
      const root = draft.topics.find((t) => t.id === (node ? node.rootId : hid));
      notes.push({ id: n.id, kind: "not", title: `${n.title || "Adsız not"} · ${root?.title ?? ""}${node ? ` › ${node.title}` : ""}`, hid });
    }
  }
  const rows = [...tt.map((t) => ({ id: t.id, kind: "konu", title: t.title })), ...nn.map((n) => ({ id: n.id, kind: "başlık", title: `${n.title} · ${draft.topics.find((t) => t.id === n.rootId)?.title ?? ""}` })), ...notes];
  const ic = { konu: "📁", başlık: "📄", not: "🗒", kutu: "🗂" };
  return `${pageHead("Silinenler", "Silinen konular, alt başlıklar ve notlar 30 gün burada durur. “Geri al”, Kaydet'e bastığınızda kesinleşir.", "← Kütüphanem", "library")}
  <main class="sheetcard" data-testid="trash-view">
  <ul class="list">${rows.map((x) => `<li><div class="row static"><span class="row-title">${ic[x.kind]} ${esc(x.title)} <small class="muted">· ${x.kind}</small></span><button type="button" class="btn ghost sm" data-act="restore" data-id="${x.id}" data-kind="${x.kind}" data-hid="${x.hid ?? ""}" data-testid="restore" data-title="${esc(x.title)}">↺ Geri al</button></div></li>`).join("") || `<li class="empty">Silinen kayıt yok.</li>`}</ul></main>`;
}
let toastTimer = null;
function toast(msg, kind = "ok") {
  $app.querySelector(".toast")?.remove();
  $app.insertAdjacentHTML("beforeend", `<div class="toast ${kind}" role="status" data-testid="toast">${esc(msg)}</div>`);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $app.querySelector(".toast")?.remove(), 3200);
}
function focusEditor(sel = "[data-testid=editor]") {
  if (isMobile()) return;
  // Eşzamanlı: ekran çizildiği anda odak hazır (ilk tuşlar kaybolmaz).
  const ed = $app.querySelector(sel);
  if (!ed || ui.leave || (sel === "[data-testid=editor]" && document.activeElement?.matches?.("input,select,textarea"))) return;
  ed.focus({ preventScroll: true });
  if (ed.isContentEditable) {
    const s = getSelection();
    s.selectAllChildren(ed);
    s.collapseToEnd();
  }
}

// ── Olaylar ─────────────────────────────────────────────────────────────────────
const curInfo = () => headingInfo(ui.route.rootId, ui.route.nodeId);
function ensureHeading() {
  const R = ui.route.rootId;
  const h = curInfo();
  if (!h.virtual) return h.id;
  const real = materialize(R, h.id);
  ui.materialized[real] = h.id;
  ui.route.nodeId = real;
  for (const p of pathOf(R, real)) ui.expanded.add(p.id);
  history.replaceState(null, "", hashOf(ui.route));
  try {
    localStorage.setItem(LAST + R, real);
  } catch {
    /* yoksay */
  }
  return real;
}
const blankNote = (title) => ({ id: uid(), title, html: "", cls: "", sources: [], images: [], boxes: [], createdAt: null, updatedAt: null, deletedAt: null });
/** Tıklanan öğenin sahibi: içerik kutusu (data-box) ya da düzenlenen notun kendisi. */
function targetOf(el) {
  const n = ensureNote();
  const bid = el?.closest?.("[data-box]")?.dataset.box;
  return (bid && (n.boxes ?? []).find((b) => b.id === bid)) || n;
}
const scrollToNote = (id) => document.getElementById(`not-${id}`)?.scrollIntoView({ block: "start", behavior: "instant" });
/** Seçili notu döndürür; başlıkta hiç not yoksa (ilk yazımda) yeni bağımsız not oluşturur. */
function ensureNote() {
  const hid = ensureHeading();
  let n = selectedNote(hid);
  if (!n) {
    n = blankNote("");
    (draft.notes[hid] ??= []).push(n);
    ui.noteSel[hid] = n.id;
    $app.querySelector("[data-testid=note]")?.setAttribute("data-note", n.id);
    const ti = $app.querySelector("[data-testid=note-title-input]");
    if (ti && !ti.value) ti.value = n.title;
  }
  return n;
}
function newNote() {
  ui.menu = false;
  ui.editing = true;
  const hid = ensureHeading();
  const n = blankNote("");
  (draft.notes[hid] ??= []).push(n);
  ui.noteSel[hid] = n.id;
  ui.panel = null;
  render();
  scrollToNote(n.id); // yeni not, mevcut notların ALTINA eklenir
  if (!isMobile()) {
    const ti = $app.querySelector("[data-testid=note-title-input]");
    ti?.focus({ preventScroll: true });
  }
}
function onEditorInput() {
  const ed = $app.querySelector("[data-testid=editor]");
  if (!ed) return;
  ensureNote().html = ed.innerHTML; // tarih YAZILMAZ: yalnız Kaydet'te
  renderChrome();
}
/** Büyütülmüş yazma penceresi. Metin her tuşta İLGİLİ alana (not ya da o kutu) yazılır → kapatınca kayıp olmaz. */
const expandBtn = (bid, label) => `<button type="button" class="expbtn" data-act="expand" data-box="${esc(bid)}" aria-label="${esc(label)}" title="Büyüt" data-testid="${bid ? "box-expand" : "expand"}">⤢</button>`;
function expandTarget(create = false) {
  const X = ui.expand;
  if (!X) return null;
  const n = create ? ensureNote() : selectedNote(curInfo()?.id);
  if (!X.box) return n ?? null;
  return (n?.boxes ?? []).find((b) => b.id === X.box && !b.deletedAt) ?? null;
}
function expandView() {
  const box = !!ui.expand.box;
  const t = expandTarget();
  if (box && !t) return "";
  const name = box ? t.title || "Adsız kutu" : t?.title || "";
  return `<div class="overlay xover" data-testid="expand-overlay"><div class="dialog xpand" role="dialog" aria-modal="true" aria-labelledby="xp-t" data-testid="expand-dialog" data-target="${box ? `box:${esc(ui.expand.box)}` : "note"}">
    <div class="xhead"><h2 id="xp-t">${box ? "İçerik kutusu" : "Not metni"}${name ? ` · <span class="xname">${esc(name)}</span>` : ""}</h2><button type="button" class="xclose" data-act="expand-close" aria-label="Pencereyi kapat (yazdıklarınız korunur)" title="Kapat" data-testid="expand-close">✕</button></div>
    ${box ? "" : TOOLBAR}
    <div class="editor xeditor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${box ? "Kutu metni" : "Not metni"} — geniş yazma alanı" data-placeholder="${box ? "Bu kutunun metnini yazın…" : "Notunuzu buraya yazın…"}" data-testid="expand-editor">${t?.html ?? ""}</div>
  </div></div>`;
}
function openExpand(bid) {
  ui.menu = false;
  ui.panel = null;
  ui.expand = { box: bid };
  render();
  const xe = $app.querySelector("[data-testid=expand-editor]");
  if (xe && !isMobile()) {
    xe.focus({ preventScroll: true });
    const s = getSelection();
    s.selectAllChildren(xe);
    s.collapseToEnd();
  }
}
function syncExpand(xe) {
  const t = expandTarget(true);
  if (t) t.html = xe.innerHTML; // tarih YAZILMAZ: yalnız Kaydet'te
  renderChrome();
}
function closeExpand() {
  const X = ui.expand;
  if (!X) return;
  const xe = $app.querySelector("[data-testid=expand-editor]");
  if (xe && (expandTarget()?.html ?? "") !== xe.innerHTML) syncExpand(xe); // son değişiklik de kesin aktarılsın
  ui.expand = null;
  render();
  const sel = X.box ? `[data-box="${X.box}"] [data-testid=box-editor]` : "[data-testid=editor]";
  $app.querySelector(sel)?.scrollIntoView({ block: "nearest" });
  focusEditor(sel);
}
function startEdit() {
  ui.editing = true;
  ui.menu = false;
  render();
  focusEditor();
}
on($app, "mousedown", (e) => {
  if (e.target.closest("[data-cmd]")) e.preventDefault();
});
on($app, "click", (e) => {
  const cmd = e.target.closest("[data-cmd]");
  if (cmd) {
    e.preventDefault();
    document.execCommand(cmd.dataset.cmd);
    const xe = $app.querySelector("[data-testid=expand-editor]");
    if (xe && cmd.closest("[data-testid=expand-dialog]")) syncExpand(xe);
    else onEditorInput();
    return;
  }
  const el = e.target.closest("[data-act]");
  if (!el || el.tagName === "FORM" || (el.tagName === "INPUT" && el.type !== "checkbox")) {
    if (ui.menu && !e.target.closest(".menuwrap")) {
      ui.menu = false;
      render();
    }
    return;
  }
  if (el.tagName === "A") e.preventDefault();
  if (el.dataset.act === "lightbox-close" && e.target.closest(".lb") && !e.target.closest("button")) return;
  const a = el.dataset.act;
  const id = el.dataset.id;
  const R = ui.route.rootId;
  switch (a) {
    case "nav": go({ view: el.dataset.view }); break;
    case "clear-search": ui.q = ""; ui.hl = ""; ui.reviewed = new Set(); render(); break;
    case "open": {
      const res = searchResults(ui.q);
      const hit = res?.find((r) => r.topic.id === id);
      if (hit) {
        ui.reviewed.add(id);
        ui.hl = ui.q;
        ui.scrollToHit = true;
        openTopic(id, hit.nodeId, hit.noteId);
      } else {
        ui.hl = "";
        openTopic(id);
      }
      break;
    }
    case "toggle": ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id); render(); break;
    case "select": ui.expanded.add(id); go({ view: "topic", rootId: R, nodeId: id }); break;
    case "note": ui.noteSel[ui.route.nodeId] = id; ui.panel = null; render(); scrollToNote(id); if (ui.editing) focusEditor(); break;
    case "note-edit": ui.noteSel[ui.route.nodeId] = id; ui.panel = null; ui.editing = true; ui.menu = false; render(); scrollToNote(id); focusEditor(); break;
    case "new-note": newNote(); break;
    case "note-delete": {
      const nid = id ?? selectedNote(curInfo().id)?.id;
      ui.noteSel[ui.route.nodeId] = nid;
      ui.editing = true;
      ui.panel = `note-delete:${nid}`;
      render();
      $app.querySelector("[data-testid=note-delete-confirm]")?.scrollIntoView({ block: "nearest" });
      break;
    }
    case "note-delete-yes": {
      const hid = curInfo().id;
      const n = notesOf(hid).find((x) => x.id === id) ?? selectedNote(hid);
      if (n) {
        n.deletedAt = new Date().toISOString();
        n.deleteBatch = uid();
        delete ui.noteSel[hid];
      }
      ui.panel = null;
      render();
      toast("Not silinmek üzere işaretlendi; Kaydet'e basınca kesinleşir.", "info");
      break;
    }
    case "sheet": ui.sheet = true; render(); break;
    case "sheet-close": ui.sheetScroll = $app.querySelector(".sheet-body")?.scrollTop ?? 0; ui.sheet = false; render(); break;
    case "menu": ui.menu = !ui.menu; render(); break;
    case "close-panel": ui.panel = null; ui.renameDraft = null; render(); break;
    case "dup-open": dupChoice("open", id); break;
    case "dup-create": dupChoice("create"); break;
    case "dup-cancel": dupChoice("cancel"); break;
    case "dup-back": ui.dup.pick = false; render(); break;
    case "edit": startEdit(); break;
    case "save":
      void save().then((ok) => {
        if (ok) {
          ui.editing = false;
          ui.panel = null;
        }
        render();
      });
      break;
    case "cancel": cancelEditing(); break;
    case "leave-save": leaveChoice("kaydet"); break;
    case "leave-drop": leaveChoice("birak"); break;
    case "leave-continue": leaveChoice("devam"); break;
    case "addheading":
      ui.menu = false;
      ui.manage = false;
      ui.editing = true;
      ui.panel = "addheading";
      if (ui.sheet) ui.sheetScroll = $app.querySelector(".sheet-body")?.scrollTop ?? 0;
      ui.sheet = false;
      render();
      $app.querySelector("[data-testid=addchild-form]")?.scrollIntoView({ block: "nearest" });
      $app.querySelector("[data-testid=addchild-input]")?.focus({ preventScroll: true });
      break;
    case "manage":
      ui.menu = false;
      ui.editing = true;
      ui.manage = true;
      ui.mEdit = ui.mDel = null;
      ui.panel = null;
      if (ui.sheet) ui.sheetScroll = $app.querySelector(".sheet-body")?.scrollTop ?? 0;
      ui.sheet = false;
      render();
      break;
    case "manage-close": ui.manage = false; ui.mEdit = ui.mDel = null; render(); break;
    case "m-edit": ui.mEdit = id; ui.mDel = null; render(); $app.querySelector("[data-testid=m-rename-input]")?.select(); break;
    case "m-del": ui.mDel = id; ui.mEdit = null; render(); break;
    case "m-cancel": ui.mEdit = ui.mDel = null; render(); break;
    case "m-del-yes":
      deleteHeading(R, id);
      ui.mDel = null;
      fixRoute();
      render();
      toast("Silinmek üzere işaretlendi; Kaydet'e basınca Silinenler'e gider.", "info");
      break;
    case "rename": case "move": case "link": case "type":
      ui.menu = false;
      ui.editing = true;
      ui.panel = a;
      render();
      $app.querySelector("[data-testid=rename-input]")?.select();
      break;
    case "delete": ui.menu = false; ui.editing = true; ui.panel = "delete"; render(); break;
    case "source-new": ui.panel = `source-new@${el.closest("[data-box]")?.dataset.box ?? ""}`; render(); $app.querySelector("[data-testid=source-title]")?.focus(); break;
    case "link-new": ui.panel = `link-new@${el.closest("[data-box]")?.dataset.box ?? ""}`; render(); $app.querySelector("[data-testid=link-url]")?.focus(); break;
    case "link-delete": { const b = targetOf(el); b.links = (b.links ?? []).filter((l) => l.id !== id); render(); break; }
    case "box-add": {
      const n = ensureNote();
      const b = { id: uid(), title: "", html: "", images: [], sources: [], links: [], deletedAt: null };
      (n.boxes ??= []).push(b);
      ui.panel = null;
      render();
      const inp = $app.querySelector(`[data-box="${b.id}"] [data-testid=box-title-input]`);
      inp?.scrollIntoView({ block: "center" });
      if (!isMobile()) inp?.focus({ preventScroll: true });
      break;
    }
    case "box-delete": {
      // R5: kutu (metni, görselleri, kaynakları, bağlantıları) taslaktan tamamen çıkarılır; Silinenler'e gitmez.
      // Kaydet → kalıcı silinir · Kaydetmeden Çık → kayıtlı veri aynen kalır.
      const n = ensureNote();
      n.boxes = (n.boxes ?? []).filter((x) => x.id !== id);
      ui.panel = null;
      render();
      break;
    }
    case "expand": openExpand(el.dataset.box || null); break;
    case "expand-close": closeExpand(); break;
    case "source-edit": ui.panel = `source-edit:${id}`; render(); break;
    case "source-delete": { const t = targetOf(el); t.sources = (t.sources ?? []).filter((s) => s.id !== id); render(); break; }
    case "image-remove": { const t = targetOf(el); t.images = (t.images ?? []).filter((g) => g.id !== id); render(); break; }
    case "lightbox": ui.lightbox = id; render(); break;
    case "lightbox-close": ui.lightbox = null; render(); break;
    case "up": case "down": {
      const n = realNode(ui.route.nodeId);
      if (!n) break;
      ui.editing = true;
      const sib = draft.nodes.filter((x) => x.rootId === n.rootId && x.parentId === n.parentId && !x.deletedAt && !x.templateKey).sort((p, q) => p.order - q.order);
      const i = sib.findIndex((x) => x.id === n.id);
      const j = a === "up" ? i - 1 : i + 1;
      if (j >= 0 && j < sib.length) [sib[i].order, sib[j].order] = [sib[j].order, sib[i].order];
      ui.menu = false;
      render();
      break;
    }
    case "delete-yes": {
      // Taslakta işaretlenir; Kaydet ile kesinleşir, "Kaydetmeden Çık" geri alır.
      const h = curInfo();
      if (h.isRoot) {
        topicById(R).deletedAt = new Date().toISOString();
        navigate({ view: "library" }); // kaydedilmemiş silme kütüphane başlığında Kaydet/Vazgeç ile bekler
      } else {
        deleteHeading(R, h.id);
        fixRoute();
        navigate({ ...ui.route }, { keepEditing: true });
      }
      toast("Silinmek üzere işaretlendi; Kaydet'e basınca Silinenler'e gider.", "info");
      break;
    }
    case "restore": {
      const kind = el.dataset.kind;
      if (kind === "kutu") {
        const b = (draft.notes[el.dataset.hid] ?? []).flatMap((n) => n.boxes ?? []).find((x) => x.id === id);
        if (b) b.deletedAt = null;
      } else if (kind === "konu") topicById(id).deletedAt = null;
      else if (kind === "not") {
        const n = (draft.notes[el.dataset.hid] ?? []).find((x) => x.id === id);
        if (n) { n.deletedAt = null; delete n.deleteBatch; }
      } else {
        const n = draft.nodes.find((x) => x.id === id);
        const batch = n.deleteBatch;
        for (const m of draft.nodes) if (batch && m.deleteBatch === batch) { m.deletedAt = null; delete m.deleteBatch; }
        for (const arr of Object.values(draft.notes)) for (const nt of arr) if (batch && nt.deleteBatch === batch) { nt.deletedAt = null; delete nt.deleteBatch; delete nt.inBatch; }
        n.deletedAt = null;
        delete n.deleteBatch;
      }
      render();
      toast("Geri alınmak üzere işaretlendi; Kaydet'e basınca kesinleşir.", "info");
      break;
    }
    case "read": ui.menu = false; go({ view: "read", rootId: R }); break;
    case "back-topic": openTopic(R); break;
    case "word": ui.menu = false; downloadWord(R); break;
    case "reload": void boot(); break;
  }
});
on($app, "submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const a = f.dataset.act;
  const R = ui.route.rootId;
  if (a === "create") {
    const title = f.querySelector("input").value.trim();
    if (!title) return;
    const same = sameNameTopics(title);
    if (same.length) {
      ui.newTitle = f.querySelector("input").value;
      ui.dup = { mode: "create", title, raw: ui.newTitle, ids: same.map((t) => t.id), pick: false };
      return render();
    }
    createTopic(title);
  } else if (a === "addheading-submit") {
    const title = f.querySelector("input").value.trim();
    if (!title) return;
    const sel = f.querySelector("select").value;
    const parent = sel === "__root__" || sel === R ? null : materialize(R, sel);
    const sib = draft.nodes.filter((n) => n.rootId === R && n.parentId === parent && !n.templateKey && !n.deletedAt);
    const n = { id: uid(), rootId: R, parentId: parent, title, templateKey: null, order: sib.length + 1, deletedAt: null };
    if (f.elements.kind?.value === "grup") n.kind = "grup";
    draft.nodes.push(n);
    if (parent) ui.expanded.add(parent);
    ui.editing = true;
    navigate({ view: "topic", rootId: R, nodeId: n.id }, { keepEditing: true });
  } else if (a === "rename-submit") {
    const v = f.querySelector("input").value.trim();
    const h = curInfo();
    if (v && h.isRoot && nameKey(v) !== nameKey(h.title)) {
      const same = sameNameTopics(v, R); // konu kendisiyle karşılaştırılmaz
      if (same.length) {
        ui.dup = { mode: "rename", title: v, raw: f.querySelector("input").value, rootId: R, ids: same.map((t) => t.id), pick: false };
        return render();
      }
    }
    if (v) renameHeading(R, h.id, v);
    ui.panel = null;
    ui.renameDraft = null;
    render();
  } else if (a === "move-submit") {
    const to = f.querySelector("select").value;
    const n = realNode(ui.route.nodeId);
    if (n && !n.templateKey) n.parentId = to === "__root__" || to === R ? null : materialize(R, to);
    ui.panel = null;
    render();
  } else if (a === "m-save") {
    const id = f.dataset.id;
    const v = f.querySelector("input").value.trim();
    if (!v) return;
    const h = headingInfo(R, id);
    if (h && v !== h.title) renameHeading(R, id, v);
    const mv = f.querySelector("[data-testid=m-move-select]");
    const n = realNode(id);
    const kd = f.querySelector("[data-testid=m-kind-select]");
    if (kd && n && !n.templateKey) kd.value === "grup" ? (n.kind = "grup") : delete n.kind; // notlar korunur
    if (mv && n && !n.templateKey) {
      const to = mv.value === "__root__" ? null : materialize(R, mv.value);
      if (to !== n.parentId) n.parentId = to;
    }
    ui.mEdit = null;
    render();
    return;
  } else if (a === "link-submit") {
    const to = f.querySelector("select").value;
    if (to && !draft.links.some((l) => (l.a === R && l.b === to) || (l.b === R && l.a === to))) draft.links.push({ a: R, b: to });
    ui.panel = null;
    render();
  } else if (a === "type-submit") {
    ensureNote().cls = f.querySelector("select").value;
    ui.panel = null;
    render();
  } else if (a === "link-save") {
    const url = f.elements.url.value.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      f.querySelector("[data-testid=link-error]").textContent = "Bağlantı https:// ile başlamalı.";
      return;
    }
    const b = targetOf(f);
    (b.links ??= []).push({ id: uid(), title: f.elements.title.value.trim(), url });
    ui.panel = null;
    render();
  } else if (a === "source-save") {
    const title = f.elements.title.value.trim();
    const link = f.elements.link.value.trim();
    const err = f.querySelector("[data-testid=source-error]");
    const doi = link.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
    const isDoi = /^10\.\d{4,9}\/\S+$/.test(doi);
    const isUrl = /^https?:\/\/\S+$/i.test(link);
    if (!title) return;
    if (link && !isDoi && !isUrl) {
      err.textContent = "DOI 10.xxxx/… biçiminde, bağlantı https:// ile başlamalı.";
      return;
    }
    const n = targetOf(f);
    const rec = { id: f.dataset.id || uid(), title, authors: f.elements.authors.value.trim(), year: f.elements.year.value.trim(), doi: isDoi ? doi : "", url: !isDoi && isUrl ? link : "" };
    n.sources ??= [];
    const i = n.sources.findIndex((s) => s.id === rec.id);
    if (i >= 0) n.sources[i] = rec;
    else n.sources.push(rec);
    ui.panel = null;
    render();
  }
  renderChrome();
});
on($app, "keydown", (e) => {
  // Not başlığında Enter → metne geç
  if (e.key === "Enter" && e.target.matches("[data-testid=note-title-input]")) {
    e.preventDefault();
    focusEditor();
  }
});
on($app, "input", (e) => {
  if (e.target.matches("[data-testid=expand-editor]")) return syncExpand(e.target);
  if (e.target.matches("[data-testid=editor]")) return onEditorInput();
  if (e.target.matches("[data-testid=note-title-input]")) {
    ensureNote().title = e.target.value;
    return renderChrome();
  }
  if (e.target.matches("[data-testid=box-editor]")) {
    targetOf(e.target).html = e.target.innerHTML; // kutu metni → notun içeriği (tarih yalnız Kaydet'te)
    return renderChrome();
  }
  if (e.target.matches("[data-testid=box-title-input]")) {
    targetOf(e.target).title = e.target.value;
    return renderChrome();
  }
  if (e.target.matches("[data-act=caption]")) {
    const g = (targetOf(e.target).images ?? []).find((x) => x.id === e.target.dataset.id);
    if (g) g.caption = e.target.value;
    return renderChrome();
  }
  if (e.target.matches("[data-testid=search]")) {
    const before = fold(ui.q).trim();
    ui.q = e.target.value;
    if (fold(ui.q).trim() !== before) ui.reviewed = new Set();
    ui.hl = fold(ui.q).trim().length >= 2 ? ui.q : "";
    ui.keepSearchFocus = true;
    render();
    ui.keepSearchFocus = false;
  }
  if (e.target.matches("[data-testid=new-title]")) ui.newTitle = e.target.value;
  if (e.target.closest("[data-testid=addchild-form]")) updateWhere(e.target.closest("form"));
});
function updateWhere(f) {
  const w = f.querySelector("[data-testid=addheading-where]");
  if (w) w.innerHTML = `Konum: ${whereText(ui.route.rootId, f.querySelector("select").value, f.querySelector("input").value.trim())}`;
}
on($app, "change", (e) => {
  if (e.target.matches("[data-testid=addheading-parent]")) return updateWhere(e.target.closest("form"));
  if (!e.target.matches("[data-act=image]")) return;
  const owner = e.target;
  const file = e.target.files?.[0];
  if (!file) return;
  if (file.type && !/^image\//.test(file.type)) return toast("Yalnız görsel dosyası eklenebilir.", "err");
  const target = targetOf(owner);
  e.target.value = "";
  toast("Görsel yükleniyor…", "info");
  // Ürün yükleme hattı (lib/sifa-rehberi-v2/assetClient): küçültme + özel depo + doğrulama; yalnız kimlik saklanır.
  env.uploadImage(file).then(
    (id) => {
      (target.images ??= []).push({ id, src: `asset:${id}`, caption: file.name.replace(/\.[a-z0-9]+$/i, "") });
      render();
      toast("Görsel bu nota eklendi. Kalıcı olması için Kaydet'e basın.");
    },
    (err) => toast(`Görsel yüklenemedi: ${err.message}`, "err"),
  );
});
on(document, "keydown", (e) => {
  if (e.key === "Escape") {
    if (ui.dup) return dupChoice("cancel");
    if (ui.expand) return closeExpand();
    if (ui.leave) return leaveChoice("devam");
    if (ui.manage) {
      ui.manage = false;
      ui.mEdit = ui.mDel = null;
      return render();
    }
    if (ui.sheet || ui.menu || ui.panel || ui.lightbox) {
      if (ui.sheet) ui.sheetScroll = $app.querySelector(".sheet-body")?.scrollTop ?? 0;
      ui.sheet = false;
      ui.menu = false;
      ui.panel = null;
      ui.lightbox = null;
      render();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && dirty()) {
    e.preventDefault();
    void save().then((ok) => {
      if (ok) {
        ui.editing = false;
        ui.expand = null;
        render();
      }
    });
  }
});

async function downloadWord(rootId) {
  const t = topicById(rootId);
  try {
    await env.downloadWord(rootId, t?.title ?? "Sifa-Rehberi");
    toast("Word raporu indirildi (kayıtlı içerik).");
  } catch (e) {
    toast(`Word raporu oluşturulamadı: ${e.message}`, "err");
  }
}

// ── Görsel gösterimi: özel depodaki görsel kısa ömürlü imzalı bağlantıyla (kimlik → bağlantı önbelleği) ──
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const URL_TTL_MS = 240_000;
const assetUrls = new Map();
const assetIdOf = (src) => (String(src ?? "").startsWith("asset:") ? String(src).slice(6) : null);
const freshUrl = (id) => {
  const c = assetUrls.get(id);
  return c && Date.now() - c.at < URL_TTL_MS ? c.url : null;
};
function imgAttr(g) {
  const id = assetIdOf(g.src);
  if (!id) return `src="${esc(g.src)}"`;
  return `src="${esc(freshUrl(id) ?? PIXEL)}" data-asset="${esc(id)}"`;
}
let resolving = false;
async function resolveImages() {
  const need = [...new Set([...$app.querySelectorAll("img[data-asset]")].map((i) => i.dataset.asset).filter((id) => !freshUrl(id)))];
  if (need.length && !resolving) {
    resolving = true;
    try {
      const urls = await env.signedUrls(need);
      const now = Date.now();
      for (const [id, u] of Object.entries(urls)) assetUrls.set(id, { url: u, at: now });
    } catch {
      /* görsel bağlantısı alınamadı — yer tutucu kalır, sonraki çizimde yeniden denenir */
    } finally {
      resolving = false;
    }
  }
  for (const img of $app.querySelectorAll("img[data-asset]")) {
    const u = freshUrl(img.dataset.asset);
    if (u && img.getAttribute("src") !== u) img.src = u;
  }
}

// ── Uygulama içi bağlantıyla ayrılma (sol menü vb.): kaydedilmemiş değişiklikte aynı 3 seçenekli pencere ──
on(
  document,
  "click",
  (e) => {
    if (!dirty() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    if (!a || $app.contains(a) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    e.stopPropagation();
    ui.leave = { target: null, external: url.href };
    render();
  },
  true,
);

async function boot() {
  ui.loading = true;
  ui.loadError = null;
  render();
  try {
    applyLoaded(await env.load());
    ui.loading = false;
    ui.route = fromHash();
    validRoute(true);
    render();
  } catch (e) {
    ui.loading = false;
    ui.loadError = `Araştırma kütüphaneniz yüklenemedi: ${e.message}`;
    render();
  }
}
void boot();

return () => {
  for (const off of offs.splice(0)) off();
  clearTimeout(toastTimer);
  $app.innerHTML = "";
};
}
