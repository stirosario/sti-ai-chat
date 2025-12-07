#!/bin/bash
# Smoke Tests para STI Chat v7
# Uso: ./scripts/smoke-tests.sh [staging-host]
# Ejemplo: ./scripts/smoke-tests.sh https://staging.example.com

set -e

STAGING_HOST="${1:-http://localhost:3001}"
LOG_TOKEN="${LOG_TOKEN:-}"

echo "🧪 SMOKE TESTS - STI Chat v7"
echo "================================"
echo "Host: $STAGING_HOST"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

# Función helper para tests
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    local expected_status=${5:-200}
    
    echo "📡 Testing: $name"
    echo "   $method $url"
    
    if [ -n "$data" ]; then
        response=$(curl -sS -w "\n%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    else
        response=$(curl -sS -w "\n%{http_code}" -X "$method" "$url" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC}: $name (HTTP $http_code)"
        echo "$body" | head -n 5
        ((PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}: $name (HTTP $http_code, expected $expected_status)"
        echo "$body" | head -n 10
        ((FAILED++))
        return 1
    fi
}

# Test 1: /api/health
echo ""
echo "==========================================="
echo "TEST 1: /api/health"
echo "==========================================="
test_endpoint "Health Check" "GET" "$STAGING_HOST/api/health" "" 200

# Test 2: /api/greeting
echo ""
echo "==========================================="
echo "TEST 2: /api/greeting"
echo "==========================================="
GREETING_RESPONSE=$(curl -sS -X POST "$STAGING_HOST/api/greeting" \
    -H "Content-Type: application/json" \
    -d '{}' 2>&1)
SESSION_ID=$(echo "$GREETING_RESPONSE" | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -n "$SESSION_ID" ]; then
    echo -e "${GREEN}✅ PASS${NC}: /api/greeting (Session ID: $SESSION_ID)"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: /api/greeting (No session ID found)"
    echo "$GREETING_RESPONSE" | head -n 10
    ((FAILED++))
fi

# Test 3: /api/session/validate (si existe)
echo ""
echo "==========================================="
echo "TEST 3: /api/session/validate"
echo "==========================================="
if [ -n "$SESSION_ID" ]; then
    test_endpoint "Session Validate" "POST" "$STAGING_HOST/api/session/validate" \
        "{\"sessionId\":\"$SESSION_ID\"}" 200
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: No session ID available"
fi

# Test 4: /api/chat
echo ""
echo "==========================================="
echo "TEST 4: /api/chat (mínimo flujo)"
echo "==========================================="
if [ -n "$SESSION_ID" ]; then
    START_TIME=$(date +%s%N)
    CHAT_RESPONSE=$(curl -sS -X POST "$STAGING_HOST/api/chat" \
        -H "Content-Type: application/json" \
        -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"hola\"}" 2>&1)
    END_TIME=$(date +%s%N)
    ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    
    if echo "$CHAT_RESPONSE" | grep -q "text\|message\|response"; then
        echo -e "${GREEN}✅ PASS${NC}: /api/chat (${ELAPSED_MS}ms)"
        if [ $ELAPSED_MS -lt 2000 ]; then
            echo -e "${GREEN}   ✅ Response time < 2s${NC}"
        else
            echo -e "${YELLOW}   ⚠️  Response time >= 2s (${ELAPSED_MS}ms)${NC}"
        fi
        echo "$CHAT_RESPONSE" | head -n 5
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: /api/chat (No valid response)"
        echo "$CHAT_RESPONSE" | head -n 10
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: No session ID available"
fi

# Test 5: /api/upload-image (skip si no hay imagen de test)
echo ""
echo "==========================================="
echo "TEST 5: /api/upload-image"
echo "==========================================="
if [ -n "$SESSION_ID" ] && [ -f "tests/fixture.jpg" ]; then
    UPLOAD_RESPONSE=$(curl -sS -X POST "$STAGING_HOST/api/upload-image" \
        -H "x-session-id: $SESSION_ID" \
        -F "image=@tests/fixture.jpg" 2>&1)
    
    if echo "$UPLOAD_RESPONSE" | grep -q "success\|uploaded\|image"; then
        echo -e "${GREEN}✅ PASS${NC}: /api/upload-image"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: /api/upload-image"
        echo "$UPLOAD_RESPONSE" | head -n 10
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: No session ID or test image not found"
fi

# Test 6: /api/whatsapp-ticket
echo ""
echo "==========================================="
echo "TEST 6: /api/whatsapp-ticket"
echo "==========================================="
if [ -n "$SESSION_ID" ]; then
    test_endpoint "WhatsApp Ticket" "POST" "$STAGING_HOST/api/whatsapp-ticket" \
        "{\"sessionId\":\"$SESSION_ID\"}" 200
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: No session ID available"
fi

# Test 7: /api/logs (requiere LOG_TOKEN)
echo ""
echo "==========================================="
echo "TEST 7: /api/logs"
echo "==========================================="
if [ -n "$LOG_TOKEN" ]; then
    LOGS_RESPONSE=$(curl -sS -X GET "$STAGING_HOST/api/logs?token=$LOG_TOKEN" 2>&1)
    
    if echo "$LOGS_RESPONSE" | head -n 1 | grep -q ".*"; then
        echo -e "${GREEN}✅ PASS${NC}: /api/logs (LOG_TOKEN usado)"
        echo "$LOGS_RESPONSE" | head -n 5
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: /api/logs (No response)"
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: LOG_TOKEN not set (set LOG_TOKEN env var)"
fi

# Resumen
echo ""
echo "==========================================="
echo "📊 RESUMEN"
echo "==========================================="
echo -e "${GREEN}✅ Tests pasados: $PASSED${NC}"
echo -e "${RED}❌ Tests fallidos: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ÉXITO: Todos los smoke tests pasaron${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}❌ FALLO: $FAILED test(s) fallaron${NC}"
    exit 1
fi
