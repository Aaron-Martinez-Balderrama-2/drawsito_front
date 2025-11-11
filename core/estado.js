// Estado + utilidades puras (sin efectos visuales)
(function(){
  const DS = (window.DS = window.DS || {});

  // ---- DOM ---------------------------------------------------------------
  const dom = (DS.dom = {
    zona: document.getElementById('zona_canvas'),
    lienzo: document.getElementById('lienzo'),
    editor: document.getElementById('editor_inline'),

    // Editor de aristas (asociación UML)
    editorArista: document.getElementById('editor_arista'),
    ea_lbl: document.getElementById('ea_lbl'),
    ea_o: document.getElementById('ea_o'),
    ea_d: document.getElementById('ea_d'),
    ea_sz: document.getElementById('ea_sz'),
    ea_cancel: document.getElementById('ea_cancel'),
    // NUEVOS:
    ea_nav: document.getElementById('ea_nav'),
    ea_role_o: document.getElementById('ea_role_o'),
    ea_role_d: document.getElementById('ea_role_d'),
    ea_qual_o: document.getElementById('ea_qual_o'),
    ea_qual_d: document.getElementById('ea_qual_d'),
    ea_preset: document.getElementById('ea_preset'),

    btnBorrar: document.getElementById('btn_borrar_sel'),
    btnGuardar: document.getElementById('btn_guardar'),
    btnCargar: document.getElementById('btn_cargar'),
    inpId: document.getElementById('inp_id'),
    selZoom: document.getElementById('sel_zoom'),
    optGrid: document.getElementById('opt_ver_grid'),
    optPag: document.getElementById('opt_ver_pag'),
    optCon: document.getElementById('opt_conectores'),
    selPapel: document.getElementById('sel_papel'),
    radiosOri: Array.from(document.querySelectorAll('input[name="ori"]')),
    panelClase: document.getElementById('panel_clase'),
    inpTitulo: document.getElementById('clase_titulo'),
  });
  dom.ctx = dom.lienzo.getContext('2d');

  // ---- Estado ------------------------------------------------------------
  const estado = (DS.estado = {
    token_csrf:'',
    nodos:[],
    // arista: {origenId,destinoId,etiqueta,card_o,card_d,role_o,role_d,qual_o,qual_d,nav,anc_o,anc_d,tam,puntos:[{x,y},...]}
    aristas:[],
    id_sec:1,

    // Selección (single y múltiple)
    seleccion:null,               // {tipo:'nodo'|'arista', id|idx}
    selNodos: new Set(),          // ids de nodos seleccionados (para grupo)

    // Arrastres
    arrastrando:false, dx:0, dy:0,
    redimensionando:false, handle:null,
    conectando:false, nodo_origen:null, ancla_origen:null,
    arrastrandoPuntoArista:null, // {idxArista, idxP}
    arrastrandoExtremoArista:null, // {idxArista, extremo:'o'|'d'}
    arrastreGrupo:null,          // {baseX,baseY, items:[{id,dx,dy}]}

    // Marquee (selección por marco)
    marcando:false,
    marcoRect:null,              // {x1,y1,x2,y2} (coords canvas)

    p_mouse:{x:0,y:0},
    hover_conector:null, hover_nodoId:null,
    H_TIT:28, FILA:18, MARG:10,
    opciones:{ verGrid:true, verPagina:true, conectores:true, papel:'A4', orientacion:'v' },
    mundo:{ w:1, h:1, bloqueW:1, bloqueH:1, margen:24, grid:20, zoom:1 }
  });

  // ---- Utilidades --------------------------------------------------------
  const util = (DS.util = {});

  util.buscarNodoPorId = id => estado.nodos.find(n=>n.id===id)||null;

  util.porDefectoClase = (x=120,y=80)=>({
    id: estado.id_sec++, tipo:'clase', x, y,
    ancho: 240, alto: 120, minW:160, minH:90,
    titulo:'Clase', atributos:['- id', '- nombre'], metodos:['+ metodo(): void']
  });

  util.porDefectoTexto = (x=140,y=100)=>({
    id: estado.id_sec++, tipo:'texto', x, y, ancho:160, alto:40, texto:'texto'
  });

  util.obtenerNodoEn = (x,y)=>{
    for(let i=estado.nodos.length-1;i>=0;i--){
      const n = estado.nodos[i];
      if(x>=n.x && x<=n.x+n.ancho && y>=n.y && y<=n.y+n.alto) return n;
    }
    return null;
  };

  util.layoutClase = (n)=>{
    const H=estado.H_TIT, F=estado.FILA, M=estado.MARG;
    const yAtr=n.y+H+M, hAtr=(n.atributos.length||0)*F;
    const yMet=yAtr+hAtr+M, hMet=(n.metodos.length||0)*F;
    n.alto = Math.max(H+M*3+Math.max(24,hAtr)+Math.max(24,hMet), n.minH);
    n.ancho = Math.max(n.ancho, n.minW);
    return {yAtr,hAtr,yMet,hMet};
  };

  util.anclajes = n=>{
    const c={x:n.x+n.ancho/2,y:n.y+n.alto/2};
    return { arriba:{x:c.x,y:n.y}, abajo:{x:c.x,y:n.y+n.alto}, izq:{x:n.x,y:c.y}, der:{x:n.x+n.ancho,y:c.y} };
  };

  util.ladoPreferido = (a,b)=>{
    const c1={x:b.x+b.ancho/2,y:b.y+b.alto/2}, c2={x:a.x+a.ancho/2,y:a.y+a.alto/2};
    const dx=c2.x-c1.x, dy=c2.y-c1.y;
    if(Math.abs(dx)>Math.abs(dy)) return dx>0?'der':'izq';
    return dy>0?'abajo':'arriba';
  };

  util.distPuntoSegmento = (px,py,x1,y1,x2,y2)=>{
    const A=px-x1, B=py-y1, C=x2-x1, D=y2-y1;
    const dot=A*C+B*D, len=C*C+D*D; let t=len?dot/len:-1;
    t=Math.max(0,Math.min(1,t));
    const x=x1+t*C, y=y1+t*D, dx=px-x, dy=py-y;
    return {d:Math.hypot(dx,dy), t, x, y};
  };

  util.existeArista = (o,d)=> estado.aristas.some(a=>a.origenId===o && a.destinoId===d);

  util.anclaMasCercana = (n, x, y)=>{
    const a = util.anclajes(n);
    let mejor='arriba', dist=1e9;
    for(const [k,p] of Object.entries(a)){
      const d = Math.hypot(p.x-x, p.y-y);
      if (d < dist){ dist=d; mejor=k; }
    }
    return mejor;
  };

  // Selección rectangular
  util.recta = (x1,y1,x2,y2)=>{
    const r={x:Math.min(x1,x2), y:Math.min(y1,y2)};
    r.w=Math.abs(x2-x1); r.h=Math.abs(y2-y1);
    return r;
  };
  util.intersecaNodo = (n, r)=>{
    return !(n.x+n.ancho < r.x || n.x > r.x+r.w || n.y+n.alto < r.y || n.y > r.y+r.h);
  };

  util.bboxDeIds = (ids)=>{
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity, vacio=true;
    for(const n of estado.nodos){
      if(ids.has(n.id)){
        vacio=false;
        x1=Math.min(x1,n.x); y1=Math.min(y1,n.y);
        x2=Math.max(x2,n.x+n.ancho); y2=Math.max(y2,n.y+n.alto);
      }
    }
    return vacio?null:{x:x1,y:y1,w:x2-x1,h:y2-y1};
  };
})();