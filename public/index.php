<?php
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (empty($_SESSION['csrf_token'])) {
  $_SESSION['csrf_token'] = bin2hex(random_bytes(16));
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- 🔌 PRECONEXIONES (orden optimizado) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://www.googletagmanager.com">
  <link rel="dns-prefetch" href="//wa.me">
  <link rel="preconnect" href="https://wa.me">
  <link rel="preconnect" href="https://sti-rosario-ai.onrender.com" crossorigin>
  <link rel="dns-prefetch" href="//maps.app.goo.gl">
  <link rel="preconnect" href="https://maps.app.goo.gl">

  <!-- 🧭 META PRINCIPALES -->
  <title>STI Rosario | Servicio Técnico Inteligente — Reparaciones Online y Presupuestos Sin Cargo</title>
  <meta name="description" content="Optimización y mantenimiento con IA. Soporte remoto inmediato. Presupuesto sin cargo. Urgencias fuera de horario. Servicio Técnico Inteligente en Rosario para hogares y PyMEs.">
  <meta name="keywords" content="servicio técnico informático, reparación de PC Rosario, mantenimiento de notebooks, asistencia remota, soporte informático empresas, STI Rosario, Servicio Técnico Inteligente, urgencias técnicas, seguridad informática, optimización Windows">
  <meta name="author" content="STI - Servicio Técnico Inteligente">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <meta name="theme-color" content="#0a1f44">

  <!-- 🌍 GEOLOCALIZACIÓN -->
  <meta name="geo.region" content="AR-S">
  <meta name="geo.placename" content="Rosario, Santa Fe">
  <meta name="geo.position" content="-32.9587;-60.6939">
  <meta name="ICBM" content="-32.9587, -60.6939">
  <meta http-equiv="content-language" content="es">

  <!-- 🧭 CANONICAL / SITEMAP -->
  <link rel="canonical" href="https://stia.com.ar/">
  <link rel="sitemap" type="application/xml" href="https://stia.com.ar/sitemap.xml">

  <!-- 🧩 ICONO -->
  <link rel="icon" href="img/favicon.ico" type="image/x-icon">
  
  <!-- 📱 PWA MANIFEST -->
  <link rel="manifest" href="/manifest.json">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="ChatSTI">
  <link rel="apple-touch-icon" href="/icons/icon-192x192.png">

  <!-- 🚀 PRELOADS (sin bloquear render) -->
  <link rel="preload" as="image" href="img/hero-desktop-1280-853.jpg"
        imagesrcset="img/hero-desktop-768-512.jpg 768w, img/hero-desktop-1280-853.jpg 1280w"
        imagesizes="(max-width: 768px) 100vw, 1280px"
        fetchpriority="high">
  <link rel="preload" href="img/logo-sti1.png" as="image" type="image/png">

  <!-- 🔤 FUENTE GOOGLE (async + swap) -->
  <link rel="preload" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap" as="style">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&display=swap"></noscript>

  <!-- 🎨 CSS PRINCIPAL -->
  <link rel="preload" href="css/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="css/style.css"></noscript>
  <!-- Fallback minimal específico del chat -->
  <link rel="stylesheet" href="css/frontend-snippet.css">

  <!-- 📣 OPEN GRAPH -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://stia.com.ar/">
  <meta property="og:site_name" content="STI — Servicio Técnico Inteligente">
  <meta property="og:title" content="STI Rosario — Servicio Técnico Inteligente">
  <meta property="og:description" content="Optimización y mantenimiento con IA. Soporte remoto inmediato. Presupuesto sin cargo. Urgencias fuera de horario.">
  <meta property="og:image" content="https://stia.com.ar/img/og-sti-1200x630.jpg">
  <meta property="og:image:secure_url" content="https://stia.com.ar/img/og-sti-1200x630.jpg">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="STI Rosario — Logo metálico del Servicio Técnico Inteligente">
  <meta property="og:locale" content="es_AR">

  <!-- ⚙️ ESTILOS DE ACENTO -->
  <style>
    :root{
      --metal-blue:#5cc8ff; --metal-blue-glow:rgba(92,200,255,.55);
      --metal-green:#00ff9d; --metal-green-glow:rgba(0,255,157,.55);
      --metal-violet:#c77dff; --metal-violet-glow:rgba(199,125,255,.55);
      --metal-card-bg:
        radial-gradient(1200px 160px at 50% -180px, rgba(255,255,255,.05), transparent 60%),
        linear-gradient(180deg, rgba(15,22,30,.95), rgba(10,14,20,.95));
    }
    .accent{border:1px solid currentColor;border-radius:14px;background:var(--metal-card-bg);
      box-shadow:0 0 28px currentColor, inset 0 0 14px color-mix(in srgb, currentColor 35%, transparent)}
    .section-title{color:currentColor!important;text-shadow:0 0 15px color-mix(in srgb, currentColor 60%, transparent)!important}
    .btn-metal{display:inline-block;color:#fff;font-weight:600;border-radius:28px;padding:14px 36px;text-decoration:none;background:
      linear-gradient(90deg,color-mix(in srgb,currentColor 65%,#009dff) 0%,color-mix(in srgb,currentColor 40%,#00e5ff) 100%);
      border:1px solid color-mix(in srgb,currentColor 65%,transparent);
      box-shadow:0 0 20px color-mix(in srgb,currentColor 55%,transparent), inset 0 0 12px color-mix(in srgb,currentColor 35%,transparent);
      transition:.25s}
    .btn-metal:hover{transform:scale(1.05);box-shadow:0 0 28px color-mix(in srgb,currentColor 70%,transparent), inset 0 0 14px color-mix(in srgb,currentColor 45%,transparent)}
    .accent-blue{color:var(--metal-blue)} .accent-green{color:var(--metal-green)} .accent-violet{color:var(--metal-violet)}
    svg.use-current{width:22px;height:22px;display:block;fill:currentColor}
    
    /* Botón Instalar PWA */
    .btn-install-pwa {
      display: inline-flex !important;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      animation: pulse-install 2s ease-in-out infinite;
      text-decoration: none;
      margin-left: auto;
    }
    
    .btn-install-pwa svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    
    .btn-install-pwa:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5);
      animation: none;
    }
    
    .btn-install-pwa:active {
      transform: translateY(0);
    }
    
    /* Responsive móvil para botón instalar */
    @media (max-width: 768px) {
      .btn-install-pwa {
        position: fixed;
        bottom: 80px;
        right: 16px;
        z-index: 9999;
        padding: 12px 20px;
        font-size: 13px;
        box-shadow: 0 6px 24px rgba(16, 185, 129, 0.5);
      }
      
      .btn-install-pwa span {
        display: inline;
      }
    }
    
    @keyframes pulse-install {
      0%, 100% { box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3); }
      50% { box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5); }
    }
    .emoji{display:inline-block;text-shadow:0 0 8px color-mix(in srgb,currentColor 60%,transparent)}
    
    /* Estilos para botones del chat con descripciones */
    .sti-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 15px;
      width: 100%;
    }
    
    .sti-opt-btn {
      background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 16px;
      font-family: 'Exo', sans-serif;
      text-align: left;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
      width: 100%;
    }
    
    .sti-opt-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 123, 255, 0.5);
      background: linear-gradient(135deg, #0056b3 0%, #003d82 100%);
    }
    
    .sti-opt-btn:active {
      transform: translateY(0);
    }
    
    .sti-opt-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    
    .btn-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .btn-icon {
      font-size: 20px;
      display: inline-block;
      margin-right: 4px;
    }
    
    .btn-description {
      font-size: 13px;
      font-weight: 400;
      line-height: 1.5;
      margin-bottom: 8px;
      opacity: 0.95;
      color: rgba(255, 255, 255, 0.9);
    }
    
    .btn-example {
      font-size: 12px;
      font-style: italic;
      line-height: 1.4;
      opacity: 0.85;
      color: rgba(255, 255, 255, 0.8);
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.15);
    }
    
    @media (max-width: 768px) {
      .sti-opt-btn {
        padding: 14px;
      }
      
      .btn-title {
        font-size: 15px;
      }
      
      .btn-description {
        font-size: 12px;
      }
      
      .btn-example {
        font-size: 11px;
      }
    }
    
    @media (max-width: 768px){ .ocultar-movil{display:none!important;} }
  </style>

  <!-- 📊 Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-53DLE59WF1"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-53DLE59WF1', { anonymize_ip: true });
  </script>

  <!-- 🔎 JSON-LD unificado -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": "https://stia.com.ar/#local",
        "name": "STI - Servicio Técnico Inteligente",
        "url": "https://stia.com.ar/",
        "image": "https://stia.com.ar/img/logo-sti1.png",
        "logo": "https://stia.com.ar/img/logo-sti1.png",
        "telephone": "+5493417422422",
        "priceRange": "$$",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "Colon 2830",
          "addressLocality": "Rosario",
          "addressRegion": "Santa Fe",
          "postalCode": "2000",
          "addressCountry": "AR"
        },
        "geo": { "@type": "GeoCoordinates", "latitude": -32.9587, "longitude": -60.6939 },
        "hasMap": "https://maps.app.goo.gl/yfswNXVhSyYL1rgk9",
        "areaServed": [
          { "@type": "City", "name": "Rosario" },
          { "@type": "AdministrativeArea", "name": "Santa Fe" },
          { "@type": "Country", "name": "Argentina", "identifier": "AR" }
        ],
        "serviceArea": { "@type": "Place", "name": "Rosario y alrededores" },
        "openingHoursSpecification": [
          { "@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday"],"opens":"09:00","closes":"18:00" },
          { "@type":"OpeningHoursSpecification","dayOfWeek":"Saturday","opens":"10:00","closes":"14:00" }
        ],
        "sameAs": [
          "https://www.instagram.com/sti.rosario/",
          "https://www.facebook.com/stirosario/"
        ],
        "contactPoint": [{
          "@type":"ContactPoint","contactType":"customer support","telephone":"+5493417422422","areaServed":"AR","availableLanguage":["es"]
        }],
        "knowsAbout":[
          "reparación de PC","reparación de notebooks","asistencia remota","soporte técnico empresas",
          "mantenimiento preventivo","seguridad informática","optimización de Windows","redes"
        ]
      },
      {
        "@type":"Organization","@id":"https://stia.com.ar/#org","name":"STI - Servicio Técnico Inteligente",
        "url":"https://stia.com.ar/","logo":"https://stia.com.ar/img/logo-sti1.png",
        "sameAs":["https://www.instagram.com/sti.rosario/","https://www.facebook.com/stirosario/"]
      },
      {
        "@type":"WebPage","@id":"https://stia.com.ar/#home","url":"https://stia.com.ar/","name":"Inicio — STI Rosario",
        "isPartOf":{"@id":"https://stia.com.ar/#org"},
        "primaryImageOfPage":{"@type":"ImageObject","url":"https://stia.com.ar/img/og-sti-1200x630.jpg","width":1200,"height":630},
        "inLanguage":"es-AR","about":{"@id":"https://stia.com.ar/#local"},
        "description":"Servicio Técnico Inteligente en Rosario. Reparación de PC y notebooks, asistencia remota y soporte para PyMEs."
      },
      {
        "@type":"WebSite","@id":"https://stia.com.ar/#website","url":"https://stia.com.ar/",
        "name":"STI — Servicio Técnico Inteligente","publisher":{"@id":"https://stia.com.ar/#org"},
        "inLanguage":"es-AR",
        "potentialAction":{"@type":"SearchAction","target":"https://stia.com.ar/?s={search_term_string}","query-input":"required name=search_term_string"}
      },
      {
        "@type":"BreadcrumbList","itemListElement":[
          {"@type":"ListItem","position":1,"name":"Inicio","item":"https://stia.com.ar/"},
          {"@type":"ListItem","position":2,"name":"Servicios","item":"https://stia.com.ar/#servicios"}
        ]
      },
      { "@type":"Service","@id":"https://stia.com.ar/#serv-notebooks","serviceType":"Reparación de notebooks y PC","areaServed":"Rosario","provider":{"@id":"https://stia.com.ar/#local"} },
      { "@type":"Service","@id":"https://stia.com.ar/#serv-remoto","serviceType":"Asistencia remota inmediata","areaServed":"Argentina","provider":{"@id":"https://stia.com.ar/#local"} },
      { "@type":"Service","@id":"https://stia.com.ar/#serv-pymes","serviceType":"Soporte y mantenimiento para PyMEs","areaServed":"Rosario","provider":{"@id":"https://stia.com.ar/#local"} },
      { "@type":"Service","@id":"https://stia.com.ar/#serv-redes","serviceType":"Instalación y optimización de redes","areaServed":"Rosario","provider":{"@id":"https://stia.com.ar/#local"} }
    ]
  }
  </script>
