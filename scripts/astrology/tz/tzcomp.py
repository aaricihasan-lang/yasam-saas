# Minimal zic-benzeri derleyici (salt IANA kaynak metninden). Iki derleme uretir:
#   default  = africa..southamerica + etcetera + backward   (ICU/Node ve Python tzdata ile ayni secim)
#   backzone = default + backzone (PACKRATDATA=backzone, PACKRATLIST= bos = tum backzone)
# Cikti: zone -> [(utc_saniye, ofset_saniye), ...] (ilk eleman -inf).
import re, os, calendar, bisect
# Kaynak: resmi IANA tzdata metin dosyalari (tzdata-latest.tar.gz acilmis klasor). TZDATA_SRC ile verilir.
SRC = os.environ.get("TZDATA_SRC", "")
MAIN = ["africa","antarctica","asia","australasia","europe","northamerica","southamerica","etcetera","backward"]
MON = {m:i for i,m in enumerate(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],1)}
DOW = {d:i for i,d in enumerate(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"])}
NEG_INF = -(1<<62)

def hms(s):
    s = s.strip()
    if s in ("-",""): return 0
    s = re.sub(r"[a-z]$","",s) if re.search(r"\d[sd]$", s) else s
    neg = s.startswith("-"); s = s.lstrip("-")
    p = [float(x) for x in s.split(":")]
    while len(p) < 3: p.append(0)
    v = int(round(p[0]*3600 + p[1]*60 + p[2]))
    return -v if neg else v

def mon(s):
    for k,v in MON.items():
        if s.lower().startswith(k.lower()[:len(s)]) and len(s)>=3: return v
    raise ValueError(s)

def day_of(y, m, on):
    if on.startswith("last"):
        wd = DOW[on[4:7]]; d = calendar.monthrange(y,m)[1]
        while calendar.weekday(y,m,d) != wd: d -= 1
        return y,m,d
    mt = re.match(r"(\w{3})([<>]=)(\d+)", on)
    if mt:
        wd = DOW[mt.group(1)]; d = int(mt.group(3)); step = 1 if mt.group(2)==">=" else -1
        # gun tasmasi: ay disina tasabilir
        o = days_from_civil(y,m,d)
        while (o + 3) % 7 != wd: o += step   # 1970-01-01 = Thu (3)
        return civil_from_days(o)
    return y,m,int(on)

def days_from_civil(y,m,d):
    y -= m <= 2
    era = (y if y >= 0 else y-399)//400
    yoe = y - era*400
    doy = (153*(m + (-3 if m>2 else 9)) + 2)//5 + d-1
    doe = yoe*365 + yoe//4 - yoe//100 + doy
    return era*146097 + doe - 719468
def civil_from_days(z):
    z += 719468
    era = (z if z >= 0 else z-146096)//146097
    doe = z - era*146097
    yoe = (doe - doe//1460 + doe//36524 - doe//146096)//365
    y = yoe + era*400
    doy = doe - (365*yoe + yoe//4 - yoe//100)
    mp = (5*doy + 2)//153
    d = doy - (153*mp+2)//5 + 1
    m = mp + (3 if mp < 10 else -9)
    return (y + (m <= 2), m, d)

def at_parse(s):
    suf = "w"
    if s and s[-1] in "wsugz": suf = s[-1]; s = s[:-1]
    if suf in "gz": suf = "u"
    return hms(s), suf

def load(files):
    rules, zones, links = {}, {}, {}
    for f in files:
        cur = None
        for raw in open(os.path.join(SRC,f), encoding="utf-8"):
            line = raw.split("#")[0].rstrip()
            if not line.strip(): continue
            p = line.split()
            if p[0] == "Rule":
                rules.setdefault(p[1], []).append(p[2:]); cur = None
            elif p[0] == "Link":
                links[p[2]] = p[1]; zones.pop(p[2], None); cur = None
            elif p[0] == "Zone":
                cur = p[1]; zones[cur] = [p[2:]]; links.pop(cur, None)
            elif cur and raw[0] in " \t":
                zones[cur].append(p)
    return rules, zones, links

def rule_events(rs, y0, y1):
    ev = []
    for r in rs:
        frm = int(r[0]) if r[0] not in ("min",) else -9999
        to = {"only":frm, "max":9999}.get(r[1]); to = int(r[1]) if to is None else to
        a, b = max(frm, y0), min(to, y1)
        for y in range(a, b+1):
            m = mon(r[3]); yy,mm,dd = day_of(y,m,r[4]); at, suf = at_parse(r[5])
            ev.append((days_from_civil(yy,mm,dd)*86400 + at, suf, hms(r[6])))
    ev.sort(key=lambda e: e[0])
    return ev

def until_local(f):
    y = int(f[0]); m = mon(f[1]) if len(f)>1 else 1
    yy,mm,dd = day_of(y,m,f[2]) if len(f)>2 else (y,m,1)
    t, suf = at_parse(f[3]) if len(f)>3 else (0,"w")
    return days_from_civil(yy,mm,dd)*86400 + t, suf, y

def compile_zone(lines, rules):
    tr = []
    start = NEG_INF; prev_std = 0; prev_save = 0
    for ln in lines:
        stdoff = hms(ln[0]); rs = ln[1]; ufields = ln[3:]
        ul = until_local(ufields) if ufields else None
        y0 = 1600  # tum kural gecmisi (baslangic durumu icin gerekli)
        y1 = (ul[2]+1) if ul else 2040
        if rs == "-" or re.match(r"^-?\d", rs):
            fixed = hms(rs) if rs != "-" else 0
            utc_ev = []
            init = fixed; ev = []
        else:
            ev = rule_events(rules[rs], y0, y1)
            utc_ev = []; prev = 0
            for (lt, suf, sv) in ev:
                u = lt if suf=="u" else (lt - stdoff if suf=="s" else lt - stdoff - prev)
                utc_ev.append((u, sv)); prev = sv
            init = 0
            # Satir baslangici: kural anini ONCEKI satirin stdoff/save degeriyle yorumla (zic davranisi:
            # ayni yerel zaman tanimi = ayni an). Yalniz baslangic durumunu belirlemek icin.
            done = 0
            for i,(lt, suf, sv) in enumerate(ev):
                u_old = lt if suf=="u" else (lt - prev_std if suf=="s" else lt - prev_std - prev_save)
                if start == NEG_INF or u_old <= start or utc_ev[i][0] <= start:
                    if start != NEG_INF: init = sv; done = i+1
                else: break
            utc_ev = utc_ev[done:] if start != NEG_INF else utc_ev
        tr.append((start, stdoff + init))
        # until
        if ul:
            lt, suf, _ = ul
            if suf == "u": until = lt
            elif suf == "s": until = lt - stdoff
            else:
                sv = init
                for (u, s2) in utc_ev:
                    if u > start and u < lt - stdoff - sv: sv = s2
                for (u, s2) in utc_ev:   # ikinci gecis (tutarlilik)
                    pass
                until = lt - stdoff - sv
        else:
            until = 1<<62
        for (u, sv) in utc_ev:
            if start < u < until: tr.append((u, stdoff + sv))
        # bir sonraki satir icin: bu satirin until anindaki stdoff/save
        prev_std = stdoff
        prev_save = (tr[-1][1] if not utc_ev else ([init]+[sv for (u,sv) in utc_ev if u < until])[-1] + stdoff) - stdoff if False else None
        cur = init
        for (u, sv) in utc_ev:
            if u < until: cur = sv
        prev_save = cur
        start = until
    # birlestir
    out = []
    for t,o in tr:
        if out and out[-1][1] == o: continue
        if out and out[-1][0] == t: out[-1] = (t,o); continue
        out.append((t,o))
    return out

def build(with_backzone):
    rules, zones, links = load(MAIN + (["backzone"] if with_backzone else []))
    comp = {z: compile_zone(l, rules) for z,l in zones.items()}
    def resolve(n):
        k = 0
        while n in links and k < 10: n = links[n]; k += 1
        return n
    allnames = set(zones) | set(links)
    return {n: comp[resolve(n)] for n in allnames if resolve(n) in comp}, zones, links

def offset_at(trs, t):
    i = bisect.bisect_right([x[0] for x in trs], t) - 1
    return trs[max(i,0)][1]
