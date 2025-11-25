/**
 * Script de conversión: External JSON → devices.json
 * 
 * Lee 9 archivos JSON con estructura externa:
 * {
 *   "category": "perifericos_entrada",
 *   "devices": {
 *     "teclado": {
 *       "es": [{ "problem": "...", "typos": ["...", ...] }],
 *       "en": [{ "problem": "...", "typos": ["...", ...] }]
 *     }
 *   }
 * }
 * 
 * Y los convierte al formato interno de devices.json:
 * {
 *   "categories": {
 *     "entrada": {
 *       "devices": [
 *         {
 *           "id": "teclado",
 *           "realUserProblems": [
 *             {
 *               "es": "problema",
 *               "en": "problem",
 *               "typos": { "es": [...], "en": [...] }
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 * }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const INPUT_DIR = 'E:\\Lucas\\Downloads\\sti_dispositivos_problemas_por_categoria';
const OUTPUT_FILE = path.join(__dirname, '../knowledge_base/devices.json');
const BACKUP_FILE = path.join(__dirname, '../knowledge_base/devices.backup.json');

// Mapeo de categorías externas a internas
const CATEGORY_MAPPING = {
  'perifericos_entrada': 'entrada',
  'perifericos_multimedia': 'salida',
  'computadoras': 'procesamiento',
  'redes_conectividad': 'comunicacion',
  'almacenamiento': 'almacenamiento',
  'moviles_tablets': 'entrada-salida',
  'iot_sensores': 'especializados',
  'impresion_digitalizacion': 'salida',
  'energia_proteccion': 'especializados'
};

// Mapeo de dispositivos externos a IDs internos
const DEVICE_ID_MAPPING = {
  // Periféricos entrada
  'teclado': 'teclado',
  'mouse': 'mouse',
  'trackpad': 'trackpad',
  'tableta_grafica': 'tableta-grafica',
  'joystick': 'joystick',
  'gamepad': 'gamepad',
  'control_vr': 'control-vr',
  'lector_codigo_barras': 'lector-codigo-barras',
  'lector_tarjeta_magnetica': 'lector-tarjetas-magneticas',
  'lector_biometrico': 'lector-biometrico',
  'sensor_tactil': 'sensor-tactil',
  
  // Periféricos multimedia
  'monitor': 'monitor',
  'camara_web': 'camara-web',
  'microfono': 'microfono',
  'parlantes': 'parlantes',
  'auriculares_cable': 'auriculares',
  'auriculares_bluetooth': 'auriculares-bluetooth',
  'proyector': 'proyector',
  'smart_tv': 'smart-tv',
  'tv_box': 'tv-box',
  'stick_tv': 'fire-tv-stick',
  'soundbar': 'soundbar',
  
  // Computadoras
  'pc_escritorio': 'pc-escritorio',
  'pc_gamer': 'pc-gamer',
  'workstation': 'workstation',
  'servidor': 'servidor',
  'notebook': 'notebook',
  'netbook': 'netbook',
  'ultrabook': 'ultrabook',
  'all_in_one': 'all-in-one',
  'mini_pc': 'mini-pc',
  'thin_client': 'thin-client',
  
  // Redes
  'router_wifi': 'router',
  'modem': 'modem',
  'switch_red': 'switch',
  'access_point': 'access-point',
  'repetidor_wifi': 'repetidor-wifi',
  'adaptador_wifi_usb': 'adaptador-wifi-usb',
  'placa_red_cable': 'tarjeta-red',
  'placa_red_inalambrica': 'tarjeta-red-wifi',
  
  // Almacenamiento
  'disco_rigido': 'disco-rigido',
  'ssd': 'ssd',
  'disco_externo': 'disco-externo',
  'pendrive': 'pendrive',
  'memoria_sd': 'tarjeta-memoria',
  'nas': 'nas',
  'gabinete_externo': 'gabinete-externo',
  
  // Móviles y tablets
  'smartphone_android': 'smartphone',
  'iphone': 'iphone',
  'tablet_android': 'tablet',
  'ipad': 'ipad',
  'smartwatch': 'smartwatch',
  
  // IoT y sensores
  'sensor_movimiento': 'sensor-movimiento',
  'sensor_voz': 'sensor-voz',
  'camara_ip': 'camara-ip',
  'enchufe_inteligente': 'enchufe-inteligente',
  'bombilla_inteligente': 'bombilla-inteligente',
  'hub_domotico': 'hub-domotico',
  
  // Impresión
  'impresora_laser': 'impresora-laser',
  'impresora_inkjet': 'impresora-inyeccion',
  'impresora_multifuncion': 'impresora-multifuncion',
  'impresora_termica': 'impresora-termica',
  'plotter': 'plotter',
  'escaner': 'escaner',
  
  // Energía
  'ups': 'ups',
  'estabilizador_tension': 'estabilizador',
  'regleta_electrica': 'zapatilla',
  'fuente_poder_pc': 'fuente-alimentacion'
};

/**
 * Lee el devices.json actual
 */
function loadCurrentDevices() {
  try {
    const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error leyendo devices.json actual:', error.message);
    return null;
  }
}

/**
 * Crea backup del devices.json actual
 */
function createBackup(devicesData) {
  try {
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(devicesData, null, 2), 'utf8');
    console.log(`✅ Backup creado: ${BACKUP_FILE}`);
  } catch (error) {
    console.error('❌ Error creando backup:', error.message);
  }
}

