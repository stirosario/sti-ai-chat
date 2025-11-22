/**
 * PWA Installation Handler para ChatSTI
 * Maneja detección, registro SW, instalación y actualizaciones
 */

const isDev = false; // Cambiar a true para desarrollo local
const log = (...args) => isDev && console.log('[PWA]', ...args);
const logError = (...args) => console.error('[PWA]', ...args);

class PWAInstaller {
  constructor() {
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.swRegistration = null;
    this.updateCheckInterval = null;
    this.eventListeners = new Map(); // Trackear listeners para cleanup
    
    this.init();
  }
  
  init() {
    // Detectar si ya está instalado
    this.checkIfInstalled();
    
    // Registrar Service Worker
    this.registerServiceWorker();
    
    // Escuchar evento beforeinstallprompt
    this.listenForInstallPrompt();
    
    // Detectar instalación exitosa
    this.detectInstallation();
    
    // Verificar actualizaciones periódicamente
    this.checkForUpdates();
    
    // iOS: Mostrar instrucciones automáticamente si no está instalado
    if (this.isIOS() && !this.isInstalled) {
      setTimeout(() => {
        if (!this.isInstalled && !this.deferredPrompt) {
          this.showIOSInstallBanner();
        }
      }, 3000); // Esperar 3s para no ser intrusivo
    }
    
    // Crear botón si no existe en HTML
    this.ensureInstallButton();
  }
  
