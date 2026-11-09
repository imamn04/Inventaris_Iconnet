const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

function parsePostgresCopy(sqlContent, tableName) {
  const lines = sqlContent.split(/\r?\n/);
  let isTarget = false;
  let headers = [];
  const rows = [];

  for (const line of lines) {
    if (line.startsWith(`COPY public.${tableName}`)) {
      isTarget = true;
      const match = line.match(/\((.+)\)/);
      if (match) {
        headers = match[1].split(',').map(h => h.trim().replace(/"/g, ''));
      }
      continue;
    }

    if (isTarget) {
      if (line.trim() === '\\.') {
        isTarget = false;
        break;
      }
      if (!line.trim()) continue;

      const parts = line.split('\t');
      const row = {};
      headers.forEach((h, i) => {
        let val = parts[i];
        if (val === undefined || val === '\\N') {
          val = null;
        }
        row[h] = val;
      });
      rows.push(row);
    }
  }

  return rows;
}

async function main() {
  console.log('--- Starting Database Seeding & Migration to MySQL ---');
  const sqlFile = path.join(__dirname, '../iventaris_db.sql');
  if (!fs.existsSync(sqlFile)) {
    console.error('SQL dump file not found at:', sqlFile);
    return;
  }

  const sqlContent = fs.readFileSync(sqlFile, 'utf8');

  // 1. Users
  const userRows = parsePostgresCopy(sqlContent, 'users');
  console.log(`Found ${userRows.length} users in dump.`);
  for (const u of userRows) {
    const hashedPassword = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        name: u.name,
        password: hashedPassword,
        role: 'admin'
      },
      create: {
        id: parseInt(u.id, 10),
        username: u.username,
        password: hashedPassword,
        name: u.name,
        role: 'admin'
      }
    });
  }

  // Ensure default admin also exists if dump didn't have it
  const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        name: 'Administrator Iconnet',
        role: 'admin'
      }
    });
    console.log('Created default admin user: admin / admin123');
  }

  // 2. Cubicle Positions
  const cubicleRows = parsePostgresCopy(sqlContent, 'cubicle_positions');
  console.log(`Found ${cubicleRows.length} cubicle positions in dump.`);
  for (const c of cubicleRows) {
    if (!c.cubicle_id) continue;
    await prisma.cubiclePosition.upsert({
      where: { cubicleId: c.cubicle_id },
      update: {
        x: parseInt(c.x || '0', 10),
        y: parseInt(c.y || '0', 10),
        type: c.type || 'cubicle',
        text: c.text || null
      },
      create: {
        cubicleId: c.cubicle_id,
        x: parseInt(c.x || '0', 10),
        y: parseInt(c.y || '0', 10),
        type: c.type || 'cubicle',
        text: c.text || null
      }
    });
  }

  // 3. Inventory
  const invRows = parsePostgresCopy(sqlContent, 'inventory');
  console.log(`Found ${invRows.length} inventory items in dump.`);
  for (const item of invRows) {
    if (!item.id) continue;
    
    let tanggalMasuk = null;
    if (item.tanggal_masuk) {
      const d = new Date(item.tanggal_masuk);
      if (!isNaN(d.getTime())) tanggalMasuk = d;
    }

    let dateVal = null;
    if (item.date) {
      const d = new Date(item.date);
      if (!isNaN(d.getTime())) dateVal = d;
    }

    let createdAt = new Date();
    if (item.created_at) {
      const d = new Date(item.created_at);
      if (!isNaN(d.getTime())) createdAt = d;
    }

    await prisma.inventory.upsert({
      where: { id: item.id },
      update: {
        no: item.no ? parseInt(item.no, 10) : null,
        name: item.name,
        merk: item.merk,
        sn: item.sn,
        snConverter: item.sn_converter,
        lokasi: item.lokasi,
        kondisiBefore: item.kondisi_before,
        checklist: item.checklist || 'Tidak',
        kondisiAfter: item.kondisi_after,
        catatan: item.catatan,
        date: dateVal,
        tanggalMasuk: tanggalMasuk,
        qrCode: item.qr_code,
        cubicleId: item.cubicle_id,
        checkTime: null,
        createdAt: createdAt
      },
      create: {
        id: item.id,
        no: item.no ? parseInt(item.no, 10) : null,
        name: item.name,
        merk: item.merk,
        sn: item.sn,
        snConverter: item.sn_converter,
        lokasi: item.lokasi,
        kondisiBefore: item.kondisi_before,
        checklist: item.checklist || 'Tidak',
        kondisiAfter: item.kondisi_after,
        catatan: item.catatan,
        date: dateVal,
        tanggalMasuk: tanggalMasuk,
        qrCode: item.qr_code,
        cubicleId: item.cubicle_id,
        checkTime: null,
        createdAt: createdAt
      }
    });
  }

  // 4. Handover
  const handoverRows = parsePostgresCopy(sqlContent, 'handover');
  console.log(`Found ${handoverRows.length} handover items in dump.`);
  for (const h of handoverRows) {
    let tgl = null;
    if (h.tanggal_serah_terima) {
      const d = new Date(h.tanggal_serah_terima);
      if (!isNaN(d.getTime())) tgl = d;
    }
    let ts = new Date();
    if (h.timestamp) {
      const d = new Date(h.timestamp);
      if (!isNaN(d.getTime())) ts = d;
    }

    await prisma.handover.create({
      data: {
        jenis: h.jenis || 'Serah Terima',
        itemId: h.item_id,
        itemName: h.item_name,
        itemMerk: h.item_merk,
        itemSn: h.item_sn,
        itemSnConverter: h.item_sn_converter,
        pihakPenyerah: h.pihak_penyerah,
        pihakPenerima: h.pihak_penerima,
        tanggalSerahTerima: tgl,
        kondisiBefore: h.kondisi_before,
        kondisiAfter: h.kondisi_after,
        lokasiBaru: h.lokasi_baru,
        catatan: h.catatan,
        noBeritaAcara: h.no_berita_acara,
        signature: h.signature,
        timestamp: ts
      }
    });
  }

  console.log('--- Seeding & Migration Completed Successfully! ---');
}

main()
  .catch((e) => {
    console.error('Error in seed script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

