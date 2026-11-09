'use strict';
/* Pantalla principal: caja, participantes, ganadores, configuración y asistente de primera vez. */

let estado = null;
let pinConfig = null;
let impresoras = [];

async function refrescar() {
  estado = await api('estado');
  const a = estado.ajustes;
  $('#nombreSorteo').textContent = a.sorteo.nombre;
  $('#premiosSorteo').textContent = ` · ${estado.premio.total} ${estado.premio.total === 1 ? 'premio' : 'premios'}`;
  $('#montoPorTicket').textContent = lempiras(a.sorteo.montoTicket);
  $('#papelTexto').textContent = `Papel de ${a.impresora.papel} mm`;
  $('#cHoy').textContent = estado.resumen.hoy.toLocaleString('es-HN');
  $('#cTotal').textContent = estado.resumen.validos.toLocaleString('es-HN');
  $('#cClientes').textContent = estado.resumen.clientes.toLocaleString('es-HN');
  llenarCajeros();
  calcular();
  return estado;
}

/* ---------------- Pestañas ---------------- */
function irA(vista) {
  if (vista !== 'config') bloquearConfig();
  $$('#pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === `vista-${vista}`));
  if (vista === 'participantes') cargarTickets(true);
  if (vista === 'ganadores') cargarGanadores();
  if (vista === 'caja') setTimeout(() => $('#cliente').focus(), 50);
  if (vista === 'config' && !pinConfig) setTimeout(() => $('#desbloquear').focus(), 50);
}

$('#pestanas').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-vista]');
  if (b) irA(b.dataset.vista);
});

/* ---------------- Vista previa del ticket ---------------- */
async function mostrarPrevia(iframe, ajustes) {
  const html = await api('vistaPrevia', ajustes || null);
  const pedido = Number((ajustes && ajustes.impresora && ajustes.impresora.papel) || estado.ajustes.impresora.papel);
  const papel = [58, 70].includes(pedido) ? pedido : 80;
  iframe.style.width = `${Math.round((papel * 96) / 25.4)}px`;
  iframe.onload = async () => {
    try {
      const doc = iframe.contentDocument;
      doc.documentElement.style.overflow = 'hidden';
      await doc.fonts.ready;
      const alto = doc.documentElement.scrollHeight;
      if (alto > 50) iframe.style.height = `${alto}px`;
    } catch { /* sin acceso al documento: se deja el alto fijo */ }
  };
  iframe.srcdoc = html;
}

/* ---------------- Caja ---------------- */
function llenarCajeros() {
  const sel = $('#cajero');
  const lista = estado.ajustes.cajeros;
  const anterior = sel.value || localStorage.getItem('cajero') || '';
  sel.innerHTML = lista.length
    ? lista.map((c) => `<option ${c === anterior ? 'selected' : ''}>${esc(c)}</option>`).join('')
    : '<option value="">(sin cajeros: agréguelos en Configuración)</option>';
}
$('#cajero').addEventListener('change', () => localStorage.setItem('cajero', $('#cajero').value));

function montoEscrito() {
  const v = Number(String($('#monto').value).replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

function calcular() {
  if (!estado) return;
  const m = Number(estado.ajustes.sorteo.montoTicket) || 500;
  const monto = montoEscrito();
  const n = Math.floor((monto + 1e-9) / m);
  $('#cantTickets').textContent = n;
  $('#cantTexto').textContent = n === 1 ? 'ticket' : 'tickets';
  const fichas = Math.min(n, 18);
  $('#fichas').innerHTML = Array.from({ length: fichas }, (_, i) => `<span class="t" style="animation-delay:${i * 25}ms"></span>`).join('')
    + (n > fichas ? `<span class="mas">+${n - fichas}</span>` : '');
  const resto = monto > 0 ? m - (monto % m) : m;
  let texto;
  if (!monto) texto = 'Escriba el monto para calcular los tickets.';
  else if (n === 0) texto = `Le faltan ${lempiras(resto)} para su primer ticket.`;
  else texto = `${n === 1 ? 'Se imprimirá 1 ticket' : `Se imprimirán ${n} tickets`}. Con ${lempiras(resto)} más se lleva otro.`;
  $('#faltan').textContent = texto;
  $('#botonGenerar').disabled = n < 1;
}

$('#telefono').addEventListener('input', (e) => {
  const d = e.target.value.replace(/\D/g, '').slice(0, 8);
  e.target.value = d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
  e.target.classList.remove('error');
});
$('#monto').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^\d.,]/g, '');
  calcular();
});
$('#cliente').addEventListener('input', (e) => e.target.classList.remove('error'));

