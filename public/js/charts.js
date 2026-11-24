// Diagramme als SVG, animiert: Balken wachsen, Kreise drehen sich auf, Linien zeichnen sich.
// Wird ein Diagramm neu gezeichnet (Live-Abstimmung, Labor), gleiten die Werte vom alten zum neuen Stand.
import { esc, fmt } from "./core/dom.js";
import { CHART_COLORS } from "/shared/palette.js";
export function niceStep(r,n){const raw=r/n,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<1.5?1:f<3?2:f<7?5:10)*p}
export function axis(o,all){let ymin=o.ymin||0,ymax=o.ymax||Math.max(1,...all)*1.1;if(ymax<=ymin)ymax=ymin+1;let step=niceStep(ymax-ymin,5);if(o.int)step=Math.max(1,Math.round(step));if(!o.ymax)ymax=Math.ceil(ymax/step-1e-9)*step;return{ymin,ymax,step}}

// Animationsgedächtnis: pro Diagramm (Folie + Nummer bzw. o.key) die zuletzt gezeichneten Größen
export const CH={ctx:'',seq:0,prev:{},uid:0};
function chartKey(o,t){return `${CH.ctx}#${o.key!==undefined?o.key:CH.seq++}#${t}`}
export function chartReset(ctx){for(const k in CH.prev)if(k.startsWith(ctx+'#'))delete CH.prev[k]}
const growFrom=(p,n)=>p===undefined?0:n>0?Math.min(4,p/n):1;
function svgOpen(W,H){return `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">`}
function legend(series,x,y){let s='',cx=x;series.forEach(se=>{s+=`<rect x="${cx}" y="${y-11}" width="13" height="13" rx="3" fill="${se.color}"/><text class="lg" x="${cx+20}" y="${y}">${esc(se.name)}</text>`;cx+=38+se.name.length*7.8});return s}
function topBar(x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h));const b=y+h;return `M${x},${b}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${b}Z`}
function rightBar(x,y,w,h,r){r=Math.max(0,Math.min(r,h/2,w));return `M${x},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h-r}Q${x+w},${y+h} ${x+w-r},${y+h}H${x}Z`}

export function svgBar(o){const key=chartKey(o,'b'),prev=CH.prev[key]||{},next={};
 const W=o.w||720,H=o.h||380,k=o.series.length,ml=56,mr=12,mt=28,mb=k>1?84:58;
 const all=o.series.flatMap(s=>s.values);const{ymin,ymax,step}=axis(o,all);
 const pw=W-ml-mr,ph=H-mt-mb,n=o.labels.length,gw=pw/n,bw=Math.min(66,gw*0.72/k),base=mt+ph;
 const y=v=>base-(Math.min(Math.max(v,ymin),ymax)-ymin)/(ymax-ymin)*ph;
 let s=svgOpen(W,H);
 // Striche auf runden Werten; beginnt die Achse nicht bei 0, steht der Anfangswert rot darunter
 s+=`<text class="ax" x="${ml-10}" y="${base+4}" text-anchor="end"${ymin>0?' style="fill:#dc2626;font-weight:800"':''}>${fmt(ymin)}</text>`;
 const t0=Math.ceil(ymin/step-1e-9)*step;for(let q=0;;q++){const t=+(t0+q*step).toFixed(6);if(t>ymax+1e-9)break;if(t-ymin<step*0.4)continue;const yy=y(t);s+=`<line class="gl" x1="${ml}" x2="${W-mr}" y1="${yy}" y2="${yy}"/><text class="ax" x="${ml-10}" y="${yy+4}" text-anchor="end">${fmt(t)}</text>`}
 o.labels.forEach((l,i)=>{const gx=ml+gw*i+gw/2;
  o.series.forEach((se,j)=>{const v=se.values[i]||0,x=gx-bw*k/2+bw*j+2,w=bw-4,yy=y(v),h=base-yy,id=`${l}|${j}`,p=prev[id],isNew=p===undefined,d=isNew?(i*k+j)*55:0,col=(se.colors&&se.colors[i])||se.color;next[id]=h;
   if(h>0.5)s+=`<path class="br" style="--f:${growFrom(p,h).toFixed(3)};--d:${d}ms" d="${topBar(x,yy,w,h,6)}" fill="${col}"/>`;
   const ly=yy-8;s+=`<text class="vl${isNew?'':' mv'}" style="--d:${d}ms;--t:${isNew?0:((base-p-8)-ly).toFixed(1)}px" x="${x+w/2}" y="${ly}" text-anchor="middle"${k>1?' font-size="12"':''}>${fmt(v)}${o.unit||''}</text>`});
  const parts=String(l).split(' '),half=Math.ceil(parts.length/2),l1=parts.length>1?parts.slice(0,half).join(' '):l,l2=parts.length>1?parts.slice(half).join(' '):'';
  s+=`<text class="cl" x="${gx}" y="${base+22}" text-anchor="middle">${esc(l1)}${l2?`<tspan x="${gx}" dy="16">${esc(l2)}</tspan>`:''}</text>`});
 s+=`<line class="bl" x1="${ml}" x2="${W-mr}" y1="${base}" y2="${base}"/>`;
 if(k>1)s+=legend(o.series,ml,H-14);CH.prev[key]=next;return s+'</svg>'}

