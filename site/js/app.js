
/* ---------- Datos (INDEC: microdatos OPEX 2002-2025 y anexo 1er semestre 2026) ---------- */
const RUBROS = [
  {id:'PP',  name:'Productos primarios', short:'Primarios', css:'--pp'},
  {id:'MOA', name:'Manufacturas de origen agropecuario', short:'Agroindustria (MOA)', css:'--moa'},
  {id:'MOI', name:'Manufacturas de origen industrial', short:'Industria (MOI)', css:'--moi'},
  {id:'CyE', name:'Combustibles y energía', short:'Energía (CyE)', css:'--cye'}
];
const RIDX = {PP:0,MOA:1,MOI:2,CyE:3};
const ZONES = [
  {id:'mercosur', name:'Mercosur', group:'América', members:'Brasil, Paraguay, Uruguay y Venezuela, con sus zonas francas'},
  {id:'aladi', name:'Chile, Perú y otros', group:'América', members:'Resto de ALADI: Chile, Perú, Bolivia, Colombia, Cuba, Ecuador y Panamá'},
  {id:'usmca', name:'Norteamérica', group:'América', members:'Estados Unidos (con Puerto Rico), Canadá y México'},
  {id:'caribe', name:'Centroamérica y Caribe', group:'América', members:'República Dominicana, Guatemala, Nicaragua, Costa Rica, Honduras, El Salvador y otros'},
  {id:'ue', name:'Unión Europea', group:'Europa y África', members:'Los 27 países actuales, aplicados a toda la serie'},
  {id:'eur_otros', name:'Resto de Europa', group:'Europa y África', members:'Suiza, Reino Unido, Turquía, Rusia, Noruega, Ucrania y otros'},
  {id:'magreb', name:'Magreb y Egipto', group:'Europa y África', members:'Argelia, Egipto, Libia, Marruecos, Mauritania y Túnez'},
  {id:'africa', name:'África subsahariana', group:'Europa y África', members:'Angola, Mozambique, Nigeria, Kenya, Senegal y otros (sin Sudáfrica y vecinos)'},
  {id:'sacu', name:'Sudáfrica y vecinos', group:'Europa y África', members:'Unión Aduanera del Sur de África: Sudáfrica, Botswana, Eswatini, Lesotho y Namibia'},
  {id:'mo', name:'Medio Oriente', group:'Asia y Oceanía', members:'Arabia Saudita, Emiratos Árabes Unidos, Irán, Israel, Siria y otros'},
  {id:'china', name:'China', group:'Asia y Oceanía', members:'Incluye Hong Kong y Macao'},
  {id:'india', name:'India', group:'Asia y Oceanía', members:'India'},
  {id:'asean', name:'Sudeste asiático', group:'Asia y Oceanía', members:'ASEAN: Viet Nam, Tailandia, Malasia, Indonesia y otros'},
  {id:'asia_otros', name:'Resto de Asia', group:'Asia y Oceanía', members:'Bangladesh, Corea del Sur, Japón, Pakistán, Taiwán y otros'},
  {id:'oceania', name:'Oceanía', group:'Asia y Oceanía', members:'Australia, Nueva Zelanda y otros'},
  {id:'sindecl', name:'Sin país declarado', group:'Otros', members:'Envíos que el INDEC registra sin país de destino: solo con el continente o sin ningún dato'},
  {id:'resto', name:'Resto del mundo', group:'Otros', members:'El anexo del semestre no abre esta zona: incluye Suiza, Reino Unido, Japón, Corea, África subsahariana, Centroamérica y envíos sin país declarado'},
  {id:'nd', name:'Sin zona asignada', group:'Otros', members:'Diferencia entre el total y la suma por zonas que publica el INDEC'}
];
const ZI = Object.fromEntries(ZONES.map(z=>[z.id,z]));
const REGNAMES = {pampeana:'Región Pampeana', patagonia:'Patagonia', noa:'Noroeste (NOA)', cuyo:'Cuyo', nea:'Noreste (NEA)'};
let DATA, SERIES, META, GEO;
let ZKEYS, ORDER, ISOS, REG_ISOS;
let DOMAINS = {};
let provSel, CENT;

