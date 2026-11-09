'use strict';
// Arma el HTML de un ticket para impresora térmica (58 u 80 mm), solo en blanco y negro.
// Lo usan la impresión, la exportación a PDF de prueba y la vista previa de la pantalla.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RECURSOS = path.join(__dirname, '..', 'recursos');
const logos = {};
function logoBN(papel) {
  if (!logos[papel]) {
    const datos = fs.readFileSync(path.join(RECURSOS, `logo-bn-${papel}.png`)).toString('base64');
    logos[papel] = `data:image/png;base64,${datos}`;
  }
  return logos[papel];
}
const FUENTE = pathToFileURL(path.join(RECURSOS, 'fuentes', 'Montserrat.ttf')).href;

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function telefonoOculto(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 4 ? `****-${d.slice(-4)}` : '****';
}

function lempiras(n) {
  return `L. ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fechaHora(iso) {
  const f = new Date(iso);
  const dia = f.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  let h = f.getHours();
  const m = String(f.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12 || 12;
  return `${dia} ${h}:${m} ${ampm}`;
}

function fechaCorta(texto) {
  if (!texto) return '';
  const [a, m, d] = String(texto).split('-');
  if (!d) return texto;
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(d)} de ${meses[Number(m) - 1]} de ${a}`;
}

/**
 * @param {object} o
 * @param {object} o.ticket   fila de la base (codigo, cliente, telefono, monto, nota, cajero, creado, numero, total)
 * @param {object} o.ajustes  ajustes del programa
 * @param {boolean} [o.reimpresion]
 * @param {boolean} [o.prueba]  ticket de prueba de impresora
 */
// Medidas por ancho de rollo. «ancho» es la zona que de verdad imprime cada rollo (mm);
// el logo coincide con su PNG a 203 ppp. 70 mm es el formato de Bind en la Star SP700 (rollo de 70 o 76 mm).
const MEDIDAS = {
  80: { ancho: 72, base: 11.5, logo: 56, hueco: 2, caja: [13, 16], letra: 32, col: 21 },
  70: { ancho: 60, base: 10.6, logo: 48, hueco: 1.8, caja: [11.4, 14.4], letra: 28, col: 20 },
  58: { ancho: 48, base: 9.2, logo: 42, hueco: 1.4, caja: [9.6, 12], letra: 24, col: 16 },
};

function papelValido(v) {
  const n = Number(v);
  return n === 58 || n === 70 ? n : 80;
}

