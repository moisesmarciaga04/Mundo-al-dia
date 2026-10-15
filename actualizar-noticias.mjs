// Actualiza noticias.json leyendo feeds RSS públicos.
// Enfocado en economía global, bolsa de valores (EE. UU. e internacional)
// y una sección propia dedicada solo al petróleo.
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
    { nombre: "Noticias ONU", url: "https://news.un.org/feed/subscribe/es/news/all/rss.xml" },
    { nombre: "Investing.com",    url: "https://es.investing.com/rss/news.rss" },
    { nombre: "El Economista",    url: "https://www.eleconomista.com.mx/rss/ultimas-noticias" },
    { nombre: "Expansión",        url: "https://e00-expansion.uecdn.es/rss/portada.xml" },
    { nombre: "Infobae Economía", url: "https://www.infobae.com/arc/outboundfeeds/rss/category/economia/?outputType=xml" }
  ],
  maxPorFeed: 40,
  maxTotal: 80,
  maxDias: 5,             // se prefieren notas de estos últimos días
  maxDiasRespaldo: 14,    // si una sección no junta el mínimo, se buscan notas de hasta estos días atrás
  minimoPorSeccion: 3,    // noticias mínimas que se intentan garantizar por sección
  minimoParaGuardar: 6,
  maxExtracto: 500,
  usarImagenesDelFeed: true,
  archivo: "noticias.json",
  cuotas: { economia: 32, petroleo: 14, europa: 6, americas: 6, asia: 6, africa: 4, ciencia: 4, mundo: 6 }
};

const SECCIONES = {
  economia: { etiqueta: "Economía y Bolsa", art: "rates", palabras: [
    "economía","economia","inflación","inflacion","bolsa","bolsas","bolsa de valores","mercados","mercado financiero",
    "banco central","bancos centrales","tasas de interés","tasa de interes","tipos de interés","FMI","Banco Mundial",
    "comercio","aranceles","sanciones económicas","precios","empleo","desempleo","deuda","déficit","presupuesto",
    "gasto público","impuestos","PIB","producto interno bruto","inversión","inversion","empresas","dólar","dolar",
    "euro","yuan","Wall Street","Dow Jones","S&P 500","Nasdaq","IBEX 35","Ibex35","bolsa de Nueva York","NYSE",
    "mercados emergentes","renta variable","renta fija","fondo de inversión","acciones","bono","bonos",
    "criptomonedas","bitcoin","Reserva Federal","Fed","BCE","recesión","recesion","crecimiento económico",
    "exportaciones","importaciones","divisa","tipo de cambio","subsidios","política monetaria","política fiscal" ]},
  petroleo: { etiqueta: "Petróleo", art: "oilrig", palabras: [
    "petróleo","petroleo","crudo","Brent","WTI","OPEP","OPEP+","barril","barriles","refinería","refineria",
    "oleoducto","producción petrolera","produccion petrolera","reservas petroleras","exportaciones de petróleo",
    "sanciones petroleras","Aramco","Pemex","Ecopetrol","YPF","gasolina","diésel","diesel","gas natural",
    "estrecho de Ormuz","Hormuz","petrolero","tanquero","yacimiento petrolero","campo petrolero" ]},
  americas: { etiqueta: "Américas", art: "polar", palabras: [
    "Estados Unidos","EE.UU.","EEUU","Trump","Casa Blanca","Washington","México","Brasil","Argentina","Colombia","Venezuela",
    "Canadá","Panamá","Chile","Perú","Cuba","Ecuador","Bolivia","Uruguay","Paraguay","Haití","Groenlandia","Centroamérica","Latinoamérica","Caribe" ]},
  europa: { etiqueta: "Europa", art: "bars", palabras: [
    "Ucrania","Rusia","Putin","Zelenski","Alemania","Francia","Reino Unido","Unión Europea","UE","Bruselas","Italia","España",
    "OTAN","Polonia","Londres","París","Berlín","Moscú","Kiev","Parlamento Europeo","Europa" ]},
  asia: { etiqueta: "Asia y Medio Oriente", art: "missile", palabras: [
    "Irán","Israel","Gaza","Palestina","China","India","Japón","Arabia Saudita","Yemen","hutíes","Pakistán","Siria","Líbano",
    "Corea","Taiwán","Irak","Afganistán","Qatar","Emiratos","Hezbolá","Tailandia","Indonesia","Filipinas","Birmania","Turquía" ]},
  africa: { etiqueta: "África y Oceanía", art: "boats", palabras: [
    "Sudán","Nigeria","Marruecos","Etiopía","Egipto","Kenia","Sudáfrica","Congo","Yibuti","Somalia","Sahel","Túnez","Libia",
    "Argelia","Mali","Níger","Uganda","Ghana","Camerún","Mozambique","África","Australia","Nueva Zelanda","Oceanía","Pacífico" ]},
  ciencia: { etiqueta: "Ciencia y Tecnología", art: "fusion", palabras: [
    "ciencia","científicos","tecnología","inteligencia artificial","IA","salud","espacio","NASA","clima","investigación",
    "energía","fusión","vacuna","satélite","robot","astronomía","cambio climático","biodiversidad","virus","OMS" ]}
};
const POR_DEFECTO = { etiqueta: "Mundo", art: "polar" };

