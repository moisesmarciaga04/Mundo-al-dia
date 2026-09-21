// Actualiza noticias.json leyendo feeds RSS públicos.
// Requiere Node 20 o superior. No usa dependencias externas.
//
// Uso:   node scripts/actualizar-noticias.mjs
// Prueba del lector sin internet:   node scripts/actualizar-noticias.mjs --prueba

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// ------------------------------------------------------------------
// AJUSTES: cambia aquí los feeds y los límites
// ------------------------------------------------------------------
const CONFIG = {
  feeds: [
    { nombre: "BBC Mundo",    url: "https://feeds.bbci.co.uk/mundo/rss.xml" },
    { nombre: "DW Español",   url: "https://rss.dw.com/xml/rss-es-all" },
    { nombre: "Noticias ONU", url: "https://news.un.org/feed/subscribe/es/news/all/rss.xml" }
  ],
  maxPorFeed: 8,          // noticias que se toman de cada feed
  maxTotal: 27,           // noticias en la portada
  maxDias: 3,             // se ignoran notas más viejas que esto
  minimoParaGuardar: 6,   // si salen menos, se conserva el archivo anterior
  maxExtracto: 300,       // largo máximo del extracto (caracteres)
  // Las fotos de los feeds pertenecen a cada medio. Déjalo en false salvo que
  // tengas permiso o aceptes esa responsabilidad. Si es true, se muestran con crédito.
  usarImagenesDelFeed: false,
  archivo: "noticias.json"
};

// Secciones: se elige la que más palabras clave coincida con el titular y el extracto.
const SECCIONES = {
  americas: { etiqueta: "Américas", art: "polar", palabras: [
    "Estados Unidos","EE.UU.","EEUU","Trump","Casa Blanca","Washington","México","Brasil","Argentina","Colombia","Venezuela",
    "Canadá","Panamá","Chile","Perú","Cuba","Ecuador","Bolivia","Uruguay","Paraguay","Haití","Groenlandia","Centroamérica","Latinoamérica","Caribe" ]},
  europa: { etiqueta: "Europa", art: "bars", palabras: [
    "Ucrania","Rusia","Putin","Zelenski","Alemania","Francia","Reino Unido","Unión Europea","UE","Bruselas","Italia","España",
    "OTAN","Polonia","Londres","París","Berlín","Moscú","Kiev","Parlamento Europeo","Europa" ]},
  asia: { etiqueta: "Asia y Medio Oriente", art: "missile", palabras: [
    "Irán","Israel","Gaza","Palestina","China","India","Japón","Arabia Saudita","Yemen","hutíes","Pakistán","Siria","Líbano",
    "Corea","Taiwán","Irak","Afganistán","Qatar","Emiratos","Ormuz","Hezbolá","Tailandia","Indonesia","Filipinas","Birmania","Turquía" ]},
  africa: { etiqueta: "África y Oceanía", art: "boats", palabras: [
    "Sudán","Nigeria","Marruecos","Etiopía","Egipto","Kenia","Sudáfrica","Congo","Yibuti","Somalia","Sahel","Túnez","Libia",
    "Argelia","Mali","Níger","Uganda","Ghana","Camerún","Mozambique","África","Australia","Nueva Zelanda","Oceanía","Pacífico" ]},
  economia: { etiqueta: "Economía", art: "rates", palabras: [
    "economía","inflación","petróleo","bolsa","mercados","banco central","tasas de interés","FMI","Banco Mundial","comercio",
    "aranceles","precios","empleo","deuda","PIB","inversión","empresas","dólar","euro","crudo","Brent" ]},
  ciencia: { etiqueta: "Ciencia y Tecnología", art: "fusion", palabras: [
    "ciencia","científicos","tecnología","inteligencia artificial","IA","salud","espacio","NASA","clima","investigación",
    "energía","fusión","vacuna","satélite","robot","astronomía","cambio climático","biodiversidad","virus","OMS" ]}
};
const POR_DEFECTO = { etiqueta: "Mundo", art: "polar" };

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const normalizar = (s) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function decodificar(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Quita CDATA, etiquetas HTML y entidades
function limpiar(s = "") {
  const sinCdata = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const sinHtml = sinCdata.replace(/<[^>]+>/g, " ");
  return decodificar(sinHtml).replace(/\s+/g, " ").trim();
}

function etiqueta(xml, nombre) {
  const m = xml.match(new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, "i"));
  return m ? m[1] : "";
}

function atributo(xml, nombreTag, attr) {
  const m = xml.match(new RegExp(`<${nombreTag}\\b[^>]*\\b${attr}="([^"]+)"`, "i"));
  return m ? decodificar(m[1]) : "";
}

function recortar(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  return corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "…";
}

function clasificar(texto) {
  const t = normalizar(texto);
  let mejor = null, max = 0;
  for (const [clave, sec] of Object.entries(SECCIONES)) {
    let puntos = 0;
    for (const p of sec.palabras) {
      const re = new RegExp(`(^|[^a-z0-9])${escapar(normalizar(p))}([^a-z0-9]|$)`);
      if (re.test(t)) puntos++;
    }
    if (puntos > max) { max = puntos; mejor = clave; }
  }
  return mejor ? { clave: mejor, ...SECCIONES[mejor] } : { clave: "mundo", ...POR_DEFECTO };
}