let generando = false;
$('#formCaja').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (generando) return;
  const cliente = $('#cliente').value.trim();
  const telefono = $('#telefono').value.replace(/\D/g, '');
  const monto = montoEscrito();
  if (cliente.length < 2) { $('#cliente').classList.add('error'); $('#cliente').focus(); return aviso('Escriba el nombre del cliente.', 'mal'); }
  if (telefono.length !== 8) { $('#telefono').classList.add('error'); $('#telefono').focus(); return aviso('El teléfono debe tener 8 dígitos.', 'mal'); }
  const n = Math.floor((monto + 1e-9) / estado.ajustes.sorteo.montoTicket);
  if (n < 1) return;
  if (n > 10) {
    const ok = await confirmar('¿Imprimir tantos tickets?', `La compra de <b>${lempiras(monto)}</b> da <b>${n} tickets</b>. Revise que el monto esté bien escrito.`, { boton: `Sí, imprimir ${n}` });
    if (!ok) return;
  }
  generando = true;
  const boton = $('#botonGenerar');
  boton.disabled = true;
  boton.innerHTML = `${icono('impresora')} Imprimiendo…`;
  try {
    const r = await api('generar', { cliente, telefono, monto, nota: $('#nota').value, cajero: $('#cajero').value });
    mostrarResultado(cliente, r);
    $('#cliente').value = '';
    $('#telefono').value = '';
    $('#monto').value = '';
    $('#nota').value = '';
    if (r.error) aviso(r.error, 'mal');
    else aviso(`${r.tickets.length === 1 ? 'Ticket impreso' : `${r.tickets.length} tickets impresos`} para ${cliente}.`, 'ok');
  } catch (err) {
    aviso(err.message, 'mal');
  } finally {
    generando = false;
    boton.innerHTML = `${icono('impresora')} Generar e imprimir <kbd>Enter</kbd>`;
    await refrescar();
    $('#cliente').focus();
  }
});

function mostrarResultado(cliente, r) {
  const caja = $('#resultado');
  const conError = Boolean(r.error);
  caja.classList.remove('oculto');
  caja.classList.toggle('con-error', conError);
  caja.innerHTML = `
    <h3>${icono(conError ? 'alerta' : 'ok')} ${conError ? 'Faltan tickets por imprimir' : 'Listo'}</h3>
    <p>${esc(cliente)} · ${r.tickets.length === 1 ? '1 ticket' : `${r.tickets.length} tickets`}${conError ? ` · se imprimieron ${r.impresos}` : ''}</p>
    <div class="codigos">${r.tickets.map((t, i) => `<span class="codigo-chip ${conError && i >= r.impresos ? 'falta' : ''}">${esc(t.codigo)}</span>`).join('')}</div>
    ${conError ? `<p style="margin:12px 0 10px;color:#a5221c">${esc(r.error)}</p><button class="boton" id="reintentar">${icono('impresora')} Imprimir los que faltan</button>` : ''}`;
  if (conError) {
    $('#reintentar').onclick = async () => {
      let impresos = r.impresos;
      try {
        for (const t of r.tickets.slice(r.impresos)) {
          await api('imprimir', t.id);
          impresos++;
        }
        mostrarResultado(cliente, { ...r, impresos, error: null });
        aviso('Tickets impresos.', 'ok');
      } catch (err) {
        mostrarResultado(cliente, { ...r, impresos, error: err.message });
        aviso(err.message, 'mal');
      }
    };
  }
}

/* ---------------- Participantes ---------------- */
let pagina = 0;
const POR_PAGINA = 150;
let temporizadorBusqueda;