/* ---------- Utilidades ---------- */
const nf = new Intl.NumberFormat('es-AR',{maximumFractionDigits:0});
const nf1 = new Intl.NumberFormat('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
const M = v => v>0 && v<1 ? nf1.format(v) : nf.format(v);
const sgn = v => (v>0?'+':v<0?'−':'') + nf1.format(Math.abs(v)) + '%';
const pctOf = (v,t) => t ? nf1.format(100*v/t)+'%' : '';
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const DUR = () => reduceMotion.matches ? 0 : 420;
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sum = a => a.reduce((s,x)=>s+x,0);
const isSem = k => META.kinds[k]==='sem';

/* Orígenes que no son provincias */
const SPECIAL = {
  PLAT:{name:'Plataforma continental', label:'Plataforma continental', icon:'wave', pos:[246,702],
    desc:'Lo que se pesca o extrae en el mar argentino, fuera de la jurisdicción de cualquier provincia. Es casi todo pesca, sobre todo langostino.'},
  EXT:{name:'Origen extranjero', label:'Origen extranjero', icon:'globe', pos:[366,560],
    desc:'Reexportaciones: bienes producidos en otros países que entran a la Argentina y vuelven a salir. No son producción nacional, por eso no se ubican en ninguna provincia.'},
  EXTPLAT:{name:'Plataforma continental y origen extranjero', label:'Plataforma y extranjero', icon:'both', pos:[246,702],
    desc:'En el anexo del primer semestre de 2026 el INDEC publica juntos la plataforma continental (pesca en el mar argentino) y el origen extranjero (reexportaciones). Por separado solo informa los totales.'},
  IND:{name:'Sin provincia asignada', label:'Sin provincia asignada', icon:'q', pos:[372,800],
    desc:'Exportaciones para las que el INDEC no puede determinar la provincia de origen. Buena parte figura además como producto confidencial o sin país de destino.'}
};
const specKeys = pk => Object.keys(DATA.periods[pk].o).filter(k=>!DATA.names[k]);

/* totales para cualquier clave: iso | R:region | N | PLAT | EXT | EXTPLAT | IND */
function originKeys(key, pk){
  if(key==='N') return [...ISOS, ...specKeys(pk||state.period)];
  if(key.startsWith('R:')) return REG_ISOS[key.slice(2)];
  return [key];
}
function totalOf(pk,key){
  const row = SERIES.total[key];
  if(row && row[pk]!=null) return row[pk];
  const period = DATA.periods[pk];
  if(!period) return 0;
  return sum(originKeys(key,pk).map(k=>period.o[k]?.t||0));
}
function varOf(pk,key){
  if(isSem(pk)){
    const s = DATA.sem[key];
    const y = String(META.semester.year), prev = String(META.semester.previousYear);
    return s && s[prev] ? 100*(s[y]/s[prev]-1) : null;
  }
  const i = ORDER.indexOf(pk); if(i<=0) return null;
  const prev = totalOf(ORDER[i-1],key); return prev ? 100*(totalOf(pk,key)/prev-1) : null;
}
function seriesOf(pk,key){
  if(isSem(pk)){
    const s = DATA.sem[key]||{};
    const ySem = String(META.semester.year);
    return Object.keys(s).sort().map(y=>({k:y===ySem?META.semester.id:null, lbl:y, v:s[y]}));
  }
  return ORDER.filter(k=>!isSem(k)).map(k=>({k, lbl:k, v:totalOf(k,key)}));
}

/* ---------- Vista del período elegido ---------- */
let P, REGIONS, NATION, OTHER, PER;
function buildView(pk){
  PER = DATA.periods[pk];
  const zobj = arr => Object.fromEntries(ZKEYS.map((z,i)=>[z,arr[i]]));
  P = {};
  ISOS.forEach(i=>{ const o = PER.o[i]; P[i] = {iso:i, name:DATA.names[i], reg:DATA.reg[i], total:o.t, r:o.r, z:zobj(o.z), p:o.p, c:o.c, k:o.k||0, var:varOf(pk,i)}; });
  NATION = {name:'Todo el país', total:totalOf(pk,'N'), var:varOf(pk,'N'), r:[0,0,0,0], z:{}};
  originKeys('N',pk).forEach(k=>{ PER.o[k].r.forEach((v,j)=>NATION.r[j]+=v); PER.o[k].z.forEach((v,j)=>NATION.z[ZKEYS[j]]=(NATION.z[ZKEYS[j]]||0)+v); });
  REGIONS = {};
  Object.keys(REGNAMES).forEach(rg=>{
    const ps = REG_ISOS[rg].map(i=>P[i]);
    const r = [0,0,0,0], z = {};
    ps.forEach(p=>{ p.r.forEach((v,j)=>r[j]+=v); ZKEYS.forEach(k=>z[k]=(z[k]||0)+p.z[k]); });
    const total = sum(ps.map(p=>p.total));
    REGIONS[rg] = {name:REGNAMES[rg], total, r, z, var:varOf(pk,'R:'+rg), share:100*total/NATION.total, partners:PER.reg[rg]?.c||[], prods:PER.reg[rg]?.p||[], k:PER.reg[rg]?.k||0};
  });
  ISOS.forEach(i=>{ P[i].share = 100*P[i].total/NATION.total; });
  OTHER = Object.fromEntries(specKeys(pk).map(k=>{ const o=PER.o[k]; return [k,{key:k, name:SPECIAL[k].name, total:o.t, r:o.r, z:zobj(o.z), p:o.p, c:o.c, k:o.k||0, var:varOf(pk,k)}]; }));
}

const svg = d3.select('#svg');
const tip = document.getElementById('tip');
const viz = document.getElementById('viz');

/* ---------- Estado ---------- */
const state = {sel:{type:'pais',id:null}, metric:'total', period:null};

/* ---------- Mapa base ---------- */
function drawBase(){
  d3.select('#g-grat').append('path').attr('class','grat').attr('d',GEO.graticule);
  d3.select('#g-neigh').selectAll('path').data(GEO.neighbors).join('path').attr('class','neighbor').attr('d',d=>d.d);
  const provGeo = GEO.provinces.filter(p=>DATA.names[p.iso]);
  CENT = Object.fromEntries(provGeo.map(p=>[p.iso,[p.cx,p.cy]]));
  CENT['AR-V'] = [CENT['AR-V'][0]+4, CENT['AR-V'][1]];
  provSel = d3.select('#g-prov').selectAll('path').data(provGeo.sort((a,b)=>a.iso==='AR-C'?1:b.iso==='AR-C'?-1:0)).join('path')
    .attr('class','prov').attr('d',d=>d.d)
    .attr('tabindex',0).attr('role','button')
    .on('click',(e,d)=>select({type:'prov',id:d.iso}))
    .on('keydown',(e,d)=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();select({type:'prov',id:d.iso});} })
    .on('pointermove',(e,d)=>showTip(e,provTip(P[d.iso])))
    .on('pointerleave',hideTip);
  const caba = CENT['AR-C'];
  d3.select('#g-caba').append('circle').attr('class','caba-ring').attr('cx',caba[0]).attr('cy',caba[1]).attr('r',6);
  d3.select('#g-caba').append('circle').attr('class','caba-hit').attr('cx',caba[0]).attr('cy',caba[1]).attr('r',8)
    .on('click',()=>select({type:'prov',id:'AR-C'}))
    .on('pointermove',e=>showTip(e,provTip(P['AR-C'])))
    .on('pointerleave',hideTip);
}

function metricVal(p){ return state.metric==='total' ? p.total : p.r[RIDX[state.metric]]; }
function provTip(p){
  const v = metricVal(p);
  const vr = p.var==null ? '' : `<br><span class="s">${sgn(p.var)} ${isSem(state.period)?'frente al '+META.semester.compareShort:'frente al año anterior'}</span>`;
  return `<b>${esc(p.name)}</b><br>${state.metric==='total'?'Exportó':esc(RUBROS.find(r=>r.id===state.metric).name)+':'} ${v>0?M(v)+' M':'sin exportaciones'}${vr}`;
}

