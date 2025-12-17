/**
 * problemPatterns.js
 * Sistema de reconocimiento de 1000 expresiones de problemas informáticos
 * Todas estas expresiones deben activar directamente el flujo de diagnóstico
 * sin mensajes genéricos de aclaración
 */

// Expresiones organizadas por categoría para mejor mantenimiento
export const PROBLEM_PATTERNS = {
  // TECLADO (50)
  keyboard: [
    'no me anda el teclado', 'no funsiona el teclaod', 'teclado no responde', 'no escribe nada',
    'teclado congelado', 'teclado duplicando', 'teclas no funcionan', 'algunas teclas muertas',
    'ninguna tecla anda', 'teclado interno no anda', 'teclado notebook roto', 'teclado desconfigurado',
    'teclado cambió idioma', 'teclado escribe solo', 'teclado mete doble', 'teclado no detectado',
    'pc no detecta teclado', 'teclado mojado', 'derrame en teclado', 'teclado bloqueado',
    'desbloquear teclado', 'teclado sin respuesta', 'teclado con delay', 'teclado lag',
    'teclado intermitente', 'teclado se cuelga', 'teclado se traba', 'teclado apagado',
    'teclado no vuelve a andar', 'tecla enter no anda', 'shift no anda', 'ctrl no anda',
    'backspace no funciona', 'teclado borrando solo', 'teclado marcando mal', 'teclado mete simbolos',
    'teclado errático', 'teclado loco', 'teclado muerto', 'teclado dejó de andar',
    'teclado roto después de golpe', 'teclado cambió solo', 'teclado escribe mal', 'teclado duplicado',
    'teclado no habilitado', 'tecla pegada', 'tecla no vuelve', 'teclado hundido',
    'teclado quedó duro', 'teclado inutilizable'
  ],

  // MOUSE / TOUCHPAD (40)
  mouse: [
    'mouse no anda', 'mouse no funciona', 'mouse no detectado', 'mouse se traba',
    'mouse congelado', 'mouse no clickea', 'click izquierdo muerto', 'click derecho muerto',
    'scroll no funciona', 'mouse se mueve solo', 'mouse lento', 'mouse salta',
    'mouse errático', 'puntero desaparecido', 'puntero congelado', 'touchpad no anda',
    'touchpad deshabilitado', 'click del pad no anda', 'pad mojado', 'pad loco',
    'receptor de mouse roto', 'mouse inalámbrico sin señal', 'mouse usb muerto', 'mouse no prende',
    'mouse desconectado', 'sensor no responde', 'mouse fantasma', 'puntero impredecible',
    'doble click involuntario', 'mouse lag', 'mouse glitch', 'mouse no aparece',
    'pad sin sensibilidad', 'pad dispara clicks solo', 'mouse se desconecta', 'mouse inestable',
    'mouse petea', 'mouse vibra', 'mouse sin precisión', 'mouse imposible de usar'
  ],

  // INTERNET / WIFI (60)
  internet: [
    'no tengo internet', 'internet lento', 'se corta internet', 'wifi no funciona',
    'wifi no conecta', 'wifi desaparece', 'wifi intermitente', 'error dns',
    'dns no responde', 'páginas no cargan', 'navegación imposible', 'conectado sin internet',
    'velocidad 0', 'ping alto', 'lag en juegos', 'wifi no toma clave',
    'clave wifi incorrecta', 'wifi olvidado', 'red limitada', 'acceso restringido',
    'router caído', 'modem apagado', 'modem sin señal', 'router quemado',
    'interferencia wifi', 'saturación wifi', 'canales saturados', 'señal baja',
    'pérdida de paquetes', 'no abre google', 'no abre youtube', 'navegador sin internet',
    'error 404', 'error 502', 'error 503', 'wifi no detecta redes',
    'notebook no ve wifi', 'pc no reconoce wifi', 'adaptador wifi muerto', 'wifi desactivado',
    'no puedo conectarme', 'ip duplicada', 'conflicto de ip', 'dhcp no asigna ip',
    'dhcp caído', 'firewall bloquea internet', 'router reiniciando solo', 'modem reiniciando',
    'pppoe desconectado', 'pppoe sin autenticación', 'internet se va a la noche', 'wifi solo en una habitacion',
    'internet recortado', 'microcortes constantes', 'bajada inexistente', 'subida inexistente',
    'jitter alto', 'internet inestable', 'internet imposible', 'señal nula'
  ],

  // IMPRESORAS (50)
  printer: [
    'no imprime', 'impresora no responde', 'papel atascado', 'papel trabado',
    'atasco de papel', 'impresora offline', 'impresora desconectada', 'impresora imprime en blanco',
    'impresora borrosa', 'rayas en la impresión', 'impresora tira manchas', 'impresora no toma papel',
    'impresora toma varias hojas', 'cartucho vacío', 'cartucho tapado', 'cartucho no reconocido',
    'impresora no detecta tinta', 'impresora wifi no conecta', 'impresora se apaga sola', 'impresora lenta',
    'driver impresora fallado', 'no puedo instalar impresora', 'no puedo agregar impresora', 'impresora desaparece',
    'cola de impresión trabada', 'trabajos no se eliminan', 'impresora hace ruido raro', 'impresora imprime mal colores',
    'impresora sin color', 'impresora sin negro', 'toner agotado', 'toner derramado',
    'drum agotado', 'fusor dañado', 'impresora caliente', 'impresora error general',
    'impresora no finaliza trabajo', 'impresora imprime media hoja', 'impresora queda en "procesando"', 'impresora fuera de servicio',
    'cabezal tapado', 'alineación fallada', 'calidad pésima', 'error 0x00000 impresora',
    'impresora muerta', 'impresora wifi desconectada', 'impresora usb no detectada', 'impresora sin comunicación',
    'impresora rechaza cartucho', 'impresora imposible de usar'
  ],

  // WINDOWS / SISTEMA OPERATIVO (100)
  windows: [
    'la pc no prende', 'pc no arranca', 'pantalla negra', 'pantalla azul',
    'pantallazo azul', 'windows no inicia', 'windows no arranca', 'actualización fallida',
    'windows se congela', 'windows se tilda', 'windows no responde', 'windows lento',
    'windows muy lento', 'servicios no inician', 'windows no apaga', 'windows reinicia solo',
    'windows queda en logo', 'windows queda cargando', 'windows no reconoce usuario', 'usuario bloqueado',
    'contraseña incorrecta', 'olvidé contraseña', 'windows dañado', 'falta archivo del sistema',
    'corrupción de sistema', 'sfc no repara', 'reparación automática fallida', 'windows dice "recuperando"',
    'windows entrando en bucle', 'windows no permite abrir apps', 'windows sin audio', 'windows sin video',
    'pantalla parpadea', 'inicio lento', 'menú inicio roto', 'barra de tareas rota',
    'explorador de windows cae', 'explorador reinicia solo', 'windows crash constante', 'drivers faltantes',
    'drivers corruptos', 'drivers dañados', 'windows no detecta hardware', 'no arranca despues de apagón',
    'error de arranque', 'bootmgr missing', 'ntldr missing', 'sistema incorrecto',
    'disco no encontrado', 'no reconoce ssd', 'windows no entra al escritorio', 'actualizando eternamente',
    'rollback eterno', 'modo seguro trabado', 'no sale de modo seguro', 'reparación fallida',
    'kernel panic', 'black screen of death', 'windows en bucle de reparación', 'windows quedó inutilizable',
    'cuenta microsoft no entra', 'tienda windows no abre', 'windows update no funciona', 'updates atascadas',
    'windows no instala nada', 'configuración rota', 'permisos rotos', 'perfil temporal',
    'usuario temporal', 'windows perdió archivos', 'restauración falló', 'backup falló',
    'arranque dual roto', 'arranque uefi roto', 'secure boot error', 'bitlocker pide clave',
    'bitlocker no arranca', 'cifrado dañado', 'windows sin servicios esenciales', 'windows no arranca por driver',
    'windows se apaga al arrancar', 'windows sin red', 'windows sin wifi', 'windows sin ethernet',
    'servicio dhcp roto', 'windows firewall bloqueado', 'librería faltante', 'dll missing',
    'dll corrupta', 'instalador no inicia', 'store no responde', 'windows bloqueado',
    'escritorio congelado', 'explorer.exe ausente', 'windows no carga iconos', 'windows sin notificaciones',
    'windows petado', 'windows "se rompió"', 'windows "muerto"', 'windows "imposible de usar"'
  ],

  // HARDWARE GENERAL (100)
  hardware: [
    'pc caliente', 'notebook caliente', 'se recalienta', 'overheating',
    'cooler no gira', 'cooler hace ruido', 'cooler roto', 'ventiladores acelerados',
    'temperatura alta', 'throttling', 'apagado por temperatura', 'pasta térmica seca',
    'gpu no detectada', 'gpu se calienta', 'gpu artefactos', 'artefactos en pantalla',
    'líneas en pantalla', 'puntos en pantalla', 'placa de video caída', 'gpu fallada',
    'memoria ram no detectada', 'ram fallada', 'ram quemada', 'error de memoria',
    'pitidos al arrancar', 'beep codes', 'motherboard fallada', 'mother quemada',
    'chip suelto', 'soldadura fría', 'puerto usb muerto', 'usb no detecta',
    'usb no lee', 'usb intermitente', 'disco duro fallado', 'disco duro roto',
    'sectores dañados', 'hdd clickea', 'hdd hace ruido', 'disco no arranca',
    'ssd no detectado', 'nvme no detectado', 'velocidad nvme baja', 'disco se desconecta',
    'fuente de poder fallada', 'fuente hace ruido', 'fuente no entrega energía', 'fuente quemada',
    'olor a quemado', 'cable suelto', 'conector flojo', 'hdmi no funciona',
    'hdmi sin señal', 'vga sin señal', 'dvi sin señal', 'puerto ethernet muerto',
    'ethernet no conecta', 'placa de red dañada', 'wifi integrado dañado', 'cámara no detectada',
    'micrófono muerto', 'parlantes muertos', 'no carga batería', 'cargador quemado',
    'cargador falso', 'cargador chispea', 'notebook no carga', 'notebook no prende',
    'batería inflada', 'batería rota', 'notebook se apaga al desenchufar', 'flex de pantalla roto',
    'pantalla rota', 'pantalla rayada', 'pantalla negra con luz', 'retroiluminación rota',
    'pantalla flickering', 'panel quebrado', 'charcos de luz', 'ghosting',
    'coil whine', 'motherboard sin corriente', 'mother no bootea', 'mother sin post',
    'cpu no detectada', 'cpu caliente', 'cpu throttle', 'temp cpu anormal',
    'disipador suelto', 'ventilador bloqueado', 'polvo excesivo', 'pc no da imagen',
    'monitor no enciende', 'rom damaged', 'bios corrupta', 'bios no entra',
    'bios sin opciones', 'bios reinicia sola', 'jumpers mal puestos', 'cables sata mal conectados'
  ],

  // SOFTWARE / PROGRAMAS / APPS (80)
  software: [
    'programa no abre', 'programa congelado', 'app se cierra', 'app no inicia',
    'app en loop', 'app no carga datos', 'app no muestra nada', 'app sin respuesta',
    'app lenta', 'app queda en loading', 'programas no funcionan', 'error al abrir programa',
    'error al instalar', 'error al desinstalar', 'instalador fallado', 'incompatibilidad',
    'no puedo abrir pdf', 'no puedo abrir fotos', 'editor no abre', 'chrome no abre',
    'chrome se cierra', 'firefox no funciona', 'edge no funciona', 'navegador queda blanco',
    'extensiones fallan', 'office no funciona', 'word no abre', 'excel no abre',
    'outlook no sincroniza', 'outlook no abre', 'outlook no recibe', 'correos no llegan',
    'correos no salen', 'cliente de correo roto', 'thunderbird no funciona', 'zoom no abre',
    'zoom sin audio', 'zoom sin video', 'teams no abre', 'teams no conecta',
    'discord no abre', 'steam no inicia', 'steam no descarga', 'juegos no arrancan',
    'launcher roto', 'epic no carga', 'battle.net no carga', 'antivirus bloquea todo',
    'antivirus no se abre', 'antivirus corrupto', 'antivirus caducado', 'firewall bloquea app',
    'app sin permisos', 'carpeta bloqueada', 'archivos corruptos', 'dll faltante',
    'dll corrupta', 'runtime faltante', 'instalación incompleta', 'app no reconoce dispositivo',
    'app no guarda archivos', 'app no exporta', 'app sin red', 'servidor de app caído',
    'error de licencia', 'licencia no válida', 'licencia expirada', 'app bloqueada',
    'app congelada', 'base de datos corrupta', 'conexión a base rota', 'backup fallado',
    'restauración fallida', 'app instaló malware', 'app sospechosa', 'app clonada',
    'app modificada', 'app incompatible con windows', 'plugin fallado', 'plugin no carga'
  ],

  // RED / EMPRESARIAL / SERVIDORES (100)
  network: [
    'no accedo al servidor', 'servidor no responde', 'servidor caído', 'servidor lento',
    'servidor sin recursos', 'time-out servidor', 'carpeta compartida no abre', 'carpeta compartida desapareció',
    'permisos denegados', 'credenciales incorrectas', 'usuario bloqueado', 'no reconoce dominio',
    'equipo fuera del dominio', 'dominio no responde', 'controlador de dominio caído', 'mapeo de red fallido',
    'unidad de red desconectada', 'unidad z no aparece', 'vpn no conecta', 'vpn desconectada',
    'vpn sin autenticación', 'vpn lenta', 'firewall empresarial bloquea', 'proxy no funciona',
    'proxy bloquea navegación', 'impresora de red no imprime', 'impresora de red no aparece', 'switch caído',
    'switch sin energía', 'router empresarial apagado', 'dhcp empresarial caído', 'dns interno no responde',
    'sharepoint no abre', 'sharepoint caído', 'onedrive no sincroniza', 'drive empresarial no carga',
    'servidor de archivos lleno', 'servidor sin espacio', 'servidor con disco fallado', 'raid degradado',
    'raid offline', 'raid fallado', 'storage lleno', 'storage fallado',
    'servidor correo caído', 'smtp no responde', 'imap fallado', 'pop3 no responde',
    'exchange caído', 'exchange sin espacio', 'exchange sin buzones', 'error autenticacion ad',
    'kerberos fallado', 'ntlm fallado', 'sysvol corrupto', 'replicación fallida',
    'dfs roto', 'vpn site-to-site caída', 'túnel ipsec caído', 'vlan incorrecta',
    'vlan no asignada', 'ip duplicada en red', 'conflicto dhcp', 'saturación de red',
    'latencia interna alta', 'jitter interno', 'pérdida de paquetes lan', 'caídas aleatorias lan',
    'firewall saturado', 'licencias rdp agotadas', 'rdp no conecta', 'rdp desconectado',
    'escritorio remoto lento', 'ts farm caída', 'broker desconectado', 'gpo no aplica',
    'gpo rota', 'políticas corruptas', 'login lento en dominio', 'roaming profile corrupto'
  ],

  // CIBERSEGURIDAD / MALWARE / ATAQUES (60)
  security: [
    'sospecho virus', 'virus confirmado', 'pc infectada', 'malware detectado',
    'ransomware activo', 'archivos cifrados', 'archivos desaparecidos', 'virus borró archivos',
    'browser secuestrado', 'publicidad rara', 'ventanas emergentes', 'popups constantes',
    'redirige a páginas raras', 'troyano detectado', 'gusano activo', 'spyware activo',
    'keylogger sospechoso', 'phishing recibido', 'email sospechoso', 'contraseña filtrada',
    'credenciales comprometidas', 'cuenta hackeada', 'acceso no autorizado', 'actividad sospechosa',
    'sesión secuestrada', 'logs alterados', 'firewall deshabilitado sin permiso', 'antivirus desactivado solo',
    'antivirus no arranca', 'antivirus bloqueado', 'rootkit sospechoso', 'extensiones maliciosas',
    'app no confiable', 'comportamiento raro', 'cpu al 100%', 'disco al 100%',
    'red al 100%', 'procesos extraños', 'procesos ocultos', 'infección masiva'
  ],

  // AVANZADO / TÉCNICO / DEVOPS / INFRA (140)
  advanced: [
    'docker no inicia', 'contenedor caído', 'contenedor reinicia solo', 'contenedor no construye',
    'imagen corrupta', 'volumen no montado', 'volumen no persiste', 'kubernetes pod crashloop',
    'pod no crea', 'pod no responde', 'deployment fallido', 'rollout fallido',
    'k8s sin nodos', 'nodo no responde', 'cluster degradado', 'cluster sin quorum',
    'etcd caído', 'microservicio no responde', 'api no responde', 'endpoint 500',
    'endpoint 404', 'nginx fallado', 'nginx no arranca', 'apache no inicia',
    'apache saturado', 'load balancer caído', 'lb sin salud', 'healthcheck fallado',
    'ssl vencido', 'ssl inválido', 'ssl mal configurado', 'cert no cargado',
    'cert no encontrado', 'redis no conecta', 'redis offline', 'redis timeout',
    'redis sin memoria', 'redis persistencia fallida', 'postgres no inicia', 'postgres sin permisos',
    'postgres sin conexión', 'tabla corrupta', 'índice corrupto', 'timeout sql',
    'mysql no arranca', 'mysql sin motor', 'oracle no conecta', 'sqlserver timeout',
    'latencia bd alta', 'deadlocks', 'bloqueo de tabla', 'limpieza fallida',
    'backup corrupto', 'restore fallido', 'snapshot corrupto', 'vm no inicia',
    'vm sin recursos', 'vm corrupta', 'hypervisor caído', 'esxi no arranca',
    'vcenter muerto', 'vcenter no gestiona', 'error ha', 'failover falló',
    'storage mapping caído', 'san sin conexión', 'iscsi caído', 'nfs caído',
    'nfs sin permisos', 'samba sin conexión', 'túnel vpn empresarial roto', 'ipsec fallado',
    'gre tunel caído', 'bgp reiniciando', 'bgp caído', 'ospf sin rutas',
    'routing table rota', 'dhcp failover caído', 'dns autoritativo sin respuesta', 'dns interno corrupto',
    'proxy inverso no carga', 'waf bloqueando mal', 'waf sin reglas', 'firewall no aplica reglas',
    'firewall saturado', 'logs corruptos', 'syslog caído', 'monitoreo caído',
    'prometheus no scrapea', 'grafana sin dashboards', 'alerting caído', 'jaeger no traza',
    'elasticsearch caído', 'elasticsearch sin shards', 'elasticsearch red degradada', 'kibana no inicia',
    'logstash no procesa', 'beats sin enviar', 'colas kafkas saturadas', 'kafka sin brokers',
    'kafka sin particiones', 'zookeeper caído', 'microcorte eléctrico', 'ups agotada',
    'failover eléctrico no funcionó', 'cable troncal cortado', 'vlan trunk caída', 'spanning tree loop',
    'loop detectado', 'broadcast storm', 'paquete gigante bloqueado', 'mtu mismatch',
    'pppoe sin autenticación', 'balanceador dns roto', 'cluster redis split brain', 'cluster mongo sin primario',
    'replicación mongo caída', 'shard mongo sin nodos', 'storage cuenta llena', 'cuotas excedidas',
    'backup incremental fallado', 'backup full fallado', 'restore parcial corrupto', 'sistema de colas caído',
    'rabbitmq sin nodos', 'rabbitmq sin cola', 'aws instancia no arranca', 'aws almacenamiento lleno',
    'aws bucket no accesible', 'aws credenciales inválidas', 'azure vm no inicia', 'azure storage no responde',
    'azure dns fallado', 'gcp compute detenido', 'gcp permisos rotos', 'ci/cd pipeline fallado',
    'build fallado', 'deploy fallado', 'rollback fallido', 'git no sincroniza',
    'git push falla', 'git pull falla', 'merge conflict', 'repositorio corrupto',
    'repo no clona', 'api gateway caído', 'lambda no ejecuta', 'función serverless falló',
    'cloudflare sin resolver', 'cloudflare challenge infinito', 'cdn caída', 'tiempo de propagación dns eterno',
    'puertos bloqueados', 'puerto abierto indebidamente', 'seguridad mal configurada', 'posture inválido',
    'zero trust fallando', 'auditoría fallida', 'logs sin normalizar', 'pipeline de seguridad caído',
    'api rate limitado', 'tokens expirados', 'oauth falló', 'sso no funciona',
    'ad fs caído', 'políticas de contraseña incorrectas', 'claves expuestas', 'secretos filtrados',
    'archivo env filtrado', 'ficheros sensibles expuestos', 'malware dentro del servidor', 'shell no autorizada',
    'explotación sospechosa', 'intento de intrusión', 'ip maliciosa', 'ddos sospechado',
    'ddos confirmado', 'endpoints saturados', 'cpu servidor al 100%', 'ram servidor al 100%',
    'disco servidor al 100%', 'cluster sin nodos operativos', 'storage no responde', 'contenedor zombie',
    'kernel panic linux', 'journalctl sin logs', 'fstab incorrecto', 'partición llena',
    'partición corrupta', 'systemd no arranca', 'init roto', 'rootfs corrupto',
    'no hay espacio en disco', 'fuga de memoria', 'proceso runaway', 'proceso zombi',
    'network namespace roto', 'cgroup limitado', 'overlayfs corrupto', 'enrutamiento linux roto'
  ],

  // USUARIO COMÚN / FRASES ROTAS / MAL ESCRITAS (200)
  general: [
    'no anda nada', 'se rompió todo', 'compu muerta', 'compu congelada',
    'compu loca', 'algo le pasa', 'anda re mal', 'no funca la compu',
    're tildada', 're colgada', 'lentísima', 'imposible usar',
    'ayuda urgente', 'urgente pc', 'no abre nada', 'se cierra todo',
    'no puedo hacer nada', 'pc rara', 'se apaga sola', 'prende y apaga',
    'no hace nada', 'no responde', 'no funciona más', 'desapareció todo',
    'no carga nada', 'windows raro', 'pantalla loca', 'ruido raro',
    'salió humo', 'suena raro', 'mueve raro', 'lag general',
    'imposible trabajar', 'imposible estudiar', 'no puedo imprimir', 'no puedo entrar a internet',
    'no puedo mandar mails', 'no puedo escribir', 'no anda el sonido', 'no se escucha nada',
    'volumen muerto', 'camara no anda', 'mic no anda', 'no abre programas',
    'iconos desaparecieron', 'escritorio vacío', 'virus seguro', 'malware seguro',
    'infectado', 'hackeado', 'robaron cuenta', 'contraseña cambiada sola',
    'cuenta bloqueada sola', 'navegador abre solo', 'paginas raras', 'sale publicidad',
    'popup raro', 'compu super lenta', 'disco lleno', 'sin espacio',
    'sin permisos', 'permisos rotos', 'archivos corruptos', 'archivos dañados',
    'no puedo guardar', 'no puedo abrir archivos', 'carpt no abre', 'compu no se mueve',
    'pc respirando fuerte', 'sonido monstruoso', 'luz parpadea', 'teclado enloqueció',
    'mouse enloqueció', 'impresora loca', 'wifi volado', 'red loca',
    'me desconecta', 'baja internet', 'sube internet', 'no entra google',
    'no entra nada', 'cortó internet', 'router tildado', 'modem muerto',
    'cargador roto', 'laptop re caliente', 'pantalla gris', 'pantalla rosada',
    'pantalla violeta', 'pantalla partida', 'pantalla invertida', 'pantalla girada',
    'sonido distorsionado', 'audio robotizado', 'audio recortado', 'cámara trabada',
    'cámara invertida', 'mic saturado', 'eco constante', 'ruido eléctrico',
    'interferencia', 'bluetooth muerto', 'bluetooth no conecta', 'no detecta auriculares',
    'auriculares no funcionan', 'parlantes reventados', 'usb quemado', 'usb caliente',
    'usb no lee', 'sd no lee', 'sd corrupta', 'sd no aparece',
    'archivo no abre', 'archivo incompleto', 'archivo da error', 'error inesperado',
    'error raro', 'error jodido', 'error misterioso', 'se tildó todo',
    'trabó todo', 'nada anda', 'nada funciona', 'imposible encender',
    'se apaga al toque', 'queda negro', 'queda azul', 'queda blanco',
    'queda trabada', 'queda cargando', 'queda pensando', 'reinicia cada rato',
    'ventilador explota', 'sonidito raro', 'vibra raro', 'huele raro',
    'olor a quemado', 'cable quemado', 'cable roto', 'cable pelado',
    'carga mal', 'carga lento', 'no carga nada', 'prende sin cargar',
    'falla general', 'falla sin explicación', 'glitch en windows', 'glitch visual',
    'glitch sonoro', 'pantallazo loco', 'luz parpadeando teclado', 'luz parpadeando laptop',
    'luz no prende', 'carga invertida', 'ventiladores al máximo', 'pc explotada',
    'windows rancio', 'windows muerto', 'windows infectado', 'windows inutil',
    'windows no quiere', 'windows rebelde', 'compu rebelde', 'compu traviesa',
    'error sin nombre', 'lo rompí', 'rompí algo', 'borré algo',
    'desapareció algo', 'pc dormida y no despierta', 'modo suspensión trabado', 'hibernación infinita',
    'cargando eterno', 'inicio eterno', 'cierre eterno', 'modo avión no sale',
    'brillo no cambia', 'volumen no cambia', 'iconos gigantes', 'iconos invisibles',
    'puntero gigante', 'puntero invisible', 'fecha incorrecta', 'hora incorrecta',
    'reloj desfasado', 'zona horaria rota', 'pc no deja instalar nada', 'pc bloqueada para instalar',
    'pc pide permiso extraño', 'contraseña pide siempre', 'usuario no existe', 'sesión perdida',
    'sesión caducada', 'pantalla mini', 'pantalla gigante', 'sonido metálico',
    'parlantes soplando', 'click fuerte', 'descarga rara', 'ayuda, algo está muy mal'
  ]
};

