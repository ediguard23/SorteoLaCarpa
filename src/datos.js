'use strict';
// Base de datos del sorteo: un solo archivo SQLite en la carpeta de datos del programa.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

// Sin O, I, Q ni Ñ: impresas en papel térmico se confunden con 0, 1, G o N.
const ALFABETO = 'ABCDEFGHJKLMNPRSTUVWXYZ';
// Combinaciones de 4 letras que no deben salir nunca en un ticket.
const PROHIBIDAS = new Set([
  'PUTA', 'PUTO', 'PUTS', 'CULO', 'CULA', 'PENE', 'PEDO', 'PEDA', 'CACA', 'MECO', 'JOTO', 'JOTA', 'CAGA',
  'CAGO', 'CAGE', 'MEAR', 'MEON', 'MEAS', 'TETA', 'TETO', 'VERG', 'PAJA', 'PAJE', 'ZORR', 'MAMA', 'MAMO',
  'MAME', 'CAPU', 'CHAC', 'NAZI', 'FUCK', 'SEXO', 'SEXY', 'COGE', 'COJE', 'COGA', 'MALP', 'LADR', 'ROBA',
  'ROBO', 'MUER', 'MATA', 'DROG', 'NACA', 'NACO', 'BUEY', 'GUEY', 'WEON', 'HUEV', 'PIJA', 'PIJO', 'CHIM',
  'DAMN', 'SHIT', 'CUCA', 'MICO', 'BRUT', 'TONT', 'MENS', 'LELO', 'LELA', 'BABO', 'GAYS', 'PERR', 'CERD',
]);

const AJUSTES_INICIALES = {
  configurado: false,
  tienda: { nombre: 'La Carpa', eslogan: 'El lugar perfecto para comprar...', direccion: '', telefono: '' },
  sorteo: { nombre: 'Gran Sorteo', fecha: '', montoTicket: 500, cantidadPremios: 1, premios: [] },
  pieTicket: 'Conserve este ticket para reclamar su premio.',
  impresora: { nombre: '', papel: 80, tipo: 'termica' },
  cajeros: [],
  respaldos: { carpeta: '' },
  sonido: true,
  seguridad: { sal: '', hash: '' },
  sorteoId: 1,
};

function ahora() {
  return new Date().toISOString();
}

function mezclar(base, extra) {
  const r = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      r[k] = mezclar(base[k], v);
    } else {
      r[k] = v;
    }
  }
  return r;
}

function soloDigitos(t) {
  return String(t || '').replace(/\D/g, '');
}

function hashPin(pin, sal) {
  return crypto.scryptSync(String(pin), sal, 32).toString('hex');
}

class Datos {
  constructor(ruta) {
    this.ruta = ruta;
    this.db = new DatabaseSync(ruta);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.cambios = 0;
    this.migrar();
  }

  migrar() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sorteos (
        id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, fecha TEXT, monto_ticket REAL NOT NULL,
        premios TEXT NOT NULL DEFAULT '[]', creado TEXT NOT NULL, cerrado TEXT
      );
      CREATE TABLE IF NOT EXISTS compras (
        id INTEGER PRIMARY KEY, sorteo_id INTEGER NOT NULL, cliente TEXT NOT NULL, telefono TEXT NOT NULL,
        monto REAL NOT NULL, nota TEXT NOT NULL DEFAULT '', cajero TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, sorteo_id INTEGER NOT NULL,
        compra_id INTEGER NOT NULL REFERENCES compras(id), numero INTEGER NOT NULL, total INTEGER NOT NULL,
        impresiones INTEGER NOT NULL DEFAULT 0, anulado TEXT, motivo_anulado TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS ganadores (
        id INTEGER PRIMARY KEY, sorteo_id INTEGER NOT NULL, ticket_id INTEGER NOT NULL REFERENCES tickets(id),
        premio_num INTEGER NOT NULL, premio TEXT NOT NULL, creado TEXT NOT NULL, descartado TEXT
      );
      CREATE INDEX IF NOT EXISTS tickets_sorteo ON tickets(sorteo_id);
      CREATE INDEX IF NOT EXISTS compras_sorteo ON compras(sorteo_id);
      CREATE INDEX IF NOT EXISTS ganadores_sorteo ON ganadores(sorteo_id);
    `);
  }

  // ---------- Ajustes ----------
  ajustes() {
    const fila = this.db.prepare("SELECT valor FROM ajustes WHERE clave = 'ajustes'").get();
    return mezclar(AJUSTES_INICIALES, fila ? JSON.parse(fila.valor) : {});
  }

  guardarAjustes(nuevos) {
    const a = mezclar(this.ajustes(), nuevos);
    this.db.prepare("INSERT INTO ajustes (clave, valor) VALUES ('ajustes', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor")
      .run(JSON.stringify(a));
    // El sorteo en curso queda registrado también en su tabla, para el historial.
    const s = a.sorteo;
    const existe = this.db.prepare('SELECT id FROM sorteos WHERE id = ?').get(a.sorteoId);
    if (existe) {
      this.db.prepare('UPDATE sorteos SET nombre = ?, fecha = ?, monto_ticket = ?, premios = ? WHERE id = ?')
        .run(s.nombre, s.fecha || '', s.montoTicket, JSON.stringify(s.premios || []), a.sorteoId);
    } else {
      this.db.prepare('INSERT INTO sorteos (id, nombre, fecha, monto_ticket, premios, creado) VALUES (?, ?, ?, ?, ?, ?)')
        .run(a.sorteoId, s.nombre, s.fecha || '', s.montoTicket, JSON.stringify(s.premios || []), ahora());
    }
    this.cambios++;
    return a;
  }

  ponerPin(pin) {
    const sal = crypto.randomBytes(16).toString('hex');
    this.guardarAjustes({ seguridad: { sal, hash: hashPin(pin, sal) } });
  }

  pinCorrecto(pin) {
    const { sal, hash } = this.ajustes().seguridad;
    if (!sal || !hash) return true;
    const a = Buffer.from(hashPin(pin || '', sal), 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // ---------- Tickets ----------
  codigoNuevo() {
    const existe = this.db.prepare('SELECT 1 FROM tickets WHERE codigo = ?');
    for (let intento = 0; intento < 5000; intento++) {
      let c = '';
      for (let i = 0; i < 4; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)];
      if (PROHIBIDAS.has(c)) continue;
      if (!existe.get(c)) return c;
    }
    throw new Error('Ya casi no quedan códigos libres.');
  }

  ticketsPorMonto(monto) {
    const m = Number(this.ajustes().sorteo.montoTicket) || 500;
    return Math.floor((Number(monto) + 1e-9) / m);
  }

  // Registra una compra y crea un ticket por cada monto completo. Devuelve los tickets creados.
  crearCompra({ cliente, telefono, monto, nota, cajero }) {
    cliente = String(cliente || '').trim().replace(/\s+/g, ' ');
    telefono = soloDigitos(telefono);
    monto = Math.round(Number(monto) * 100) / 100;
    nota = String(nota || '').trim();
    cajero = String(cajero || '').trim();
    if (cliente.length < 2) throw new Error('Escriba el nombre del cliente.');
    if (telefono.length !== 8) throw new Error('El teléfono debe tener 8 dígitos.');
    if (!(monto > 0)) throw new Error('Escriba el monto de la compra.');
    const cantidad = this.ticketsPorMonto(monto);
    if (cantidad < 1) throw new Error(`La compra no alcanza para un ticket (mínimo L. ${this.ajustes().sorteo.montoTicket}).`);
    if (cantidad > 200) throw new Error('Son más de 200 tickets en una sola compra. Revise el monto.');

    const a = this.ajustes();
    const creado = ahora();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const { lastInsertRowid: compraId } = this.db
        .prepare('INSERT INTO compras (sorteo_id, cliente, telefono, monto, nota, cajero, creado) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(a.sorteoId, cliente, telefono, monto, nota, cajero, creado);
      const insertar = this.db.prepare('INSERT INTO tickets (codigo, sorteo_id, compra_id, numero, total) VALUES (?, ?, ?, ?, ?)');
      for (let n = 1; n <= cantidad; n++) insertar.run(this.codigoNuevo(), a.sorteoId, compraId, n, cantidad);
      this.db.exec('COMMIT');
      this.cambios++;
      return this.db.prepare(`${Datos.SELECT_TICKET} WHERE t.compra_id = ? ORDER BY t.numero`).all(compraId);
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  ticket(id) {
    return this.db.prepare(`${Datos.SELECT_TICKET} WHERE t.id = ?`).get(id);
  }

  ticketPorCodigo(codigo) {
    return this.db.prepare(`${Datos.SELECT_TICKET} WHERE t.codigo = ?`).get(String(codigo || '').toUpperCase());
  }

  marcarImpreso(id) {
    this.db.prepare('UPDATE tickets SET impresiones = impresiones + 1 WHERE id = ?').run(id);
    this.cambios++;
  }

  anular(id, motivo) {
    const t = this.ticket(id);
    if (!t) throw new Error('Ese ticket no existe.');
    if (t.anulado) throw new Error('Ese ticket ya estaba anulado.');
    this.db.prepare('UPDATE tickets SET anulado = ?, motivo_anulado = ? WHERE id = ?').run(ahora(), String(motivo || '').trim(), id);
    this.cambios++;
  }

  buscar({ texto = '', estado = 'todos', limite = 200, desde = 0 } = {}) {
    const sorteo = this.ajustes().sorteoId;
    const condiciones = ['t.sorteo_id = ?'];
    const valores = [sorteo];
    const q = String(texto).trim();
    if (q) {
      const dig = soloDigitos(q);
      const partes = ['c.cliente LIKE ?', 't.codigo LIKE ?', 'c.nota LIKE ?'];
      valores.push(`%${q}%`, `%${q.toUpperCase()}%`, `%${q}%`);
      if (dig.length >= 3) {
        partes.push('c.telefono LIKE ?');
        valores.push(`%${dig}%`);
      }
      condiciones.push(`(${partes.join(' OR ')})`);
    }
    if (estado === 'validos') condiciones.push('t.anulado IS NULL');
    if (estado === 'anulados') condiciones.push('t.anulado IS NOT NULL');
    const donde = `WHERE ${condiciones.join(' AND ')}`;
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM tickets t JOIN compras c ON c.id = t.compra_id ${donde}`).get(...valores).n;
    const filas = this.db
      .prepare(`${Datos.SELECT_TICKET} ${donde} ORDER BY t.id DESC LIMIT ? OFFSET ?`)
      .all(...valores, limite, desde);
    return { total, filas };
  }

  todos() {
    return this.db
      .prepare(`${Datos.SELECT_TICKET} WHERE t.sorteo_id = ? ORDER BY t.id`)
      .all(this.ajustes().sorteoId);
  }

  resumen() {
    const s = this.ajustes().sorteoId;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const r = this.db.prepare(`
      SELECT
        COUNT(*) AS tickets,
        SUM(CASE WHEN t.anulado IS NULL THEN 1 ELSE 0 END) AS validos,
        SUM(CASE WHEN t.anulado IS NOT NULL THEN 1 ELSE 0 END) AS anulados,
        COUNT(DISTINCT CASE WHEN t.anulado IS NULL THEN c.telefono END) AS clientes,
        SUM(CASE WHEN t.anulado IS NULL AND c.creado >= ? THEN 1 ELSE 0 END) AS hoy
      FROM tickets t JOIN compras c ON c.id = t.compra_id WHERE t.sorteo_id = ?`).get(hoy.toISOString(), s);
    const compras = this.db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(monto), 0) AS monto FROM compras WHERE sorteo_id = ?').get(s);
    return {
      tickets: r.tickets || 0, validos: r.validos || 0, anulados: r.anulados || 0, clientes: r.clientes || 0,
      hoy: r.hoy || 0, compras: compras.n, montoCompras: compras.monto, ganadores: this.ganadores().filter((g) => !g.descartado).length,
    };
  }

  // ---------- Sorteo ----------
  participantes() {
    // Entran los tickets válidos de este sorteo que todavía no ganaron (un ganador descartado vuelve a participar
    // solo si se descartó por error; por regla, quien no se presentó queda fuera).
    return this.db.prepare(`
      SELECT t.id, t.codigo FROM tickets t
      WHERE t.sorteo_id = ? AND t.anulado IS NULL
        AND NOT EXISTS (SELECT 1 FROM ganadores g WHERE g.ticket_id = t.id)
      ORDER BY t.id`).all(this.ajustes().sorteoId);
  }

  premioSiguiente() {
    const a = this.ajustes();
    const n = this.db.prepare('SELECT COUNT(*) AS n FROM ganadores WHERE sorteo_id = ? AND descartado IS NULL').get(a.sorteoId).n + 1;
    const premios = a.sorteo.premios || [];
    const total = Math.max(1, Number(a.sorteo.cantidadPremios) || premios.length || 1);
    return { numero: n, nombre: premios[n - 1] || '', total };
  }

  sortear() {
    const lista = this.participantes();
    if (!lista.length) throw new Error('No quedan tickets para sortear.');
    const elegido = lista[crypto.randomInt(lista.length)];
    const premio = this.premioSiguiente();
    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO ganadores (sorteo_id, ticket_id, premio_num, premio, creado) VALUES (?, ?, ?, ?, ?)')
      .run(this.ajustes().sorteoId, elegido.id, premio.numero, premio.nombre, ahora());
    this.cambios++;
    return { ganador: this.ganador(lastInsertRowid), participantes: lista.length, codigos: lista.map((t) => t.codigo) };
  }

  descartarGanador(id) {
    this.db.prepare('UPDATE ganadores SET descartado = ? WHERE id = ? AND descartado IS NULL').run(ahora(), id);
    this.cambios++;
  }

  ganador(id) {
    return this.db.prepare(`${Datos.SELECT_GANADOR} WHERE g.id = ?`).get(id);
  }

  ganadores() {
    return this.db.prepare(`${Datos.SELECT_GANADOR} WHERE g.sorteo_id = ? ORDER BY g.id`).all(this.ajustes().sorteoId);
  }

  nuevoSorteo(sorteo) {
    const a = this.ajustes();
    this.db.prepare('UPDATE sorteos SET cerrado = ? WHERE id = ?').run(ahora(), a.sorteoId);
    const max = this.db.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM sorteos').get().m;
    return this.guardarAjustes({ sorteoId: Math.max(max, a.sorteoId) + 1, sorteo: { ...a.sorteo, ...sorteo } });
  }

  respaldar(rutaDestino) {
    this.db.exec(`VACUUM INTO '${rutaDestino.replace(/'/g, "''")}'`);
  }

  cerrar() {
    try { this.db.close(); } catch { /* ya cerrada */ }
  }
}

Datos.SELECT_TICKET = `
  SELECT t.id, t.codigo, t.numero, t.total, t.impresiones, t.anulado, t.motivo_anulado, t.sorteo_id,
         c.id AS compra_id, c.cliente, c.telefono, c.monto, c.nota, c.cajero, c.creado
  FROM tickets t JOIN compras c ON c.id = t.compra_id`;
Datos.SELECT_GANADOR = `
  SELECT g.id, g.premio_num, g.premio, g.creado AS sorteado, g.descartado,
         t.id AS ticket_id, t.codigo, t.numero, t.total, c.cliente, c.telefono, c.monto, c.creado
  FROM ganadores g JOIN tickets t ON t.id = g.ticket_id JOIN compras c ON c.id = t.compra_id`;

module.exports = { Datos, ALFABETO, PROHIBIDAS, soloDigitos };
