#!/usr/bin/env node

/**
 * TEST: BTN_ADVANCED_TESTS button fix in BASIC_TESTS stage
 * 
 * Reproduce the exact bug scenario reported by user:
 * 1. User reports problem: "mi placa de red no funciona"
 * 2. Bot responds with basic diagnostic steps
 * 3. User clicks "Pruebas Avanzadas" button
 * 4. BEFORE FIX: Bot responds "no entendí tu consulta"
 * 5. AFTER FIX: Bot generates advanced tests correctly
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const SESSION_ID = `test-bugfix-${Date.now()}`;

async function post(endpoint, body) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID, ...body })
  });
  return await res.json();
}

function log(step, response) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`STEP ${step}`);
  console.log('='.repeat(70));
  console.log('Reply:', response.reply?.substring(0, 200) + (response.reply?.length > 200 ? '...' : ''));
  console.log('Stage:', response.stage);
  console.log('Buttons:', response.options?.map(o => o.token || o.label).join(', '));
  console.log('OK:', response.ok);
}

async function runTest() {
  console.log('\n🔍 TEST: BTN_ADVANCED_TESTS fix in BASIC_TESTS\n');
  console.log(`Session ID: ${SESSION_ID}`);
  console.log(`API Base: ${API_BASE}\n`);

  try {
    // STEP 1: Start conversation and accept GDPR
    console.log('[1/8] Starting conversation and accepting GDPR...');
    const r1 = await post('/api/chat', { text: 'acepto' });
    log(1, r1);
    
    if (r1.stage !== 'ASK_LANGUAGE') {
      throw new Error(`Expected ASK_LANGUAGE after GDPR, got ${r1.stage}`);
    }

    // STEP 2: Select language
    console.log('[2/8] Selecting language (Español)...');
    const r2 = await post('/api/chat', { text: 'español' });
    log(2, r2);
    if (r2.stage !== 'ASK_NAME') throw new Error(`Expected ASK_NAME, got ${r2.stage}`);

    // STEP 3: Provide name
    console.log('[3/8] Providing name...');
    const r3 = await post('/api/chat', { text: 'Juan Pérez' });
    log(3, r3);
    if (r3.stage !== 'ASK_NEED') throw new Error(`Expected ASK_NEED, got ${r3.stage}`);

    // STEP 4: Report problem type
    console.log('[4/8] Selecting problem type...');
    const r4 = await post('/api/chat', { text: 'BTN_PROBLEMA' });
    log(4, r4);
    if (r4.stage !== 'ASK_DEVICE') throw new Error(`Expected ASK_DEVICE, got ${r4.stage}`);

    // STEP 5: Select device
    console.log('[5/8] Selecting device...');
    const r5 = await post('/api/chat', { text: 'BTN_NOTEBOOK' });
    log(5, r5);
    if (r5.stage !== 'ASK_PROBLEM') throw new Error(`Expected ASK_PROBLEM, got ${r5.stage}`);

    // STEP 6: Describe problem (EXACT user scenario)
    console.log('[6/8] Describing problem: "mi placa de red no funciona"...');
    const r6 = await post('/api/chat', { text: 'mi placa de red no funciona' });
    log(6, r6);
    if (r6.stage !== 'BASIC_TESTS') throw new Error(`Expected BASIC_TESTS, got ${r6.stage}`);
    
    // Verify basic tests were provided
    if (!r6.reply?.includes('pasos') && !r6.reply?.includes('steps')) {
      throw new Error('No diagnostic steps provided in BASIC_TESTS');
    }

    // STEP 7: Click "Pruebas Avanzadas" button (BUG SCENARIO)
    console.log('[7/8] Clicking "Pruebas Avanzadas" button (BTN_ADVANCED_TESTS)...');
    const r7 = await post('/api/chat', { text: 'BTN_ADVANCED_TESTS' });
    log(7, r7);

    // CRITICAL CHECKS:
    console.log('\n' + '='.repeat(70));
    console.log('🔬 VALIDATION');
    console.log('='.repeat(70));

    const checks = [
      {
        name: 'Response OK',
        pass: r7.ok === true,
        actual: r7.ok,
        expected: true
      },
      {
        name: 'Stage transition',
        pass: r7.stage === 'ADVANCED_TESTS',
        actual: r7.stage,
        expected: 'ADVANCED_TESTS'
      },
      {
        name: 'No error message',
        pass: !r7.reply?.includes('no entendí') && !r7.reply?.includes("didn't understand"),
        actual: r7.reply?.substring(0, 100),
        expected: 'Advanced tests or valid response'
      },
      {
        name: 'Advanced tests provided',
        pass: r7.reply?.includes('AVANZAD') || r7.reply?.includes('específicas') || r7.reply?.includes('advanced'),
        actual: r7.reply?.includes('AVANZAD') ? 'Contains "AVANZAD"' : 'Missing advanced tests keyword',
        expected: 'Contains advanced tests keywords'
      },
      {
        name: 'Buttons present',
        pass: r7.options && r7.options.length >= 2,
        actual: r7.options?.length || 0,
        expected: '>= 2 buttons'
      }
    ];

    let passed = 0;
    checks.forEach((check, i) => {
      const icon = check.pass ? '✅' : '❌';
      console.log(`${icon} ${i + 1}. ${check.name}`);
      console.log(`   Expected: ${check.expected}`);
      console.log(`   Actual: ${check.actual}`);
      if (check.pass) passed++;
    });

    console.log('\n' + '='.repeat(70));
    if (passed === checks.length) {
      console.log('🎉 ALL CHECKS PASSED! Bug is fixed.');
      console.log('='.repeat(70));
      process.exit(0);
    } else {
      console.log(`⚠️  ${checks.length - passed}/${checks.length} checks failed`);
      console.log('='.repeat(70));
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error('Error:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
    process.exit(1);
  }
}

// Run test
runTest().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
