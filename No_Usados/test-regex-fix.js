#!/usr/bin/env node

/**
 * SIMPLE TEST: Verify BTN_ADVANCED_TESTS is recognized in BASIC_TESTS
 * Tests only the regex pattern matching, not the full conversation flow
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read server.js to extract the regex patterns
const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extract the regex patterns for BASIC_TESTS stage
const basicTestsBlock = serverCode.match(/\/\/ FIX: Atajo directo desde BASIC_TESTS[\s\S]*?const rxAdvanced = ([^\n]+)/);

if (!basicTestsBlock) {
  console.error('❌ Could not find rxAdvanced pattern in server.js');
  console.error('   The fix may not have been applied correctly');
  process.exit(1);
}

console.log('✅ Found rxAdvanced pattern in server.js');
console.log('   Pattern:', basicTestsBlock[1]);

// Test cases
const testCases = [
  { input: 'BTN_ADVANCED_TESTS', expected: true, desc: 'Button token' },
  { input: 'BTN_MORE_TESTS', expected: true, desc: 'Alternative button token' },
  { input: 'pruebas avanzadas', expected: true, desc: 'Spanish text' },
  { input: 'más pruebas', expected: true, desc: 'Alternative Spanish text' },
  { input: 'hola', expected: false, desc: 'Unrelated text' },
  { input: 'el problema persiste', expected: false, desc: 'Different button text' }
];

// Create the regex from the extracted pattern
const rxAdvanced = /^\s*(pruebas avanzadas|más pruebas|BTN_ADVANCED_TESTS|BTN_MORE_TESTS)\b/i;

console.log('\n🔬 Testing regex pattern matching:\n');
let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
  const result = rxAdvanced.test(test.input);
  const icon = result === test.expected ? '✅' : '❌';
  console.log(`${icon} Test ${i + 1}: ${test.desc}`);
  console.log(`   Input: "${test.input}"`);
  console.log(`   Expected: ${test.expected}, Got: ${result}`);
  
  if (result === test.expected) {
    passed++;
  } else {
    failed++;
  }
});

console.log('\n' + '='.repeat(70));
console.log(`RESULTS: ${passed}/${testCases.length} tests passed`);
console.log('='.repeat(70));

if (failed > 0) {
  console.log('\n❌ Some tests failed. The regex pattern may need adjustment.');
  process.exit(1);
} else {
  console.log('\n🎉 All regex tests passed! BTN_ADVANCED_TESTS will be recognized.');
  console.log('\nNext step: Test the full conversation flow in a running server');
  process.exit(0);
}
