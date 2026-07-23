const express = require("express");
const PDFDocument = require("pdfkit");
const path = require("path");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { asyncHandler } = require("../utils/asyncHandler");

const arabicReshaper = require("arabic-reshaper");
const bidi = require("bidi-js");

const router = express.Router();

// Support token via query param for browser-based PDF download
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

  // Calculate totals
  const sectionSubtotals = [];
  let totalSelling = 0;
  let totalEstimatedCost = 0;

  for (const sec of sections) {
    let sectionTotal = 0;
    let sectionCost = 0;
    for (const item of sec.items) {
      sectionTotal += (item.qty || 0) * (item.selling_price || 0);
      sectionCost += (item.qty || 0) * (item.base_cost || 0);
    }
    for (const room of sec.rooms) {
      for (const item of room.items) {
        sectionTotal += (item.qty || 0) * (item.selling_price || 0);
        sectionCost += (item.qty || 0) * (item.base_cost || 0);
      }
    }
    sectionSubtotals.push({ code: sec.code, name: sec.name, subtotal: sectionTotal });
    totalSelling += sectionTotal;
    totalEstimatedCost += sectionCost;
  }

  const discountType = q.discount_type || "fixed";
  const discountVal = Number(q.discount_val) || 0;
  const taxPct = Number(q.tax_pct) || 16;
  const discount =
    discountType === "pct" ? (totalSelling * discountVal) / 100 : discountVal;
  const afterDiscount = Math.max(totalSelling - discount, 0);
  const vat = (afterDiscount * taxPct) / 100;
  const grandTotal = afterDiscount + vat;

  // Create PDF
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
    autoFirstPage: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="quote-${q.id}.pdf"`,
  );
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
  const highlightBg = "#F5F0E6";

  // ── Company Header ──
  doc.font(fontBold).fontSize(20).fillColor(darkText);
  doc.text("TWiNS Interior Design", 40, 36, {
    align: "center",
    width: contentW,
  });

  doc.font(fontReg).fontSize(9).fillColor(lightText);
  doc.text(
    "Kalbouneh Plaza - King Abdullah St, Amman, Jordan",
    40,
    58,
    { align: "center", width: contentW },
  );
  doc.text(
    "www.twinsinteriordesign.com | info@twinsinteriordesign.com | +962 79 123 4567 | @twinsinteriordesign",
    40,
    70,
    { align: "center", width: contentW },
  );

  // Gold line
  doc.moveTo(40, 86).lineTo(right, 86).lineWidth(1.5).strokeColor(gold).stroke();

  // ── Title ──
  doc.font(fontBold).fontSize(15).fillColor(darkText);
  doc.text("FFE & Paint Quotation", 40, 94, {
    align: "center",
    width: contentW,
  });

  // ── Project Info ──
  let y = 118;
  doc.font(fontReg).fontSize(10).fillColor(darkText);

  doc.text(`Date: ${formatDate(q.created_at)}`, 40, y, { width: contentW / 2 });
  doc.text(
    `Ref: ${displayText(q.reference_no) || "N/A"}`,
    40 + contentW / 2,
    y,
    { width: contentW / 2, align: "right" },
  );
  y += 16;
  doc.text(`Client: ${displayText(q.client_name) || "N/A"}`, 40, y, { width: contentW / 2 });
  doc.text(
    `Location: ${displayText(q.site_location) || "Amman, Jordan"}`,
    40 + contentW / 2,
    y,
    { width: contentW / 2, align: "right" },
  );
  y += 20;

  // Thin separator
  doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
  y += 12;

  // ── Table Header ──
  const colX = [40, 70, 150, 300, 335, 375, 430, 490, 515];
  const colW = [30, 80, 150, 35, 40, 55, 60, 25, 55];
  const headers = ["#", "Section", "Detailed Description", "Unit", "Qty", "Unit Price", "Total", "", "Notes"];

  doc.rect(40, y - 2, contentW, 18).fill(highlightBg);
  doc.font(fontBold).fontSize(8).fillColor(darkText);

  const headerLabels = ["#", "Section", "Detailed Description", "Unit", "Qty", "Unit Price", "Total", "", "Notes"];
  let hx = 40;
  headerLabels.forEach((h, i) => {
    if (i === 7) { hx += colW[i]; return; }
    doc.text(h, hx, y + 2, { width: colW[i], align: "center" });
    hx += colW[i];
  });
  y += 18;
  doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
  y += 6;

  // ── Sections & Items ──
  for (const sec of sections) {
    // Section header
    doc.rect(40, y - 2, contentW, 16).fill(gold);
    doc.font(fontBold).fontSize(9).fillColor("#FFFFFF");
    doc.text(
      `Section ${sec.code}: ${displayText(sec.name)}`,
      44,
      y + 1,
      { width: contentW - 8 },
    );
    y += 18;

    doc.font(fontReg).fontSize(8).fillColor(darkText);

    // Helper: render a list of items
    function renderItems(items, label) {
      if (label) {
        if (y > 710) { doc.addPage(); y = 50; renderTableHeader(); doc.font(fontReg).fontSize(8).fillColor(darkText); }
        doc.rect(40, y - 2, contentW, 14).fill(highlightBg);
        doc.font(fontBold).fontSize(8).fillColor(darkText);
        doc.text(label, 44, y + 1, { width: contentW - 8 });
        y += 16;
        doc.font(fontReg).fontSize(8).fillColor(darkText);
      }
      let roomSubtotal = 0;
      for (const item of items) {
        if (y > 710) {
          doc.addPage();
          y = 50;
          renderTableHeader();
          doc.font(fontReg).fontSize(8).fillColor(darkText);
        }

        const lineTotal = (item.qty || 0) * (item.selling_price || 0);
        roomSubtotal += lineTotal;
        const descText = displayText(item.description || item.name || "");
        const notesText = displayText(item.notes || "");
        const sectionLabel = displayText(sec.name);
        const itemUnit = displayText(item.unit || "");

        const rowData = [
          String(item.item_code || ""),
          sectionLabel.substring(0, 14),
          descText.substring(0, 35),
          itemUnit,
          String(item.qty || 0),
          formatMoney(item.selling_price),
          formatMoney(lineTotal),
          "",
          notesText.substring(0, 12),
        ];

        let rx = 40;
        rowData.forEach((cell, i) => {
          doc.text(cell, rx, y, { width: colW[i], align: "center" });
          rx += colW[i];
        });
        y += 14;
      }
      return roomSubtotal;
    }

    function renderTableHeader() {
      doc.rect(40, y - 2, contentW, 18).fill(highlightBg);
      doc.font(fontBold).fontSize(8).fillColor(darkText);
      let nhx = 40;
      headerLabels.forEach((h, i) => {
        if (i === 7) { nhx += colW[i]; return; }
        doc.text(h, nhx, y + 2, { width: colW[i], align: "center" });
        nhx += colW[i];
      });
      y += 18;
      doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
      y += 6;
    }

    if (sec.rooms && sec.rooms.length > 0) {
      // Section has rooms — render direct items + room groups
      let sectionTotal = 0;
      if (sec.items.length > 0) {
        sectionTotal += renderItems(sec.items, "المباشر / Direct");
      }
      for (const room of sec.rooms) {
        if (room.items && room.items.length > 0) {
          sectionTotal += renderItems(room.items, displayText(room.name));
        }
      }
      // Room-aware section subtotal
      doc.font(fontBold).fontSize(9).fillColor(gold);
      doc.text(
        `\u25B8 Section ${sec.code} Subtotal: ${formatMoney(sectionTotal)} JOD`,
        44,
        y,
        { width: contentW - 8 },
      );
      y += 18;
      doc.font(fontReg).fillColor(darkText);
    } else {
      // No rooms — render items directly
      renderItems(sec.items, null);
      // Section subtotal
      const secSub = sectionSubtotals.find((s) => s.code === sec.code);
      if (secSub) {
        doc.font(fontBold).fontSize(9).fillColor(gold);
        doc.text(
          `\u25B8 Section ${sec.code} Subtotal: ${formatMoney(secSub.subtotal)} JOD`,
          44,
          y,
          { width: contentW - 8 },
        );
        y += 18;
        doc.font(fontReg).fillColor(darkText);
      }
    }
  }

  // ── Financial Summary ──
  y += 8;
  if (y > 650) {
    doc.addPage();
    y = 50;
  }
  doc.moveTo(40, y).lineTo(right, y).lineWidth(1.5).strokeColor(gold).stroke();
  y += 12;

  const summaryLabelX = 40;
  const summaryValX = right - 150;

  doc.font(fontReg).fontSize(10).fillColor(darkText);

  const summaryRows = [
    ["Subtotal before discount:", `${formatMoney(totalSelling)} JOD`],
    ["Discount:", `${formatMoney(discount)} JOD`],
    ["Subtotal after discount:", `${formatMoney(afterDiscount)} JOD`],
    [`VAT (${taxPct}%):`, `${formatMoney(vat)} JOD`],
  ];

  for (const [label, val] of summaryRows) {
    doc.font(fontReg).text(label, summaryLabelX, y, { width: 220 });
    doc.font(fontBold).text(val, summaryValX, y, { width: 150, align: "right" });
    y += 16;
  }

  // Grand Total highlight bar
  doc.rect(summaryLabelX, y - 2, contentW, 24).fill(gold);
  doc.font(fontBold).fontSize(11).fillColor("#FFFFFF");
  doc.text("Grand Total:", summaryLabelX + 8, y + 3, { width: 200 });
  doc.text(`${formatMoney(grandTotal)} JOD`, summaryValX, y + 3, {
    width: 150,
    align: "right",
  });
  y += 32;

  // Estimated Cost & Profit Margin (internal info)
  doc.font(fontReg).fontSize(9).fillColor(lightText);
  doc.text(
    `Estimated Cost: ${formatMoney(totalEstimatedCost)} JOD  |  Profit Margin: ${totalEstimatedCost > 0 ? ((grandTotal / totalEstimatedCost - 1) * 100).toFixed(1) : "0.0"}%`,
    summaryLabelX,
    y,
    { width: contentW },
  );
  y += 20;

  // ── Payment Terms ──
  doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
  y += 10;

  doc.font(fontBold).fontSize(10).fillColor(darkText);
  doc.text("Payment Terms:", 40, y, { width: contentW });
  y += 16;

  const defaultTerms = [
    { percentage: 60, trigger_description: "Upon contract signing" },
    { percentage: 30, trigger_description: "At 70% completion" },
    { percentage: 10, trigger_description: "Upon final handover" },
  ];
  const terms =
    paymentTerms && paymentTerms.length > 0 ? paymentTerms : defaultTerms;

  doc.font(fontReg).fontSize(9).fillColor(darkText);
  for (const term of terms) {
    const amount = (grandTotal * (term.percentage || 0)) / 100;
    const pct = String(term.percentage || 0);
    const desc = displayText(term.trigger_description || "");
    doc.text(
      `${pct}% \u2014 ${desc}: ${formatMoney(amount)} JOD`,
      50,
      y,
      { width: contentW - 20 },
    );
    y += 14;
  }

  y += 10;
  doc.font(fontReg).fontSize(9).fillColor(darkText);
  doc.text(
    `Execution period: ${q.execution_days || 45} working days`,
    40,
    y,
    { width: contentW },
  );
  y += 14;
  doc.text(
    `Quote validity: ${q.validity_days || 30} days`,
    40,
    y,
    { width: contentW },
  );
  y += 30;

  // ── Signatures ──
  doc.moveTo(40, y).lineTo(right, y).lineWidth(0.5).strokeColor(borderColor).stroke();
  y += 14;
  doc.font(fontReg).fontSize(9).fillColor(darkText);
  doc.text("Party 1 signature: _______________", 40, y, { width: contentW / 2 });
  doc.text(
    "Party 2 signature: _______________",
    40 + contentW / 2,
    y,
    { width: contentW / 2, align: "right" },
  );

  // ── Footer on every page ──
  const totalPages = doc.bufferedPageRange();
  for (let i = totalPages.start; i < totalPages.start + totalPages.count; i++) {
    doc.switchToPage(i);
    doc.font(fontReg).fontSize(7).fillColor(lightText);
    doc.text(
      `TWiNS Interior Design \u2014 Ref: ${displayText(q.reference_no) || "N/A"} \u2014 Page ${i + 1} of ${totalPages.count}`,
      40,
      doc.page.height - 28,
      { width: contentW, align: "center" },
    );
  }

  doc.end();
}));

module.exports = router;
