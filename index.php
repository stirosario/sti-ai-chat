<?php
session_start();                             // iniciar sesión antes de cualquier HTML
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

  <!-- 🎨 CSS PRINCIPAL (diferido) -->
  <link rel="preload" href="css/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="css/style.css"></noscript>

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
    .emoji{display:inline-block;text-shadow:0 0 8px color-mix(in srgb,currentColor 60%,transparent)}
    @media (max-width: 768px){ .ocultar-movil{display:none!important;} }
  </style>

  <!-- 📊 Google Analytics 4 (defer automático) -->
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
          "@type":"ContactPoint",
          "contactType":"customer support",
          "telephone":"+5493417422422",
          "areaServed":"AR",
          "availableLanguage":["es"]
        }],
        "knowsAbout":[
          "reparación de PC","reparación de notebooks","asistencia remota","soporte técnico empresas",
          "mantenimiento preventivo","seguridad informática","optimización de Windows","redes"
        ]
      },
      {
        "@type":"Organization",
        "@id":"https://stia.com.ar/#org",
        "name":"STI - Servicio Técnico Inteligente",
        "url":"https://stia.com.ar/",
        "logo":"https://stia.com.ar/img/logo-sti1.png",
        "sameAs":[
          "https://www.instagram.com/sti.rosario/",
          "https://www.facebook.com/stirosario/"
        ]
      },
      {
        "@type":"WebPage",
        "@id":"https://stia.com.ar/#home",
        "url":"https://stia.com.ar/",
        "name":"Inicio — STI Rosario",
        "isPartOf":{"@id":"https://stia.com.ar/#org"},
        "primaryImageOfPage":{"@type":"ImageObject","url":"https://stia.com.ar/img/og-sti-1200x630.jpg","width":1200,"height":630},
        "inLanguage":"es-AR",
        "about":{"@id":"https://stia.com.ar/#local"},
        "description":"Servicio Técnico Inteligente en Rosario. Reparación de PC y notebooks, asistencia remota y soporte para PyMEs."
      },
      {
        "@type":"WebSite",
        "@id":"https://stia.com.ar/#website",
        "url":"https://stia.com.ar/",
        "name":"STI — Servicio Técnico Inteligente",
        "publisher":{"@id":"https://stia.com.ar/#org"},
        "inLanguage":"es-AR",
        "potentialAction":{
          "@type":"SearchAction",
          "target":"https://stia.com.ar/?s={search_term_string}",
          "query-input":"required name=search_term_string"
        }
      },
      {
        "@type":"BreadcrumbList",
        "itemListElement":[
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
      </nav>
      <!-- Botón azul que abre el chat (FORZADO) -->
      <a href="#"
         id="btn-asistencia-header"
         class="btn-asistencia-header ocultar-movil"
         title="Abrir chat de asistencia 24/7"
         onclick="(function(){
           var b=document.getElementById('sti-chat-box');
           if(!b){ alert('No se encontró #sti-chat-box'); return false; }
           b.style.setProperty('display','flex','important');
           b.style.zIndex='2147483647';
           document.body.classList.add('chat-open');
           setTimeout(function(){ var i=document.getElementById('sti-text'); if(i) i.focus(); },0);
         })(); return false;">
         <img src="img/btn_asistencia.png" alt="Asistencia 24/7" class="btn-asistencia-img" />
      </a>
    </div>
  </header>

  <!-- Hero principal -->
  <section id="hero" itemscope itemtype="https://schema.org/Service">
    <div class="hero-overlay">
      <div class="hero-frame">
        <picture>
          <source type="image/avif"
                  srcset="img/hero-desktop-768-512.avif 768w, img/hero-desktop-1280-853.avif 1280w">
          <source type="image/webp"
                  srcset="img/hero-desktop-768-512.webp 768w, img/hero-desktop-1280-853.webp 1280w">
          <img
            src="img/hero-desktop-1280-853.jpg"
            srcset="img/hero-desktop-768-512.jpg 768w, img/hero-desktop-1280-853.jpg 1280w"
            sizes="(max-width: 768px) 100vw, 1280px"
            alt="Logo STI Servicio Técnico Inteligente Rosario"
            class="hero-art"
            width="1280" height="853"
            loading="eager" fetchpriority="high" decoding="async"
            itemprop="image">
        </picture>

        <h1 itemprop="name">Servicio Técnico Inteligente en Rosario</h1>
        <p itemprop="description">Reparación, mantenimiento y asistencia remota con atención inmediata y garantía.</p>
        <a href="#"
           id="btn-asistencia-hero"
           class="btn-metal btn-hero-m"
           title="Asistencia 24/7"
           onclick="(function(){
             var b=document.getElementById('sti-chat-box');
             if(!b){ alert('No se encontró #sti-chat-box'); return false; }
             b.style.setProperty('display','flex','important');
             b.style.zIndex='2147483647';
             document.body.classList.add('chat-open');
             setTimeout(function(){ var i=document.getElementById('sti-text'); if(i) i.focus(); },0);
           })(); return false;">Asistencia 24/7</a>
      </div>
    </div>
  </section>

  <!-- Franja con texto metálico -->
  <section id="franja-metal">
    <div class="franja-metal-text">SERVICIO TÉCNICO INTELIGENTE</div>
    <div class="franja-subtexto">Soporte rápido, profesional y garantizado</div>
  </section>

  <!-- Servicios (AZUL) -->
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
      <img src="img/urgencias.jpg" alt="Técnico reparando computadora - Urgencias técnicas STI Rosario"
           width="1280" height="420" loading="lazy" decoding="async">
    </span>

    <div class="servicios-grid">
      <a class="servicio" href="/pcynotebook.html">
        <h3><span class="icono emoji">🖥</span> PC y Notebook</h3>
        <p>Reparación, actualización y reemplazo de hardware.</p>
      </a>

      <a class="servicio" href="/mantenimientopreventivo.html">
        <h3><span class="icono emoji">⚙️</span> Mantenimiento Preventivo</h3>
        <p>Limpieza interna, control térmico y optimización general de equipos.</p>
      </a>

      <a class="servicio" href="/asistenciaremota.html">
        <h3><span class="icono emoji">🌐</span> Asistencia Remota</h3>
        <p>Soluciones inmediatas sin moverte de tu casa o empresa.</p>
      </a>

      <a class="servicio" href="/seguridadyrespaldo.html">
        <h3><span class="icono emoji">🔒</span> Seguridad y Respaldo</h3>
        <p>Protección contra virus, copias de seguridad y recuperación de datos.</p>
      </a>

      <a class="servicio" href="/optimizacionderendimiento.html">
        <h3><span class="icono emoji">🧠</span> Optimización de Rendimiento</h3>
        <p>Eliminación de procesos innecesarios y aceleración de Windows.</p>
      </a>

      <a class="servicio" href="/soporteparapymes.html">
        <h3><span class="icono emoji">☁️</span> Soporte para PyMEs</h3>
        <p>Instalación, mantenimiento y monitoreo de redes y servidores.</p>
      </a>
    </div>
  </section>

  <!-- ¿POR QUÉ ELEGIR STI? (VERDE) -->
  <section id="por-que-elegir" class="accent accent-green">
    <h2 class="section-title">¿Por qué elegir STI?</h2>
    <div class="pqe-card accent accent-green">
      <ul class="pqe-list">
        <li>
          <span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg></span>
          <span class="pqe-txt"><strong>Atención inmediata</strong> con soporte técnico ágil, confiable y respuesta garantizada en minutos. Damos soluciones inmediatas.</span>
        </li>
        <li>
          <span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 5.58 2 10c0 2.97 2.11 5.55 5.19 7.03L6 22l5.27-3.2c.23.01.46.02.73.02 5.52 0 10-3.58 10-8s-4.48-8-10-8z"/></svg></span>
          <span class="pqe-txt"><strong>Asistencia directa</strong> por WhatsApp o con nuestro asistente IA los 7 días, con atención personalizada y seguimiento continuo.</span>
        </li>
        <li>
          <span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2zm0 3.84L17.53 20H6.47L12 5.84z"/></svg></span>
          <span class="pqe-txt"><strong>Soluciones inteligentes</strong> para cualquier equipo, aplicando diagnósticos rápidos, seguros y eficientes.</span>
        </li>
        <li>
          <span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M20 8h-3V4H7v4H4v14h16V8zm-5 0H9V6h6v2z"/></svg></span>
          <span class="pqe-txt"><strong>Reparaciones precisas</strong> con optimización avanzada, limpieza completa y calibración profesional.</span>
        </li>
        <li>
          <span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-2 19.8V22h4v-.2A10 10 0 0 0 12 2zm1 16h-2v-2h2v2zm0-4h-2V7h2v7z"/></svg></span>
          <span class="pqe-txt"><strong>Mantenimiento preventivo</strong> que mejora el rendimiento, evita fallas y extiende la vida útil del sistema.</span>
        </li>
        <li>
          <span class="pqe-ico"><svg class="use-current" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4.15L18 8v3c0 4.02-2.8 7.97-6 9.19C8.8 18.97 6 15.02 6 11V8l6-2.85z"/></svg></span>
          <span class="pqe-txt"><strong>Seguridad garantizada</strong> con protección total ante virus, spyware y amenazas digitales permanentes.</span>
        </li>
      </ul>

      <div class="pqe-cta">
        <a class="btn-metal" href="https://wa.me/5493417422422?text=Hola%20STI%2C%20necesito%20un%20presupuesto" target="_blank" rel="noopener noreferrer">
          👋 Pedir presupuesto sin cargo
        </a>
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
      <img src="img/clientes.jpg"
           alt="Empresas y clientes que confían en STI Rosario — Servicio Técnico Inteligente"
           width="1280" height="420" loading="lazy" decoding="async">
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

  <!-- ===== SECCIÓN CONTACTO CON PROTECCIONES ANTI-BOT ===== -->
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

      <!-- Time-trap: se completa al cargar -->
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
  <a href="https://wa.me/5493417422422?text=🔧%20STI%20Servicio%20Técnico%20Inteligente%0A💬%20¡Hola!%20👋%0A🌐%20Ingresé%20desde%20la%20web%0A🧑‍💻%20Mi%20nombre%20es...%20(escribí%20tu%20nombre%20y%20presioná%20enviar%20✉️)" class="whatsapp-float" target="_blank" rel="noopener noreferrer" title="WhatsApp"></a>

  <!-- Botón flotante Presupuesto -->
  <a href="https://wa.me/5493417422422?text=🔧%20STI%20Servicio%20Técnico%20Inteligente%0A💬%20¡Hola!%20👋%0A🌐%20Ingresé%20desde%20la%20web%0A🧑‍💻%20Mi%20nombre%20es...%20(escribí%20tu%20nombre%20y%20presioná%20enviar%20✉️)" class="btn-flotante-presupuesto" target="_blank" rel="noopener noreferrer" title="Presupuesto sin cargo"><span class="simbolo">$</span><span class="simbolo">$</span></a>

  <!-- ========================= -->
  <!--  Scripts utilitarios      -->
  <!-- ========================= -->
  <script>
    function enviarWhatsApp(event){
      event.preventDefault();
      const nombre=document.getElementById('nombre')?.value||'';
      const correo=document.getElementById('correo')?.value||'';
      const mensaje=document.getElementById('mensaje')?.value||'';
      const texto=`Hola STI! Soy ${nombre} (${correo}) y quería consultar: ${mensaje}`;
      const url=`https://wa.me/5493417422422?text=${encodeURIComponent(texto)}`;
      window.open(url,'_blank');
    }
  </script>

  <script>
    // Shuffle clientes (idle)
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
  </script>

  <script>
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

  <!-- === Chat WhatsApp (externo) === -->
  <a id="wa-chat-btn"
     href="https://wa.me/5493417422422?text=🔧%20Hola%20STI%2C%20necesito%20asistencia%20técnica"
     target="_blank" rel="noopener" aria-label="Abrir WhatsApp">
    <img src="img/iconswhatsapp.png" alt="WhatsApp">
  </a>

  <!-- ========================= -->
  <!--  Widget Chat STI (UI)     -->
  <!-- ========================= -->
  <div id="sti-chat-box" role="dialog" aria-label="Chat STI Rosario" style="display:none">
    <div id="sti-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#0ea5e9;color:#fff;font-weight:700">
      STI • Servicio Técnico Inteligente V3.5
      <button id="sti-close" type="button" aria-label="Cerrar" style="background:transparent;border:0;color:#fff;font-size:18px;line-height:1;cursor:pointer">×</button>
    </div>
    <div id="sti-messages" style="flex:1;overflow:auto;padding:10px;background:#fff"></div>
    <div id="sti-input" style="display:flex;gap:8px;padding:10px;background:#f4f6f8;border-top:1px solid #e5e7eb">
      <input id="sti-text" type="text" placeholder="" style="flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:8px">
      <button id="sti-send" type="button" style="padding:10px 14px;border:0;border-radius:8px;background:#0ea5e9;color:#fff;cursor:pointer">Enviar</button>
    </div>
  </div>

  <!-- ========================= -->
  <!--  Script Chat STI (único)  -->
  <!-- ========================= -->
  <script>
  document.addEventListener('DOMContentLoaded', () => {
    // ⚙️ Endpoints
    const API_BASE     = "https://sti-rosario-ai.onrender.com";
    const API_URL      = API_BASE + "/api/chat";
    const API_GREETING = API_BASE + "/api/greeting";
    const API_WSP_TCK  = API_BASE + "/api/whatsapp-ticket";

    // 🔐 Sesión simple
    const SESSION_ID = 'web-' + Math.random().toString(36).slice(2, 10);

    // 🔗 DOM
    const box      = document.getElementById('sti-chat-box');
    const msgs     = document.getElementById('sti-messages');
    const input    = document.getElementById('sti-text');
    const send     = document.getElementById('sti-send');
    const headerBtn= document.getElementById('btn-asistencia-header');
    const heroBtn  = document.getElementById('btn-asistencia-hero');
    const closeBtn = document.getElementById('sti-close');

    // 🧠 Estado
    let greeted = false;

    // ===== Utilidades =====
    function formatAssistant(txt){
      if (!txt) return '';
      return String(txt)
        .replace(/\[\[sti:intent=[^;]+;step=[^\]]+\]\]/gi, '') // oculta markers internos
        .replace(/\\n/g, '\n')
        .replace(/\n/g, '<br>');
    }

    function addMsg(text, who='bot'){
      if (!msgs) return;
      const d = document.createElement('div');
      d.className = 'sti-msg ' + (who === 'user' ? 'sti-user' : 'sti-bot');
      d.innerHTML = (who === 'bot') ? formatAssistant(text) : String(text).replace(/\n/g, '<br>');
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
      return d;
    }

    async function openWhatsAppTicket(){
      try{
        const r = await fetch(`${API_WSP_TCK}?sessionId=${encodeURIComponent(SESSION_ID)}`);
        const data = await r.json();
        const link = data?.link || "https://wa.me/5493417422422";
        window.open(link, "_blank");
      }catch(e){
        window.open("https://wa.me/5493417422422", "_blank");
      }
    }

    function injectWABtn(container){
      if (!container || container.querySelector('.sti-export-wa')) return;
      const b = document.createElement("button");
      b.className = "sti-export-wa";
      b.textContent = "📤 Enviar conversación por WhatsApp";
      b.style.cssText = "margin-top:8px;padding:8px 12px;border:none;border-radius:8px;cursor:pointer;background:#00a884;color:#fff;font-weight:600;";
      b.onclick = openWhatsAppTicket;
      container.appendChild(b);
    }

    async function showChat(){
      if(!box){ alert('No se encontró #sti-chat-box'); return; }
      box.style.setProperty('display','flex','important');
      box.style.zIndex='2147483647';
      document.body.classList.add('chat-open');

      if(!greeted){
        try{
          const r = await fetch(API_GREETING, { method:'GET' });
          const data = await r.json();
          addMsg(data?.greeting || '👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?', 'bot');
        }catch(e){
          addMsg('👋 ¡Hola! Soy Tecnos de STI. ¿Cómo te llamás?', 'bot');
        }
        greeted = true;
      }
      setTimeout(()=>{ input && input.focus(); },0);
    }

    function hideChat(){
      if(!box) return;
      box.style.setProperty('display','none','important');
      document.body.classList.remove('chat-open');
    }

    async function sendMessage(){
      const text = (input?.value || '').trim();
      if (!text) return;
      input.value = '';
      addMsg(text, 'user');

      try{
        const r = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ text, sessionId: SESSION_ID })
        });
        const data  = await r.json();
        const reply = data?.reply || "No pude procesar la consulta.";
        const node  = addMsg(reply, 'bot');

        // Si backend ya decide pasar a WhatsApp, puede incluir link directo:
        if (data?.whatsappLink) {
          const wrap = document.createElement('div');
          injectWABtn(wrap);
          node.appendChild(wrap);
        } else {
          // o siempre ofrecemos botón manual para generar ticket con historial
          const wrap = document.createElement('div');
          injectWABtn(wrap);
          node.appendChild(wrap);
        }
      }catch(e){
        addMsg("Error de conexión. Probá nuevamente.", 'bot');
      }
    }

    // Eventos
    if (closeBtn)  closeBtn.addEventListener('click', hideChat, { passive:true });
    if (headerBtn) headerBtn.addEventListener('click', (e)=>{ e.preventDefault(); showChat(); }, { passive:false });
    if (heroBtn)   heroBtn.addEventListener('click',   (e)=>{ e.preventDefault(); showChat(); }, { passive:false });
    if (send)      send.addEventListener('click', sendMessage, { passive:true });
    if (input)     input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); sendMessage(); }});
  });
  </script>

  <!-- ✅ Datos estructurados: FAQPage (Tecnos) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      { "@type": "Question", "name": "¿Cuánto demora una reparación?", "acceptedAnswer": { "@type": "Answer", "text": "El diagnóstico se realiza en menos de 24 horas y la mayoría de las reparaciones entre 48 y 72 horas. Servicio express disponible." } },
      { "@type": "Question", "name": "¿Ofrecen garantía por las reparaciones?", "acceptedAnswer": { "@type": "Answer", "text": "Sí. Todas las reparaciones cuentan con garantía escrita por mano de obra y repuestos." } },
      { "@type": "Question", "name": "¿Cómo funciona la asistencia remota?", "acceptedAnswer": { "@type": "Answer", "text": "Utilizamos AnyDesk para conectarnos de forma segura y resolver el problema a distancia." } },
      { "@type": "Question", "name": "¿Realizan retiro y entrega a domicilio?", "acceptedAnswer": { "@type": "Answer", "text": "Sí, en Rosario y alrededores, coordinando día y horario." } },
      { "@type": "Question", "name": "¿Tienen atención 24 horas para urgencias?", "acceptedAnswer": { "@type": "Answer", "text": "Sí, Urgencias Técnicas 24/7 por WhatsApp al +54 9 341 742 2422." } }
    ]
  }
  </script>

  <!-- Tracking de clics y UTM -->
  <script>
    (window.requestIdleCallback || function(cb){return setTimeout(cb,1)})(function(){
      function track(eventName, params){ try{ gtag('event', eventNam