/* ---------- Escala de color: fija para toda la serie, así los años se pueden comparar ---------- */
let colorScale;
function buildDomains(){
  DOMAINS = {};
  ['total',...RUBROS.map(r=>r.id)].forEach(m=>{
    let lo=Infinity, hi=0;
    ORDER.forEach(k=>ISOS.forEach(i=>{
      const cell = SERIES.province[i];
      const v = m==='total' ? cell.t[k] : cell.r[k][RIDX[m]];
      if(v>0){ lo=Math.min(lo,v); hi=Math.max(hi,v); }
    }));
    DOMAINS[m] = [Math.max(1,lo), hi];
  });
}
function buildScale(){
  const interp = d3.piecewise(d3.interpolateLab, [cssv('--ramp-0'), cssv('--ramp-1'), cssv('--ramp-2')]);
  colorScale = d3.scaleSequentialLog(DOMAINS[state.metric], interp).clamp(true);
}
function paint(){
  buildScale();
  const zero = cssv('--zero');
  provSel.transition().duration(DUR()/1.5).attr('fill',d=>{ const v=metricVal(P[d.iso]); return v>0 ? colorScale(v) : zero; });
  provSel.attr('aria-label',d=>`${P[d.iso].name}: ${M(P[d.iso].total)} millones de USD`);
  drawLegend();
}
function drawLegend(){
  const g = d3.select('#g-legend'); g.selectAll('*').remove();
  const x0=narrow?226:250, w=narrow?230:180, y0=narrow?930:948;
  const lg = d3.select('#lg'); lg.selectAll('stop').data(d3.range(0,1.0001,0.1)).join('stop')
    .attr('offset',d=>d).attr('stop-color',d=>colorScale.interpolator()(d));
  const title = state.metric==='total' ? 'Total exportado, millones de USD' : RUBROS.find(r=>r.id===state.metric).short + ', millones de USD';
  g.append('text').attr('class','legend-title').attr('x',x0).attr('y',y0-(narrow?12:10)).text(narrow?'Millones de USD':title);
  g.append('rect').attr('x',x0).attr('y',y0).attr('width',w).attr('height',9).attr('rx',2).attr('fill','url(#lg)');
  const [lo,hi] = colorScale.domain();
  const lx = d3.scaleLog([lo,hi],[x0,x0+w]);
  const ticks = [1,10,100,1000,10000,100000].filter(t=>t>=lo*0.999 && t<=hi*1.001);
  const gap = narrow?62:42;
  const all = [lo, ...ticks].filter((t,i,a)=>a.findIndex(u=>Math.abs(lx(u)-lx(t))<gap)===i);
  g.selectAll('.legend-t').data(all).join('text').attr('class','legend-t')
    .attr('x',d=>lx(d)).attr('y',y0+(narrow?34:26)).attr('text-anchor',(d,i)=>i===0?'start':'middle').text(d=>M(d));
}

