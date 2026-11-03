import re,sys,json
src=open(sys.argv[1]).read()
def grab(name):
    i=src.index(name+'[] = {'); j=src.index('};',i)
    body=re.sub(r'/\*.*?\*/','',src[i+len(name)+6:j],flags=re.S)
    groups=re.findall(r'\{([^{}]*)\}',body)
    return [[float(x) for x in g.replace('\n',' ').split(',') if x.strip()] for g in groups]
xls=grab('xls'); xpl=grab('xpl')
print(len(xls),len(xpl),len(xls[0]),len(xpl[0]),file=sys.stderr)
assert len(xls)==678 and len(xpl)==687 and all(len(r)==11 for r in xls) and all(len(r)==17 for r in xpl)
def num(v): return str(int(v)) if v==int(v) else repr(v)
out=sys.argv[2]
with open(out,'w',encoding='utf-8',newline='\n') as f:
    f.write('// IAU 2000A nütasyon serisi katsayıları — ERFA src/nut00a.c (BSD-3-Clause, © 2013-2021 NumFOCUS Foundation; SOFA türevi)\n')
    f.write('// birebir aktarım (sayılar değiştirilmedi). Birim: 0,1 mikro yay saniyesi. Lisans metni: ./LICENSE-ERFA.txt\n')
    f.write('// Üretici: scripts/astrology/de440/gen-nutation-table.py · Doğrulama: IERS Conventions 2010 Tablo 5.3a/5.3b ile çapraz sağlama (harness).\n')
    f.write('// Satır düzeni XLS: nl,nlp,nf,nd,nom, sp,spt,cp, ce,cet,se (678 terim) · XPL: nl,nf,nd,nom,nme,nve,nea,nma,nju,nsa,nur,nne,npa, sp,cp, se,ce (687 terim)\n\n')
    f.write('export const XLS: readonly number[] = [\n')
    for r in xls: f.write(' '+','.join(num(v) for v in r)+',\n')
    f.write('];\n\nexport const XPL: readonly number[] = [\n')
    for r in xpl: f.write(' '+','.join(num(v) for v in r)+',\n')
    f.write('];\n')
