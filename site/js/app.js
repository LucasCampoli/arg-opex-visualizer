
/* ---------- Datos (INDEC: microdatos OPEX 2002-2025 y anexo 1er semestre 2026) ---------- */
const RUBROS = [
  {id:'PP',  name:'Productos primarios', short:'Primarios', css:'--pp'},
  {id:'MOA', name:'Manufacturas de origen agropecuario', short:'Agroindustria (MOA)', css:'--moa'},
  {id:'MOI', name:'Manufacturas de origen industrial', short:'Industria (MOI)', css:'--moi'},
  {id:'CyE', name:'Combustibles y energía', short:'Energía (CyE)', css:'--cye'}
];
const TIPOS = [{id:'total', name:'Todos los rubros', short:'Todos'}, ...RUBROS];
const UNITS = [
  {id:'usd', short:'USD', long:'millones de USD', abbr:'M', lede:'millones de dólares corrientes', gap:'por rubro', note:'Dólares corrientes, sin ajustar por inflación.'},
  {id:'tn', short:'Toneladas', long:'miles de toneladas', abbr:'mil t', lede:'miles de toneladas de peso neto', gap:'en toneladas', note:'Toneladas de peso neto.'}
];
const ICONS = 'img/icons.svg';
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
const U = () => UNITS[state.unit];
const byTipo = v => v ? v[state.tipo] : null;
const fmt = v => `${M(v)} ${U().abbr}`;
const cap = s => s[0].toUpperCase() + s.slice(1);
const unitText = () => U().long + (state.tipo ? ' en ' + TIPOS[state.tipo].name.toLowerCase() : '');
const gapText = what => `Para el ${META.semester.lede}, el INDEC no publica ${what} ${U().gap}.`;
const iconSvg = id => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="${ICONS}#${esc(id)}"/></svg>`;
const topProducts = (list, n) => (list||[]).filter(p=>!state.tipo || p[1]===state.tipo).slice(0,n);

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
function totalOf(pk,key){ return SERIES[U().id][key]?.[pk]?.[state.tipo] ?? 0; }
function varOf(pk,key){
  if(isSem(pk)){
    const s = DATA.sem[U().id][key];
    const y = String(META.semester.year), prev = String(META.semester.previousYear);
    return s && s[prev]?.[state.tipo] ? 100*(s[y][state.tipo]/s[prev][state.tipo]-1) : null;
  }
  const i = ORDER.indexOf(pk); if(i<=0) return null;
  const prev = totalOf(ORDER[i-1],key); return prev ? 100*(totalOf(pk,key)/prev-1) : null;
}
function seriesOf(pk,key){
  if(isSem(pk)){
    const s = DATA.sem[U().id][key]||{};
    const ySem = String(META.semester.year);
    return Object.keys(s).sort().map(y=>({k:y===ySem?META.semester.id:null, lbl:y, v:s[y][state.tipo]}));
  }
  return ORDER.filter(k=>!isSem(k)).map(k=>({k, lbl:k, v:totalOf(k,key)}));
}

/* ---------- Vista del período elegido ---------- */
let P, REGIONS, NATION, OTHER, PER;
const addRows = rows => rows[0].map((_,j)=>rows.some(r=>r[j]==null) ? null : sum(rows.map(r=>r[j])));
const zoneRows = rows => rows && rows.every(v=>v[state.tipo]!=null) ? Object.fromEntries(ZKEYS.map((z,i)=>[z,rows[i]])) : null;
function originView(o){
  const b = o[U().id];
  return {total:byTipo(b.r), r:b.r.slice(1), z:zoneRows(b.z), p:b.p, c:b.c, k:byTipo(b.k)};
}
function merged(views){
  const z = views.every(v=>v.z) ? Object.fromEntries(ZKEYS.map(k=>[k, addRows(views.map(v=>v.z[k]))])) : null;
  return {r:addRows(views.map(v=>v.r)), z};
}
function ranking(rank){
  const b = rank?.[U().id] || {};
  return {p:b.p, c:b.c, k:byTipo(b.k)};
}
function buildView(pk){
  PER = DATA.periods[pk];
  P = {};
  ISOS.forEach(i=>{ P[i] = {iso:i, name:DATA.names[i], reg:DATA.reg[i], ...originView(PER.o[i]), var:varOf(pk,i)}; });
  OTHER = Object.fromEntries(specKeys(pk).map(k=>[k,{key:k, name:SPECIAL[k].name, ...originView(PER.o[k]), var:varOf(pk,k)}]));
  NATION = {name:'Todo el país', total:totalOf(pk,'N'), var:varOf(pk,'N'), ...merged([...Object.values(P), ...Object.values(OTHER)]), ...ranking(PER.nat)};
  REGIONS = {};
  Object.keys(REGNAMES).forEach(rg=>{
    const ps = REG_ISOS[rg].map(i=>P[i]);
    const total = sum(ps.map(p=>p.total));
    REGIONS[rg] = {name:REGNAMES[rg], total, var:varOf(pk,'R:'+rg), share:100*total/NATION.total, ...merged(ps), ...ranking(PER.reg[rg])};
  });
  ISOS.forEach(i=>{ P[i].share = 100*P[i].total/NATION.total; });
  REG_C = Object.fromEntries(Object.keys(REGIONS).map(r=>[r,weightedCentroid(REG_ISOS[r])]));
}

const svg = d3.select('#svg');
const tip = document.getElementById('tip');
const viz = document.getElementById('viz');

/* ---------- Estado ---------- */
const state = {sel:{type:'pais',id:null}, tipo:0, unit:0, icons:false, period:null, flows:[], pos:{}};

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
  const land = d3.select('#g-prov').node().getBBox(), vb = svg.node().viewBox.baseVal;
  d3.select('#clip-hits rect').attr('x',land.x+land.width).attr('y',vb.y).attr('width',vb.width).attr('height',vb.height);
}

function provTip(p){
  const vr = p.var==null ? '' : `<br><span class="s">${sgn(p.var)} ${isSem(state.period)?'frente al '+META.semester.compareShort:'frente al año anterior'}</span>`;
  return `<b>${esc(p.name)}</b><br>${state.tipo?esc(TIPOS[state.tipo].name)+':':'Exportó'} ${p.total>0?fmt(p.total):'sin exportaciones'}${vr}`;
}

/* ---------- Escala de color: fija para toda la serie, así los años se pueden comparar ---------- */
let colorScale;
function domain(){
  const key = U().id + state.tipo;
  if(!DOMAINS[key]){
    let lo=Infinity, hi=0;
    ORDER.forEach(k=>ISOS.forEach(i=>{
      const v = SERIES[U().id][i][k][state.tipo];
      if(v>0){ lo=Math.min(lo,v); hi=Math.max(hi,v); }
    }));
    DOMAINS[key] = [Math.max(1,lo), hi];
  }
  return DOMAINS[key];
}
function buildScale(){
  const interp = d3.piecewise(d3.interpolateLab, [cssv('--ramp-0'), cssv('--ramp-1'), cssv('--ramp-2')]);
  colorScale = d3.scaleSequentialLog(domain(), interp).clamp(true);
}
function paint(){
  buildScale();
  const zero = cssv('--zero');
  provSel.transition().duration(DUR()/1.5).attr('fill',d=>{ const v=P[d.iso].total; return v>0 ? colorScale(v) : zero; });
  provSel.attr('aria-label',d=>`${P[d.iso].name}: ${M(P[d.iso].total)} ${U().long}`);
  drawLegend();
}
function drawLegend(){
  const g = d3.select('#g-legend'); g.selectAll('*').remove();
  const x0=narrow?226:250, w=narrow?230:180, y0=narrow?930:948;
  const lg = d3.select('#lg'); lg.selectAll('stop').data(d3.range(0,1.0001,0.1)).join('stop')
    .attr('offset',d=>d).attr('stop-color',d=>colorScale.interpolator()(d));
  const title = `${state.tipo ? TIPOS[state.tipo].short : 'Total exportado'}, ${U().long}`;
  g.append('text').attr('class','legend-title').attr('x',x0).attr('y',y0-(narrow?12:10)).text(narrow?cap(U().long):title);
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
  return `<b>${esc(s.name)}</b><br>${fmt(o.total)}, ${pctOf(o.total,NATION.total)} del total<br><span class="s">Tocá para ver qué exporta y a dónde</span>`;
}
function drawSpecials(){
  const g = d3.select('#g-special'); g.selectAll('*').remove();
  const sc = narrow ? 1.7 : 1.25, sel = state.sel;
  Object.keys(OTHER).forEach(k=>{
    const s = SPECIAL[k], on = sel.type==='esp' && sel.id===k, dim = sel.type!=='pais' && !on;
    const parts = s.icon==='both' ? [['wave',SPECIAL.PLAT.pos],['globe',SPECIAL.EXT.pos]] : [[s.icon,s.pos]];
    const a = g.append('g').attr('class',`spec${on?' on':''}${dim?' dim':''}${s.icon==='q'?' ind':''}`)
      .attr('tabindex',0).attr('role','button').attr('aria-pressed',on)
      .attr('aria-label',`${s.name}: ${M(OTHER[k].total)} ${U().long}`)
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

function badge(g, p, x, y, r){
  const b = g.append('g').attr('class','badge').attr('transform',`translate(${x},${y})`);
  b.append('circle').attr('r',r).style('stroke',`var(${RUBROS[p[1]-1].css})`);
  b.append('use').attr('href',`${ICONS}#${p[3]}`).attr('x',-r*0.6).attr('y',-r*0.6).attr('width',r*1.2).attr('height',r*1.2);
}
function iconTip(iso, top){
  return `<b>${esc(P[iso].name)}</b>${top.map(p=>`<span class="ti">${iconSvg(p[3])}${esc(p[0])}${p[2]!=null?`: ${fmt(p[2])}`:''}</span>`).join('')}`;
}
function iconSpots(path, [cx,cy], n, r){
  const s = 2*r + 3, ring = r + 6, k = 0.8*r, line = d3.range(n).map(i=>(i-(n-1)/2)*s);
  const layouts = [
    line.map(x=>[x,r+4]),
    [[-ring*0.87,-ring/2],[ring*0.87,-ring/2],[0,ring]].slice(0,n),
    d3.range(n).map(i=>[0,r+4+i*s])
  ];
  const inside = ([x,y]) => [[0,0],[k,0],[-k,0],[0,k],[0,-k]].every(([dx,dy])=>path.isPointInFill(new DOMPoint(cx+x+dx,cy+y+dy)));
  const fit = layouts.find(l=>l.every(inside)) || line.map(x=>[x*0.2,0]);
  return fit.map(([x,y])=>[cx+x,cy+y]);
}
function drawIcons(){
  const g = d3.select('#g-icons'); g.selectAll('*').remove();
  if(!state.icons) return;
  const r = narrow ? 16 : 10;
  provSel.each(function(d){
    const top = topProducts(P[d.iso].p, 3);
    if(!top.length) return;
    const spots = iconSpots(this, CENT[d.iso], top.length, r);
    const a = g.append('g').datum(d.iso).attr('class','icons').classed('dim',isDim(d.iso))
      .on('click',()=>select({type:'prov',id:d.iso}))
      .on('pointermove',e=>showTip(e,iconTip(d.iso,top)))
      .on('pointerleave',hideTip);
    top.map((p,i)=>[p,spots[i]]).reverse().forEach(([p,[x,y]])=>badge(a,p,x,y,r));
  });
}

