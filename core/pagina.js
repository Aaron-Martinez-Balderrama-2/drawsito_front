// Papel, zoom, coordenadas y expansión/contracción de hoja
(function(){
  const {dom,estado} = window.DS;
  const pagina = (window.DS.pagina = {});

  pagina.mm2px = mm => Math.round(mm*96/25.4);
  pagina.tamPapelPx = nombre => nombre==='Letter'
    ? {w:pagina.mm2px(216), h:pagina.mm2px(279)}
    : {w:pagina.mm2px(210), h:pagina.mm2px(297)}; // A4

  pagina.aplicarPapel = ()=>{
    const base = pagina.tamPapelPx(estado.opciones.papel);
    const W = estado.opciones.orientacion==='h' ? base.h : base.w;
    const H = estado.opciones.orientacion==='h' ? base.w : base.h;
    estado.mundo.bloqueW=W; estado.mundo.bloqueH=H;
    pagina.recalcularTamMundo(true);   // <-- fuerza al menos 1 hoja visible
  };

  pagina.recalcularTamMundo = (forzarMin=false)=>{
    let maxX=0,maxY=0;
    for(const n of estado.nodos){ maxX=Math.max(maxX,n.x+n.ancho); maxY=Math.max(maxY,n.y+n.alto); }
    const m=estado.mundo, W=m.bloqueW, H=m.bloqueH, M=m.margen;
    const wBloques = Math.max(1, Math.ceil((maxX+M)/W));
    const hBloques = Math.max(1, Math.ceil((maxY+M)/H));
    m.w = (forzarMin || maxX===0) ? W : wBloques*W;
    m.h = (forzarMin || maxY===0) ? H : hBloques*H;
    pagina.setTamCanvas();
  };

  pagina.setTamCanvas = ()=>{
    const dpr = Math.max(1, window.devicePixelRatio||1);
    const z   = Math.max(.25, Math.min(3, estado.mundo.zoom));
    dom.lienzo.style.width  = estado.mundo.w+'px';
    dom.lienzo.style.height = estado.mundo.h+'px';
    dom.lienzo.width  = Math.round(estado.mundo.w * dpr);
    dom.lienzo.height = Math.round(estado.mundo.h * dpr);
    const ctx=dom.ctx; ctx.setTransform(dpr*z,0,0,dpr*z,0,0);
    window.DS.render && window.DS.render.dibujar();
  };

  // Mantiene el punto bajo el cursor al hacer zoom
  pagina.hacerZoom = (nuevoZoom, centroX, centroY)=>{
    const z0 = estado.mundo.zoom, z1 = Math.max(.25, Math.min(3, nuevoZoom));
    if (Math.abs(z1-z0)<.001) return;
    const r = dom.lienzo.getBoundingClientRect();
    const cx = (centroX ?? (r.left + r.width/2));
    const cy = (centroY ?? (r.top  + r.height/2));
    const pz = { x:(cx-r.left)/z0, y:(cy-r.top)/z0 };
    estado.mundo.zoom = z1;
    pagina.setTamCanvas();
    const pz1 = { x:pz.x*z1, y:pz.y*z1 };
    dom.zona.scrollLeft = Math.max(0, pz1.x - (cx - r.left));
    dom.zona.scrollTop  = Math.max(0, pz1.y - (cy - r.top));
    window.DS.render.dibujar();
  };

  pagina.aCanvas = ev=>{
    const r=dom.lienzo.getBoundingClientRect(), z=estado.mundo.zoom||1;
    return { x:(ev.clientX-r.left)/z, y:(ev.clientY-r.top)/z };
  };

  pagina.posEnZona = (x,y)=>({ left:x*estado.mundo.zoom - dom.zona.scrollLeft, top:y*estado.mundo.zoom - dom.zona.scrollTop });

  // Expansión automática
  pagina.expandirSiNecesario = (n)=>{
    let cambio=false; const m=estado.mundo, M=m.margen;
    if (n.x+n.ancho+M > m.w){ m.w += m.bloqueW; cambio=true; }
    if (n.y+n.alto +M > m.h){ m.h += m.bloqueH; cambio=true; }
    if (n.x < M){ m.w += m.bloqueW; for(const k of estado.nodos) k.x += m.bloqueW; dom.zona.scrollLeft += m.bloqueW; cambio=true; }
    if (n.y < M){ m.h += m.bloqueH; for(const k of estado.nodos) k.y += m.bloqueH; dom.zona.scrollTop  += m.bloqueH; cambio=true; }
    if (cambio) pagina.setTamCanvas();
  };

  // Contracción cuando sobran hojas
  pagina.contraerSiCabe = ()=> pagina.recalcularTamMundo(false);

  pagina.centrarVista = ()=>{
    const m=estado.mundo, r=dom.lienzo.getBoundingClientRect();
    dom.zona.scrollLeft = Math.max(0, (m.w - r.width )/2);
    dom.zona.scrollTop  = Math.max(0, (m.h - r.height)/2);
  };
})();