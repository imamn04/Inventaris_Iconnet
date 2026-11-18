const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

function formatTerbilang(angka) {
  const bilangan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  angka = parseInt(angka, 10);
  if (angka < 12) return bilangan[angka];
  if (angka < 20) return formatTerbilang(angka - 10) + ' Belas';
  if (angka < 100) return formatTerbilang(Math.floor(angka / 10)) + ' Puluh ' + (angka % 10 !== 0 ? formatTerbilang(angka % 10) : '');
  if (angka < 200) return 'Seratus ' + (angka % 100 !== 0 ? formatTerbilang(angka - 100) : '');
  if (angka < 1000) return formatTerbilang(Math.floor(angka / 100)) + ' Ratus ' + (angka % 100 !== 0 ? formatTerbilang(angka % 100) : '');
  if (angka < 2000) return 'Seribu ' + (angka % 1000 !== 0 ? formatTerbilang(angka - 1000) : '');
  if (angka < 1000000) return formatTerbilang(Math.floor(angka / 1000)) + ' Ribu ' + (angka % 1000 !== 0 ? formatTerbilang(angka % 1000) : '');
  return String(angka);
}

function generateBASTPDF(data, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });

  const namaPenerima = data.pihak_penerima || data.pihakPenerima || 'Rofi Andiyono';
  const noBA = data.no_berita_acara || data.noBeritaAcara || 'SMG08.1455/ICONNET/BASTB/11-26/0';
  const cleanName = namaPenerima.replace(/\s+/g, '_');
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=BAST_Laptop_${cleanName}.pdf`);
  doc.pipe(res);

  // Setup Font Cambria (Standar Dokumen Asli PLN) dengan fallback ke Helvetica
  let fontRegular = 'Helvetica';
  let fontBold = 'Helvetica-Bold';
  let fontItalic = 'Helvetica-Oblique';

  const cambriaTtc = 'C:/Windows/Fonts/cambria.ttc';
  const cambriaBold = 'C:/Windows/Fonts/cambriab.ttf';
  const cambriaItalic = 'C:/Windows/Fonts/cambriai.ttf';

  if (fs.existsSync(cambriaTtc) && fs.existsSync(cambriaBold)) {
    try {
      doc.registerFont('Cambria', cambriaTtc, 'Cambria');
      doc.registerFont('Cambria-Bold', cambriaBold);
      if (fs.existsSync(cambriaItalic)) {
        doc.registerFont('Cambria-Italic', cambriaItalic);
        fontItalic = 'Cambria-Italic';
      }
      fontRegular = 'Cambria';
      fontBold = 'Cambria-Bold';
    } catch (e) {
      fontRegular = 'Helvetica';
      fontBold = 'Helvetica-Bold';
    }
  }

  const imgDir = path.join(__dirname, '../../public/img');
  const headerDecor = path.join(imgDir, 'bast_header_decor.png');
  const footerDecor = path.join(imgDir, 'bast_footer_decor.png');
  const logoPln = path.join(imgDir, 'pln_icon_plus.png');
  const ttdGustian = path.join(imgDir, 'ttd_gustian.png');

  // ==========================================
  // HALAMAN 1: BERITA ACARA SERAH TERIMA
  // ==========================================

  // 1. Pita Dekorasi Atas & Logo Resmi PLN Icon Plus
  if (fs.existsSync(headerDecor)) {
    doc.image(headerDecor, 0, 0, { width: 330, height: 26 });
  } else {
    doc.rect(0, 0, 300, 10).fill('#0ea5e9');
    doc.rect(0, 12, 595, 3).fill('#22c55e');
  }

  if (fs.existsSync(logoPln)) {
    doc.image(logoPln, 445, 26, { width: 105 });
  }

  const boxX = 45;
  const boxW = 505.28;

  // 2. Kotak 1: Judul Berita Acara & Nomor Dokumen
  const y1 = 76;
  const h1 = 48;
  const rawItemName = (data.item_name || data.itemName || 'LAPTOP').toUpperCase();
  const titleItem = rawItemName.includes('LAPTOP') ? 'LAPTOP' : (rawItemName.includes('MONITOR') ? 'MONITOR' : (rawItemName.includes('PC') ? 'PC / DESKTOP' : rawItemName));
  const isReturn = (data.jenis || '').toLowerCase().includes('kembali');
  const docActionTitle = isReturn ? 'PENGEMBALIAN' : 'SERAH TERIMA';
  const openActionText = isReturn ? 'telah dikembalikan ke ' : 'telah diterima ke ';

  doc.rect(boxX, y1, boxW, h1).lineWidth(1).stroke('#000000');
  doc.fontSize(11).font(fontBold).fillColor('#000000').text(`BERITA ACARA ${docActionTitle} ${titleItem}`, boxX, y1 + 7, { align: 'center', width: boxW });
  doc.fontSize(9.5).font(fontBold).text('CONTACT CENTER RITEL SITE SEMARANG', boxX, y1 + 21, { align: 'center', width: boxW });
  doc.fontSize(9.5).font(fontBold).text(noBA, boxX, y1 + 33, { align: 'center', width: boxW });

  // 3. Kotak 2: Kalimat Pembuka dengan Format Kata Tebal (Bold) Persis Dokumen Asli
  const openingPadX = 8;
  const openingTextW = boxW - (openingPadX * 2);

  const tgl = data.tanggal_serah_terima || data.tanggalSerahTerima ? new Date(data.tanggal_serah_terima || data.tanggalSerahTerima) : new Date();
  const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulanArr = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const namaHari = hariArr[tgl.getDay()];
  const tglNum = tgl.getDate();
  const namaBulan = bulanArr[tgl.getMonth()];
  const tahunNum = tgl.getFullYear();
  const tanggalTerbilang = formatTerbilang(tglNum).trim();
  const tahunTerbilang = formatTerbilang(tahunNum).trim();
  const tglNumerik = String(tglNum).padStart(2, '0') + '-' + String(tgl.getMonth() + 1).padStart(2, '0') + '-' + tahunNum;

  const y2 = y1 + h1;
  const h2 = 32;
  doc.rect(boxX, y2, boxW, h2).lineWidth(1).stroke('#000000');

  doc.fontSize(8).font(fontRegular).fillColor('#000000');
  doc.text('Pada hari ini ', boxX + openingPadX, y2 + 6.5, { width: openingTextW, continued: true, lineGap: 2.5 })
     .font(fontBold).text(namaHari, { continued: true })
     .font(fontRegular).text(', tanggal ', { continued: true })
     .font(fontBold).text(tanggalTerbilang, { continued: true })
     .font(fontRegular).text(' Bulan ', { continued: true })
     .font(fontBold).text(namaBulan, { continued: true })
     .font(fontRegular).text(' Tahun ', { continued: true })
     .font(fontBold).text(`${tahunTerbilang} (${tglNumerik})`, { continued: true })
     .font(fontRegular).text(', kami yang bertanda tangan ', { continued: true })
     .font(fontRegular).text(`dibawah ini menyatakan bahwa Perangkat ${openActionText}`, { continued: true })
     .font(fontBold).text('Technical Support', { continued: true })
     .font(fontRegular).text(' dengan rincian sebagai berikut:');

  // 4. Kotak 3: Tabel Rincian Barang
  const y3 = y2 + h2;
  const colW = [115, 140, 120, 65, 65.28];
  const colX = [boxX, boxX + 115, boxX + 255, boxX + 375, boxX + 440];

  // Header Baris Tabel
  doc.rect(boxX, y3, boxW, 16).lineWidth(1).stroke('#000000');
  doc.fontSize(8).font(fontRegular);
  doc.text('Nama Barang', colX[0], y3 + 4, { width: colW[0], align: 'center' });
  doc.text('Merk', colX[1], y3 + 4, { width: colW[1], align: 'center' });
  doc.text('Serial Number', colX[2], y3 + 4, { width: colW[2], align: 'center' });
  doc.text('Quantity', colX[3], y3 + 4, { width: colW[3], align: 'center' });
  doc.text('Satuan', colX[4], y3 + 4, { width: colW[4], align: 'center' });

  for (let i = 1; i < colX.length; i++) {
    doc.moveTo(colX[i], y3).lineTo(colX[i], y3 + 16).stroke('#000000');
  }

  // Data Baris Barang
  const y4 = y3 + 16;
  const hRow = 18;
  const itemName = data.item_name || data.itemName || 'Laptop';
  const itemMerk = data.item_merk || data.itemMerk || 'Dell Latitude 5350';
  const itemSn = data.item_sn || data.itemSn || '-';

  doc.rect(boxX, y4, boxW, hRow).lineWidth(1).stroke('#000000');
  doc.fontSize(8).font(fontRegular);
  doc.text(itemName, colX[0], y4 + 5, { width: colW[0], align: 'center' });
  doc.text(itemMerk, colX[1], y4 + 5, { width: colW[1], align: 'center' });
  doc.text(itemSn, colX[2], y4 + 5, { width: colW[2], align: 'center' });
  doc.text('1', colX[3], y4 + 5, { width: colW[3], align: 'center' });
  doc.text('Unit', colX[4], y4 + 5, { width: colW[4], align: 'center' });

  for (let i = 1; i < colX.length; i++) {
    doc.moveTo(colX[i], y4).lineTo(colX[i], y4 + hRow).stroke('#000000');
  }

  // 5. Kotak 4: Kelengkapan Perangkat (Checkbox Kotak Vektor Dinamis Per Item)
  let checklistItems = [];
  if (data.checklist) {
    let raw = data.checklist;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = raw.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (Array.isArray(raw)) {
      checklistItems = raw.map(item => {
        if (typeof item === 'object' && item !== null) {
          return {
            name: (item.name || item.label || 'Item').trim(),
            checked: item.checked !== false
          };
        } else if (typeof item === 'string' && item.trim()) {
          return {
            name: item.trim(),
            checked: true
          };
        }
        return null;
      }).filter(Boolean);
    }
  }

  // Fallback jika tidak ada data checklist: sesuaikan dengan kategori aset
  if (checklistItems.length === 0) {
    const itemLow = (itemName || '').toLowerCase();
    if (itemLow.includes('laptop')) {
      checklistItems = [
        { name: 'Laptop', checked: true },
        { name: 'Dus', checked: false },
        { name: 'Charger', checked: true },
        { name: 'Tas Laptop', checked: true }
      ];
    } else if (itemLow.includes('monitor')) {
      checklistItems = [
        { name: 'Unit Monitor', checked: true },
        { name: 'Dus', checked: false },
        { name: 'Kabel Power', checked: true },
        { name: 'Kabel HDMI / VGA', checked: true },
        { name: 'Stand / Kaki Monitor', checked: true }
      ];
    } else if (itemLow.includes('pc')) {
      checklistItems = [
        { name: 'Unit PC / CPU', checked: true },
        { name: 'Dus', checked: false },
        { name: 'Kabel Power', checked: true },
        { name: 'Keyboard', checked: true },
        { name: 'Mouse', checked: true }
      ];
    } else {
      checklistItems = [
        { name: itemName || 'Unit Barang', checked: true },
        { name: 'Dus', checked: false },
        { name: 'Kabel Power / Adaptor', checked: true }
      ];
    }
  }

  const y5 = y4 + hRow;
  const rowsCount = Math.ceil(checklistItems.length / 2);
  const rowSpacing = 11;
  const h5 = Math.max(34, 15 + (rowsCount * rowSpacing) + 3);
  doc.rect(boxX, y5, boxW, h5).lineWidth(1).stroke('#000000');
  doc.fontSize(8).font(fontBold).text('Kelengkapan :', boxX + 6, y5 + 4);

  function drawCheckbox(x, y, checked, label) {
    doc.rect(x, y + 1, 8, 8).lineWidth(0.8).stroke('#000000');
    if (checked) {
      doc.moveTo(x + 1.5, y + 4.8)
         .lineTo(x + 3.2, y + 7.2)
         .lineTo(x + 7.2, y + 2.2)
         .lineWidth(1.2)
         .stroke('#000000');
    }
    doc.font(fontRegular).fontSize(8).text(label, x + 13, y + 1, { width: 195, lineBreak: false });
  }

  // Render 2 Kolom Checkbox secara rapi dan simetris (Semua item menjadi Checkbox resmi)
  checklistItems.forEach((item, idx) => {
    const colIdx = idx % 2;
    const rowIdx = Math.floor(idx / 2);
    const posX = colIdx === 0 ? boxX + 22 : boxX + 200;
    const posY = y5 + 13 + (rowIdx * rowSpacing);
    drawCheckbox(posX, posY, item.checked, item.name);
  });

  // 6. Kotak 5: Header Baris Pernyataan Pengguna
  const y6 = y5 + h5;
  const h6 = 15;
  doc.rect(boxX, y6, boxW, h6).lineWidth(1).stroke('#000000');
  doc.fontSize(8.5).font(fontBold).text('Pernyataan Pengguna', boxX, y6 + 3.5, { align: 'center', width: boxW });

  // 7. Kotak 6: Identitas & 10 Butir Pernyataan Pengguna (Hanging Indent & Dinamis Anti-Overlap)
  const y7 = y6 + h6;
  const nipVal = data.nip || '97231446ICN';
  const namaVal = namaPenerima || 'Rofi Andiyono';
  const emailVal = data.email || (namaVal.toLowerCase().replace(/\s+/g, '.') + '@iconpln.co.id');
  const hpVal = data.hp || '0895375427610';

  const statements = [
    { num: '1.', text: 'Bersedia menjaga perangkat fasilitas kerja ini dengan sebaik-baiknya.' },
    { num: '2.', text: 'Bersedia menggunakan perangkat ini dengan sebagaimana mestinya untuk keperluan pekerjaan di lingkungan Contact Center Ritel' },
    { num: '3.', text: 'Bersedia untuk tidak memuat/menggunakan data/aplikasi yang tidak sesuai dengan ketentuan penggunaan yang ada di lingkungan Contact Center Ritel' },
    { num: '4.', text: 'Bersedia tidak memindahtangankan barang/perangkat ke pihak lain tanpa sepersetujuan Top Management' },
    { num: '5.', text: 'Bersedia tidak membuka casing perangkat secara mandiri.' },
    { num: '6.', text: 'Bersedia untuk tidak memperbaiki perangkat secara mandiri atau diluar Service Center resmi.' },
    { num: '7.', text: 'Bersedia mengembalikan perangkat dan kelengkapannya sesuai yang tercantum pada Berita Acara ini' },
    { num: '8.', text: 'Dalam hal kekurangan, kehilangan dan kerusakan perangkat serta kelengkapannya yang dikembalikan menjadi tanggung jawab Pengguna.' },
    { num: '9.', text: 'Jika ada perbedaan/perselisihan yang timbul dari atau sehubungan dengan penggunaan perangkat fasilitas kerja atau syarat dan ketentuan dari perjanjian ini, sebagai tindaklanjut perihal itu akan diproses dan dipertimbangkan untuk kemudian diputuskan oleh Top Management' },
    { num: '10.', text: 'Saya mengakui bahwa saya telah membaca dan memahami syarat dan ketentuan dari Berita Acara ini dan selanjutnya menyetujui untuk mematuhi semua persyaratan dan ketentuan yang diterapkan di lingkungan Contact Center Ritel' }
  ];

  const numX = boxX + 12;
  const numW = 16;
  const textX = boxX + 32;
  const textW = boxW - 40;

  // Ukur tinggi setiap butir pernyataan secara akurat
  let totalStatementsH = 0;
  doc.fontSize(7.5).font(fontRegular);
  const measured = statements.map(st => {
    const h = doc.heightOfString(st.text, { width: textW, lineGap: 1.5 });
    totalStatementsH += h + 3;
    return { ...st, height: h };
  });

  const identityH = 54;
  const h7 = identityH + totalStatementsH + 6;
  doc.rect(boxX, y7, boxW, h7).lineWidth(1).stroke('#000000');

  let curY = y7 + 5;
  doc.fontSize(8).font(fontRegular).text('Saya Pengguna Perangkat ini', boxX + 6, curY);
  curY += 10;

  // Baris NIP, Nama, Email, HP sejajar rapi dengan label & nilai bercetak tebal (Bold)
  const idX = boxX + 22;
  const colonX = boxX + 68;
  const valX = boxX + 76;

  doc.font(fontBold).fontSize(8);
  doc.text('NIP', idX, curY);
  doc.text(':', colonX, curY);
  doc.text(nipVal, valX, curY);
  curY += 9.5;

  doc.text('Nama', idX, curY);
  doc.text(':', colonX, curY);
  doc.text(namaVal, valX, curY);
  curY += 9.5;

  doc.text('Email', idX, curY);
  doc.text(':', colonX, curY);
  doc.text(emailVal, valX, curY);
  curY += 9.5;

  doc.text('HP', idX, curY);
  doc.text(':', colonX, curY);
  doc.text(hpVal, valX, curY);
  curY += 10.5;

  doc.font(fontRegular).fontSize(8).text('Dengan ini menyatakan :', boxX + 6, curY);
  curY += 9.5;

  // Render 10 Butir Pernyataan dengan Hanging Indent & Spasi Paragraf Rapi
  measured.forEach(st => {
    doc.font(fontRegular).fontSize(7.5);
    doc.text(st.num, numX, curY, { width: numW, align: 'right' });
    doc.text(st.text, textX, curY, { width: textW, align: 'justify', lineGap: 1.5 });
    curY += st.height + 3;
  });

  // 8. Kotak 7: Catatan Lain
  const y8 = y7 + h7;
  const h8 = 18;
  doc.rect(boxX, y8, boxW, h8).lineWidth(1).stroke('#000000');
  const catatanText = data.catatan ? `Catatan Lain : ${data.catatan}` : 'Catatan Lain :';
  doc.fontSize(8).font(fontBold).text(catatanText, boxX + 6, y8 + 4.5);

  // 9. Kotak 8: Kalimat Penutup
  const y9 = y8 + h8;
  const h9 = 18;
  doc.rect(boxX, y9, boxW, h9).lineWidth(1).stroke('#000000');
  doc.fontSize(8).font(fontRegular).text(
    'Demikian Berita Acara Serah Terima barang ini dibuat dan ditandatangani untuk dapat dipergunakan sebagaimana mestinya.',
    boxX + 6, y9 + 4.5, { align: 'justify', width: boxW - 12 }
  );

  // 10. Kotak 9: Kotak Tanda Tangan 3 Kolom
  // Sesuai aturan: Hanya "Yang Menyerahkan" yang berisi TTD digital; kolom Penerima & Mengetahui bersih untuk tanda tangan fisik
  const y10 = y9 + h9;
  const h10 = 90;
  doc.rect(boxX, y10, boxW, h10).lineWidth(1).stroke('#000000');

  const colSignW = boxW / 3;
  const xCol1 = boxX;
  const xCol2 = boxX + colSignW;
  const xCol3 = boxX + colSignW * 2;

  // Garis vertikal pembagi 3 kolom tanda tangan
  doc.moveTo(xCol2, y10).lineTo(xCol2, y10 + h10).stroke('#000000');
  doc.moveTo(xCol3, y10).lineTo(xCol3, y10 + h10).stroke('#000000');

  // Header Tanda Tangan
  doc.fontSize(8.5).font(fontBold);
  doc.text('Yang Menyerahkan', xCol1, y10 + 6, { width: colSignW, align: 'center' });
  doc.text('Yang Menerima', xCol2, y10 + 6, { width: colSignW, align: 'center' });
  doc.text('Yang Mengetahui', xCol3, y10 + 6, { width: colSignW, align: 'center' });

  // Nama Pejabat / Pihak
  const namaPenyerahVal = data.pihak_penyerah || data.pihakPenyerah || '-';

  // Tanda Tangan: Hanya Kolom 1 (Yang Menyerahkan)
  if (data.signature) {
    try {
      const sigBuffer = Buffer.from(data.signature.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      doc.image(sigBuffer, xCol1 + (colSignW - 65) / 2, y10 + 18, { width: 65, height: 38 });
    } catch (e) {
      if (namaPenyerahVal.toLowerCase().includes('gustian') && fs.existsSync(ttdGustian)) {
        doc.image(ttdGustian, xCol1 + (colSignW - 65) / 2, y10 + 18, { width: 65, height: 38 });
      }
    }
  } else if (namaPenyerahVal.toLowerCase().includes('gustian') && fs.existsSync(ttdGustian)) {
    doc.image(ttdGustian, xCol1 + (colSignW - 65) / 2, y10 + 18, { width: 65, height: 38 });
  }

  // Kolom 2 (Yang Menerima) & Kolom 3 (Yang Mengetahui) KOSONG / BERSIH untuk TTD basah fisik

  doc.fontSize(8.5).font(fontBold);
  doc.text(namaPenyerahVal, xCol1, y10 + 60, { width: colSignW, align: 'center' });
  doc.text(namaVal, xCol2, y10 + 60, { width: colSignW, align: 'center' });
  doc.text('Erya Sari Dewi', xCol3, y10 + 60, { width: colSignW, align: 'center' });

  // Jabatan Pejabat / Pihak
  doc.fontSize(8).font(fontRegular);
  doc.text('Technical Support', xCol1, y10 + 72, { width: colSignW, align: 'center' });
  doc.text('Team Leader', xCol2, y10 + 72, { width: colSignW, align: 'center' });
  doc.text('Head of Site', xCol3, y10 + 72, { width: colSignW, align: 'center' });

  // Pita Dekorasi Footer Halaman 1 (Full Bleed sampai ujung tepi kanan bawah persis Gambar Referensi 3)
  if (fs.existsSync(footerDecor)) {
    doc.image(footerDecor, 175, 808, { width: 420.28, height: 33.89 });
  }

  // ==========================================
  // HALAMAN 2+: DOKUMENTASI FOTO EVIDENT (SMART GRID & AUTO-PAGINATION)
  // ==========================================
  let photosList = [];
  if (data.photos) {
    if (Array.isArray(data.photos)) {
      photosList = data.photos;
    } else if (typeof data.photos === 'string') {
      try {
        const parsed = JSON.parse(data.photos);
        if (Array.isArray(parsed)) photosList = parsed;
        else if (data.photos.trim().length > 10) photosList = [data.photos];
      } catch (e) {
        if (data.photos.startsWith('data:image')) {
          photosList = [data.photos];
        }
      }
    }
  }

  // Pisahkan foto per halaman (Maksimal 4 foto per lembar dokumentasi)
  const PHOTOS_PER_PAGE = 4;
  const photoPages = [];
  if (photosList.length === 0) {
    photoPages.push([]);
  } else {
    for (let i = 0; i < photosList.length; i += PHOTOS_PER_PAGE) {
      photoPages.push(photosList.slice(i, i + PHOTOS_PER_PAGE));
    }
  }

  photoPages.forEach((pagePhotos, pageIdx) => {
    // Tambahkan halaman baru untuk setiap lembar dokumentasi
    doc.addPage({ size: 'A4', margin: 0 });

    // Header dekorasi & Logo PLN Icon Plus
    if (fs.existsSync(headerDecor)) {
      doc.image(headerDecor, 0, 0, { width: 330, height: 26 });
    }
    if (fs.existsSync(logoPln)) {
      doc.image(logoPln, 445, 26, { width: 105 });
    }

    // Kotak Judul DOKUMENTASI
    const yDocTitle = 76;
    doc.rect(boxX, yDocTitle, boxW, 18).lineWidth(1).stroke('#000000');
    const docTitle = pageIdx === 0
      ? 'DOKUMENTASI FOTO EVIDENT'
      : `DOKUMENTASI FOTO EVIDENT (Lanjutan Bagian ${pageIdx + 1})`;
    doc.fontSize(9.5).font(fontBold).text(docTitle, boxX, yDocTitle + 4.5, { align: 'center', width: boxW });

    // Kotak Frame Foto Dokumentasi
    const yDocPhoto = yDocTitle + 18;
    const hDocPhoto = 630;
    doc.rect(boxX, yDocPhoto, boxW, hDocPhoto).lineWidth(1).stroke('#000000');

    // Render Foto Berdasarkan Jumlah di Halaman Ini
    if (pagePhotos.length === 0) {
      doc.fontSize(9.5).font(fontRegular).fillColor('#94a3b8').text(
        'Dokumentasi Foto Serah Terima',
        boxX, yDocPhoto + 290, { align: 'center', width: boxW }
      );
    } else if (pagePhotos.length === 1) {
      try {
        const imgBuffer = Buffer.from(pagePhotos[0].replace(/^data:image\/\w+;base64,/, ''), 'base64');
        doc.image(imgBuffer, boxX + 6, yDocPhoto + 6, {
          width: boxW - 12,
          height: hDocPhoto - 12,
          fit: [boxW - 12, hDocPhoto - 12],
          align: 'center',
          valign: 'center'
        });
      } catch (err) {
        console.error('Error embedding single photo:', err.message);
      }
    } else if (pagePhotos.length === 2) {
      const slotH = (hDocPhoto - 16) / 2;
      for (let i = 0; i < 2; i++) {
        try {
          const imgBuffer = Buffer.from(pagePhotos[i].replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const slotY = yDocPhoto + 6 + i * (slotH + 4);
          doc.image(imgBuffer, boxX + 6, slotY, {
            width: boxW - 12,
            height: slotH - 4,
            fit: [boxW - 12, slotH - 4],
            align: 'center',
            valign: 'center'
          });
        } catch (err) {
          console.error(`Error embedding photo ${i}:`, err.message);
        }
      }
    } else {
      // 3 atau 4 foto -> Grid 2x2
      const pad = 8;
      const colW = (boxW - (pad * 3)) / 2;
      const rowH = (hDocPhoto - (pad * 3)) / 2;

      pagePhotos.forEach((photo, pIdx) => {
        try {
          const imgBuffer = Buffer.from(photo.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const col = pIdx % 2;
          const row = Math.floor(pIdx / 2);

          let posX = boxX + pad + col * (colW + pad);
          let posY = yDocPhoto + pad + row * (rowH + pad);

          // Jika 3 foto, posisikan foto ke-3 di tengah baris bawah agar seimbang
          if (pagePhotos.length === 3 && pIdx === 2) {
            posX = boxX + pad + (colW / 2) + (pad / 2);
          }

          doc.image(imgBuffer, posX, posY, {
            width: colW,
            height: rowH,
            fit: [colW, rowH],
            align: 'center',
            valign: 'center'
          });
        } catch (err) {
          console.error(`Error embedding grid photo ${pIdx}:`, err.message);
        }
      });
    }

    // Pita Dekorasi Footer Tiap Halaman Dokumentasi
    if (fs.existsSync(footerDecor)) {
      doc.image(footerDecor, 175, 808, { width: 420.28, height: 33.89 });
    }
  });

  doc.end();
}

module.exports = { generateBASTPDF };
