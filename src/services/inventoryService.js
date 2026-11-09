const path = require('path');
const fs = require('fs');
const prisma = require('../config/prisma');
const { logHistory } = require('./historyService');

function mapInventory(row) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    name: row.name || '',
    merk: row.merk || '',
    sn: row.sn || '',
    snConverter: row.snConverter || '',
    lokasi: row.lokasi || '',
    kondisiBefore: row.kondisiBefore || '',
    checklist: row.checklist || 'Tidak',
    kondisiAfter: row.kondisiAfter || '',
    catatan: row.catatan || '',
    tanggalMasuk: row.tanggalMasuk ? row.tanggalMasuk.toISOString().split('T')[0] : null,
    date: row.date ? row.date.toISOString().split('T')[0] : null,
    qrCode: row.qrCode || '',
    cubicle_id: row.cubicleId || '',
    checkTime: row.checkTime ? row.checkTime.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null
  };
}

function parseIndonesianDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  const months = {
    'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
    'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'desember': '12',
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
    'mei': '05', 'jun': '06', 'jul': '07', 'agu': '08', 'agt': '08',
    'sep': '09', 'okt': '10', 'nov': '11', 'des': '12'
  };

  const parts = dateStr.toLowerCase().trim().split(' ');
  if (parts.length >= 3) {
    const day = parts[0].padStart(2, '0');
    const month = months[parts[1]] || '01';
    const year = parts[2];
    const d = new Date(`${year}-${month}-${day}`);
    return isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function extractCubicleId(lokasiStr) {
  if (!lokasiStr || typeof lokasiStr !== 'string') return '';
  const match = lokasiStr.trim().match(/\b([A-Fa-f])-?0*([1-9]|[1-3][0-9])\b/);
  if (match) {
    const block = match[1].toUpperCase();
    const num = String(parseInt(match[2], 10)).padStart(2, '0');
    return `${block}-${num}`;
  }
  return '';
}

async function getAllInventory() {
  const items = await prisma.inventory.findMany({
    orderBy: { no: 'asc' }
  });
  return items.map(mapInventory);
}

async function createInventoryItem(data) {
  // Generate next ID
  const maxResult = await prisma.inventory.aggregate({
    _max: { no: true }
  });
  const maxNo = maxResult._max.no || 0;
  const nextNo = maxNo + 1;
  const id = data.id || `INV-${String(nextNo).padStart(3, '0')}`;

  let qrCode = data.qrCode || '';
  if (qrCode && qrCode.startsWith('data:image/png;base64,')) {
    const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
    const barcodeDir = path.join(process.cwd(), 'barcode');
    if (!fs.existsSync(barcodeDir)) {
      fs.mkdirSync(barcodeDir, { recursive: true });
    }
    const barcodePath = path.join(barcodeDir, `${id}.png`);
    fs.writeFileSync(barcodePath, base64Data, 'base64');
    qrCode = `/barcode/${id}.png`;
  }

  const tanggalMasuk = parseIndonesianDate(data.tanggalMasuk || data.date);
  const dateVal = parseIndonesianDate(data.date);
  const cubicleId = (data.cubicle_id || data.cubicleId)
    ? (data.cubicle_id || data.cubicleId).trim().toUpperCase()
    : extractCubicleId(data.lokasi);

  const created = await prisma.inventory.create({
    data: {
      id: id,
      no: nextNo,
      name: data.name,
      merk: data.merk || '',
      sn: data.sn || '',
      snConverter: data.snConverter || '',
      lokasi: data.lokasi || '',
      kondisiBefore: data.kondisiBefore || 'Baik',
      checklist: data.checklist || 'Tidak',
      kondisiAfter: data.kondisiAfter || '',
      catatan: data.catatan || '',
      tanggalMasuk: tanggalMasuk,
      date: dateVal,
      qrCode: qrCode,
      cubicleId: cubicleId || ''
    }
  });

  const mapped = mapInventory(created);
  if (data.name && data.name.trim()) {
    try {
      const catName = data.name.trim();
      const existing = await prisma.category.findFirst({
        where: { name: { equals: catName, mode: 'insensitive' } }
      });
      if (!existing) {
        await prisma.category.create({ data: { name: catName } });
      }
    } catch (_) {}
  }
  await logHistory('CREATE', mapped, `Menambahkan item baru: ${mapped.name} (${mapped.id})`);
  return mapped;
}

async function updateInventoryItem(id, data) {
  const current = await prisma.inventory.findUnique({
    where: { id }
  });

  if (!current) {
    return null;
  }

  const tanggalMasuk = data.tanggalMasuk !== undefined ? parseIndonesianDate(data.tanggalMasuk) : current.tanggalMasuk;
  const dateVal = data.date !== undefined ? parseIndonesianDate(data.date) : current.date;
  const checkTime = data.checkTime ? new Date(data.checkTime) : current.checkTime;

  let cubicleIdVal = current.cubicleId;
  if (data.cubicle_id !== undefined || data.cubicleId !== undefined) {
    cubicleIdVal = (data.cubicle_id || data.cubicleId || '').trim().toUpperCase();
  } else if (data.lokasi !== undefined) {
    const extracted = extractCubicleId(data.lokasi);
    if (extracted) {
      cubicleIdVal = extracted;
    }
  }

  const updated = await prisma.inventory.update({
    where: { id },
    data: {
      name: data.name !== undefined ? data.name : current.name,
      merk: data.merk !== undefined ? data.merk : current.merk,
      sn: data.sn !== undefined ? data.sn : current.sn,
      snConverter: data.snConverter !== undefined ? data.snConverter : current.snConverter,
      lokasi: data.lokasi !== undefined ? data.lokasi : current.lokasi,
      kondisiBefore: data.kondisiBefore !== undefined ? data.kondisiBefore : current.kondisiBefore,
      checklist: data.checklist !== undefined ? data.checklist : current.checklist,
      kondisiAfter: data.kondisiAfter !== undefined ? data.kondisiAfter : current.kondisiAfter,
      catatan: data.catatan !== undefined ? data.catatan : current.catatan,
      tanggalMasuk: tanggalMasuk,
      date: dateVal,
      qrCode: data.qrCode !== undefined ? data.qrCode : current.qrCode,
      cubicleId: cubicleIdVal
    }
  });

  const mapped = mapInventory(updated);
  await logHistory('UPDATE', mapped, `Memperbarui item: ${mapped.name} (${id})`);
  return mapped;
}

async function deleteInventoryItem(id) {
  const item = await prisma.inventory.findUnique({ where: { id } });
  if (!item) return false;

  await prisma.inventory.delete({ where: { id } });
  const mapped = mapInventory(item);
  await logHistory('DELETE', mapped, `Menghapus item: ${mapped.name} (${id})`);
  return true;
}

async function checkItemScan(searchValue) {
  const trimmed = searchValue.trim();
  const item = await prisma.inventory.findFirst({
    where: {
      OR: [
        { id: { equals: trimmed } },
        { sn: { equals: trimmed } }
      ]
    }
  });

  if (!item) {
    return { success: false, status: 'not_found' };
  }

  const isAlreadyChecked = (item.checklist || '').trim() === 'Ya';
  if (!isAlreadyChecked) {
    const now = new Date();
    const updated = await prisma.inventory.update({
      where: { id: item.id },
      data: {
        checklist: 'Ya'
      }
    });

    await logHistory('UPDATE', { id: item.id, name: item.name }, `Melakukan check inventaris: ${item.id}`);
    return {
      success: true,
      status: 'found',
      item: mapInventory(updated)
    };
  }

  return {
    success: true,
    status: 'already_checked',
    item: mapInventory(item)
  };
}

async function resetAllChecklist() {
  await prisma.inventory.updateMany({
    data: {
      checklist: 'Tidak'
    }
  });

  await logHistory('UPDATE', { id: 'SYSTEM', name: 'ALL' }, 'Mereset semua status checklist inventaris');
  return true;
}

async function bulkDeleteInventory(ids) {
  if (!ids || ids.length === 0) return { count: 0 };

  const stringIds = ids.map(id => String(id));
  const items = await prisma.inventory.findMany({
    where: { id: { in: stringIds } }
  });

  const result = await prisma.inventory.deleteMany({
    where: { id: { in: stringIds } }
  });

  await logHistory('DELETE', { id: 'BULK', name: `${result.count} items` }, `Menghapus ${result.count} item secara massal: ${stringIds.join(', ')}`);
  return { count: result.count, items: items.map(mapInventory) };
}

async function importInventoryItems(items) {
  const maxResult = await prisma.inventory.aggregate({
    _max: { no: true }
  });
  let currentMaxNo = maxResult._max.no || 0;
  let importedCount = 0;

  for (const item of items) {
    const name = item.name || '';
    if (!name) continue;

    let id = item.id || item.ID || '';
    let no = currentMaxNo;

    if (!id) {
      currentMaxNo++;
      no = currentMaxNo;
      id = `INV-${String(currentMaxNo).padStart(3, '0')}`;
    } else {
      const match = id.match(/INV-(\d+)/);
      if (match) {
        no = parseInt(match[1], 10);
        if (no > currentMaxNo) currentMaxNo = no;
      }
    }

    const tanggalMasuk = parseIndonesianDate(item.tanggalMasuk || item.date);
    const dateVal = parseIndonesianDate(item.date);
    const cubicleId = (item.cubicle_id || item.cubicleId)
      ? (item.cubicle_id || item.cubicleId).trim().toUpperCase()
      : extractCubicleId(item.lokasi);

    await prisma.inventory.upsert({
      where: { id },
      update: {
        name,
        merk: item.merk || '',
        sn: item.sn || '',
        snConverter: item.snConverter || item.sn_converter || '',
        lokasi: item.lokasi || '',
        kondisiBefore: item.kondisiBefore || item.kondisi_before || 'Baik',
        checklist: item.checklist || 'Tidak',
        kondisiAfter: item.kondisiAfter || item.kondisi_after || '',
        catatan: item.catatan || '',
        tanggalMasuk,
        date: dateVal,
        cubicleId: cubicleId || undefined
      },
      create: {
        id,
        no,
        name,
        merk: item.merk || '',
        sn: item.sn || '',
        snConverter: item.snConverter || item.sn_converter || '',
        lokasi: item.lokasi || '',
        kondisiBefore: item.kondisiBefore || item.kondisi_before || 'Baik',
        checklist: item.checklist || 'Tidak',
        kondisiAfter: item.kondisiAfter || item.kondisi_after || '',
        catatan: item.catatan || '',
        tanggalMasuk,
        date: dateVal,
        qrCode: '',
        cubicleId: cubicleId || ''
      }
    });

    await logHistory('CREATE', { id, name, merk: item.merk, sn: item.sn, lokasi: item.lokasi }, `Mengimpor item: ${name} (${id})`);
    importedCount++;
  }

  return { count: importedCount };
}

async function assignCubicle(itemId, cubicleId) {
  const item = await prisma.inventory.findUnique({ where: { id: itemId } });
  if (!item) return null;

  const targetCubicle = cubicleId ? cubicleId.trim().toUpperCase() : '';
  const updated = await prisma.inventory.update({
    where: { id: itemId },
    data: {
      cubicleId: targetCubicle,
      lokasi: targetCubicle || item.lokasi || '-'
    }
  });

  await logHistory('UPDATE', { id: itemId }, `Assign item ke kubikel: ${targetCubicle || 'Unassigned'}`);
  return mapInventory(updated);
}

module.exports = {
  mapInventory,
  getAllInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  checkItemScan,
  resetAllChecklist,
  bulkDeleteInventory,
  importInventoryItems,
  assignCubicle
};

