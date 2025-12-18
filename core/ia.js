// drawsito_front/core/ia.js
(function(){
  const DS = window.DS;
  
  // MODIFICACIÓN: Usar la configuración global en lugar de ruta relativa
  const ENDPOINT = (window.DRAWSITO_CONFIG && window.DRAWSITO_CONFIG.gemini) || 'https://drawsitoback-production.up.railway.app/gemini.php';

  // Elementos DOM
  const ui = {
    chat: document.getElementById('gemini_chat'),
    prompt: document.getElementById('gemini_prompt'),
    btnEnviar: document.getElementById('btn_enviar_gemini'),
    btnAudio: document.getElementById('btn_audio_gemini'),
    inpImg: document.getElementById('inp_img_gemini'),
    preview: document.getElementById('gemini_preview'),
    prevImg: document.getElementById('prev_img'),
    prevAud: document.getElementById('prev_audio_lbl'),
    radiosMode: document.querySelectorAll('input[name="g_mode"]')
  };

  let adjuntoImg = null;
  let adjuntoAudio = null; // Base64
  let mediaRecorder = null;
  let audioChunks = [];

  // --- Funciones de Chat ---
  function agregarMsg(texto, tipo) {
    const div = document.createElement('div');
    div.className = `msg ${tipo}`;
    div.textContent = texto;
    ui.chat.appendChild(div);
    ui.chat.scrollTop = ui.chat.scrollHeight;
  }

  // --- Manejo de Imagen ---
  ui.inpImg.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      adjuntoImg = evt.target.result; // Data URL
      ui.prevImg.src = adjuntoImg;
      ui.prevImg.style.display = 'block';
      ui.preview.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  });

  // --- Manejo de Audio (Grabación) ---
  ui.btnAudio.addEventListener('mousedown', iniciarGrabacion);
  ui.btnAudio.addEventListener('mouseup', detenerGrabacion);
  // Soporte tactil
  ui.btnAudio.addEventListener('touchstart', (e)=>{e.preventDefault(); iniciarGrabacion();});
  ui.btnAudio.addEventListener('touchend', (e)=>{e.preventDefault(); detenerGrabacion();});

  async function iniciarGrabacion() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
      mediaRecorder.onstop = procesarAudio;
      mediaRecorder.start();
      ui.btnAudio.classList.add('recording');
    } catch (err) {
      alert("Permite el micrófono para usar voz.");
    }
  }

  function detenerGrabacion() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      ui.btnAudio.classList.remove('recording');
    }
  }

  function procesarAudio() {
    const blob = new Blob(audioChunks, { type: 'audio/webm' }); // O audio/mp3 si el navegador lo soporta
    const reader = new FileReader();
    reader.onloadend = () => {
      adjuntoAudio = reader.result;
      ui.prevAud.style.display = 'block';
      ui.preview.style.display = 'flex';
    };
    reader.readAsDataURL(blob);
  }

  // --- Limpiar ---
  window.limpiarAdjuntos = () => {
    adjuntoImg = null;
    adjuntoAudio = null;
    ui.inpImg.value = '';
    ui.preview.style.display = 'none';
    ui.prevImg.style.display = 'none';
    ui.prevAud.style.display = 'none';
  };

  // --- ENVIAR A GEMINI ---
  ui.btnEnviar.onclick = async () => {
    const txt = ui.prompt.value.trim();
    if (!txt && !adjuntoImg && !adjuntoAudio) return;

    // 1. Mostrar en chat
    if (txt) agregarMsg(txt, 'user');
    if (adjuntoImg) agregarMsg('[Imagen adjunta]', 'user');
    if (adjuntoAudio) agregarMsg('[Audio adjunto]', 'user');

    ui.prompt.value = '';
    const modo = document.querySelector('input[name="g_mode"]:checked').value;
    
    // UI Loading
    ui.btnEnviar.disabled = true;
    ui.btnEnviar.textContent = '...';

    // 2. Preparar contexto (Diagrama actual)
    const estadoActual = {
      nodos: DS.estado.nodos.map(n => ({id: n.id, titulo: n.titulo || n.texto, tipo: n.tipo, attrs: n.atributos})),
      aristas: DS.estado.aristas.map(a => ({origen: a.origenId, destino: a.destinoId, card_o: a.card_o, card_d: a.card_d}))
    };

    try {
      // 3. Petición al Backend
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          prompt: txt,
          modo: modo,
          diagrama: estadoActual,
          imagen: adjuntoImg,
          audio: adjuntoAudio
        })
      });

      const data = await res.json();
      
      // Parsear respuesta de Gemini
      // Gemini devuelve { candidates: [ { content: { parts: [ { text: "JSON..." } ] } } ] }
      if (data.candidates && data.candidates[0].content) {
        const rawText = data.candidates[0].content.parts[0].text;
        // Limpiamos bloques de código ```json ... ```
        const jsonStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const respuesta = JSON.parse(jsonStr);

        // 4. Ejecutar cambios en Drawsito
        if (respuesta.mensaje) agregarMsg(respuesta.mensaje, 'bot');
        ejecutarAcciones(respuesta.acciones, modo);
      } else {
        agregarMsg("Error: Gemini no entendió la respuesta.", 'error');
      }

    } catch (e) {
      console.error(e);
      agregarMsg("Error de conexión.", 'error');
    }

    ui.btnEnviar.disabled = false;
    ui.btnEnviar.textContent = 'Enviar ➤';
    limpiarAdjuntos();
  };

  // --- INTÉRPRETE DE ACCIONES ---
  function ejecutarAcciones(acciones, modo) {
    if (!acciones || !Array.isArray(acciones)) return;

    // Si es modo arquitecto, borrar todo primero
    if (modo === 'arquitecto') {
      // Borrar localmente y emitir borrados
      const ids = DS.estado.nodos.map(n => n.id);
      ids.forEach(id => DS.emitDeleteNode(id));
      DS.estado.nodos = [];
      DS.estado.aristas = [];
      DS.render.dibujar();
    }

    acciones.forEach(acc => {
      // Mapeo inteligente de IDs (Gemini puede devolver nombres, buscamos el ID real)
      const buscarId = (nombre) => {
        const n = DS.estado.nodos.find(nod => (nod.titulo || nod.texto || '').toLowerCase() === (nombre||'').toLowerCase());
        return n ? n.id : null;
      };

      if (acc.tipo === 'agregar_clase') {
        const nuevo = DS.util.porDefectoClase(acc.datos.x || 100, acc.datos.y || 100);
        nuevo.titulo = acc.datos.titulo || 'Clase';
        if (acc.datos.atributos) nuevo.atributos = acc.datos.atributos;
        if (acc.datos.metodos) nuevo.metodos = acc.datos.metodos;
        DS.util.layoutClase(nuevo);
        DS.estado.nodos.push(nuevo);
        DS.emitAddNode(nuevo);
      }

      if (acc.tipo === 'editar_clase') {
        const id = buscarId(acc.busca_titulo);
        if (id) {
          const n = DS.util.buscarNodoPorId(id);
          const d = acc.nuevos_datos;
          if (d.titulo) { n.titulo = d.titulo; DS.emitSetTitle(id, d.titulo); }
          if (d.atributos) { 
             // Reemplazo simple por ahora, idealmente merge
             n.atributos = d.atributos; 
             d.atributos.forEach((a, i) => DS.emitSetAttr(id, i, a));
          }
          if (d.metodos) {
             n.metodos = d.metodos;
             d.metodos.forEach((m, i) => DS.emitSetMethod(id, i, m));
          }
          DS.util.layoutClase(n);
        }
      }

      if (acc.tipo === 'conectar') {
        const idO = buscarId(acc.origen);
        const idD = buscarId(acc.destino);
        if (idO && idD) {
          const edge = {
            id: Date.now() + Math.random(),
            origenId: idO, destinoId: idD,
            card_o: acc.card_o || '', card_d: acc.card_d || '',
            nav: acc.nav || 'o2d', uml: 'assoc', tam: 12
          };
          DS.estado.aristas.push(edge);
          DS.emitAddEdge(edge);
        }
      }
      
      if (acc.tipo === 'borrar_clase') {
          const id = buscarId(acc.titulo);
          if(id) DS.emitDeleteNode(id);
      }
    });

    DS.render.dibujar();
  }

})();