/* ---------- Columna de destinos ---------- */
const NX = 596, BW = 12, TOP = 30, BOTTOM = 986, G = 5, GG = 10;
let narrow = false;
const SZ = () => narrow ? {hh:40, minh:36, lblDy:9, hdDy:12, wrap:22} : {hh:30, minh:24, lblDy:6, hdDy:10, wrap:32};

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

function rubroParts(row){
  const parts = row.slice(1).map((v,i)=>!state.tipo || state.tipo===i+1 ? v : 0);
  return parts.every(v=>v!=null) ? parts : null;
}
function flowsFor(sel){
  const flows = [], origins = [];
  let missing = false;
  const push = (from, view, o) => {
    if(!view.z){ missing = true; return; }
    let s = 0;
    ZKEYS.forEach(z=>{ const v = view.z[z][state.tipo]; if(v>0.05){ flows.push({from,zone:z,v,o,parts:rubroParts(view.z[z])}); s+=v; } });
    const rest = view.total - s;
    if(rest > Math.max(5,view.total*0.002)) flows.push({from,zone:'nd',v:rest,o,nd:true});
  };
  if(sel.type==='pais'){
    Object.entries(REGIONS).forEach(([rid,r])=>{ push(r.name, r, REG_C[rid]); origins.push({c:REG_C[rid]}); });
    Object.values(OTHER).forEach(o=>push(o.name, o, SPECIAL[o.key].pos));
  } else if(sel.type==='esp'){
    push(OTHER[sel.id].name, OTHER[sel.id], SPECIAL[sel.id].pos);
  } else if(sel.type==='region'){
    push(REGIONS[sel.id].name, REGIONS[sel.id], REG_C[sel.id]);
    origins.push({c:REG_C[sel.id]});
  } else {
    push(P[sel.id].name, P[sel.id], CENT[sel.id]);
    origins.push({c:CENT[sel.id]});
  }
  if(missing) return {flows:[], origins, vals:{}, missing};
  const vals = {}; flows.forEach(f=>{ vals[f.zone]=(vals[f.zone]||0)+f.v; });
  return {flows, origins, vals, missing};
}

