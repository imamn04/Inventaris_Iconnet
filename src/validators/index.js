const { z } = require('zod');

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi').trim(),
  password: z.string().min(1, 'Password wajib diisi')
});

const inventoryItemSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().min(1, 'Nama item wajib diisi').trim(),
  merk: z.string().optional().nullable().default(''),
  sn: z.string().optional().nullable().default(''),
  snConverter: z.string().optional().nullable().default(''),
  lokasi: z.string().optional().nullable().default(''),
  kondisiBefore: z.string().optional().nullable().default('Baik'),
  checklist: z.string().optional().nullable().default('Tidak'),
  kondisiAfter: z.string().optional().nullable().default(''),
  catatan: z.string().optional().nullable().default(''),
  tanggalMasuk: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  qrCode: z.string().optional().nullable().default(''),
  cubicle_id: z.string().optional().nullable().default(''),
  checkTime: z.string().optional().nullable()
});

const inventoryUpdateSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().min(1, 'Nama item wajib diisi').trim().optional().nullable(),
  merk: z.string().optional().nullable(),
  sn: z.string().optional().nullable(),
  snConverter: z.string().optional().nullable(),
  lokasi: z.string().optional().nullable(),
  kondisiBefore: z.string().optional().nullable(),
  checklist: z.string().optional().nullable(),
  kondisiAfter: z.string().optional().nullable(),
  catatan: z.string().optional().nullable(),
  tanggalMasuk: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  qrCode: z.string().optional().nullable(),
  cubicle_id: z.string().optional().nullable(),
  checkTime: z.string().optional().nullable()
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().or(z.number())).min(1, 'Minimal satu ID harus dipilih')
});

const checkInventorySchema = z.object({
  searchValue: z.string().min(1, 'Kode pencarian / SN wajib diisi').trim()
});

const assignCubicleSchema = z.object({
  item_id: z.string().min(1, 'ID item wajib diisi'),
  cubicle_id: z.string().optional().default('')
});

const categorySchema = z.object({
  name: z.string().min(1, 'Nama kategori wajib diisi').max(50, 'Nama kategori maksimal 50 karakter').trim()
});

const cubiclePositionSchema = z.object({
  cubicle_id: z.string().min(1, 'cubicle_id wajib diisi'),
  x: z.number().int().default(0),
  y: z.number().int().default(0),
  type: z.string().optional().default('cubicle'),
  text: z.string().optional().nullable()
});

const cubiclePositionsBulkSchema = z.object({
  positions: z.array(cubiclePositionSchema)
});

const handoverSchema = z.object({
  jenis: z.string().optional().nullable().default('Serah Terima'),
  itemId: z.string().min(1, 'Item ID wajib diisi'),
  itemName: z.string().optional().nullable().default(''),
  itemMerk: z.string().optional().nullable().default(''),
  itemSn: z.string().optional().nullable().default(''),
  itemSnConverter: z.string().optional().nullable().default(''),
  pihakPenyerah: z.string().optional().nullable().default(''),
  pihakPenerima: z.string().optional().nullable().default(''),
  tanggalSerahTerima: z.string().optional().nullable(),
  kondisiBefore: z.string().optional().nullable().default(''),
  kondisiAfter: z.string().optional().nullable().default(''),
  lokasiBaru: z.string().optional().nullable().default(''),
  catatan: z.string().optional().nullable().default(''),
  noBeritaAcara: z.string().optional().nullable().default(''),
  signature: z.string().optional().nullable().default('')
});

module.exports = {
  loginSchema,
  inventoryItemSchema,
  inventoryUpdateSchema,
  bulkDeleteSchema,
  checkInventorySchema,
  assignCubicleSchema,
  categorySchema,
  cubiclePositionSchema,
  cubiclePositionsBulkSchema,
  handoverSchema
};

