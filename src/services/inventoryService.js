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
  // Generate next sequential ID safe against collisions
  const existingItems = await prisma.inventory.findMany({
    select: { no: true, id: true }
  });
  const usedIds = new Set(existingItems.map(i => i.id));
  const maxNo = existingItems.reduce((max, i) => Math.max(max, i.no || 0), 0);
  let nextNo = maxNo + 1;

  let id = data.id ? String(data.id).trim() : '';
  if (id) {
    const match = id.match(/INV-(\d+)/i);
    if (match) {
      nextNo = parseInt(match[1], 10);
    }
  } else {
    let candidateId = `INV-${String(nextNo).padStart(3, '0')}`;
    while (usedIds.has(candidateId)) {
      nextNo++;
      candidateId = `INV-${String(nextNo).padStart(3, '0')}`;
    }
    id = candidateId;
  }

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

async function createBatchInventory(commonData, items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Daftar barang batch tidak boleh kosong');
  }

  const existingItems = await prisma.inventory.findMany({
    select: { no: true, id: true }
  });
  const usedIds = new Set(existingItems.map(i => i.id));
  const maxNo = existingItems.reduce((max, i) => Math.max(max, i.no || 0), 0);
  let nextNo = maxNo + 1;

  const tanggalMasuk = parseIndonesianDate(commonData.tanggalMasuk || commonData.date);
  const dateVal = parseIndonesianDate(commonData.date);
  const cubicleId = (commonData.cubicle_id || commonData.cubicleId)
    ? (commonData.cubicle_id || commonData.cubicleId).trim().toUpperCase()
    : extractCubicleId(commonData.lokasi);

  const barcodeDir = path.join(process.cwd(), 'barcode');
  if (!fs.existsSync(barcodeDir)) {
    fs.mkdirSync(barcodeDir, { recursive: true });
  }

  const createdList = [];

  for (const it of items) {
    let candidateId = `INV-${String(nextNo).padStart(3, '0')}`;
    while (usedIds.has(candidateId)) {
      nextNo++;
      candidateId = `INV-${String(nextNo).padStart(3, '0')}`;
    }
    const id = candidateId;
    usedIds.add(id);

    let qrCode = it.qrCode || '';
    if (qrCode && qrCode.startsWith('data:image/png;base64,')) {
      const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
      const barcodePath = path.join(barcodeDir, `${id}.png`);
      fs.writeFileSync(barcodePath, base64Data, 'base64');
      qrCode = `/barcode/${id}.png`;
    }

    const created = await prisma.inventory.create({
      data: {
        id: id,
        no: nextNo,
        name: commonData.name,
        merk: commonData.merk || '',
        sn: it.sn || '',
        snConverter: it.snConverter || '',
        lokasi: commonData.lokasi || '',
        kondisiBefore: commonData.kondisiBefore || 'Baik',
        checklist: commonData.checklist || 'Tidak',
        kondisiAfter: commonData.kondisiAfter || '',
        catatan: commonData.catatan || '',
        tanggalMasuk: tanggalMasuk,
        date: dateVal,
        qrCode: qrCode,
        cubicleId: cubicleId || ''
      }
    });

    const mapped = mapInventory(created);
    await logHistory('CREATE', mapped, `Menambahkan item batch: ${mapped.name} (${mapped.id}) SN: ${mapped.sn}`);
    createdList.push(mapped);
    nextNo++;
  }

  if (commonData.name && commonData.name.trim()) {
    try {
      const catName = commonData.name.trim();
      const existing = await prisma.category.findFirst({
        where: { name: { equals: catName, mode: 'insensitive' } }
      });
      if (!existing) {
        await prisma.category.create({ data: { name: catName } });
      }
    } catch (_) {}
  }

  return createdList;
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
    cubicleIdVal = extractCubicleId(data.lokasi);
  }

  let qrCode = data.qrCode !== undefined ? data.qrCode : current.qrCode;
  if (qrCode && qrCode.startsWith('data:image/png;base64,')) {
    try {
      const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
      const barcodeDir = path.join(process.cwd(), 'barcode');
      if (!fs.existsSync(barcodeDir)) {
        fs.mkdirSync(barcodeDir, { recursive: true });
      }
      const barcodePath = path.join(barcodeDir, `${id}.png`);
      fs.writeFileSync(barcodePath, base64Data, 'base64');
      qrCode = `/barcode/${id}.png`;
    } catch (e) {
      console.warn(`[Inventory] Could not save QR image to disk for ${id}:`, e.message);
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
      qrCode: qrCode,
      cubicleId: cubicleIdVal
    }
  });

  const mapped = mapInventory(updated);

  // SINKRONISASI 2-ARAH OTOMATIS: Sinkronkan perubahan lokasi & kondisi fisik ke Dokumen BAST Terakhir
  if (data.lokasi !== undefined || data.kondisiAfter !== undefined) {
    try {
      const latestHandover = await prisma.handover.findFirst({
        where: {
          OR: [
            { itemId: id },
            { itemSn: updated.sn }
          ]
        },
        orderBy: { timestamp: 'desc' }
      });

      if (latestHandover) {
        const handoverUpdate = {};
        if (data.lokasi !== undefined && String(data.lokasi).trim()) {
          handoverUpdate.lokasiBaru = String(data.lokasi).trim();
        }
        if (data.kondisiAfter !== undefined && String(data.kondisiAfter).trim()) {
          handoverUpdate.kondisiAfter = String(data.kondisiAfter).trim();
        }
        if (Object.keys(handoverUpdate).length > 0) {
          await prisma.handover.update({
            where: { id: latestHandover.id },
            data: handoverUpdate
          });
        }
      }
    } catch (syncErr) {
      console.warn('[Inventory -> Handover 2-Way Sync] Warning:', syncErr.message);
    }
  }

  // Jangan catat log UPDATE jika request ini semata-mata adalah penyimpanan QR Code inisial
  const isQrOnlyUpdate = Object.keys(data).every(k => k === 'qrCode' || k === 'id');
  if (!isQrOnlyUpdate) {
    await logHistory('UPDATE', mapped, `Memperbarui item: ${mapped.name} (${id})`);
  }
  return mapped;
}

