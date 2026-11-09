# Saca del logo original (fondo naranja con remolinos) las piezas que usa el programa:
#   recursos/logo-color.png   carpa y letras sobre fondo transparente (pantallas)
#   recursos/logo-bn-80.png   blanco y negro puro para papel de 80 mm
#   recursos/logo-bn-70.png   blanco y negro puro para papel de 70/76 mm (Star SP700)
#   recursos/logo-bn-58.png   blanco y negro puro para papel de 58 mm
#   build/icono.ico + recursos/icono.png   icono del programa y del instalador
# Uso: python -I scripts/logo.py   (desde la carpeta del proyecto)
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

raiz = Path(__file__).resolve().parent.parent
original = Image.open(raiz / 'recursos' / 'logo-original.jpg').convert('RGB')

# Solo la zona de la carpa, el nombre y el eslogan: lo demás es remolino.
caja = (130, 245, 1500, 1135)
zona = original.crop(caja)
w, h = zona.size
px = zona.load()

ROJO = (234, 78, 27)
alfa_negro = Image.new('L', (w, h), 0)
alfa_rojo = Image.new('L', (w, h), 0)
an, ar = alfa_negro.load(), alfa_rojo.load()

def limitar(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v

for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        # Negro: cuanto más oscuro, más tinta.
        n = limitar((200 - max(r, g, b)) / 150)
        # Rojo de la carpa mezclado con blanco: G y B bajan juntos en esa proporción.
        # El naranja de los remolinos tiene B ~ 0 con G alto y no encaja.
        t = limitar((255 - b) / 228)
        g_esperado = 255 - 177 * t
        rr = t if (r > 190 and abs(g - g_esperado) < 34 and n < 0.5) else 0.0
        an[x, y] = int(n * 255)
        ar[x, y] = int(rr * 255)

tinta = ImageChops.lighter(alfa_negro, alfa_rojo)
# Las orillas de los remolinos dejan rayitas finas del mismo tono que la carpa: se borran
# quedándose solo con trazos gruesos (abrir la máscara) y un margen para el suavizado.
fuerte = tinta.point(lambda v: 255 if v > 170 else 0)
grueso = fuerte.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
permitido = grueso.filter(ImageFilter.MaxFilter(9))
alfa_negro = ImageChops.multiply(alfa_negro, permitido)
alfa_rojo = ImageChops.multiply(alfa_rojo, permitido)
an, ar = alfa_negro.load(), alfa_rojo.load()
tinta = ImageChops.lighter(alfa_negro, alfa_rojo)
borde = tinta.point(lambda v: 255 if v > 40 else 0).getbbox()

# Logo a color con fondo transparente.
color = Image.new('RGBA', (w, h))
cp = color.load()
for y in range(h):
    for x in range(w):
        a_n, a_r = an[x, y], ar[x, y]
        if a_n >= a_r:
            cp[x, y] = (17, 17, 17, a_n)
        else:
            cp[x, y] = (*ROJO, a_r)
color = color.crop(borde)
color = color.resize((900, round(900 * color.height / color.width)), Image.LANCZOS)
color.save(raiz / 'recursos' / 'logo-color.png', optimize=True)

# Blanco y negro puro, al tamaño exacto en puntos de una impresora de 203 ppp,
# para que el controlador no tenga que reescalar ni tramar grises.
tinta_rec = tinta.crop(borde)
for papel, ancho in ((80, 448), (70, 384), (58, 336)):
    alto = round(ancho * tinta_rec.height / tinta_rec.width)
    chico = tinta_rec.resize((ancho, alto), Image.LANCZOS)
    bn = chico.point(lambda v: 0 if v > 110 else 255).convert('1')
    bn.save(raiz / 'recursos' / f'logo-bn-{papel}.png', optimize=True)

# Icono: la carpa roja sobre un cuadro blanco redondeado con borde naranja.

carpa = alfa_rojo.copy()
carpa = carpa.crop((380, 0, 990, 580))  # coordenadas dentro de la zona recortada
carpa = carpa.crop(carpa.point(lambda v: 255 if v > 40 else 0).getbbox())
lado = 1024
icono = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
d = ImageDraw.Draw(icono)
d.rounded_rectangle((24, 24, lado - 24, lado - 24), radius=210, fill=(255, 168, 0, 255))
d.rounded_rectangle((96, 96, lado - 96, lado - 96), radius=150, fill=(255, 255, 255, 255))
escala = 600 / max(carpa.size)
carpa = carpa.resize((round(carpa.width * escala), round(carpa.height * escala)), Image.LANCZOS)
capa = Image.new('RGBA', carpa.size, (*ROJO, 255))
capa.putalpha(carpa)
icono.alpha_composite(capa, ((lado - carpa.width) // 2, (lado - carpa.height) // 2 + 10))
icono.resize((512, 512), Image.LANCZOS).save(raiz / 'recursos' / 'icono.png')
icono.save(raiz / 'build' / 'icono.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('listo', color.size, tinta_rec.size)
