'use strict';
// Actualizaciones automáticas: a los 20 s de abrir y cada 6 horas se busca una versión nueva en las
// releases de GitHub (ediguard23/SorteoLaCarpa). Se descarga sola en segundo plano y se instala al pulsar
// «Reiniciar y actualizar» o, si no, la próxima vez que se cierre el programa. Los datos no se tocan.
const { app } = require('electron');

const CADA = 6 * 3600 * 1000;

function traducir(e) {
  const m = e instanceof Error ? e.message : String(e);
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::ERR_/i.test(m)) return 'Sin conexión a internet: se vuelve a intentar más tarde.';
  if (/404/.test(m)) return 'Todavía no hay versiones publicadas.';
  if (/sha512|checksum/i.test(m)) return 'La descarga llegó dañada: se vuelve a intentar más tarde.';
  return m.split('\n')[0].slice(0, 200);
}

class Actualizador {
  constructor(emitir) {
    this.emitir = emitir;
    // En desarrollo no hay app-update.yml; en las pruebas solo si se pide con SORTEO_ACTUALIZAR_URL.
    const prueba = process.env.SORTEO_PRUEBA === '1';
    this.activa = Boolean(process.env.SORTEO_ACTUALIZAR_URL) || (app.isPackaged && !prueba);
    this.estado = { fase: this.activa ? 'inactiva' : 'desactivada', actual: app.getVersion(), nueva: null, progreso: null, error: null };
    this.temporizador = null;
  }

  iniciar() {
    if (!this.activa) return;
    const { autoUpdater } = require('electron-updater');
    this.au = autoUpdater;
    autoUpdater.logger = null;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    if (process.env.SORTEO_ACTUALIZAR_URL) {
      // Prueba con un servidor local que tiene latest.yml y el instalador nuevo.
      autoUpdater.forceDevUpdateConfig = !app.isPackaged;
      autoUpdater.setFeedURL({ provider: 'generic', url: process.env.SORTEO_ACTUALIZAR_URL });
    }

    autoUpdater.on('checking-for-update', () => this.cambiar({ fase: 'buscando', error: null }));
    autoUpdater.on('update-available', (i) => this.cambiar({ fase: 'descargando', nueva: i.version, progreso: 0 }));
    autoUpdater.on('update-not-available', () => this.cambiar({ fase: 'al-dia', nueva: null, progreso: null }));
    autoUpdater.on('download-progress', (p) => {
      const progreso = Math.round(p.percent);
      if (progreso !== this.estado.progreso) this.cambiar({ fase: 'descargando', progreso });
    });
    autoUpdater.on('update-downloaded', (i) => {
      this.cambiar({ fase: 'lista', nueva: i.version, progreso: 100 });
      // Solo en la prueba automática de actualización: instala sin esperar al botón.
      if (process.env.SORTEO_ACTUALIZAR_AUTO === '1') setTimeout(() => this.instalar(), 1500);
    });
    autoUpdater.on('error', (e) => this.cambiar({ fase: this.estado.fase === 'lista' ? 'lista' : 'error', error: traducir(e) }));

    setTimeout(() => this.buscar(), Number(process.env.SORTEO_ACTUALIZAR_ESPERA) || 20000);
    this.temporizador = setInterval(() => this.buscar(), CADA);
    this.temporizador.unref?.();
  }

  obtener() {
    return { ...this.estado };
  }

  async buscar() {
    if (!this.activa) throw new Error('Las actualizaciones solo funcionan en el programa instalado.');
    if (['descargando', 'lista', 'buscando'].includes(this.estado.fase)) return this.obtener();
    try {
      await this.au.checkForUpdates();
    } catch (e) {
      this.cambiar({ fase: 'error', error: traducir(e) });
    }
    return this.obtener();
  }

  // Cierra el programa, instala la versión descargada sin preguntar y lo vuelve a abrir.
  instalar() {
    if (this.estado.fase !== 'lista') throw new Error('Todavía no hay una versión nueva descargada.');
    setImmediate(() => this.au.quitAndInstall(true, true));
  }

  cambiar(c) {
    this.estado = { ...this.estado, ...c };
    if (process.env.SORTEO_ACTUALIZAR_LOG) {
      require('node:fs').appendFileSync(process.env.SORTEO_ACTUALIZAR_LOG, `${new Date().toISOString()} ${JSON.stringify(this.estado)}\n`);
    }
    this.emitir(this.obtener());
  }
}

module.exports = { Actualizador };
