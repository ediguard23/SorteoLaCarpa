'use strict';
/* Pantalla del sorteo: carretes de letras que se frenan uno a uno en el código ganador. */

const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
let info = null;
let ganadorActual = null;
let ocupado = false;

const ordinal = (n) => `${n}${n === 1 || n === 3 ? '.er' : '.º'}`;
const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];

/* ---------------- Sonido (sintetizado, sin archivos) ---------------- */
const Sonido = {
  ctx: null,
  activo: true,
  iniciar() {
    if (!this.activo) return null;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tono(frec, dur, { tipo = 'triangle', vol = 0.15, cuando = 0, caida = true } = {}) {
    const c = this.iniciar();
    if (!c) return;
    const t = c.currentTime + cuando;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(frec, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (caida ? dur : dur * 1.6));
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur * 1.7);
  },
  tic() { this.tono(1500 + Math.random() * 300, 0.035, { tipo: 'square', vol: 0.035 }); },
  golpe() {
    this.tono(150, 0.28, { tipo: 'sine', vol: 0.5 });
    this.tono(900, 0.06, { tipo: 'square', vol: 0.06 });
  },
  redoble: null,
  empezarRedoble() {
    const c = this.iniciar();
    if (!c) return;
    const largo = c.sampleRate * 2;
    const buf = c.createBuffer(1, largo, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < largo; i++) d[i] = Math.random() * 2 - 1;
    const ruido = c.createBufferSource();
    ruido.buffer = buf;
    ruido.loop = true;
    const filtro = c.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = 700;
    filtro.Q.value = 0.8;
    const trem = c.createGain();
    trem.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.frequency.value = 19;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(trem.gain);
    const vol = c.createGain();
    vol.gain.setValueAtTime(0.0001, c.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.22, c.currentTime + 2.5);
    ruido.connect(filtro).connect(trem).connect(vol).connect(c.destination);
    ruido.start();
    lfo.start();
    this.redoble = { ruido, lfo, vol };
  },
  pararRedoble() {
    if (!this.redoble || !this.ctx) return;
    const { ruido, lfo, vol } = this.redoble;
    const t = this.ctx.currentTime;
    vol.gain.cancelScheduledValues(t);
    vol.gain.setValueAtTime(vol.gain.value, t);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    ruido.stop(t + 0.2);
    lfo.stop(t + 0.2);
    this.redoble = null;
  },
  fanfarria() {
    const notas = [523.25, 659.25, 783.99, 1046.5];
    notas.forEach((f, i) => this.tono(f, 0.22, { vol: 0.2, cuando: i * 0.11 }));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tono(f, 1.4, { vol: 0.12, cuando: 0.5, caida: false }));
    this.tono(261.63, 1.6, { tipo: 'sawtooth', vol: 0.05, cuando: 0.5, caida: false });
  },
};

/* ---------------- Confeti ---------------- */
const Confeti = {
  piezas: [],
  corriendo: false,
  lanzar() {
    const cv = $('#confeti');
    const w = (cv.width = innerWidth * devicePixelRatio);
    const h = (cv.height = innerHeight * devicePixelRatio);
    const colores = ['#ffffff', '#ffe08a', '#ffb000', '#ff7a00', '#e94e1b', '#1d1510', '#fff1dc'];
    const s = devicePixelRatio;
    const nueva = (x, y, ang, vel) => ({
      x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel, g: 0.32 * s, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      w: (7 + Math.random() * 9) * s, h: (10 + Math.random() * 14) * s, color: azar(colores), vida: 0, forma: Math.random() < 0.25 ? 'c' : 'r',
    });
    for (let i = 0; i < 170; i++) this.piezas.push(nueva(0, h, -Math.PI / 2 + 0.35 + Math.random() * 0.55, (16 + Math.random() * 16) * s));
    for (let i = 0; i < 170; i++) this.piezas.push(nueva(w, h, -Math.PI / 2 - 0.35 - Math.random() * 0.55, (16 + Math.random() * 16) * s));
    for (let i = 0; i < 160; i++) this.piezas.push(nueva(Math.random() * w, -20 * s, Math.PI / 2, Math.random() * 4 * s));
    if (!this.corriendo) { this.corriendo = true; requestAnimationFrame(() => this.cuadro()); }
  },
  cuadro() {
    const cv = $('#confeti');
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    for (const p of this.piezas) {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + p.g * 0.6;
      p.x += p.vx + Math.sin(p.vida / 9) * 0.8;
      p.y += p.vy;
      p.rot += p.vr;
      p.vida++;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.scale(1, Math.cos(p.vida / 6));
      c.fillStyle = p.color;
      if (p.forma === 'c') { c.beginPath(); c.arc(0, 0, p.w / 2, 0, Math.PI * 2); c.fill(); } else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    }
    this.piezas = this.piezas.filter((p) => p.y < cv.height + 60 && p.vida < 900);
    if (this.piezas.length) requestAnimationFrame(() => this.cuadro());
    else { this.corriendo = false; c.clearRect(0, 0, cv.width, cv.height); }
  },
};

