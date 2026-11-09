const { z } = require('zod');

const loginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi').trim(),
  password: z.string().min(1, 'Password wajib diisi')
});

const inventoryItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nama item wajib diisi').trim(),
  merk: z.string().optional().default(''),
  sn: z.string().optional().default(''),
  snConverter: z.string().optional().default(''),
  lokasi: z.string().optional().default(''),
  kondisiBefore: z.string().optional().default('Baik'),
  checklist: z.string().optional().default('Tidak'),
  kondisiAfter: z.string().optional().default(''),
  catatan: z.string().optional().default(''),
  tanggalMasuk: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  qrCode: z.string().optional().default(''),
  cubicle_id: z.string().optional().default(''),
  checkTime: z.string().optional().nullable()
});

const inventoryUpdateSchema = inventoryItemSchema.partial();

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
  jenis: z.string().optional().default('Serah Terima'),
  itemId: z.string().min(1, 'Item ID wajib diisi'),
  itemName: z.string().optional().default(''),
  itemMerk: z.string().optional().default(''),
  itemSn: z.string().optional().default(''),
  itemSnConverter: z.string().optional().default(''),
  pihakPenyerah: z.string().optional().default(''),
  pihakPenerima: z.string().optional().default(''),
  tanggalSerahTerima: z.string().optional().nullable(),
  kondisiBefore: z.string().optional().default(''),
  kondisiAfter: z.string().optional().default(''),
  lokasiBaru: z.string().optional().default(''),
  catatan: z.string().optional().default(''),
  noBeritaAcara: z.string().optional().default(''),
  signature: z.string().optional().default('')
});

module.exports = {
  loginSchema,
  inventoryItemSchema,
  inventoryUpdateSchema,
  bulkDeleteSchema,
  checkInventorySchema,
  assignCubicleSchema,
  cubiclePositionSchema,
  cubiclePositionsBulkSchema,
  handoverSchema
};

