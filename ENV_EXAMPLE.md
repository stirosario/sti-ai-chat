# Variables de Entorno - STI AI Chat

Copia este contenido a un archivo `.env` en la raíz del proyecto.

```env
# ========================================================
# STI AI Chat - Variables de Entorno
# ========================================================

# ========== SERVIDOR ==========
# Puerto del servidor (default: 3001)
PORT=3001

# Entorno de ejecución (production, development)
NODE_ENV=production

# ========== OPENAI ==========
# API Key de OpenAI (REQUERIDO para funcionalidad completa)
OPENAI_API_KEY=sk-proj-...

# Modelo para clasificador (default: gpt-4o-mini)
OPENAI_MODEL_CLASSIFIER=gpt-4o-mini

# Modelo para step/diagnóstico (default: gpt-4o-mini)
OPENAI_MODEL_STEP=gpt-4o-mini

# Temperatura para clasificador (0.0-2.0, default: 0.2)
OPENAI_TEMPERATURE_CLASSIFIER=0.2

# Temperatura para step (0.0-2.0, default: 0.3)
OPENAI_TEMPERATURE_STEP=0.3

# Timeout en milisegundos para llamadas a OpenAI (default: 12000)
OPENAI_TIMEOUT_MS=12000

# Máximo de tokens para clasificador (default: 450)
OPENAI_MAX_TOKENS_CLASSIFIER=450

# Máximo de tokens para step (default: 900)
OPENAI_MAX_TOKENS_STEP=900

# ========== CORS ==========
# Orígenes permitidos (separados por coma)
# Default: https://stia.com.ar,http://localhost:3000
ALLOWED_ORIGINS=https://stia.com.ar,http://localhost:3000

# ========== WHATSAPP ==========
# Número de WhatsApp para escalamiento (default: 5493417422422)
WHATSAPP_NUMBER=5493417422422

# URL base pública del servicio (default: https://sti-rosario-ai.onrender.com)
PUBLIC_BASE_URL=https://sti-rosario-ai.onrender.com
```

## Instrucciones

1. Copia el contenido de arriba
2. Crea un archivo `.env` en la raíz del proyecto
3. Pega el contenido y configura los valores según tu entorno
4. **IMPORTANTE:** Nunca subas el archivo `.env` al repositorio (está en `.gitignore`)

