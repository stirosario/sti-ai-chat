// ════════════════════════════════════════════════════════════
// 🚨 HOTFIX TEMPORAL - Pegar en el index.php de producción
// ════════════════════════════════════════════════════════════
// UBICACIÓN: Antes de la etiqueta </body> o dentro de <script>
// ════════════════════════════════════════════════════════════

// FIX: Actualizar la función stiShowChat para buscar d.buttons
// Busca esta sección en tu index.php (alrededor de línea 830-850):

/*
ORIGINAL (INCORRECTO):
      try{
        const r = await fetch(API_GREET, { method:'GET', headers: baseHeaders() });
        const d = await r.json().catch(()=> ({}));
        const node = addMsg(d?.greeting || '👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?', 'bot');
        // si el backend envía opciones con greeting, muéstralas
        const btns = normalizeButtons(d.ui || d.options);
        if (btns.length) renderButtons(node, btns);
      }catch{
        addMsg('👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?', 'bot');
      }
*/

// REEMPLAZAR POR (CORRECTO):
/*
      try{
        const r = await fetch(API_GREET, { method:'GET', headers: baseHeaders() });
        const d = await r.json().catch(()=> ({}));
        const node = addMsg(d?.greeting || '👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?', 'bot');
        // si el backend envía opciones con greeting, muéstralas
        const btns = normalizeButtons(d.buttons || d.ui || d.options);
        if (btns.length) renderButtons(node, btns);
      }catch{
        addMsg('👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?', 'bot');
      }
*/

// ════════════════════════════════════════════════════════════
// CAMBIO NECESARIO (1 LÍNEA):
// ════════════════════════════════════════════════════════════
// ANTES:  const btns = normalizeButtons(d.ui || d.options);
// DESPUÉS: const btns = normalizeButtons(d.buttons || d.ui || d.options);
// ════════════════════════════════════════════════════════════

// INSTRUCCIONES PASO A PASO:
// 1. Accede al administrador de archivos de tu hosting
// 2. Abre: public_html/index.php
// 3. Busca (Ctrl+F): "normalizeButtons(d.ui || d.options)"
// 4. Reemplaza por: "normalizeButtons(d.buttons || d.ui || d.options)"
// 5. Guarda el archivo
// 6. Limpia caché del navegador (Ctrl+Shift+Delete)
// 7. Prueba en modo incógnito

// ════════════════════════════════════════════════════════════
// VERIFICAR QUE FUNCIONA:
// ════════════════════════════════════════════════════════════
// 1. Abre https://stia.com.ar en incógnito
// 2. Abre el chat
// 3. Deberías ver: [Botón: Sí] [Botón: No]
// ════════════════════════════════════════════════════════════
