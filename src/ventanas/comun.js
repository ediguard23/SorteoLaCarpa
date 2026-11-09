'use strict';
/* Utilidades compartidas por las pantallas. */
const $ = (s, raiz = document) => raiz.querySelector(s);
const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const api = (metodo, ...args) => window.carpa.llamar(metodo, ...args);

const ICONOS = {
  caja: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  personas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
  trofeo: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8 21h8M9.5 17h5l.5 4h-6z"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  fiesta: '<path d="M4 20l5-14 9 9z"/><path d="M14 4c.5 1 .5 2 0 3M19 9c-1-.4-2-.4-3 0M17 3l.5 1.5M21 7l-1.5.5M20 13l1 1"/>',
  impresora: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/><circle cx="17.5" cy="12" r=".6" fill="currentColor"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  excel: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13l4 5M13 13l-4 5"/>',
  candado: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  ok: '<path d="M4 12.5 9 17.5 20 6.5"/>',
  alerta: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  carpeta: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  escudo: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2.2"/>',
  tienda: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 9v11h14V9M9.5 20v-6h5v6"/>',
  sonido: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  regalo: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8C10.5 4 7 4 7 6s3 2 5 2c2 0 5 0 5-2s-3.5-2-5 2"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.3 4-6.5 8-6.5s7.2 2.2 8 6.5"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  atras: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  reiniciar: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
};

function icono(nombre) {
  return `<i data-ico="${nombre}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONOS[nombre] || ''}</svg></i>`;
}

function pintarIconos(raiz = document) {
  for (const el of $$('i[data-ico]:empty', raiz)) el.outerHTML = icono(el.dataset.ico);
}

function lempiras(n) {
  return `L. ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function telefonoBonito(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
}

function fecha(iso, conHora = true) {
  if (!iso) return '';
  const f = new Date(iso);
  const d = f.toLocaleDateString('es-HN', { day: '2-digit', month: 'short' });
  if (!conHora) return d;
  return `${d} · ${f.toLocaleTimeString('es-HN', { hour: 'numeric', minute: '2-digit' })}`;
}

function aviso(texto, tipo = '') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.innerHTML = `${icono(tipo === 'mal' ? 'alerta' : 'ok')}<div>${esc(texto)}</div>`;
  $('#avisos').append(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, tipo === 'mal' ? 6500 : 3500);
  setTimeout(() => el.remove(), tipo === 'mal' ? 7000 : 4000);
}

/* Ventana modal genérica. contenido: HTML; alAbrir(caja, cerrar) para enganchar eventos. */
function abrirModal(contenido, alAbrir) {
  return new Promise((resolve) => {
    const fondo = $('#modal');
    const caja = $('#modalCaja');
    caja.innerHTML = contenido;
    pintarIconos(caja);
    fondo.classList.remove('oculto');
    const cerrar = (valor) => {
      fondo.classList.add('oculto');
      caja.innerHTML = '';
      document.removeEventListener('keydown', tecla, true);
      resolve(valor);
    };
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); cerrar(null); } };
    document.addEventListener('keydown', tecla, true);
    alAbrir?.(caja, cerrar);
  });
}

/* Pide el PIN y lo comprueba con el programa. Devuelve el PIN o null si se cancela. */
function pedirPin(titulo = 'PIN de administrador', texto = 'Esta acción necesita el PIN.') {
  return abrirModal(`
    <h3>${esc(titulo)}</h3><p>${esc(texto)}</p>
    <form id="formPin">
      <div class="pin"><input id="pinEntrada" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••"></div>
      <div class="error-texto" id="pinError"></div>
      <div class="acciones">
        <button type="button" class="boton boton-claro" data-cancelar>Cancelar</button>
        <button type="submit" class="boton">Aceptar</button>
      </div>
    </form>`, (caja, cerrar) => {
    const entrada = $('#pinEntrada', caja);
    entrada.focus();
    entrada.addEventListener('input', () => { entrada.value = entrada.value.replace(/\D/g, ''); });
    $('[data-cancelar]', caja).onclick = () => cerrar(null);
    $('#formPin', caja).onsubmit = async (e) => {
      e.preventDefault();
      const pin = entrada.value;
      if (await api('verificarPin', pin)) return cerrar(pin);
      $('#pinError', caja).textContent = 'PIN incorrecto';
      caja.classList.remove('temblor');
      void caja.offsetWidth;
      caja.classList.add('temblor');
      entrada.select();
    };
  });
}

function confirmar(titulo, texto, { boton = 'Aceptar', peligro = false, campo = null } = {}) {
  return abrirModal(`
    <h3>${esc(titulo)}</h3><p>${texto}</p>
    ${campo ? `<label class="campo"><span>${esc(campo)}</span><input id="confCampo" maxlength="120"></label>` : ''}
    <div class="acciones">
      <button class="boton boton-claro" data-no>Cancelar</button>
      <button class="boton ${peligro ? 'boton-peligro' : ''}" data-si>${esc(boton)}</button>
    </div>`, (caja, cerrar) => {
    $('[data-no]', caja).onclick = () => cerrar(null);
    $('[data-si]', caja).onclick = () => cerrar(campo ? { texto: $('#confCampo', caja).value } : true);
    ($('#confCampo', caja) || $('[data-si]', caja)).focus();
  });
}
