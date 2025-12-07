/**
 * services/imageProcessor.js
 * Procesamiento de imágenes: guardado, análisis con Vision API
 * ✅ FASE 4-1: Validación de tamaño de imágenes agregada
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ✅ FASE 4-1: Constantes de seguridad
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB máximo
const MAX_IMAGE_DIMENSION = 4096; // Máximo 4096px en cualquier dimensión

/**
 * Guarda una imagen en disco desde base64
 * @param {object} imageData - Datos de la imagen { data: string, name: string }
 * @param {string} sessionId - ID de sesión
 * @param {string} uploadsDir - Directorio de uploads
 * @param {string} publicBaseUrl - URL pública base
 * @returns {Promise<object>} { success: boolean, url?: string, error?: string }
 */
export async function saveImage(imageData, sessionId, uploadsDir, publicBaseUrl) {
  try {
    if (!imageData.data) {
      return { success: false, error: 'Image data is missing' };
    }

    // Extraer base64 y extensión
    const base64Data = imageData.data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // ✅ FASE 4-1: Validar tamaño antes de procesar
    if (buffer.length > MAX_IMAGE_SIZE) {
      return { 
        success: false, 
        error: `Image size exceeds maximum allowed (${MAX_IMAGE_SIZE / 1024 / 1024}MB). Received: ${(buffer.length / 1024 / 1024).toFixed(2)}MB` 
      };
    }
    
    // Generar nombre único
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = imageData.name ? path.extname(imageData.name).toLowerCase() : '.png';
    const fileName = `${sessionId.substring(0, 20)}_${timestamp}_${random}${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    
    // Guardar imagen
    fs.writeFileSync(filePath, buffer);
    
    // Verificar que se guardó
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File was not saved' };
    }
    
    const stats = fs.statSync(filePath);
    const imageUrl = `${publicBaseUrl}/uploads/${fileName}`;
    
    return {
      success: true,
      url: imageUrl,
      fileName: fileName,
      size: stats.size
    };
  } catch (error) {
    console.error('[IMAGE_PROCESSOR] Error saving image:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Procesa múltiples imágenes
 * @param {Array} images - Array de objetos de imagen
 * @param {string} sessionId - ID de sesión
 * @param {string} uploadsDir - Directorio de uploads
 * @param {string} publicBaseUrl - URL pública base
 * @returns {Promise<Array>} Array de resultados { success, url, error }
 */
export async function processImages(images, sessionId, uploadsDir, publicBaseUrl) {
  const results = [];
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    console.log(`[IMAGE_PROCESSOR] Processing image ${i + 1}/${images.length}: ${img.name || 'unnamed'}`);
    
    const result = await saveImage(img, sessionId, uploadsDir, publicBaseUrl);
    results.push(result);
    
    if (result.success) {
      console.log(`[IMAGE_PROCESSOR] ✅ Saved: ${result.fileName} -> ${result.url}`);
    } else {
      console.error(`[IMAGE_PROCESSOR] ❌ Error: ${result.error}`);
    }
  }
  
  return results;
}

/**
 * Analiza imágenes con Vision API de OpenAI
 * @param {Array<string>} imageUrls - URLs de las imágenes
 * @param {object} openai - Cliente de OpenAI
 * @returns {Promise<string>} Análisis de las imágenes
 */
export async function analyzeImagesWithVision(imageUrls, openai) {
  if (!openai || !imageUrls || imageUrls.length === 0) {
    return null;
  }

  try {
    console.log('[VISION] Analyzing image(s) for problem detection...');
    
    const visionMessages = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analizá esta imagen que subió un usuario de soporte técnico. 
Identificá:
1. ¿Qué tipo de problema o dispositivo se muestra?
2. ¿Hay mensajes de error visibles? ¿Cuáles?
3. ¿Qué información técnica relevante podés extraer?
4. Dame una respuesta conversacional en español para el usuario explicando lo que ves y qué podemos hacer.

Respondé con una explicación clara y útil para el usuario.`
          },
          ...imageUrls.map(url => ({
            type: 'image_url',
            image_url: {
              url: url,
              detail: 'high'
            }
          }))
        ]
      }
    ];
    
    // ✅ FASE 4-2: Timeout en operación async crítica
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos
    
    try {
      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: visionMessages,
        max_tokens: 800,
        temperature: 0.4,
        signal: controller.signal
      });
    
      clearTimeout(timeoutId);
      const analysisText = visionResponse.choices[0]?.message?.content || '';
      
      if (analysisText) {
        console.log('[VISION] ✅ Analysis completed:', analysisText.substring(0, 100) + '...');
        return analysisText;
      }
      
      return null;
    } catch (abortError) {
      clearTimeout(timeoutId);
      if (abortError.name === 'AbortError') {
        console.error('[VISION] ❌ Timeout analyzing images (30s exceeded)');
        return null;
      }
      throw abortError;
    }
  } catch (error) {
    console.error('[VISION] ❌ Error analyzing images:', error.message);
    return null;
  }
}
