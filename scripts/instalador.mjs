// Empaqueta el programa y crea el instalador de Windows (NSIS en español, por usuario: no pide administrador).
// La salida va fuera de OneDrive (%LOCALAPPDATA%\SorteoLaCarpa-empaque) y el instalador se copia a Descargas.
import { build, Platform } from 'electron-builder';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
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
    'recursos/logo-color.png',
    'recursos/logo-bn-80.png',
    'recursos/logo-bn-58.png',
    'recursos/icono.png',
    'recursos/fuentes/**/*',
    'package.json',
  ],
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