/**
 * Normaliza una expresión para comparación (tolera errores ortográficos)
 */
function normalizePattern(pattern) {
  return pattern
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Normalizar espacios
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n');
}

/**
 * Normaliza el texto del usuario para comparación
 */
function normalizeUserText(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n');
}

/**
 * Detecta si el texto del usuario contiene alguna de las 1000 expresiones de problemas
 * Retorna información sobre el problema detectado
 * Tolerante a errores ortográficos, modismos y frases incompletas
 */
export function detectProblemPattern(userText) {
  if (!userText || typeof userText !== 'string') {
    return { detected: false };
  }

  const normalizedText = normalizeUserText(userText);
  
  // Buscar en todas las categorías - ordenar por longitud (más específicos primero)
  const allPatterns = [];
  for (const [category, patterns] of Object.entries(PROBLEM_PATTERNS)) {
    for (const pattern of patterns) {
      allPatterns.push({ category, pattern });
    }
  }
  
  // Ordenar por longitud descendente para priorizar coincidencias más específicas
  allPatterns.sort((a, b) => b.pattern.length - a.pattern.length);
  
  // Buscar coincidencias
  for (const { category, pattern } of allPatterns) {
    const normalizedPattern = normalizePattern(pattern);
    
    // Buscar coincidencia como subcadena (más flexible)
    if (normalizedText.includes(normalizedPattern)) {
      return {
        detected: true,
        category: category,
        pattern: pattern,
        confidence: 0.95, // Alta confianza cuando se detecta un patrón conocido
        summary: `Problema detectado: ${pattern}`,
        keywords: pattern.split(' ').filter(w => w.length > 2)
      };
    }
    
    // También buscar si el patrón contiene el texto del usuario (para frases cortas)
    if (normalizedPattern.includes(normalizedText) && normalizedText.length >= 5) {
      return {
        detected: true,
        category: category,
        pattern: pattern,
        confidence: 0.85,
        summary: `Problema detectado: ${pattern}`,
        keywords: pattern.split(' ').filter(w => w.length > 2)
      };
    }
  }

  // Si no se encontró coincidencia exacta, buscar palabras clave individuales importantes
  const importantKeywords = new Set();
  for (const patterns of Object.values(PROBLEM_PATTERNS)) {
    for (const pattern of patterns) {
      // Extraer palabras clave importantes (más de 3 caracteres, no artículos/preposiciones)
      const words = pattern.split(' ').filter(w => {
        const wLower = w.toLowerCase();
        return w.length > 3 && 
               !['con', 'sin', 'para', 'por', 'que', 'del', 'los', 'las', 'una', 'uno'].includes(wLower);
      });
      words.forEach(word => importantKeywords.add(word));
    }
  }
  
  const foundKeywords = Array.from(importantKeywords).filter(keyword => {
    const normalizedKeyword = normalizePattern(keyword);
    return normalizedText.includes(normalizedKeyword);
  });

  // Si se encuentran múltiples palabras clave relevantes, considerar como problema detectado
  if (foundKeywords.length >= 2) {
    return {
      detected: true,
      category: 'general',
      confidence: 0.75,
      summary: 'Problema informático detectado por palabras clave',
      keywords: foundKeywords.slice(0, 5) // Limitar a 5 keywords más relevantes
    };
  }

  return { detected: false };
}

/**
 * Obtiene todas las expresiones como array plano para búsquedas rápidas
 */
export function getAllProblemPatterns() {
  const allPatterns = [];
  for (const patterns of Object.values(PROBLEM_PATTERNS)) {
    allPatterns.push(...patterns);
  }
  return allPatterns;
}

/**
 * Verifica si un texto contiene alguna expresión de problema (versión rápida)
 */
export function hasProblemPattern(userText) {
  const detection = detectProblemPattern(userText);
  return detection.detected;
}