async function cargarTickets(desdeCero) {
  if (desdeCero) { pagina = 0; $('#tablaTickets').innerHTML = ''; }
  const r = await api('buscar', { texto: $('#buscar').value, estado: $('#filtroEstado').value, limite: POR_PAGINA, desde: pagina * POR_PAGINA });
  const html = r.filas.map((t) => {
    const est = t.anulado ? ['anulado', 'Anulado'] : t.impresiones === 0 ? ['pendiente', 'Sin imprimir'] : ['valido', 'Válido'];
    return `<tr class="${t.anulado ? 'anulado' : ''}" data-id="${t.id}">
      <td class="cod">${esc(t.codigo)}</td>
      <td>${esc(t.cliente)}</td>
      <td>${esc(telefonoBonito(t.telefono))}</td>
      <td class="der">${lempiras(t.monto)}</td>
      <td>${t.numero} de ${t.total}</td>
      <td>${esc(t.nota)}</td>
      <td>${esc(fecha(t.creado))}</td>
      <td>${esc(t.cajero)}</td>
      <td><span class="estado ${est[0]}" title="${esc(t.motivo_anulado)}">${est[1]}</span></td>
      <td class="acc">${t.anulado ? '' : `<button class="boton-mini" data-imprimir>${t.impresiones ? 'Reimprimir' : 'Imprimir'}</button><button class="boton-mini peligro" data-anular>Anular</button>`}</td>
    </tr>`;
  }).join('');
  $('#tablaTickets').insertAdjacentHTML('beforeend', html);
  const mostrados = $$('#tablaTickets tr').length;
  $('#conteo').textContent = r.total ? `${mostrados.toLocaleString('es-HN')} de ${r.total.toLocaleString('es-HN')}` : '';
  $('#sinTickets').classList.toggle('oculto', r.total > 0);
  $('#verMas').classList.toggle('oculto', mostrados >= r.total);
}

$('#buscar').addEventListener('input', () => { clearTimeout(temporizadorBusqueda); temporizadorBusqueda = setTimeout(() => cargarTickets(true), 220); });
$('#filtroEstado').addEventListener('change', () => cargarTickets(true));
$('#verMas').addEventListener('click', () => { pagina++; cargarTickets(false); });
$('#exportar').addEventListener('click', async () => {
  try {
    const ruta = await api('exportarExcel');
    if (ruta) aviso('Lista exportada a Excel.', 'ok');
  } catch (err) { aviso(err.message, 'mal'); }
});

$('#tablaTickets').addEventListener('click', async (e) => {
  const fila = e.target.closest('tr[data-id]');
  if (!fila) return;
  const id = Number(fila.dataset.id);
  const codigo = $('.cod', fila).textContent;
  try {
    if (e.target.matches('[data-imprimir]')) {
      const re = e.target.textContent === 'Reimprimir';
      let pin = null;
      if (re) {
        pin = await pedirPin('Reimprimir ticket', `El ticket ${codigo} saldrá marcado como REIMPRESIÓN.`);
        if (!pin) return;
      }
      await api('imprimir', id, pin);
      aviso(`Ticket ${codigo} impreso.`, 'ok');
      cargarTickets(true);
    }
    if (e.target.matches('[data-anular]')) {
      const r = await confirmar(`Anular el ticket ${codigo}`, 'Un ticket anulado no participa en el sorteo. Queda registrado y no se puede deshacer.', { boton: 'Anular ticket', peligro: true, campo: 'Motivo (opcional)' });
      if (!r) return;
      const pin = await pedirPin('Anular ticket', `Confirme con el PIN para anular ${codigo}.`);
      if (!pin) return;
      await api('anular', id, pin, r.texto);
      aviso(`Ticket ${codigo} anulado.`, 'ok');
      cargarTickets(true);
      refrescar();
    }
  } catch (err) { aviso(err.message, 'mal'); }
});

/* ---------------- Ganadores ---------------- */
async function cargarGanadores() {
  const lista = await api('ganadores');
  $('#listaGanadores').innerHTML = lista.length
    ? lista.map((g) => `
      <div class="ganador ${g.descartado ? 'descartado' : ''}">
        <div class="premio">Premio ${g.premio_num} de ${estado.premio.total}${g.premio ? ` · ${esc(g.premio)}` : ''}</div>
        <div class="nombre">${esc(g.cliente)}</div>
        <div class="cod">${esc(g.codigo)}</div>
        <div class="datos">
          Tel. ${esc(telefonoBonito(g.telefono))}<br>
          Ticket ${g.numero} de ${g.total} · compra de ${lempiras(g.monto)}<br>
          Sorteado: ${esc(fecha(g.sorteado))}
          ${g.descartado ? '<br><span class="estado anulado">No se presentó</span>' : ''}
        </div>
      </div>`).join('')
    : '<div class="vacio">Todavía no se ha sorteado ningún premio.</div>';
}

