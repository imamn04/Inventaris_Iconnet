const prisma = require('../config/prisma');

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

async function getAllHandover() {
  const records = await prisma.handover.findMany({
    orderBy: { timestamp: 'desc' }
  });

  return records.map(r => ({
    id: r.id,
    jenis: r.jenis,
    item_id: r.itemId,
    item_name: r.itemName,
    item_merk: r.itemMerk,
    item_sn: r.itemSn,
    item_sn_converter: r.itemSnConverter,
    pihak_penyerah: r.pihakPenyerah,
    pihak_penerima: r.pihakPenerima,
    tanggal_serah_terima: r.tanggalSerahTerima ? r.tanggalSerahTerima.toISOString().split('T')[0] : null,
    kondisi_before: r.kondisiBefore,
    kondisi_after: r.kondisiAfter,
    lokasi_baru: r.lokasiBaru,
    catatan: r.catatan,
    no_berita_acara: r.noBeritaAcara,
    signature: r.signature,
    nip: r.nip,
    email: r.email,
    hp: r.hp,
    checklist: r.checklist,
    photos: r.photos,
    timestamp: r.timestamp
  }));
}

async function createHandover(data) {
  let tgl = null;
  if (data.tanggalSerahTerima) {
    const d = new Date(data.tanggalSerahTerima);
    if (!isNaN(d.getTime())) tgl = d;
  }

  const created = await prisma.handover.create({
    data: {
      jenis: data.jenis || 'Serah Terima',
      itemId: data.itemId,
      itemName: data.itemName || '',
      itemMerk: data.itemMerk || '',
      itemSn: data.itemSn || '',
      itemSnConverter: data.itemSnConverter || '',
      pihakPenyerah: data.pihakPenyerah || '',
      pihakPenerima: data.pihakPenerima || '',
      tanggalSerahTerima: tgl,
      kondisiBefore: data.kondisiBefore || '',
      kondisiAfter: data.kondisiAfter || '',
      lokasiBaru: data.lokasiBaru || '',
      catatan: data.catatan || '',
      noBeritaAcara: data.noBeritaAcara || '',
      signature: data.signature || '',
      nip: data.nip || '',
      email: data.email || '',
      hp: data.hp || '',
      checklist: data.checklist || '',
      photos: typeof data.photos === 'object' ? JSON.stringify(data.photos) : (data.photos || '')
    }
  });

  // SMART HANDOVER SYNC: Sinkronisasi Otomatis 2 Arah Status, Lokasi & Meja Inventaris
  try {
    let targetItemId = data.itemId;
    let invItem = null;

    if (targetItemId) {
      invItem = await prisma.inventory.findUnique({ where: { id: targetItemId } });
    }
    if (!invItem && data.itemSn) {
      invItem = await prisma.inventory.findFirst({ where: { sn: data.itemSn } });
      if (invItem) targetItemId = invItem.id;
    }

    if (invItem && targetItemId) {
      const isPengembalian = (data.jenis || '').toLowerCase().includes('kembali');
      const isPenerimaan = !isPengembalian;

      const updatePayload = {};
      const newLokasi = String(data.lokasiBaru || '').trim();
      const extractedCubicle = extractCubicleId(newLokasi);

      // Pastikan lokasi dan kubikel selalu sinkron ke Master Inventaris
      if (newLokasi && newLokasi !== '-') {
        updatePayload.lokasi = newLokasi;
        if (extractedCubicle) {
          updatePayload.cubicleId = extractedCubicle;
        }
      }

      if (data.kondisiAfter && String(data.kondisiAfter).trim()) {
        updatePayload.kondisiAfter = String(data.kondisiAfter).trim();
      }

      if (isPenerimaan) {
        if (!updatePayload.lokasi) {
          updatePayload.lokasi = `Digunakan ${data.pihakPenerima || 'User'}`;
        }
        updatePayload.catatan = `Digunakan oleh: ${data.pihakPenerima || '-'} (BAST: ${data.noBeritaAcara || '-'})`;

        await prisma.history.create({
          data: {
            action: 'MUTASI_PENERIMAAN',
            itemId: targetItemId,
            itemName: invItem.name || data.itemName,
            itemMerk: invItem.merk || data.itemMerk,
            itemSn: invItem.sn || data.itemSn,
            itemLokasi: updatePayload.lokasi || invItem.lokasi,
            details: `Penyerahan perangkat kepada ${data.pihakPenerima || '-'} (NIP: ${data.nip || '-'}). No. BA: ${data.noBeritaAcara || '-'}`
          }
        });
      } else if (isPengembalian) {
        if (!updatePayload.lokasi) {
          updatePayload.lokasi = 'Gudang IT (Standby)';
          updatePayload.cubicleId = '';
        }
        updatePayload.catatan = `Dikembalikan oleh: ${data.pihakPenyerah || '-'} (BAST: ${data.noBeritaAcara || '-'})`;

        await prisma.history.create({
          data: {
            action: 'MUTASI_PENGEMBALIAN',
            itemId: targetItemId,
            itemName: invItem.name || data.itemName,
            itemMerk: invItem.merk || data.itemMerk,
            itemSn: invItem.sn || data.itemSn,
            itemLokasi: updatePayload.lokasi || invItem.lokasi,
            details: `Pengembalian perangkat ke gudang IT dari ${data.pihakPenyerah || '-'}. Kondisi: ${data.kondisiAfter || '-'}. No. BA: ${data.noBeritaAcara || '-'}`
          }
        });
      }

      if (Object.keys(updatePayload).length > 0) {
        await prisma.inventory.update({
          where: { id: targetItemId },
          data: updatePayload
        });
      }
    }
  } catch (errSync) {
    console.warn('[Smart Handover Sync] Peringatan sinkronisasi aset:', errSync.message);
  }

  return created;
}

