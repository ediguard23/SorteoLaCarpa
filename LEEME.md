# Sorteo La Carpa

Programa de Windows para el sorteo de La Carpa:

- La caja genera los tickets: uno por cada L. 500 de compra, cada uno aparte y con su propio código de 4 letras.
- Los tickets salen en la impresora térmica (58 u 80 mm), en blanco y negro y con el logo.
- Todo queda guardado: búsqueda, reimpresión (con PIN), anulación y exportación a Excel.
- El sorteo se hace en una pantalla animada, para la cantidad de premios configurada.

## Instalar
Ejecutar `Descargas\Sorteo-La-Carpa-1.0.0-instalador.exe`. No pide administrador. La primera vez se abre un asistente de 5 pasos: tienda, sorteo y premios, impresora (con **Imprimir prueba**), cajeros y PIN, y copias de seguridad.

Windows puede avisar de «editor desconocido» porque el instalador no tiene firma de código. Se continúa con **Más información → Ejecutar de todas formas**.

## Uso diario
- **Caja:** nombre, teléfono, monto y descripción opcional; luego **Enter**. El cuadro naranja dice cuántos tickets salen y cuánto le falta al cliente para el siguiente.
- **Participantes:** buscar por código, nombre, teléfono o descripción, reimprimir, anular y **Exportar a Excel**.
- **Abrir sorteo** (pide el PIN): si hay una tele o un proyector conectado, la pantalla se abre ahí. **Espacio** sortea. Si el ganador no se presenta, **No se presentó** vuelve a sortear ese mismo premio. **Esc** sale.
- **Configuración** (pide el PIN): se puede cambiar todo lo del asistente y empezar un sorteo nuevo.

## Datos
- Base: `%APPDATA%\Sorteo La Carpa\sorteo.db`.
- Copias automáticas en `Documentos\Sorteo La Carpa\Respaldos`, o en la carpeta que se escoja.
- Desinstalar el programa no borra los datos.

## Desarrollo
```
npm install
npm start            # abrir el programa
npm run probar       # prueba completa automática (datos aparte; capturas y PDFs en %LOCALAPPDATA%\SorteoLaCarpa-pruebas)
npm run instalador   # crea el instalador y lo copia a Descargas
npm run logo         # regenera logo a color, blanco y negro e icono desde recursos/logo-original.jpg
```

## Actualizaciones
El programa instalado busca versiones nuevas en las releases de GitHub ([ediguard23/SorteoLaCarpa](https://github.com/ediguard23/SorteoLaCarpa/releases)) a los 20 segundos de abrirse y cada 6 horas. La descarga se hace sola y arriba aparece **«Versión x lista · Reiniciar y actualizar»**; si nadie la pulsa, se instala la próxima vez que se cierre el programa. Los tickets y la configuración no se tocan, y antes de actualizar se guarda una copia de seguridad. En Configuración → Programa y actualizaciones se ve la versión y se puede buscar a mano.

Para sacar una versión nueva después de hacer cambios:
```
npm run probar
npm run publicar -- 1.0.1 --notas "Qué cambió"
```
`publicar` sube el número de versión, crea el instalador y lo publica en GitHub (usa la sesión de `gh`).
