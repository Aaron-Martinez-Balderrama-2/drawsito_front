// Dibujo: páginas, grid, nodos, aristas, overlays
(function () {
  const DS = window.DS;
  const { dom, estado, util, pagina } = DS;
  const render = (DS.render = {});

  const colorBorde = '#3b3b3b', grisEnc = '#e6e6e6', puntos = '#1d4ed8';

  render.dibujar = () => {
    const ctx = dom.ctx; const m = estado.mundo; ctx.save();
    ctx.clearRect(0, 0, dom.lienzo.width / (window.devicePixelRatio || 1), dom.lienzo.height / (window.devicePixelRatio || 1));

    // Páginas
    if (estado.opciones.verPagina) {
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
      for (let x = 0; x < m.w; x += m.bloqueW) {
        for (let y = 0; y < m.h; y += m.bloqueH) {
          ctx.strokeRect(x + .5, y + .5, m.bloqueW - 1, m.bloqueH - 1);
        }
      }
    }

    // Grid
    if (estado.opciones.verGrid) {
      const g = m.grid; ctx.beginPath(); ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
      for (let x = 0; x < m.w; x += g) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, m.h); }
      for (let y = 0; y < m.h; y += g) { ctx.moveTo(0, y + .5); ctx.lineTo(m.w, y + .5); }
      ctx.stroke();
    }

    // Aristas
    for (const a of estado.aristas) dibLineaArista(ctx, a);

    // Nodos
    for (const n of estado.nodos) {
      if (n.tipo === 'clase') dibClase(ctx, n);
      else dibTexto(ctx, n);
    }

    // Textos/handles de aristas (multiplicidad / roles / calificadores / etiqueta)
    for (const a of estado.aristas) dibTextosYHandlesArista(ctx, a);

    // Vista de conexión en vivo
    if (estado.conectando && estado.nodo_origen) {
      const nO = estado.nodo_origen;
      const anc = util.anclajes(nO)[estado.ancla_origen] || util.anclajes(nO)[util.ladoPreferido(nO, { x: estado.p_mouse.x, y: estado.p_mouse.y, ancho: 0, alto: 0 })];
      let p2 = { x: estado.p_mouse.x, y: estado.p_mouse.y };
      if (estado.hover_nodoId) {
        const nH = util.buscarNodoPorId(estado.hover_nodoId);
        const lado = util.anclaMasCercana(nH, estado.p_mouse.x, estado.p_mouse.y);
        p2 = util.anclajes(nH)[lado];
        ctx.fillStyle = '#60a5fa'; ctx.beginPath(); ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(anc.x, anc.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.setLineDash([]);
    }

    // Marco de selección
    if (estado.marcando && estado.marcoRect) {
      const r = estado.marcoRect;
      const rr = util.recta(r.x1, r.y1, r.x2, r.y2);
      ctx.globalAlpha = .08; ctx.fillStyle = '#3b82f6';
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
      ctx.globalAlpha = 1; ctx.setLineDash([6, 4]); ctx.strokeStyle = '#3b82f6';
      ctx.strokeRect(rr.x + .5, rr.y + .5, rr.w - 1, rr.h - 1); ctx.setLineDash([]);
    }

    // Botón borrar anclado
    actualizarBotonEliminar();

    ctx.restore();
    actualizarPanelDerecho();
  };

  // ======= NODOS ==========================================================
  function dibClase(ctx, n) {
    util.layoutClase(n);
    ctx.lineWidth = 1; ctx.strokeStyle = colorBorde; ctx.fillStyle = '#fff';
    ctx.fillRect(n.x, n.y, n.ancho, n.alto); ctx.strokeRect(n.x + .5, n.y + .5, n.ancho - 1, n.alto - 1);
    ctx.fillStyle = grisEnc; ctx.fillRect(n.x, n.y, n.ancho, estado.H_TIT);
    ctx.beginPath(); ctx.moveTo(n.x, n.y + estado.H_TIT + .5); ctx.lineTo(n.x + n.ancho, n.y + estado.H_TIT + .5); ctx.strokeStyle = colorBorde; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.font = 'bold 13px system-ui'; ctx.fillText(n.titulo, n.x + 8, n.y + 18);

    const s = util.layoutClase(n), F = estado.FILA, M = estado.MARG;
    ctx.font = '13px system-ui'; ctx.fillStyle = '#111';
    let y = s.yAtr + 12;
    for (const atr of n.atributos) { ctx.fillText(atr, n.x + 8, y); y += F; }
    ctx.beginPath(); ctx.moveTo(n.x, s.yMet - M + .5); ctx.lineTo(n.x + n.ancho, s.yMet - M + .5); ctx.stroke();
    y = s.yMet + 12;
    for (const me of n.metodos) { ctx.fillText(me, n.x + 8, y); y += F; }

    const mostrarCon = estado.opciones.conectores &&
      (estado.conectando || estado.hover_nodoId === n.id || estado.selNodos.has(n.id) || (estado.seleccion?.tipo === 'nodo' && estado.seleccion.id === n.id));
    if (mostrarCon) {
      const c = util.anclajes(n);
      ctx.fillStyle = '#60a5fa'; for (const k of Object.keys(c)) { const p = c[k]; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
    }

    dibPlus(ctx, n, s);

    ctx.fillStyle = '#1e293b';
    for (const h of [['nw', n.x, n.y], ['ne', n.x + n.ancho, n.y], ['sw', n.x, n.y + n.alto], ['se', n.x + n.ancho, n.y + n.alto]]) {
      ctx.beginPath(); ctx.arc(h[1], h[2], 4, 0, Math.PI * 2); ctx.fill();
    }

    if (estado.selNodos.has(n.id) || (estado.seleccion?.tipo === 'nodo' && estado.seleccion.id === n.id)) {
      ctx.setLineDash([5, 3]); ctx.strokeStyle = puntos; ctx.strokeRect(n.x + .5, n.y + .5, n.ancho - 1, n.alto - 1); ctx.setLineDash([]);
    }
  }

  function dibTexto(ctx, n) {
    ctx.fillStyle = '#111'; ctx.font = '13px system-ui';
    ctx.fillText(n.texto, n.x + 4, n.y + 14);
    ctx.strokeStyle = '#999'; ctx.strokeRect(n.x + .5, n.y + .5, n.ancho - 1, n.alto - 1);
    if (estado.selNodos.has(n.id) || (estado.seleccion?.tipo === 'nodo' && estado.seleccion.id === n.id)) {
      ctx.setLineDash([5, 3]); ctx.strokeStyle = puntos; ctx.strokeRect(n.x + .5, n.y + .5, n.ancho - 1, n.alto - 1); ctx.setLineDash([]);
    }
  }

  function dibPlus(ctx, n, s) {
    ctx.fillStyle = '#2563eb';
    ctx.beginPath(); ctx.arc(n.x + n.ancho - 12, s.yAtr + 4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(n.x + n.ancho - 12, s.yMet + 4, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui';
    ctx.fillText('+', n.x + n.ancho - 15, s.yAtr + 8);
    ctx.fillText('+', n.x + n.ancho - 15, s.yMet + 8);
  }

  // ======= ARISTAS ========================================================
  function puntosArista(a) {
    const o = util.buscarNodoPorId(a.origenId), d = util.buscarNodoPorId(a.destinoId);
    if (!o || !d) return null;
    const ladoO = a.anc_o || util.ladoPreferido(o, d);
    const ladoD = a.anc_d || util.ladoPreferido(d, o);
    const pO = util.anclajes(o)[ladoO], pD = util.anclajes(d)[ladoD];
    const pts = [pO, ...(a.puntos || []), pD]; // ← spread correcto
    return { pts, pO, pD, ladoO, ladoD };
  }

  // --- helpers de geometría de cabezas (triángulo / rombo / flecha abierta)
  function baseVec(p1, p2, len) {
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return { ang, cos: Math.cos(ang), sin: Math.sin(ang), len };
  }

  function drawTriangleHead(ctx, p1, p2, hollow = true, L = 14, W = 10) {
    const b = baseVec(p1, p2, L);
    const tip = p2;
    const baseX = p2.x - b.cos * L, baseY = p2.y - b.sin * L;
    const nx = -b.sin, ny = b.cos;
    const Lx = baseX + nx * (W / 2), Ly = baseY + ny * (W / 2);
    const Rx = baseX - nx * (W / 2), Ry = baseY - ny * (W / 2);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y); ctx.lineTo(Lx, Ly); ctx.lineTo(baseX, baseY); ctx.lineTo(Rx, Ry); ctx.closePath();
    if (hollow) { ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.stroke(); }
    else { ctx.fillStyle = '#111'; ctx.fill(); }
  }

  function drawDiamondHead(ctx, p1, p2, hollow = true, L = 18, W = 12) {
    const b = baseVec(p1, p2, L);
    const tip = p2;
    const midX = p2.x - b.cos * (L / 2), midY = p2.y - b.sin * (L / 2);
    const baseX = p2.x - b.cos * L, baseY = p2.y - b.sin * L;
    const nx = -b.sin, ny = b.cos;
    const Lx = midX + nx * (W / 2), Ly = midY + ny * (W / 2);
    const Rx = midX - nx * (W / 2), Ry = midY - ny * (W / 2);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y); ctx.lineTo(Lx, Ly); ctx.lineTo(baseX, baseY); ctx.lineTo(Rx, Ry); ctx.closePath();
    if (hollow) { ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.stroke(); }
    else { ctx.fillStyle = '#111'; ctx.fill(); }
  }

  function drawVeeHead(ctx, p1, p2, L = 14, W = 10) {
    const b = baseVec(p1, p2, L);
    const baseX = p2.x - b.cos * L, baseY = p2.y - b.sin * L;
    const nx = -b.sin, ny = b.cos;
    const Lx = baseX + nx * (W / 2), Ly = baseY + ny * (W / 2);
    const Rx = baseX - nx * (W / 2), Ry = baseY - ny * (W / 2);
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y); ctx.lineTo(Lx, Ly);
    ctx.moveTo(p2.x, p2.y); ctx.lineTo(Rx, Ry);
    ctx.strokeStyle = '#111'; ctx.stroke();
  }

  function dibLineaArista(ctx, a) {
    const g = puntosArista(a); if (!g) return;
    const { pts } = g;

    // Preset UML (compat hacia atrás)
    const preset = a.uml || 'assoc';
    const usarDash = (preset === 'real' || preset === 'dep'); // realización / dependencia

    ctx.save();

    // 1) estilo de línea
    if (usarDash) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.4;

    // 2) trazo base
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // 3) cabezas por tipo (destino por defecto)
    const pTail = pts[pts.length - 2], pHead = pts[pts.length - 1];
    const pTailO = pts[1], pHeadO = pts[0]; // origen (por si se requiere)

    if (preset === 'assoc') {
      // Mantener navegabilidad existente
      const nav = a.nav || 'o2d';
      if (nav === 'o2d' || nav === 'both') { drawArrow(ctx, pTail, pHead); }
      if (nav === 'd2o' || nav === 'both') { drawArrow(ctx, pTailO, pHeadO); }
    } else if (preset === 'gen') {
      // Generalización: triángulo hueco hacia superclase (destino)
      drawTriangleHead(ctx, pTail, pHead, /* hollow= */ true);
    } else if (preset === 'real') {
      // Realización: triángulo hueco + línea discontinua
      drawTriangleHead(ctx, pTail, pHead, /* hollow= */ true);
    } else if (preset === 'dep') {
      // Dependencia: flecha abierta (V)
      drawVeeHead(ctx, pTail, pHead);
    } else if (preset === 'agg') {
      // Agregación: diamante hueco en el “todo” (destino)
      drawDiamondHead(ctx, pTail, pHead, /* hollow= */ true);
    } else if (preset === 'comp') {
      // Composición: diamante lleno en el “todo” (destino)
      drawDiamondHead(ctx, pTail, pHead, /* hollow= */ false);
    }

    ctx.restore();
  }

  function drawArrow(ctx, p1, p2) {
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x), len = 10;
    ctx.beginPath();
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - len * Math.cos(ang - Math.PI / 8), p2.y - len * Math.sin(ang - Math.PI / 8));
    ctx.lineTo(p2.x - len * Math.cos(ang + Math.PI / 8), p2.y - len * Math.sin(ang + Math.PI / 8));
    ctx.closePath(); ctx.fillStyle = '#111'; ctx.fill();
  }

