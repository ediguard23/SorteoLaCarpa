'use strict';
const { app, BrowserWindow, ipcMain, dialog, screen, shell, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Datos } = require('./datos');
const { htmlTicket, ticketDeEjemplo, telefonoOculto, fechaHora, papelValido } = require('./ticket');
const { crearXlsx } = require('./excel');
const { Actualizador } = require('./actualizador');

// Carpeta de datos propia (permite aislar las pruebas con SORTEO_DATOS).
if (process.env.SORTEO_DATOS) app.setPath('userData', process.env.SORTEO_DATOS);
else app.setPath('userData', path.join(app.getPath('appData'), 'Sorteo La Carpa'));

const PRUEBA = process.env.SORTEO_PRUEBA === '1';
if (!PRUEBA && !app.requestSingleInstanceLock()) {
  app.quit();
}

const RECURSOS = path.join(__dirname, '..', 'recursos');
const ICONO = path.join(RECURSOS, 'icono.png');
let datos;
let ventana;
let ventanaSorteo;
let cambiosRespaldados = -1;

function carpetaRespaldos() {
  const elegida = datos.ajustes().respaldos.carpeta;
  return elegida || path.join(app.getPath('documents'), 'Sorteo La Carpa', 'Respaldos');
}

function respaldar(motivo = 'auto') {
  if (!datos) return null;
  try {
    const carpeta = carpetaRespaldos();
    fs.mkdirSync(carpeta, { recursive: true });
    const f = new Date();
    const dos = (n) => String(n).padStart(2, '0');
    const sello = `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}_${dos(f.getHours())}-${dos(f.getMinutes())}-${dos(f.getSeconds())}`;
    let destino = path.join(carpeta, `sorteo-${sello}-${motivo}.db`);
    for (let n = 2; fs.existsSync(destino); n++) destino = path.join(carpeta, `sorteo-${sello}-${motivo}-${n}.db`);
    datos.respaldar(destino);
    cambiosRespaldados = datos.cambios;
    // Se guardan los 40 más recientes.
    const viejos = fs.readdirSync(carpeta).filter((f) => /^sorteo-.*\.db$/.test(f)).sort().reverse().slice(40);
    for (const f of viejos) fs.rmSync(path.join(carpeta, f), { force: true });
    return destino;
  } catch (e) {
    console.error('respaldo', e);
    return null;
  }
}

function ajustesPublicos() {
  const a = datos.ajustes();
  const { seguridad, ...resto } = a;
  return { ...resto, tienePin: Boolean(seguridad.hash), carpetaRespaldos: carpetaRespaldos() };
}

function exigirPin(pin) {
  if (!datos.pinCorrecto(pin)) throw new Error('PIN incorrecto.');
}

