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
      signature: data.signature || ''
    }
  });

  // Sync inventory item's location and cubicleId if lokasiBaru is provided
  if (data.itemId && data.lokasiBaru && String(data.lokasiBaru).trim()) {
    try {
      const newLokasi = String(data.lokasiBaru).trim();
      const extractedCubicle = extractCubicleId(newLokasi);
      const updatePayload = { lokasi: newLokasi };
      if (extractedCubicle) {
        updatePayload.cubicleId = extractedCubicle;
      } else if (newLokasi === '-') {
        updatePayload.cubicleId = '';
      }
      await prisma.inventory.update({
        where: { id: data.itemId },
        data: updatePayload
      });
    } catch (errSync) {
      console.warn('[Handover Sync] Gagal memperbarui lokasi item:', errSync.message);
    }
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

module.exports = {
  getAllHandover,
  createHandover,
  bulkDeleteHandover
};

