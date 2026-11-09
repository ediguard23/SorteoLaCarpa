'use strict';
// Prueba completa del programa, con datos aparte (no toca los datos reales):
//   asistente → caja (imprime a PDF) → 1000 tickets → búsqueda → reimpresión/anulación → Excel → sorteo animado.
// Deja capturas, PDFs y el Excel en %LOCALAPPDATA%\SorteoLaCarpa-pruebas. Uso: npm run probar
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const raiz = path.join(__dirname, '..');
const salida = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'SorteoLaCarpa-pruebas');
fs.rmSync(salida, { recursive: true, force: true });
fs.mkdirSync(salida, { recursive: true });
const datosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sorteo-prueba-'));
process.env.SORTEO_DATOS = datosDir;
process.env.SORTEO_PRUEBA = '1';
process.env.SORTEO_IMPRIMIR_A = path.join(salida, 'impresos');

const { app, BrowserWindow } = require('electron');
const principal = require('../src/main.js');
const { ALFABETO, PROHIBIDAS } = require('../src/datos');
const { htmlTicket } = require('../src/ticket');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const fallos = [];
const bien = [];
function comprobar(cond, texto) {
  (cond ? bien : fallos).push(texto);
  console.log(`${cond ? '  OK ' : 'FALLA'} ${texto}`);
}

async function captura(w, nombre) {
  await esperar(250);
  const img = await w.webContents.capturePage();
  fs.writeFileSync(path.join(salida, `${nombre}.png`), img.toPNG());
}

const js = (w, codigo) => w.webContents.executeJavaScript(`(async () => { ${codigo} })()`);

async function esperarQue(w, condicion, ms = 8000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await js(w, `return Boolean(${condicion});`)) return true;
    await esperar(100);
  }
  throw new Error(`No se cumplió: ${condicion}`);
}

app.whenReady().then(async () => {
  try {
    await esperar(300);
    const w = BrowserWindow.getAllWindows()[0];
    if (w.webContents.isLoading()) await new Promise((r) => w.webContents.once('did-finish-load', r));
    w.setSize(1366, 860);
    const datos = principal.getDatos();

    // ---------- Asistente ----------
    await esperarQue(w, "document.querySelector('#asistente:not(.oculto) .asistente-paso')");
    await captura(w, '01-asistente-tienda');
    await js(w, `
      document.querySelector('[name="tienda.direccion"]').value = 'Barrio El Centro, Tegucigalpa';
      document.querySelector('[name="tienda.telefono"]').value = '2222-3333';
      document.querySelector('#siguiente').click();`);
    await esperarQue(w, "document.querySelector('[name=\"sorteo.nombre\"]')");
    await js(w, `
      document.querySelector('[name="sorteo.nombre"]').value = 'Gran Sorteo Navideño';
      document.querySelector('[name="sorteo.fecha"]').value = '2026-12-24';
      document.querySelector('[data-contar="1"]').click(); document.querySelector('[data-contar="1"]').click();
      const ed = document.querySelector('[data-fichas="sorteo.premios"]');
      for (const p of ['Televisor 50 pulgadas', 'Refrigeradora', 'Bicicleta']) { ed.querySelector('.agregar input').value = p; ed.querySelector('.agregar button').click(); }`);
    await captura(w, '02-asistente-sorteo');
    await js(w, "document.querySelector('#siguiente').click();");
    await esperarQue(w, "document.querySelector('#previaAsistente')");
    await esperar(800);
    await captura(w, '03-asistente-impresora');
    const impresoraElegida = await js(w, "const r = document.querySelector('[name=\"impresora.nombre\"]'); if (r && !document.querySelector('[name=\"impresora.nombre\"]:checked')) r.checked = true; return document.querySelector('[name=\"impresora.nombre\"]:checked')?.value || '';");
    await js(w, "document.querySelector('#siguiente').click();");
    await esperar(300);
    if (!impresoraElegida) await js(w, "document.querySelector('#modal [data-si]')?.click();");
    await esperarQue(w, "document.querySelector('[name=\"_pin\"]')");
    await js(w, `
      const ed = document.querySelector('[data-fichas="cajeros"]');
      for (const c of ['Ana', 'Luis']) { ed.querySelector('.agregar input').value = c; ed.querySelector('.agregar button').click(); }
      document.querySelector('[name="_pin"]').value = '1234';
      document.querySelector('[name="_pin2"]').value = '1234';`);
    await captura(w, '04-asistente-cajeros');
    await js(w, "document.querySelector('#siguiente').click();");
    await esperarQue(w, "document.querySelector('.resumen-final')");
    // Respaldos a una carpeta de la prueba.
    await js(w, `document.querySelector('[name="respaldos.carpeta"]').value = ${JSON.stringify(path.join(datosDir, 'respaldos'))};`);
    await captura(w, '05-asistente-resumen');
    await js(w, "document.querySelector('#siguiente').click();");
    await esperarQue(w, "document.querySelector('#asistente').classList.contains('oculto')");
    const a = datos.ajustes();
    comprobar(a.configurado && a.sorteo.nombre === 'Gran Sorteo Navideño', 'el asistente guarda la configuración');
    comprobar(a.sorteo.cantidadPremios === 3 && a.sorteo.premios.length === 3 && a.cajeros.join() === 'Ana,Luis', 'cantidad de premios (3), nombres y cajeros guardados');
    let errPremios = '';
    try { principal.api.guardarAjustes('1234', { sorteo: { cantidadPremios: 2, premios: ['a', 'b', 'c'] } }); } catch (e) { errPremios = e.message; }
    comprobar(/3 nombres de premios/.test(errPremios), 'no deja guardar más nombres que premios');
    comprobar(datos.pinCorrecto('1234') && !datos.pinCorrecto('9999'), 'el PIN funciona y rechaza uno malo');
    if (!a.impresora.nombre) datos.guardarAjustes({ impresora: { nombre: 'Impresora de prueba', papel: 80 } });

    // ---------- Caja ----------
    await esperar(600);
    await captura(w, '06-caja-vacia');
    await js(w, `
      const poner = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      poner('cliente', 'María López'); poner('telefono', '98765678'); poner('monto', '1,600'); poner('nota', 'Factura 3321');`);
    const calculo = await js(w, "return document.querySelector('#cantTickets').textContent + ' | ' + document.querySelector('#faltan').textContent;");
    comprobar(calculo.startsWith('3 |') && calculo.includes('400.00'), `cálculo en pantalla: ${calculo}`);
    await captura(w, '07-caja-calculo');
    await js(w, "document.querySelector('#formCaja').requestSubmit();");
    await esperarQue(w, "!document.querySelector('#resultado').classList.contains('oculto')", 20000);
    await esperar(400);
    await captura(w, '08-caja-impreso');
    const impresos = fs.readdirSync(process.env.SORTEO_IMPRIMIR_A);
    comprobar(impresos.length === 3, `la compra de L. 1,600 imprime 3 tickets separados (${impresos.join(', ')})`);
    const deMaria = datos.buscar({ texto: 'María' }).filas;
    comprobar(deMaria.length === 3 && deMaria.every((t) => t.impresiones === 1 && t.total === 3), 'quedan 3 tickets guardados e impresos');

    // Monto que no alcanza.
    let error = '';
    try { datos.crearCompra({ cliente: 'Pedro', telefono: '33334444', monto: 499.99 }); } catch (e) { error = e.message; }
    comprobar(/no alcanza/.test(error), 'L. 499.99 no da ticket');
    comprobar(datos.ticketsPorMonto(500) === 1 && datos.ticketsPorMonto(999.99) === 1 && datos.ticketsPorMonto(1000) === 2, '500 → 1, 999.99 → 1, 1000 → 2');

    // ---------- 1000 tickets ----------
    const nombres = ['José', 'María', 'Carlos', 'Ana', 'Luis', 'Sofía', 'Miguel', 'Daniela', 'Jorge', 'Karla', 'Óscar', 'Fátima', 'Ramón', 'Iris', 'Héctor', 'Glenda'];
    const apellidos = ['Hernández', 'López', 'Martínez', 'Rodríguez', 'Flores', 'Mejía', 'Castro', 'Zelaya', 'Reyes', 'Núñez', 'Aguilar', 'Pineda'];
    const t0 = Date.now();
    let total = datos.resumen().tickets;
    let i = 0;
    while (total < 1000) {
      const monto = 500 * (1 + Math.floor(Math.random() * 4)) + Math.floor(Math.random() * 499);
      const creados = datos.crearCompra({
        cliente: `${nombres[i % nombres.length]} ${apellidos[(i * 7) % apellidos.length]}`,
        telefono: `9${String(1000000 + i * 37).slice(-7)}`, monto, nota: i % 3 ? '' : `Factura ${4000 + i}`, cajero: i % 2 ? 'Ana' : 'Luis',
      });
      total += creados.length;
      i++;
    }
    const todos = datos.todos();
    const codigos = todos.map((t) => t.codigo);
    comprobar(todos.length >= 1000, `${todos.length} tickets creados en ${Date.now() - t0} ms`);
    comprobar(new Set(codigos).size === codigos.length, 'ningún código repetido');
    comprobar(codigos.every((c) => c.length === 4 && [...c].every((l) => ALFABETO.includes(l))), 'todos los códigos son 4 letras sin O, I, Q ni Ñ');
    comprobar(codigos.every((c) => !PROHIBIDAS.has(c)), 'ningún código es una palabra fea');
    const porCompra = {};
    for (const t of todos) porCompra[t.compra_id] = (porCompra[t.compra_id] || []).concat(t);
    comprobar(Object.values(porCompra).every((l) => l.length === Math.floor(l[0].monto / 500) && l.every((t) => t.total === l.length)), 'cada compra tiene un ticket por cada L. 500');

    // ---------- Participantes ----------
    await js(w, "document.querySelector('[data-vista=\"participantes\"]').click();");
    await esperarQue(w, "document.querySelectorAll('#tablaTickets tr').length > 0");
    await esperar(300);
    await captura(w, '09-participantes');
    const cod = deMaria[0].codigo;
    await js(w, `const b = document.querySelector('#buscar'); b.value = '${cod}'; b.dispatchEvent(new Event('input'));`);
    await esperar(700);
    const filas = await js(w, "return [...document.querySelectorAll('#tablaTickets tr .cod')].map(e => e.textContent);");
    comprobar(filas.includes(cod), `la búsqueda por código ${cod} lo encuentra`);
    await js(w, "const b = document.querySelector('#buscar'); b.value = '9876-5678'; b.dispatchEvent(new Event('input'));");
    await esperar(700);
    const porTel = await js(w, "return document.querySelectorAll('#tablaTickets tr').length;");
    comprobar(porTel === 3, `la búsqueda por teléfono con guion encuentra los 3 tickets (${porTel})`);

    // Reimprimir y anular por la API (con PIN).
    const r1 = await principal.api.imprimir(deMaria[0].id, '1234');
    comprobar(r1 === true && datos.ticket(deMaria[0].id).impresiones === 2, 'reimpresión con PIN');
    let sinPin = '';
    try { await principal.api.imprimir(deMaria[0].id, '0000'); } catch (e) { sinPin = e.message; }
    comprobar(sinPin === 'PIN incorrecto.', 'reimprimir con PIN malo se rechaza');
    const ultimoImpreso = fs.readdirSync(process.env.SORTEO_IMPRIMIR_A).sort().pop();
    comprobar(fs.readdirSync(process.env.SORTEO_IMPRIMIR_A).length === 4, `la reimpresión sale (${ultimoImpreso})`);
    principal.api.anular(deMaria[2].id, '1234', 'Prueba de anulación');
    comprobar(!datos.participantes().some((t) => t.id === deMaria[2].id), 'un ticket anulado no participa');

    // ---------- Tickets en PDF y PNG (80 y 58 mm) ----------
    for (const papel of [80, 70, 58]) {
      const aj = { ...datos.ajustes(), impresora: { nombre: 'x', papel, tipo: papel === 70 ? 'matriz' : 'termica' } };
      const t = datos.ticket(deMaria[1].id);
      fs.writeFileSync(path.join(salida, `ticket-${papel}mm.pdf`), await principal.pdfHtml(htmlTicket({ ticket: t, ajustes: aj }), papel));
      fs.writeFileSync(path.join(salida, `ticket-${papel}mm-reimpresion.pdf`), await principal.pdfHtml(htmlTicket({ ticket: t, ajustes: aj, reimpresion: true }), papel));
      const vt = new BrowserWindow({ show: false, width: Math.round((papel * 96) / 25.4), height: 1000 });
      const archivo = path.join(os.tmpdir(), `ticket-prueba-${papel}.html`);
      fs.writeFileSync(archivo, htmlTicket({ ticket: t, ajustes: aj }));
      await vt.loadFile(archivo);
      await vt.webContents.executeJavaScript('document.fonts.ready');
      const alto = await vt.webContents.executeJavaScript('Math.ceil(document.querySelector(".ticket").getBoundingClientRect().height)');
      vt.setContentSize(Math.round((papel * 96) / 25.4), alto + 4);
      await esperar(300);
      fs.writeFileSync(path.join(salida, `ticket-${papel}mm.png`), (await vt.webContents.capturePage()).toPNG());
      vt.destroy();
    }
    comprobar(fs.statSync(path.join(salida, 'ticket-80mm.pdf')).size > 2000, 'PDF del ticket de 80 mm');
    comprobar(fs.statSync(path.join(salida, 'ticket-58mm.pdf')).size > 2000, 'PDF del ticket de 58 mm');
    comprobar(fs.statSync(path.join(salida, 'ticket-70mm.pdf')).size > 2000, 'PDF del ticket de 70 mm para la Star SP700 (matriz de puntos)');

    // ---------- Excel ----------
    const xlsx = principal.libroExcel();
    fs.writeFileSync(path.join(salida, 'participantes.xlsx'), xlsx);
    comprobar(xlsx.length > 10000 && xlsx.readUInt32LE(0) === 0x04034b50, `Excel exportado (${Math.round(xlsx.length / 1024)} KB)`);

    // ---------- Sorteo ----------
    const participantesAntes = datos.participantes().length;
    await principal.api.abrirSorteo('1234');
    await esperar(500);
    const s = BrowserWindow.getAllWindows().find((x) => x !== w && x.webContents.getURL().endsWith('sorteo.html'));
    if (s.webContents.isLoading()) await new Promise((r) => s.webContents.once('did-finish-load', r));
    s.setContentSize(1600, 900);
    await esperarQue(s, "document.querySelector('#sParticipan').textContent !== '0'");
    await esperar(600);
    await captura(s, '10-sorteo-espera');
    await js(s, "window.confirm = () => true; window.alert = (m) => { window.__alerta = m; };");

    const ganadores = [];
    for (let p = 1; p <= 4; p++) {
      await js(s, "document.querySelector('#sortear').click();");
      await esperar(1800);
      if (p === 1) await captura(s, '11-sorteo-girando');
      await esperarQue(s, "!document.querySelector('#ganador').classList.contains('oculto')", 15000);
      await esperar(900);
      const g = await js(s, "return { nombre: document.querySelector('#gNombre').textContent, letras: [...document.querySelectorAll('.tira')].map(t => t.lastElementChild.textContent).join(''), datos: document.querySelector('#gDatos').textContent };");
      ganadores.push(g);
      if (p === 1) await captura(s, '12-sorteo-ganador');
      if (p === 2) {
        // El segundo «no se presentó»: se vuelve a sortear el mismo premio.
        await js(s, "document.querySelector('#noVino').click();");
        await esperar(600);
        const otra = await js(s, "return document.querySelector('#premioNum').textContent;");
        comprobar(otra === '2.º premio de 3', `tras «no se presentó» se vuelve a sortear el 2.º premio (${otra})`);
      } else {
        await js(s, "document.querySelector('#siguiente').click();");
        await esperar(600);
      }
    }
    await esperar(800);
    await captura(s, '13-sorteo-final');
    const enBase = datos.ganadores();
    comprobar(enBase.length === 4 && enBase.filter((g) => g.descartado).length === 1, '4 sorteados, 1 marcado como «no se presentó»');
    comprobar(new Set(enBase.map((g) => g.codigo)).size === 4, 'ningún ticket gana dos veces');
    comprobar(ganadores.every((g, k) => g.letras === enBase[k].codigo), `los carretes paran en el código ganador (${ganadores.map((g) => g.letras).join(', ')})`);
    comprobar(enBase.every((g) => !datos.ticket(g.ticket_id).anulado), 'ningún ganador es un ticket anulado');
    comprobar(datos.participantes().length === participantesAntes - 4, 'los ganadores ya no participan');
    const final = await js(s, "return !document.querySelector('#final').classList.contains('oculto') && document.querySelectorAll('#listaFinal > div').length;");
    comprobar(final === 3, `al acabar los 3 premios sale la pantalla final con 3 ganadores (${final})`);
    comprobar(enBase.filter((g) => !g.descartado).map((g) => g.premio).join('|') === 'Televisor 50 pulgadas|Refrigeradora|Bicicleta', 'cada ganador quedó con su premio');
    s.close();
    await esperar(500);

    // Ganadores en la principal.
    await js(w, "document.querySelector('[data-vista=\"ganadores\"]').click();");
    await esperar(600);
    await captura(w, '14-ganadores');

    // Configuración (con PIN) y respaldos.
    await js(w, "document.querySelector('[data-vista=\"config\"]').click();");
    await esperar(300);
    await js(w, "document.querySelector('#desbloquear').click();");
    await esperarQue(w, "document.querySelector('#pinEntrada')");
    await js(w, "document.querySelector('#pinEntrada').value = '1234'; document.querySelector('#formPin').requestSubmit();");
    await esperarQue(w, "!document.querySelector('#config').classList.contains('oculto')");
    await esperar(900);
    await captura(w, '15-configuracion');
    principal.api.respaldarAhora();
    const respaldos = fs.readdirSync(path.join(datosDir, 'respaldos'));
    comprobar(respaldos.length >= 2, `copias de seguridad guardadas (${respaldos.length})`);

    // Errores de consola en las pantallas.
    const alerta = await js(w, 'return window.__alerta || null;');
    comprobar(!alerta, 'sin alertas de error');
  } catch (e) {
    fallos.push(`excepción: ${e.stack || e.message}`);
    console.error(e);
  }
  fs.writeFileSync(path.join(salida, 'resultado.json'), JSON.stringify({ bien, fallos }, null, 2));
  console.log(`\n${bien.length} bien, ${fallos.length} fallas. Salida en ${salida}`);
  app.exit(fallos.length ? 1 : 0);
});

for (const ev of ['render-process-gone', 'child-process-gone']) app.on(ev, (_e, _w, d) => fallos.push(`${ev}: ${JSON.stringify(d)}`));
app.on('web-contents-created', (_e, wc) => {
  wc.on('console-message', (ev) => {
    const nivel = ev.level ?? ev.params?.level;
    const msg = ev.message ?? ev.params?.message;
    if (nivel === 'error' || nivel === 3) { fallos.push(`consola: ${msg}`); console.log('CONSOLA', msg); }
  });
});
