'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Toda la comunicación con el programa pasa por aquí. Cada llamada devuelve el valor o lanza el error en español.
async function llamar(metodo, ...args) {
  const r = await ipcRenderer.invoke('api', metodo, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.valor;
}

contextBridge.exposeInMainWorld('carpa', {
  llamar,
  alCerrarSorteo: (fn) => ipcRenderer.on('sorteo-cerrado', () => fn()),
  alActualizar: (fn) => ipcRenderer.on('actualizacion', (_e, estado) => fn(estado)),
});