/* ---------------- Abrir sorteo ---------------- */
$('#abrirSorteo').addEventListener('click', async () => {
  if (!estado.resumen.validos) return aviso('Todavía no hay tickets para sortear.', 'mal');
  const pin = await pedirPin('Abrir el sorteo', 'La pantalla del sorteo se abre en la tele o el proyector, si hay uno conectado.');
  if (!pin) return;
  try { await api('abrirSorteo', pin); } catch (err) { aviso(err.message, 'mal'); }
});
window.carpa.alCerrarSorteo(() => { refrescar(); if ($('#vista-ganadores').classList.contains('activa')) cargarGanadores(); });

/* ---------------- Configuración ---------------- */
function bloquearConfig() {
  pinConfig = null;
  $('#config').classList.add('oculto');
  $('#config').innerHTML = '';
  $('#configBloqueo').classList.remove('oculto');
}

$('#desbloquear').addEventListener('click', async () => {
  const pin = await pedirPin('Configuración', 'Escriba el PIN de administrador.');
  if (!pin) return;
  pinConfig = pin;
  impresoras = await api('impresoras');
  pintarConfig();
});

function pintarConfig() {
  const a = estado.ajustes;
  const c = $('#config');
  c.innerHTML = `
    <div class="tarjeta seccion"><h3>${icono('tienda')} Tienda</h3>${Formularios.tienda(a)}</div>
    <div class="tarjeta seccion"><h3>${icono('regalo')} Sorteo</h3>${Formularios.sorteo(a)}</div>
    <div class="tarjeta seccion"><h3>${icono('impresora')} Impresora</h3>${Formularios.impresora(a, impresoras)}</div>
    <div class="tarjeta seccion"><h3>${icono('ticket')} Ticket</h3>${Formularios.ticket(a)}<div class="config-previa"><iframe id="previaConfig" title="Vista previa"></iframe></div></div>
    <div class="tarjeta seccion"><h3>${icono('usuario')} Cajeros</h3>${Formularios.cajeros(a)}</div>
    <div class="tarjeta seccion"><h3>${icono('escudo')} Seguridad y sonido</h3>${Formularios.pinNuevo(false)}
      <label class="interruptor"><input type="checkbox" name="sonido" ${a.sonido ? 'checked' : ''}><span class="riel"></span> Sonidos en la pantalla del sorteo</label></div>
    <div class="tarjeta seccion"><h3>${icono('carpeta')} Copias de seguridad</h3>${Formularios.respaldos(a)}
      <div class="fila-botones" style="margin-top:10px">
        <button type="button" class="boton boton-claro" data-accion="respaldarAhora">Hacer copia ahora</button>
        <button type="button" class="boton boton-claro" data-accion="abrirRespaldos">Abrir carpeta</button>
      </div></div>
    <div class="tarjeta seccion"><h3>${icono('ok')} Programa y actualizaciones</h3>
      <p class="estado-programa" id="estadoPrograma"></p>
      <div class="fila-botones">
        <button type="button" class="boton boton-claro" data-accion="buscarActualizacion">Buscar actualizaciones</button>
        <button type="button" class="boton oculto" data-accion="instalarActualizacion" id="botonInstalar">Reiniciar y actualizar</button>
      </div></div>
    <div class="tarjeta seccion peligro-zona"><h3>${icono('reiniciar')} Empezar un sorteo nuevo</h3>
      <p class="ayuda" style="margin-top:0">Para el próximo sorteo: se guarda una copia de todo, la lista de tickets y ganadores empieza vacía y los códigos usados no se repiten. El sorteo actual queda en las copias.</p>
      <button type="button" class="boton boton-peligro" data-accion="nuevoSorteo">Empezar sorteo nuevo</button></div>
    <div class="pie-config"><button type="button" class="boton boton-claro" data-accion="descartar">Descartar cambios</button><button type="button" class="boton" data-accion="guardar">${icono('ok')} Guardar cambios</button></div>`;
  $('#configBloqueo').classList.add('oculto');
  c.classList.remove('oculto');
  const actualizarPrevia = () => mostrarPrevia($('#previaConfig'), leerFormulario(c));
  Formularios.enganchar(c, actualizarPrevia);
  c.onchange = actualizarPrevia;
  let t;
  c.oninput = () => { clearTimeout(t); t = setTimeout(actualizarPrevia, 300); };
  actualizarPrevia();
  api('actualizacion').then(pintarActualizacion);
}

