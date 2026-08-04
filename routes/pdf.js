const express = require("express");
const PDFDocument = require("pdfkit");
const path = require("path");
const jwt = require("jsonwebtoken");
const db = require("../db");
const QRCode = require("qrcode");
const { asyncHandler } = require("../utils/asyncHandler");

const arabicReshaper = require("arabic-reshaper");
const bidi = require("bidi-js");

const router = express.Router();

// ── Arabic text helpers ──
function reshapeArabic(text) {
  if (!text) return "";
  try {
    const shaped = arabicReshaper.convert(String(text));
    return bidi.getReorderedSegments(shaped, bidi.ISOLATE).join("");
  } catch {
    return String(text);
  }
}

function isArabic(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text || "");
}

function displayText(text) {
  if (!text) return "";
  return isArabic(text) ? reshapeArabic(text) : String(text);
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(dateStr) {
  if (!dateStr) {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function authViaQueryOrHeader(req, res, next) {
  const header = req.headers.authorization || "";
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const queryToken = req.query.token || null;
  const token = headerToken || queryToken;
  if (!token) return res.status(401).json({ error: "يجب تسجيل الدخول" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "الجلسة منتهية" });
  }
}

// Hardcoded section name translation (Arabic → English)
const sectionNameMap = {
  'الروف': 'Roof',
  'الطابق الأول': 'First Floor',
  'الطابق الأرضي': 'Ground Floor',
  'التسوية': 'Basement',
  'غرفة المعدات الميكانيكية': 'Mechanical equipments Room',
  'الأعمال الكهربائية': 'Electrical Works',
  'أعمال المسبح والأعمال الخارجية': 'Swimming pool and outdoor works',
};

function getSectionNameEn(arName) {
  return sectionNameMap[arName] || arName;
}

function sectionLabel(arName) {
  const en = getSectionNameEn(arName);
  return en && en !== arName ? `${displayText(arName)} \u2014 ${en}` : displayText(arName);
}

router.get("/:id/pdf", authViaQueryOrHeader, asyncHandler(async (req, res) => {
  const q = await db
    .prepare("SELECT * FROM quotes WHERE id = ?")
    .get(req.params.id);
  if (!q) return res.status(404).json({ error: "العرض غير موجود" });

  const sections = await db
    .prepare("SELECT * FROM sections WHERE quote_id = ? ORDER BY sort_order ASC")
    .all(q.id);

  for (const sec of sections) {
    sec.rooms = await db
      .prepare("SELECT * FROM rooms WHERE section_id = ? ORDER BY sort_order ASC")
      .all(sec.id);
    sec.items = await db
      .prepare("SELECT * FROM items WHERE section_id = ? AND room_id IS NULL ORDER BY sort_order ASC")
      .all(sec.id);
    for (const room of sec.rooms) {
      room.items = await db
        .prepare("SELECT * FROM items WHERE room_id = ? ORDER BY sort_order ASC")
        .all(room.id);
    }
  }

  let paymentTerms;
  try {
    paymentTerms = JSON.parse(q.payment_terms || "[]");
  } catch {
    paymentTerms = [];
  }

  // ── Calculate totals ──
  const sectionSubtotals = [];
  let totalSelling = 0;
  let totalEstimatedCost = 0;

  for (const sec of sections) {
    let sectionTotal = 0;
    let sectionCost = 0;
    const allItems = [...(sec.items || [])];
    for (const room of sec.rooms || []) {
      allItems.push(...(room.items || []));
    }
    for (const item of allItems) {
      sectionTotal += (item.qty || 0) * (item.selling_price || 0);
      sectionCost += (item.qty || 0) * (item.base_cost || 0);
    }
    const secNameEn = getSectionNameEn(sec.name);
    sectionSubtotals.push({ code: sec.code, name: sec.name, name_en: secNameEn, subtotal: sectionTotal });
    totalSelling += sectionTotal;
    totalEstimatedCost += sectionCost;
  }

  const discountType = q.discount_type || "fixed";
  const discountVal = Number(q.discount_val) || 0;
  const taxPct = Number(q.tax_pct) || 16;
  const discount = discountType === "pct" ? (totalSelling * discountVal) / 100 : discountVal;
  const afterDiscount = Math.max(totalSelling - discount, 0);
  const vat = (afterDiscount * taxPct) / 100;
  const grandTotal = afterDiscount + vat;

  // ── Build PDF ──
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    autoFirstPage: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="quote-${q.id}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const contentW = pageW - 80;
  const right = pageW - 40;

  // Register Cairo font for Arabic support
  const fontPath = path.join(__dirname, "..", "fonts", "Cairo-Regular.ttf");
  const fontBoldPath = path.join(__dirname, "..", "fonts", "Cairo-Bold.ttf");
  doc.registerFont("Cairo", fontPath);
  doc.registerFont("Cairo-Bold", fontBoldPath);

  const fontReg = "Cairo";
  const fontBold = "Cairo-Bold";

  const gold = "#C9A84C";
  const darkText = "#1C1A17";
  const lightText = "#7A756E";
  const borderColor = "#DDD8D0";
  const tableRowEven = "#F9F7F3";
  const sectionBg = "#EEEAE2";
  const highlightBg = "#F5F0E6";

  let pageNum = 1;

  function addFooter() {
    const totalPages = doc.bufferedPageRange();
    for (let i = totalPages.start; i < totalPages.start + totalPages.count; i++) {
      doc.switchToPage(i);
      doc.font(fontReg).fontSize(7).fillColor(lightText);
      const refText = q.reference_no || "N/A";
      doc.text(
        `TWiNS Interior Design \u2014 Ref: ${refText} \u2014 Page ${i + 1} of ${totalPages.count}`,
        40,
        doc.page.height - 24,
        { width: contentW, align: "center" },
      );
    }
  }

  // ── Page 1: Header + Table ──

  // Company Header
  doc.font(fontBold).fontSize(22).fillColor(gold);
  doc.text("TWiNS", 40, 30, { align: "center", width: contentW });
  doc.font(fontBold).fontSize(11).fillColor(lightText);
  doc.text("INTERIOR DESIGN", 40, 52, { align: "center", width: contentW, characterSpacing: 2 });

  // Contact Info
  doc.font(fontReg).fontSize(7.5).fillColor(lightText);
  doc.text(
    "Kalbouneh Plaza \u2014 King Abdullah St, Amman, Jordan",
    40, 68,
    { align: "center", width: contentW },
  );
  doc.text(
    "Website: www.twinsinteriordesign.com  |  Email: contact@twinsinteriordesign.com  |  Phone|WhatsApp: +962 788 3480 77  |  Instagram: twins_interiordesign",
    40, 80,
    { align: "center", width: contentW },
  );

  // Gold line separator
  doc.moveTo(40, 94).lineTo(right, 94).lineWidth(1.5).strokeColor(gold).stroke();

  // ── Quote Title (bilingual) ──
  const quoteTitle = q.quote_title || q.project_name || "عرض سعر";
  doc.font(fontBold).fontSize(13).fillColor(darkText);
  doc.text(displayText(quoteTitle), 40, 102, { align: "center", width: contentW });

  // ── Project Info (2-column) ──
  let y = 120;
  doc.font(fontReg).fontSize(9).fillColor(darkText);

  const infoLeft = [
    `Ref: ${q.reference_no || "N/A"}`,
    `مالك المشروع: ${displayText(q.client_name) || "N/A"}`,
  ];
  const infoRight = [
    `التاريخ: ${formatDate(q.created_at)}`,
    `الموقع: ${displayText(q.site_location) || "Amman, Jordan"}`,
  ];

  const infoLineH = 14;
  for (let i = 0; i < Math.max(infoLeft.length, infoRight.length); i++) {
    const leftLabel = infoLeft[i] || "";
    const rightLabel = infoRight[i] || "";
    if (i === 0) {
      doc.text(leftLabel, 40, y, { width: contentW / 2 });
      doc.text(rightLabel, 40 + contentW / 2, y, { width: contentW / 2, align: "right" });
    } else {
      doc.text(rightLabel, 40, y, { width: contentW / 2 });
      doc.text(leftLabel, 40 + contentW / 2, y, { width: contentW / 2, align: "right" });
    }
    y += infoLineH;
  }

  y += 4;
  doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
  y += 8;

  // ── Table Header (RTL) ──
  // Columns from RIGHT to LEFT
  const colPos = [right];
  const colWidths = [];
  // # (28), Section (65), Description (flex), Unit (30), Qty (28), UnitPrice (38), Total (38), Notes (55)
  const colDefs = [
    { label: "#", w: 28 },
    { label: "القسم", w: 60 },
    { label: "الوصف", w: 0 }, // flex
    { label: "الوحدة", w: 32 },
    { label: "الكمية", w: 30 },
    { label: "سعر الوحدة", w: 40 },
    { label: "الإجمالي", w: 40 },
    { label: "ملاحظات", w: 52 },
  ];

  // Calculate flex column width
  const fixedW = colDefs.reduce((s, c) => s + (c.w || 0), 0);
  const flexW = contentW - fixedW;
  for (const c of colDefs) {
    const w = c.w === 0 ? flexW : c.w;
    colWidths.push(w);
  }

  // Build positions from right to left
  const colR = [];
  let cx = right;
  for (const w of colWidths) {
    colR.push(cx - w);
    cx -= w;
  }

  function drawTableHeader(atY) {
    doc.rect(40, atY - 2, contentW, 16).fill(highlightBg);
    doc.font(fontBold).fontSize(7.5).fillColor(darkText);
    let hx = right;
    for (let i = 0; i < colDefs.length; i++) {
      const w = colWidths[i];
      doc.text(colDefs[i].label, hx - w, atY + 1, { width: w, align: "center" });
      hx -= w;
    }
    doc.moveTo(40, atY + 14).lineTo(right, atY + 14).lineWidth(0.5).strokeColor(borderColor).stroke();
    return atY + 18;
  }

  y = drawTableHeader(y);

  // ── Items ──
  function renderItemRow(item, sectionLabelEn, atY) {
    if (atY > 720) {
      doc.addPage();
      atY = 42;
      addFooter();
      atY = drawTableHeader(atY);
    }

    const lineTotal = (item.qty || 0) * (item.selling_price || 0);
    const descText = displayText(item.description || item.name || "");
    const notesText = displayText(item.notes || "");
    const secLabel = displayText(sectionLabelEn);
    const itemUnit = displayText(item.unit || "");
    const itemCode = String(item.item_code || "");

    const values = [
      itemCode,
      secLabel.substring(0, 12),
      descText.substring(0, 55),
      itemUnit,
      String(item.qty || 0),
      formatMoney(item.selling_price),
      formatMoney(lineTotal),
      notesText.substring(0, 14),
    ];

    doc.font(fontReg).fontSize(7.5).fillColor(darkText);
    let rx = right;
    for (let i = 0; i < values.length; i++) {
      const w = colWidths[i];
      doc.text(values[i], rx - w, atY, { width: w, align: "center" });
      rx -= w;
    }
    return atY + 13;
  }

  function renderSectionHeader(sec, atY) {
    if (atY > 720) {
      doc.addPage();
      atY = 42;
      addFooter();
      atY = drawTableHeader(atY);
    }
    const secNameEn = getSectionNameEn(sec.name);
    doc.rect(40, atY - 2, contentW, 15).fill(sectionBg);
    doc.font(fontBold).fontSize(8).fillColor(darkText);
    const secHeaderText = `\u200Fالقسم ${sec.code} : ${sectionLabel(sec.name)}`;
    doc.text(secHeaderText, 44, atY + 1, { width: contentW - 8, align: "right" });
    return atY + 17;
  }

  for (const sec of sections) {
    y = renderSectionHeader(sec, y);
    const allItems = [...(sec.items || [])];
    for (const room of sec.rooms || []) {
      const roomLabel = displayText(room.name);
      if (room.items && room.items.length > 0) {
        for (const item of room.items) {
          allItems.push(item);
        }
      }
      // Add room label as first "item" if has items
    }
    const secNameEn = getSectionNameEn(sec.name);
    for (const item of allItems) {
      y = renderItemRow(item, secNameEn, y);
    }
    // Section subtotal
    const secSub = sectionSubtotals.find((s) => s.code === sec.code);
    if (secSub) {
      y += 2;
      doc.font(fontBold).fontSize(8.5).fillColor(gold);
      const subText = `\u25BA مجموع ${sectionLabel(sec.name)}\u200F`;
      // subtotal text on left (RTL so left-aligned content)
      doc.text(subText, 40, y, { width: contentW - 120, align: "right" });
      doc.text(`${formatMoney(secSub.subtotal)} JOD`, right - 110, y, { width: 110, align: "left" });
      y += 16;
      doc.font(fontReg).fillColor(darkText);
    }
  }

  // ── Financial Summary ──
  y += 6;
  if (y > 660) {
    doc.addPage();
    y = 42;
    addFooter();
  }

  doc.moveTo(40, y).lineTo(right, y).lineWidth(1.5).strokeColor(gold).stroke();
  y += 12;

  const summaryLabelX = 40;
  const summaryValX = right - 150;

  doc.font(fontReg).fontSize(10).fillColor(darkText);

  const summaryRows = [
    ["المجموع الكلي قبل الضريبة:", `${formatMoney(afterDiscount)} JOD`],
  ];

  if (discount > 0) {
    const discLabel = discountType === "pct"
      ? `الخصم (${discountVal}%):`
      : "الخصم:";
    summaryRows.push([discLabel, `${formatMoney(discount)} JOD`]);
  }

  summaryRows.push([`ضريبة القيمة المضافة (${taxPct}%):`, `${formatMoney(vat)} JOD`]);

  for (const [label, val] of summaryRows) {
    doc.text(label, summaryLabelX, y, { width: 220 });
    doc.font(fontBold).text(val, summaryValX, y, { width: 150, align: "left" });
    y += 16;
    doc.font(fontReg);
  }

  // Grand Total
  doc.rect(summaryLabelX, y - 2, contentW, 26).fill(gold);
  doc.font(fontBold).fontSize(11).fillColor("#FFFFFF");
  doc.text("\u25BA الإجمالي الكلي للمشروع (شامل ضريبة القيمة المضافة):", summaryLabelX + 8, y + 4, { width: contentW - 170 });
  doc.text(`${formatMoney(grandTotal)} JOD`, summaryValX - 10, y + 4, { width: 150, align: "left" });
  y += 32;

  // ── Payment Terms ──
  if (y > 660) {
    doc.addPage();
    y = 42;
    addFooter();
  }

  doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
  y += 10;

  doc.font(fontBold).fontSize(10).fillColor(darkText);
  doc.text("شروط الدفع \u2014 Payment Terms", 40, y, { width: contentW, align: "right" });
  y += 16;

  const defaultTerms = [
    { percentage: 60, trigger_description: "عند توقيع العقد / Upon contract signing" },
    { percentage: 30, trigger_description: "عند توريد المواد للموقع / Upon material delivery" },
    { percentage: 10, trigger_description: "عند التسليم النهائي / Upon final handover" },
  ];
  const terms = paymentTerms && paymentTerms.length > 0 ? paymentTerms : defaultTerms;

  // Payment Terms Table Header
  doc.rect(40, y - 2, contentW, 16).fill(highlightBg);
  doc.font(fontBold).fontSize(8).fillColor(darkText);
  const ptWidths = [60, contentW - 160, 50, 50]; // pct, desc, amount_en, amount_ar
  const ptLabels = ["النسبة", "الوصف", "المبلغ"];
  const ptColStarts = [
    right - ptWidths[0],
    right - ptWidths[0] - ptWidths[1],
    right - ptWidths[0] - ptWidths[1] - ptWidths[2],
  ];
  // Draw labels
  doc.text(ptLabels[0], ptColStarts[0], y + 1, { width: ptWidths[0], align: "center" });
  doc.text(ptLabels[1], ptColStarts[1], y + 1, { width: ptWidths[1], align: "center" });
  doc.text(ptLabels[2], ptColStarts[2], y + 1, { width: ptWidths[2] + ptWidths[3], align: "center" });
  y += 18;

  doc.font(fontReg).fontSize(8.5).fillColor(darkText);
  for (const term of terms) {
    const amount = (grandTotal * (term.percentage || 0)) / 100;
    const pct = `${term.percentage}%`;
    const desc = displayText(term.trigger_description || "");
    doc.text(pct, ptColStarts[0], y, { width: ptWidths[0], align: "center" });
    doc.text(desc.substring(0, 55), ptColStarts[1], y, { width: ptWidths[1], align: "center" });
    doc.text(`${formatMoney(amount)} JOD`, ptColStarts[2], y, { width: ptWidths[2] + ptWidths[3], align: "center" });
    y += 14;
  }

  // ── Execution, Exclusions, Validity ──
  y += 10;
  if (y > 700) { doc.addPage(); y = 42; addFooter(); }

  doc.font(fontReg).fontSize(8.5).fillColor(darkText);
  const execDays = q.execution_days || 45;
  const validDays = q.validity_days || 30;
  const exclusions = q.price_exclusions || "لا تشمل الأسعار: المطبخ، الحمامات، التكييف، الأجهزة الكهربائية. السعر النهائي يُؤكّد بعد القياس الفعلي";

  doc.text(`\u2022 مدة التنفيذ المتوقعة: ${execDays} يوم عمل من تاريخ توقيع العقد ودفع الدفعة الأولى.`, 40, y, { width: contentW, align: "right" });
  y += 16;
  doc.text(`\u2022 ${displayText(exclusions)}`, 40, y, { width: contentW, align: "right" });
  y += 16;
  doc.text(`\u2022 صلاحية العرض: ${validDays} يوماً من تاريخ الإصدار.`, 40, y, { width: contentW, align: "right" });
  y += 24;

  // ── Signatures ──
  if (y > 680) { doc.addPage(); y = 42; addFooter(); }

  doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
  y += 10;

  doc.font(fontBold).fontSize(11).fillColor(darkText);
  doc.text("توقيع الأطراف | Signatures", 40, y, { width: contentW, align: "center" });
  y += 18;

  const sigColW = (contentW - 20) / 2;
  const sigY = y;

  // Left column: Party 1 (TWiNS)
  doc.font(fontBold).fontSize(9).fillColor(darkText);
  doc.text("الطرف الأول \u2013 شركة التوائم للتصميم", 40, sigY, { width: sigColW, align: "right" });
  doc.text("الداخلي والديكور", 40, sigY + 12, { width: sigColW, align: "right" });
  doc.font(fontReg).fontSize(9);
  doc.text("التوقيع: ________________________", 40, sigY + 30, { width: sigColW, align: "right" });
  doc.text("التاريخ: ___ / ___ / ________", 40, sigY + 46, { width: sigColW, align: "right" });

  // Right column: Party 2 (Client)
  doc.font(fontBold).fontSize(9).fillColor(darkText);
  doc.text("الطرف الثاني \u2013 صاحب العمل", 40 + sigColW + 20, sigY, { width: sigColW, align: "right" });
  doc.font(fontReg).fontSize(9);
  doc.text("التوقيع: ________________________", 40 + sigColW + 20, sigY + 14, { width: sigColW, align: "right" });
  doc.text("التاريخ: ___ / ___ / ________", 40 + sigColW + 20, sigY + 30, { width: sigColW, align: "right" });

  y = sigY + 70;

  // ── Terms & Conditions + QR ──
  if (y > 680) { doc.addPage(); y = 42; addFooter(); }

  doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
  y += 10;

  doc.font(fontBold).fontSize(10).fillColor(darkText);
  doc.text("الشروط والأحكام \u2014 General Terms & Conditions", 40, y, { width: contentW, align: "center" });
  y += 18;

  doc.font(fontReg).fontSize(8).fillColor(darkText);
  doc.text(
    "بالتوقيع على هذه الاتفاقية، فإنك توافق على الشروط والأحكام العامة الخاصة بنا. يرجى مسح رمز الـ QR للاطلاع على الشروط والأحكام الكاملة.",
    40, y, { width: contentW, align: "center" },
  );
  y += 12;
  doc.text(
    "By signing this agreement, you agree to our General Terms & Conditions. Please scan the QR code to view the full Terms & Conditions.",
    40, y, { width: contentW, align: "center" },
  );
  y += 22;

  // QR Code
  try {
    const termsUrl = "https://www.twinsinteriordesign.com/terms";
    const qrBuffer = await QRCode.toBuffer(termsUrl, {
      width: 120,
      margin: 1,
      color: { dark: "#1C1A17", light: "#FFFFFF" },
    });
    const qrX = 40 + (contentW - 120) / 2;
    doc.image(qrBuffer, qrX, y, { width: 120, height: 120 });
    y += 130;
  } catch {
    // Fallback: draw placeholder rectangle
    doc.rect(40 + (contentW - 100) / 2, y, 100, 100).stroke(borderColor);
    y += 110;
  }

  // ── Footer ──
  addFooter();

  doc.end();
}));

module.exports = router;