export function svgHBar(o){const key=chartKey(o,'h'),prev=CH.prev[key]||{},next={};
 const k=o.series.length,n=o.labels.length,rowH=k>1?48:40,W=o.w||720,ml=o.ml||150,mr=66,mt=8,mb=k>1?40:12,H=mt+mb+rowH*n;
 const all=o.series.flatMap(s=>s.values);const xmax=o.xmax||Math.max(1,...all)*1.05,pw=W-ml-mr,bh=(rowH-12)/k;
 let s=svgOpen(W,H);
 o.labels.forEach((l,i)=>{const y0=mt+rowH*i+6;s+=`<text class="cl" x="${ml-12}" y="${y0+(rowH-12)/2+5}" text-anchor="end">${esc(l)}</text>`;
  o.series.forEach((se,j)=>{const v=se.values[i]||0,w=Math.max(0,v/xmax*pw),id=`${l}|${j}`,p=prev[id],isNew=p===undefined,d=isNew?(i*k+j)*45:0,col=(se.colors&&se.colors[i])||se.color,yy=y0+bh*j+1;next[id]=w;
   if(w>0.5)s+=`<path class="bh" style="--f:${growFrom(p,w).toFixed(3)};--d:${d}ms" d="${rightBar(ml,yy,w,bh-2,6)}" fill="${col}"/>`;
   s+=`<text class="vl${isNew?'':' mvx'}" style="--d:${d}ms;--t:${isNew?0:(p-w).toFixed(1)}px" x="${ml+w+8}" y="${yy+(bh-2)/2+5}"${k>1?' font-size="12"':''}>${fmt(v)}${o.unit||''}</text>`})});
 s+=`<line class="bl" x1="${ml}" x2="${ml}" y1="${mt}" y2="${mt+rowH*n}"/>`;
 if(k>1)s+=legend(o.series,ml,H-12);CH.prev[key]=next;return s+'</svg>'}

// Kreisdiagramm als Ring; beim ersten Zeichnen dreht es sich auf
export function svgPie(o){const key=chartKey(o,'p'),fresh=!CH.prev[key];CH.prev[key]={on:1};
 const W=o.w||720,H=o.h||340,cx=170,cy=H/2,r=138,ri=86,rm=(r+ri)/2,tot=o.values.reduce((a,b)=>a+b,0);
 let s=svgOpen(W,H);
 if(!tot)return s+`<circle cx="${cx}" cy="${cy}" r="${rm}" fill="none" style="stroke:var(--track,#eef0f4)" stroke-width="${r-ri}"/><text class="ctl" x="${cx}" y="${cy+5}" text-anchor="middle">noch keine Stimmen</text>${pieLegend(o,tot,H)}</svg>`;
 const P=(rr,an)=>`${(cx+rr*Math.cos(an)).toFixed(2)},${(cy+rr*Math.sin(an)).toFixed(2)}`;let g='',lab='',a=-Math.PI/2;
 o.values.forEach((v,i)=>{if(!v)return;const f=v/tot,a2=a+f*2*Math.PI,col=CHART_COLORS[i%CHART_COLORS.length];
  if(f>0.9999)g+=`<circle cx="${cx}" cy="${cy}" r="${rm}" fill="none" stroke="${col}" stroke-width="${r-ri}"/>`;
  else{const L=f>0.5?1:0;g+=`<path d="M${P(r,a)}A${r},${r} 0 ${L} 1 ${P(r,a2)}L${P(ri,a2)}A${ri},${ri} 0 ${L} 0 ${P(ri,a)}Z" fill="${col}" style="stroke:var(--surface,#fff)" stroke-width="2"/>`}
  if(f>0.055){const m=(a+a2)/2;lab+=`<text class="pl" x="${(cx+rm*Math.cos(m)).toFixed(1)}" y="${(cy+rm*Math.sin(m)+5).toFixed(1)}" text-anchor="middle">${Math.round(f*100)} %</text>`}a=a2});
 if(fresh){const id='pm'+(++CH.uid);s+=`<defs><mask id="${id}"><circle class="sweep" cx="${cx}" cy="${cy}" r="${rm}" fill="none" stroke="#fff" stroke-width="${r-ri+10}" pathLength="1" transform="rotate(-90 ${cx} ${cy})"/></mask></defs><g mask="url(#${id})">${g}</g>`}else s+=g;
 s+=`<g class="${fresh?'pfade':''}">${lab}</g><text class="ctr" x="${cx}" y="${cy+4}" text-anchor="middle">${fmt(tot)}</text><text class="ctl" x="${cx}" y="${cy+26}" text-anchor="middle">${esc(o.center||'gesamt')}</text>`;
 return s+pieLegend(o,tot,H)+'</svg>'}
