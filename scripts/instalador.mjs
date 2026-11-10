// Empaqueta el programa y crea el instalador de Windows (NSIS en español, por usuario: no pide administrador).
// La salida va fuera de OneDrive (%LOCALAPPDATA%\SorteoLaCarpa-empaque) y el instalador se copia a Descargas.
import { build, Platform } from 'electron-builder';
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const paquete = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
const salida = join(process.env.LOCALAPPDATA ?? homedir(), 'SorteoLaCarpa-empaque');
mkdirSync(salida, { recursive: true });

const config = {
  appId: 'hn.lacarpa.sorteo',
  productName: 'Sorteo La Carpa',
  copyright: `© ${new Date().getFullYear()} La Carpa`,
  directories: { output: salida, buildResources: 'build' },
  files: [
    'src/**/*',
    'recursos/**/*',
    '!recursos/logo-original.jpg',
    'package.json',
  ],
  // Antes de armar el instalador (y antes de subir nada) se comprueba que el paquete lleve todos los
  // recursos de la carpeta y cada logo de ticket que usa el programa. Así se coló la 1.0.0 sin el de 70 mm.
  afterPack: async (ctx) => {
    const asar = (await import('@electron/asar')).default;
    const dentro = new Set(asar.listPackage(join(ctx.appOutDir, 'resources', 'app.asar')).map((f) => f.replace(/\\/g, '/').replace(/^\//, '')));
    const requeridos = [
      ...readdirSync(join(raiz, 'recursos'), { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile() && d.name !== 'logo-original.jpg')
        .map((d) => relative(raiz, join(d.parentPath, d.name)).replace(/\\/g, '/')),
      ...[58, 70, 80].map((p) => `recursos/logo-bn-${p}.png`),
      'src/main.js', 'src/ticket.js', 'src/actualizador.js', 'node_modules/electron-updater/package.json',
    ];
    const faltan = [...new Set(requeridos)].filter((f) => !dentro.has(f));
    if (faltan.length) throw new Error(`Al paquete le faltan archivos: ${faltan.join(', ')}`);
    console.log(`  • paquete comprobado: ${requeridos.length} archivos necesarios presentes`);
  },
  asar: true,
  npmRebuild: false,
  nodeGypRebuild: false,
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    onlyLoadAppFromAsar: true,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icono.ico',
    artifactName: 'Sorteo-La-Carpa-${version}-instalador.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Sorteo La Carpa',
    uninstallDisplayName: 'Sorteo La Carpa',
    installerIcon: 'build/icono.ico',
    uninstallerIcon: 'build/icono.ico',
    installerHeaderIcon: 'build/icono.ico',
    language: '3082',
    installerLanguages: ['es_ES'],
    runAfterFinish: true,
    // Los tickets y las copias de seguridad nunca se borran al desinstalar.
    deleteAppDataOnUninstall: false,
  },
  // De aquí lee el programa instalado las versiones nuevas (releases públicas de GitHub).
  publish: { provider: 'github', owner: 'ediguard23', repo: 'SorteoLaCarpa', releaseType: 'release' },
};

// Para probar la actualización sin GitHub: otra versión, en otra carpeta, que se sirve desde un servidor local.
const versionPrueba = process.env.SORTEO_VERSION;
if (versionPrueba) {
  config.extraMetadata = { version: versionPrueba };
  config.directories.output = `${salida}-${versionPrueba}`;
}
const version = versionPrueba || paquete.version;
const publicar = process.env.SORTEO_PUBLICAR === '1';

const archivos = await build({ targets: Platform.WINDOWS.createTarget(), config, publish: publicar ? 'always' : 'never' });
const exe = archivos.find((f) => f.endsWith('.exe'));
if (!versionPrueba) {
  const destino = join(homedir(), 'Downloads', `Sorteo-La-Carpa-${version}-instalador.exe`);
  copyFileSync(exe, destino);
  console.log(`\nInstalador listo: ${destino}`);
} else {
  console.log(`\nInstalador de prueba ${version}: ${exe}`);
}