const normalizar = (s) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function decodificar(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

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
    headers: { "User-Agent": "ClaveMundial/1.0 (lector RSS)", "Accept": "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return leerRss(await r.text(), feed.nombre);
}

export function armarPortada(porFeed, ahora = new Date()) {
  const vistosUrl = new Set(), vistosTitulo = new Set();
  const todos = [];

  // Primero se juntan todas las noticias recibidas, sin filtrar aún por fecha,
  // para poder usar las más viejas como respaldo si una sección se queda corta.
  for (const lista of porFeed) {
    const ordenado = [...lista]
      .filter((i) => i.fecha.getTime() <= ahora.getTime() + 3600000) // descarta fechas futuras erróneas
      .sort((a, b) => b.fecha - a.fecha)
      .slice(0, CONFIG.maxPorFeed);
    for (const i of ordenado) {
      const claveTitulo = normalizar(i.titulo).slice(0, 60);
      if (vistosUrl.has(i.url) || vistosTitulo.has(claveTitulo)) continue;
      vistosUrl.add(i.url); vistosTitulo.add(claveTitulo);
      todos.push(i);
    }
  }

  todos.sort((a, b) => b.fecha - a.fecha);
  const clasificados = todos.map((i) => ({ ...i, sec: clasificar(`${i.titulo} ${i.descripcion}`) }));

  const porSeccion = {};
  for (const it of clasificados) {
    (porSeccion[it.sec.clave] ||= []).push(it); // ya viene ordenado de más nuevo a más viejo
  }

  const limite = ahora.getTime() - CONFIG.maxDias * 86400000;
  const limiteRespaldo = ahora.getTime() - CONFIG.maxDiasRespaldo * 86400000;

  const finales = [];
  const usados = new Set();
  for (const [clave, cuota] of Object.entries(CONFIG.cuotas)) {
    const lista = porSeccion[clave] || [];
    let elegidosSec = lista.filter((it) => it.fecha.getTime() >= limite).slice(0, cuota);

    // Respaldo: si la sección no junta el mínimo con noticias recientes,
    // se completa con las noticias de esa misma sección un poco más viejas,
    // en vez de dejarla vacía.
    if (elegidosSec.length < CONFIG.minimoPorSeccion) {
      const yaElegidas = new Set(elegidosSec.map((it) => it.url));
      for (const it of lista) {
        if (elegidosSec.length >= CONFIG.minimoPorSeccion) break;
        if (yaElegidas.has(it.url)) continue;
        if (it.fecha.getTime() < limiteRespaldo) continue;
        elegidosSec.push(it); yaElegidas.add(it.url);
      }
      elegidosSec.sort((a, b) => b.fecha - a.fecha);
    }

    for (const it of elegidosSec) { finales.push(it); usados.add(it.url); }
  }
  if (finales.length < CONFIG.maxTotal) {
    for (const it of clasificados) {
      if (finales.length >= CONFIG.maxTotal) break;
      if (!usados.has(it.url)) { finales.push(it); usados.add(it.url); }
    }
  }
  finales.sort((a, b) => b.fecha - a.fecha);

  return finales.slice(0, CONFIG.maxTotal).map((i) => {
    const extracto = i.descripcion && normalizar(i.descripcion) !== normalizar(i.titulo)
      ? recortar(i.descripcion, CONFIG.maxExtracto)
      : `Consulta la noticia completa en ${i.fuente}.`;
    const item = {
      r: i.sec.clave, tag: i.sec.etiqueta, art: i.sec.art,
      t: i.titulo, s: extracto,
      src: i.fuente, url: i.url, d: fechaLegible(i.fecha)
    };
    if (CONFIG.usarImagenesDelFeed && i.imagen) { item.img = i.imagen; item.credit = `Imagen: ${i.fuente}`; }
    return item;
  });
}

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

async function prueba() {
  const ahora = new Date();
  const rfc = ahora.toUTCString();
  const xml = `<?xml version="1.0"?><rss><channel>
  <item><title><![CDATA[Bancos centrales suben tasas de interés por la inflación y el petróleo]]></title>
   <link>https://ejemplo.com/a</link><description><![CDATA[<p>Los <b>mercados</b> reaccionan &amp; el crudo sube.</p>]]></description><pubDate>${rfc}</pubDate></item>
  <item><title>Wall Street cierra con fuertes alzas en el Dow Jones y el Nasdaq</title>
   <link>https://ejemplo.com/b</link><description>Las acciones tecnológicas impulsaron la bolsa.</description><pubDate>${rfc}</pubDate></item>
  <item><title>El precio del barril de Brent sube tras un recorte de la OPEP+</title>
   <link>https://ejemplo.com/c</link><description>El crudo cotiza al alza tras el anuncio.</description><pubDate>${rfc}</pubDate></item>
  <item><title>Título corto</title><link>https://ejemplo.com/d</link><pubDate>${rfc}</pubDate></item>
  </channel></rss>`;
  const leidos = leerRss(xml, "Fuente de prueba");
  console.log(JSON.stringify(armarPortada([leidos], ahora), null, 2));
}

if (process.argv[2] === "--prueba") await prueba();
else if (import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