async function deleteInventoryItem(id) {
  const item = await prisma.inventory.findUnique({ where: { id } });
  if (!item) return false;

  // Bersihkan file fisik barcode di disk agar tidak menjadi file yatim/menumpuk
  try {
    const barcodePath = path.join(process.cwd(), 'barcode', `${id}.png`);
    if (fs.existsSync(barcodePath)) {
      fs.unlinkSync(barcodePath);
    }
  } catch (fileErr) {
    console.warn(`[Inventory] Warning saat menghapus file barcode ${id}:`, fileErr.message);
  }

  await prisma.inventory.delete({ where: { id } });
  const mapped = mapInventory(item);
  await logHistory('DELETE', mapped, `Menghapus item: ${mapped.name} (${id})`);
  return true;
}

async function checkItemScan(searchValue, newKondisi = null, action = 'check', relokasi = null) {
  if (!searchValue) {
    return { success: false, status: 'not_found' };
  }

  let raw = String(searchValue).trim();
  const searchValues = new Set();
  if (raw) searchValues.add(raw);

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.id) searchValues.add(String(parsed.id).trim());
      if (parsed.sn) searchValues.add(String(parsed.sn).trim());
      if (parsed.sn_converter) searchValues.add(String(parsed.sn_converter).trim());
    }
  } catch (e) {}

  if (raw.includes('|')) {
    raw.split('|').forEach(part => {
      const p = part.trim();
      if (p) searchValues.add(p);
    });
  }

  const invMatch = raw.match(/INV-?\d+/i);
  if (invMatch) {
    searchValues.add(invMatch[0]);
    const digits = invMatch[0].replace(/\D/g, '');
    if (digits) {
      searchValues.add(`INV-${digits.padStart(3, '0')}`);
      searchValues.add(`INV-${digits}`);
    }
  }

  const conditions = [];
  for (const val of searchValues) {
    conditions.push({ id: { equals: val, mode: 'insensitive' } });
    conditions.push({ sn: { equals: val, mode: 'insensitive' } });
    conditions.push({ snConverter: { equals: val, mode: 'insensitive' } });
  }

  const item = await prisma.inventory.findFirst({
    where: { OR: conditions }
  });

  if (!item) {
    return { success: false, status: 'not_found' };
  }

  const alreadyChecked = item.checklist === 'Ya';
  const now = new Date();

  let targetChecklist = 'Ya';
  let targetCheckTime = now;
  if (action === 'uncheck') {
    targetChecklist = 'Tidak';
    targetCheckTime = null;
  } else if (action === 'toggle') {
    targetChecklist = alreadyChecked ? 'Tidak' : 'Ya';
    targetCheckTime = alreadyChecked ? null : now;
  }

  const updateData = {
    checklist: targetChecklist,
    checkTime: targetCheckTime
  };
  if (newKondisi && String(newKondisi).trim()) {
    updateData.kondisiAfter = String(newKondisi).trim();
  }

  // Jika ada relokasi fisik saat audit defect/rusak
  if (relokasi && String(relokasi).trim() && String(relokasi).trim() !== '-') {
    const trimmedLoc = String(relokasi).trim();
    updateData.lokasi = trimmedLoc;
    const extracted = extractCubicleId(trimmedLoc);
    updateData.cubicleId = extracted || '';
  }

  const updated = await prisma.inventory.update({
    where: { id: item.id },
    data: updateData
  });

  const relocateNote = relokasi ? `, Relokasi: ${relokasi}` : '';
  await logHistory('UPDATE', { id: item.id, name: item.name }, `Melakukan check inventaris: ${item.id} (Status: ${targetChecklist}, Kondisi: ${newKondisi || item.kondisiAfter || 'Tanpa Perubahan'}${relocateNote})`);
  return {
    success: true,
    status: alreadyChecked ? 'already_checked' : 'first_check',
    alreadyChecked,
    checklist: targetChecklist,
    item: mapInventory(updated)
  };
}