/* ---------- Símbolos de orígenes especiales ---------- */
function glyph(g, kind){
  if(kind==='wave'){
    g.append('path').attr('class','gl').attr('d','M-6.5,-2.2q1.6,-2.6 3.25,0t3.25,0t3.25,0t3.25,0');
    g.append('path').attr('class','gl').attr('d','M-6.5,2.8q1.6,-2.6 3.25,0t3.25,0t3.25,0t3.25,0');
  } else if(kind==='globe'){
    g.append('circle').attr('class','gl').attr('r',6.4);
    g.append('ellipse').attr('class','gl').attr('rx',2.7).attr('ry',6.4);
    g.append('path').attr('class','gl').attr('d','M-6.4,0H6.4M-5.4,-3.3H5.4M-5.4,3.3H5.4');
  } else {
    g.append('text').attr('class','q').attr('y',4.6).text('?');
  }
}
function specTip(k){
  const o = OTHER[k], s = SPECIAL[k];
  return `<b>${esc(s.name)}</b><br>${M(o.total)} M, ${pctOf(o.total,NATION.total)} del total<br><span class="s">Tocá para ver qué exporta y a dónde</span>`;
}
function drawSpecials(){
  const g = d3.select('#g-special'); g.selectAll('*').remove();
  const sc = narrow ? 1.7 : 1.25, sel = state.sel;
  Object.keys(OTHER).forEach(k=>{
    const s = SPECIAL[k], on = sel.type==='esp' && sel.id===k, dim = sel.type!=='pais' && !on;
    const parts = s.icon==='both' ? [['wave',SPECIAL.PLAT.pos],['globe',SPECIAL.EXT.pos]] : [[s.icon,s.pos]];
    const a = g.append('g').attr('class',`spec${on?' on':''}${dim?' dim':''}${s.icon==='q'?' ind':''}`)
      .attr('tabindex',0).attr('role','button').attr('aria-pressed',on)
      .attr('aria-label',`${s.name}: ${M(OTHER[k].total)} millones de USD`)
      .on('click',()=>select({type:'esp',id:k}))
      .on('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); select({type:'esp',id:k}); } })
      .on('pointermove',e=>showTip(e,specTip(k))).on('pointerleave',hideTip);
    if(parts.length>1) a.append('line').attr('class','spec-link').attr('x1',parts[0][1][0]).attr('y1',parts[0][1][1]).attr('x2',parts[1][1][0]).attr('y2',parts[1][1][1]);
    parts.forEach(([kind,[x,y]])=>{
      const ic = a.append('g').attr('transform',`translate(${x},${y}) scale(${sc})`);
      ic.append('circle').attr('class','hit').attr('r',17);
      ic.append('circle').attr('class','bg').attr('r',11);
      glyph(ic, kind);
    });
    const [lx,ly] = parts[0][1];
    a.append('text').attr('class','spec-lbl').attr('x',lx).attr('y',ly+(narrow?50:32)).attr('text-anchor','middle').text(s.label);
  });
}

/* ---------- Columna de destinos ---------- */
const NX = 596, BW = 12, TOP = 30, BOTTOM = 986, G = 5, GG = 10;
let narrow = false;
const SZ = () => narrow ? {hh:40, minh:36, lblDy:9, hdDy:12} : {hh:30, minh:24, lblDy:6, hdDy:10};

function layout(vals, zones){
  const n = zones.length;
  const groups = [...new Set(zones.map(z=>z.group))];
  const HH = SZ().hh, MINH = SZ().minh;
  const avail = (BOTTOM-TOP) - groups.length*HH - (n-1)*G - (groups.length-1)*GG;
  const maxv = d3.max(zones, z=>vals[z.id]||0) || 1;
  let lo=0, hi=avail/maxv;
  const f = k => d3.sum(zones, z=>Math.max(k*(vals[z.id]||0), MINH));
  for(let i=0;i<50;i++){ const m=(lo+hi)/2; if(f(m)>avail) hi=m; else lo=m; }
  const k = lo;
  let y = TOP; const pos = {}; const heads = [];
  let lastGroup = null;
  zones.forEach(z=>{
    if(z.group!==lastGroup){ if(lastGroup!==null) y += GG - G; heads.push({name:z.group,y}); y += HH; lastGroup=z.group; }
    const v = vals[z.id]||0, bh = k*v, sh = Math.max(bh,MINH);
    pos[z.id] = {y0:y, sh, bh, cy:y+sh/2, by:y+(sh-bh)/2, v};
    y += sh + G;
  });
  return {k,pos,heads};
}

/* ---------- Flujos según selección ---------- */
function weightedCentroid(isos){
  let sx=0, sy=0, sw=0;
  isos.forEach(i=>{ const w=Math.max(1,P[i].total); sx+=CENT[i][0]*w; sy+=CENT[i][1]*w; sw+=w; });
  return [sx/sw, sy/sw];
}
let REG_C = {};

function flowsFor(sel){
  const flows = [], origins = [];
  const push = (from, zobj, o, total) => {
    let s = 0;
    ZKEYS.forEach(z=>{ const v = zobj[z]||0; if(v>0.05){ flows.push({from,zone:z,v,o}); s+=v; } });
    const rest = total - s;
    if(rest > Math.max(5,total*0.002)) flows.push({from,zone:'nd',v:rest,o,nd:true});
  };
  if(sel.type==='pais'){
    Object.entries(REGIONS).forEach(([rid,r])=>{ push(r.name, r.z, REG_C[rid], r.total); origins.push({c:REG_C[rid]}); });
    Object.values(OTHER).forEach(o=>push(o.name, o.z, SPECIAL[o.key].pos, o.total));
  } else if(sel.type==='esp'){
    const o = OTHER[sel.id];
    push(o.name, o.z, SPECIAL[sel.id].pos, o.total);
  } else if(sel.type==='region'){
    const r = REGIONS[sel.id];
    push(r.name, r.z, REG_C[sel.id], r.total);
    origins.push({c:REG_C[sel.id]});
  } else {
    const p = P[sel.id];
    push(p.name, p.z, CENT[sel.id], p.total);
    origins.push({c:CENT[sel.id]});
  }
  const vals = {}; flows.forEach(f=>{ vals[f.zone]=(vals[f.zone]||0)+f.v; });
  return {flows, origins, vals};
}

function ribbon(ox,oy,w0,nx,ny,w){
  const gx = Math.max(400, ox+40), gy = oy + (ny-oy)*0.14;
  const ax = (ox+gx)/2, bx = gx + (nx-gx)*0.5;
  const h0 = w0/2, h1 = w/2;
  return `M${ox},${oy-h0}C${ax},${oy-h0} ${ax},${gy-h0} ${gx},${gy-h0}`+
         `C${bx},${gy-h0} ${bx},${ny-h1} ${nx},${ny-h1}L${nx},${ny+h1}`+
         `C${bx},${ny+h1} ${bx},${gy+h0} ${gx},${gy+h0}`+
         `C${ax},${gy+h0} ${ax},${oy+h0} ${ox},${oy+h0}Z`;
}

function drawFlows(){
  const sel = state.sel;
  const {flows, origins, vals} = flowsFor(sel);
  const zonesVis = ZONES.filter(z=>z.id==='nd' ? vals.nd>0 : NATION.z[z.id]>0);
  const L = layout(vals, zonesVis);
  const S = SZ();
  const byZone = d3.group(flows, f=>f.zone);
  byZone.forEach((arr,zid)=>{
    arr.sort((a,b)=>a.o[1]-b.o[1] || a.o[0]-b.o[0]);
    let y = L.pos[zid].by;
    arr.forEach(f=>{ const h=L.k*f.v; f.ny = y + h/2; f.w = h; y += h; });
  });
  flows.forEach(f=>{ f.w0 = Math.max(1, Math.min(f.w, 1 + f.w*0.07)); });

  const gF = d3.select('#g-flows');
  gF.selectAll('g.batch').interrupt().transition().duration(DUR()/2).style('opacity',0).remove();
  const batch = gF.append('g').attr('class','batch').style('opacity',0);
  batch.selectAll('path').data(flows).join('path')
    .attr('class',f=>'flow'+(f.nd?' nd':'')).attr('data-zone',f=>f.zone)
    .attr('d',f=>ribbon(f.o[0],f.o[1],f.w0,NX,f.ny,f.w));
  batch.transition().delay(DUR()/3).duration(DUR()).style('opacity',1);

  const gO = d3.select('#g-origins'); gO.selectAll('*').remove();
  origins.forEach(o=>{
    gO.append('circle').attr('class','origin').attr('cx',o.c[0]).attr('cy',o.c[1]).attr('r',sel.type==='pais'?4:5);
  });
  drawSpecials();

  const gN = d3.select('#g-nodes');
  const heads = gN.selectAll('g.head').data(L.heads, d=>d.name).join(enter=>{
    const g = enter.append('g').attr('class','head');
    g.append('line').attr('class','grp-rule');
    g.append('text').attr('class','grp');
    return g;
  });
  heads.select('text').text(d=>d.name).transition().duration(DUR()).attr('x',NX).attr('y',d=>d.y+S.hh-S.hdDy);
  heads.select('line').attr('x1',NX).attr('x2',896).transition().duration(DUR()).attr('y1',d=>d.y+S.hh-4).attr('y2',d=>d.y+S.hh-4);

  const nodes = gN.selectAll('g.node').data(ZONES, z=>z.id).join(enter=>{
    const g = enter.append('g').attr('class','node').attr('tabindex',0).attr('role','button');
    g.append('rect').attr('class','node-hit');
    g.append('rect').attr('class',z=>'node-bar'+(z.id==='nd'?' nd':''));
    g.append('line').attr('class','node-tick');
    g.append('text').attr('class','node-name');
    g.append('text').attr('class','node-val');
    g.on('pointerenter',(e,z)=>focusZone(z.id,true))
     .on('pointermove',(e,z)=>showTip(e,zoneTip(z.id)))
     .on('pointerleave',(e,z)=>{focusZone(z.id,false);hideTip();})
     .on('focus',(e,z)=>{focusZone(z.id,true);})
     .on('blur',(e,z)=>{focusZone(z.id,false);});
    return g;
  });
  nodes.style('display',z=>L.pos[z.id]?null:'none');
  const visN = nodes.filter(z=>L.pos[z.id]);
  visN.classed('zero',z=>!(L.pos[z.id].v>0))
    .attr('aria-label',z=>{ const v=L.pos[z.id].v; return `${z.name}: ${v>0?M(v)+' millones de USD':'sin exportaciones en este período'}`; });
  visN.select('.node-hit').attr('x',NX-6).attr('width',906-NX).transition().duration(DUR()).attr('y',z=>L.pos[z.id].y0).attr('height',z=>L.pos[z.id].sh);
  visN.select('.node-bar').attr('x',NX).attr('width',BW).transition().duration(DUR()).attr('y',z=>L.pos[z.id].by).attr('height',z=>L.pos[z.id].bh);
  visN.select('.node-tick').attr('x1',NX).attr('x2',NX+BW).transition().duration(DUR())
    .attr('y1',z=>L.pos[z.id].cy).attr('y2',z=>L.pos[z.id].cy).style('opacity',z=>L.pos[z.id].v>0?0:1);
  visN.select('.node-name').attr('x',NX+BW+12).text(z=>z.name).transition().duration(DUR()).attr('y',z=>L.pos[z.id].cy+S.lblDy);
  visN.select('.node-val').attr('x',896).text(z=>{ const v=L.pos[z.id].v; return v>0 ? M(v) : '—'; })
    .transition().duration(DUR()).attr('y',z=>L.pos[z.id].cy+S.lblDy);

  state.lastVals = vals;
}

function focusZone(zid,on){
  const g = d3.select('#g-flows');
  g.classed('focus',on);
  g.selectAll('path').classed('on',function(){ return on && this.getAttribute('data-zone')===zid; });
}
function selTotal(sel){ return sel.type==='pais' ? NATION.total : sel.type==='region' ? REGIONS[sel.id].total : sel.type==='esp' ? OTHER[sel.id].total : P[sel.id].total; }
function selName(sel){ return sel.type==='pais' ? 'el país' : sel.type==='region' ? REGIONS[sel.id].name : sel.type==='esp' ? SPECIAL[sel.id].name.toLowerCase() : P[sel.id].name; }
function zoneTip(zid){
  const z = ZI[zid]; const sel = state.sel; const v = state.lastVals[zid]||0;
  let s = `<b>${esc(z.name)}</b><br><span class="s">${esc(z.members)}</span><br>`;
  s += v>0 ? `${M(v)} M, ${pctOf(v,selTotal(sel))} de lo exportado por ${esc(selName(sel))}` : 'Sin exportaciones en este período';
  return s;
}

/* ---------- Tooltip ---------- */
function showTip(e,html){
  tip.innerHTML = html; tip.style.opacity = 1;
  const r = viz.getBoundingClientRect();
  let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  if(x + tw > r.width) x = e.clientX - r.left - tw - 14;
  if(y + th > r.height) y = e.clientY - r.top - th - 14;
  tip.style.left = Math.max(0,x)+'px'; tip.style.top = Math.max(0,y)+'px';
}
function hideTip(){ tip.style.opacity = 0; }

/* ---------- Panel ---------- */
function rubroBlock(rArr, total){
  const segs = RUBROS.map((r,i)=>`<span style="width:${total?100*rArr[i]/total:0}%;background:var(${r.css})" title="${esc(r.name)}"></span>`).join('');
  const rows = RUBROS.map((r,i)=>`<li><span class="sw" style="background:var(${r.css})"></span><span>${esc(r.name)}</span><span class="v">${rArr[i]>=0.05?M(rArr[i])+' M':'—'}</span><span class="p">${rArr[i]>=0.05?pctOf(rArr[i],total):''}</span></li>`).join('');
  return `<div class="stack" role="img" aria-label="Composición por rubro">${segs}</div><ul class="rubros">${rows}</ul>`;
}
function destRows(entries, base){
  const max = d3.max(entries, d=>d.v) || 1;
  return `<ul class="rows">${entries.map(d=>`<li class="row${d.nd?' nd':''}"><span>${esc(d.name)}</span><span><span class="v">${M(d.v)} M</span> <span class="small" style="margin:0">${pctOf(d.v,base)}</span></span><span class="bar"><i style="width:${100*d.v/max}%"></i></span>${d.note?`<span class="note">${esc(d.note)}</span>`:''}</li>`).join('')}</ul>`;
}
function varSpan(v){ return v==null ? '' : `<span class="${v>=0?'pos':'neg'}">${sgn(v)}</span>`; }
function varText(v){
  if(v==null) return isSem(state.period) ? '' : 'Primer año de la serie.';
  return `${varSpan(v)} ${isSem(state.period)?'frente al '+META.semester.compareWith:'frente a '+(+state.period-1)}.`;
}
function zoneEntries(z, base){
  const e = ZKEYS.filter(k=>z[k]>0.05).map(k=>({name:ZI[k].name, v:z[k]})).sort((a,b)=>b.v-a.v);
  const rest = base - sum(e.map(d=>d.v));
  if(rest>Math.max(5,base*0.002)) e.push({name:ZI.nd.name, v:rest, nd:true, note:ZI.nd.members});
  return e;
}
function countryLine(list, label){
  if(!list || !list.length) return '';
  return `<p class="small" style="margin:-4px 0 12px">${label}: ${list.map(c=>`${esc(c[0])} ${M(c[1])} M`).join(', ')}.</p>`;
}
function confNote(k, total){
  if(!(k>0.5)) return '';
  return `<p class="small">Además, ${M(k)} M (${pctOf(k,total)}) figuran como confidenciales: el INDEC publica la provincia, el rubro y el destino, pero no el producto, para no revelar datos de empresas individuales.</p>`;
}
function prodList(list, total){
  if(!list || !list.length) return '';
  return `<p class="small" style="margin-top:16px">Principales productos</p><ul class="hl">${list.map(p=>{
    if(p[1]==null) return `<li>${esc(p[0])}</li>`;
    const extra = p.length>2 && p[2]!=null ? `, ${sgn(p[2])} interanual` : `, ${pctOf(p[1],total)} del total`;
    return `<li>${esc(p[0])}: ${M(p[1])} M${extra}</li>`; }).join('')}</ul>`;
}

/* Mini gráfico de evolución */
function evoBlock(key){
  const pk = state.period, s = seriesOf(pk,key);
  if(!s.length) return '';
  const W = 340, H = 96, padT = 16, padB = 18, n = s.length, gap = n>15?1.5:3;
  const bw = (W - gap*(n-1))/n, max = d3.max(s,d=>d.v)||1;
  const y = v => padT + (H-padT-padB)*(1 - v/max);
  const curLbl = isSem(pk) ? String(META.semester.year) : pk;
  const bars = s.map((d,i)=>{
    const x = i*(bw+gap), on = d.lbl===curLbl, clickable = !!d.k;
    return `<rect class="evo-bar${on?' on':''}${clickable?' go':''}" x="${x.toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H-padB-y(d.v)).toFixed(1)}" ${clickable?`data-period="${d.k}"`:''}><title>${d.lbl}${isSem(pk)?' (1er sem.)':''}: ${M(d.v)} M</title></rect>`;
  }).join('');
  const cur = s.find(d=>d.lbl===curLbl);
  const peak = s.reduce((a,b)=>b.v>a.v?b:a);
  const first = s[0].lbl, last = s[s.length-1].lbl;
  const title = isSem(pk) ? `Primeros semestres, ${first}–${last}` : `Evolución anual, ${first}–${last}`;
  return `<div class="sec"><h3>${title}</h3>
    <svg class="evo" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: máximo en ${peak.lbl} con ${M(peak.v)} millones de USD; ${curLbl}: ${M(cur?.v||0)} millones">
      <text class="evo-t" x="0" y="10">Máximo: ${M(peak.v)} M (${peak.lbl})</text>
      ${bars}
      <text class="evo-t" x="0" y="${H-3}">${first}</text>
      <text class="evo-t" x="${W}" y="${H-3}" text-anchor="end">${last}</text>
    </svg>
    <p class="small">${isSem(pk)?'Se comparan solo primeros semestres, para no mezclar un semestre con años completos.':'Tocá una barra para ir a ese año.'} Dólares corrientes, sin ajustar por inflación.</p></div>`;
}

function renderPanel(){
  const sel = state.sel, el = document.getElementById('panel'), pk = state.period, sem = isSem(pk);
  let h = '';
  if(sel.type==='pais'){
    const n = NATION;
    h += `<p class="crumb">Argentina · ${esc(PER.label)}</p><h2>Todo el país</h2>`;
    h += `<div class="big"><span class="n">${M(n.total)}</span><span class="u">millones de USD</span></div>`;
    h += `<p class="facts">${varText(n.var)}</p>`;
    h += `<div class="sec"><h3>Qué exporta</h3>${rubroBlock(n.r,n.total)}`;
    if(sem && PER.complejos){
      h += `<p class="small" style="margin-top:16px">Principales complejos exportadores</p>${destRows(PER.complejos.map(c=>({name:c[0],v:c[1],note:`${sgn(c[2])} interanual`})), n.total)}`;
    } else {
      h += prodList(PER.nat.p, n.total) + confNote(PER.nat.k, n.total);
    }
    h += `</div>`;
    h += evoBlock('N');
    const rmax = d3.max(Object.values(REGIONS),r=>r.total);
    h += `<div class="sec"><h3>De dónde sale</h3><ul class="rows">${Object.entries(REGIONS).sort((a,b)=>b[1].total-a[1].total).map(([id,r])=>`<li class="row"><button type="button" data-region="${id}">${esc(r.name)}</button><span><span class="v">${M(r.total)} M</span> <span class="small" style="margin:0">${nf1.format(r.share)}%</span></span><span class="bar"><i style="width:${100*r.total/rmax}%"></i></span></li>`).join('')}</ul>`;
    h += `<p class="small" style="margin:14px 0 8px">Fuera de las provincias</p><ul class="rows">${Object.values(OTHER).map(o=>`<li class="row"><button type="button" data-esp="${o.key}">${esc(SPECIAL[o.key].name)}</button><span><span class="v">${M(o.total)} M</span> <span class="small" style="margin:0">${pctOf(o.total,n.total)}</span></span><span class="bar"><i style="width:${100*o.total/rmax}%"></i></span></li>`).join('')}</ul></div>`;
    h += `<div class="sec"><h3>A dónde va</h3>${countryLine(PER.nat.c, sem?'Principales países (entre los que detalla el informe)':'Principales países')}${destRows(zoneEntries(n.z,n.total),n.total)}</div>`;
  } else if(sel.type==='esp'){
    const o = OTHER[sel.id], s = SPECIAL[sel.id];
    let desc = s.desc;
    if(sel.id==='EXTPLAT' && PER.split) desc += ` En este semestre: ${M(PER.split.EXT[0])} M de origen extranjero y ${M(PER.split.PLAT[0])} M de plataforma continental.`;
    h += `<p class="crumb"><button class="linkbtn" type="button" data-go="pais">Todo el país</button><span aria-hidden="true">·</span>Fuera de las provincias<span aria-hidden="true">·</span>${esc(PER.label)}</p><h2>${esc(s.name)}</h2>`;
    h += `<div class="big"><span class="n">${M(o.total)}</span><span class="u">millones de USD</span></div>`;
    h += `<p class="facts">${varText(o.var)} ${pctOf(o.total,NATION.total)} del total nacional.</p>`;
    h += `<p class="desc">${esc(desc)}</p>`;
    h += `<div class="sec"><h3>Qué exporta</h3>${rubroBlock(o.r,o.total)}${prodList(o.p,o.total)}${confNote(o.k,o.total)}</div>`;
    h += evoBlock(sel.id);
    h += `<div class="sec"><h3>A dónde va</h3>${countryLine(o.c, sem?'Principales países (entre los que detalla el informe)':'Principales países')}${destRows(zoneEntries(o.z,o.total),o.total)}</div>`;
  } else if(sel.type==='region'){
    const r = REGIONS[sel.id];
    h += `<p class="crumb"><button class="linkbtn" type="button" data-go="pais">Todo el país</button><span aria-hidden="true">·</span>${esc(PER.label)}</p><h2>${esc(r.name)}</h2>`;
    h += `<div class="big"><span class="n">${M(r.total)}</span><span class="u">millones de USD</span></div>`;
    h += `<p class="facts">${varText(r.var)} ${nf1.format(r.share)}% del total nacional.</p>`;
    h += `<div class="sec"><h3>Qué exporta</h3>${rubroBlock(r.r,r.total)}${prodList(r.prods,r.total)}${confNote(r.k,r.total)}</div>`;
    h += evoBlock('R:'+sel.id);
    const provs = REG_ISOS[sel.id].map(i=>P[i]).sort((a,b)=>b.total-a.total);
    const pmax = provs[0].total || 1;
    h += `<div class="sec"><h3>Provincias</h3><ul class="rows">${provs.map(p=>`<li class="row"><button type="button" data-prov="${p.iso}">${esc(p.name)}</button><span><span class="v">${M(p.total)} M</span> <span class="small" style="margin:0">${pctOf(p.total,r.total)}</span></span><span class="bar"><i style="width:${100*p.total/pmax}%"></i></span></li>`).join('')}</ul></div>`;
    h += `<div class="sec"><h3>A dónde va</h3>${countryLine(r.partners,'Principales países')}${destRows(zoneEntries(r.z,r.total),r.total)}</div>`;
  } else {
    const p = P[sel.id], r = REGIONS[p.reg];
    const rank = Object.values(P).filter(q=>q.total>p.total).length + 1;
    h += `<p class="crumb"><button class="linkbtn" type="button" data-go="pais">Todo el país</button><span aria-hidden="true">/</span><button class="linkbtn" type="button" data-region="${p.reg}">${esc(r.name)}</button><span aria-hidden="true">·</span>${esc(PER.label)}</p><h2>${esc(p.name)}</h2>`;
    h += `<div class="big"><span class="n">${M(p.total)}</span><span class="u">millones de USD</span></div>`;
    h += `<p class="facts">${varText(p.var)} ${p.share>=0.1?nf1.format(p.share)+'%':'Menos del 0,1%'} del total nacional, puesto ${rank} de 24.</p>`;
    h += `<div class="sec"><h3>Qué exporta</h3>${rubroBlock(p.r,p.total)}${prodList(p.p,p.total)}${confNote(p.k,p.total)}</div>`;
    h += evoBlock(p.iso);
    h += `<div class="sec"><h3>A dónde va</h3>${countryLine(p.c, sem?'Principales países (entre los que detalla el informe)':'Principales países')}${destRows(zoneEntries(p.z,p.total),p.total)}</div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click',()=>select({type:'region',id:b.dataset.region})));
  el.querySelectorAll('[data-prov]').forEach(b=>b.addEventListener('click',()=>select({type:'prov',id:b.dataset.prov})));
  el.querySelectorAll('[data-esp]').forEach(b=>b.addEventListener('click',()=>select({type:'esp',id:b.dataset.esp})));
  el.querySelectorAll('[data-go="pais"]').forEach(b=>b.addEventListener('click',()=>select({type:'pais'})));
  el.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>setPeriod(b.dataset.period)));
}

/* ---------- Selección ---------- */
function highlight(){
  const sel = state.sel;
  provSel.classed('sel',d=>sel.type==='prov' && d.iso===sel.id)
    .classed('dim',d=>sel.type==='esp' || (sel.type==='region' && DATA.reg[d.iso]!==sel.id) || (sel.type==='prov' && d.iso!==sel.id && DATA.reg[d.iso]!==DATA.reg[sel.id]));
  provSel.filter(d=>sel.type==='prov' && d.iso===sel.id).raise();
  provSel.filter(d=>d.iso==='AR-C').raise();
}
function select(sel){
  state.sel = sel.type==='pais' ? {type:'pais',id:null} : sel;
  const pick = document.getElementById('pick');
  pick.value = state.sel.type==='pais' ? 'pais' : state.sel.type+':'+state.sel.id;
  hideTip(); highlight(); drawFlows(); renderPanel();
}

/* ---------- Período ---------- */
const yearIn = document.getElementById('year');
const yearOut = document.getElementById('year-out');
let periodToken = 0;
async function setPeriod(pk, fromSlider){
  const token = ++periodToken;
  try {
    if(!DATA.periods[pk]) DATA.periods[pk] = await getJSON('data/periods/'+pk+'.json');
  } catch(err) {
    if(token===periodToken) showLoadError(err, !state.period);
    return;
  }
  if(token!==periodToken) return;
  state.period = pk;
  buildView(pk);
  if(state.sel.type==='esp' && !OTHER[state.sel.id]) state.sel = {type:'esp', id: state.sel.id==='EXTPLAT' ? 'PLAT' : (OTHER.EXTPLAT ? 'EXTPLAT' : 'pais')};
  if(state.sel.id==='pais') state.sel = {type:'pais',id:null};
  buildPick();
  REG_C = Object.fromEntries(Object.keys(REGIONS).map(r=>[r,weightedCentroid(REG_ISOS[r])]));
  if(!fromSlider) yearIn.value = ORDER.indexOf(pk);
  const sem = isSem(pk);
  yearOut.textContent = sem ? META.semester.heading : pk;
  yearIn.setAttribute('aria-valuetext', sem ? META.semester.aria : pk);
  document.getElementById('lede').innerHTML = sem
    ? `Exportaciones de bienes del <strong>${META.semester.lede}</strong>, en millones de dólares. Cada dólar está asignado a la provincia donde se produjo el bien, no al puerto por donde salió. <span class="warn">Es medio año: no lo compares con los años completos.</span>`
    : `Exportaciones de bienes de <strong>${pk}</strong>, en millones de dólares corrientes. Cada dólar está asignado a la provincia donde se produjo el bien, no al puerto por donde salió.`;
  document.getElementById('prev').disabled = ORDER.indexOf(pk)===0;
  document.getElementById('next').disabled = ORDER.indexOf(pk)===ORDER.length-1;
  paint(); hideTip(); highlight(); drawFlows(); renderPanel();
}

function buildPick(){
  const pick = document.getElementById('pick'); if(!pick) return;
  let o = `<option value="pais">Todo el país</option><optgroup label="Regiones">`;
  Object.entries(REGNAMES).forEach(([id,n])=>{ o += `<option value="region:${id}">${esc(n)}</option>`; });
  o += `</optgroup>`;
  Object.entries(REGNAMES).forEach(([id,n])=>{
    o += `<optgroup label="Provincias de ${esc(n.replace('Región ',''))}">`;
    REG_ISOS[id].slice().sort((a,b)=>DATA.names[a].localeCompare(DATA.names[b],'es')).forEach(i=>{ o += `<option value="prov:${i}">${esc(DATA.names[i])}</option>`; });
    o += `</optgroup>`;
  });
  o += `<optgroup label="Fuera de las provincias">${Object.keys(OTHER||{}).map(k=>`<option value="esp:${k}">${esc(SPECIAL[k].name)}</option>`).join('')}</optgroup>`;
  pick.innerHTML = o;
  pick.value = state.sel.type==='pais' ? 'pais' : state.sel.type+':'+state.sel.id;
}

/* ---------- Controles ---------- */
let playTimer = null;
function stopPlay(){ clearInterval(playTimer); playTimer=null; const b=document.getElementById('play'); b.setAttribute('aria-pressed','false'); b.textContent='▶ Reproducir'; }
function initControls(){
  const pick = document.getElementById('pick');
  pick.addEventListener('change',()=>{
    const v = pick.value;
    if(v==='pais') select({type:'pais'}); else { const [t,id]=v.split(':'); select({type:t,id}); }
  });
  buildPick();
  const seg = document.getElementById('colorby');
  const opts = [{id:'total',short:'Total'}, ...RUBROS];
  seg.innerHTML = opts.map(r=>`<button type="button" data-m="${r.id}" aria-pressed="${r.id===state.metric}">${r.css?`<span class="sw" style="background:var(${r.css})"></span>`:''}${esc(r.short)}</button>`).join('');
  seg.addEventListener('click',e=>{
    const b = e.target.closest('button'); if(!b) return;
    state.metric = b.dataset.m;
    seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));
    paint();
  });
  yearIn.max = ORDER.length-1;
  let rt;
  yearIn.addEventListener('input',()=>{ stopPlay(); const pk = ORDER[+yearIn.value]; yearOut.textContent = isSem(pk)?META.semester.heading:pk; clearTimeout(rt); rt=setTimeout(()=>setPeriod(pk,true),60); });
  document.getElementById('prev').addEventListener('click',()=>{ stopPlay(); const i=ORDER.indexOf(state.period); if(i>0) setPeriod(ORDER[i-1]); });
  document.getElementById('next').addEventListener('click',()=>{ stopPlay(); const i=ORDER.indexOf(state.period); if(i<ORDER.length-1) setPeriod(ORDER[i+1]); });
  document.getElementById('play').addEventListener('click',e=>{
    if(playTimer){ stopPlay(); return; }
    const b = e.currentTarget; b.setAttribute('aria-pressed','true'); b.textContent='❚❚ Pausar';
    const lastYear = ORDER.filter(k=>!isSem(k)).pop();
    if(state.period===lastYear || isSem(state.period)) setPeriod(ORDER[0]);
    playTimer = setInterval(()=>{
      const i = ORDER.indexOf(state.period);
      if(ORDER[i]===lastYear){ stopPlay(); return; }
      setPeriod(ORDER[i+1]);
    }, 1300);
  });
}

function setNarrow(){
  const n = viz.clientWidth < 600;
  if(n===narrow && setNarrow.done) return false;
  narrow = n; setNarrow.done = true;
  document.getElementById('svg').classList.toggle('narrow',narrow);
  return true;
}

function renderTicks(){
  const years = ORDER.filter(k=>!isSem(k));
  const first = +years[0], last = +years[years.length-1];
  const labels = [String(first)];
  for(let y=first+8; y<last; y+=8) labels.push(String(y));
  if(labels[labels.length-1]!==String(last)) labels.push(String(last));
  if(META.semester) labels.push(META.semester.tick);
  document.querySelector('.ticks').innerHTML = labels.map(t=>`<span>${esc(t)}</span>`).join('');
}

async function getJSON(path){
  let res;
  try { res = await fetch(path); }
  catch(err){
    throw new Error('No se pudo leer '+path+'. Si abriste el archivo desde el disco, corré make serve y entrá a http://localhost:8000/ (file:// no permite cargar los datos).');
  }
  if(!res.ok) throw new Error('No se pudo leer '+path+' (error '+res.status+').');
  return res.json();
}

function showLoadError(err, fatal){
  const lede = document.getElementById('lede');
  lede.innerHTML = '<strong>No se pudieron cargar los datos.</strong> '+esc(err.message);
  if(fatal) document.body.classList.add('is-loading');
}

async function main(){
  let meta, geo, sem, series;
  try {
    [meta, geo, sem, series] = await Promise.all([
      getJSON('data/meta.json'),
      getJSON('data/geo.json'),
      getJSON('data/semestres.json'),
      getJSON('data/series.json'),
    ]);
  } catch(err) {
    showLoadError(err, true);
    return;
  }
  META = meta; GEO = geo; SERIES = series;
  DATA = {zones:meta.zones, names:meta.names, reg:meta.reg, order:meta.order, sem, periods:{}};
  ZKEYS = DATA.zones;
  ORDER = DATA.order;
  ISOS = Object.keys(DATA.names);
  REG_ISOS = {};
  ISOS.forEach(i=>{ (REG_ISOS[DATA.reg[i]] ||= []).push(i); });
  if(META.semester) SPECIAL.EXTPLAT.desc = SPECIAL.EXTPLAT.desc.replaceAll('2026', String(META.semester.year));
  buildDomains();
  drawBase();
  document.body.classList.remove('is-loading');
  renderTicks();
  setNarrow();
  initControls();
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change',paint);
  new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  let rz; addEventListener('resize',()=>{ clearTimeout(rz); rz=setTimeout(()=>{ if(setNarrow()){ drawLegend(); drawFlows(); } },150); });
  const years = ORDER.filter(k=>!isSem(k));
  await setPeriod(years[years.length-1]);
  select({type:'pais'});
}
main();

