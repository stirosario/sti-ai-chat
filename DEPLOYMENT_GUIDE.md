# 🚀 DEPLOYMENT GUIDE - SISTEMA DE AUTO-EVOLUCIÓN

## Pre-requisitos

- [x] Node.js 18+ instalado
- [x] Git con permisos de push
- [x] Acceso a servidor de producción
- [x] LOG_TOKEN configurado
- [x] Backups del código actual

---

## PASO 1: Preparación del Entorno

### 1.1 Verificar Branch Actual
```bash
git branch
# Debe mostrar: * refactor/modular-architecture
```

### 1.2 Sincronizar con Remoto
```bash
git fetch origin
git pull origin refactor/modular-architecture
```

### 1.3 Verificar Commits
```bash
git log --oneline -5
# Debe mostrar:
# cbba638 docs: Add executive summary for auto-evolution system
# 95d49a5 feat: Implement safe auto-evolution system (AUTOEVOLUCIÓN SEGURA)
```

---

## PASO 2: Testing en Local

### 2.1 Instalar Dependencias
```bash
npm install
```

### 2.2 Ejecutar Tests
```bash
node test-autoevolution.js
```
**Esperado**: `🎉 TODOS LOS TESTS PASARON`

### 2.3 Verificar Estructura
```bash
# Verificar que existen todos los archivos
ls -la config/
ls -la services/learningService.js
ls -la test-autoevolution.js
```

---

## PASO 3: Configuración de Entorno

### 3.1 Copiar .env.example a .env
```bash
cp .env.example .env
```

### 3.2 Editar .env con Valores Reales
```bash
nano .env
# O usar editor favorito
```

**Configuración Mínima**:
```bash
# Seguridad
LOG_TOKEN=tu_token_secreto_aqui_minimo_64_caracteres

# Feature Flags (inicialmente desactivados)
USE_MODULAR_ARCHITECTURE=false
USE_ORCHESTRATOR=false
AUTO_LEARNING_ENABLED=false

# Auto-Learning Config
MIN_CONVERSATIONS_FOR_ANALYSIS=10
MIN_CONFIDENCE_THRESHOLD=0.7
MAX_SUGGESTIONS_PER_RUN=20
```

### 3.3 Generar LOG_TOKEN Seguro
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copiar el output al .env
```

---

## PASO 4: Deployment a Staging

### 4.1 Hacer Merge a Staging
```bash
# Crear branch staging si no existe
git checkout -b staging

# Merge desde refactor/modular-architecture
git merge refactor/modular-architecture

# Push a remoto
git push origin staging
```

### 4.2 Deploy en Servidor Staging
```bash
# SSH al servidor staging
ssh user@staging-server

# Ir al directorio del proyecto
cd /path/to/sti-ai-chat

# Pull cambios
git fetch origin
git checkout staging
git pull origin staging

# Instalar dependencias
npm install

# Reiniciar servidor
pm2 restart sti-chat-staging
# O usar tu proceso manager
```

### 4.3 Verificar Deployment
```bash
# Verificar logs
pm2 logs sti-chat-staging --lines 50

