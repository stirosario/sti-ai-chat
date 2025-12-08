# PLANILLA_FLUJO_STI → Mapeo a Código

Fuente de verdad: `docs/PLANILLA_FLUJO_STI.csv`

Nota: se realizó una optimización de copy global (más breve y consistente) sin cambios de flujo ni transiciones.

## Estados (resumen)

| ID_ESTADO | Archivo principal | Handlers clave | Estado de sincronización |
| --- | --- | --- | --- |
| ASK_LANGUAGE | `flows/flowDefinition.js` (bloque ASK_LANGUAGE) | onText, onButton | OK (alineado) |
| ASK_NAME | `flows/flowDefinition.js` (bloque ASK_NAME) | onText, onButton | OK (alineado) |
| ASK_NEED | `flows/flowDefinition.js` (bloque ASK_NEED) | onText, onButton | OK (alineado) |
| CLASSIFY_NEED | `flows/flowDefinition.js` (bloque CLASSIFY_NEED) | onText | OK (alineado) |
| ASK_DEVICE | `flows/flowDefinition.js` (bloque ASK_DEVICE) | onText, onButton, onImage | OK (alineado) |
| DETECT_DEVICE | `flows/flowDefinition.js` (bloque DETECT_DEVICE) | onText | OK (alineado) |
| ASK_PROBLEM | `flows/flowDefinition.js` (bloque ASK_PROBLEM) | onText, onImage | OK (alineado) |
| ASK_HOWTO_DETAILS | `flows/flowDefinition.js` (bloque ASK_HOWTO_DETAILS) | onText, onImage | OK (alineado) |
| GENERATE_HOWTO | `flows/flowDefinition.js` (bloque GENERATE_HOWTO) | onText | OK (alineado) |
| BASIC_TESTS | `flows/flowDefinition.js` (bloque BASIC_TESTS) | onText, onButton | OK (alineado) |
| ADVANCED_TESTS | `flows/flowDefinition.js` (bloque ADVANCED_TESTS) | onText, onButton | OK (alineado) |
| ESCALATE | `flows/flowDefinition.js` (bloque ESCALATE) | onText, onButton | OK (alineado) |
| CREATE_TICKET | `flows/flowDefinition.js` (bloque CREATE_TICKET) | onText | OK (alineado) |
| TICKET_SENT | `flows/flowDefinition.js` (bloque TICKET_SENT) | onText | OK (alineado) |
| ENDED | `flows/flowDefinition.js` (bloque ENDED) | onText | OK (alineado) |

## Pendientes de revisión

- Ninguno crítico; revisar en próxima iteración si se necesita refinar CREATE_TICKET para mostrar id de ticket cuando esté disponible desde el orchestrator.
