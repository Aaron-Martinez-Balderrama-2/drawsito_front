// Dibujo: páginas, grid, nodos, aristas, overlays
(function(){
  const DS=window.DS; const {dom,estado,util,pagina} = DS;
  const render = (DS.render = {});

  const colorBorde = '#3b3b3b', grisEnc = '#e6e6e6', puntos = '#1d4ed8';

  render.dibujar = ()=>{
    const ctx=dom.ctx; const m=estado.mundo; ctx.save();
    ctx.clearRect(0,0, dom.lienzo.width/(window.devicePixelRatio||1), dom.lienzo.height/(window.devicePixelRatio||1));

    // Páginas
    if (estado.opciones.verPagina){
      ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1;
      for(let x=0; x<m.w; x+=m.bloqueW){ for(let y=0; y<m.h; y+=m.bloqueH){
        ctx.strokeRect(x+.5, y+.5, m.bloqueW-1, m.bloqueH-1);
      }}
    }

    // Grid
    if (estado.opciones.verGrid){
      const g=m.grid; ctx.beginPath(); ctx.strokeStyle='#f1f5f9'; ctx.lineWidth=1;
      for(let x=0; x<m.w; x+=g){ ctx.moveTo(x+.5,0); ctx.lineTo(x+.5,m.h); }
      for(let y=0; y<m.h; y+=g){ ctx.moveTo(0,y+.5); ctx.lineTo(m.w,y+.5); }
      ctx.stroke();
    }

    // Aristas debajo de nodos para que los manejos queden arriba
    for(const a of estado.aristas) dibArista(ctx,a);

    // Nodos
    for(const n of estado.nodos){
      if(n.tipo==='clase') dibClase(ctx,n);
      else dibTexto(ctx,n);
    }

    // Botón borrar anclado
    actualizarBotonEliminar();

    ctx.restore();
    actualizarPanelDerecho();
  };

  function dibClase(ctx,n){
    util.layoutClase(n);
    // fondo + bordes
    ctx.lineWidth = 1; ctx.strokeStyle=colorBorde; ctx.fillStyle='#fff';
    ctx.fillRect(n.x, n.y, n.ancho, n.alto); ctx.strokeRect(n.x+.5,n.y+.5,n.ancho-1,n.alto-1);
    // encabezado
    ctx.fillStyle=grisEnc; ctx.fillRect(n.x, n.y, n.ancho, estado.H_TIT);
    ctx.beginPath(); ctx.moveTo(n.x, n.y+estado.H_TIT+.5); ctx.lineTo(n.x+n.ancho, n.y+estado.H_TIT+.5); ctx.strokeStyle=colorBorde; ctx.stroke();
    // título
    ctx.fillStyle='#111'; ctx.font='bold 13px system-ui'; ctx.fillText(n.titulo, n.x+8, n.y+18);

    const s = util.layoutClase(n), F=estado.FILA, M=estado.MARG;
    ctx.font='13px system-ui'; ctx.fillStyle='#111';
    // atributos
    let y=s.yAtr + 12;
    for(const atr of n.atributos){ ctx.fillText(atr, n.x+8, y); y+=F; }
    // separador
    ctx.beginPath(); ctx.moveTo(n.x, s.yMet-M+.5); ctx.lineTo(n.x+n.ancho, s.yMet-M+.5); ctx.stroke();
    // métodos
    y = s.yMet + 12;
    for(const me of n.metodos){ ctx.fillText(me, n.x+8, y); y+=F; }

    // puntos de conexión
    if (estado.opciones.conectores){
      const c=util.anclajes(n);
      ctx.fillStyle='#60a5fa'; for(const k of Object.keys(c)){ const p=c[k]; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill(); }
    }
    // plus para filas
    dibPlus(ctx, n, s);

    // manejas de redimensionado
    ctx.fillStyle='#1e293b';
    for (const h of [['nw',n.x,n.y],['ne',n.x+n.ancho,n.y],['sw',n.x,n.y+n.alto],['se',n.x+n.ancho,n.y+n.alto]]){
      ctx.beginPath(); ctx.arc(h[1],h[2],4,0,Math.PI*2); ctx.fill();
    }

    // selección
    if (estado.seleccion?.tipo==='nodo' && estado.seleccion.id===n.id){
      ctx.setLineDash([5,3]); ctx.strokeStyle=puntos; ctx.strokeRect(n.x+.5,n.y+.5,n.ancho-1,n.alto-1); ctx.setLineDash([]);
    }
  }

  function dibTexto(ctx,n){
    ctx.fillStyle='#111'; ctx.font='13px system-ui';
    ctx.fillText(n.texto, n.x+4, n.y+14);
    ctx.strokeStyle='#999'; ctx.strokeRect(n.x+.5,n.y+.5,n.ancho-1,n.alto-1);
    if (estado.seleccion?.tipo==='nodo' && estado.seleccion.id===n.id){
      ctx.setLineDash([5,3]); ctx.strokeStyle=puntos; ctx.strokeRect(n.x+.5,n.y+.5,n.ancho-1,n.alto-1); ctx.setLineDash([]);
    }
  }

  function dibPlus(ctx,n,s){
    ctx.fillStyle='#2563eb';
    // atributo +
    ctx.beginPath(); ctx.arc(n.x+n.ancho-12, s.yAtr+4, 6,0,Math.PI*2); ctx.fill();
    // método +
    ctx.beginPath(); ctx.arc(n.x+n.ancho-12, s.yMet+4, 6,0,Math.PI*2); ctx.fill();
    // icono +
    ctx.fillStyle='#fff'; ctx.font='bold 12px system-ui';
    ctx.fillText('+', n.x+n.ancho-15, s.yAtr+8);
    ctx.fillText('+', n.x+n.ancho-15, s.yMet+8);
  }

  function dibArista(ctx,a){
    const o=util.buscarNodoPorId(a.origenId), d=util.buscarNodoPorId(a.destinoId);
    if(!o||!d) return;
    const ladoO=util.ladoPreferido(o,d), ladoD=util.ladoPreferido(d,o);
    const pO=util.anclajes(o)[ladoO], pD=util.anclajes(d)[ladoD];

    // línea
    ctx.strokeStyle='#111'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(pO.x, pO.y); ctx.lineTo(pD.x, pD.y); ctx.stroke();

    // flecha triangular simple hacia destino
    const ang=Math.atan2(pD.y-pO.y, pD.x-pO.x), len=10;
    ctx.beginPath();
    ctx.moveTo(pD.x, pD.y);
    ctx.lineTo(pD.x - len*Math.cos(ang-Math.PI/8), pD.y - len*Math.sin(ang-Math.PI/8));
    ctx.lineTo(pD.x - len*Math.cos(ang+Math.PI/8), pD.y - len*Math.sin(ang+Math.PI/8));
    ctx.closePath(); ctx.fillStyle='#111'; ctx.fill();

    // etiquetas: cardinalidades y texto central
    ctx.font='12px system-ui'; ctx.fillStyle='#0f172a';
    if (a.card_o){ const ex=pO.x + 10*Math.cos(ang), ey=pO.y + 10*Math.sin(ang); ctx.fillText(a.card_o, ex+4, ey-4); }
    if (a.card_d){ const ex=pD.x - 10*Math.cos(ang), ey=pD.y - 10*Math.sin(ang); ctx.fillText(a.card_d, ex+4, ey-4); }
    if (a.etiqueta){
      const mx=(pO.x+pD.x)/2, my=(pO.y+pD.y)/2;
      ctx.fillText(a.etiqueta, mx+6, my-6);
    }

    // selección
    if (estado.seleccion?.tipo==='arista' && estado.seleccion.idx!==undefined && DS.estado.aristas[estado.seleccion.idx]===a){
      ctx.setLineDash([6,3]); ctx.strokeStyle='#2563eb'; ctx.beginPath(); ctx.moveTo(pO.x,pO.y); ctx.lineTo(pD.x,pD.y); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // UI lateral
  function actualizarPanelDerecho(){
    const s=estado.seleccion;
    if(s?.tipo==='nodo'){
      const n=util.buscarNodoPorId(s.id);
      if (n?.tipo==='clase'){ dom.panelClase.style.display='block'; dom.inpTitulo.value=n.titulo; }
      else dom.panelClase.style.display='none';
    } else dom.panelClase.style.display='none';
  }

  function actualizarBotonEliminar(){
    const s=estado.seleccion; const b=dom.btnBorrar;
    if(!s){ b.style.display='none'; return; }
    let px=0,py=0;
    if(s.tipo==='nodo'){
      const n=util.buscarNodoPorId(s.id); if(!n){b.style.display='none';return;}
      px=n.x+n.ancho-12; py=n.y-22;
    }else{ // arista
      const a=estado.aristas[s.idx]; if(!a){b.style.display='none';return;}
      const o=util.buscarNodoPorId(a.origenId), d=util.buscarNodoPorId(a.destinoId);
      if(!o||!d){b.style.display='none';return;}
      px=(o.x+o.ancho/2 + d.x+d.ancho/2)/2; py=(o.y+o.alto/2 + d.y+d.alto/2)/2 - 26;
    }
    const p=pagina.posEnZona(px,py);
    b.style.left=p.left+'px'; b.style.top=p.top+'px'; b.style.display='block';
  }

  // Helpers públicos usados por interaccion
  render.conectorCercano = (n,x,y)=>{
    const c=util.anclajes(n);
    for(const [nombre,p] of Object.entries(c)){
      if(Math.hypot(x-p.x,y-p.y)<9) return {nombre, x:p.x, y:p.y};
    }
    return null;
  };
  render.dentroPlus = (n,x,y)=>{
    const s=util.layoutClase(n);
    const en = (cx,cy)=> Math.hypot(x-cx,y-cy)<=7 ? true:false;
    if(en(n.x+n.ancho-12, s.yAtr+4)) return {seccion:'atr'};
    if(en(n.x+n.ancho-12, s.yMet+4)) return {seccion:'met'};
    return null;
  };
  render.indiceSeccion = (n,x,y)=>{
    const s=util.layoutClase(n), F=estado.FILA, H=estado.H_TIT, M=estado.MARG;
    if(y<=n.y+H) return {tipo:'titulo'};
    if(y>=s.yAtr && y<s.yMet-M){ const idx=Math.floor((y-s.yAtr)/F); return {tipo:'atr',idx}; }
    if(y>=s.yMet && y<=n.y+n.alto){ const idx=Math.floor((y-s.yMet)/F); return {tipo:'met',idx}; }
    return {tipo:'none'};
  };
})();