/**
 * Lee un archivo JSON externo
 */
function loadExternalJSON(filename) {
  try {
    const filePath = path.join(INPUT_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error leyendo ${filename}:`, error.message);
    return null;
  }
}

/**
 * Convierte problemas externos al formato interno
 */
function convertProblems(esProblems, enProblems) {
  const result = [];
  const maxLength = Math.max(esProblems.length, enProblems.length);
  
  for (let i = 0; i < maxLength; i++) {
    const esProblem = esProblems[i] || { base: '', variants: [] };
    const enProblem = enProblems[i] || { base: '', variants: [] };
    
    result.push({
      es: esProblem.base || '',
      en: enProblem.base || '',
      typos: {
        es: esProblem.variants || [],
        en: enProblem.variants || []
      }
    });
  }
  
  return result;
}

/**
 * Encuentra un dispositivo en devices.json por ID
 */
function findDeviceInCategory(devicesData, categoryId, deviceId) {
  const category = devicesData.categories[categoryId];
  if (!category || !category.devices) return null;
  
  return category.devices.find(d => d.id === deviceId);
}

/**
 * Actualiza o agrega realUserProblems a un dispositivo
 */
function updateDeviceProblems(device, newProblems) {
  // Si el dispositivo ya tiene problemas con typos, los mantiene
  const existingProblems = device.realUserProblems || [];
  
  // Solo actualiza si hay nuevos problemas
  if (newProblems && newProblems.length > 0) {
    device.realUserProblems = newProblems;
    return true;
  }
  
  return false;
}

/**
 * Procesa todos los archivos JSON externos
 */
function processAllFiles() {
  console.log('🚀 Iniciando conversión de archivos externos...\n');
  
  // Cargar devices.json actual
  const devicesData = loadCurrentDevices();
  if (!devicesData) {
    console.error('❌ No se pudo cargar devices.json. Abortando.');
    return;
  }
  
  // Crear backup
  createBackup(devicesData);
  
  // Archivos a procesar
  const files = [
    'perifericos_entrada.json',
    'perifericos_multimedia.json',
    'computadoras.json',
    'redes_conectividad.json',
    'almacenamiento.json',
    'moviles_tablets.json',
    'iot_sensores.json',
    'impresion_digitalizacion.json',
    'energia_proteccion.json'
  ];
  
  let totalDevicesProcessed = 0;
  let totalProblemsAdded = 0;
  let totalTyposAdded = 0;
  
  // Procesar cada archivo
  files.forEach(filename => {
    console.log(`\n📂 Procesando: ${filename}`);
    
    const externalData = loadExternalJSON(filename);
    if (!externalData) {
      console.log(`   ⚠️  Saltado (no se pudo leer)`);
      return;
    }
    
    const externalCategory = externalData.category;
    const internalCategory = CATEGORY_MAPPING[externalCategory];
    
    if (!internalCategory) {
      console.log(`   ⚠️  Categoría no mapeada: ${externalCategory}`);
      return;
    }
    
    console.log(`   📁 Categoría interna: ${internalCategory}`);
    
    // Procesar cada dispositivo
    Object.keys(externalData.devices).forEach(externalDeviceId => {
      const internalDeviceId = DEVICE_ID_MAPPING[externalDeviceId];
      
      if (!internalDeviceId) {
        console.log(`   ⚠️  Dispositivo no mapeado: ${externalDeviceId}`);
        return;
      }
      
      const externalDevice = externalData.devices[externalDeviceId];
      const device = findDeviceInCategory(devicesData, internalCategory, internalDeviceId);
      
      if (!device) {
        console.log(`   ⚠️  Dispositivo no encontrado en devices.json: ${internalDeviceId}`);
        return;
      }
      
      // Convertir problemas
      const newProblems = convertProblems(
        externalDevice.es || [],
        externalDevice.en || []
      );
      
      // Actualizar dispositivo
      const updated = updateDeviceProblems(device, newProblems);
      
      if (updated) {
        totalDevicesProcessed++;
        totalProblemsAdded += newProblems.length;
        
        // Contar typos
        newProblems.forEach(p => {
          if (p.typos && p.typos.es) totalTyposAdded += p.typos.es.length;
          if (p.typos && p.typos.en) totalTyposAdded += p.typos.en.length;
        });
        
        console.log(`   ✅ ${device.name}: ${newProblems.length} problemas agregados`);
      } else {
        console.log(`   ℹ️  ${device.name}: Sin cambios`);
      }
    });
  });
  
  // Guardar devices.json actualizado
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(devicesData, null, 2), 'utf8');
    console.log(`\n✅ devices.json actualizado exitosamente`);
  } catch (error) {
    console.error(`\n❌ Error guardando devices.json:`, error.message);
    return;
  }
  
  // Resumen
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMEN DE CONVERSIÓN');
  console.log('='.repeat(60));
  console.log(`✅ Dispositivos actualizados: ${totalDevicesProcessed}`);
  console.log(`✅ Problemas agregados: ${totalProblemsAdded}`);
  console.log(`✅ Typos agregados: ${totalTyposAdded}`);
  console.log(`\n📄 Archivo de salida: ${OUTPUT_FILE}`);
  console.log(`💾 Backup disponible: ${BACKUP_FILE}`);
  console.log('='.repeat(60));
}

// Ejecutar conversión
processAllFiles();
