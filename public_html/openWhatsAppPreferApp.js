// name=openWhatsAppPreferApp.js
// Llamar: openWhatsAppPreferApp({ waIntentUrl, waAppUrl, waWebUrl, waUrl, waText })

function openWhatsAppPreferApp(urls = {}) {
  const { waIntentUrl, waAppUrl, waWebUrl, waUrl, waText } = urls;
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  function copyToClipboard(text){
    if(!text) return Promise.reject('no text');
    if(navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) { /* ignore */ }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function tryOpen(url, fallback, timeout = 1200) {
    // Use location for intent:// and whatsapp://; window.open for web
    let handled = false;
    const timer = setTimeout(() => {
      if(!handled && typeof fallback === 'function') fallback();
    }, timeout);

    try {
      // For intent:// and whatsapp:// schemes use location (same tab)
      if(url && (url.startsWith('intent:') || url.startsWith('whatsapp:'))) {
        window.location = url;
      } else if (url) {
        // web.whatsapp or wa.me -> open in new tab
        window.open(url, '_blank');
      } else {
        throw new Error('no url');
      }
      handled = true;
      clearTimeout(timer);
    } catch(e) {
      clearTimeout(timer);
      if(typeof fallback === 'function') fallback();
    }
  }

  if (isAndroid) {
    if (waIntentUrl) {
      tryOpen(waIntentUrl, () => {
        if (waAppUrl) tryOpen(waAppUrl, () => { window.open(waWebUrl || waUrl, '_blank'); });
        else window.open(waWebUrl || waUrl, '_blank');
      }, 1200);
      return;
    }
    if (waAppUrl) {
      tryOpen(waAppUrl, () => { window.open(waWebUrl || waUrl, '_blank'); }, 1200);
      return;
    }
    window.open(waWebUrl || waUrl, '_blank');
    return;
  }

  if (isIOS) {
    if (waAppUrl) {
      tryOpen(waAppUrl, () => { window.open(waWebUrl || waUrl, '_blank'); }, 1200);
      return;
    }
    window.open(waWebUrl || waUrl, '_blank');
    return;
  }

  // Desktop / laptop
  // Prefer WhatsApp Web; also provide copy fallback if desktop app won't accept text
  if (waWebUrl) {
    // open web.whatsapp in new tab
    window.open(waWebUrl, '_blank');
  } else {
    window.open(waUrl, '_blank');
  }

  // Optional: copy message for user convenience
  if (waText) {
    copyToClipboard(waText).then(()=> {
      console.info('Mensaje copiado al portapapeles como fallback');
    }).catch(()=>{ /* noop */ });
  }
}