// Publica una versión nueva de Sorteo La Carpa: crea el instalador y lo sube como release a GitHub
// (ediguard23/SorteoLaCarpa). Los programas instalados la ven solos (a los 20 s de abrir y cada 6 horas),
// la descargan en segundo plano y la instalan al pulsar «Reiniciar y actualizar» o al cerrar.
//
// Uso:  npm run publicar -- 1.0.1 --notas "Qué trae esta versión"
//       npm run publicar               → publica la versión que diga package.json
//
// Necesita la sesión de GitHub CLI (gh auth login) o la variable GH_TOKEN.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const REPO = 'ediguard23/SorteoLaCarpa';
const args = process.argv.slice(2);
const iNotas = args.indexOf('--notas');
const notas = iNotas >= 0 ? args[iNotas + 1] : null;
const nueva = args.find((a, i) => /^\d+\.\d+\.\d+$/.test(a) && i !== iNotas + 1);

const rutaPaquete = join(raiz, 'package.json');
const paquete = JSON.parse(readFileSync(rutaPaquete, 'utf8'));
if (nueva) {
  if (!esMayor(nueva, paquete.version)) salir(`La versión ${nueva} tiene que ser mayor que la actual (${paquete.version}).`);
  paquete.version = nueva;
  writeFileSync(rutaPaquete, `${JSON.stringify(paquete, null, 2)}\n`);
  const rutaLock = join(raiz, 'package-lock.json');
  const lock = JSON.parse(readFileSync(rutaLock, 'utf8'));
  lock.version = nueva;
  if (lock.packages?.['']) lock.packages[''].version = nueva;
  writeFileSync(rutaLock, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Versión cambiada a ${nueva}`);
}
const version = paquete.version;

let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    salir('No hay sesión de GitHub: ejecute «gh auth login» o ponga GH_TOKEN.');
  }
}
const conToken = { ...process.env, GH_TOKEN: token };

const existente = spawnSync('gh', ['release', 'view', `v${version}`, '--repo', REPO], { encoding: 'utf8', env: conToken });
if (existente.status === 0) salir(`La versión ${version} ya está publicada. Suba el número: npm run publicar -- ${siguiente(version)}`);

console.log(`\n› Creando el instalador ${version} y subiéndolo a GitHub…`);
const subir = () => spawnSync(process.execPath, [join(raiz, 'scripts', 'instalador.mjs')], { cwd: raiz, stdio: 'inherit', env: { ...conToken, SORTEO_PUBLICAR: '1' } });
let r = subir();
if (r.status !== 0) {
  // La primera subida a una release nueva a veces choca con GitHub a medio camino; la segunda completa
  // los archivos que falten y reemplaza los que ya estaban (así se publicó la 1.0.0).
  console.log('\n› La subida falló; se intenta otra vez…');
  r = subir();
}
if (r.status !== 0) salir('Falló la creación o la subida del instalador.');

// electron-builder deja la release como borrador si no existía: se publica y se le ponen las notas.
const editar = ['release', 'edit', `v${version}`, '--repo', REPO, '--draft=false', '--latest'];
if (notas) editar.push('--notes', notas);
spawnSync('gh', editar, { stdio: 'inherit', env: conToken });

const comprobar = spawnSync('gh', ['release', 'view', `v${version}`, '--repo', REPO, '--json', 'assets,isDraft', '-q', '[.isDraft, (.assets[].name)] | @tsv'], { encoding: 'utf8', env: conToken });
const partes = comprobar.stdout.trim().split('\t');
const borrador = partes.shift() === 'true';
if (borrador || !partes.includes('latest.yml') || !partes.some((a) => a.endsWith('.exe'))) {
  salir(`La release v${version} quedó incompleta (borrador: ${borrador}; archivos: ${partes.join(', ')}).`);
}
console.log(`\nPublicada la versión ${version}: https://github.com/${REPO}/releases/tag/v${version}`);
console.log('Los programas instalados la descargarán solos.');

function esMayor(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}
function siguiente(v) {
  const [a, b, c] = v.split('.').map(Number);
  return `${a}.${b}.${c + 1}`;
}
function salir(m) {
  console.error(`\n${m}`);
  process.exit(1);
}
