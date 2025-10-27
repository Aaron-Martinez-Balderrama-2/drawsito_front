// Eventos del usuario, editor en vivo, panel derecho y guardar/cargar
(function () {
  const DS = window.DS;
  const { dom, estado, util, pagina, render } = DS;
  const API = window.DRAWSITO_CONFIG.api;

  // ---- Mouse move --------------------------------------------------------
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

    if (estado.arrastrando && estado.seleccion?.tipo === 'nodo') {
      const no = util.buscarNodoPorId(estado.seleccion.id);
      if (no) {
        no.x = x - estado.dx;
        no.y = y - estado.dy;
        pagina.expandirSiNecesario(no);
      }
    }

    if (estado.redimensionando && estado.seleccion?.tipo === 'nodo') {
      const no = util.buscarNodoPorId(estado.seleccion.id);
      if (no) {
        // redimensionado simple por esquinas
        if (estado.handle === 'se') { no.ancho = Math.max(no.minW, x - no.x); no.alto = Math.max(no.minH, y - no.y); }
        if (estado.handle === 'sw') { const nx = Math.min(x, no.x + no.ancho - no.minW); no.ancho = Math.max(no.minW, (no.x + no.ancho) - x); no.x = nx; no.alto = Math.max(no.minH, y - no.y); }
        if (estado.handle === 'ne') { const ny = Math.min(y, no.y + no.alto - no.minH); no.alto = Math.max(no.minH, (no.y + no.alto) - y); no.y = ny; no.ancho = Math.max(no.minW, x - no.x); }
        if (estado.handle === 'nw') { const nx = Math.min(x, no.x + no.ancho - no.minW), ny = Math.min(y, no.y + no.alto - no.minH);
          no.ancho = Math.max(no.minW, (no.x + no.ancho) - x); no.x = nx;
          no.alto = Math.max(no.minH, (no.y + no.alto) - y); no.y = ny; }
        util.layoutClase(no);
        pagina.expandirSiNecesario(no);
      }
    }

    render.dibujar();
  });

  // ---- Mouse down --------------------------------------------------------
  dom.lienzo.addEventListener("mousedown", (e) => {
    const { x, y } = pagina.aCanvas(e);
    const n = util.obtenerNodoEn(x, y);

    // Selección de arista si clic cerca de línea (solo si no hay nodo debajo)
    if (!n) {
      let mejor = { d: 999, idx: -1 };
      estado.aristas.forEach((a, i) => {
        const o = util.buscarNodoPorId(a.origenId), d = util.buscarNodoPorId(a.destinoId);
        if (!o || !d) return;
        const pO = util.anclajes(o)[util.ladoPreferido(o, d)];
        const pD = util.anclajes(d)[util.ladoPreferido(d, o)];
        const r = util.distPuntoSegmento(x, y, pO.x, pO.y, pD.x, pD.y);
        if (r.d < mejor.d) mejor = { d: r.d, idx: i };
      });
      if (mejor.idx >= 0 && mejor.d < 8) {
        estado.seleccion = { tipo: 'arista', idx: mejor.idx };
        render.dibujar();
        return;
      }
    }

    // Conectar desde puntos de un nodo
    if (n && n.tipo === "clase") {
      // ¿arranque de redimensionado (esquinas)?
      const esquinas = [['nw', n.x, n.y], ['ne', n.x + n.ancho, n.y], ['sw', n.x, n.y + n.alto], ['se', n.x + n.ancho, n.y + n.alto]];
      for (const [h, cx, cy] of esquinas) {
        if (Math.hypot(x - cx, y - cy) <= 6) {
          estado.seleccion = { tipo: 'nodo', id: n.id };
          estado.redimensionando = true; estado.handle = h;
          render.dibujar();
          return;
        }
      }

      const c = render.conectorCercano(n, x, y);
      if (c) {
        estado.conectando = true;
        estado.nodo_origen = n;
        estado.seleccion = { tipo: 'nodo', id: n.id };
        return;
      }
    }

    if (n) {
      estado.seleccion = { tipo: 'nodo', id: n.id };
      if (n.tipo === "clase") {
        const p = render.dentroPlus(n, x, y);
        if (p) {
          if (p.seccion === "atr") {
            n.atributos.push("- nuevo");
            util.layoutClase(n);
            abrirEditor(n, "atr", n.atributos.length - 1);
            render.dibujar();
            return;
          }
          if (p.seccion === "met") {
            n.metodos.push("+ nuevo()");
            util.layoutClase(n);
            abrirEditor(n, "met", n.metodos.length - 1);
            render.dibujar();
            return;
          }
        }
      }
      estado.arrastrando = true;
      estado.dx = x - n.x;
      estado.dy = y - n.y;
    } else {
      estado.seleccion = null;
    }

    render.dibujar();
  });

  // ---- Mouse up ----------------------------------------------------------
  window.addEventListener("mouseup", (e) => {
    const { x, y } = pagina.aCanvas(e);

    if (estado.conectando && estado.nodo_origen) {
      const n = util.obtenerNodoEn(x, y);
      if (n && n.id !== estado.nodo_origen.id) {
        if (!util.existeArista(estado.nodo_origen.id, n.id)) {
          estado.aristas.push({ origenId: estado.nodo_origen.id, destinoId: n.id });
        }
      } else if (!n) {
        const nn = util.porDefectoClase(x - 120, y - 60);
        util.layoutClase(nn);
        estado.nodos.push(nn);
        if (!util.existeArista(estado.nodo_origen.id, nn.id)) {
          estado.aristas.push({ origenId: estado.nodo_origen.id, destinoId: nn.id });
        }
        estado.seleccion = { tipo: 'nodo', id: nn.id };
        pagina.expandirSiNecesario(nn);
      }
    }

    estado.redimensionando = false; estado.handle = null;
    estado.conectando = false; estado.nodo_origen = null;
    estado.arrastrando = false;

    // recompacta si sobran hojas
    pagina.contraerSiCabe();
    render.dibujar();
  });

  // ---- Doble clic: editor en vivo ---------------------------------------
  dom.lienzo.addEventListener("dblclick", (e) => {
    const { x, y } = pagina.aCanvas(e);
    const n = util.obtenerNodoEn(x, y);
    if (!n) return;

    estado.seleccion = { tipo: 'nodo', id: n.id };

    if (n.tipo === "clase") {
      const z = render.indiceSeccion(n, x, y);
      if (z.tipo === "titulo") abrirEditor(n, "titulo");
      if (z.tipo === "atr") abrirEditor(n, "atr", z.idx);
      if (z.tipo === "met") abrirEditor(n, "met", z.idx);
    } else abrirEditor(n, "texto");
  });

  // ---- Teclas: eliminar --------------------------------------------------
  window.addEventListener("keydown", (e) => {
    const esBorrar = e.key === "Delete" || e.key === "Backspace";
    const editorAbierto = dom.editor.style.display !== "none";
    if (esBorrar && estado.seleccion && !editorAbierto) {
      e.preventDefault();
      eliminarSeleccion();
    }
  });

  dom.btnBorrar.onclick = eliminarSeleccion;

  function eliminarSeleccion() {
    if (!estado.seleccion) return;
    if (estado.seleccion.tipo === 'nodo') {
      const id = estado.seleccion.id;
      estado.nodos = estado.nodos.filter((n) => n.id !== id);
      estado.aristas = estado.aristas.filter((a) => a.origenId !== id && a.destinoId !== id);
    } else if (estado.seleccion.tipo === 'arista') {
      const i = estado.seleccion.idx;
      if (i >= 0) estado.aristas.splice(i, 1);
    }
    estado.seleccion = null;
    pagina.contraerSiCabe();
    render.dibujar();
  }

  // ---- Editor inline -----------------------------------------------------
  function abrirEditor(n, tipo, idx = null) {
    let x = n.x + 8, y, w = n.ancho - 16, val = "";
    if (n.tipo === "clase") {
      const s = util.layoutClase(n);
      if (tipo === "titulo") { y = n.y + 6; val = n.titulo; }
      if (tipo === "atr")   { y = s.yAtr + idx * estado.FILA + 2; val = n.atributos[idx]; }
      if (tipo === "met")   { y = s.yMet + idx * estado.FILA + 2; val = n.metodos[idx]; }
    } else { y = n.y + 6; val = n.texto; }
    const p = pagina.posEnZona(x, y);
    dom.editor.style.left = p.left + "px";
    dom.editor.style.top = p.top + "px";
    dom.editor.style.width = w + "px";
    dom.editor.dataset.nodo = n.id;
    dom.editor.dataset.tipo = tipo;
    dom.editor.dataset.idx = idx != null ? idx : "";
    dom.editor.value = val;
    dom.editor.style.display = "block";
    dom.editor.focus();
    dom.editor.select();
  }

  dom.editor.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dom.editor.style.display = "none";
    if (e.key === "Enter") {
      e.preventDefault();
      confirmarEdicion(true);
      const n = util.buscarNodoPorId(parseInt(dom.editor.dataset.nodo));
      if (
        n && n.tipo === "clase" &&
        (dom.editor.dataset.tipo === "atr" || dom.editor.dataset.tipo === "met")
      ) {
        const i = parseInt(dom.editor.dataset.idx);
        const lista = dom.editor.dataset.tipo === "atr" ? n.atributos : n.metodos;
        if (i === lista.length - 1) {
          lista.push(dom.editor.dataset.tipo === "atr" ? "- nuevo" : "+ nuevo()");
          util.layoutClase(n);
          abrirEditor(n, dom.editor.dataset.tipo, i + 1);
          render.dibujar();
          return;
        }
      }
      dom.editor.style.display = "none";
    }
  });

  dom.editor.addEventListener("blur", () => confirmarEdicion(false));

  function confirmarEdicion(forzar) {
    if (dom.editor.style.display === "none") return;
    const id = parseInt(dom.editor.dataset.nodo);
    const n = util.buscarNodoPorId(id);
    const tipo = dom.editor.dataset.tipo;
    const v = dom.editor.value.trim();
    if (!n) { dom.editor.style.display = "none"; return; }

    if (n.tipo === "clase") {
      if (tipo === "titulo" && v !== "") n.titulo = v;
      if (tipo === "atr") {
        const i = parseInt(dom.editor.dataset.idx);
        if (v === "") { if (forzar && confirm("¿Borrar atributo?")) n.atributos.splice(i, 1); }
        else n.atributos[i] = v;
        util.layoutClase(n);
      }
      if (tipo === "met") {
        const i = parseInt(dom.editor.dataset.idx);
        if (v === "") { if (forzar && confirm("¿Borrar método?")) n.metodos.splice(i, 1); }
        else n.metodos[i] = v;
        util.layoutClase(n);
      }
    } else {
      if (v !== "") n.texto = v;
    }
    dom.editor.style.display = "none";
    render.dibujar();
  }

  // ---- Panel de opciones -------------------------------------------------
  dom.optGrid.onchange = () => { estado.opciones.verGrid = dom.optGrid.checked; render.dibujar(); };
  dom.optPag.onchange  = () => { estado.opciones.verPagina = dom.optPag.checked; render.dibujar(); };
  dom.optCon.onchange  = () => { estado.opciones.conectores = dom.optCon.checked; render.dibujar(); };
  dom.selPapel.onchange = () => { estado.opciones.papel = dom.selPapel.value; pagina.aplicarPapel(); };
  dom.radiosOri.forEach((r) => (r.onchange = () => { if (r.checked) { estado.opciones.orientacion = r.value; pagina.aplicarPapel(); }}));

  dom.inpTitulo.oninput = () => {
    if (estado.seleccion?.tipo !== 'nodo') return;
    const n = util.buscarNodoPorId(estado.seleccion.id);
    if (n && n.tipo === "clase") { n.titulo = dom.inpTitulo.value; render.dibujar(); }
  };
  document.getElementById("btn_add_atr").onclick = () => {
    if (estado.seleccion?.tipo !== 'nodo') return;
    const n = util.buscarNodoPorId(estado.seleccion.id);
    if (n && n.tipo === "clase") { n.atributos.push("- nuevo"); util.layoutClase(n); render.dibujar(); }
  };
  document.getElementById("btn_add_met").onclick = () => {
    if (estado.seleccion?.tipo !== 'nodo') return;
    const n = util.buscarNodoPorId(estado.seleccion.id);
    if (n && n.tipo === "clase") { n.metodos.push("+ nuevo()"); util.layoutClase(n); render.dibujar(); }
  };

  // ---- Zoom (select) -----------------------------------------------------
  dom.selZoom.onchange = () => {
    const t = (dom.selZoom.value || dom.selZoom.options[dom.selZoom.selectedIndex].text || '100%').trim();
    const pct = parseInt(t, 10) || 100;
    pagina.hacerZoom(pct / 100);
  };

  // ---- Guardar / Cargar --------------------------------------------------
  dom.btnGuardar.onclick = async () => {
    const paquete = {
      version: "1.0.8",
      nodos: estado.nodos,
      aristas: estado.aristas,
      meta: { guardado: new Date().toISOString() },
    };
    const body = new URLSearchParams({ accion: "guardar", token: estado.token_csrf, json: JSON.stringify(paquete) });
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const d = await r.json().catch(() => ({ ok: false }));
    if (d.ok) { alert("Guardado como ID: " + d.id); dom.inpId.value = d.id; } else { alert("No se pudo guardar"); }
  };

  dom.btnCargar.onclick = async () => {
    const id = dom.inpId.value.trim();
    if (!id) return alert("Ingrese un ID");
    const r = await fetch(API + "?accion=cargar&id=" + encodeURIComponent(id));
    if (!r.ok) return alert("No existe");
    const d = await r.json();
    estado.nodos = d.nodos || [];
    estado.aristas = d.aristas || [];
    estado.id_sec = 1 + (estado.nodos.reduce((m, n) => Math.max(m, n.id), 0) || 0);
    estado.seleccion = null;
    pagina.aplicarPapel();
    render.dibujar();
  };

  // ---- Drag & Drop desde paleta -----------------------------------------
  document.querySelectorAll(".pieza").forEach((el) => {
    el.addEventListener("dragstart", (ev) => { ev.dataTransfer.setData("text/plain", el.dataset.tipo); });
  });
  dom.lienzo.addEventListener("dragover", (ev) => ev.preventDefault());
  dom.lienzo.addEventListener("drop", (ev) => {
    ev.preventDefault();
    const tipo = ev.dataTransfer.getData("text/plain");
    const { x, y } = pagina.aCanvas(ev);
    let nuevo = null;
    if (tipo === "clase") { nuevo = util.porDefectoClase(x - 120, y - 60); util.layoutClase(nuevo); }
    if (tipo === "texto") { nuevo = util.porDefectoTexto(x - 80, y - 20); }
    if (nuevo) {
      estado.nodos.push(nuevo);
      estado.seleccion = { tipo: 'nodo', id: nuevo.id };
      pagina.expandirSiNecesario(nuevo);
      render.dibujar();
    }
  });

  // ---- API pública: init -------------------------------------------------
  DS.app = {
    init: async function () {
      try {
        const r = await fetch(API + "?accion=token");
        const d = await r.json();
        estado.token_csrf = d.token || "";
      } catch (_err) {
        console.warn("No se pudo obtener token CSRF");
      }
      pagina.aplicarPapel(); // hoja inicial
      render.dibujar();
    },
  };
})();