function htmlTicket({ ticket, ajustes, reimpresion = false, prueba = false }) {
  const papel = papelValido(ajustes.impresora?.papel);
  const m = MEDIDAS[papel];
  const ancho = m.ancho;
  const base = m.base; // tamaño de letra base en pt
  const logoAncho = m.logo;
  // Matriz de puntos (de cinta, como la Star SP700): nada de fondos negros llenos, que gastan cinta,
  // tardan mucho y salen manchados; todo con bordes y letra un poco más gruesa.
  const matriz = ajustes.impresora?.tipo === 'matriz';
  const t = ticket;
  const s = ajustes.sorteo || {};
  const tienda = ajustes.tienda || {};
  const pie = [tienda.direccion, tienda.telefono ? `Tel. ${tienda.telefono}` : ''].filter(Boolean).join(' · ');

  const filas = [
    ['Cliente', t.cliente],
    ['Teléfono', telefonoOculto(t.telefono)],
    ['Compra', lempiras(t.monto)],
    t.nota ? ['Nota', t.nota] : null,
    ['Fecha', fechaHora(t.creado)],
    t.cajero ? ['Cajero', t.cajero] : null,
  ].filter(Boolean);

  const letras = String(t.codigo).split('').map((l) => `<span>${esc(l)}</span>`).join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Ticket ${esc(t.codigo)}</title>
<style>
  @font-face { font-family: 'Montserrat'; src: url('${FUENTE}') format('truetype'); font-weight: 100 900; }
  @page { margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; color: #000; }
  body {
    width: ${papel}mm; font-family: 'Montserrat', 'Arial', sans-serif; font-size: ${base}pt; font-weight: 600;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; line-height: 1.25;
  }
  .ticket { width: ${ancho}mm; margin: 0 auto; padding: 2mm 0 4mm; text-align: center; }
  .logo { width: ${logoAncho}mm; display: block; margin: 0 auto 1.6mm; image-rendering: pixelated; }
  .banda {
    background: #000; color: #fff; font-weight: 900; text-transform: uppercase; letter-spacing: .08em;
    font-size: ${base * 1.18}pt; padding: 1.4mm 1mm; border-radius: 1.2mm; margin-top: 1mm;
  }
  .matriz .banda { background: #fff; color: #000; border: .8mm solid #000; border-radius: 0; padding: 1.2mm 1mm; }
  .fecha-sorteo { font-size: ${base * 0.88}pt; font-weight: 700; margin-top: 1mm; }
  .etiqueta { font-size: ${base * 0.82}pt; font-weight: 800; letter-spacing: .3em; text-transform: uppercase; margin-top: 2.6mm; }
  .codigo {
    display: flex; justify-content: center; gap: ${m.hueco}mm; margin: 1.2mm auto 0;
  }
  .codigo span {
    display: inline-flex; align-items: center; justify-content: center;
    width: ${m.caja[0]}mm; height: ${m.caja[1]}mm; border: .7mm solid #000; border-radius: 1.6mm;
    font-size: ${m.letra}pt; font-weight: 900; line-height: 1;
  }
  .matriz .codigo span { border-width: .6mm; border-radius: 0; }
  .num { font-size: ${base * 0.9}pt; font-weight: 800; margin-top: 1.6mm; }
  .linea { border-top: .45mm dashed #000; margin: 2.4mm 0; }
  table { width: 100%; border-collapse: collapse; text-align: left; }
  td { padding: .45mm 0; vertical-align: top; }
  td:first-child { font-weight: 600; width: ${m.col}mm; white-space: nowrap; }
  td:last-child { font-weight: 800; word-break: break-word; }
  .matriz td:first-child, .matriz .tienda { font-weight: 700; }
  .pie { font-size: ${base * 0.86}pt; font-weight: 700; margin-top: 1mm; }
  .tienda { font-size: ${base * 0.78}pt; font-weight: 600; margin-top: 1.4mm; }
  .aviso {
    border: .6mm solid #000; font-weight: 900; letter-spacing: .12em; padding: 1mm; margin-top: 2.2mm;
    font-size: ${base * 0.95}pt;
  }
</style></head>
<body><div class="ticket${matriz ? ' matriz' : ''}">
  <img class="logo" src="${logoBN(papel)}" alt="">
  <div class="banda">${esc(s.nombre || 'Gran Sorteo')}</div>
  ${s.fecha ? `<div class="fecha-sorteo">Sorteo: ${esc(fechaCorta(s.fecha))}</div>` : ''}
  ${Number(s.cantidadPremios) > 1 ? `<div class="fecha-sorteo">¡Se sortean ${Number(s.cantidadPremios)} premios!</div>` : ''}
  <div class="etiqueta">Su código</div>
  <div class="codigo">${letras}</div>
  <div class="num">Ticket ${t.numero} de ${t.total}</div>
  <div class="linea"></div>
  <table>${filas.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
  <div class="linea"></div>
  ${ajustes.pieTicket ? `<div class="pie">${esc(ajustes.pieTicket)}</div>` : ''}
  ${pie ? `<div class="tienda">${esc(pie)}</div>` : ''}
  ${reimpresion ? '<div class="aviso">REIMPRESIÓN</div>' : ''}
  ${prueba ? '<div class="aviso">PRUEBA DE IMPRESIÓN</div>' : ''}
</div></body></html>`;
}

function ticketDeEjemplo() {
  return {
    codigo: 'KXRT', cliente: 'María López', telefono: '98765678', monto: 1600, nota: 'Factura 3321',
    cajero: 'Ana', creado: new Date().toISOString(), numero: 2, total: 3,
  };
}

module.exports = { htmlTicket, ticketDeEjemplo, telefonoOculto, lempiras, fechaHora, papelValido };