# Verificar que cargó correctamente
curl http://staging-server:3000/api/health
```

---

## PASO 5: Testing en Staging

### 5.1 Test de Configs
```bash
curl "http://staging-server:3000/api/learning/config?token=YOUR_LOG_TOKEN"
```
**Esperado**: JSON con configuración

### 5.2 Acumular Conversaciones
```bash
# Esperar al menos 1 semana para acumular 10+ conversaciones reales
# O copiar transcripciones de producción:
scp user@prod:/path/transcripts/*.json ./transcripts/
```

### 5.3 Primer Análisis (Safe)
```bash
curl "http://staging-server:3000/api/learning/report?token=YOUR_LOG_TOKEN"
```
**Esperado**: Reporte con sugerencias

### 5.4 Test de Aplicación (Dry-Run)
```bash
# Guardar sugerencias del paso anterior
curl "http://staging-server:3000/api/learning/report?token=TOKEN" > suggestions.json

# Aplicar en modo dry-run
curl -X POST "http://staging-server:3000/api/learning/apply?token=TOKEN" \
  -H "Content-Type: application/json" \
  -d @suggestions.json
```

---

## PASO 6: Habilitar Auto-Learning (Gradual)

### 6.1 Habilitar en Staging
```bash
# Editar .env en staging
nano .env
# Cambiar: AUTO_LEARNING_ENABLED=true

# Reiniciar
pm2 restart sti-chat-staging
```

### 6.2 Monitorear por 1 Semana
```bash
# Revisar logs diariamente
tail -f logs/learning.log

# Verificar que no hay errores
grep "ERROR" logs/learning.log
```

### 6.3 Validar Mejoras
```bash
# Revisar config files modificados
git diff config/nlp-tuning.json
git diff config/device-detection.json

# Verificar backups
ls -la config/*.bak
```

---

## PASO 7: Deployment a Producción

### ⚠️ IMPORTANTE: Solo después de 1 semana sin errores en staging

### 7.1 Crear Tag de Versión
```bash
git checkout refactor/modular-architecture
git tag -a v2.0.0-autoevolution -m "Auto-evolution system release"
git push origin v2.0.0-autoevolution
```

### 7.2 Merge a Main/Master
```bash
git checkout main  # o master
git merge refactor/modular-architecture

# Resolver conflictos si existen
git push origin main
```

### 7.3 Deploy en Producción
```bash
# SSH al servidor producción
ssh user@prod-server

# BACKUP COMPLETO PRIMERO
tar -czf backup-$(date +%Y%m%d).tar.gz /path/to/sti-ai-chat

# Pull cambios
cd /path/to/sti-ai-chat
git fetch origin
git checkout main
git pull origin main

# Instalar dependencias
npm install

# Copiar .env de staging (validado)
cp .env.staging .env

# IMPORTANTE: Inicialmente AUTO_LEARNING_ENABLED=false
nano .env
# Verificar: AUTO_LEARNING_ENABLED=false

# Reiniciar con zero-downtime
pm2 reload sti-chat-prod
```

### 7.4 Verificar Producción
```bash
# Verificar logs
pm2 logs sti-chat-prod --lines 100

# Test de health
curl http://prod-server/api/health

# Test de configs (cargaron correctamente)
curl "http://prod-server/api/learning/config?token=TOKEN"
```

---

## PASO 8: Activación Gradual en Producción

### Fase 1: Análisis Pasivo (2 semanas)
```bash
# .env: AUTO_LEARNING_ENABLED=false
# Ejecutar análisis manual semanal
curl "http://prod/api/learning/report?token=TOKEN" | jq . > report-week1.json
```

### Fase 2: Aplicación Manual (2 semanas)
```bash
# .env: AUTO_LEARNING_ENABLED=true
# Pero aplicar cambios manualmente después de revisar
curl -X POST "http://prod/api/learning/apply?token=TOKEN" -d @suggestions.json
```

### Fase 3: Auto-Learning Completo (ongoing)
```bash
# Configurar cron job para análisis semanal
crontab -e

# Agregar:
0 2 * * 0 curl "http://localhost:3000/api/learning/report?token=TOKEN" >> /path/logs/weekly-report.log
```

---

## PASO 9: Monitoreo Continuo

### 9.1 Configurar Alertas
```bash
# Script de monitoreo simple
cat > monitor-learning.sh << 'EOF'
#!/bin/bash
ERRORS=$(grep "ERROR" /path/logs/learning.log | wc -l)
if [ $ERRORS -gt 0 ]; then
  echo "⚠️ $ERRORS errores en learning.log" | mail -s "Learning Alert" admin@example.com
fi
EOF

chmod +x monitor-learning.sh

# Cron cada hora
0 * * * * /path/monitor-learning.sh
```

### 9.2 Dashboard de Métricas
```bash
# Ver estadísticas semanales
curl "http://prod/api/learning/report?token=TOKEN" | jq '.stats'
```

### 9.3 Backups Automáticos
```bash
# Cron diario para backup de configs
0 3 * * * tar -czf /backups/config-$(date +\%Y\%m\%d).tar.gz /path/config/
```

---

## PASO 10: Rollback (Si es Necesario)

### Rollback Completo
```bash
# Restaurar desde backup
cd /path/to/sti-ai-chat
tar -xzf /backups/backup-YYYYMMDD.tar.gz

# Checkout a versión anterior
git checkout v1.9.0  # versión anterior estable

# Reinstalar dependencias
npm install

# Reiniciar
pm2 restart sti-chat-prod
```

### Rollback de Configs Únicamente
```bash
# Restaurar desde .bak
cd config/
cp nlp-tuning.json.bak nlp-tuning.json
cp device-detection.json.bak device-detection.json
cp phrases-training.json.bak phrases-training.json

# Recargar configs sin reiniciar servidor
# (si implementaste hot-reload)
curl -X POST "http://localhost:3000/api/orchestrator/reload?token=TOKEN"
```

---

## CHECKLIST DE DEPLOYMENT

### Pre-Deploy ✅
- [ ] Tests locales pasando (5/5)
- [ ] .env configurado correctamente
- [ ] LOG_TOKEN generado (64+ chars)
- [ ] Backup completo realizado
- [ ] Branch sincronizado con remoto

### Deploy Staging ✅
- [ ] Merge a staging exitoso
- [ ] Servidor staging reiniciado
- [ ] Logs sin errores
- [ ] Endpoints respondiendo
- [ ] Configs cargadas correctamente

### Testing Staging ✅
- [ ] 10+ conversaciones acumuladas
- [ ] Análisis ejecutado correctamente
- [ ] Sugerencias generadas (confidence >= 0.7)
- [ ] Dry-run aplicado sin errores
- [ ] 1 semana de monitoreo sin problemas

### Deploy Producción ✅
- [ ] Tag de versión creado
- [ ] Merge a main exitoso
- [ ] Backup de producción realizado
- [ ] Deployment con zero-downtime
- [ ] Logs sin errores
- [ ] AUTO_LEARNING_ENABLED=false (inicialmente)

### Post-Deploy ✅
- [ ] Análisis manual semanal (2 semanas)
- [ ] Aplicación manual (2 semanas)
- [ ] Monitoreo continuo configurado
- [ ] Backups automáticos activos
- [ ] Alertas configuradas
- [ ] Documentación actualizada

---

## CONTACTOS DE SOPORTE

### Desarrollo
- Lucas (Developer)
- Email: lucas@stia.com.ar

### Infraestructura
- Hosting: Ferozo
- Soporte: soporte@ferozo.com

### Logs y Monitoreo
- Server logs: `/var/log/sti-chat/`
- Learning logs: `logs/learning.log`
- PM2 logs: `pm2 logs sti-chat-prod`

---

## RECURSOS ADICIONALES

### Documentación
- [AUTOEVOLUCION_IMPLEMENTATION.md](./AUTOEVOLUCION_IMPLEMENTATION.md) - Guía completa
- [RESUMEN_AUTOEVOLUCION.md](./RESUMEN_AUTOEVOLUCION.md) - Resumen ejecutivo
- [test-autoevolution.js](./test-autoevolution.js) - Tests automatizados

### Comandos Útiles
```bash
# Ver estado del sistema
pm2 status

# Logs en vivo
pm2 logs sti-chat-prod --lines 100

# Reinicio con zero-downtime
pm2 reload sti-chat-prod

# Verificar uso de recursos
pm2 monit

# Análisis de learning
curl "http://localhost:3000/api/learning/report?token=$LOG_TOKEN" | jq .
```

---

## TROUBLESHOOTING

### Error: "AUTO_LEARNING is disabled"
**Solución**: Editar `.env` → `AUTO_LEARNING_ENABLED=true`

### Error: "Not enough data"
**Solución**: Esperar a acumular 10+ conversaciones en `/transcripts`

### Error: "Module not found"
**Solución**: Ejecutar `npm install`

### Error: "Permission denied"
**Solución**: Verificar permisos en `/config` y `/logs`

### Logs no se generan
**Solución**: Crear directorios manualmente
```bash
mkdir -p logs transcripts config
chmod 755 logs transcripts config
```

---

**🎉 Deployment Completado!**

Seguí los pasos en orden y verificá cada checklist antes de avanzar.

**Próximo paso**: Monitorear staging por 1 semana antes de producción.

---

*Última actualización: 2025-12-05*  
*Versión: v2.0.0-autoevolution*
