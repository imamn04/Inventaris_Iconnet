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
    // 1. Login
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    if (loginRes.status !== 200) throw new Error('Login status is not 200');
    const loginData = await loginRes.json();
    if (!loginData.success) throw new Error('Login failed: ' + loginData.message);
    const token = loginData.token;
    console.log('[PASS] POST /api/login -> authenticated user:', loginData.user.username);

    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // 2. Stats
    const statsRes = await fetch(`${baseUrl}/api/stats`, { headers: authHeaders });
    if (statsRes.status !== 200) throw new Error('Stats status is not 200');
    const stats = await statsRes.json();
    console.log('[PASS] GET /api/stats -> total items:', stats.total);

    // 3. Inventory
    const invRes = await fetch(`${baseUrl}/api/inventory`, { headers: authHeaders });
    if (invRes.status !== 200) throw new Error('Inventory status is not 200');
    const items = await invRes.json();
    console.log('[PASS] GET /api/inventory -> items count:', items.length);

    // 4. Cubicles
    const cubicleRes = await fetch(`${baseUrl}/api/cubicle-positions`, { headers: authHeaders });
    if (cubicleRes.status !== 200) throw new Error('Cubicles status is not 200');
    const cubicles = await cubicleRes.json();
    console.log('[PASS] GET /api/cubicle-positions -> cubicles count:', cubicles.length);

    // 5. Handover
    const handoverRes = await fetch(`${baseUrl}/api/handover`, { headers: authHeaders });
    if (handoverRes.status !== 200) throw new Error('Handover status is not 200');
    const handovers = await handoverRes.json();
    console.log('[PASS] GET /api/handover -> records count:', handovers.length);

    // 6. Non-Inventory Logs
    const nonInvLogsRes = await fetch(`${baseUrl}/api/non-inventory/logs`, { headers: authHeaders });
    if (nonInvLogsRes.status !== 200) throw new Error('Non-Inventory logs status is not 200');
    const nonInvLogs = await nonInvLogsRes.json();
    console.log('[PASS] GET /api/non-inventory/logs -> mutation logs count:', Array.isArray(nonInvLogs) ? nonInvLogs.length : 0);

    // 7. Batch Inventory Intake Test
    const batchRes = await fetch(`${baseUrl}/api/inventory/batch`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        commonData: {
          name: 'Kursi Kerja Ergonomis',
          merk: 'Informa',
          lokasi: 'Gudang Standby',
          kondisiBefore: 'Baik',
          kondisiAfter: 'Baik',
          checklist: 'Tidak',
          catatan: 'Unit batch test otomatis'
        },
        items: [
          { sn: 'TEST-KRS-001' },
          { sn: 'TEST-KRS-002' }
        ]
      })
    });
    if (batchRes.status !== 201) throw new Error('Batch inventory status is not 201: ' + await batchRes.text());
    const batchData = await batchRes.json();
    console.log('[PASS] POST /api/inventory/batch -> successfully created items count:', batchData.count);

    // Clean up test batch items
    if (batchData.items && batchData.items.length > 0) {
      for (const item of batchData.items) {
        await prisma.inventory.delete({ where: { id: item.id } }).catch(() => {});
      }
      console.log('[PASS] Cleanup test batch items successfully');
    }

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

