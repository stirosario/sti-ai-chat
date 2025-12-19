/**
 * deviceDetection.js
 * Módulo para detección de dispositivos ambiguos (exportable para tests)
 * Separado de server.js para permitir imports ES6 en tests
 */

import { normalizarTextoCompleto } from './normalizarTexto.js';

// ========================================================
// 🎯 SISTEMA DE DESAMBIGUACIÓN DE DISPOSITIVOS
// ========================================================
// Detecta términos ambiguos (compu, equipo, pantalla) y sugiere dispositivos específicos
// ACTUALIZACIÓN 2025-11-25: Agregado soporte para typos comunes (kompu, pamtaya, screan, etc.)

export const DEVICE_DISAMBIGUATION = {
  // Almacenamiento (ML Training: 7,350 casos) - PRIMERO para evitar match con "disco" genérico
  'disco|rigido|rígido|ssd|externo|pendrive|pen drive|memoria|tarjeta|nas|gabinete|almacenamiento|storage|disc|disk|rigid|idisco|diisco|discco|ddisco|disce|dissc|disoc|dico|disgo|dksco|discl|disfo|irgido|rigidi|rigidp|rogido|riigido|rigdo|rignido|rigidokno': {
    candidates: [
      { 
        id: 'DISCO_RIGIDO', 
        icon: '💿', 
        label: 'Disco Rígido / HDD',
        description: 'Disco duro interno (mecánico)',
        keywords: ['disco', 'rigido', 'rígido', 'hdd', 'mecanico', 'mecánico', 'interno', 'pasa', 'estoy', 'casi', 'mismo', 'uso', 'conecté', 'equipo', 'actualicé', 'windows', 'ayer', 'media', 'hora', 'conecto', 'lento', 'ruido', 'clicking', 'detecta', 'computadora']
      },
      { 
        id: 'SSD', 
        icon: '⚡', 
        label: 'SSD',
        description: 'Disco sólido (más rápido)',
        keywords: ['ssd', 'solido', 'sólido', 'solid state', 'rapido', 'rápido', 'estoy', 'uso', 'media', 'hora', 'pasa', 'jugando', 'trabajando', 'actualicé', 'windows', 'empieza', 'fallar', 'después', 'rato', 'computadora', 'nvme', 'm.2', 'sata']
      },
      { 
        id: 'DISCO_EXTERNO', 
        icon: '🔌', 
        label: 'Disco Externo',
        description: 'Disco duro externo por USB',
        keywords: ['disco', 'externo', 'external', 'usb', 'portable', 'portátil', 'pasa', 'estoy', 'algunas', 'casi', 'mismo', 'cada', 'reinicio', 'jugando', 'uso', 'actualicé', 'windows', 'tira', 'error', 'desconecta', 'fuente', 'alimentacion']
      },
      { 
        id: 'PENDRIVE', 
        icon: '📀', 
        label: 'Pendrive / USB',
        description: 'Memoria USB flash drive',
        keywords: ['pendrive', 'pen drive', 'flash drive', 'usb', 'stick', 'memoria usb', 'pasa', 'uso', 'estoy', 'empieza', 'fallar', 'después', 'rato', 'media', 'hora', 'casi', 'mismo', 'actualicé', 'windows', 'trabajando', 'reconoce', 'formatea']
      },
      { 
        id: 'MEMORIA_SD', 
        icon: '💳', 
        label: 'Tarjeta SD',
        description: 'Tarjeta de memoria para cámaras/celulares',
        keywords: ['memoria', 'tarjeta', 'sd', 'micro sd', 'microsd', 'camara', 'cámara', 'celular', 'telefono', 'teléfono', 'adaptador', 'pasa', 'uso', 'algunas', 'estoy', 'trabajando', 'casi', 'mismo', 'dejó', 'funcionar', 'golpe', 'media', 'hora', 'desconecta', 'actualicé']
      },
      { 
        id: 'NAS', 
        icon: '💾', 
        label: 'NAS',
        description: 'Servidor de almacenamiento en red',
        keywords: ['nas', 'network storage', 'servidor', 'red', 'ethernet', 'compartido', 'backup', 'pasa', 'estoy', 'uso', 'algunas', 'cada', 'reinicio', 'jugando', 'ayer', 'actualicé', 'windows', 'conecté', 'equipo', 'casi', 'mismo', 'acceso', 'carpeta', 'compartida']
      },
      { 
        id: 'GABINETE_EXTERNO', 
        icon: '💾', 
        label: 'Gabinete Externo',
        description: 'Carcasa externa para discos internos',
        keywords: ['gabinete', 'carcasa', 'enclosure', 'externo', 'externa', 'sata to usb', 'adaptador disco', 'estoy', 'pasa', 'uso', 'conecté', 'equipo', 'jugando', 'actualicé', 'windows', 'algunas', 'responde', 'casi', 'mismo', 'trabajando', 'fuente', 'alimentacion']
      }
    ]
  },
  
  // Computadoras - términos genéricos + typos
  'compu|computadora|equipo|maquina|máquina|torre|aparato|ordenador|pc\\b|notebook|laptop|portatil|portátil|dispositivo|kompu|komputer|komputadora|compuetr|computr|divice|devize|devise|aparto|dispocitivo|dispositibo': {
    candidates: [
      { 
        id: 'PC_DESKTOP', 
        icon: '💻', 
        label: 'PC de Escritorio',
        description: 'Torre con monitor separado',
        keywords: ['torre', 'gabinete', 'debajo escritorio', 'cables', 'cpu', 'fuente', 'placa madre', 'desktop', 'ventilador']
      },
      { 
        id: 'NOTEBOOK', 
        icon: '💼', 
        label: 'Notebook / Laptop',
        description: 'Computadora portátil con batería',
        keywords: ['bateria', 'batería', 'battery', 'batery', 'touchpad', 'tapa', 'portatil', 'portátil', 'llevar', 'cerrar', 'abrir', 'notebook', 'laptop', 'cargador', 'cargadoor', 'cargadorrr', 'chager', 'charger', 'desconecto', 'desconectar', 'sobrecalentamiento', 'unpluged']
      },
      { 
        id: 'ALL_IN_ONE', 
        icon: '🖥️', 
        label: 'All-in-One',
        description: 'Pantalla y procesador integrados',
        keywords: ['pantalla tactil', 'táctil', 'tactil', 'todo junto', 'sin torre', 'integrado', 'un solo equipo', 'all in one', 'aio', 'touch']
      }
    ]
  },
  
  // Pantallas - puede ser monitor o parte de dispositivo + typos
  'pantalla|monitor|display|screen|imagen|pamtaya|panatya|panatlla|pantaya|pantasha|pantalya|screan|scren|screenn|imajen': {
    candidates: [
      { 
        id: 'MONITOR', 
        icon: '🖥️', 
        label: 'Monitor Externo',
        description: 'Pantalla conectada a PC',
        keywords: ['hdmi', 'vga', 'displayport', 'entrada', 'segundo monitor', 'externo', 'cable', 'input', 'signal', 'señal', 'senal', 'señaal', 'senyal', 'sin señal', 'no signal', 'signall', 'conectada']
      },
      { 
        id: 'NOTEBOOK_SCREEN', 
        icon: '💼', 
        label: 'Pantalla de Notebook',
        description: 'Pantalla integrada de laptop',
        keywords: ['integrada', 'bisagras', 'tapa', 'notebook', 'laptop', 'cerrar pantalla', 'portatil', 'portátil', 'bateria', 'batería', 'battery', 'batery']
      },
      { 
        id: 'ALL_IN_ONE_SCREEN', 
        icon: '🖥️', 
        label: 'Pantalla All-in-One',
        description: 'Computadora todo en uno',
        keywords: ['tactil', 'táctil', 'todo junto', 'integrado', 'sin torre', 'all in one', 'touch']
      },
      { 
        id: 'TV', 
        icon: '📺', 
        label: 'TV / Smart TV',
        description: 'Televisor',
        keywords: ['control remoto', 'canales', 'smart tv', 'televisor', 'hdmi tv', 'chromecast', 'fire tv', 'tv', 'television', 'streaming']
      }
    ]
  },
  
  // Mouse / Ratón + typos
  'raton|ratón|mouse|bicho|touchpad|cursor|mause|cursos|crusor': {
    candidates: [
      { 
        id: 'MOUSE_WIRELESS', 
        icon: '🖱️', 
        label: 'Mouse Inalámbrico',
        description: 'Mouse sin cable (Bluetooth/RF)',
        keywords: ['pilas', 'bateria', 'batería', 'battery', 'batery', 'bluetooth', 'bluetut', 'blutuz', 'bluetoth', 'sin cable', 'inalambrico', 'inalámbrico', 'dongle', 'wireless']
      },
      { 
        id: 'MOUSE_USB', 
        icon: '🖱️', 
        label: 'Mouse USB',
        description: 'Mouse con cable USB',
        keywords: ['cable', 'conectado', 'puerto', 'usb', 'alambrico', 'alámbrico', 'con cable']
      },
      { 
        id: 'TOUCHPAD', 
        icon: '👆', 
        label: 'Touchpad',
        description: 'Mouse táctil de notebook',
        keywords: ['integrado', 'notebook', 'laptop', 'tactil', 'táctil', 'panel', 'touchpad']
      }
    ]
  },
  
  // Teclado + typos
  'teclado|keyboard|teclas|teclaco|keybord': {
    candidates: [
      { 
        id: 'KEYBOARD_WIRELESS', 
        icon: '⌨️', 
        label: 'Teclado Inalámbrico',
        description: 'Teclado sin cable',
        keywords: ['pilas', 'bateria', 'batería', 'battery', 'batery', 'bluetooth', 'bluetut', 'blutuz', 'sin cable', 'inalambrico', 'inalámbrico']
      },
      { 
        id: 'KEYBOARD_USB', 
        icon: '⌨️', 
        label: 'Teclado USB',
        description: 'Teclado con cable USB',
        keywords: ['cable', 'conectado', 'puerto', 'usb', 'alambrico', 'alámbrico']
      },
      { 
        id: 'KEYBOARD_NOTEBOOK', 
        icon: '💼', 
        label: 'Teclado de Notebook',
        description: 'Teclado integrado de laptop',
        keywords: ['integrado', 'notebook', 'laptop', 'incorporado']
      }
    ]
  },
  
  // Impresión y Digitalización (ML Training: 6,300 casos) + typos
  'impresora|impresion|imprimir|printer|escaner|escanear|scan|plotter|multifuncion|laser|inkjet|tinta|termica|matricial|impreora|impesora|impresor|impreesora': {
    candidates: [
      { 
        id: 'IMPRESORA_LASER', 
        icon: '🖨️', 
        label: 'Impresora Láser',
        description: 'Impresora láser (blanco/negro o color)',
        keywords: ['impresora', 'laser', 'láser', 'estoy', 'actualicé', 'windows', 'pasa', 'funciona', 'casi', 'siempre', 'mismo', 'reinicio', 'dejó', 'funcionar', 'golpe', 'nada', 'toner']
      },
      { 
        id: 'IMPRESORA_INKJET', 
        icon: '🖨️', 
        label: 'Impresora de Tinta / Inkjet',
        description: 'Impresora de tinta (cartuchos)',
        keywords: ['impresora', 'inkjet', 'tinta', 'cartucho', 'cartuchos', 'estoy', 'pasa', 'uso', 'funciona', 'jugando', 'tira', 'error', 'raro', 'trabajando', 'nada', 'conecto', 'casi', 'siempre']
      },
      { 
        id: 'IMPRESORA_MULTIFUNCION', 
        icon: '🖨️📠', 
        label: 'Multifunción (Impresora + Escáner)',
        description: 'Impresora multifunción con escáner',
        keywords: ['impresora', 'multifuncion', 'multifunción', 'escaner', 'escáner', 'escanear', 'copiar', 'estoy', 'pasa', 'solo', 'funciona', 'uso', 'actualicé', 'windows', 'jugando', 'algunas', 'trabajando', 'reconoce', 'sistema', 'media']
      },
      { 
        id: 'IMPRESORA_TERMICA', 
        icon: '🖨️', 
        label: 'Impresora Térmica',
        description: 'Impresora térmica (tickets, etiquetas)',
        keywords: ['impresora', 'termica', 'térmica', 'ticket', 'tickets', 'etiqueta', 'etiquetas', 'estoy', 'funciona', 'trabajando', 'solo', 'jugando', 'actualicé', 'windows', 'pasa', 'reinicio', 'conecté', 'este', 'equipo', 'uso']
      },
      { 
        id: 'PLOTTER', 
        icon: '🖨️📐', 
        label: 'Plotter',
        description: 'Plotter para impresión de gran formato',
        keywords: ['plotter', 'pasa', 'funciona', 'solo', 'algunas', 'conecto', 'estoy', 'uso', 'trabajando', 'reinicio', 'actualicé']
      },
      { 
        id: 'ESCANER', 
        icon: '📠', 
        label: 'Escáner',
        description: 'Escáner de documentos',
        keywords: ['escaner', 'escáner', 'escanear', 'digitalizar', 'scan', 'pasa', 'solo', 'reinicio', 'funciona', 'conecto', 'uso', 'estoy']
      }
    ]
  }
};