function fechaLegible(d) {
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }).replace(/\./g, "");
}

// ------------------------------------------------------------------
// Lectura de un feed RSS 2.0
// ------------------------------------------------------------------
export function leerRss(xml, nombreFuente) {
  const bloques = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  const items = [];
  for (const b of bloques) {
    const titulo = limpiar(etiqueta(b, "title"));
    let url = limpiar(etiqueta(b, "link")) || atributo(b, "link", "href");
    const descripcion = limpiar(etiqueta(b, "description"));
    const fecha = new Date(limpiar(etiqueta(b, "pubDate")) || limpiar(etiqueta(b, "dc:date")));
    const imagen = atributo(b, "media:thumbnail", "url") || atributo(b, "media:content", "url") ||
                   (/type="image/i.test(b) ? atributo(b, "enclosure", "url") : "");
    if (!titulo || titulo.length < 15 || !/^https?:\/\//.test(url) || isNaN(fecha)) continue;
    items.push({ titulo, url, descripcion, fecha, imagen, fuente: nombreFuente });
  }
  return items;
}

async function descargar(feed) {
  const r = await fetch(feed.url, {
    headers: { "User-Agent": "MundoAlDia/1.0 (lector RSS)", "Accept": "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return leerRss(await r.text(), feed.nombre);
}

// ------------------------------------------------------------------
// Armado de la portada
// ------------------------------------------------------------------
export function armarPortada(porFeed, ahora = new Date()) {
  const limite = ahora.getTime() - CONFIG.maxDias * 86400000;
  const vistosUrl = new Set(), vistosTitulo = new Set();
  const elegidos = [];

  for (const lista of porFeed) {
    const recientes = lista
      .filter((i) => i.fecha.getTime() >= limite && i.fecha.getTime() <= ahora.getTime() + 3600000)
      .sort((a, b) => b.fecha - a.fecha)
      .slice(0, CONFIG.maxPorFeed);
    for (const i of recientes) {
      const claveTitulo = normalizar(i.titulo).slice(0, 60);
      if (vistosUrl.has(i.url) || vistosTitulo.has(claveTitulo)) continue;
      vistosUrl.add(i.url); vistosTitulo.add(claveTitulo);
      elegidos.push(i);
    }
  }

  elegidos.sort((a, b) => b.fecha - a.fecha);

  return elegidos.slice(0, CONFIG.maxTotal).map((i) => {
    const sec = clasificar(`${i.titulo} ${i.descripcion}`);
    const extracto = i.descripcion && normalizar(i.descripcion) !== normalizar(i.titulo)
      ? recortar(i.descripcion, CONFIG.maxExtracto)
      : `Consulta la noticia completa en ${i.fuente}.`;
    const item = {
      r: sec.clave, tag: sec.etiqueta, art: sec.art,
      t: i.titulo, s: extracto,
      src: i.fuente, url: i.url, d: fechaLegible(i.fecha)
    };
    if (CONFIG.usarImagenesDelFeed && i.imagen) { item.img = i.imagen; item.credit = `Imagen: ${i.fuente}`; }
    return item;
  });
}

// ------------------------------------------------------------------
// Programa principal
// ------------------------------------------------------------------
async function principal() {
  const resultados = await Promise.allSettled(CONFIG.feeds.map(descargar));
  const listas = [];
  resultados.forEach((res, k) => {
    const nombre = CONFIG.feeds[k].nombre;
    if (res.status === "fulfilled") { console.log(`OK  ${nombre}: ${res.value.length} notas leídas`); listas.push(res.value); }
    else console.warn(`FALLÓ ${nombre}: ${res.reason?.message || res.reason}`);
  });

  const items = armarPortada(listas);
  if (items.length < CONFIG.minimoParaGuardar) {
    console.warn(`Solo se obtuvieron ${items.length} notas (mínimo ${CONFIG.minimoParaGuardar}). Se conserva ${CONFIG.archivo} anterior.`);
    return;
  }
  await writeFile(CONFIG.archivo, JSON.stringify({ actualizado: new Date().toISOString(), items }, null, 2) + "\n");
  console.log(`Guardadas ${items.length} noticias en ${CONFIG.archivo}`);
}

// Prueba sin internet: comprueba que el lector entiende un feed de ejemplo
async function prueba() {
  const ahora = new Date();
  const rfc = ahora.toUTCString();
  const xml = `<?xml version="1.0"?><rss><channel>
  <item><title><![CDATA[Bancos centrales suben tasas de interés por la inflación y el petróleo]]></title>
   <link>https://ejemplo.com/a</link><description><![CDATA[<p>Los <b>mercados</b> reaccionan &amp; el crudo sube.</p>]]></description><pubDate>${rfc}</pubDate></item>
  <item><title>Ucrania y Rusia intercambian ataques con drones en la frontera</title>
   <link>https://ejemplo.com/b</link><description>Nueva ronda de ataques.</description><pubDate>${rfc}</pubDate></item>
  <item><title>Título corto</title><link>https://ejemplo.com/c</link><pubDate>${rfc}</pubDate></item>
  </channel></rss>`;
  const leidos = leerRss(xml, "Fuente de prueba");
  console.log(JSON.stringify(armarPortada([leidos], ahora), null, 2));
}

if (process.argv[2] === "--prueba") await prueba();
else if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