async function accionesComunes(accion, raiz, borrador) {
  if (accion === 'probar') {
    const f = leerFormulario(raiz);
    try {
      await api('imprimirPrueba', f.impresora, { ...borrador, ...f });
      aviso('Se mandó la prueba a la impresora.', 'ok');
    } catch (err) { aviso(err.message, 'mal'); }
    return true;
  }
  if (accion === 'elegirCarpeta') {
    const ruta = await api('elegirCarpeta');
    if (ruta) { $('input[name="respaldos.carpeta"]', raiz).value = ruta; $('[data-ruta]', raiz).textContent = ruta; }
    return true;
  }
  if (accion === 'carpetaPredeterminada') {
    $('input[name="respaldos.carpeta"]', raiz).value = '';
    $('[data-ruta]', raiz).textContent = 'Documentos\\Sorteo La Carpa\\Respaldos';
    return true;
  }
  return false;
}

$('#config').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const c = $('#config');
  const accion = b.dataset.accion;
  if (await accionesComunes(accion, c, {})) return;
  try {
    if (accion === 'guardar') {
      const p = leerPinNuevo(c, false);
      if (p.error) return aviso(p.error, 'mal');
      await api('guardarAjustes', pinConfig, leerFormulario(c), p.pin);
      if (p.pin) pinConfig = p.pin;
      await refrescar();
      mostrarPrevia($('#previa'));
      aviso('Configuración guardada.', 'ok');
      pintarConfig();
    }
    if (accion === 'descartar') pintarConfig();
    if (accion === 'buscarActualizacion') pintarActualizacion(await api('buscarActualizacion'));
    if (accion === 'instalarActualizacion') await instalarActualizacion();
    if (accion === 'respaldarAhora') { await api('respaldarAhora'); aviso('Copia de seguridad guardada.', 'ok'); }
    if (accion === 'abrirRespaldos') await api('abrirRespaldos');
    if (accion === 'nuevoSorteo') {
      const r = await confirmar('Empezar un sorteo nuevo', `Se guardará una copia del sorteo <b>${esc(estado.ajustes.sorteo.nombre)}</b> y la lista empezará vacía.`, { boton: 'Empezar sorteo nuevo', peligro: true, campo: 'Nombre del sorteo nuevo' });
      if (!r) return;
      await api('nuevoSorteo', pinConfig, { nombre: r.texto || estado.ajustes.sorteo.nombre, fecha: '', premios: [], cantidadPremios: estado.ajustes.sorteo.cantidadPremios });
      await refrescar();
      pintarConfig();
      aviso('Sorteo nuevo listo.', 'ok');
    }
  } catch (err) { aviso(err.message, 'mal'); }
});

/* ---------------- Asistente de primera vez ---------------- */
const PASOS = [
  { titulo: 'Tienda', h: 'Bienvenido', p: 'Vamos a dejar listo el programa del sorteo en 5 pasos. Todo se puede cambiar después en Configuración.' },
  { titulo: 'Sorteo', h: 'El sorteo', p: 'Cómo se llama, cuándo es y cada cuánto de compra se gana un ticket.' },
  { titulo: 'Impresora', h: 'La impresora de tickets', p: 'Escoja la impresora de tickets de la caja, su tipo y el ancho del papel. Imprima una prueba para ver cómo sale.' },
  { titulo: 'Cajeros y PIN', h: 'Cajeros y seguridad', p: 'Quién va a imprimir tickets y el PIN de administrador.' },
  { titulo: 'Copias', h: 'Copias de seguridad', p: 'Dónde se guardan las copias de todos los datos, por si la computadora falla.' },
];

