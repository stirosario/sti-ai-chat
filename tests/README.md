# STI Chatbot Tests

This directory contains automated tests for the STI Chatbot backend.

## How to Run Tests

1. **Navigate to the `sti-ai-chat` directory:**
   ```bash
   cd C:\sti-ai-chat
   ```

2. **Run individual test suites:**
   ```bash
   # Event Contract tests
   node tests/event-contract.test.js
   
   # Hardening tests (backfill, persist, healthz)
   node tests/hardening.test.js
   
   # Export Parity tests
   node tests/export-parity.test.js
   
   # Syntax Gate test (verifica parseo y corrupción de sintaxis)
   node tests/syntax-gate.test.js
   ```

3. **Run all tests:**
   ```bash
   # Ejecutar todos los tests en secuencia
   node tests/event-contract.test.js && node tests/hardening.test.js && node tests/export-parity.test.js && node tests/syntax-gate.test.js
   ```

## Test Coverage

- **Unit Tests (`event-contract.test.js`)**:
  - `buildEvent()` functionality (message_id generation, parent_message_id handling, event type detection).
  - `buildUiButtonsFromTokens()` output structure.
  - `appendAndPersistConversationEvent()` idempotency (deduplication by message_id).

- **Integration Tests (`event-contract.test.js`)**:
  - Simulated full chat flow to verify `correlation_id` propagation.
  - Verification of `stage_transition` events.
  - Validation of the exported JSON structure (meta, conversation, transcript, events, stats).

- **Hardening Tests (`hardening.test.js`)**:
  - Backfill on-read para data vieja (message_id, timestamp_iso, event_type).
  - Persist error handling (retry, queue, degraded mode).
  - Healthz endpoint (persist queue, metrics).

- **Export Parity Tests (`export-parity.test.js`)**:
  - Export schema version stability.
  - Hash determinístico (mismo contenido = mismo hash).
  - Ordenamiento y deduplicación.
  - UI render model (humano vs debug).

- **Syntax Gate Test (`syntax-gate.test.js`)**:
  - Verifica que `server.js` pase el parseo estricto de Node.js (`node --check`).
  - Detecta corrupción de spread/rest operators (`.meta`, `.extra`, `.(`, `function x(.args)`, `[.session.transcript]`).
  - Si falla, buscar y restaurar:
    - `.meta` → `...meta`
    - `.extra` → `...extra`
    - `.(` → `...(`
    - `function x(.args)` → `function x(...args)`
    - `[.session.transcript]` → `[...session.transcript]`

## Golden File Tests (Future)

A "golden file test" can be added to compare the JSON export of a fixed chat flow against a pre-recorded snapshot. This helps detect unexpected changes in the event contract or data generation.