  // ========================================================
  // Service Worker Registration
  // ========================================================
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      log('Service Workers not supported');
      this.showCompatibilityWarning();
      return;
    }
    
    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      log('Service Worker registered:', this.swRegistration.scope);
      
      // Escuchar actualizaciones del SW
      this.swRegistration.addEventListener('updatefound', () => {
        const newWorker = this.swRegistration.installing;
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Nueva versión disponible
            this.showUpdateNotification();
          }
        });
      });
      
    } catch (err) {
      logError('Service Worker registration failed:', err);
    }
  }
  
  // ========================================================
  // Detección de instalación
  // ========================================================
  checkIfInstalled() {
    // Detectar modo standalone (ya instalado)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled = true;
      log('Running in standalone mode');
      this.hideInstallButton();
      return;
    }
    
    // iOS: detectar si está en home screen
    if (window.navigator.standalone === true) {
      this.isInstalled = true;
      log('Running on iOS home screen');
      this.hideInstallButton();
      return;
    }
    
    log('Not installed');
  }
  
  // ========================================================
  // Escuchar evento de instalación
  // ========================================================
  listenForInstallPrompt() {
    const handler = (e) => {
      // Prevenir mini-infobar automático
      e.preventDefault();
      
      // Guardar el evento para usar después
      this.deferredPrompt = e;
      
      log('Install prompt available');
      
      // Mostrar botón de instalación personalizado
      this.showInstallButton();
    };
    
    window.addEventListener('beforeinstallprompt', handler);
    this.eventListeners.set('beforeinstallprompt', handler);
  }
  
  // ========================================================
  // Detectar instalación exitosa
  // ========================================================
  detectInstallation() {
    const handler = () => {
      log('App installed successfully');
      this.isInstalled = true;
      this.deferredPrompt = null;
      this.hideInstallButton();
      
      // Analytics (opcional)
      try {
        if (typeof gtag !== 'undefined' && gtag) {
          gtag('event', 'pwa_installed', {
            event_category: 'PWA',
            event_label: 'Installation'
          });
        }
      } catch (err) {
        logError('Analytics error:', err);
      }
    };
    
    window.addEventListener('appinstalled', handler);
    this.eventListeners.set('appinstalled', handler);
  }
  
  // ========================================================
  // Mostrar prompt de instalación
  // ========================================================
  async showInstallPrompt() {
    if (!this.deferredPrompt) {
      log('No install prompt available');
      
      // En iOS mostrar instrucciones
      if (this.isIOS()) {
        this.showIOSInstructions();
      }
      return;
    }
    
    // Mostrar prompt nativo
    this.deferredPrompt.prompt();
    
    // Esperar respuesta del usuario
    const { outcome } = await this.deferredPrompt.userChoice;
    
    log('User choice:', outcome);
    
    if (outcome === 'accepted') {
      log('User accepted installation');
      
      // Analytics
      try {
        if (typeof gtag !== 'undefined' && gtag) {
          gtag('event', 'pwa_install_accepted', {
            event_category: 'PWA',
            event_label: 'User accepted'
          });
        }
      } catch (err) {
        logError('Analytics error:', err);
      }
    } else {
      log('User dismissed installation');
      
      // Analytics
      try {
        if (typeof gtag !== 'undefined' && gtag) {
          gtag('event', 'pwa_install_dismissed', {
            event_category: 'PWA',
            event_label: 'User dismissed'
          });
        }
      } catch (err) {
        logError('Analytics error:', err);
      }
    }
    
    // Limpiar prompt
    this.deferredPrompt = null;
  }
  
  // ========================================================
  // UI: Mostrar/Ocultar botón de instalación
  // ========================================================
  ensureInstallButton() {
    let btn = document.getElementById('pwa-install-btn');
    if (!btn) {
      // Crear botón dinámicamente si no existe
      btn = document.createElement('button');
      btn.id = 'pwa-install-btn';
      btn.innerHTML = '📲 Instalar App';
      btn.style.cssText = 'display: none; position: fixed; bottom: 20px; right: 20px; background: #0a1f44; color: white; padding: 12px 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: none; font-size: 15px; font-weight: 600; cursor: pointer; z-index: 9998; transition: all 0.3s ease;';
      btn.onmouseenter = () => btn.style.transform = 'scale(1.05)';
      btn.onmouseleave = () => btn.style.transform = 'scale(1)';
      document.body.appendChild(btn);
    }
  }
  
  showInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) {
      btn.style.display = 'block';
      
      // Remover listener anterior si existe
      const oldHandler = this.eventListeners.get('install-btn-click');
      if (oldHandler) {
        btn.removeEventListener('click', oldHandler);
      }
      
      // Agregar nuevo listener
      const handler = () => this.showInstallPrompt();
      btn.addEventListener('click', handler);
      this.eventListeners.set('install-btn-click', handler);
    }
  }
  
  hideInstallButton() {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) {
      btn.style.display = 'none';
    }
  }
  
  // ========================================================
  // iOS: Instrucciones de instalación
  // ========================================================
  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  
  showIOSInstallBanner() {
    // No mostrar si ya vio el banner en esta sesión
    if (sessionStorage.getItem('ios-banner-shown')) return;
    
    const banner = document.createElement('div');
    banner.id = 'ios-install-banner';
    banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; background: linear-gradient(135deg, #0a1f44 0%, #1e3a8a 100%); color: white; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 9999; display: flex; align-items: center; gap: 12px; animation: slideDown 0.3s ease-out;';
    
    const icon = document.createElement('span');
    icon.textContent = '📱';
    icon.style.fontSize = '24px';
    
    const text = document.createElement('div');
    text.style.flex = '1';
    text.innerHTML = '<strong>Instalá ChatSTI</strong><br><small>Tocá <span style="font-size: 16px;">⎙</span> y luego "Agregar a inicio"</small>';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px;';
    closeBtn.onclick = () => {
      banner.remove();
      sessionStorage.setItem('ios-banner-shown', 'true');
    };
    
    banner.appendChild(icon);
    banner.appendChild(text);
    banner.appendChild(closeBtn);
    document.body.prepend(banner);
    
    // Auto-remover después de 10 segundos
    setTimeout(() => {
      if (document.getElementById('ios-install-banner')) {
        banner.remove();
        sessionStorage.setItem('ios-banner-shown', 'true');
      }
    }, 10000);
  }
  
  showCompatibilityWarning() {
    const warning = document.createElement('div');
    warning.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; padding: 16px 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 9999; max-width: 400px; width: calc(100% - 40px); text-align: center;';
    warning.innerHTML = '<strong>⚠️ Navegador no compatible</strong><br><small>Para instalar ChatSTI, usá Chrome, Edge o Safari actualizado</small>';
    
    document.body.appendChild(warning);
    
    setTimeout(() => warning.remove(), 8000);
  }
  
  showIOSInstructions() {
    const modal = document.createElement('div');
    modal.id = 'ios-install-modal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;';
    
    const content = document.createElement('div');
    content.style.cssText = 'background: white; border-radius: 16px; padding: 24px; max-width: 400px; width: 100%;';
    
    const title = document.createElement('h3');
    title.textContent = 'Instalar ChatSTI';
    title.style.cssText = 'margin: 0 0 16px; font-size: 20px; color: #1e293b;';
    
    const intro = document.createElement('p');
    intro.textContent = 'Para instalar ChatSTI en tu iPhone o iPad:';
    intro.style.cssText = 'margin: 0 0 20px; font-size: 15px; line-height: 1.5; color: #475569;';
    
    const steps = document.createElement('ol');
    steps.style.cssText = 'margin: 0 0 24px; padding-left: 24px; font-size: 14px; line-height: 1.8; color: #475569;';
    
    const step1 = document.createElement('li');
    step1.innerHTML = 'Tocá el botón de <strong>Compartir</strong> <span style="font-size: 18px;">⎙</span>';
    const step2 = document.createElement('li');
    step2.innerHTML = 'Desplazá hacia abajo y tocá <strong>"Agregar a pantalla de inicio"</strong> <span style="font-size: 18px;">➕</span>';
    const step3 = document.createElement('li');
    step3.innerHTML = 'Tocá <strong>"Agregar"</strong> en la esquina superior derecha';
    
    steps.appendChild(step1);
    steps.appendChild(step2);
    steps.appendChild(step3);
    
    const btn = document.createElement('button');
    btn.textContent = 'Entendido';
    btn.style.cssText = 'width: 100%; padding: 12px; background: #0a1f44; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;';
    btn.onclick = () => modal.remove();
    
    // Agregar escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Click en backdrop cierra modal
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    content.appendChild(title);
    content.appendChild(intro);
    content.appendChild(steps);
    content.appendChild(btn);
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Focus en botón
    btn.focus();
    
    // Auto-cerrar después de 30 segundos
    setTimeout(() => {
      if (document.getElementById('ios-install-modal')) {
        modal.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    }, 30000);
  }
  
  // ========================================================
  // Actualizaciones del Service Worker
  // ========================================================
  async checkForUpdates() {
    if (!this.swRegistration) return;
    
    // Limpiar intervalo anterior si existe
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }
    
    // Verificar actualizaciones cada 1 hora (con rate limiting)
    let isUpdating = false;
    this.updateCheckInterval = setInterval(async () => {
      if (isUpdating) {
        log('Update already in progress, skipping');
        return;
      }
      
      try {
        isUpdating = true;
        await this.swRegistration.update();
        log('Update check completed');
      } catch (err) {
        logError('Update check failed:', err);
      } finally {
        isUpdating = false;
      }
    }, 60 * 60 * 1000);
  }
  
  showUpdateNotification() {
    const notification = document.createElement('div');
    notification.id = 'pwa-update-notification';
    notification.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #0a1f44; color: white; padding: 16px 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 9999; max-width: 400px; width: calc(100% - 40px);';
    
    const title = document.createElement('p');
    title.textContent = 'Nueva versión disponible 🎉';
    title.style.cssText = 'margin: 0 0 12px; font-size: 15px; font-weight: 600;';
    
    const message = document.createElement('p');
    message.textContent = 'ChatSTI tiene actualizaciones. Refrescá para obtener la última versión.';
    message.style.cssText = 'margin: 0 0 16px; font-size: 14px; opacity: 0.9;';
    
    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; gap: 12px;';
    
    const updateBtn = document.createElement('button');
    updateBtn.textContent = 'Actualizar ahora';
    updateBtn.style.cssText = 'flex: 1; padding: 10px; background: white; color: #0a1f44; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;';
    updateBtn.onclick = () => window.location.reload();
    
    const laterBtn = document.createElement('button');
    laterBtn.textContent = 'Más tarde';
    laterBtn.style.cssText = 'padding: 10px 16px; background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; font-size: 14px; cursor: pointer;';
    laterBtn.onclick = () => notification.remove();
    
    buttons.appendChild(updateBtn);
    buttons.appendChild(laterBtn);
    
    notification.appendChild(title);
    notification.appendChild(message);
    notification.appendChild(buttons);
    
    document.body.appendChild(notification);
    
    // Auto-remover después de 15 segundos (reducido de 30s)
    setTimeout(() => {
      if (document.getElementById('pwa-update-notification')) {
        notification.remove();
      }
    }, 15000);
  }
  
  // ========================================================
  // Utilidades públicas
  // ========================================================
  getInstallStatus() {
    return {
      isInstalled: this.isInstalled,
      canInstall: !!this.deferredPrompt,
      isIOS: this.isIOS(),
      swRegistered: !!this.swRegistration
    };
  }
  
  // Cleanup para prevenir memory leaks
  destroy() {
    // Limpiar interval de updates
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
    }
    
    // Remover event listeners
    this.eventListeners.forEach((handler, event) => {
      if (event === 'install-btn-click') {
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.removeEventListener('click', handler);
      } else {
        window.removeEventListener(event, handler);
      }
    });
    this.eventListeners.clear();
    
    log('PWAInstaller destroyed');
  }
}

// Inicializar automáticamente cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.pwaInstaller = new PWAInstaller();
  });
} else {
  window.pwaInstaller = new PWAInstaller();
}