async function toggleItemChecklist(id, status = null) {
  const item = await prisma.inventory.findUnique({
    where: { id: String(id) }
  });

  if (!item) {
    return { success: false, message: 'Barang tidak ditemukan' };
  }

  const willCheck = status !== undefined && status !== null ? status === 'Ya' : item.checklist !== 'Ya';
  const updated = await prisma.inventory.update({
    where: { id: item.id },
    data: {
      checklist: willCheck ? 'Ya' : 'Tidak',
      checkTime: willCheck ? new Date() : null
    }
  });

  await logHistory('UPDATE', { id: item.id, name: item.name },
    willCheck ? `Status audit fisik di-checklist (Sudah Dicek): ${item.id}` : `Status audit fisik dibatalkan (Belum Dicek): ${item.id}`
  );

  return {
    success: true,
    status: willCheck ? 'checked' : 'unchecked',
    checklist: willCheck ? 'Ya' : 'Tidak',
    item: mapInventory(updated)
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

  // Bersihkan file fisik barcode massal di disk
  for (const id of stringIds) {
    try {
      const barcodePath = path.join(process.cwd(), 'barcode', `${id}.png`);
      if (fs.existsSync(barcodePath)) {
        fs.unlinkSync(barcodePath);
      }
    } catch (_) {}
  }

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
  let newLokasi = targetCubicle;
  if (!targetCubicle) {
    const oldExtracted = extractCubicleId(item.lokasi || '');
    if (oldExtracted && oldExtracted === (item.cubicleId || '').toUpperCase()) {
      newLokasi = '-';
    } else {
      newLokasi = item.lokasi || '-';
    }
  }

  const updated = await prisma.inventory.update({
    where: { id: itemId },
    data: {
      cubicleId: targetCubicle,
      lokasi: newLokasi
    }
  });

  await logHistory('UPDATE', { id: itemId }, `Assign item ke kubikel: ${targetCubicle || 'Unassigned'}`);
  return mapInventory(updated);
}

module.exports = {
  mapInventory,
  getAllInventory,
  createInventoryItem,
  createBatchInventory,
  updateInventoryItem,
  deleteInventoryItem,
  checkItemScan,
  toggleItemChecklist,
  resetAllChecklist,
  bulkDeleteInventory,
  importInventoryItems,
  assignCubicle
};