function anchors(ox,oy,w0,nx,ny,w){
  const gx = Math.max(400, ox+40), gy = oy + (ny-oy)*0.14;
  return {ox, gx, nx, ax:(ox+gx)/2, bx:gx+(nx-gx)*0.5, o:[oy-w0/2, oy+w0/2], g:[gy-w0/2, gy+w0/2], d:[ny-w/2, ny+w/2]};
}
function band(a, c0=0, c1=1){
  const at = (e,c) => e[0] + (e[1]-e[0])*c;
  const [o0,g0,d0,o1,g1,d1] = [at(a.o,c0), at(a.g,c0), at(a.d,c0), at(a.o,c1), at(a.g,c1), at(a.d,c1)];
  return `M${a.ox},${o0}C${a.ax},${o0} ${a.ax},${g0} ${a.gx},${g0}`+
         `C${a.bx},${g0} ${a.bx},${d0} ${a.nx},${d0}L${a.nx},${d1}`+
         `C${a.bx},${d1} ${a.bx},${g1} ${a.gx},${g1}`+
         `C${a.ax},${g1} ${a.ax},${o1} ${a.ox},${o1}Z`;
}

function drawFlows(){
  const sel = state.sel;
  const {flows, origins, vals, missing} = flowsFor(sel);
  const zonesVis = missing ? [] : ZONES.filter(z=>z.id==='nd' ? vals.nd>0 : NATION.z[z.id][state.tipo]>0);
  const L = layout(vals, zonesVis);
  const S = SZ();
  const byZone = d3.group(flows, f=>f.zone);
  byZone.forEach((arr,zid)=>{
    arr.sort((a,b)=>a.o[1]-b.o[1] || a.o[0]-b.o[0]);
    let y = L.pos[zid].by;
    arr.forEach(f=>{ const h=L.k*f.v; f.ny = y + h/2; f.w = h; y += h; });
  });
  flows.forEach(f=>{ f.w0 = Math.max(1, Math.min(f.w, 1 + f.w*0.07)); f.a = anchors(f.o[0],f.o[1],f.w0,NX,f.ny,f.w); });
  state.flows = flows;
  focusZone(null,false);

  const gF = d3.select('#g-flows');
  gF.selectAll('g.batch').interrupt().transition().duration(DUR()/2).style('opacity',0).remove();
  const batch = gF.append('g').attr('class','batch').style('opacity',0);
  batch.selectAll('path').data(flows).join('path')
    .attr('class',f=>'flow'+(f.nd?' nd':''))
    .attr('d',f=>band(f.a));
  batch.transition().delay(DUR()/3).duration(DUR()).style('opacity',1);

  d3.select('#g-hits').selectAll('path').data(flows).join('path').attr('class','flow-hit').attr('d',f=>band(f.a))
    .on('pointerenter',(e,f)=>focusZone(f.zone,true))
    .on('pointermove',(e,f)=>showTip(e,zoneTip(f.zone)))
    .on('pointerleave',(e,f)=>{ focusZone(f.zone,false); hideTip(); });

  const note = d3.select('#g-note').selectAll('text').data(missing ? [gapText('los destinos')] : []).join('text')
    .attr('class','flow-note').attr('x',NX).attr('y',TOP+S.hh);
  note.selectAll('tspan').data(t=>t.match(new RegExp(`.{1,${S.wrap}}(\\s|$)`,'g'))).join('tspan')
    .attr('x',NX).attr('dy',(d,i)=>i?'1.35em':0).text(d=>d.trim());

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
    .attr('aria-label',z=>{ const v=L.pos[z.id].v; return `${z.name}: ${v>0?M(v)+' '+U().long:'sin exportaciones en este período'}`; });
  visN.select('.node-hit').attr('x',NX-6).attr('width',906-NX).transition().duration(DUR()).attr('y',z=>L.pos[z.id].y0).attr('height',z=>L.pos[z.id].sh);
  visN.select('.node-bar').attr('x',NX).attr('width',BW).transition().duration(DUR()).attr('y',z=>L.pos[z.id].by).attr('height',z=>L.pos[z.id].bh);
  visN.select('.node-tick').attr('x1',NX).attr('x2',NX+BW).transition().duration(DUR())
    .attr('y1',z=>L.pos[z.id].cy).attr('y2',z=>L.pos[z.id].cy).style('opacity',z=>L.pos[z.id].v>0?0:1);
  visN.select('.node-name').attr('x',NX+BW+12).text(z=>z.name).transition().duration(DUR()).attr('y',z=>L.pos[z.id].cy+S.lblDy);
  visN.select('.node-val').attr('x',896).text(z=>{ const v=L.pos[z.id].v; return v>0 ? M(v) : '—'; })
    .transition().duration(DUR()).attr('y',z=>L.pos[z.id].cy+S.lblDy);

  state.lastVals = vals;
  state.pos = L.pos;
}