</head>
<body>

  <!-- Header -->
  <header id="main-header">
    <div class="container header-content">
      <img src="img/logo-sti1.png" alt="Logo STI" class="logo" width="70" height="70" decoding="async">
      <nav class="main-nav ocultar-movil">
        <a href="#servicios">Servicios</a>
        <a href="#por-que-elegir">Beneficios</a>
        <a href="#clientes">Clientes</a>
        <a href="#horarios">Horarios</a>
        <a href="#contacto">Contacto</a>
        <a href="https://stia.com.ar/tickets-admin.php" target="_blank" rel="noopener noreferrer">Tickets</a>
      </nav>
      <!-- Última actualización automática (se actualiza sola al modificar el archivo)
      <?php
        $lastMod = filemtime(__FILE__);
        $dateStr = date('d/m/Y H:i', $lastMod);
      ?>
      <div style="position:fixed;top:10px;right:10px;background:rgba(255,0,0,0.8);color:white;padding:5px 10px;border-radius:5px;font-size:11px;z-index:9999;">
        📅 Última actualización: <?php echo $dateStr; ?> hs
      </div> -->
      <!-- Botón azul que abre el chat -->
      <a href="#asistencia" id="btn-asistencia-header" class="btn-asistencia-header ocultar-movil" title="Abrir chat de asistencia 24/7">
        <img src="img/btn_asistencia.png" alt="Asistencia 24/7" class="btn-asistencia-img" />
      </a>
      <!-- Botón Instalar App (oculto permanentemente) -->
      <!-- <button id="installAppBtn" class="btn-install-pwa" style="display: none;">
        <svg class="use-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z" fill="currentColor"/>
        </svg>
        <span>Instalar App</span>
      </button> -->
    </div>
  </header>

  <!-- Hero principal -->
  <section id="hero" itemscope itemtype="https://schema.org/Service">
    <div class="hero-overlay">
      <div class="hero-frame">
        <picture>
          <source type="image/avif" srcset="img/hero-desktop-768-512.avif 768w, img/hero-desktop-1280-853.avif 1280w">
          <source type="image/webp" srcset="img/hero-desktop-768-512.webp 768w, img/hero-desktop-1280-853.webp 1280w">
          <img src="img/hero-desktop-1280-853.jpg"
               srcset="img/hero-desktop-768-512.jpg 768w, img/hero-desktop-1280-853.jpg 1280w"
               sizes="(max-width: 768px) 100vw, 1280px"
               alt="Logo STI Servicio Técnico Inteligente Rosario"
               class="hero-art" width="1280" height="853"
               loading="eager" fetchpriority="high" decoding="async" itemprop="image">
        </picture>

        <h1 itemprop="name">Servicio Técnico Inteligente en Rosario</h1>
        <p itemprop="description">Reparación, mantenimiento y asistencia remota con atención inmediata y garantía.</p>
        <a href="#asistencia" id="btn-asistencia-hero" class="btn-metal btn-hero-m" title="Asistencia 24/7">Asistencia 24/7</a>
      </div>
    </div>
  </section>

  <!-- Franja con texto metálico -->
  <section id="franja-metal">
    <div class="franja-metal-text">SERVICIO TÉCNICO INTELIGENTE</div>
    <div class="franja-subtexto">Soporte rápido, profesional y garantizado</div>
  </section>

  <!-- Servicios -->
  <section id="servicios" class="accent accent-blue">
    <h2 class="section-title">Nuestros Servicios</h2>
    <div class="subtitulo-marcas">
      <h3>Especialistas Multimarcas</h3>
      <ul class="logos-marcas">
        <li><img src="img/marcas/lenovo.png" alt="Lenovo" width="120" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/msi.png" alt="MSI" width="110" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/samsung.png" alt="Samsung" width="120" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/dell.png" alt="Dell" width="120" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/windows.png" alt="Windows" width="120" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/acer.png" alt="Acer" width="110" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/asrock.png" alt="ASRock" width="120" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/asus.png" alt="ASUS" width="120" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/toshiba.png" alt="Toshiba" width="120" height="36" loading="lazy" decoding="async"></li>
        <li><img src="img/marcas/hp.png" alt="HP" width="120" height="36" loading="lazy" decoding="async"></li>
      </ul>
    </div>

    <span class="image fit main">
      <img src="img/urgencias.jpg" alt="Técnico reparando computadora - Urgencias técnicas STI Rosario" width="1280" height="420" loading="lazy" decoding="async">
    </span>

    <div class="servicios-grid">
      <a class="servicio" href="/pcynotebook.html"><h3><span class="icono emoji">🖥</span> PC y Notebook</h3><p>Reparación, actualización y reemplazo de hardware.</p></a>
      <a class="servicio" href="/mantenimientopreventivo.html"><h3><span class="icono emoji">⚙️</span> Mantenimiento Preventivo</h3><p>Limpieza interna, control térmico y optimización general de equipos.</p></a>
      <a class="servicio" href="/asistenciaremota.html"><h3><span class="icono emoji">🌐</span> Asistencia Remota</h3><p>Soluciones inmediatas sin moverte de tu casa o empresa.</p></a>
      <a class="servicio" href="/seguridadyrespaldo.html"><h3><span class="icono emoji">🔒</span> Seguridad y Respaldo</h3><p>Protección contra virus, copias de seguridad y recuperación de datos.</p></a>
      <a class="servicio" href="/optimizacionderendimiento.html"><h3><span class="icono emoji">🧠</span> Optimización de Rendimiento</h3><p>Eliminación de procesos innecesarios y aceleración de Windows.</p></a>
      <a class="servicio" href="/soporteparapymes.html"><h3><span class="icono emoji">☁️</span> Soporte para PyMEs</h3><p>Instalación, mantenimiento y monitoreo de redes y servidores.</p></a>
    </div>
  </section>

  <!-- ¿POR QUÉ ELEGIR STI? -->
  <section id="por-que-elegir" class="accent accent-green">
    <h2 class="section-title">¿Por qué elegir STI?</h2>
    <div class="pqe-card accent accent-green">
      <ul class="pqe-list">
        <li><span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg></span><span class="pqe-txt"><strong>Atención inmediata</strong> con soporte técnico ágil, confiable y respuesta garantizada en minutos. Damos soluciones inmediatas.</span></li>
        <li><span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 5.58 2 10c0 2.97 2.11 5.55 5.19 7.03L6 22l5.27-3.2c.23.01.46.02.73.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/></svg></span><span class="pqe-txt"><strong>Asistencia directa</strong> por WhatsApp o con nuestro asistente IA los 7 días, con atención personalizada y seguimiento continuo.</span></li>
        <li><span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2zm0 3.84L17.53 20H6.47L12 5.84z"/></svg></span><span class="pqe-txt"><strong>Soluciones inteligentes</strong> para cualquier equipo, aplicando diagnósticos rápidos, seguros y eficientes.</span></li>
        <li><span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M20 8h-3V4H7v4H4v14h16V8zm-5 0H9V6h6v2z"/></svg></span><span class="pqe-txt"><strong>Reparaciones precisas</strong> con optimización avanzada, limpieza completa y calibración profesional.</span></li>
        <li><span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-2 19.8V22h4v-.2A10 10 0 0 0 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg></span><span class="pqe-txt"><strong>Mantenimiento preventivo</strong> que mejora el rendimiento, evita fallas y extiende la vida útil del sistema.</span></li>
        <li><span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4.15L18 8v3c0 4.02-2.8 7.97-6 9.19C8.8 18.97 6 15.02 6 11V8l6-2.85z"/></svg></span><span class="pqe-txt"><strong>Seguridad garantizada</strong> con protección total ante virus, spyware y amenazas digitales permanentes.</span></li>
      </ul>
      <div class="pqe-cta">
        <a class="btn-metal" href="https://wa.me/5493417422422?text=Hola%20STI%2C%20necesito%20un%20presupuesto" target="_blank" rel="noopener noreferrer">👋 Pedir presupuesto sin cargo</a>
      </div>
    </div>
  </section>

  <!-- Preguntas Frecuentes -->
  <section class="faq-sti" id="faq">
    <h2>Preguntas Frecuentes</h2>
    <div class="faq-item"><h3>🕓 ¿Cuánto demora una reparación?</h3><p>Depende del tipo de falla. En la mayoría de los casos, el diagnóstico se realiza en menos de 24 horas y la reparación dentro de las <span class="sti-text">48 a 72 horas</span> siguientes. También contamos con servicio express para urgencias técnicas.</p></div>
    <div class="faq-item"><h3>🛡️ ¿Ofrecen garantía?</h3><p>Sí. Todas nuestras reparaciones <span class="sti-text">Cuentan con garantía</span> escrita por el trabajo realizado y los repuestos utilizados. Tu equipo queda cubierto ante cualquier inconveniente relacionado con la reparación.</p></div>
    <div class="faq-item"><h3>💻 ¿Cómo funciona la asistencia remota?</h3><p>Utilizamos la aplicación <span class="sti-text">AnyDesk</span> para conectarnos de forma segura a tu equipo. De esta manera, podemos resolver problemas sin necesidad de que te acerques al taller. Solo necesitás descargar el programa y compartirnos el código de acceso.</p></div>
    <div class="faq-item"><h3>🚚 ¿Ofrecen retiro y entrega a domicilio?</h3><p>Sí, contamos con el  <span class="sti-text">Servicio de retiro y entrega</span> de equipos en Rosario y alrededores. Coordinamos el horario para tu comodidad.</p></div>
    <div class="faq-item"><h3>💬 ¿Tienen atención las 24 horas?</h3><p>Nuestro servicio de <span class="sti-text">Urgencias Técnicas 24/7</span> está disponible para atender imprevistos fuera del horario habitual. Solo escribinos por WhatsApp y te asistimos de inmediato.</p></div>
  </section>

  <!-- Clientes -->
  <section id="clientes" class="accent accent-blue">
    <h2 class="section-title">Empresas que eligen STI</h2>
    <span class="image fit main">
      <img src="img/clientes.jpg" alt="Empresas y clientes que confían en STI Rosario — Servicio Técnico Inteligente" width="1280" height="420" loading="lazy" decoding="async">
    </span>
    <div class="clientes-grid">
      <a href="https://centromedicobernasconi.com/" target="_blank" rel="noopener noreferrer" class="cliente-item">Centro Médico Bernasconi</a>
      <a href="http://www.cruzazulsalud.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Gastrounion S.R.L.</a>
      <a href="https://keymarkets.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Key Markets</a>
      <a href="https://www.instagram.com/institutoaxis/" target="_blank" rel="noopener noreferrer" class="cliente-item">Instituto Axis</a>
      <a href="https://www.facebook.com/p/Veterinaria-Dr-Fernando-G%C3%B3mez-100063474005411/?_rdr" target="_blank" rel="noopener noreferrer" class="cliente-item">Veterinaria Dr. Fernando Gómez</a>
      <a href="https://percomunicaciones.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Per Comunicaciones</a>
      <a href="https://condorgroup.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Condor Group</a>
      <a href="https://www.pediatriarosario.org.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Sociedad de Pediatría Rosario</a>
      <a href="https://crirosario.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Centro Respiratorio Infantil</a>
      <a href="https://www.gasrl.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Cromados Gaspar Avigliano S.R.L.</a>
      <a href="https://distrimedica.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Droguería Distrimédica S.A.</a>
      <a href="https://www.centrodinamia.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">Centro Dinamia</a>
      <a href="https://elpalaciobebe.com/" target="_blank" rel="noopener noreferrer" class="cliente-item">El Palacio del Bebé</a>
      <a href="https://expendedorasrosario.com.ar/" target="_blank" rel="noopener noreferrer" class="cliente-item">ME Rosario S.R.L.</a>
      <a href="https://www.facebook.com/LaCardera/" target="_blank" rel="noopener noreferrer" class="cliente-item">Centro Médico La Cardera</a>
    </div>
  </section>

  <!-- IA / quiénes somos -->
  <section id="ia-sti" class="accent accent-violet">
    <header>
      <h2 class="section-title">STI</h2>
      <h3>Servicio Técnico Inteligente</h3>
      <p>Somos una empresa dedicada al mantenimiento, reparación y optimización de equipos informáticos. Integramos <strong>tecnología, experiencia y atención personalizada</strong> para ofrecer soluciones reales y confiables.</p>
      <p>Aplicamos diagnóstico avanzado e inteligencia artificial para detectar fallas, mejorar el rendimiento y extender la vida útil de tus dispositivos.</p>
      <p>Brindamos asistencia presencial y remota con respuesta inmediata, soporte 24/7 y garantía en cada servicio.</p>
    </header>
  </section>

  <!-- ===== SECCIÓN CONTACTO (con protecciones) ===== -->
  <section id="contacto" class="accent accent-blue">
    <h2 class="section-title">📩 Contactanos</h2>
    <p class="section-desc">
      Dejanos tu consulta y te responderemos a la brevedad. También podés escribirnos por
      <a href="https://wa.me/5493417422422" target="_blank" rel="noopener">WhatsApp</a>.
    </p>

    <form action="/enviar.php" method="POST" class="form-sti" autocomplete="off" novalidate>
      <input type="text" name="nombre" placeholder="Tu nombre completo" required>
      <input type="email" name="email" placeholder="Tu correo electrónico" required>
      <input type="tel" name="telefono" placeholder="Tu teléfono (opcional)">
      <textarea name="mensaje" placeholder="Escribí tu mensaje..." required></textarea>

      <!-- Honeypot (no completar) -->
      <input type="text" name="empresa" style="display:none">

      <!-- Time-trap -->
      <input type="hidden" id="sti_started_at" name="started_at" value="">

      <!-- CSRF token -->
      <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token'], ENT_QUOTES, 'UTF-8'); ?>">

      <!-- Cloudflare Turnstile -->
      <div class="cf-turnstile" data-sitekey="0x4AAAAAAB9AB_9-RPi1XoqF" data-theme="dark"></div>

      <button type="submit" class="btn-metal">📨 Enviar mensaje</button>
    </form>
  </section>

  <!-- Script Turnstile + Time-trap -->
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
  <script>
    document.addEventListener('DOMContentLoaded', ()=>{
      const t=document.getElementById('sti_started_at');
      if(t){ t.value = Date.now(); }
    });
  </script>

  <!-- Horarios -->
  <section id="horarios" class="accent accent-violet">
    <h3 class="section-title">- Horarios de Atención -</h3>
    <p>Lunes a Viernes de 9 a 18 Hs.</p>
    <p>Sábado de 10 a 14 Hs.</p>
    <h3 class="section-title">- Urgencias -</h3>
    <p>Consultas y Asistencia 24 Hs.</p>
    <div class="boton-anydesk"><a href="https://download.anydesk.com/AnyDesk.exe" target="_blank" rel="noopener noreferrer">🔴 Descargar AnyDesk</a></div>

    <div class="cta-social">
      <ul class="icons">
        <li><a href="https://www.instagram.com/sti.rosario" target="_blank" rel="noopener noreferrer"><img src="img/iconsinstagram.png" alt="Instagram STI" width="40" height="40" decoding="async"></a></li>
        <li><a href="https://maps.app.goo.gl/yfswNXVhSyYL1rgk9" target="_blank" rel="noopener noreferrer"><img src="img/iconslocation.png" alt="Ubicación STI" width="40" height="40" decoding="async"></a></li>
        <li><a href="mailto:sti.rosario@gmail.com?subject=Consulta%20STI" target="_blank" rel="noopener noreferrer"><img src="img/iconsemail.png" alt="Email STI" width="40" height="40" decoding="async"></a></li>
        <li><a href="https://wa.me/5493417422422?text=🔧%20STI%20Servicio%20Técnico%20Inteligente%0A💬%20¡Hola!%20👋%0A🌐%20Ingresé%20desde%20la%20web" target="_blank" rel="noopener noreferrer"><img src="img/iconswhatsapp.png" alt="WhatsApp STI" width="40" height="40" decoding="async"></a></li>
        <li><a href="https://www.mercadopago.com.ar/" target="_blank" rel="noopener noreferrer"><img src="img/iconsMP.png" alt="Mercado Pago" width="40" height="40" decoding="async"></a></li>
        <li><a href="https://www.facebook.com/stirosario" target="_blank" rel="noopener noreferrer"><img src="img/Face70.png" alt="Facebook STI" width="40" height="40" decoding="async"></a></li>
      </ul>
    </div>
  </section>

  <!-- Footer -->
  <footer id="main-footer">
    <div class="footer-bottom">
      <p>
        © 2025 <strong>STI</strong> Servicio Técnico Inteligente<br>
        Reparación de PC, notebooks y soporte remoto en Rosario.<br>
        <a href="/politica-privacidad.html" class="footer-link">Política de Privacidad</a>
      </p>
    </div>
  </footer>

  <!-- Navegación semántica oculta (SEO helper) -->
  <div style="display:none;">
    <nav itemscope itemtype="https://schema.org/SiteNavigationElement">
      <a href="#hero" itemprop="url"><span itemprop="name">Inicio</span></a> |
      <a href="#servicios" itemprop="url"><span itemprop="name">Servicios</span></a> |
      <a href="#por-que-elegir" itemprop="url"><span itemprop="name">Beneficios</span></a> |
      <a href="#testimonios" itemprop="url"><span itemprop="name">Testimonios</span></a> |
      <a href="#clientes" itemprop="url"><span itemprop="name">Clientes</span></a> |
      <a href="#contacto" itemprop="url"><span itemprop="name">Contacto</span></a>
    </nav>
    <ul>
      <li>Reparación de PC y notebooks en Rosario</li>
      <li>Asistencia remota y soporte técnico 24 horas</li>
      <li>Mantenimiento preventivo y optimización de rendimiento</li>
      <li>Urgencias técnicas, retiro y entrega a domicilio</li>
      <li>Armado de PCs a medida y asesoramiento informático</li>
    </ul>
  </div>

  <!-- Botón flotante WhatsApp -->
  <a href="https://wa.me/5493417422422?text=🔧%20STI%20Servicio%20Técnico%20Inteligente%0A💬%20¡Hola!%20👋%0A🌐%20Ingresé%20desde%20la%20web%0A🧑‍💻%20Mi%20nombre%20es...%20(escribí%20tu%20nombre%20y%20presioná%20enviar%20✉️)"
     class="whatsapp-float" target="_blank" rel="noopener noreferrer" title="WhatsApp"></a>

  <!-- Botón flotante Presupuesto -->
  <a href="https://wa.me/5493417422422?text=🔧%20STI%20Servicio%20Técnico%20Inteligente%0A💬%20¡Hola!%20👋%0A🌐%20Ingresé%20desde%20la%20web%0A🧑‍💻%20Mi%20nombre%20es...%20(escribí%20tu%20nombre%20y%20presioná%20enviar%20✉️)"
     class="btn-flotante-presupuesto" target="_blank" rel="noopener noreferrer" title="Presupuesto sin cargo">
     <span class="simbolo">$</span><span class="simbolo">$</span>
  </a>

  <!-- Utilitarios (shuffle clientes + fixed-top helper) -->
  <script>
    (window.requestIdleCallback || function(cb){return setTimeout(cb, 1)})(function(){
      document.addEventListener("DOMContentLoaded", function(){
        const contenedor = document.querySelector(".clientes-grid");
        if(!contenedor) return;
        const clientes = Array.from(contenedor.children);
        for(let i=clientes.length-1;i>0;i--){
          const j=Math.floor(Math.random()*(i+1));
          [clientes[i],clientes[j]]=[clientes[j],clientes[i]];
        }
        contenedor.innerHTML="";
        clientes.forEach(c=>contenedor.appendChild(c));
      });
    });
    function toggleFixedTop(){
      const els = document.querySelectorAll('.fixed-top, .sticky-top');
      if (window.innerWidth <= 768) {
        els.forEach(el => { el.style.position = 'static'; el.style.top = ''; });
        document.body.style.paddingTop = '0px';
      } else {
        els.forEach(el => { el.style.position = ''; el.style.top = ''; });
      }
    }
    window.addEventListener('load', toggleFixedTop, {passive:true});
    window.addEventListener('resize', toggleFixedTop, {passive:true});
  </script>

  <!-- ===== AVISO DE COOKIES STI ===== -->
  <div id="cookie-banner" class="cookie-banner">
    <p>
      🔒 Usamos cookies propias y de terceros para mejorar tu experiencia, analizar el tráfico
      y ofrecer asistencia personalizada. Al continuar, aceptás nuestra
      <a href="/politica-privacidad.html" target="_blank">Política de Privacidad</a>.
    </p>
    <button id="cookie-ok">Aceptar</button>
  </div>
  <script>
    const stiBanner = document.getElementById('cookie-banner');
    const stiBtn = document.getElementById('cookie-ok');
    if (!localStorage.getItem('stiCookiesAccepted')) { stiBanner.style.display = 'flex'; }
    stiBtn.onclick = () => { localStorage.setItem('stiCookiesAccepted', 'true'); stiBanner.style.display = 'none'; };
  </script>
  <style>
    /* ===== COOKIE BANNER STI (versión azul) ===== */
    .cookie-banner { display:none; position:fixed; bottom:0; left:0; right:0; background:rgba(10,15,25,.95);
      color:#e0e0e0; font-family:'Exo',sans-serif; font-size:14px; line-height:1.5; padding:14px 20px;
      border-top:1px solid rgba(92,200,255,.25); box-shadow:0 -2px 14px rgba(92,200,255,.15);
      justify-content:space-between; align-items:center; flex-wrap:wrap; z-index:9999;}
    .cookie-banner p { margin:0; flex:1; text-align:left; }
    .cookie-banner a { color:#58a6ff; text-decoration:underline; }
    .cookie-banner button { background:linear-gradient(135deg,#007bff,#00b4ff); color:#fff; border:none; padding:8px 18px;
      border-radius:8px; font-weight:600; cursor:pointer; transition:background .3s, transform .2s; box-shadow:0 0 10px rgba(92,200,255,.25); }
    .cookie-banner button:hover { background:linear-gradient(135deg,#0ea5e9,#38bdf8); transform:translateY(-1px); }
    @media (max-width:600px){ .cookie-banner{flex-direction:column; text-align:center;} .cookie-banner button{margin-top:10px;} }
  </style>

  <!-- ========== CONTENEDOR DEL CHAT (alineado a CSS/JS nuevos) ========== -->
  <div id="sti-chat-box" role="dialog" aria-label="Chat STI Rosario"
       style="display:none; --sti-title:'Asistencia 24/7 · STI'">
    <!-- Botón cerrar -->
    <button id="sti-close" type="button" aria-label="Cerrar">×</button>

    <!-- Área de mensajes -->
    <div id="sti-messages"></div>

    <!-- Área de input -->
    <div class="sti-input-area">
      <input id="sti-text" type="text" placeholder="Escribí tu mensaje…" autocomplete="off">
      <button id="sti-send" type="button">Enviar</button>
    </div>
  </div>
  <!-- ================================================================ -->
<!-- REEMPLAZAR el bloque <script> del chat por este -->
<script>
document.addEventListener('DOMContentLoaded', function () {
  // ====== API base ======
  // ========================================================
  // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #6
  // ========================================================
  // ⚠️  ADVERTENCIA: Estas variables están funcionando en producción
  // 📅 Última validación: 25/11/2025
  // ✅ Estado: FUNCIONAL Y TESTEADO
  //
  // 🚨 ANTES DE MODIFICAR:
  //    1. Consultar con el equipo
  //    2. NO cambiar nombres de variables (rompería todo)
  //    3. NO cambiar API_BASE sin actualizar backend
  //    4. Verificar que newSID() genera IDs únicos
  //
  // 📋 Funcionalidad protegida:
  //    - IS_LOCAL: Detección de entorno local/producción
  //    - API_BASE: URL base del backend (local o Render)
  //    - API_CHAT, API_GREET, etc: Endpoints específicos
  //    - SESSION_ID: Identificador único de sesión
  //    - CSRF_TOKEN: Token de seguridad CSRF
  //
  // 🔗 Dependencias:
  //    - Todas las funciones que hacen fetch() usan estas URLs
  //    - Backend espera sessionId en headers y body
  //    - Backend valida csrfToken en todos los POST
  //    - TODO EL CHAT depende de estas variables
  //
  // ========================================================
  const IS_LOCAL  = ['localhost','127.0.0.1'].includes(location.hostname);
  const API_BASE  = (window.STI_API_BASE) || (IS_LOCAL ? 'http://localhost:3001' : 'https://sti-rosario-ai.onrender.com');
  const API_CHAT   = API_BASE + '/api/chat';  // ✅ CORRECTO: Endpoint estándar
  const API_GREET  = API_BASE + '/api/greeting';
  const API_TICKET = API_BASE + '/api/whatsapp-ticket';
  const API_RESET  = API_BASE + '/api/reset';

  // ====== Generador de SID (nuevo en cada apertura) ======
  const newSID = () => 'web-' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  let SESSION_ID = newSID();
  let CSRF_TOKEN = null;  // ✅ Inicializar CSRF_TOKEN
  function baseHeaders(){ return { 'Content-Type':'application/json', 'x-session-id': SESSION_ID }; }

  // ====== DOM ======
  const box      = document.getElementById('sti-chat-box');
  const msgs     = document.getElementById('sti-messages');
  const input    = document.getElementById('sti-text');
  const send     = document.getElementById('sti-send');
  const headerBtn= document.getElementById('btn-asistencia-header');
  const heroBtn  = document.getElementById('btn-asistencia-hero');
  const closeBtn = document.getElementById('sti-close');

  // ====== Render ======
  let typingEl = null;
  function addMsg(text, who='bot'){
    if (!msgs) return null;
    const row = document.createElement('div');
    row.className = 'sti-msg ' + (who === 'user' ? 'sti-user' : 'sti-bot');
    const bubble = document.createElement('div');
    bubble.className = 'sti-bubble';
    
    // Convertir URLs a links clickeables
    let html = String(text||'').replace(/\n/g,'<br>');
    html = html.replace(
      /(https?:\/\/[^\s<]+)/g, 
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">$1</a>'
    );
    bubble.innerHTML = html;
    
    row.appendChild(bubble);
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
    return row;
  }
  function addTyping(){
    if (typingEl || !msgs) return;
    typingEl = document.createElement('div');
    typingEl.className = 'sti-typing';
    typingEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    msgs.appendChild(typingEl);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function removeTyping(){ if(typingEl){ typingEl.remove(); typingEl=null; } }

 // ====== WhatsApp ticket ======
  // Detectar si es escritorio (Windows / Mac / Linux)
  function stiIsDesktop() {
    return /Windows|Macintosh|Linux/i.test(navigator.userAgent);
  }

  async function openTicket(){
    try{
      const r = await fetch(API_TICKET, {
        method:'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ sessionId: SESSION_ID })
      });
      const d = await r.json().catch(()=> ({}));

      if (!d) {
        addMsg('No pude generar el ticket ahora.', 'bot');
        return;
      }

      // 👉 En PC priorizamos WhatsApp Web (mensaje pre-cargado)
      // 👉 En celular priorizamos wa.me (abre la app con el texto)
      let url;
    if (stiIsDesktop()) {
        // PC: primero intento abrir la APP de WhatsApp
        url = d.waAppUrl || d.waWebUrl || d.waUrl || d.waIntentUrl;
      } else {
        // Móvil: priorizo wa.me (abre app con el texto)
        url = d.waUrl || d.waAppUrl || d.waWebUrl || d.waIntentUrl;
      }

      if (url) {
        window.open(url, '_blank', 'noopener');
      } else {
        addMsg('No pude generar el ticket ahora.', 'bot');
      }
    } catch (e) {
      addMsg('No pude conectar con el generador de tickets 😕', 'bot');
    }
  }

  function appendWAButton(toNode){
    if (!toNode || toNode.querySelector?.('.sti-wa-btn')) return;
    const wrap = document.createElement('div');
    wrap.style.marginTop = '10px';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sti-wa-btn';
    b.textContent = '📲 Hablar con un Técnico';
    b.addEventListener('click', openTicket);
    wrap.appendChild(b);
    toNode.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }


  // ====== Render botones / quick-replies ======
  function normalizeButtons(payload){
    // payload puede venir como:
    // - Array directo [{text,value}] o [{label,value}] ← NUEVO FORMATO
    // - data.ui.buttons: objeto con listas [{label,value},...]
    // - data.options: array de strings
    const out = [];
    if (!payload) return out;
    
    console.log('🔍 normalizeButtons input:', payload);
    
    try {
      // NUEVO: Si payload es array directo [{text,value,icon,description}]
      if (Array.isArray(payload) && payload.length) {
        payload.forEach(it => {
          if (typeof it === 'string') {
            out.push({ label: it, value: it });
          } else if (it && (it.text || it.label)) {
            // Soportar tanto {text,value} como {label,value}
            const label = it.text || it.label;
            const value = it.value || label;
            const icon = it.icon || '';
            const description = it.description || '';
            const example = it.example || '';
            out.push({ label, value, text: label, icon, description, example });
          }
        });
        console.log('✅ Parsed as direct array:', out);
        return out;
      }
      
      // si es un objeto con keys -> arrays
      if (payload.buttons && typeof payload.buttons === 'object') {
        // priorizar botones conocidos (basic_options, ask_device) si existen
        const keys = Object.keys(payload.buttons);
        for (const k of keys) {
          const list = payload.buttons[k];
          if (Array.isArray(list)) {
            list.forEach(it => {
              if (typeof it === 'string') out.push({ label: it, value: it });
              else if (it && it.label) out.push({ label: it.label, value: it.value || it.label });
            });
          }
        }
      }
      // legacy: array de strings en payload.options
      if (Array.isArray(payload.options) && payload.options.length) {
        payload.options.forEach(it => {
          if (typeof it === 'string') out.push({ label: it, value: it });
        });
      }
    } catch (e) { 
      console.error('❌ Error in normalizeButtons:', e);
    }
    console.log('🔍 normalizeButtons output:', out);
    return out;
  }

  function renderButtons(containerRow, buttonList){
    if (!containerRow || !buttonList || !buttonList.length) return;
    // evitar duplicar
    if (containerRow.querySelector('.sti-options')) return;
    const wrap = document.createElement('div');
    wrap.className = 'sti-options';
    buttonList.forEach(btn => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sti-opt-btn';
      
      // Add icon if available
      if (btn.icon) {
        const icon = document.createElement('span');
        icon.className = 'btn-icon';
        icon.textContent = btn.icon + ' ';
        b.appendChild(icon);
      }
      
      // Create button content with title, description, and example
      const title = document.createElement('div');
      title.className = 'btn-title';
      title.textContent = btn.text || btn.label || btn.value;
      b.appendChild(title);
      
      // Add description if available
      if (btn.description) {
        const desc = document.createElement('div');
        desc.className = 'btn-description';
        desc.textContent = btn.description;
        b.appendChild(desc);
      }
      
      // Add example if available
      if (btn.example) {
        const example = document.createElement('div');
        example.className = 'btn-example';
        example.textContent = btn.example;
        b.appendChild(example);
      }
      
      b.dataset.value = btn.value || btn.label;
      b.addEventListener('click', (ev)=>{
        ev.preventDefault();
        // mostrar como mensaje del usuario (etiqueta del botón)
        addMsg(title.textContent, 'user');
        // opcional: remove options UI after click
        wrap.querySelectorAll('.sti-opt-btn').forEach(x => x.disabled = true);
        sendButton(b.dataset.value, title.textContent);
      });
      wrap.appendChild(b);
    });
    // colocar dentro del bubble si existe, sino al final del row
    const bubble = containerRow.querySelector('.sti-bubble');
    if (bubble) bubble.appendChild(wrap);
    else containerRow.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ========================================================
  // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #2
  // ========================================================
  // ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
  // 📅 Última validación: 25/11/2025
  // ✅ Estado: FUNCIONAL Y TESTEADO
  //
  // 🚨 ANTES DE MODIFICAR:
  //    1. Consultar con el equipo
  //    2. Verificar que CSRF_TOKEN se envía correctamente
  //    3. Testear detección de rechazo GDPR (botón "No")
  //    4. Validar cambio de UI (botón Cerrar)
  //
  // 📋 Funcionalidad protegida:
  //    - Envío de payload con action:'button' + CSRF token
  //    - Validación de respuestas HTTP (403, 429, 500)
  //    - Detección de rechazo GDPR y cambio de UI
  //    - Ocultación de input y cambio de botón a "Cerrar" rojo
  //    - Rendering de botones subsecuentes
  //
  // 🔗 Dependencias:
  //    - Backend: validateCSRF espera csrfToken en payload
  //    - Backend: ASK_LANGUAGE devuelve texto específico en rechazo
  //    - stiHideChat(): Llamada cuando usuario cierra después de rechazar
  //    - normalizeButtons(): Parsea botones de la respuesta
  //
  // ========================================================
  // ====== Envío de botón (action: 'button') ======
  async function sendButton(value, label){
    addTyping();
    try {
      const payload = { 
        action: 'button', 
        value: String(value || ''), 
        label: String(label || ''), 
        sessionId: SESSION_ID,
        csrfToken: CSRF_TOKEN
      };
      console.log('📤 Enviando botón:', payload);
      const r = await fetch(API_CHAT, { method: 'POST', headers: baseHeaders(), body: JSON.stringify(payload) });
      
      if (!r.ok) {
        console.error('❌ Error HTTP:', r.status, r.statusText);
        const errorText = await r.text().catch(() => '');
        console.error('❌ Error body:', errorText);
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      
      const data = await r.json().catch((err)=> {
        console.error('❌ Error parsing JSON:', err);
        return {};
      });
      console.log('📥 Respuesta del servidor:', data);
      removeTyping();
      
      if (!data || !data.reply) {
        console.error('❌ Respuesta vacía o sin reply:', data);
        addMsg('😕 No recibí una respuesta válida del servidor.', 'bot');
        return;
      }
      
      const node = addMsg(data.reply, 'bot');

      // 🔍 DETECTAR RECHAZO DE GDPR
      if (value === 'no' && data.reply && /sin tu consentimiento no puedo continuar/i.test(data.reply)) {
        console.log('❌ Usuario rechazó términos GDPR - Cambiar UI a modo Cerrar');
        // Ocultar input y cambiar botón a "Cerrar"
        if (input) input.style.display = 'none';
        if (send) {
          send.textContent = 'Cerrar';
          send.style.backgroundColor = '#dc3545'; // Rojo
          send.onclick = () => stiHideChat();
        }
        return; // No mostrar más botones
      }

      // mostrar botones si vienen en la respuesta
      // Priorizar data.buttons (tiene description/example) antes que data.options
      const btns = normalizeButtons(data?.buttons || data?.ui || data?.options);
      if (btns.length) renderButtons(node, btns);

      // WA button si corresponde
      if (data && (data.allowWhatsapp || (data.reply && /https?:\/\/wa\.me\//.test(data.reply)))) {
        appendWAButton(node);
      }
    } catch (e){
      console.error('❌ Error en sendButton:', e);
      removeTyping();
      addMsg('😕 Error: ' + (e.message || 'Problema de conexión'), 'bot');
      // ✅ NO REINTENTAR AUTOMÁTICAMENTE - Esperar acción del usuario
    }
  }

  // ========================================================
  // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #3
  // ========================================================
  // ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
  // 📅 Última validación: 25/11/2025
  // ✅ Estado: FUNCIONAL Y TESTEADO
  //
  // 🚨 ANTES DE MODIFICAR:
  //    1. Consultar con el equipo
  //    2. Verificar que CSRF_TOKEN se envía en payload
  //    3. NO eliminar csrfToken del body (causaría 403)
  //    4. Validar retry logic si es necesario
  //
  // 📋 Funcionalidad protegida:
  //    - Envío de mensajes de texto con CSRF token
  //    - Validación de input no vacío
  //    - Parsing de respuestas con botones
  //    - Rendering de botones subsecuentes
  //    - Detección de WhatsApp links
  //
  // 🔗 Dependencias:
  //    - Backend: validateCSRF valida csrfToken
  //    - Backend: ASK_NAME procesa nombres como texto
  //    - Variables globales: SESSION_ID, CSRF_TOKEN
  //    - normalizeButtons(): Parsea botones de respuesta
  //
  // ========================================================
  // ====== Envío de texto tradicional ======
  async function sendMsg(txt){
    const t = (txt || '').trim();
    if (!t) return;
    input && (input.value = '');
    addMsg(t, 'user');
    addTyping();
    try{
      const r = await fetch(API_CHAT, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ text: t, sessionId: SESSION_ID, csrfToken: CSRF_TOKEN })
      });
      const data = await r.json().catch(()=> ({}));
      removeTyping();
      const node = addMsg(data?.reply || '🤖', 'bot');

      // renderizar botones si vienen en la respuesta
      // Priorizar data.buttons (tiene description/example) antes que data.options
      const btns = normalizeButtons(data?.buttons || data?.ui || data?.options);
      if (btns.length) renderButtons(node, btns);

      if (data && (data.allowWhatsapp || (data.reply && /https?:\/\/wa\.me\//.test(data.reply)))) {
        appendWAButton(node);
      }
    }catch(e){
      removeTyping();
      addMsg('😕 Hubo un problema de red. Reintentamos en 3 segundos…', 'bot');
      setTimeout(()=> sendMsg(t), 3000);
    }
  }

  // ====== Reset y Greeting ======
  async function resetChat(){
    try{
      await fetch(API_RESET, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sid: SESSION_ID }) });
    }catch{}
    msgs.innerHTML = '';
    greeted = false;
  }

  let greeted = false;
  // ========================================================
  // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #4
  // ========================================================
  // ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
  // 📅 Última validación: 25/11/2025
  // ✅ Estado: FUNCIONAL Y TESTEADO
  //
  // 🚨 ANTES DE MODIFICAR:
  //    1. Consultar con el equipo
  //    2. Verificar almacenamiento de SESSION_ID y CSRF_TOKEN
  //    3. NO eliminar storage de tokens (rompería CSRF)
  //    4. Testear rendering de botones GDPR iniciales
  //
  // 📋 Funcionalidad protegida:
  //    - Llamada a /api/greeting para obtener sessionId + csrfToken
  //    - Almacenamiento de SESSION_ID y CSRF_TOKEN en variables globales
  //    - Rendering de mensaje GDPR inicial
  //    - Rendering de botones Sí/No para consentimiento
  //    - Prevención de múltiples llamadas a greeting
  //
  // 🔗 Dependencias:
  //    - Backend: /api/greeting devuelve sessionId, csrfToken, buttons
  //    - sendButton(): Usa SESSION_ID y CSRF_TOKEN
  //    - sendMsg(): Usa SESSION_ID y CSRF_TOKEN
  //    - Todo el flujo de chat depende de estos tokens
  //
  // ========================================================
  // ========================================================
  // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #4
  // ========================================================
  // ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
  // 📅 Última validación: 25/11/2025
  // ✅ Estado: FUNCIONAL Y TESTEADO
  //
  // 🚨 ANTES DE MODIFICAR:
  //    1. Consultar con el equipo
  //    2. Verificar almacenamiento de SESSION_ID y CSRF_TOKEN
  //    3. NO eliminar storage de tokens (rompería CSRF)
  //    4. Testear rendering de botones GDPR iniciales
  //
  // 📋 Funcionalidad protegida:
  //    - Llamada a /api/greeting para obtener sessionId + csrfToken
  //    - Almacenamiento de SESSION_ID y CSRF_TOKEN en variables globales
  //    - Rendering de mensaje GDPR inicial
  //    - Rendering de botones Sí/No para consentimiento
  //    - Prevención de múltiples llamadas a greeting
  //
  // 🔗 Dependencias:
  //    - Backend: /api/greeting devuelve sessionId, csrfToken, buttons
  //    - sendButton(): Usa SESSION_ID y CSRF_TOKEN
  //    - sendMsg(): Usa SESSION_ID y CSRF_TOKEN
  //    - Todo el flujo de chat depende de estos tokens
  //
  // ========================================================
  async function stiShowChat(){
    if (!box){ alert('No se encontró #sti-chat-box'); return; }
    box.style.setProperty('display','flex','important');
    box.style.zIndex = '2147483647';
    document.body.classList.add('chat-open');
    setTimeout(()=>{ input && input.focus(); }, 0);

    // 👉 nuevo SID y reset backend cada vez que se abre
    SESSION_ID = newSID();
    await resetChat();

    if (!greeted){
      try{
        const r = await fetch(API_GREET, { method:'GET', headers: baseHeaders() });
        const d = await r.json().catch(()=> ({}));
        console.log('🔍 DEBUG: Greeting response:', d);
        
        // ✅ Guardar sessionId y CSRF token de la respuesta
        if (d.sessionId) {
          SESSION_ID = d.sessionId;
          console.log('✅ SessionId guardado:', SESSION_ID.substring(0, 20) + '...');
        }
        if (d.csrfToken) {
          CSRF_TOKEN = d.csrfToken;
          console.log('✅ CSRF Token guardado:', CSRF_TOKEN.substring(0, 20) + '...');
        }
        
        console.log('🔍 DEBUG: Buttons field:', d.buttons);
        const node = addMsg(d?.greeting || d?.reply || '👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?', 'bot');
        // si el backend envía opciones con greeting, muéstralas
        const btns = normalizeButtons(d?.buttons || d?.ui || d?.options);
        console.log('🔍 DEBUG: Normalized buttons:', btns);
        if (btns.length) {
          console.log('✅ Rendering', btns.length, 'buttons');
          renderButtons(node, btns);
        } else {
          console.warn('❌ No buttons to render');
        }
      }catch(err){
        console.error('❌ Error fetching greeting:', err);
        addMsg('👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?', 'bot');
      }
      greeted = true;
    }
  }

  // ========================================================
  // 🔒 CÓDIGO CRÍTICO - BLOQUE PROTEGIDO #5
  // ========================================================
  // ⚠️  ADVERTENCIA: Este bloque está funcionando en producción
  // 📅 Última validación: 25/11/2025
  // ✅ Estado: FUNCIONAL Y TESTEADO
  //
  // 🚨 ANTES DE MODIFICAR:
  //    1. Consultar con el equipo
  //    2. Verificar reset de input y botón Enviar
  //    3. Testear que restaura UI después de rechazo GDPR
  //    4. Validar que onclick se restaura correctamente
  //
  // 📋 Funcionalidad protegida:
  //    - Ocultación del chat widget
  //    - Reset de input (display: '')
  //    - Restauración de botón "Enviar" (texto, color, onclick)
  //    - Limpieza de estado después de rechazo GDPR
  //
  // 🔗 Dependencias:
  //    - sendButton(): Llama a stiHideChat() en rechazo GDPR
  //    - Botón X (closeBtn): Llama a esta función
  //    - stiShowChat(): Reabre chat con estado limpio
  //
  // ========================================================
  function stiHideChat(){
    if (!box) return;
    box.style.setProperty('display','none','important');
    document.body.classList.remove('chat-open');
    
    // ✅ Restablecer UI cuando se cierra
    if (input) input.style.display = '';
    if (send) {
      send.textContent = 'Enviar';
      send.style.backgroundColor = '';
      send.onclick = () => sendMsg(input && input.value);
    }
  }

  // ====== Listeners ======
  headerBtn && headerBtn.addEventListener('click', (e)=>{ e.preventDefault(); stiShowChat(); }, {passive:false});
  heroBtn   && heroBtn  .addEventListener('click', (e)=>{ e.preventDefault(); stiShowChat(); }, {passive:false});
  closeBtn  && closeBtn .addEventListener('click', (e)=>{ e.preventDefault(); stiHideChat(); }, {passive:false});

  send  && send .addEventListener('click', ()=> sendMsg(input && input.value), {passive:true});
  input && input.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      sendMsg(input.value);
    }
  });

  // Hash #asistencia abre chat
  if (location.hash.includes('asistencia')) stiShowChat();
  
  // ====== PWA Installation (DESHABILITADO) ======
  /*
  let deferredPrompt;
  const installBtn = document.getElementById('installAppBtn');
  
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[PWA] beforeinstallprompt disparado');
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
    }
  });
  
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        console.log('[PWA] No hay prompt disponible - mostrando instrucciones');
        
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isAndroid = /Android/.test(navigator.userAgent);
        const isChrome = /Chrome/.test(navigator.userAgent);
        
        let instructions = '';
        if (isIOS) {
          instructions = 'Para instalar en iPhone/iPad:\\n\\n' +
            '1. Toca el botón Compartir (cuadrado con flecha ↑)\\n' +
            '2. Desplázate y selecciona "Agregar a pantalla de inicio"\\n' +
            '3. Confirma tocando "Agregar"\\n\\n' +
            'La app aparecerá en tu pantalla de inicio como cualquier otra aplicación.';
        } else if (isAndroid || isChrome) {
          instructions = 'Para instalar en Android/Chrome:\\n\\n' +
            '1. Toca el menú (⋮) arriba a la derecha\\n' +
            '2. Selecciona "Agregar a pantalla de inicio"\\n' +
            '3. Confirma el nombre y toca "Agregar"\\n\\n' +
            'También puedes tocar el ícono ⊕ en la barra de direcciones.';
        } else {
          instructions = 'Para instalar esta aplicación:\\n\\n' +
            'Desktop:\\n' +
            '• Busca el ícono de instalación (⊕) en la barra de direcciones\\n' +
            '• O usa el menú del navegador → "Instalar aplicación"\\n\\n' +
            'Móvil:\\n' +
            '• Abre el menú del navegador\\n' +
            '• Selecciona "Agregar a pantalla de inicio"';
        }
        
        alert('📱 Instalar ChatSTI como Aplicación\\n\\n' + instructions);
        return;
      }
      
      installBtn.style.display = 'none';
      deferredPrompt.prompt();
      
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] Usuario ${outcome === 'accepted' ? 'aceptó' : 'rechazó'} la instalación`);
      
      if (outcome === 'accepted') {
        console.log('[PWA] App instalada exitosamente');
      } else {
        installBtn.style.display = 'inline-flex';
      }
      
      deferredPrompt = null;
    });
  }
  
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App instalada - ocultando botón');
    if (installBtn) {
      installBtn.style.display = 'none';
    }
    deferredPrompt = null;
  });
  */
});
</script>
  
</body>
</html>