// drawsito_front/core/render.js

  // --- Modificacion 15/12/25 v0.0.5: Lógica vectorial para evitar superposición de textos ---
  
  // Calcula posición basada en el vector de la línea (p1 -> p2)
  // distAlong: distancia desde p1 a lo largo de la línea
  // distPerp:  distancia perpendicular a la línea (negativo=izq, positivo=der)
  function getVectorPos(p1, p2, distAlong, distPerp) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      
      // Vector unitario (u) y perpendicular (n)
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy; 
      const ny = ux;

      return {
          x: p1.x + (ux * distAlong) + (nx * distPerp),
          y: p1.y + (uy * distAlong) + (ny * distPerp)
      };
  }

  function dibTextosYHandlesArista(ctx, a) {
    const g = puntosArista(a); if (!g) return;
    const { pts } = g;
    const tam = Math.max(10, Math.min(24, a.tam || 12));
    ctx.font = tam + 'px system-ui'; ctx.fillStyle = '#0f172a';

    // Definimos los puntos clave para los vectores
    // Origen: Vector desde pts[0] hacia pts[1]
    const pStart = pts[0];
    const pNext  = pts[1]; 
    
    // Destino: Vector desde el último punto hacia el penúltimo (hacia adentro de la línea)
    const pEnd   = pts[pts.length - 1];
    const pPrev  = pts[pts.length - 2];

    // --- CONFIGURACIÓN DE CARRILES (Espaciado) ---
    // distAlong: qué tan lejos del nodo está
    // distPerp: qué tan separado de la línea está (+derecha, -izquierda)
    const GAP_TEXT = 14 + (tam/3); // Distancia lateral base
    
    // 1. MULTIPLICIDAD (Carril Izquierdo/Superior, Cerca)
    const posMultO = getVectorPos(pStart, pNext, 16, -GAP_TEXT);
    const posMultD = getVectorPos(pEnd,   pPrev, 16,  GAP_TEXT); // Invertimos signo porque el vector destino "entra"

    if (a.card_o) drawLabel(ctx, a.card_o, posMultO.x, posMultO.y, tam);
    if (a.card_d) drawLabel(ctx, a.card_d, posMultD.x, posMultD.y, tam);

    // 2. ROL (Carril Derecho/Inferior, Cerca) -> ¡Lado opuesto a Multiplicidad!
    const posRolO = getVectorPos(pStart, pNext, 16, GAP_TEXT);
    const posRolD = getVectorPos(pEnd,   pPrev, 16, -GAP_TEXT);

    if (a.role_o) drawSoftText(ctx, a.role_o, posRolO.x, posRolO.y, tam);
    if (a.role_d) drawSoftText(ctx, a.role_d, posRolD.x, posRolD.y, tam);

    // 3. CALIFICADOR (Carril Izquierdo, Lejos) -> Se apila después de Multiplicidad
    // Le damos más 'distAlong' (45px) para que no tape el 1 o *
    const posQualO = getVectorPos(pStart, pNext, 45, -GAP_TEXT);
    const posQualD = getVectorPos(pEnd,   pPrev, 45, GAP_TEXT);

    if (a.qual_o) drawQualifier(ctx, a.qual_o, posQualO.x, posQualO.y, tam);
    if (a.qual_d) drawQualifier(ctx, a.qual_d, posQualD.x, posQualD.y, tam);


    // 4. ETIQUETA CENTRAL (Nombre de la relación)
    if (a.etiqueta) {
      let maxL = -1, mid = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const L = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (L > maxL) { maxL = L;
          mid = { p1, p2 }; // Guardamos el segmento más largo
        }
      }
      if (mid) {
        // La etiqueta va en el centro exacto del segmento más largo
        const center = { x: (mid.p1.x + mid.p2.x)/2, y: (mid.p1.y + mid.p2.y)/2 };
        // Le damos un pequeño offset perpendicular para que no tache la línea
        const posLbl = getVectorPos(mid.p1, mid.p2, Math.hypot(mid.p2.x-mid.p1.x, mid.p2.y-mid.p1.y)/2, -10);
        drawLabel(ctx, a.etiqueta, posLbl.x, posLbl.y, tam);
      }
    }

    // Handles de selección (círculos azules)
    if (estado.seleccion?.tipo === 'arista' && DS.estado.aristas[estado.seleccion.idx] === a) {
      ctx.fillStyle = '#2563eb';
      (a.puntos || []).forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); });
      // Inicio y fin
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(pts[pts.length-1].x, pts[pts.length-1].y, 6, 0, Math.PI * 2); ctx.fill();

      // Línea punteada de ayuda visual
      ctx.setLineDash([6, 3]); ctx.strokeStyle = '#2563eb';
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ------- Etiquetas y offsets -------------------------------------------
  function drawLabel(ctx, text, x, y, tam) {
    ctx.font = tam + 'px system-ui';
    const m = ctx.measureText(text);
    const w = m.width + 8, h = tam + 4;
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - h + 3, w, h);
    ctx.strokeStyle = '#e5e7eb'; ctx.strokeRect(x - 4, y - h + 3, w, h);
    ctx.fillStyle = '#0f172a'; ctx.fillText(text, x, y);
  }
  function drawSoftText(ctx, text, x, y, tam) {
    ctx.font = Math.max(10, tam - 2) + 'px system-ui';
    ctx.fillStyle = '#111'; ctx.fillText(text, x, y);
  }
  function drawQualifier(ctx, text, x, y, tam) {
    const t = (text.startsWith('[') && text.endsWith(']')) ? text : '[' + text + ']';
    ctx.font = Math.max(10, tam - 2) + 'px system-ui';
    const m = ctx.measureText(t);
    const w = m.width + 8, h = (tam - 2) + 6;
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - h + 3, w, h);
    ctx.strokeStyle = '#0b57d0'; ctx.strokeRect(x - 4, y - h + 3, w, h);
    ctx.fillStyle = '#0f172a'; ctx.fillText(t, x, y);
  }

  function offsetCard(p, lado, tam) {
    const off = 10 + tam / 3;
    if (lado === 'arriba') return { x: p.x, y: p.y - off };
    if (lado === 'abajo') return { x: p.x, y: p.y + off };
    if (lado === 'izq') return { x: p.x - off, y: p.y };
    return { x: p.x + off, y: p.y };
  }
  function offsetRole(p, lado, tam) {
    const off = 18 + tam / 2;
    if (lado === 'arriba') return { x: p.x + 6, y: p.y - off };
    if (lado === 'abajo') return { x: p.x + 6, y: p.y + off };
    if (lado === 'izq') return { x: p.x - off, y: p.y - 6 };
    return { x: p.x + off, y: p.y - 6 };
  }
  function offsetQual(p, lado, tam) {
    const off = 8 + tam / 4;
    if (lado === 'arriba') return { x: p.x - 8, y: p.y - off - 6 };
    if (lado === 'abajo') return { x: p.x - 8, y: p.y + off + 12 };
    if (lado === 'izq') return { x: p.x - off - 24, y: p.y + 12 };
    return { x: p.x + off, y: p.y + 12 };
  }

  function normalDe(p1, p2, dist) {
    const vx = p2.x - p1.x, vy = p2.y - p1.y, L = Math.hypot(vx, vy) || 1;
    const nx = -vy / L, ny = vx / L;
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
    return { x: cx + nx * dist, y: cy + ny * dist };
  }

  // ======= PANEL/UI anclada ==============================================
  function actualizarPanelDerecho() {
    if (estado.selNodos.size === 1) {
      const n = util.buscarNodoPorId([...estado.selNodos][0]);
      if (n?.tipo === 'clase') { dom.panelClase.style.display = 'block'; dom.inpTitulo.value = n.titulo; return; }
    }
    dom.panelClase.style.display = 'none';
  }

  function actualizarBotonEliminar() {
    const b = dom.btnBorrar;
    if (estado.seleccion?.tipo === 'arista') {
      const a = estado.aristas[estado.seleccion.idx]; if (!a) { b.style.display = 'none'; return; }
      const g = puntosArista(a); if (!g) { b.style.display = 'none'; return; }
      const { pts } = g; let maxL = -1, mid = { x: 0, y: 0 };
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const L = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (L > maxL) { maxL = L; mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }; }
      }
      const rect = dom.lienzo.getBoundingClientRect(), z = estado.mundo.zoom || 1;
      b.style.left = (rect.left + mid.x * z) + 'px';
      b.style.top = (rect.top + (mid.y - 26) * z) + 'px';
      b.style.display = 'block'; return;
    }

    if (estado.selNodos.size > 0) {
      const bb = util.bboxDeIds(estado.selNodos);
      if (!bb) { b.style.display = 'none'; return; }
      const rect = dom.lienzo.getBoundingClientRect(), z = estado.mundo.zoom || 1;
      const px = bb.x + bb.w - 12, py = bb.y - 24;
      b.style.left = (rect.left + px * z) + 'px';
      b.style.top = (rect.top + py * z) + 'px';
      b.style.display = 'block'; return;
    }

    if (estado.seleccion?.tipo === 'nodo') {
      const n = util.buscarNodoPorId(estado.seleccion.id); if (!n) { b.style.display = 'none'; return; }
      const rect = dom.lienzo.getBoundingClientRect(), z = estado.mundo.zoom || 1;
      b.style.left = (rect.left + (n.x + n.ancho - 12) * z) + 'px';
      b.style.top = (rect.top + (n.y - 22) * z) + 'px';
      b.style.display = 'block'; return;
    }

    b.style.display = 'none';
  }

  // Helpers públicos
  render.conectorCercano = (n, x, y) => {
    const c = util.anclajes(n);
    for (const [nombre, p] of Object.entries(c)) {
      if (Math.hypot(x - p.x, y - p.y) < 9) return { nombre, x: p.x, y: p.y };
    }
    return null;
  };
  render.dentroPlus = (n, x, y) => {
    const s = util.layoutClase(n);
    const en = (cx, cy) => Math.hypot(x - cx, y - cy) <= 7 ? true : false;
    if (en(n.x + n.ancho - 12, s.yAtr + 4)) return { seccion: 'atr' };
    if (en(n.x + n.ancho - 12, s.yMet + 4)) return { seccion: 'met' };
    return null;
  };
  render.indiceSeccion = (n, x, y) => {
    const s = util.layoutClase(n), F = estado.FILA, H = estado.H_TIT, M = estado.MARG;
    if (y <= n.y + H) return { tipo: 'titulo' };
    if (y >= s.yAtr && y < s.yMet - M) { const idx = Math.floor((y - s.yAtr) / F); return { tipo: 'atr', idx }; }
    if (y >= s.yMet && y <= n.y + n.alto) { const idx = Math.floor((y - s.yMet) / F); return { tipo: 'met', idx }; }
    return { tipo: 'none' };
  };
})();