function zoneParts(zid){
  const flows = state.flows.filter(f=>f.zone===zid && f.parts);
  return flows.length ? RUBROS.map((r,i)=>sum(flows.map(f=>f.parts[i]))) : null;
}
function splitBar(zid){
  const parts = zoneParts(zid), pos = state.pos[zid];
  if(!parts || !pos) return [];
  const total = sum(parts);
  let y = pos.by;
  return parts.flatMap((v,i)=>{ const y0 = y; y += pos.bh*v/total; return v>0 ? [{y:y0, h:y-y0, css:RUBROS[i].css}] : []; });
}
function splitBands(zid){
  return state.flows.filter(f=>f.zone===zid && f.parts).flatMap(f=>{
    const total = sum(f.parts);
    let c = 0;
    return f.parts.flatMap((v,i)=>{ const c0 = c; c += v/total; return v>0 ? [{d:band(f.a,c0,c), css:RUBROS[i].css}] : []; });
  });
}
function focusZone(zid,on){
  d3.select('#g-flows').classed('focus',on).selectAll('path').classed('on',f=>on && f.zone===zid);
  d3.select('#g-split').selectAll('path').data(on ? splitBands(zid) : []).join('path')
    .attr('class','split').attr('d',d=>d.d).style('fill',d=>`var(${d.css})`);
  d3.select('#g-split-bar').selectAll('rect').data(on ? splitBar(zid) : []).join('rect')
    .attr('class','split').attr('x',NX).attr('width',BW).attr('y',d=>d.y).attr('height',d=>d.h).style('fill',d=>`var(${d.css})`);
}
function selTotal(sel){ return sel.type==='pais' ? NATION.total : sel.type==='region' ? REGIONS[sel.id].total : sel.type==='esp' ? OTHER[sel.id].total : P[sel.id].total; }
function selName(sel){ return sel.type==='pais' ? 'el país' : sel.type==='region' ? REGIONS[sel.id].name : sel.type==='esp' ? SPECIAL[sel.id].name.toLowerCase() : P[sel.id].name; }
function mixLine(zid, v){
  const parts = zoneParts(zid);
  if(state.tipo || !parts) return '';
  return `<span class="mix">${RUBROS.map((r,i)=>parts[i]>0.05 ? `<span><i style="background:var(${r.css})"></i>${r.id} ${pctOf(parts[i],v)}</span>` : '').join('')}</span>`;
}
function zoneTip(zid){
  const z = ZI[zid]; const sel = state.sel; const v = state.lastVals[zid]||0;
  let s = `<b>${esc(z.name)}</b><br><span class="s">${esc(z.members)}</span><br>`;
  s += v>0 ? `${fmt(v)}, ${pctOf(v,selTotal(sel))} de lo exportado por ${esc(selName(sel))}` : 'Sin exportaciones en este período';
  return s + mixLine(zid, v);
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
function bigNumber(v){ return `<div class="big"><span class="n">${M(v)}</span><span class="u">${esc(unitText())}</span></div>`; }
function rubroBlock(r){
  const total = sum(r), off = i => state.tipo && state.tipo!==i+1 ? ' class="off"' : '';
  const segs = RUBROS.map((x,i)=>`<span${off(i)} style="width:${total?100*r[i]/total:0}%;background:var(${x.css})" title="${esc(x.name)}"></span>`).join('');
  const rows = RUBROS.map((x,i)=>`<li${off(i)}><span class="sw" style="background:var(${x.css})"></span><span>${esc(x.name)}</span><span class="v">${r[i]>=0.05?fmt(r[i]):'—'}</span><span class="p">${r[i]>=0.05?pctOf(r[i],total):''}</span></li>`).join('');
  return `<div class="stack" role="img" aria-label="Composición por rubro">${segs}</div><ul class="rubros">${rows}</ul>`;
}
function destRows(entries, base){
  const max = d3.max(entries, d=>d.v) || 1;
  return `<ul class="rows">${entries.map(d=>`<li class="row${d.nd?' nd':''}"><span>${esc(d.name)}</span><span><span class="v">${fmt(d.v)}</span> <span class="small" style="margin:0">${pctOf(d.v,base)}</span></span><span class="bar"><i style="width:${100*d.v/max}%"></i></span>${d.note?`<span class="note">${esc(d.note)}</span>`:''}</li>`).join('')}</ul>`;
}
function varSpan(v){ return v==null ? '' : `<span class="${v>=0?'pos':'neg'}">${sgn(v)}</span>`; }
function varText(v){
  if(v==null) return isSem(state.period) ? '' : 'Primer año de la serie.';
  return `${varSpan(v)} ${isSem(state.period)?'frente al '+META.semester.compareWith:'frente a '+(+state.period-1)}.`;
}
function zoneEntries(z, base){
  const e = ZKEYS.filter(k=>z[k][state.tipo]>0.05).map(k=>({name:ZI[k].name, v:z[k][state.tipo]})).sort((a,b)=>b.v-a.v);
  const rest = base - sum(e.map(d=>d.v));
  if(rest>Math.max(5,base*0.002)) e.push({name:ZI.nd.name, v:rest, nd:true, note:ZI.nd.members});
  return e;
}
function countryLine(list, label, n=5){
  const top = (list||[]).map(c=>[c[0], byTipo(c[1])]).filter(c=>c[1]>0.05).sort((a,b)=>b[1]-a[1]).slice(0,n);
  if(!top.length) return '';
  return `<p class="small" style="margin:12px 0 0">${label}: ${top.map(c=>`${esc(c[0])} ${fmt(c[1])}`).join(', ')}.</p>`;
}
function destBlock(v, label, n){
  const body = v.z ? destRows(zoneEntries(v.z,v.total),v.total) + countryLine(v.c,label,n) : `<p class="small">${esc(gapText('los destinos'))}</p>`;
  return `<div class="sec"><h3>A dónde va</h3>${body}</div>`;
}
function confNote(k, total){
  if(!(k>0.5)) return '';
  return `<p class="small">Además, ${fmt(k)} (${pctOf(k,total)}) figuran como confidenciales: el INDEC publica la provincia, el rubro y el destino, pero no el producto, para no revelar datos de empresas individuales.</p>`;
}
function prodList(list, total, n=6){
  const top = topProducts(list, n);
  if(!top.length) return '';
  return `<p class="small" style="margin-top:16px">Principales productos</p><ul class="hl">${top.map(p=>{
    if(p[2]==null) return `<li>${esc(p[0])}</li>`;
    const extra = p[4]!=null ? `, ${sgn(p[4])} interanual` : `, ${pctOf(p[2],total)} del total`;
    return `<li>${esc(p[0])}: ${fmt(p[2])}${extra}</li>`; }).join('')}</ul>`;
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
    return `<rect class="evo-bar${on?' on':''}${clickable?' go':''}" x="${x.toFixed(1)}" y="${y(d.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H-padB-y(d.v)).toFixed(1)}" ${clickable?`data-period="${d.k}"`:''}><title>${d.lbl}${isSem(pk)?' (1er sem.)':''}: ${fmt(d.v)}</title></rect>`;
  }).join('');
  const cur = s.find(d=>d.lbl===curLbl);
  const peak = s.reduce((a,b)=>b.v>a.v?b:a);
  const first = s[0].lbl, last = s[s.length-1].lbl;
  const title = isSem(pk) ? `Primeros semestres, ${first}–${last}` : `Evolución anual, ${first}–${last}`;
  return `<div class="sec"><h3>${title}</h3>
    <svg class="evo" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: máximo en ${peak.lbl} con ${M(peak.v)} ${U().long}; ${curLbl}: ${M(cur?.v||0)} ${U().long}">
      <text class="evo-t" x="0" y="10">Máximo: ${fmt(peak.v)} (${peak.lbl})</text>
      ${bars}
      <text class="evo-t" x="0" y="${H-3}">${first}</text>
      <text class="evo-t" x="${W}" y="${H-3}" text-anchor="end">${last}</text>
    </svg>
    <p class="small">${isSem(pk)?'Se comparan solo primeros semestres, para no mezclar un semestre con años completos.':'Tocá una barra para ir a ese año.'} ${U().note}</p></div>`;
}