async function bulkDeleteHandover(ids) {
  const numericIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  if (numericIds.length === 0) return { count: 0 };

  const result = await prisma.handover.deleteMany({
    where: {
      id: { in: numericIds }
    }
  });

  return { count: result.count };
}

async function getHandoverById(id) {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) return null;

  const r = await prisma.handover.findUnique({
    where: { id: numericId }
  });
  if (!r) return null;

  return {
    id: r.id,
    jenis: r.jenis,
    item_id: r.itemId,
    item_name: r.itemName,
    item_merk: r.itemMerk,
    item_sn: r.itemSn,
    item_sn_converter: r.itemSnConverter,
    pihak_penyerah: r.pihakPenyerah,
    pihak_penerima: r.pihakPenerima,
    tanggal_serah_terima: r.tanggalSerahTerima ? r.tanggalSerahTerima.toISOString().split('T')[0] : null,
    kondisi_before: r.kondisiBefore,
    kondisi_after: r.kondisiAfter,
    lokasi_baru: r.lokasiBaru,
    catatan: r.catatan,
    no_berita_acara: r.noBeritaAcara,
    signature: r.signature,
    nip: r.nip,
    email: r.email,
    hp: r.hp,
    checklist: r.checklist,
    photos: r.photos,
    timestamp: r.timestamp
  };
}

async function updateHandover(id, data) {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) throw new Error('ID serah terima tidak valid');

  const existing = await prisma.handover.findUnique({
    where: { id: numericId }
  });
  if (!existing) throw new Error('Data serah terima tidak ditemukan');

  let tgl = existing.tanggalSerahTerima;
  if (data.tanggalSerahTerima) {
    const d = new Date(data.tanggalSerahTerima);
    if (!isNaN(d.getTime())) tgl = d;
  }

  const checklistVal = data.checklist !== undefined
    ? (Array.isArray(data.checklist) ? data.checklist.join(', ') : String(data.checklist || ''))
    : existing.checklist;

  const updated = await prisma.handover.update({
    where: { id: numericId },
    data: {
      jenis: data.jenis !== undefined ? data.jenis : existing.jenis,
      pihakPenyerah: data.pihakPenyerah !== undefined ? data.pihakPenyerah : existing.pihakPenyerah,
      pihakPenerima: data.pihakPenerima !== undefined ? data.pihakPenerima : existing.pihakPenerima,
      tanggalSerahTerima: tgl,
      kondisiBefore: data.kondisiBefore !== undefined ? data.kondisiBefore : existing.kondisiBefore,
      kondisiAfter: data.kondisiAfter !== undefined ? data.kondisiAfter : existing.kondisiAfter,
      lokasiBaru: data.lokasiBaru !== undefined ? data.lokasiBaru : existing.lokasiBaru,
      catatan: data.catatan !== undefined ? data.catatan : existing.catatan,
      noBeritaAcara: data.noBeritaAcara !== undefined ? data.noBeritaAcara : existing.noBeritaAcara,
      nip: data.nip !== undefined ? data.nip : existing.nip,
      email: data.email !== undefined ? data.email : existing.email,
      hp: data.hp !== undefined ? data.hp : existing.hp,
      checklist: checklistVal,
      photos: data.photos !== undefined
        ? (typeof data.photos === 'object' ? JSON.stringify(data.photos) : String(data.photos || ''))
        : existing.photos
    }
  });

  // Sinkronisasi pembaruan lokasi dan kondisi ke aset inventaris terkait
  try {
    const targetItemId = existing.itemId;
    if (targetItemId) {
      const invItem = await prisma.inventory.findUnique({ where: { id: targetItemId } });
      if (invItem) {
        const updateInvPayload = {};
        if (data.lokasiBaru && data.lokasiBaru.trim()) {
          updateInvPayload.lokasi = data.lokasiBaru.trim();
          const extractedCubicle = extractCubicleId(data.lokasiBaru);
          if (extractedCubicle) {
            updateInvPayload.cubicleId = extractedCubicle;
          }
        }
        if (data.kondisiAfter && data.kondisiAfter.trim()) {
          updateInvPayload.kondisiAfter = data.kondisiAfter.trim();
        }
        if (Object.keys(updateInvPayload).length > 0) {
          await prisma.inventory.update({
            where: { id: targetItemId },
            data: updateInvPayload
          });
        }
      }
    }
  } catch (syncErr) {
    console.warn('[Handover Update Sync] Warning:', syncErr.message);
  }

  return updated;
}

async function syncAllHandoverLocations() {
  const allHandovers = await prisma.handover.findMany({
    orderBy: { timestamp: 'desc' }
  });

  let syncedCount = 0;
  const processedItemIds = new Set();

  for (const h of allHandovers) {
    if (!h.itemId || processedItemIds.has(h.itemId)) continue;
    processedItemIds.add(h.itemId);

    if (h.lokasiBaru && h.lokasiBaru.trim() && h.lokasiBaru !== '-') {
      const invItem = await prisma.inventory.findUnique({ where: { id: h.itemId } });
      if (invItem && invItem.lokasi !== h.lokasiBaru) {
        const extracted = extractCubicleId(h.lokasiBaru);
        await prisma.inventory.update({
          where: { id: h.itemId },
          data: {
            lokasi: h.lokasiBaru,
            ...(extracted ? { cubicleId: extracted } : {})
          }
        });
        syncedCount++;
      }
    }
  }

  return { success: true, syncedCount };
}

module.exports = {
  getAllHandover,
  getHandoverById,
  createHandover,
  updateHandover,
  bulkDeleteHandover,
  syncAllHandoverLocations
};