async function asistente() {
  impresoras = await api('impresoras');
  const borrador = JSON.parse(JSON.stringify(estado.ajustes));
  if (!borrador.impresora.nombre) {
    const pred = impresoras.find((p) => ES_MATRIZ.test(p.nombre))
      || impresoras.find((p) => /pos|tm-|term|ticket|receipt|80|58|xp-|epson|bixolon|star|3nstar|digital/i.test(p.nombre))
      || impresoras.find((p) => p.predeterminada);
    if (pred) {
      borrador.impresora.nombre = pred.nombre;
      if (ES_MATRIZ.test(pred.nombre)) Object.assign(borrador.impresora, { tipo: 'matriz', papel: 70 });
    }
  }
  let paso = 0;
  let pin = '';
  const raiz = $('#asistente');
  raiz.classList.remove('oculto');
  raiz.innerHTML = `
    <aside class="asistente-lado">
      <div class="asistente-logo"><img src="../../recursos/logo-color.png" alt="La Carpa"></div>
      <h1>Sorteo La Carpa</h1>
      <p>Tickets para el sorteo, uno por cada compra completa, y el sorteo en pantalla.</p>
      <ol class="pasos">${PASOS.map((s, i) => `<li data-i="${i}"><b>${i + 1}</b>${s.titulo}</li>`).join('')}</ol>
    </aside>
    <div class="asistente-cuerpo"><div id="pasoCuerpo"></div>
      <div class="asistente-pie">
        <button class="boton boton-claro" id="atras">${icono('atras')} Atrás</button>
        <button class="boton" id="siguiente">Siguiente ${icono('flecha')}</button>
      </div>
    </div>`;

  const cuerpo = $('#pasoCuerpo');
  const guardarPaso = () => {
    const f = leerFormulario(cuerpo);
    for (const [k, v] of Object.entries(f)) borrador[k] = typeof v === 'object' && !Array.isArray(v) ? { ...borrador[k], ...v } : v;
  };

  const pintar = () => {
    $$('.pasos li', raiz).forEach((li, i) => { li.className = i < paso ? 'hecho' : i === paso ? 'actual' : ''; });
    const s = PASOS[paso];
    let html = '';
    if (paso === 0) html = Formularios.tienda(borrador);
    if (paso === 1) html = Formularios.sorteo(borrador) + Formularios.ticket(borrador);
    if (paso === 2) html = `<div class="paso-grid"><div>${Formularios.impresora(borrador, impresoras)}</div><div class="config-previa"><iframe id="previaAsistente" title="Vista previa"></iframe></div></div>`;
    if (paso === 3) html = Formularios.cajeros(borrador) + Formularios.pinNuevo(true);
    if (paso === 4) {
      html = `${Formularios.respaldos({ ...borrador, carpetaRespaldos: estado.ajustes.carpetaRespaldos })}
        <h3 style="margin:28px 0 12px">Resumen</h3>
        <div class="resumen-final">
          <div><span>Sorteo</span><b>${esc(borrador.sorteo.nombre)}</b></div>
          <div><span>Un ticket por cada</span><b>${lempiras(borrador.sorteo.montoTicket)}</b></div>
          <div><span>Impresora</span><b>${esc(borrador.impresora.nombre || 'Sin escoger')}</b></div>
          <div><span>Papel</span><b>${borrador.impresora.papel} mm · ${borrador.impresora.tipo === 'matriz' ? 'matriz de puntos' : 'térmica'}</b></div>
          <div><span>Premios</span><b>${borrador.sorteo.cantidadPremios}${borrador.sorteo.premios.length ? ` (${borrador.sorteo.premios.length} con nombre)` : ''}</b></div>
          <div><span>Cajeros</span><b>${esc(borrador.cajeros.join(', ') || 'Ninguno')}</b></div>
        </div>`;
    }
    cuerpo.innerHTML = `<div class="asistente-paso"><div class="num-paso">Paso ${paso + 1} de ${PASOS.length}</div><h2>${s.h}</h2><p>${s.p}</p><form>${html}</form></div>`;
    $('form', cuerpo).addEventListener('submit', (e) => e.preventDefault());
    pintarIconos(cuerpo);
    Formularios.enganchar(cuerpo);
    $('#atras').style.visibility = paso === 0 ? 'hidden' : 'visible';
    $('#siguiente').innerHTML = paso === PASOS.length - 1 ? `${icono('ok')} Terminar` : `Siguiente ${icono('flecha')}`;
    if (paso === 3 && pin) { $('input[name="_pin"]', cuerpo).value = pin; $('input[name="_pin2"]', cuerpo).value = pin; }
    cuerpo.onchange = null;
    if (paso === 2) {
      const previa = () => { guardarPaso(); mostrarPrevia($('#previaAsistente'), borrador); };
      cuerpo.onchange = previa;
      previa();
    }
    $('input:not([type=hidden]):not([type=radio])', cuerpo)?.focus();
  };

  cuerpo.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (b) { guardarPaso(); await accionesComunes(b.dataset.accion, cuerpo, borrador); }
  });

  $('#atras').onclick = () => { guardarPaso(); if (paso === 3) pin = $('input[name="_pin"]', cuerpo).value; paso--; pintar(); };
  $('#siguiente').onclick = async () => {
    guardarPaso();
    if (paso === 1 && !(Number(borrador.sorteo.montoTicket) >= 1)) return aviso('Escriba el monto por ticket.', 'mal');
    if (paso === 1 && borrador.sorteo.premios.length > borrador.sorteo.cantidadPremios) {
      return aviso(`Hay ${borrador.sorteo.premios.length} nombres de premios pero el sorteo es de ${borrador.sorteo.cantidadPremios}. Quite nombres o suba la cantidad.`, 'mal');
    }
    if (paso === 2 && !borrador.impresora.nombre) {
      const ok = await confirmar('Sin impresora', 'No escogió impresora. Puede escogerla después en Configuración, pero sin ella no se imprimen tickets.', { boton: 'Seguir sin impresora' });
      if (!ok) return;
    }
    if (paso === 3) {
      const p = leerPinNuevo(cuerpo, true);
      if (p.error) return aviso(p.error, 'mal');
      pin = p.pin;
    }
    if (paso < PASOS.length - 1) { paso++; pintar(); return; }
    try {
      await api('configurarPrimeraVez', borrador, pin);
      raiz.classList.add('oculto');
      raiz.innerHTML = '';
      await refrescar();
      mostrarPrevia($('#previa'));
      aviso('¡Listo! Ya puede generar tickets.', 'ok');
      $('#cliente').focus();
    } catch (err) { aviso(err.message, 'mal'); }
  };
  pintar();
}

