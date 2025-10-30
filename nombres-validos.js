
// nombres-validos.js — 40 mujeres + 40 hombres + 50 apodos y validadores

const MUJERES = [
  "agustina","camila","sofia","florencia","valentina","lucia","julieta","martina","micaela","maria",
  "rocio","carla","paula","daniela","natalia","ana","victoria","morena","candela","milagros",
  "abril","constanza","carolina","eugenia","fernanda","bianca","josefina","lara","pilar","belen",
  "gabriela","noelia","brenda","melina","vanesa","romina","celeste","ailen","tatiana","jimena"
];

const MUJERES_DIM = [
  "agus","cami","sofi","flor","vale","valen","lu","juli","martu","tina","mica","mari",
  "rochi","car","pau","dani","nati","ani","vicky","more","cande","mili","abri","coni","cony",
  "caro","euge","fer","bian","jose","lari","pili","belu","gabi","noe","bren","meli","vane","romi","cele","ailu","tati","jime"
];

const HOMBRES = [
  "lucas","juan","nicolas","matias","facundo","agustin","federico","gonzalo","lautaro","tomas",
  "franco","bruno","santiago","rodrigo","martin","diego","alejandro","maximiliano","mariano","emiliano",
  "cristian","pablo","sebastian","andres","leandro","damian","ezequiel","german","fernando","marcelo",
  "adrian","claudio","sergio","javier","ramiro","leonardo","ivan","jorge","rodrigo","esteban"
];

const HOMBRES_DIM = [
  "luqui","luco","juani","nico","mati","facu","agus","fede","gonza","lauti","tomi","fran","bru","santi",
  "rodri","tincho","dieguito","ale","maxi","maru","emi","cris","pablito","seba","andy","lean","dami","eze",
  "ger","gero","fer","marce","adri","clau","sergi","javi","rami","leo","ivi","jor","ro","esti"
];

const APODOS = [
  "luli","coti","majo","pitu","chino","negra","negrito","colo","pola","gordo",
  "gorda","pame","lolo","nono","nona","cachi","pochi","fio","pipi","cucu",
  "bebu","charly","chula","cata","coco","momo","roro","nini","kike","nacho",
  "toti","gigi","mili","tato","cami","fefi","lucho","pato","rodo","titi",
  "feli","rina","dolo","nico","sol","meli","vane","romi","belu","gabi"
];

const DEFAULT_PROBLEM_KEYWORDS = [
  "no enciende","no prende","no arranca","pantalla","negra","sin imagen","no inicia","windows",
  "internet","wifi","lento","muy lento","calienta","teclado","touchpad","bateria","batería",
  "carga","cargador","impresora","sonido","audio","apago","apagó","reinicia","formatear","virus","malware"
];

function normalizar(s = "") {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\sa-zñü]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function contieneProblema(texto, extraKeywords = []) {
  const t = normalizar(texto);
  const kws = (extraKeywords && Array.isArray(extraKeywords) ? extraKeywords : []).map(normalizar);
  const all = new Set([...DEFAULT_PROBLEM_KEYWORDS.map(normalizar), ...kws]);
  for (const k of all) {
    if (k && t.includes(k)) return true;
  }
  if (/no\s+(enciende|prende|arranca|inicia|funciona)/i.test(t)) return true;
  return false;
}

export function extraerNombre(texto) {
  const t = texto.trim();
  const rx = /(?:^|\b)(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+([a-záéíóúñü][a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){0,2})\b/i;
  const m = t.match(rx);
  if (m) return m[1];
  if (/^[a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){0,2}$/i.test(t)) return t;
  return null;
}

function enListas(nombre) {
  const n = normalizar(nombre);
  return (
    MUJERES.includes(n) || MUJERES_DIM.includes(n) ||
    HOMBRES.includes(n) || HOMBRES_DIM.includes(n) ||
    APODOS.includes(n)
  );
}

export function esNombreValido(input) {
  if (!input) return false;
  const n = normalizar(input);
  if (contieneProblema(n)) return false;
  if (!/^[a-zñü\s]{2,25}$/i.test(n)) return false;
  const palabras = n.split(' ');
  if (palabras.length > 3) return false;
  if (enListas(n)) return true;
  if (palabras.length <= 3) return true; // heurística flexible
  return false;
}
