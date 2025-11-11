// Eventos del usuario, editor en vivo, panel derecho y guardar/cargar
(function () {
  const DS = window.DS;
  const { dom, estado, util, pagina, render } = DS;
  const API = window.DRAWSITO_CONFIG.api;

  // === Helpers de aristas (soporta polilínea con puntos) ==================
  function puntosGeometriaDeArista(a){
    const o = util.buscarNodoPorId(a.origenId), d = util.buscarNodoPorId(a.destinoId);
    if(!o||!d) return null;
    const pO = util.anclajes(o)[a.anc_o || util.ladoPreferido(o,d)];
    const pD = util.anclajes(d)[a.anc_d || util.ladoPreferido(d,o)];
    const pts = [pO, ...(a.puntos||[]), pD];
    return {o,d,pts};
  }

  function pickAristaCercana(x, y) {
    let mejor = { d: 999, idx: -1, seg: -1, cp:null };
    estado.aristas.forEach((a, i) => {
      const g = puntosGeometriaDeArista(a); if(!g) return;
      const {pts} = g;
      for(let s=0; s<pts.length-1; s++){
        const p1=pts[s], p2=pts[s+1];
        const r = DS.util.distPuntoSegmento(x, y, p1.x, p1.y, p2.x, p2.y);
        if (r.d < mejor.d) mejor = { d: r.d, idx: i, seg: s, cp:{x:r.x,y:r.y} };
      }
    });
    return (mejor.idx >= 0 && mejor.d < 8) ? mejor : null;
  }

  // ============= Reubicación de overlays (fixed) en scroll/resize =========
  function reubicarOverlays(){
    // editor inline
    if (dom.editor.style.display !== "none") {
      const id = parseInt(dom.editor.dataset.nodo||'0',10);
      const n = DS.util.buscarNodoPorId(id);
      if (n){
        let x = n.x + 8, y;
        if (n.tipo === "clase") {
          const s = DS.util.layoutClase(n);
          const tipo = dom.editor.dataset.tipo;
          const idx  = dom.editor.dataset.idx===''? null : parseInt(dom.editor.dataset.idx,10);
          if (tipo === "titulo") y = n.y + 6;
          if (tipo === "atr")    y = s.yAtr + idx * estado.FILA + 2;
          if (tipo === "met")    y = s.yMet + idx * estado.FILA + 2;
        } else {
          y = n.y + 6;
        }
        const p = pagina.posEnViewport(x, y);
        dom.editor.style.left = p.left + "px";
        dom.editor.style.top  = p.top  + "px";
        const w = (n.ancho - 16) * (estado.mundo.zoom||1);
        dom.editor.style.width = Math.max(80, Math.round(w)) + "px";
      }
    }
    // editor arista
    if (dom.editorArista.style.display !== "none") {
      const cx = parseFloat(dom.editorArista.dataset.cx || '0');
      const cy = parseFloat(dom.editorArista.dataset.cy || '0');
      const p = pagina.posEnViewport(cx + 6, cy - 6);
      dom.editorArista.style.left = p.left + "px";
      dom.editorArista.style.top  = p.top  + "px";
    }
  }
  dom.zona.addEventListener('scroll', reubicarOverlays);
  window.addEventListener('resize', reubicarOverlays);

  // === Mouse move =========================================================
  dom.lienzo.addEventListener("mousemove", (e) => {
    const { x, y } = pagina.aCanvas(e);
    estado.p_mouse = { x, y };
    estado.hover_conector = null;
    estado.hover_nodoId = null;

    const n = util.obtenerNodoEn(x, y);
    if (n) {
      estado.hover_nodoId = n.id;
      if (n.tipo === "clase") {
        const c = render.conectorCercano(n, x, y);
        if (c) estado.hover_conector = { ...c, activo: true };
      }
    }

    if (estado.marcando && estado.marcoRect){
      estado.marcoRect.x2 = x;
      estado.marcoRect.y2 = y;
      render.dibujar();
      return;
    }

    if (estado.arrastrandoPuntoArista){
      const {idxArista, idxP} = estado.arrastrandoPuntoArista;
      const a = estado.aristas[idxArista];
      if (a && a.puntos && a.puntos[idxP]){
        a.puntos[idxP].x = x; a.puntos[idxP].y = y;
        render.dibujar();
        return;
      }
    }

    if (estado.arrastrandoExtremoArista){
      const {idxArista, extremo} = estado.arrastrandoExtremoArista;
      const a = estado.aristas[idxArista]; if (!a) return;
      const nodo = util.buscarNodoPorId(extremo==='o'? a.origenId : a.destinoId);
      if (nodo){
        const lado = util.anclaMasCercana(nodo, x, y);
        if (extremo==='o') a.anc_o = lado; else a.anc_d = lado;
      }
      render.dibujar();
      return;
    }

    if (estado.arrastreGrupo){
      for (const it of estado.arrastreGrupo.items){
        const n2 = util.buscarNodoPorId(it.id);
        if (n2){
          n2.x = x - it.dx; n2.y = y - it.dy;
          pagina.expandirSiNecesario(n2);
          DS.emitMoveNode(n2.id, n2.x, n2.y);
        }
      }
      render.dibujar();
      return;
    }

    if (estado.arrastrando && estado.seleccion?.tipo === 'nodo') {
      const no = util.buscarNodoPorId(estado.seleccion.id);
      if (no) {
        no.x = x - estado.dx; no.y = y - estado.dy;
        pagina.expandirSiNecesario(no);
        DS.emitMoveNode(no.id, no.x, no.y);
      }
    }

    if (estado.redimensionando && estado.seleccion?.tipo === 'nodo') {
      const no = util.buscarNodoPorId(estado.seleccion.id);
      if (no) {
        if (estado.handle === 'se') { no.ancho = Math.max(no.minW, x - no.x); no.alto = Math.max(no.minH, y - no.y); }
        if (estado.handle === 'sw') { const nx = Math.min(x, no.x + no.ancho - no.minW); no.ancho = Math.max(no.minW, (no.x + no.ancho) - x); no.x = nx; no.alto = Math.max(no.minH, y - no.y); }
        if (estado.handle === 'ne') { const ny = Math.min(y, no.y + no.alto - no.minH); no.alto = Math.max(no.minH, (no.y + no.alto) - y); no.y = ny; no.ancho = Math.max(no.minW, x - no.x); }
        if (estado.handle === 'nw') { const nx = Math.min(x, no.x + no.ancho - no.minW), ny = Math.min(y, no.y + no.alto - no.minH);
          no.ancho = Math.max(no.minW, (no.x + no.ancho) - x); no.x = nx;
          no.alto = Math.max(no.minH, (no.y + no.alto) - y); no.y = ny; }
        DS.util.layoutClase(no);
        pagina.expandirSiNecesario(no);
        DS.emitResizeNode(no.id, no.ancho, no.alto);
      }
    }

    render.dibujar();
  });

  // === Mouse down =========================================================
  dom.lienzo.addEventListener("mousedown", (e) => {
    const { x, y } = pagina.aCanvas(e);
    const n = util.obtenerNodoEn(x, y);

    if (estado.seleccion?.tipo==='arista'){
      const a = estado.aristas[estado.seleccion.idx];
      if (a){
        const g = (function(){
          const o = util.buscarNodoPorId(a.origenId), d = util.buscarNodoPorId(a.destinoId);
          if(!o||!d) return null;
          const pO = util.anclajes(o)[a.anc_o || util.ladoPreferido(o,d)];
          const pD = util.anclajes(d)[a.anc_d || util.ladoPreferido(d,o)];
          return {pO,pD};
        })();
        if (g){
          if (Math.hypot(x-g.pO.x,y-g.pO.y) <= 8){ estado.arrastrandoExtremoArista={idxArista:estado.seleccion.idx, extremo:'o'}; return; }
          if (Math.hypot(x-g.pD.x,y-g.pD.y) <= 8){ estado.arrastrandoExtremoArista={idxArista:estado.seleccion.idx, extremo:'d'}; return; }
        }
        if (a.puntos){
          for (let i=0;i<a.puntos.length;i++){
            const p=a.puntos[i]; if (Math.hypot(x-p.x,y-p.y)<=7){
              estado.arrastrandoPuntoArista = {idxArista:estado.seleccion.idx, idxP:i};
              return;
            }
          }
        }
      }
    }

    if (!n) {
      const pick = pickAristaCercana(x, y);
      if (pick) {
        estado.seleccion = { tipo: 'arista', idx: pick.idx };
        estado.selNodos.clear();
        if (e.shiftKey){
          const a = estado.aristas[pick.idx];
          a.puntos = a.puntos || [];
          a.puntos.splice(pick.seg+1, 0, {x:pick.cp.x, y:pick.cp.y});
          DS.emitUpdateEdge(a.id, {puntos: a.puntos});
        }
        render.dibujar();
        return;
      }
    }

    if (n && n.tipo === "clase") {
      for (const [h, cx, cy] of [['nw', n.x, n.y], ['ne', n.x + n.ancho, n.y], ['sw', n.x, n.y + n.alto], ['se', n.x + n.ancho, n.y + n.alto]]) {
        if (Math.hypot(x - cx, y - cy) <= 6) { estado.seleccion = { tipo: 'nodo', id: n.id }; estado.selNodos.clear(); estado.selNodos.add(n.id); estado.redimensionando = true; estado.handle = h; render.dibujar(); return; }
      }
      const c = render.conectorCercano(n, x, y);
      if (c) {
        estado.conectando = true;
        estado.nodo_origen = n;
        estado.ancla_origen = c.nombre;
        estado.seleccion = { tipo: 'nodo', id: n.id };
        estado.selNodos.clear(); estado.selNodos.add(n.id);
        return;
      }
    }

    if (n) {
      if (e.ctrlKey || e.metaKey){
        if (estado.selNodos.has(n.id)) estado.selNodos.delete(n.id); else estado.selNodos.add(n.id);
        estado.seleccion = estado.selNodos.size===1 ? {tipo:'nodo', id:[...estado.selNodos][0]} : null;
        render.dibujar();
        return;
      }

      if (!estado.selNodos.has(n.id)){ estado.selNodos.clear(); }
      estado.selNodos.add(n.id);
      estado.seleccion = estado.selNodos.size===1 ? {tipo:'nodo', id:n.id} : null;

      if (n.tipo === "clase") {
        const p = render.dentroPlus(n, x, y);
        if (p) {
          if (p.seccion === "atr") { n.atributos.push("- nuevo"); DS.util.layoutClase(n); abrirEditor(n, "atr", n.atributos.length - 1); render.dibujar(); return; }
          if (p.seccion === "met") { n.metodos.push("+ nuevo()"); DS.util.layoutClase(n); abrirEditor(n, "met", n.metodos.length - 1); render.dibujar(); return; }
        }
      }

      estado.arrastreGrupo = {
        baseX:x, baseY:y,
        items: [...estado.selNodos].map(id=>{
          const nn = util.buscarNodoPorId(id);
          return {id, dx: x - nn.x, dy: y - nn.y};
        })
      };
      render.dibujar();
      return;
    }

    estado.seleccion = null;
    estado.selNodos.clear();
    estado.marcando = true;
    estado.marcoRect = {x1:x, y1:y, x2:x, y2:y};
    render.dibujar();
  });

  // === Mouse up ===========================================================
  window.addEventListener("mouseup", (e) => {
    const { x, y } = pagina.aCanvas(e);

    if (estado.arrastrandoPuntoArista){
      const {idxArista} = estado.arrastrandoPuntoArista;
      const a = estado.aristas[idxArista]; if (a) DS.emitUpdateEdge(a.id, {puntos: a.puntos||[]});
      estado.arrastrandoPuntoArista=null; render.dibujar(); return;
    }
    if (estado.arrastrandoExtremoArista){
      const {idxArista} = estado.arrastrandoExtremoArista;
      const a = estado.aristas[idxArista]; if (a) DS.emitUpdateEdge(a.id, {anc_o:a.anc_o, anc_d:a.anc_d});
      estado.arrastrandoExtremoArista=null; render.dibujar(); return;
    }

    if (estado.conectando && estado.nodo_origen) {
      const origen = estado.nodo_origen;
      const n = util.obtenerNodoEn(x, y);
      if (n && n.id !== origen.id) {
        const ladoD = util.anclaMasCercana(n, x, y);
        if (!util.existeArista(origen.id, n.id)){
          const edge = {
            id: Date.now()+Math.floor(Math.random()*1000),
            origenId: origen.id, destinoId: n.id,
            anc_o: estado.ancla_origen, anc_d: ladoD,
            tam:12, puntos:[],
            // NUEVO: por defecto mantenemos flecha Origen→Destino (compatibilidad)
            nav:'o2d'
          };
          estado.aristas.push(edge);
          DS.emitAddEdge(edge);
        }
      } else if (!n) {
        const nn = DS.util.porDefectoClase(x - 120, y - 60);
        DS.util.layoutClase(nn);
        estado.nodos.push(nn);
        DS.emitAddNode(nn);
        const ladoD = util.ladoPreferido(nn, origen);
        if (!util.existeArista(origen.id, nn.id)){
          const edge = {
            id: Date.now()+Math.floor(Math.random()*1000),
            origenId: origen.id, destinoId: nn.id,
            anc_o: estado.ancla_origen, anc_d: ladoD,
            tam:12, puntos:[],
            nav:'o2d'
          };
          estado.aristas.push(edge);
          DS.emitAddEdge(edge);
        }
        estado.seleccion = { tipo: 'nodo', id: nn.id };
        estado.selNodos.clear(); estado.selNodos.add(nn.id);
        pagina.expandirSiNecesario(nn);
        pagina.enfocarNodo(nn);
      }
    }

    if (estado.redimensionando && estado.seleccion?.tipo==='nodo'){
      const no = DS.util.buscarNodoPorId(estado.seleccion.id);
      if (no) DS.emitResizeNode(no.id, no.ancho, no.alto);
    }
    estado.redimensionando = false; estado.handle = null;
    estado.conectando = false; estado.nodo_origen = null; estado.ancla_origen = null;
    estado.arrastrando = false;
    if (estado.arrastreGrupo){ estado.arrastreGrupo=null; }

    if (estado.marcando && estado.marcoRect){
      estado.marcando=false;
      const r = DS.util.recta(estado.marcoRect.x1, estado.marcoRect.y1, x, y);
      estado.marcoRect=null;
      estado.selNodos.clear();
      for (const n of estado.nodos){ if (DS.util.intersecaNodo(n, r)) estado.selNodos.add(n.id); }
      estado.seleccion = estado.selNodos.size===1 ? {tipo:'nodo', id:[...estado.selNodos][0]} : null;
    }

    pagina.contraerSiCabe();
    render.dibujar();
  });

  // === Doble clic: editor en vivo / editor de aristas =====================
  dom.lienzo.addEventListener("dblclick", (e) => {
    const { x, y } = pagina.aCanvas(e);
    const n = util.obtenerNodoEn(x, y);
    if (n) {
      estado.selNodos.clear(); estado.selNodos.add(n.id);
      estado.seleccion = { tipo: 'nodo', id: n.id };
      if (n.tipo === "clase") {
        const z = DS.util.layoutClase(n) && DS.render.indiceSeccion(n, x, y);
        if (z.tipo === "titulo") abrirEditor(n, "titulo");
        if (z.tipo === "atr")   abrirEditor(n, "atr", z.idx);
        if (z.tipo === "met")   abrirEditor(n, "met", z.idx);
      } else abrirEditor(n, "texto");
      return;
    }
    const pick = pickAristaCercana(x, y);
    if (pick) { abrirEditorArista(pick.idx, pick.cp.x, pick.cp.y); }
  });

  dom.lienzo.addEventListener('dblclick', (e)=>{
    const {x,y}=pagina.aCanvas(e);
    if (estado.seleccion?.tipo==='arista'){
      const a=estado.aristas[estado.seleccion.idx];
      if (a?.puntos){
        for (let i=0;i<a.puntos.length;i++){
          const p=a.puntos[i]; if (Math.hypot(x-p.x,y-p.y)<=7){
            a.puntos.splice(i,1); DS.emitUpdateEdge(a.id,{puntos:a.puntos}); render.dibujar(); return;
          }
        }
      }
    }
  });

  // === Teclas: eliminar ===================================================
  window.addEventListener("keydown", (e) => {
    const esBorrar = e.key === "Delete" || e.key === "Backspace";
    const editorAbierto = dom.editor.style.display !== "none" || dom.editorArista.style.display !== "none";
    if (esBorrar && (estado.seleccion || estado.selNodos.size>0) && !editorAbierto) { e.preventDefault(); eliminarSeleccion(); }
  });
  dom.btnBorrar.onclick = eliminarSeleccion;

  function eliminarSeleccion() {
    if (estado.seleccion?.tipo === 'arista') {
      const i = estado.seleccion.idx;
      const a = estado.aristas[i];
      if (i >= 0) {
        estado.aristas.splice(i, 1);
        if (a) DS.emitDeleteEdge(a.id);
      }
      estado.seleccion = null;
    } else if (estado.selNodos.size > 0) {
      const ids = new Set(estado.selNodos);
      for (const a of [...estado.aristas]) if (ids.has(a.origenId) || ids.has(a.destinoId)){ DS.emitDeleteEdge(a.id); }
      for (const n of [...estado.nodos]) if (ids.has(n.id)) DS.emitDeleteNode(n.id);
      estado.nodos = estado.nodos.filter(n => !ids.has(n.id));
      estado.aristas = estado.aristas.filter(a => !(ids.has(a.origenId) || ids.has(a.destinoId)));
      estado.selNodos.clear();
      estado.seleccion = null;
    } else if (estado.seleccion?.tipo === 'nodo') {
      const id = estado.seleccion.id;
      for (const a of [...estado.aristas]) if (a.origenId===id || a.destinoId===id) DS.emitDeleteEdge(a.id);
      DS.emitDeleteNode(id);
      estado.nodos = estado.nodos.filter(n => n.id !== id);
      estado.aristas = estado.aristas.filter(a => a.origenId !== id && a.destinoId !== id);
      estado.seleccion = null;
    }
    pagina.contraerSiCabe(); render.dibujar();
  }

  // === Editor inline (nodo/filas) ========================================
  function abrirEditor(n, tipo, idx = null) {
    dom.editorArista.style.display = "none";
    let x = n.x + 8, y, w = n.ancho - 16, val = "";
    if (n.tipo === "clase") {
      const s = DS.util.layoutClase(n);
      if (tipo === "titulo") { y = n.y + 6; val = n.titulo; }
      if (tipo === "atr")   { y = s.yAtr + idx * estado.FILA + 2; val = n.atributos[idx]; }
      if (tipo === "met")   { y = s.yMet + idx * estado.FILA + 2; val = n.metodos[idx]; }
    } else { y = n.y + 6; val = n.texto; }
    const p = pagina.posEnViewport(x, y);
    dom.editor.style.left = p.left + "px"; dom.editor.style.top = p.top + "px";
    dom.editor.style.width = Math.max(80, Math.round(w * (estado.mundo.zoom||1))) + "px";
    dom.editor.dataset.nodo = n.id;
    dom.editor.dataset.tipo = tipo;
    dom.editor.dataset.idx  = idx != null ? idx : "";
    dom.editor.value = val; dom.editor.style.display = "block"; dom.editor.focus(); dom.editor.select();
  }

  dom.editor.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dom.editor.style.display = "none";
    if (e.key === "Enter") {
      e.preventDefault(); confirmarEdicion(true);
      const n = DS.util.buscarNodoPorId(parseInt(dom.editor.dataset.nodo));
      if (n && n.tipo === "clase" && (dom.editor.dataset.tipo === "atr" || dom.editor.dataset.tipo === "met")) {
        const i = parseInt(dom.editor.dataset.idx);
        const lista = dom.editor.dataset.tipo === "atr" ? n.atributos : n.metodos;
        if (i === lista.length - 1) { lista.push(dom.editor.dataset.tipo === "atr" ? "- nuevo" : "+ nuevo()"); DS.util.layoutClase(n); abrirEditor(n, dom.editor.dataset.tipo, i + 1); render.dibujar(); return; }
      }
      dom.editor.style.display = "none";
    }
  });
  dom.editor.addEventListener("blur", () => confirmarEdicion(false));

  function confirmarEdicion(forzar) {
    if (dom.editor.style.display === "none") return;
    const id = parseInt(dom.editor.dataset.nodo);
    const n = DS.util.buscarNodoPorId(id);
    const tipo = dom.editor.dataset.tipo;
    const v = dom.editor.value.trim();
    if (!n) { dom.editor.style.display = "none"; return; }

    if (n.tipo === "clase") {
      if (tipo === "titulo" && v !== "") { n.titulo = v; DS.emitSetTitle(n.id, v); }
      if (tipo === "atr") {
        const i = parseInt(dom.editor.dataset.idx);
        if (v === "") { if (forzar && confirm("¿Borrar atributo?")) { n.atributos.splice(i, 1); DS.emitDelAttr(n.id, i); } }
        else { n.atributos[i] = v; DS.emitSetAttr(n.id, i, v); }
        DS.util.layoutClase(n);
      }
      if (tipo === "met") {
        const i = parseInt(dom.editor.dataset.idx);
        if (v === "") { if (forzar && confirm("¿Borrar método?")) { n.metodos.splice(i, 1); DS.emitDelMethod(n.id, i); } }
        else { n.metodos[i] = v; DS.emitSetMethod(n.id, i, v); }
        DS.util.layoutClase(n);
      }
    } else if (v !== "") {
      n.texto = v;
    }

    dom.editor.style.display = "none"; render.dibujar();
  }

  // === Editor de arista (UML Asociación) ==================================
  function abrirEditorArista(idx, cx, cy){
    dom.editor.style.display = "none";
    estado.seleccion = { tipo:'arista', idx };
    estado.selNodos.clear();
    const a = estado.aristas[idx]; if(!a) return;

    dom.ea_lbl.value   = a.etiqueta || "";
    dom.ea_o.value     = a.card_o  || "";
    dom.ea_d.value     = a.card_d  || "";
    dom.ea_role_o.value = a.role_o || "";
    dom.ea_role_d.value = a.role_d || "";
    dom.ea_qual_o.value = a.qual_o || "";
    dom.ea_qual_d.value = a.qual_d || "";
    dom.ea_nav.value    = a.nav || 'o2d';
    dom.ea_sz.value     = a.tam || 12;

    dom.editorArista.dataset.cx = String(cx);
    dom.editorArista.dataset.cy = String(cy);

    const p = pagina.posEnViewport(cx + 6, cy - 6);
    const el = dom.editorArista;
    el.style.left = p.left + "px";
    el.style.top  = p.top  + "px";
    el.style.display = "block";
    setTimeout(()=>dom.ea_lbl.focus(), 0);
  }
  dom.ea_cancel.onclick = ()=> dom.editorArista.style.display = "none";
  dom.editorArista.addEventListener('submit', (e)=>{
    e.preventDefault();
    const s = estado.seleccion;
    if(s?.tipo!=='arista') { dom.editorArista.style.display='none'; return; }
    const a = estado.aristas[s.idx]; if(!a) return;

    a.etiqueta = dom.ea_lbl.value.trim() || undefined;
    a.card_o   = dom.ea_o.value.trim()   || undefined;
    a.card_d   = dom.ea_d.value.trim()   || undefined;
    a.role_o   = dom.ea_role_o.value.trim() || undefined;
    a.role_d   = dom.ea_role_d.value.trim() || undefined;
    a.qual_o   = dom.ea_qual_o.value.trim() || undefined;
    a.qual_d   = dom.ea_qual_d.value.trim() || undefined;
    a.nav      = dom.ea_nav.value || 'o2d';
    a.tam      = Math.max(10, Math.min(24, parseInt(dom.ea_sz.value||'12',10)));

    DS.emitUpdateEdge(a.id, {
      etiqueta:a.etiqueta, card_o:a.card_o, card_d:a.card_d,
      role_o:a.role_o, role_d:a.role_d, qual_o:a.qual_o, qual_d:a.qual_d,
      nav:a.nav, tam:a.tam
    });

    dom.editorArista.style.display='none'; render.dibujar();
  });

  // === Panel opciones (igual) ============================================
  dom.optGrid.onchange = ()=>{ estado.opciones.verGrid = dom.optGrid.checked; render.dibujar(); };
  dom.optPag.onchange  = ()=>{ estado.opciones.verPagina = dom.optPag.checked; render.dibujar(); };
  dom.optCon.onchange  = ()=>{ estado.opciones.conectores = dom.optCon.checked; render.dibujar(); };
  dom.selPapel.onchange = ()=>{ estado.opciones.papel = dom.selPapel.value; pagina.aplicarPapel(); };
  dom.radiosOri.forEach(r => r.onchange = ()=>{ if (r.checked){ estado.opciones.orientacion = r.value; pagina.aplicarPapel(); }});

  dom.inpTitulo.oninput = ()=>{
    if (estado.selNodos.size!==1) return;
    const id = [...estado.selNodos][0];
    const n = DS.util.buscarNodoPorId(id);
    if (n && n.tipo === "clase") { n.titulo = dom.inpTitulo.value; DS.emitSetTitle(n.id, n.titulo); render.dibujar(); }
  };
  document.getElementById("btn_add_atr").onclick = ()=>{
    if (estado.selNodos.size!==1) return;
    const id = [...estado.selNodos][0];
    const n = DS.util.buscarNodoPorId(id);
    if (n && n.tipo === "clase") { n.atributos.push("- nuevo"); DS.util.layoutClase(n); DS.emitSetAttr(n.id, n.atributos.length-1, "- nuevo"); render.dibujar(); }
  };
  document.getElementById("btn_add_met").onclick = ()=>{
    if (estado.selNodos.size!==1) return;
    const id = [...estado.selNodos][0];
    const n = DS.util.buscarNodoPorId(id);
    if (n && n.tipo === "clase") { n.metodos.push("+ nuevo()"); DS.util.layoutClase(n); DS.emitSetMethod(n.id, n.metodos.length-1, "+ nuevo()"); render.dibujar(); }
  };

  // === Zoom + rueda =======================================================
  dom.selZoom.onchange = ()=>{
    const t = (dom.selZoom.value || dom.selZoom.options[dom.selZoom.selectedIndex].text || '100%').trim();
    const pct = parseInt(t, 10) || 100; pagina.hacerZoom(pct / 100);
    reubicarOverlays();
  };
  dom.zona.addEventListener('wheel', (e)=>{
    if (!e.ctrlKey) return;
    e.preventDefault();
    const z = Math.max(.25, Math.min(3, DS.estado.mundo.zoom * (e.deltaY>0? 0.9 : 1.1)));
    pagina.hacerZoom(z, e.clientX, e.clientY);
    reubicarOverlays();
  }, { passive:false });

  dom.zona.addEventListener('scroll', ()=> render.dibujar());
  window.addEventListener('scroll', ()=> render.dibujar(), true);
  window.addEventListener('resize', ()=> render.dibujar());

  // === Guardar / Cargar ===================================================
  dom.btnGuardar.onclick = async ()=>{
    const paquete = { version: "1.1.3-assoc-nav-role-qual", nodos: estado.nodos, aristas: estado.aristas, meta: { guardado: new Date().toISOString() } };
    const body = new URLSearchParams({ accion: "guardar", token: estado.token_csrf, json: JSON.stringify(paquete) });
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const d = await r.json().catch(() => ({ ok: false }));
    if (d.ok) { alert("Guardado como ID: " + d.id); dom.inpId.value = d.id; } else { alert("No se pudo guardar"); }
  };

  dom.btnCargar.onclick = async ()=>{
    const id = dom.inpId.value.trim(); if (!id) return alert("Ingrese un ID");
    const r = await fetch(API + "?accion=cargar&id=" + encodeURIComponent(id));
    if (!r.ok) return alert("No existe");
    const d = await r.json();
    // Mapeo defensivo de aristas antiguas
    estado.nodos = d.nodos || [];
    estado.aristas = (d.aristas||[]).map(a=>({
      puntos:[], tam:12, nav:(a.nav||'o2d'), ...a
    }));
    estado.id_sec = 1 + (estado.nodos.reduce((m, n) => Math.max(m, n.id), 0) || 0);
    estado.seleccion = null; estado.selNodos.clear();
    pagina.aplicarPapel(); render.dibujar();
  };

  // === Drag & Drop desde paleta ==========================================
  dom.zona.addEventListener("dragover", ev=> ev.preventDefault());
  dom.zona.addEventListener("drop", (ev)=>{
    ev.preventDefault();
    const tipo = ev.dataTransfer.getData("text/plain"); if(!tipo) return;
    const { x, y } = pagina.aCanvas(ev);
    let nuevo=null;
    if (tipo === "clase") { nuevo = DS.util.porDefectoClase(x - 120, y - 60); DS.util.layoutClase(nuevo); }
    if (tipo === "texto") { nuevo = DS.util.porDefectoTexto(x - 80, y - 20); }
    if (nuevo){
      estado.nodos.push(nuevo);
      DS.emitAddNode(nuevo);
      estado.selNodos.clear(); estado.selNodos.add(nuevo.id); estado.seleccion={tipo:'nodo',id:nuevo.id};
      pagina.expandirSiNecesario(nuevo);
      pagina.enfocarNodo(nuevo);
      render.dibujar();
    }
  });
  document.querySelectorAll(".pieza").forEach(el=>{
    el.addEventListener("dragstart", ev=> ev.dataTransfer.setData("text/plain", el.dataset.tipo));
  });

  // === API pública: init ==================================================
  DS.app = {
    init: async function () {
      try {
        const r = await fetch(API + "?accion=token");
        const d = await r.json(); estado.token_csrf = d.token || "";
      } catch { console.warn("No se pudo obtener token CSRF"); }
      pagina.aplicarPapel();
      render.dibujar();
    },
  };
})();