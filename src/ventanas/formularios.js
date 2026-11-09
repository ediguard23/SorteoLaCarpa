'use strict';
/* Secciones de configuración que comparten el asistente de primera vez y la pestaña Configuración.
   Cada campo lleva name="grupo.clave"; leerFormulario() arma el objeto de ajustes. */

// Nombres de impresoras de matriz de puntos (de cinta) más comunes en tiendas.
const ES_MATRIZ = /\bsp ?7\d\d|sp742|sp712|tm-?u ?2\d\d|tm-?u\d|dot ?matrix|matriz|impact/i;

const Formularios = {
  tienda(a) {
    return `
      <label class="campo"><span>Nombre de la tienda</span><input name="tienda.nombre" value="${esc(a.tienda.nombre)}" maxlength="60"></label>
      <label class="campo"><span>Eslogan</span><input name="tienda.eslogan" value="${esc(a.tienda.eslogan)}" maxlength="80"></label>
      <div class="fila-2">
        <label class="campo"><span>Dirección <em>(opcional, sale al pie del ticket)</em></span><input name="tienda.direccion" value="${esc(a.tienda.direccion)}" maxlength="80" placeholder="Ej. Barrio El Centro, Tegucigalpa"></label>
        <label class="campo"><span>Teléfono de la tienda <em>(opcional)</em></span><input name="tienda.telefono" value="${esc(a.tienda.telefono)}" maxlength="20" placeholder="Ej. 2222-3333"></label>
      </div>`;
  },

  sorteo(a) {
    return `
      <label class="campo"><span>Nombre del sorteo</span><input name="sorteo.nombre" value="${esc(a.sorteo.nombre)}" maxlength="40" placeholder="Ej. Gran Sorteo Navideño"></label>
      <div class="fila-2">
        <label class="campo"><span>Fecha del sorteo <em>(opcional)</em></span><input type="date" name="sorteo.fecha" value="${esc(a.sorteo.fecha)}"></label>
        <label class="campo"><span>Monto de compra por cada ticket</span><div class="con-prefijo"><b>L.</b><input name="sorteo.montoTicket" data-tipo="numero" inputmode="decimal" value="${esc(a.sorteo.montoTicket)}"></div></label>
      </div>
      <div class="fila-2">
        <label class="campo"><span>¿Cuántos premios se sortean?</span>
          <div class="contador">
            <button type="button" data-contar="-1" aria-label="Menos">−</button>
            <input name="sorteo.cantidadPremios" data-tipo="numero" inputmode="numeric" value="${esc(a.sorteo.cantidadPremios || 1)}" maxlength="2">
            <button type="button" data-contar="1" aria-label="Más">+</button>
          </div>
        </label>
        <p class="ayuda" style="margin:30px 0 0">El sorteo se termina solo al sacar ese número de ganadores.</p>
      </div>
      <div class="campo"><span>Nombre de cada premio, en el orden en que se sortean <em>(opcional)</em></span>
        ${Formularios.editorFichas('sorteo.premios', a.sorteo.premios, 'Ej. Televisor 50 pulgadas', true)}
      </div>`;
  },

  ticket(a) {
    return `
      <label class="campo"><span>Mensaje al pie del ticket</span><input name="pieTicket" value="${esc(a.pieTicket)}" maxlength="120"></label>`;
  },

  impresora(a, impresoras) {
    const lista = impresoras.length
      ? impresoras.map((p) => `
        <label class="impresora"><input type="radio" name="impresora.nombre" value="${esc(p.nombre)}" ${p.nombre === a.impresora.nombre ? 'checked' : ''}>
          <span>${esc(p.descripcion)}</span>${p.predeterminada ? '<small>Predeterminada</small>' : ''}</label>`).join('')
      : '<div class="vacio" style="padding:20px">No hay impresoras instaladas en Windows. Instale el controlador de la impresora de tickets y vuelva a abrir el programa.</div>';
    return `
      <div class="campo"><span>Impresora de tickets</span></div>
      <div class="lista-impresoras">${lista}</div>
      <div class="campo"><span>Tipo de impresora</span>
        <div class="segmentos">
          <label><input type="radio" name="impresora.tipo" value="termica" ${a.impresora.tipo !== 'matriz' ? 'checked' : ''}><span>Térmica</span></label>
          <label><input type="radio" name="impresora.tipo" value="matriz" ${a.impresora.tipo === 'matriz' ? 'checked' : ''}><span>Matriz de puntos · Star SP700</span></label>
        </div>
      </div>
      <div class="campo"><span>Ancho del papel</span>
        <div class="segmentos">
          <label><input type="radio" name="impresora.papel" value="80" ${![58, 70].includes(Number(a.impresora.papel)) ? 'checked' : ''}><span>80 mm</span></label>
          <label><input type="radio" name="impresora.papel" value="70" ${Number(a.impresora.papel) === 70 ? 'checked' : ''}><span>70–76 mm (Star SP700)</span></label>
          <label><input type="radio" name="impresora.papel" value="58" ${Number(a.impresora.papel) === 58 ? 'checked' : ''}><span>58 mm</span></label>
        </div>
      </div>
      <p class="ayuda">El corte del papel lo hace la impresora al final de cada ticket. Si no corta, actívelo en las preferencias del controlador de Windows («Cortar papel: después de cada documento»).</p>
      <button type="button" class="boton boton-claro" data-accion="probar"><i data-ico="impresora"></i> Imprimir prueba</button>`;
  },

  cajeros(a) {
    return `
      <div class="campo"><span>Nombres de los cajeros <em>(para saber quién imprimió cada ticket)</em></span>
        ${Formularios.editorFichas('cajeros', a.cajeros, 'Ej. Ana', false)}
      </div>`;
  },

  pinNuevo(obligatorio) {
    return `
      <div class="fila-2">
        <label class="campo"><span>${obligatorio ? 'PIN de administrador' : 'PIN nuevo'} <em>(4 a 8 números)</em></span><input type="password" name="_pin" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="••••"></label>
        <label class="campo"><span>Repetir PIN</span><input type="password" name="_pin2" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="••••"></label>
      </div>
      <p class="ayuda">El PIN se pide para abrir el sorteo, anular o reimprimir tickets y entrar a Configuración. Guárdelo bien: no se puede recuperar.</p>`;
  },

  respaldos(a) {
    return `
      <p class="ayuda" style="margin-top:0">Cada cierto tiempo, al cerrar el programa y después de cada sorteo se guarda una copia de todos los datos (se conservan las 40 más recientes). Si puede, escoja una carpeta de OneDrive o una memoria USB.</p>
      <div class="ruta" data-ruta>${esc(a.respaldos.carpeta || a.carpetaRespaldos || '')}</div>
      <input type="hidden" name="respaldos.carpeta" value="${esc(a.respaldos.carpeta)}">
      <div class="fila-botones">
        <button type="button" class="boton boton-claro" data-accion="elegirCarpeta"><i data-ico="carpeta"></i> Cambiar carpeta</button>
        <button type="button" class="boton boton-claro" data-accion="carpetaPredeterminada">Usar la de Documentos</button>
      </div>`;
  },

  editorFichas(nombre, valores, ejemplo, numerado) {
    const fichas = (valores || []).map((v, i) => Formularios.ficha(v, numerado ? i + 1 : null)).join('');
    return `
      <div class="editor-fichas" data-fichas="${nombre}" data-numerado="${numerado ? 1 : 0}">
        <div class="fichas-editor">${fichas}</div>
        <div class="agregar"><input placeholder="${esc(ejemplo)}" maxlength="80"><button type="button" class="boton boton-claro">Agregar</button></div>
      </div>`;
  },

  ficha(texto, numero) {
    return `<span class="ficha" data-valor="${esc(texto)}">${numero ? `<b>${numero}.</b>` : ''}${esc(texto)}<button type="button" title="Quitar">×</button></span>`;
  },

  // Activa los editores de fichas dentro de raiz.
  enganchar(raiz, alCambiar) {
    // Al escoger una impresora de matriz de puntos (Star SP700 y parecidas) se pone su tipo y su papel.
    if (!raiz.dataset.matrizLista) {
      raiz.dataset.matrizLista = '1';
      raiz.addEventListener('change', (e) => {
        if (e.target.name !== 'impresora.nombre' || !ES_MATRIZ.test(e.target.value)) return;
        const tipo = $('input[name="impresora.tipo"][value="matriz"]', raiz);
        const papel = $('input[name="impresora.papel"][value="70"]', raiz);
        if (tipo) tipo.checked = true;
        if (papel) papel.checked = true;
      }, true);
    }
    for (const c of $$('.contador', raiz)) {
      if (c.dataset.listo) continue;
      c.dataset.listo = '1';
      const entrada = $('input', c);
      const fijar = (v) => {
        entrada.value = Math.min(50, Math.max(1, Math.round(Number(v) || 1)));
        alCambiar?.();
      };
      c.addEventListener('click', (e) => {
        const b = e.target.closest('[data-contar]');
        if (b) fijar(Number(entrada.value) + Number(b.dataset.contar));
      });
      entrada.addEventListener('input', () => { entrada.value = entrada.value.replace(/\D/g, '').slice(0, 2); });
      entrada.addEventListener('blur', () => fijar(entrada.value));
    }
    for (const ed of $$('.editor-fichas', raiz)) {
      if (ed.dataset.listo) continue;
      ed.dataset.listo = '1';
      const caja = $('.fichas-editor', ed);
      const entrada = $('.agregar input', ed);
      const renumerar = () => {
        if (ed.dataset.numerado !== '1') return;
        $$('.ficha', caja).forEach((f, i) => { const b = $('b', f); if (b) b.textContent = `${i + 1}.`; });
      };
      const agregar = () => {
        const v = entrada.value.trim();
        if (!v) return;
        caja.insertAdjacentHTML('beforeend', Formularios.ficha(v, ed.dataset.numerado === '1' ? $$('.ficha', caja).length + 1 : null));
        entrada.value = '';
        entrada.focus();
        alCambiar?.();
      };
      $('.agregar button', ed).onclick = agregar;
      entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
      caja.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') return;
        e.target.closest('.ficha').remove();
        renumerar();
        alCambiar?.();
      });
    }
  },
};