function renderPanel(){
  const sel = state.sel, el = document.getElementById('panel'), pk = state.period, sem = isSem(pk);
  const countries = sem ? 'Principales países (entre los que detalla el informe)' : 'Principales países';
  let h = '';
  if(sel.type==='pais'){
    const n = NATION;
    h += `<div class="panel-main"><p class="crumb">Argentina · ${esc(PER.label)}</p><h2>Todo el país</h2>`;
    h += bigNumber(n.total);
    h += `<p class="facts">${varText(n.var)}</p>`;
    h += `<div class="sec"><h3>Qué exporta</h3>${rubroBlock(n.r)}`;
    if(sem && PER.complejos && !state.tipo && U().id==='usd'){
      h += `<p class="small" style="margin-top:16px">Principales complejos exportadores</p>${destRows(PER.complejos.map(c=>({name:c[0],v:c[1],note:`${sgn(c[2])} interanual`})), n.total)}`;
    } else {
      h += prodList(n.p, n.total, 8) + confNote(n.k, n.total);
    }
    h += `</div>`;
    h += evoBlock('N');
    h += `</div>`;
    const rmax = d3.max(Object.values(REGIONS),r=>r.total);
    h += `<div class="pair">`;
    h += `<div class="sec"><h3>De dónde sale</h3><ul class="rows">${Object.entries(REGIONS).sort((a,b)=>b[1].total-a[1].total).map(([id,r])=>`<li class="row"><button type="button" data-region="${id}">${esc(r.name)}</button><span><span class="v">${fmt(r.total)}</span> <span class="small" style="margin:0">${nf1.format(r.share)}%</span></span><span class="bar"><i style="width:${100*r.total/rmax}%"></i></span></li>`).join('')}</ul>`;
    h += `<p class="small" style="margin:14px 0 8px">Fuera de las provincias</p><ul class="rows">${Object.values(OTHER).map(o=>`<li class="row"><button type="button" data-esp="${o.key}">${esc(SPECIAL[o.key].name)}</button><span><span class="v">${fmt(o.total)}</span> <span class="small" style="margin:0">${pctOf(o.total,n.total)}</span></span><span class="bar"><i style="width:${100*o.total/rmax}%"></i></span></li>`).join('')}</ul></div>`;
    h += destBlock(n, countries, 6);
    h += `</div>`;
  } else if(sel.type==='esp'){
    const o = OTHER[sel.id], s = SPECIAL[sel.id];
    let desc = s.desc;
    if(sel.id==='EXTPLAT' && PER.split) desc += ` En este semestre: ${M(PER.split.EXT[0])} millones de USD de origen extranjero y ${M(PER.split.PLAT[0])} millones de USD de plataforma continental.`;
    h += `<div class="panel-main"><p class="crumb"><button class="linkbtn" type="button" data-go="pais">Todo el país</button><span aria-hidden="true">·</span>Fuera de las provincias<span aria-hidden="true">·</span>${esc(PER.label)}</p><h2>${esc(s.name)}</h2>`;
    h += bigNumber(o.total);
    h += `<p class="facts">${varText(o.var)} ${pctOf(o.total,NATION.total)} del total nacional.</p>`;
    h += `<p class="desc">${esc(desc)}</p>`;
    h += `<div class="sec"><h3>Qué exporta</h3>${rubroBlock(o.r)}${prodList(o.p,o.total)}${confNote(o.k,o.total)}</div>`;
    h += evoBlock(sel.id);
    h += destBlock(o, countries);
    h += `</div>`;
  } else if(sel.type==='region'){
    const r = REGIONS[sel.id];
    h += `<div class="panel-main"><p class="crumb"><button class="linkbtn" type="button" data-go="pais">Todo el país</button><span aria-hidden="true">·</span>${esc(PER.label)}</p><h2>${esc(r.name)}</h2>`;
    h += bigNumber(r.total);
    h += `<p class="facts">${varText(r.var)} ${nf1.format(r.share)}% del total nacional.</p>`;
    h += `<div class="sec"><h3>Qué exporta</h3>${rubroBlock(r.r)}${prodList(r.p,r.total)}${confNote(r.k,r.total)}</div>`;
    h += evoBlock('R:'+sel.id);
    h += `</div>`;
    const provs = REG_ISOS[sel.id].map(i=>P[i]).sort((a,b)=>b.total-a.total);
    const pmax = provs[0].total || 1;
    h += `<div class="pair">`;
    h += `<div class="sec"><h3>Provincias</h3><ul class="rows">${provs.map(p=>`<li class="row"><button type="button" data-prov="${p.iso}">${esc(p.name)}</button><span><span class="v">${fmt(p.total)}</span> <span class="small" style="margin:0">${pctOf(p.total,r.total)}</span></span><span class="bar"><i style="width:${100*p.total/pmax}%"></i></span></li>`).join('')}</ul></div>`;
    h += destBlock(r, 'Principales países');
    h += `</div>`;
  } else {
    const p = P[sel.id], r = REGIONS[p.reg];
    const rank = Object.values(P).filter(q=>q.total>p.total).length + 1;
    h += `<div class="panel-main"><p class="crumb"><button class="linkbtn" type="button" data-go="pais">Todo el país</button><span aria-hidden="true">/</span><button class="linkbtn" type="button" data-region="${p.reg}">${esc(r.name)}</button><span aria-hidden="true">·</span>${esc(PER.label)}</p><h2>${esc(p.name)}</h2>`;
    h += bigNumber(p.total);
    h += `<p class="facts">${varText(p.var)} ${p.share>=0.1?nf1.format(p.share)+'%':'Menos del 0,1%'} del total nacional, puesto ${rank} de ${ISOS.length}.</p>`;
    h += `<div class="sec"><h3>Qué exporta</h3>${rubroBlock(p.r)}${prodList(p.p,p.total)}${confNote(p.k,p.total)}</div>`;
    h += evoBlock(p.iso);
    h += destBlock(p, countries);
    h += `</div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click',()=>select({type:'region',id:b.dataset.region})));
  el.querySelectorAll('[data-prov]').forEach(b=>b.addEventListener('click',()=>select({type:'prov',id:b.dataset.prov})));
  el.querySelectorAll('[data-esp]').forEach(b=>b.addEventListener('click',()=>select({type:'esp',id:b.dataset.esp})));
  el.querySelectorAll('[data-go="pais"]').forEach(b=>b.addEventListener('click',()=>select({type:'pais'})));
  el.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>setPeriod(b.dataset.period)));
}

/* ---------- Selección ---------- */
function isDim(iso){
  const sel = state.sel;
  return sel.type==='esp' || (sel.type==='region' && DATA.reg[iso]!==sel.id) || (sel.type==='prov' && iso!==sel.id && DATA.reg[iso]!==DATA.reg[sel.id]);
}
function highlight(){
  const sel = state.sel;
  provSel.classed('sel',d=>sel.type==='prov' && d.iso===sel.id).classed('dim',d=>isDim(d.iso));
  d3.selectAll('#g-icons .icons').classed('dim',isDim);
  provSel.filter(d=>sel.type==='prov' && d.iso===sel.id).raise();
  provSel.filter(d=>d.iso==='AR-C').raise();
}
function select(sel){
  state.sel = sel.type==='pais' ? {type:'pais',id:null} : sel;
  const pick = document.getElementById('pick');
  pick.value = state.sel.type==='pais' ? 'pais' : state.sel.type+':'+state.sel.id;
  hideTip(); highlight(); drawFlows(); renderPanel();
}
function render(){
  buildView(state.period);
  renderLede();
  const sw = document.getElementById('icons');
  sw.disabled = !ISOS.some(i=>P[i].p);
  sw.title = sw.disabled ? gapText('los productos') : '';
  paint(); drawIcons(); hideTip(); highlight(); drawFlows(); renderPanel();
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
  const specs = specKeys(pk);
  if(state.sel.type==='esp' && !specs.includes(state.sel.id)) state.sel = {type:'esp', id: state.sel.id==='EXTPLAT' ? 'PLAT' : (specs.includes('EXTPLAT') ? 'EXTPLAT' : 'pais')};
  if(state.sel.id==='pais') state.sel = {type:'pais',id:null};
  buildPick();
  const i = ORDER.indexOf(pk);
  if(!fromSlider) yearIn.value = i;
  showPeriod(pk);
  document.getElementById('prev').disabled = i===0;
  document.getElementById('next').disabled = i===ORDER.length-1;
  render();
}
function showPeriod(pk){
  const sem = isSem(pk);
  yearOut.textContent = sem ? META.semester.heading : pk;
  yearIn.setAttribute('aria-valuetext', sem ? META.semester.aria : pk);
}
function renderLede(){
  const pk = state.period;
  const where = 'Cada exportación se asigna a la provincia donde se produjo el bien, no al puerto por donde salió.';
  document.getElementById('lede').innerHTML = isSem(pk)
    ? `Exportaciones de bienes del <strong>${META.semester.lede}</strong>, en ${U().lede}. ${where} <span class="warn">Es medio año: no lo compares con los años completos.</span>`
    : `Exportaciones de bienes de <strong>${pk}</strong>, en ${U().lede}. ${where}`;
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
  o += `<optgroup label="Fuera de las provincias">${(state.period?specKeys(state.period):[]).map(k=>`<option value="esp:${k}">${esc(SPECIAL[k].name)}</option>`).join('')}</optgroup>`;
  pick.innerHTML = o;
  pick.value = state.sel.type==='pais' ? 'pais' : state.sel.type+':'+state.sel.id;
}

/* ---------- Controles ---------- */
let playTimer = null;
function stopPlay(){ clearInterval(playTimer); playTimer=null; const b=document.getElementById('play'); b.setAttribute('aria-pressed','false'); b.textContent='▶ Reproducir'; }
function segmented(id, opts, current, onPick){
  const seg = document.getElementById(id);
  seg.innerHTML = opts.map((o,i)=>`<button type="button" data-i="${i}" aria-pressed="${i===current}">${o.css?`<span class="sw" style="background:var(${o.css})"></span>`:''}${esc(o.short)}</button>`).join('');
  seg.addEventListener('click',e=>{
    const b = e.target.closest('button'); if(!b) return;
    seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));
    onPick(+b.dataset.i);
  });
}
function initControls(){
  const pick = document.getElementById('pick');
  pick.addEventListener('change',()=>{
    const v = pick.value;
    if(v==='pais') select({type:'pais'}); else { const [t,id]=v.split(':'); select({type:t,id}); }
  });
  buildPick();
  segmented('tipo', TIPOS, state.tipo, i=>{ state.tipo = i; render(); });
  segmented('unit', UNITS, state.unit, i=>{ state.unit = i; render(); });
  const sw = document.getElementById('icons');
  sw.addEventListener('click',()=>{ state.icons = !state.icons; sw.setAttribute('aria-checked',state.icons); drawIcons(); });
  yearIn.max = ORDER.length-1;
  let rt;
  yearIn.addEventListener('input',()=>{ stopPlay(); const pk = ORDER[+yearIn.value]; showPeriod(pk); clearTimeout(rt); rt=setTimeout(()=>setPeriod(pk,true),60); });
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
  document.body.classList.remove('is-loading');
  drawBase();
  renderTicks();
  setNarrow();
  initControls();
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change',paint);
  new MutationObserver(paint).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  let rz; addEventListener('resize',()=>{ clearTimeout(rz); rz=setTimeout(()=>{ if(setNarrow()){ drawLegend(); drawFlows(); drawIcons(); } },150); });
  const years = ORDER.filter(k=>!isSem(k));
  await setPeriod(years[years.length-1]);
  select({type:'pais'});
}
main();