/**
 * Detecta si el texto del usuario contiene términos ambiguos y calcula confidence score
 * ACTUALIZACIÓN 2025-11-25: Usa normalizarTextoCompleto() para corregir typos antes de detectar
 * 
 * @param {string} text - Texto del usuario (puede contener typos: "kompu", "pamtaya", etc.)
 * @returns {Object|null} - { term, candidates, confidence, bestMatch } o null
 * 
 * @example
 * detectAmbiguousDevice("Mi kompu no enziende")
 * // → { term: "compu", candidates: [...], confidence: 0, bestMatch: null }
 */
export function detectAmbiguousDevice(text) {
  // 1. Normalizar con corrección de typos
  const normalized = normalizarTextoCompleto(text);
  
  for (const [pattern, config] of Object.entries(DEVICE_DISAMBIGUATION)) {
    const regex = new RegExp(`\\b(${pattern})`, 'i');
    const match = normalized.match(regex);
    
    if (match) {
      const matchedTerm = match[1].toLowerCase();
      const candidates = config.candidates;
      
      // Calcular confidence score para cada candidate
      const scoredCandidates = candidates.map(candidate => {
        let score = 0;
        const lowerText = normalized.toLowerCase();
        
        // +5 puntos por keywords únicos del dispositivo (primeros 3 keywords son los más discriminantes)
        const uniqueKeywords = candidate.keywords.slice(0, 3);
        for (const keyword of uniqueKeywords) {
          const keywordRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
          if (keywordRegex.test(lowerText)) {
            score += 5;
          }
        }
        
        // +1 punto por cada keyword adicional encontrado
        const additionalKeywords = candidate.keywords.slice(3);
        for (const keyword of additionalKeywords) {
          const keywordRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
          if (keywordRegex.test(lowerText)) {
            score += 1;
          }
        }
        
        return { ...candidate, score };
      });
      
      // Ordenar por score descendente
      scoredCandidates.sort((a, b) => b.score - a.score);
      
      // Determinar bestMatch (si score >= 1, hay confianza mínima)
      const topCandidate = scoredCandidates[0];
      const bestMatch = topCandidate.score >= 1 ? topCandidate : null;
      
      return {
        term: matchedTerm,
        candidates: scoredCandidates,
        confidence: topCandidate.score,
        bestMatch
      };
    }
  }
  
  return null;
}