function pieLegend(o,tot,H){let s='';const top=H/2-o.labels.length*15+10;o.labels.forEach((l,i)=>{const y=top+i*30;s+=`<rect x="350" y="${y-12}" width="14" height="14" rx="4" fill="${CHART_COLORS[i%CHART_COLORS.length]}"/><text class="lg" x="374" y="${y}"><tspan font-weight="700" fill="#111827">${esc(l)}</tspan><tspan dx="8">${fmt(o.values[i])}${tot?` · ${fmt(o.values[i]/tot*100)} %`:''}</tspan></text>`});return s}

// Liniendiagramm: Linie zeichnet sich, Punkte erscheinen nacheinander
export function svgLine(o){const key=chartKey(o,'l'),fresh=!CH.prev[key];CH.prev[key]={on:1};
 const W=o.w||720,H=o.h||380,ml=56,mr=24,mt=28,mb=46;const{ymin,ymax,step}=axis(o,o.values);
 const pw=W-ml-mr,ph=H-mt-mb,n=o.labels.length,base=mt+ph,col=o.color||CHART_COLORS[0];
 const x=i=>ml+(n>1?pw*i/(n-1):pw/2),y=v=>base-(Math.max(v,ymin)-ymin)/(ymax-ymin)*ph;
 let s=svgOpen(W,H);
 for(let t=ymin;t<=ymax+1e-9;t+=step){const yy=y(t);if(t>ymin)s+=`<line class="gl" x1="${ml}" x2="${W-mr}" y1="${yy}" y2="${yy}"/>`;s+=`<text class="ax" x="${ml-10}" y="${yy+4}" text-anchor="end">${fmt(t)}</text>`}
 const pts=o.values.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
 s+=`<path class="area" d="M${x(0)},${base}L${pts.join('L')}L${x(n-1)},${base}Z" fill="${col}"/><line class="bl" x1="${ml}" x2="${W-mr}" y1="${base}" y2="${base}"/>`;
 s+=`<polyline class="cline${fresh?' draw':''}" pathLength="1" stroke="${col}" points="${pts.join(' ')}"/>`;
 o.values.forEach((v,i)=>{s+=`<circle class="${fresh?'dot':''}" style="--d:${fresh?300+i*120:0}ms" cx="${x(i)}" cy="${y(v)}" r="6" style="fill:var(--surface,#fff)" stroke="${col}" stroke-width="3"/><text class="vl" style="--d:${fresh?300+i*120:0}ms" x="${x(i)}" y="${y(v)-14}" text-anchor="middle">${fmt(v)}</text><text class="cl" x="${x(i)}" y="${base+24}" text-anchor="middle">${esc(o.labels[i])}</text>`});
 return s+'</svg>'}

// Deklaratives Diagramm aus der Lektion: { type, title, labels, series:[{name, values}], unit, ymin }
export function chartFromSpec(spec, key, extra = {}) {
  if (!spec || !spec.labels || !spec.series) return "";
  const series = spec.series.map((s, j) => ({ name: s.name, values: s.values, color: s.color || CHART_COLORS[j % CHART_COLORS.length] }));
  const o = { key, labels: spec.labels, series, unit: spec.unit ? (/^[%a-zA-Z€]/.test(spec.unit) ? " " + spec.unit : spec.unit) : "", ...extra };
  if (spec.type === "hbar") return svgHBar({ ...o, ml: Math.min(230, Math.max(90, 8 * Math.max(...spec.labels.map((l) => String(l).length)) + 24)) });
  if (spec.type === "pie") return svgPie({ key, labels: spec.labels, values: series[0].values, center: extra.center || "gesamt" });
  if (spec.type === "line") return svgLine({ key, labels: spec.labels, values: series[0].values, color: series[0].color, ymin: spec.ymin });
  return svgBar({ ...o, ymin: extra.ymin ?? spec.ymin });
}