/* ---------------- Actualizaciones ---------------- */
let ultimaActualizacion = null;

function pintarActualizacion(e) {
  ultimaActualizacion = e;
  const aviso = $('#avisoActualizar');
  aviso.classList.toggle('oculto', !['descargando', 'lista'].includes(e.fase));
  aviso.classList.toggle('bajando', e.fase === 'descargando');
  if (e.fase === 'descargando') aviso.innerHTML = `${icono('reiniciar')} Descargando la versión ${esc(e.nueva)}… ${e.progreso || 0}%`;
  if (e.fase === 'lista') aviso.innerHTML = `${icono('ok')} Versión ${esc(e.nueva)} lista · Reiniciar y actualizar`;

  const caja = $('#estadoPrograma');
  if (!caja) return;
  const textos = {
    desactivada: 'Las actualizaciones automáticas funcionan en el programa instalado.',
    inactiva: 'Se buscan versiones nuevas al abrir el programa y cada 6 horas.',
    buscando: 'Buscando versiones nuevas…',
    'al-dia': 'Está al día: no hay versiones nuevas.',
    descargando: `Descargando la versión ${esc(e.nueva)} (${e.progreso || 0}%).`,
    lista: `La versión ${esc(e.nueva)} está lista. Se instala al reiniciar o la próxima vez que se cierre el programa.`,
    error: esc(e.error || 'No se pudo buscar.'),
  };
  caja.innerHTML = `Versión instalada: ${esc(e.actual)}<small>${textos[e.fase] || ''}</small>`;
  $('#botonInstalar')?.classList.toggle('oculto', e.fase !== 'lista');
}

async function instalarActualizacion() {
  const ok = await confirmar('Reiniciar y actualizar', `Se cerrará el programa, se instalará la versión <b>${esc(ultimaActualizacion?.nueva || '')}</b> y se volverá a abrir. Los tickets y la configuración no se tocan.`, { boton: 'Reiniciar ahora' });
  if (!ok) return;
  try { await api('instalarActualizacion'); } catch (err) { aviso(err.message, 'mal'); }
}

$('#avisoActualizar').addEventListener('click', () => { if (ultimaActualizacion?.fase === 'lista') instalarActualizacion(); });
window.carpa.alActualizar((e) => {
  const antes = ultimaActualizacion?.fase;
  pintarActualizacion(e);
  if (e.fase === 'lista' && antes !== 'lista') aviso(`La versión ${e.nueva} está lista. Pulse «Reiniciar y actualizar» arriba o se instalará al cerrar el programa.`, 'ok');
});

/* ---------------- Arranque ---------------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'F2') { irA('caja'); }
});

(async () => {
  pintarIconos();
  await refrescar();
  pintarActualizacion(await api('actualizacion'));
  if (!estado.ajustes.configurado) await asistente();
  else { mostrarPrevia($('#previa')); $('#cliente').focus(); }
})();