// ---------- Impresión ----------
async function ventanaTicket(html) {
  const archivo = path.join(os.tmpdir(), `sorteo-la-carpa-ticket-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(archivo, html, 'utf8');
  const w = new BrowserWindow({ show: false, width: 420, height: 900, webPreferences: { offscreen: false, sandbox: true } });
  await w.loadFile(archivo);
  await w.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))))');
  const altoPx = await w.webContents.executeJavaScript('Math.ceil(document.querySelector(".ticket").getBoundingClientRect().height)');
  return { w, archivo, altoMm: Math.ceil((altoPx * 25.4) / 96) + 2 };
}

async function imprimirHtml(html, impresora) {
  const papel = papelValido(impresora.papel);
  // En las pruebas automáticas cada «impresión» se guarda como PDF en esta carpeta.
  if (process.env.SORTEO_IMPRIMIR_A) {
    const pdf = await pdfHtml(html, papel);
    fs.mkdirSync(process.env.SORTEO_IMPRIMIR_A, { recursive: true });
    const n = fs.readdirSync(process.env.SORTEO_IMPRIMIR_A).length + 1;
    const codigo = (html.match(/<title>Ticket (\w+)<\/title>/) || [])[1] || 'x';
    fs.writeFileSync(path.join(process.env.SORTEO_IMPRIMIR_A, `${String(n).padStart(3, '0')}-${codigo}.pdf`), pdf);
    return;
  }
  const { w, archivo, altoMm } = await ventanaTicket(html);
  try {
    await new Promise((resolve, reject) => {
      w.webContents.print({
        silent: true,
        deviceName: impresora.nombre || '',
        printBackground: true,
        color: false,
        margins: { marginType: 'none' },
        pageSize: { width: papel * 1000, height: Math.max(altoMm, 60) * 1000 },
        copies: 1,
      }, (ok, motivo) => (ok ? resolve() : reject(new Error(motivo === 'cancelled' ? 'Impresión cancelada.' : `La impresora no respondió (${motivo || 'error'}).`))));
    });
  } finally {
    w.destroy();
    fs.rm(archivo, { force: true }, () => {});
  }
}

async function pdfHtml(html, papel) {
  const { w, archivo, altoMm } = await ventanaTicket(html);
  try {
    return await w.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: { width: papel / 25.4, height: Math.max(altoMm, 60) / 25.4 },
    });
  } finally {
    w.destroy();
    fs.rm(archivo, { force: true }, () => {});
  }
}

async function imprimirTicket(t, { reimpresion = false } = {}) {
  const a = datos.ajustes();
  if (!a.impresora.nombre) throw new Error('No hay impresora elegida. Escójala en Configuración.');
  await imprimirHtml(htmlTicket({ ticket: t, ajustes: a, reimpresion }), a.impresora);
  datos.marcarImpreso(t.id);
}

// ---------- Funciones que llama la pantalla ----------
const api = {
  estado() {
    return { ajustes: ajustesPublicos(), resumen: datos.resumen(), premio: datos.premioSiguiente(), version: app.getVersion() };
  },

  async impresoras() {
    const lista = await ventana.webContents.getPrintersAsync();
    return lista.map((p) => ({ nombre: p.name, descripcion: p.displayName || p.name, predeterminada: Boolean(p.isDefault) }));
  },

  configurarPrimeraVez(ajustes, pin) {
    if (datos.ajustes().configurado) throw new Error('El programa ya está configurado.');
    if (!/^\d{4,8}$/.test(String(pin || ''))) throw new Error('El PIN debe tener de 4 a 8 números.');
    datos.guardarAjustes({ ...limpiarAjustes(ajustes), configurado: true });
    datos.ponerPin(pin);
    respaldar('configuracion');
    return ajustesPublicos();
  },

  verificarPin(pin) {
    return datos.pinCorrecto(pin);
  },

  guardarAjustes(pin, ajustes, pinNuevo) {
    exigirPin(pin);
    datos.guardarAjustes(limpiarAjustes(ajustes));
    if (pinNuevo) {
      if (!/^\d{4,8}$/.test(String(pinNuevo))) throw new Error('El PIN nuevo debe tener de 4 a 8 números.');
      datos.ponerPin(pinNuevo);
    }
    return ajustesPublicos();
  },

  calcularTickets(monto) {
    return datos.ticketsPorMonto(monto);
  },

  async generar(compra) {
    const tickets = datos.crearCompra(compra);
    const errores = [];
    for (const t of tickets) {
      try {
        await imprimirTicket(t);
      } catch (e) {
        errores.push(e.message);
        break; // si la impresora falló, no tiene sentido seguir mandando
      }
    }
    if (datos.cambios - cambiosRespaldados >= 25) respaldar();
    return {
      tickets: tickets.map((t) => ({ id: t.id, codigo: t.codigo, numero: t.numero, total: t.total })),
      impresos: errores.length ? tickets.findIndex((t) => datos.ticket(t.id).impresiones === 0) : tickets.length,
      error: errores[0] || null,
    };
  },

  async imprimir(id, pin) {
    const t = datos.ticket(id);
    if (!t) throw new Error('Ese ticket no existe.');
    if (t.anulado) throw new Error('Ese ticket está anulado.');
    // La primera impresión (si falló al generarlo) no pide PIN ni sale como reimpresión.
    if (t.impresiones > 0) exigirPin(pin);
    await imprimirTicket(t, { reimpresion: t.impresiones > 0 });
    return true;
  },

  anular(id, pin, motivo) {
    exigirPin(pin);
    datos.anular(id, motivo);
    return true;
  },

  buscar(filtro) {
    return datos.buscar(filtro);
  },

  ganadores() {
    return datos.ganadores();
  },

  vistaPrevia(ajustes) {
    const a = ajustes ? { ...datos.ajustes(), ...limpiarAjustes(ajustes) } : datos.ajustes();
    return htmlTicket({ ticket: ticketDeEjemplo(), ajustes: a });
  },

  async imprimirPrueba(impresora, ajustes) {
    if (!impresora?.nombre) throw new Error('Escoja una impresora.');
    const a = { ...datos.ajustes(), ...(ajustes ? limpiarAjustes(ajustes) : {}), impresora };
    await imprimirHtml(htmlTicket({ ticket: ticketDeEjemplo(), ajustes: a, prueba: true }), impresora);
    return true;
  },

  async exportarExcel() {
    const a = datos.ajustes();
    const sello = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(ventana, {
      title: 'Exportar participantes',
      defaultPath: path.join(app.getPath('documents'), `Sorteo La Carpa - ${a.sorteo.nombre.replace(/[\\/:*?"<>|]/g, '')} - ${sello}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, libroExcel());
    shell.showItemInFolder(r.filePath);
    return r.filePath;
  },

  respaldarAhora() {
    const ruta = respaldar('manual');
    if (!ruta) throw new Error('No se pudo hacer la copia. Revise la carpeta de respaldos.');
    return ruta;
  },

  abrirRespaldos() {
    const c = carpetaRespaldos();
    fs.mkdirSync(c, { recursive: true });
    shell.openPath(c);
  },

  async elegirCarpeta() {
    const r = await dialog.showOpenDialog(ventana, { title: 'Carpeta para las copias de seguridad', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },

  nuevoSorteo(pin, sorteo) {
    exigirPin(pin);
    respaldar('antes-de-nuevo-sorteo');
    datos.nuevoSorteo(limpiarAjustes({ sorteo }).sorteo);
    return ajustesPublicos();
  },

  abrirSorteo(pin) {
    exigirPin(pin);
    abrirVentanaSorteo();
    return true;
  },

  // --- Pantalla del sorteo ---
  datosSorteo() {
    const a = datos.ajustes();
    return {
      ajustes: { tienda: a.tienda, sorteo: a.sorteo, sonido: a.sonido },
      participantes: datos.participantes().map((t) => t.codigo),
      premio: datos.premioSiguiente(),
      ganadores: datos.ganadores().map(ganadorPantalla),
    };
  },

  sortear() {
    const r = datos.sortear();
    respaldar('sorteo');
    return { ganador: ganadorPantalla(r.ganador), participantes: r.participantes };
  },

  descartarGanador(id) {
    datos.descartarGanador(id);
    respaldar('sorteo');
    return true;
  },

  cerrarSorteo() {
    if (ventanaSorteo && !ventanaSorteo.isDestroyed()) ventanaSorteo.close();
  },

  pantallaCompleta() {
    if (ventanaSorteo && !ventanaSorteo.isDestroyed()) ventanaSorteo.setFullScreen(!ventanaSorteo.isFullScreen());
  },

  // --- Actualizaciones ---
  actualizacion() {
    return actualizador.obtener();
  },

  buscarActualizacion() {
    return actualizador.buscar();
  },

  instalarActualizacion() {
    respaldar('antes-de-actualizar');
    actualizador.instalar();
    return true;
  },
};

const actualizador = new Actualizador((estado) => {
  if (ventana && !ventana.isDestroyed()) ventana.webContents.send('actualizacion', estado);
});

function ganadorPantalla(g) {
  return {
    id: g.id, premioNum: g.premio_num, premio: g.premio, codigo: g.codigo, cliente: g.cliente,
    telefono: telefonoOculto(g.telefono), compra: fechaHora(g.creado), descartado: Boolean(g.descartado),
  };
}

function limpiarAjustes(a = {}) {
  const r = {};
  if (a.tienda) {
    r.tienda = {};
    for (const k of ['nombre', 'eslogan', 'direccion', 'telefono']) if (k in a.tienda) r.tienda[k] = String(a.tienda[k] || '').trim().slice(0, 120);
  }
  if (a.sorteo) {
    r.sorteo = {};
    if ('nombre' in a.sorteo) r.sorteo.nombre = String(a.sorteo.nombre || '').trim().slice(0, 60) || 'Gran Sorteo';
    if ('fecha' in a.sorteo) r.sorteo.fecha = /^\d{4}-\d{2}-\d{2}$/.test(a.sorteo.fecha || '') ? a.sorteo.fecha : '';
    if ('montoTicket' in a.sorteo) {
      const m = Number(a.sorteo.montoTicket);
      if (!(m >= 1 && m <= 1000000)) throw new Error('El monto por ticket no es válido.');
      r.sorteo.montoTicket = Math.round(m * 100) / 100;
    }
    if ('premios' in a.sorteo) r.sorteo.premios = (a.sorteo.premios || []).map((p) => String(p || '').trim().slice(0, 80)).filter(Boolean).slice(0, 50);
    if ('cantidadPremios' in a.sorteo) {
      const c = Number(a.sorteo.cantidadPremios);
      if (!(Number.isInteger(c) && c >= 1 && c <= 50)) throw new Error('La cantidad de premios debe ser un número entero de 1 a 50.');
      r.sorteo.cantidadPremios = c;
      if (r.sorteo.premios && r.sorteo.premios.length > c) {
        throw new Error(`Hay ${r.sorteo.premios.length} nombres de premios pero el sorteo es de ${c}. Quite nombres o suba la cantidad.`);
      }
    }
  }
  if ('pieTicket' in a) r.pieTicket = String(a.pieTicket || '').trim().slice(0, 200);
  if (a.impresora) {
    r.impresora = { nombre: String(a.impresora.nombre || ''), papel: papelValido(a.impresora.papel), tipo: a.impresora.tipo === 'matriz' ? 'matriz' : 'termica' };
  }
  if (a.cajeros) r.cajeros = [...new Set(a.cajeros.map((c) => String(c || '').trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
  if (a.respaldos) r.respaldos = { carpeta: String(a.respaldos.carpeta || '') };
  if ('sonido' in a) r.sonido = Boolean(a.sonido);
  return r;
}

function libroExcel() {
  const filas = datos.todos();
  const ganadores = datos.ganadores();
  const a = datos.ajustes();
  const f = (iso) => (iso ? new Date(iso).toLocaleString('es-HN') : '');
  return crearXlsx([
    {
      nombre: 'Tickets',
      columnas: [
        { titulo: 'Código', ancho: 10 }, { titulo: 'Cliente', ancho: 28 }, { titulo: 'Teléfono', ancho: 12 },
        { titulo: 'Monto compra', ancho: 14, dinero: true }, { titulo: 'Ticket', ancho: 9 }, { titulo: 'Nota', ancho: 24 },
        { titulo: 'Fecha', ancho: 20 }, { titulo: 'Cajero', ancho: 14 }, { titulo: 'Impresiones', ancho: 11 },
        { titulo: 'Estado', ancho: 12 }, { titulo: 'Motivo anulado', ancho: 24 },
      ],
      filas: filas.map((t) => [
        t.codigo, t.cliente, `${t.telefono.slice(0, 4)}-${t.telefono.slice(4)}`, t.monto, `${t.numero} de ${t.total}`, t.nota,
        f(t.creado), t.cajero, t.impresiones, t.anulado ? 'Anulado' : 'Válido', t.motivo_anulado,
      ]),
    },
    {
      nombre: 'Ganadores',
      columnas: [
        { titulo: 'Premio nº', ancho: 10 }, { titulo: 'Premio', ancho: 24 }, { titulo: 'Código', ancho: 10 },
        { titulo: 'Cliente', ancho: 28 }, { titulo: 'Teléfono', ancho: 12 }, { titulo: 'Sorteado', ancho: 20 }, { titulo: 'Estado', ancho: 16 },
      ],
      filas: ganadores.map((g) => [
        g.premio_num, g.premio, g.codigo, g.cliente, `${g.telefono.slice(0, 4)}-${g.telefono.slice(4)}`, f(g.sorteado),
        g.descartado ? 'No se presentó' : 'Ganador',
      ]),
    },
    {
      nombre: 'Resumen',
      columnas: [{ titulo: 'Dato', ancho: 26 }, { titulo: 'Valor', ancho: 30 }],
      filas: (() => {
        const r = datos.resumen();
        return [
          ['Sorteo', a.sorteo.nombre], ['Fecha del sorteo', a.sorteo.fecha], ['Monto por ticket', a.sorteo.montoTicket], ['Cantidad de premios', datos.premioSiguiente().total],
          ['Tickets válidos', r.validos], ['Tickets anulados', r.anulados], ['Clientes', r.clientes], ['Compras', r.compras],
          ['Monto total de compras', r.montoCompras], ['Exportado', new Date().toLocaleString('es-HN')],
        ];
      })(),
    },
  ]);
}

// ---------- Ventanas ----------
function crearVentana() {
  ventana = new BrowserWindow({
    width: 1320, height: 860, minWidth: 1060, minHeight: 700, show: false, icon: ICONO,
    title: 'Sorteo La Carpa', backgroundColor: '#fff8ef', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true },
  });
  ventana.removeMenu();
  ventana.loadFile(path.join(__dirname, 'ventanas', 'principal.html'));
  ventana.once('ready-to-show', () => {
    if (!PRUEBA) ventana.maximize();
    ventana.show();
    // Para comprobar el programa ya instalado: guarda una captura de la pantalla y una impresión en PDF.
    if (process.env.SORTEO_CAPTURA) {
      setTimeout(async () => {
        const img = await ventana.webContents.capturePage();
        fs.writeFileSync(process.env.SORTEO_CAPTURA, img.toPNG());
        const pdf = await pdfHtml(htmlTicket({ ticket: ticketDeEjemplo(), ajustes: datos.ajustes() }), 80);
        fs.writeFileSync(process.env.SORTEO_CAPTURA.replace(/\.png$/, '.pdf'), pdf);
      }, 2500);
    }
  });
  ventana.on('closed', () => {
    ventana = null;
    if (ventanaSorteo && !ventanaSorteo.isDestroyed()) ventanaSorteo.close();
  });
  bloquearNavegacion(ventana);
}

function abrirVentanaSorteo() {
  if (ventanaSorteo && !ventanaSorteo.isDestroyed()) {
    ventanaSorteo.focus();
    return;
  }
  // Si hay una tele o proyector conectado, la pantalla del sorteo se abre ahí.
  const principal = screen.getPrimaryDisplay();
  const externa = screen.getAllDisplays().find((d) => d.id !== principal.id);
  const destino = externa || principal;
  ventanaSorteo = new BrowserWindow({
    x: destino.bounds.x + 40, y: destino.bounds.y + 40, width: Math.min(1600, destino.workArea.width - 80),
    height: Math.min(900, destino.workArea.height - 80), icon: ICONO, title: 'Sorteo La Carpa — Sorteo',
    backgroundColor: '#ff9500', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  ventanaSorteo.removeMenu();
  ventanaSorteo.loadFile(path.join(__dirname, 'ventanas', 'sorteo.html'));
  ventanaSorteo.once('ready-to-show', () => {
    ventanaSorteo.show();
    if (!PRUEBA) ventanaSorteo.setFullScreen(true);
  });
  ventanaSorteo.on('closed', () => {
    ventanaSorteo = null;
    if (ventana && !ventana.isDestroyed()) ventana.webContents.send('sorteo-cerrado');
  });
  bloquearNavegacion(ventanaSorteo);
}

function bloquearNavegacion(w) {
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

ipcMain.handle('api', async (_e, metodo, ...args) => {
  if (!Object.hasOwn(api, metodo)) throw new Error(`Función desconocida: ${metodo}`);
  try {
    return { ok: true, valor: await api[metodo](...args) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
});

app.on('second-instance', () => {
  if (ventana) {
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  datos = new Datos(path.join(app.getPath('userData'), 'sorteo.db'));
  if (datos.ajustes().configurado) respaldar('inicio');
  crearVentana();
  actualizador.iniciar();
  // Copia automática cada 10 minutos si hubo cambios.
  setInterval(() => { if (datos.cambios !== cambiosRespaldados) respaldar(); }, 10 * 60 * 1000).unref();
});

app.on('before-quit', () => {
  if (datos && datos.ajustes().configurado && datos.cambios !== cambiosRespaldados && datos.cambios > 0) respaldar('cierre');
});

app.on('window-all-closed', () => {
  if (datos) datos.cerrar();
  app.quit();
});

module.exports = { api, imprimirHtml, pdfHtml, libroExcel, getDatos: () => datos };
