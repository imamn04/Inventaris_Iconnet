const { app } = require('../server');
const prisma = require('../src/config/prisma');
const http = require('http');

async function runTests() {
  console.log('--- Running Integration Tests ---');
  
  const server = http.createServer(app);
  const TEST_PORT = 3099;
  
  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

  try {
    // 1. Stats
    const statsRes = await fetch(`${baseUrl}/api/stats`);
    if (statsRes.status !== 200) throw new Error('Stats status is not 200');
    const stats = await statsRes.json();
    console.log('[PASS] GET /api/stats -> total items:', stats.total);

    // 2. Login
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    if (loginRes.status !== 200) throw new Error('Login status is not 200');
    const loginData = await loginRes.json();
    if (!loginData.success) throw new Error('Login failed: ' + loginData.message);
    console.log('[PASS] POST /api/login -> authenticated user:', loginData.user.username);

    // 3. Inventory
    const invRes = await fetch(`${baseUrl}/api/inventory`);
    if (invRes.status !== 200) throw new Error('Inventory status is not 200');
    const items = await invRes.json();
    console.log('[PASS] GET /api/inventory -> items count:', items.length);

    // 4. Cubicles
    const cubicleRes = await fetch(`${baseUrl}/api/cubicle-positions`);
    if (cubicleRes.status !== 200) throw new Error('Cubicles status is not 200');
    const cubicles = await cubicleRes.json();
    console.log('[PASS] GET /api/cubicle-positions -> cubicles count:', cubicles.length);

    // 5. Handover
    const handoverRes = await fetch(`${baseUrl}/api/handover`);
    if (handoverRes.status !== 200) throw new Error('Handover status is not 200');
    const handovers = await handoverRes.json();
    console.log('[PASS] GET /api/handover -> records count:', handovers.length);

    console.log('\n[SUCCESS] ALL INTEGRATION TESTS PASSED 100%!');
  } catch (err) {
    console.error('\n[FAIL] Integration test failed:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };

