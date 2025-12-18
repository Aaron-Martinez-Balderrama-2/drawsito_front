(function(){
  const DS = (window.DS = window.DS || {});

  // MODIFICACIÓN: Uso estricto de la configuración global
  // Si no hay config, fallback a la URL de producción de Railway directamente
  const BACKEND_FALLBACK = 'https://drawsitoback-production.up.railway.app';
  
  const RT = (window.DRAWSITO_CONFIG && window.DRAWSITO_CONFIG.rt) 
             || (BACKEND_FALLBACK + '/tiempo_real.php');

  // Si ws es null en la config, será null aquí. 
  // Eliminamos el fallback a 'ws://localhost:8088' para evitar errores en producción.
  const WS = (window.DRAWSITO_CONFIG && window.DRAWSITO_CONFIG.ws) || null;

  function espera(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function throttle(fn, ms){
    let t=0, lastArgs=null, prog=false;
    return function(...args){
      const now = Date.now();
      lastArgs = args;
      if (now - t >= ms){
        t = now; fn.apply(this, args);
      } else if (!prog){
        prog = true; const delay = ms - (now - t);
        setTimeout(()=>{ prog=false; t=Date.now(); fn.apply(this, lastArgs); }, delay);
      }
    };
  }

  // Throttles un poco más bajos (mejor “sensación”)
  const T_MOVE   = 30;
  const T_RESIZE = 60;
  const T_TEXT   = 80;
  const T_EDGE   = 50;

  const Collab = DS.collab = {
    activa: false,
    room: null, client: null, version: 0,
    _ws: null, _wsOk: false, _polling: false,

    async unirse(room){
      this.room = room;
      const fd = new FormData(); fd.append('accion','join'); fd.append('room', room);
      
      try {
        const r = await fetch(RT, {method:'POST', body:fd});
        const d = await r.json();
        if (!d.ok) throw new Error('join failed');
        this.client  = d.client_id;
        this.version = d.version||0;

        // Cargar documento inicial
        const E = DS.estado;
        E.nodos   = d.doc.nodos || [];
        E.aristas = d.doc.aristas || [];
        const maxId = E.nodos.reduce((m,n)=>Math.max(m, n.id||0), 0);
        const offset = 1000 + Math.floor(Math.random()*8000);
        E.id_sec = maxId + offset;

        DS.pagina.aplicarPapel();
        DS.pagina.recalcularTamMundo(false);
        DS.render.dibujar();

        this.activa = true;

        // Preferimos WebSocket; si falla o es null, long-poll de respaldo
        const ok = await this._conectarWS();
        if (!ok) this._buclePoll(); // fallback
      } catch (e) {
        console.error("Error al unirse a la sala:", e);
        alert("No se pudo conectar con el servidor de colaboración.");
      }
    },

    async _conectarWS(){
      // MODIFICACIÓN: Si WS es null (modo PHP puro), salimos inmediatamente
      if (!WS) return false;

      try{
        if (this._ws) { try{ this._ws.close(); }catch(_){ } }
        const ws = new WebSocket(WS);
        this._ws = ws;
        this._wsOk = false;

        const hello = () => {
          const msg = {type:'hello', room:this.room, client_id:this.client};
          ws.send(JSON.stringify(msg));
        };

        ws.onopen = ()=> { hello(); };
        ws.onmessage = (ev)=>{
          let msg=null; try{ msg = JSON.parse(ev.data); }catch(_){ return; }
          if (msg.type === 'hello_ok') { this._wsOk = true; return; }
          if (msg.type === 'op' && msg.room === this.room) {
            const op = msg.op || {};
            // ignorar eco propio
            if (op.client_id && op.client_id === this.client) return;
            this.version = Math.max(this.version, msg.ver || this.version);
            this.aplicarRemoto(op);
            DS.pagina.recalcularTamMundo(false);
            DS.render.dibujar();
          }
        };
        ws.onclose = ()=> { this._wsOk = false; if (this.activa && !this._polling) this._buclePoll(); };
        ws.onerror = ()=> { this._wsOk = false; };

        // Espera corta para saber si se estableció
        const t0 = Date.now();
        while(Date.now()-t0 < 1200){
          if (this._wsOk) return true;
          await espera(80);
        }
        return this._wsOk;
      }catch(_){
        this._wsOk = false;
        return false;
      }
    },

    async _buclePoll(){
      if (this._polling) return;
      this._polling = true;
      while(this.activa && !this._wsOk){
        try{
          const url = `${RT}?accion=poll&room=${encodeURIComponent(this.room)}&since=${this.version}`;
          const r = await fetch(url);
          const d = await r.json();
          if (d.ok && (d.version||0) >= this.version){
            this.version = d.version||this.version;
            let aplico = false;
            for (const row of d.ops||[]){
              const op = row.op||{};
              if (op.client_id === this.client) continue;
              this.aplicarRemoto(op); aplico = true;
            }
            if (aplico) { DS.pagina.recalcularTamMundo(false); }
            DS.render.dibujar();
          }
        }catch(e){ await espera(500); }
        
        // en paralelo, intentar reconectar WS solo si existe URL configurada
        if (!this._wsOk && WS) { await this._conectarWS(); }
      }
      this._polling = false;
    },

    async _emitir(op){
      if (!this.activa) return;
      op.client_id = this.client; op.ts = Date.now();
      const fd = new FormData();
      fd.append('accion','op'); fd.append('room', this.room);
      fd.append('client_id', this.client); fd.append('op', JSON.stringify(op));
      try{ await fetch(RT, {method:'POST', body:fd}); }catch(_){}
    },

    aplicarRemoto(op){
      const E = DS.estado, U = DS.util, T = op.type;
      if (T === 'load_full') {
          E.nodos = op.nodos || [];
          E.aristas = op.aristas || [];
          E.seleccion = null;
          E.selNodos.clear();
          // Recalcular ID secuencial para evitar colisiones futuras
          const maxId = E.nodos.reduce((m,n)=>Math.max(m, n.id||0), 0);
          E.id_sec = maxId + 1000 + Math.floor(Math.random()*1000);
          DS.render.dibujar();
          return;
      }
      if (T==='add_node'){ E.nodos.push(op.node); return; }
      if (T==='move_node' || T==='resize_node' || T==='set_title'){
        const n = U.buscarNodoPorId(op.id); if(!n) return;
        if (T==='move_node'){ n.x=op.x; n.y=op.y; }
        if (T==='resize_node'){ n.ancho=op.ancho; n.alto=op.alto; }
        if (T==='set_title'){ n.titulo=op.titulo; }
        return;
      }
      if (T==='set_attr' || T==='del_attr'){
        const n = U.buscarNodoPorId(op.id); if(!n) return;
        n.atributos = n.atributos || [];
        if (T==='set_attr'){ n.atributos[op.idx]=op.text; }
        else n.atributos.splice(op.idx,1);
        return;
      }
      if (T==='set_method' || T==='del_method'){
        const n = U.buscarNodoPorId(op.id); if(!n) return;
        n.metodos = n.metodos || [];
        if (T==='set_method'){ n.metodos[op.idx]=op.text; }
        else n.metodos.splice(op.idx,1);
        return;
      }
      if (T==='delete_node'){
        const id=op.id;
        E.nodos = E.nodos.filter(n=>n.id!==id);
        E.aristas = E.aristas.filter(a=>a.origenId!==id && a.destinoId!==id);
        return;
      }
      if (T==='add_edge'){ E.aristas.push(op.edge); return; }
      if (T==='update_edge'){
        const a = E.aristas.find(x=>x.id===op.id); if(!a) return;
        ['anc_o','anc_d','etiqueta','card_o','card_d','tam','puntos'].forEach(k=>{ if(op[k]!=null) a[k]=op[k]; });
        return;
      }
      if (T==='delete_edge'){ E.aristas = E.aristas.filter(a=>a.id!==op.id); return; }
    },

    // Wrappers con throttle
    emitirAddNodo:    (node)=>Collab._emitir({type:'add_node', node}),
    emitirBorrarNodo: (id)=>Collab._emitir({type:'delete_node', id}),
    emitirMoverNodo:  throttle((id,x,y)=>Collab._emitir({type:'move_node', id, x, y}), T_MOVE),
    emitirRedimNodo:  throttle((id,w,h)=>Collab._emitir({type:'resize_node', id, ancho:w, alto:h}), T_RESIZE),
    emitirCargaCompleta: (nodos, aristas) => Collab._emitir({type:'load_full', nodos, aristas}),

    emitirSetTitulo:  throttle((id,t)=>Collab._emitir({type:'set_title', id, titulo:t}), T_TEXT),
    emitirSetAtr:     throttle((id,idx,txt)=>Collab._emitir({type:'set_attr', id, idx, text:txt}), T_TEXT),
    emitirDelAtr:     (id,idx)=>Collab._emitir({type:'del_attr', id, idx}),
    emitirSetMet:     throttle((id,idx,txt)=>Collab._emitir({type:'set_method', id, idx, text:txt}), T_TEXT),
    emitirDelMet:     (id,idx)=>Collab._emitir({type:'del_method', id, idx}),

    emitirAddArista:  (edge)=>Collab._emitir({type:'add_edge', edge}),
    emitirUpdArista:  throttle((id,patch)=>Collab._emitir(Object.assign({type:'update_edge', id}, patch)), T_EDGE),
    emitirDelArista:  (id)=>Collab._emitir({type:'delete_edge', id}),
  };

  // Azúcar: no rompe si colaboración no está activa
  const NOP = ()=>{};
  DS.emitAddNode     = (...a)=> Collab.activa ? Collab.emitirAddNodo(...a)       : NOP();
  DS.emitDeleteNode  = (...a)=> Collab.activa ? Collab.emitirBorrarNodo(...a)    : NOP();
  DS.emitMoveNode    = (...a)=> Collab.activa ? Collab.emitirMoverNodo(...a)     : NOP();
  DS.emitResizeNode  = (...a)=> Collab.activa ? Collab.emitirRedimNodo(...a)     : NOP();

  DS.emitSetTitle    = (...a)=> Collab.activa ? Collab.emitirSetTitulo(...a)     : NOP();
  DS.emitSetAttr     = (...a)=> Collab.activa ? Collab.emitirSetAtr(...a)        : NOP();
  DS.emitDelAttr     = (...a)=> Collab.activa ? Collab.emitirDelAtr(...a)        : NOP();
  DS.emitSetMethod   = (...a)=> Collab.activa ? Collab.emitirSetMet(...a)        : NOP();
  DS.emitDelMethod   = (...a)=> Collab.activa ? Collab.emitirDelMet(...a)        : NOP();

  DS.emitAddEdge     = (...a)=> Collab.activa ? Collab.emitirAddArista(...a)     : NOP();
  DS.emitUpdateEdge  = (...a)=> Collab.activa ? Collab.emitirUpdArista(...a)     : NOP();
  DS.emitDeleteEdge  = (...a)=> Collab.activa ? Collab.emitirDelArista(...a)     : NOP();
  DS.emitLoadFull    = (...a)=> Collab.activa ? Collab.emitirCargaCompleta(...a) : NOP();
})();