/* ---------------- Carretes ---------------- */
function altoLetra() {
  return $('.carrete').clientHeight;
}

function carretesEnEspera() {
  for (const tira of $$('.tira')) {
    tira.style.transform = 'translateY(0)';
    tira.innerHTML = '<span class="idle">?</span>';
  }
  $('#carretes').classList.remove('gano');
}

const suave = (t) => 1 - Math.pow(1 - t, 4); // frena al final

function girar(codigo, codigos) {
  return new Promise((resolve) => {
    const h = altoLetra();
    const tiras = $$('.tira');
    const pool = codigos.length ? codigos : [codigo];
    const planes = tiras.map((tira, i) => {
      // Letras de relleno sacadas de códigos reales que participan, y al final la letra ganadora.
      const cantidad = 34 + i * 14 + (i === 3 ? 10 : 0);
      const letras = Array.from({ length: cantidad }, () => azar(pool)[i] || azar(LETRAS));
      letras.push(codigo[i]);
      tira.innerHTML = letras.map((l) => `<span>${l}</span>`).join('');
      tira.style.transform = 'translateY(0)';
      return { tira, distancia: cantidad * h, duracion: 2600 + i * 950 + (i === 3 ? 900 : 0), ultimo: -1, parado: false };
    });
    const inicio = performance.now();
    let ultimoTic = 0;
    const paso = (ahora) => {
      let todos = true;
      for (const [i, p] of planes.entries()) {
        if (p.parado) continue;
        const t = Math.min(1, (ahora - inicio) / p.duracion);
        const y = suave(t) * p.distancia;
        p.tira.style.transform = `translateY(${-y}px)`;
        const indice = Math.floor(y / h + 0.5);
        if (indice !== p.ultimo) {
          p.ultimo = indice;
          if (ahora - ultimoTic > 38) { Sonido.tic(); ultimoTic = ahora; }
        }
        if (t >= 1) {
          p.parado = true;
          const carrete = p.tira.parentElement;
          carrete.classList.remove('paro');
          void carrete.offsetWidth;
          carrete.classList.add('paro');
          Sonido.golpe();
          if (i === planes.length - 1) Sonido.pararRedoble();
        } else todos = false;
      }
      if (todos) resolve();
      else requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
}

/* ---------------- Flujo ---------------- */
function pintarCabecera() {
  const a = info.ajustes;
  $('#sNombre').textContent = a.sorteo.nombre;
  $('#sParticipan').textContent = info.participantes.length.toLocaleString('es-HN');
  const p = info.premio;
  $('#premioNum').textContent = p.total > 1 ? `${ordinal(p.numero)} premio de ${p.total}` : 'Gran premio';
  $('#premioNombre').textContent = p.nombre || '¿Quién será el ganador?';
  const validos = info.ganadores.filter((g) => !g.descartado);
  $('#miniGanadores').innerHTML = validos.map((g) => `<div>${ordinal(g.premioNum)} · <b>${esc(g.codigo)}</b> · ${esc(g.cliente)}</div>`).join('');
}

async function cargar() {
  info = await api('datosSorteo');
  Sonido.activo = info.ajustes.sonido !== false;
  const terminado = info.premio.total > 0 && info.premio.numero > info.premio.total;
  if (terminado || !info.participantes.length) return mostrarFinal(terminado);
  pintarCabecera();
  $('#escenario').classList.remove('oculto');
  $('#final').classList.add('oculto');
  $('.s-participan').style.visibility = '';
  $('#ganador').classList.add('oculto');
  $('#acciones').classList.remove('oculto');
  $('#accionesDespues').classList.add('oculto');
  $('#sortear').disabled = false;
  carretesEnEspera();
}

function mostrarFinal(terminado) {
  pintarCabecera();
  $('#escenario').classList.add('oculto');
  $('#final').classList.remove('oculto');
  $('#final h1').textContent = terminado ? '¡Sorteo terminado!' : 'No quedan tickets para sortear';
  const validos = info.ganadores.filter((g) => !g.descartado);
  $('#listaFinal').innerHTML = validos.map((g, i) => `
    <div style="animation-delay:${i * 120}ms"><small>${ordinal(g.premioNum)} premio${g.premio ? ` · ${esc(g.premio)}` : ''}</small><b>${esc(g.cliente)}</b><span>${esc(g.codigo)}</span></div>`).join('');
  $('#miniGanadores').innerHTML = '';
  $('.s-participan').style.visibility = 'hidden';
  if (validos.length) Confeti.lanzar();
}

async function sortear() {
  if (ocupado || $('#acciones').classList.contains('oculto')) return;
  ocupado = true;
  $('#sortear').disabled = true;
  try {
    Sonido.iniciar();
    const r = await api('sortear');
    ganadorActual = r.ganador;
    document.body.classList.add('girando');
    Sonido.empezarRedoble();
    await girar(r.ganador.codigo, info.participantes);
    document.body.classList.remove('girando');
    $('#carretes').classList.add('gano');
    Sonido.fanfarria();
    Confeti.lanzar();
    $('#gNombre').textContent = r.ganador.cliente;
    $('#gDatos').textContent = `Código ${r.ganador.codigo} · Tel. ${r.ganador.telefono} · Compra del ${r.ganador.compra}`;
    $('#ganador').classList.remove('oculto');
    $('#acciones').classList.add('oculto');
    $('#accionesDespues').classList.remove('oculto');
    const quedan = info.participantes.length - 1;
    const p = info.premio;
    const hayMas = quedan > 0 && !(p.total > 0 && p.numero >= p.total);
    $('#siguiente span').textContent = hayMas ? 'Siguiente premio' : 'Ver ganadores';
    $('#siguiente').focus();
  } catch (e) {
    alert(e.message);
    $('#sortear').disabled = false;
  } finally {
    ocupado = false;
  }
}

$('#sortear').addEventListener('click', sortear);
$('#siguiente').addEventListener('click', () => { ganadorActual = null; cargar(); });
$('#noVino').addEventListener('click', async () => {
  if (!ganadorActual) return;
  if (!confirm(`${ganadorActual.cliente} (${ganadorActual.codigo}) no se presentó.\n\nSe anotará como «No se presentó» y se volverá a sortear el ${ordinal(ganadorActual.premioNum)} premio. ¿Seguir?`)) return;
  await api('descartarGanador', ganadorActual.id);
  ganadorActual = null;
  await cargar();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === 'Enter') {
    if (!$('#acciones').classList.contains('oculto') && !$('#escenario').classList.contains('oculto')) { e.preventDefault(); sortear(); }
  }
  if (e.key === 'F11') { e.preventDefault(); api('pantallaCompleta'); }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (!ocupado && confirm('¿Salir de la pantalla del sorteo?')) api('cerrarSorteo');
  }
});

addEventListener('resize', () => {
  // Al cambiar de tamaño, los carretes quietos se vuelven a acomodar.
  if (ocupado) return;
  const h = altoLetra();
  for (const tira of $$('.tira')) {
    const n = tira.children.length - 1;
    tira.style.transform = `translateY(${-n * h}px)`;
  }
});

cargar();
