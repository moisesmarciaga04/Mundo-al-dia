# Mundo al Día: sitio de noticias con actualización diaria

Este proyecto publica tu página gratis en **GitHub Pages** y la actualiza sola cada mañana.

**Cómo funciona:** cada día, GitHub ejecuta `scripts/actualizar-noticias.mjs`, que lee los feeds RSS públicos de BBC Mundo, DW Español y Noticias ONU, arma `noticias.json` y vuelve a publicar la página. Tú no tienes que hacer nada después de la instalación.

## Qué contiene

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página (diseño, portada, página de cada noticia, sala de prensa). |
| `noticias.json` | Las noticias. Trae 9 noticias de ejemplo del 20 de septiembre de 2026; se reemplazan en la primera ejecución. |
| `scripts/actualizar-noticias.mjs` | Lee los feeds y genera `noticias.json`. |
| `.github/workflows/actualizar.yml` | Programa la ejecución diaria y publica la página. |

## Instalación (una sola vez, unos 15 minutos)

1. **Crea una cuenta gratis** en [github.com](https://github.com).
2. Pulsa **New repository** (el botón verde o el "+" arriba a la derecha). Ponle de nombre `mundo-al-dia`, márcalo como **Public** y pulsa **Create repository**.
3. **Sube los archivos.** En la página del repositorio elige **uploading an existing file** y arrastra todo el contenido de esta carpeta (`index.html`, `noticias.json`, la carpeta `scripts` y la carpeta `.github`). Pulsa **Commit changes**.
   - Si tu computadora oculta la carpeta `.github` y no se sube, créala a mano: **Add file > Create new file**, escribe como nombre `.github/workflows/actualizar.yml`, pega el contenido del archivo del mismo nombre y pulsa **Commit changes**.
4. Ve a **Settings > Pages**. En **Source** elige **GitHub Actions**.
5. Ve a la pestaña **Actions**. Si aparece un aviso para habilitar los workflows, acéptalo. Elige **Actualizar noticias y publicar** y pulsa **Run workflow**.
6. Espera 1 o 2 minutos. Cuando aparezca una marca verde, tu página estará en:
   `https://TU-USUARIO.github.io/mundo-al-dia/`

Desde ahí se actualiza sola todos los días a las 6:00 a. m. (hora de Panamá).

## Usarla dentro de Google Sites

En tu sitio de Google Sites: **Insertar > Insertar código**, pestaña **Incorporar**, elige **Por URL** y pega el enlace de tu página de GitHub Pages. También puedes usar directamente el enlace de GitHub Pages como tu sitio.

## Personalizar

- **Correo de contacto:** en `index.html`, busca `correo:` cerca del final y cámbialo.
- **Medios que se leen:** en `scripts/actualizar-noticias.mjs`, edita la lista `feeds`. Añade cualquier feed RSS 2.0 con este formato: `{ nombre: "Medio", url: "https://..." }`.
- **Cuántas noticias:** `maxTotal` (portada) y `maxPorFeed` (por medio).
- **Hora de actualización:** en `.github/workflows/actualizar.yml`, la línea `cron`. La hora está en UTC (Panamá = UTC menos 5).
- **Secciones:** el script asigna cada noticia a una sección según palabras clave (`SECCIONES` en el script). Si una noticia cae en la sección equivocada, agrega o quita palabras ahí.
- **Ejecutarlo a mano:** pestaña **Actions > Actualizar noticias y publicar > Run workflow**.

## Cosas que debes saber

- **Qué muestra cada noticia:** el titular, un extracto corto y un enlace grande a la fuente original. No se copia el texto completo de los medios. Eso es intencional: es lo correcto con los derechos de autor.
- **Imágenes:** son ilustraciones propias de la página. El script puede usar las fotos de los feeds (`usarImagenesDelFeed: true`), pero esas fotos pertenecen a cada medio. Actívalo solo si tienes permiso.
- **Los feeds cambian:** las direcciones de los feeds pueden cambiar. Si una falla, el script lo avisa en el registro (pestaña **Actions**, dentro de la ejecución) y sigue con los demás. Si en total obtiene menos de 6 noticias, conserva las anteriores.
- **Revisa la portada de vez en cuando.** Es una lectura automática de titulares y no hay una persona revisando cada nota. Si publicas esto como medio, conviene que alguien la mire a diario.
- **Sin actividad, GitHub pausa las tareas programadas** después de 60 días. Este proyecto guarda `noticias.json` cada día, lo que cuenta como actividad. Si aun así se pausa, actívala de nuevo en la pestaña **Actions**.
- **Probar el lector sin internet:** `node scripts/actualizar-noticias.mjs --prueba`.
- **Ver la página en tu computadora:** el navegador no deja leer `noticias.json` desde un archivo local. Usa GitHub Pages, o en la carpeta ejecuta `python3 -m http.server` y abre `http://localhost:8000`.