function leerFormulario(raiz) {
  const r = {};
  const poner = (ruta, valor) => {
    const partes = ruta.split('.');
    let o = r;
    while (partes.length > 1) { const p = partes.shift(); o = o[p] ||= {}; }
    o[partes[0]] = valor;
  };
  for (const el of $$('input[name], select[name], textarea[name]', raiz)) {
    if (el.name.startsWith('_')) continue;
    if (el.type === 'radio' && !el.checked) continue;
    if (el.type === 'checkbox') { poner(el.name, el.checked); continue; }
    let v = el.value;
    if (el.dataset.tipo === 'numero') v = Number(String(v).replace(/,/g, ''));
    if (el.name === 'impresora.papel') v = Number(v);
    poner(el.name, v);
  }
  for (const ed of $$('.editor-fichas', raiz)) {
    // Lo escrito sin pulsar «Agregar» también cuenta.
    const pendiente = $('.agregar input', ed).value.trim();
    const valores = $$('.ficha', ed).map((f) => f.dataset.valor);
    if (pendiente) valores.push(pendiente);
    poner(ed.dataset.fichas, valores);
  }
  // Si no hay radio marcado de impresora, que quede vacío.
  if ($('input[name="impresora.papel"]', raiz) && !(r.impresora && 'nombre' in r.impresora)) {
    r.impresora = { ...(r.impresora || {}), nombre: '' };
  }
  return r;
}

function leerPinNuevo(raiz, obligatorio) {
  const p1 = $('input[name="_pin"]', raiz)?.value || '';
  const p2 = $('input[name="_pin2"]', raiz)?.value || '';
  if (!p1 && !p2 && !obligatorio) return { pin: '' };
  if (!/^\d{4,8}$/.test(p1)) return { error: 'El PIN debe tener de 4 a 8 números.' };
  if (p1 !== p2) return { error: 'Los dos PIN no coinciden.' };
  return { pin: p1 };
}
