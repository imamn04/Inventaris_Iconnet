const prisma = require('../config/prisma');

async function getAllNonInventory() {
  return await prisma.nonInventory.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

async function createNonInventory(data) {
  const created = await prisma.nonInventory.create({
    data: {
      namaBarang: data.namaBarang,
      kategori: data.kategori || 'Umum',
      jumlah: parseInt(data.jumlah, 10) || 0,
      satuan: data.satuan || 'Pcs',
      lokasi: data.lokasi || '-',
      keterangan: data.keterangan || ''
    }
  });

  try {
    await prisma.history.create({
      data: {
        action: 'CREATE_NON_INV',
        itemId: created.id,
        itemName: created.namaBarang,
        itemMerk: created.kategori || 'Non-Inventaris',
        itemLokasi: created.lokasi || '-',
        details: `Menambahkan barang non-inventaris baru: ${created.namaBarang} (Stok Awal: ${created.jumlah} ${created.satuan})`
      }
    });
  } catch (e) {
    console.warn('[Non-Inventory] Log error saat CREATE:', e.message);
  }

  return created;
}

async function updateNonInventory(id, data) {
  const updated = await prisma.nonInventory.update({
    where: { id },
    data: {
      namaBarang: data.namaBarang,
      kategori: data.kategori,
      jumlah: parseInt(data.jumlah, 10),
      satuan: data.satuan,
      lokasi: data.lokasi,
      keterangan: data.keterangan
    }
  });

  try {
    await prisma.history.create({
      data: {
        action: 'UPDATE_NON_INV',
        itemId: id,
        itemName: updated.namaBarang,
        itemMerk: updated.kategori || 'Non-Inventaris',
        itemLokasi: updated.lokasi || '-',
        details: `Memperbarui info barang non-inventaris: ${updated.namaBarang} (${updated.jumlah} ${updated.satuan})`
      }
    });
  } catch (e) {
    console.warn('[Non-Inventory] Log error saat UPDATE:', e.message);
  }

  return updated;
}

async function deleteNonInventory(id) {
  const item = await prisma.nonInventory.findUnique({ where: { id } });
  const deleted = await prisma.nonInventory.delete({
    where: { id }
  });

  if (item) {
    try {
      await prisma.history.create({
        data: {
          action: 'DELETE_NON_INV',
          itemId: id,
          itemName: item.namaBarang,
          itemMerk: item.kategori || 'Non-Inventaris',
          itemLokasi: item.lokasi || '-',
          details: `Menghapus barang non-inventaris: ${item.namaBarang} (${item.jumlah} ${item.satuan})`
        }
      });
    } catch (e) {
      console.warn('[Non-Inventory] Log error saat DELETE:', e.message);
    }
  }

  return deleted;
}

async function adjustStock(id, type, amount, reason, operator) {
  const item = await prisma.nonInventory.findUnique({ where: { id } });
  if (!item) throw new Error('Barang non-inventaris tidak ditemukan');

  const qty = parseInt(amount, 10);
  if (isNaN(qty) || qty <= 0) throw new Error('Jumlah mutasi harus lebih besar dari 0');

  let newJumlah = item.jumlah;
  const isIncoming = type === 'IN';

  if (isIncoming) {
    newJumlah += qty;
  } else if (type === 'OUT') {
    if (item.jumlah < qty) {
      throw new Error(`Stok tidak mencukupi! Sisa stok saat ini hanya ${item.jumlah} ${item.satuan}`);
    }
    newJumlah -= qty;
  } else {
    throw new Error('Tipe mutasi tidak valid (harus IN atau OUT)');
  }

  const updated = await prisma.nonInventory.update({
    where: { id },
    data: {
      jumlah: newJumlah,
      keterangan: reason ? `${reason} (${isIncoming ? '+' : '-'}${qty} ${item.satuan})` : item.keterangan
    }
  });

  // Catat jejak mutasi ke riwayat (History)
  try {
    await prisma.history.create({
      data: {
        action: isIncoming ? 'STOCK_IN' : 'STOCK_OUT',
        itemId: item.id,
        itemName: item.namaBarang,
        itemMerk: item.kategori || 'Non-Inventaris',
        itemLokasi: item.lokasi || '-',
        details: `${isIncoming ? 'Barang Masuk (Restock): +' : 'Pengeluaran Barang (Pakai): -'}${qty} ${item.satuan}. Keperluan: ${reason || '-'}. Oleh: ${operator || 'Admin'}`
      }
    });
  } catch (e) {
    console.warn('[Non-Inventory] Peringatan pencatatan riwayat stok:', e.message);
  }

  return updated;
}

module.exports = {
  getAllNonInventory,
  createNonInventory,
  updateNonInventory,
  deleteNonInventory,
  adjustStock
};

