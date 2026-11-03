"""n=3 politrop (Eddington standart modeli) Güneş: ışın iz düşümü (silindir) kütle oranı F(x), x = b/R☉. RK4 + yamuk integrali."""
import numpy as np
n=3; h=1e-4
xi=1e-6; th=1-xi**2/6; dth=-xi/3
XI=[0.0]; TH=[1.0]
def d(xi,th,dth): return dth, -max(th,0)**n - 2*dth/xi
while th>0:
    k1=d(xi,th,dth); k2=d(xi+h/2,th+h/2*k1[0],dth+h/2*k1[1]); k3=d(xi+h/2,th+h/2*k2[0],dth+h/2*k2[1]); k4=d(xi+h,th+h*k3[0],dth+h*k3[1])
    th+=h/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]); dth+=h/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]); xi+=h
    XI.append(xi); TH.append(max(th,0))
XI=np.array(XI); TH=np.array(TH); xi1=XI[-1]
r=XI/xi1; rho=TH**n
dm=4*np.pi*r*r*rho
Mtot=np.trapezoid(dm,r)
def F(b):
    if b<=0: return 0.0
    w=np.where(r<=b,1.0,1-np.sqrt(np.clip(1-(b/np.maximum(r,1e-12))**2,0,1)))
    return float(np.trapezoid(dm*w,r)/Mtot)
xs=[i/40 for i in range(41)]
vals=[F(x) for x in xs]
print('xi1',round(xi1,5),'(beklenen 6.89685)')
for x,v in list(zip(xs,vals))[::4]: print(f"{x:.3f} {v:.6f}")
print('x=0.84 ->',round(F(0.84),6))
print('TABLO');print(','.join(f"{v:.6f}" for v in vals))
