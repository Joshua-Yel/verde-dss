import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from 'pdf-lib';
import { resolveAuthenticatedBusinessId, applyNoStoreHeaders } from '@/src/lib/ariaAccess';
import {
  getKPIsOverview,
  getRevenueSeries,
  getServicesForecastTable,
  getDailyLog,
  getFinancialSummary,
  getInventoryItems,
  getWeekdayPatternsData,
  getExpenseCategoryBreakdownData,
  getInventoryConsumptionSignalData,
} from '@/lib/data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type KpiUnit = 'currency' | 'percent' | 'count';

interface ReportKpiRow {
  metric: string;
  unit: KpiUnit;
  current: number;
  previous: number | null;
  changePct: number | null;
  interpretation: string;
}

interface InventoryItemRow {
  name: string;
  stock: number;
  reorderPoint: number;
  daysOfCover: number;
  status: string;
  supplier?: string;
  reorderQuantity?: number;
}

interface ForecastRow {
  service: string;
  category: string;
  bookings: number;
  mape: string;
  forecastMethod: string;
  forecasts: string;
}

interface ExpenseBreakdownRow {
  category: string;
  total: number;
  latestAmount: number;
}

interface StaffingPatternRow {
  day: string;
  revenue: number;
  sessions: number;
  demandLevel?: string;
  recommendedStaff?: number;
}

interface ReportPayload {
  reportTitle: string;
  generatedAt: string;
  pathname: string;
  forecastMethodUsed: string;
  executiveSummary: string;
  kpis: ReportKpiRow[];
  forecastRows: ForecastRow[];
  inventoryItems: InventoryItemRow[];
  expenseBreakdown: ExpenseBreakdownRow[];
  weekdayPatterns: StaffingPatternRow[];
  periodLabels: string[];
  revenueSeries: number[];
  expenseSeries: number[];
  netIncomeSeries: number[];
  dailyLog: Array<Record<string, unknown>>;
  inventorySignal: unknown[];
}

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------

function inferReportTitle(pathname: string): string {
  if (pathname.includes('/financials')) return 'Financial Performance Report';
  if (pathname.includes('/inventory')) return 'Inventory Management Report';
  if (pathname.includes('/service-demand')) return 'Service Demand Forecast Report';
  if (pathname.includes('/staffing')) return 'Staffing & Capacity Report';
  if (pathname.includes('/overview')) return 'Business Overview Report';
  return 'Comprehensive Business Report';
}

function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatCurrency(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);
  return `₱${numericValue.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | null | undefined): string {
  const numericValue = Number(value ?? 0);
  return `${Number.isFinite(numericValue) ? numericValue.toFixed(1) : '0.0'}%`;
}

function formatKpiValue(unit: KpiUnit, value: number | null): string {
  if (value === null) return '—';
  if (unit === 'currency') return formatCurrency(value);
  if (unit === 'percent') return formatPercent(value);
  return value.toLocaleString('en-PH', { maximumFractionDigits: 0 });
}

function sanitizeFileName(value: string): string {
  const sanitized = value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
  return sanitized || 'report';
}

// ---------------------------------------------------------------------------
// PDF generation — pdf-lib
//
// Replaces the previous hand-rolled PDF byte-string builder (manual xref
// offsets, single fixed page, no tables/color/wrapping). This version
// produces a real multi-page document: a branded header band, a KPI card
// grid, bordered/striped tables that paginate automatically and repeat
// their header row on the next page, status-colored inventory rows, and
// footer page numbers.
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR = {
  brand: rgb(0x4a / 255, 0x5f / 255, 0x4a / 255), // matches Topbar's #4A5F4A
  brandLight: rgb(0xe9 / 255, 0xed / 255, 0xe9 / 255),
  text: rgb(0.15, 0.15, 0.15),
  muted: rgb(0.45, 0.45, 0.45),
  border: rgb(0.85, 0.85, 0.85),
  white: rgb(1, 1, 1),
  alertRed: rgb(0.72, 0.13, 0.13),
  alertRedBg: rgb(0.98, 0.92, 0.92),
  warnAmber: rgb(0.62, 0.45, 0.06),
  okGreen: rgb(0.16, 0.45, 0.25),
};

// pdf-lib's standard fonts (Helvetica, HelveticaBold) only support the
// WinAnsi/CP-1252 character set. The peso sign ₱ (U+20B1) is NOT in that
// set, so calling widthOfTextAtSize() or drawText() with it throws —
// silently killing the whole PDF export the moment it hits any currency
// value (KPI cards, tables, executive summary all use formatCurrency()).
// Excel/exceljs has no such restriction, which is why only the PDF path
// failed. Swapping in "PHP " here, applied inside wrapTextLines and
// truncateToWidth, sanitizes every text path through the builder
// automatically regardless of which function produced the string —
// embedding a custom Unicode font would be the alternative if the ₱ glyph
// itself is required in the PDF output.
function pdfSafeText(value: string): string {
  return value.replace(/₱/g, 'PHP ');
}

function wrapTextLines(font: PDFFont, rawText: string, size: number, maxWidth: number): string[] {
  const text = pdfSafeText(rawText);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

function truncateToWidth(font: PDFFont, rawText: string, size: number, maxWidth: number): string {
  const text = pdfSafeText(rawText);
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = '…';
  let result = text;
  while (result.length > 0 && font.widthOfTextAtSize(result + ellipsis, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + ellipsis;
}

interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

class PdfReportBuilder {
  private doc!: PDFDocument;
  private font!: PDFFont;
  private boldFont!: PDFFont;
  private page!: PDFPage;
  private cursorY = 0;

  static async create(): Promise<PdfReportBuilder> {
    const builder = new PdfReportBuilder();
    builder.doc = await PDFDocument.create();
    builder.font = await builder.doc.embedFont(StandardFonts.Helvetica);
    builder.boldFont = await builder.doc.embedFont(StandardFonts.HelveticaBold);
    builder.newPage();
    return builder;
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.cursorY = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(height: number) {
    if (this.cursorY - height < MARGIN + 24) {
      this.newPage();
    }
  }

  drawHeaderBand(reportTitle: string, generatedAt: string, pathname: string) {
    const bandHeight = 72;
    this.page.drawRectangle({
      x: 0,
      y: PAGE_HEIGHT - bandHeight,
      width: PAGE_WIDTH,
      height: bandHeight,
      color: COLOR.brand,
    });
    this.page.drawText('VERDE', {
      x: MARGIN,
      y: PAGE_HEIGHT - 32,
      size: 20,
      font: this.boldFont,
      color: COLOR.white,
    });
    this.page.drawText('AI-assisted Forecasting', {
      x: MARGIN,
      y: PAGE_HEIGHT - 47,
      size: 8,
      font: this.font,
      color: rgb(0.85, 0.9, 0.85),
    });
    const rightText = pdfSafeText(reportTitle);
    const rightWidth = this.boldFont.widthOfTextAtSize(rightText, 13);
    this.page.drawText(rightText, {
      x: PAGE_WIDTH - MARGIN - rightWidth,
      y: PAGE_HEIGHT - 32,
      size: 13,
      font: this.boldFont,
      color: COLOR.white,
    });
    const metaText = pdfSafeText(`Generated ${generatedAt}  ·  ${pathname}`);
    const metaWidth = this.font.widthOfTextAtSize(metaText, 8);
    this.page.drawText(metaText, {
      x: PAGE_WIDTH - MARGIN - metaWidth,
      y: PAGE_HEIGHT - 47,
      size: 8,
      font: this.font,
      color: rgb(0.85, 0.9, 0.85),
    });
    this.cursorY = PAGE_HEIGHT - bandHeight - 28;
  }

  drawSectionTitle(text: string) {
    this.ensureSpace(28);
    this.page.drawText(text.toUpperCase(), {
      x: MARGIN,
      y: this.cursorY,
      size: 11,
      font: this.boldFont,
      color: COLOR.brand,
    });
    this.cursorY -= 6;
    this.page.drawLine({
      start: { x: MARGIN, y: this.cursorY },
      end: { x: PAGE_WIDTH - MARGIN, y: this.cursorY },
      thickness: 1,
      color: COLOR.brandLight,
    });
    this.cursorY -= 14;
  }

  drawParagraph(text: string, options?: { size?: number; color?: RGB; lineHeight?: number }) {
    const size = options?.size ?? 9.5;
    const color = options?.color ?? COLOR.text;
    const lineHeight = options?.lineHeight ?? 13.5;
    const lines = wrapTextLines(this.font, text, size, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.page.drawText(line, { x: MARGIN, y: this.cursorY, size, font: this.font, color });
      this.cursorY -= lineHeight;
    }
    this.cursorY -= 4;
  }

  drawBulletList(items: string[], options?: { size?: number; lineHeight?: number }) {
    const size = options?.size ?? 9;
    const lineHeight = options?.lineHeight ?? 13;
    const bulletIndent = 12;
    for (const item of items) {
      const lines = wrapTextLines(this.font, item, size, CONTENT_WIDTH - bulletIndent);
      lines.forEach((line, idx) => {
        this.ensureSpace(lineHeight);
        if (idx === 0) {
          this.page.drawText('•', { x: MARGIN, y: this.cursorY, size, font: this.boldFont, color: COLOR.brand });
        }
        this.page.drawText(line, { x: MARGIN + bulletIndent, y: this.cursorY, size, font: this.font, color: COLOR.text });
        this.cursorY -= lineHeight;
      });
    }
    this.cursorY -= 4;
  }

  drawSpacer(height: number) {
    this.cursorY -= height;
  }

  /** Grid of KPI cards, e.g. 2 columns x N rows, each with a label/value/subline. */
  drawKpiGrid(cards: Array<{ label: string; value: string; sub: string; alert?: boolean }>, columns = 2) {
    const gap = 10;
    const cardWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    const cardHeight = 52;

    for (let i = 0; i < cards.length; i += columns) {
      this.ensureSpace(cardHeight + gap);
      const rowCards = cards.slice(i, i + columns);
      rowCards.forEach((card, col) => {
        const x = MARGIN + col * (cardWidth + gap);
        const y = this.cursorY - cardHeight;
        this.page.drawRectangle({
          x,
          y,
          width: cardWidth,
          height: cardHeight,
          borderColor: COLOR.border,
          borderWidth: 1,
          color: card.alert ? COLOR.alertRedBg : COLOR.white,
        });
        this.page.drawText(truncateToWidth(this.boldFont, card.label.toUpperCase(), 7.5, cardWidth - 16), {
          x: x + 8,
          y: y + cardHeight - 16,
          size: 7.5,
          font: this.boldFont,
          color: COLOR.muted,
        });
        this.page.drawText(truncateToWidth(this.boldFont, card.value, 13, cardWidth - 16), {
          x: x + 8,
          y: y + cardHeight - 32,
          size: 13,
          font: this.boldFont,
          color: card.alert ? COLOR.alertRed : COLOR.text,
        });
        this.page.drawText(truncateToWidth(this.font, card.sub, 7, cardWidth - 16), {
          x: x + 8,
          y: y + 8,
          size: 7,
          font: this.font,
          color: COLOR.muted,
        });
      });
      this.cursorY -= cardHeight + gap;
    }
    this.cursorY -= 4;
  }

  /**
   * Bordered, striped, auto-paginating table. If a row won't fit on the
   * current page, a new page is started and the header row is redrawn.
   */
  drawTable(
    columns: TableColumn[],
    rows: string[][],
    options?: {
      rowHeight?: number;
      rowFill?: (rowIndex: number, row: string[]) => RGB | null;
      cellTextColor?: (rowIndex: number, colIndex: number, row: string[]) => RGB;
    }
  ) {
    const rowHeight = options?.rowHeight ?? 18;
    const headerHeight = 20;

    const drawHeader = () => {
      this.ensureSpace(headerHeight);
      this.page.drawRectangle({
        x: MARGIN,
        y: this.cursorY - headerHeight,
        width: CONTENT_WIDTH,
        height: headerHeight,
        color: COLOR.brand,
      });
      let x = MARGIN;
      for (const col of columns) {
        const textWidth = this.boldFont.widthOfTextAtSize(col.header, 8);
        const textX = col.align === 'right' ? x + col.width - textWidth - 8 : x + 6;
        this.page.drawText(col.header, {
          x: textX,
          y: this.cursorY - headerHeight + 6,
          size: 8,
          font: this.boldFont,
          color: COLOR.white,
        });
        x += col.width;
      }
      this.cursorY -= headerHeight;
    };

    drawHeader();

    if (rows.length === 0) {
      this.ensureSpace(rowHeight);
      this.page.drawText('No data available for this section.', {
        x: MARGIN + 6,
        y: this.cursorY - rowHeight + 5,
        size: 8.5,
        font: this.font,
        color: COLOR.muted,
      });
      this.cursorY -= rowHeight;
      this.cursorY -= 10;
      return;
    }

    rows.forEach((row, rowIndex) => {
      if (this.cursorY - rowHeight < MARGIN + 24) {
        this.newPage();
        drawHeader();
      }

      const fill = options?.rowFill?.(rowIndex, row) ?? (rowIndex % 2 === 1 ? COLOR.brandLight : COLOR.white);
      this.page.drawRectangle({
        x: MARGIN,
        y: this.cursorY - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: fill,
        borderColor: COLOR.border,
        borderWidth: 0.5,
      });

      let x = MARGIN;
      columns.forEach((col, colIndex) => {
        const cellText = truncateToWidth(this.font, row[colIndex] ?? '', 8.5, col.width - 12);
        const textWidth = this.font.widthOfTextAtSize(cellText, 8.5);
        const textX = col.align === 'right' ? x + col.width - textWidth - 8 : x + 6;
        this.page.drawText(cellText, {
          x: textX,
          y: this.cursorY - rowHeight + 6,
          size: 8.5,
          font: this.font,
          color: options?.cellTextColor?.(rowIndex, colIndex, row) ?? COLOR.text,
        });
        x += col.width;
      });

      this.cursorY -= rowHeight;
    });

    this.cursorY -= 10;
  }

  /** Draws "Page X of N" + brand footer on every page. Call once, last. */
  finalizeFooters() {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      const label = `Page ${index + 1} of ${pages.length}`;
      const labelWidth = this.font.widthOfTextAtSize(label, 8);
      page.drawText(label, {
        x: PAGE_WIDTH - MARGIN - labelWidth,
        y: MARGIN - 20,
        size: 8,
        font: this.font,
        color: COLOR.muted,
      });
      page.drawText('VERDE Decision Support System', {
        x: MARGIN,
        y: MARGIN - 20,
        size: 8,
        font: this.font,
        color: COLOR.muted,
      });
    });
  }

  async save(): Promise<Uint8Array> {
    this.finalizeFooters();
    return this.doc.save();
  }
}

async function buildPdfDocument(payload: ReportPayload): Promise<Uint8Array> {
  const builder = await PdfReportBuilder.create();
  builder.drawHeaderBand(payload.reportTitle, payload.generatedAt, payload.pathname);

  builder.drawSectionTitle('Executive Summary');
  builder.drawParagraph(payload.executiveSummary);
  builder.drawSpacer(6);

  builder.drawSectionTitle('Key Performance Indicators');
  builder.drawKpiGrid(
    payload.kpis.map((row) => ({
      label: row.metric,
      value: formatKpiValue(row.unit, row.current),
      sub:
        row.previous !== null
          ? `Prev: ${formatKpiValue(row.unit, row.previous)}${row.changePct !== null ? `  (${row.changePct >= 0 ? '+' : ''}${row.changePct.toFixed(1)}%)` : ''}`
          : row.interpretation,
      alert: row.metric === 'Urgent Inventory Items' && row.current > 0,
    })),
    2
  );
  builder.drawSpacer(8);

  builder.drawSectionTitle('Service Demand Forecast');
  builder.drawTable(
    [
      { header: 'SERVICE', width: 150 },
      { header: 'CATEGORY', width: 100 },
      { header: 'BOOKINGS', width: 62, align: 'right' },
      { header: 'MAPE', width: 52, align: 'right' },
      { header: 'METHOD', width: 90 },
      { header: 'NEXT-PERIOD FORECAST', width: CONTENT_WIDTH - 150 - 100 - 62 - 52 - 90 },
    ],
    payload.forecastRows
      .slice(0, 20)
      .map((row) => [row.service, row.category, String(row.bookings), row.mape, row.forecastMethod, row.forecasts])
  );

  builder.drawSectionTitle('Inventory Status');
  const statusColor = (status: string): RGB => {
    if (status === 'Critical') return COLOR.alertRed;
    if (status === 'Low') return COLOR.warnAmber;
    return COLOR.okGreen;
  };
  builder.drawTable(
    [
      { header: 'ITEM', width: 140 },
      { header: 'SUPPLIER', width: 110 },
      { header: 'STOCK', width: 55, align: 'right' },
      { header: 'REORDER PT', width: 65, align: 'right' },
      { header: 'DAYS COVER', width: 68, align: 'right' },
      { header: 'STATUS', width: CONTENT_WIDTH - 140 - 110 - 55 - 65 - 68 },
    ],
    payload.inventoryItems
      .slice(0, 30)
      .map((item) => [
        item.name,
        item.supplier ?? '—',
        String(item.stock),
        String(item.reorderPoint),
        Number.isFinite(item.daysOfCover) ? String(Math.round(item.daysOfCover)) : '—',
        item.status,
      ]),
    {
      rowFill: (_i, row) => (row[5] === 'Critical' ? COLOR.alertRedBg : null),
      cellTextColor: (_i, colIndex, row) => (colIndex === 5 ? statusColor(row[5]) : COLOR.text),
    }
  );

  builder.drawSectionTitle('Expense Breakdown');
  builder.drawTable(
    [
      { header: 'CATEGORY', width: 220 },
      { header: 'TOTAL', width: (CONTENT_WIDTH - 220) / 2, align: 'right' },
      { header: 'LATEST AMOUNT', width: (CONTENT_WIDTH - 220) / 2, align: 'right' },
    ],
    payload.expenseBreakdown.map((item) => [item.category, formatCurrency(item.total), formatCurrency(item.latestAmount)])
  );

  builder.drawSectionTitle('Staffing Recommendations');
  builder.drawTable(
    [
      { header: 'DAY', width: 110 },
      { header: 'REVENUE', width: 110, align: 'right' },
      { header: 'SESSIONS', width: 80, align: 'right' },
      { header: 'DEMAND', width: 90 },
      { header: 'RECOMMENDED STAFF', width: CONTENT_WIDTH - 110 - 110 - 80 - 90, align: 'right' },
    ],
    payload.weekdayPatterns.map((row) => [
      row.day,
      formatCurrency(row.revenue),
      String(row.sessions),
      row.demandLevel ?? '—',
      row.recommendedStaff !== undefined ? String(row.recommendedStaff) : '—',
    ])
  );

  builder.drawSectionTitle('Methodology & Limitations');
  builder.drawBulletList([
    `Forecast method: ${payload.forecastMethodUsed}.`,
    'All figures are derived from the current business data and refreshed at export time.',
    'Inventory reorder signals are limited by the available data points and may need review when supplier lead times are missing.',
  ]);

  return builder.save();
}

// ---------------------------------------------------------------------------
// Excel generation — exceljs
//
// Replaces the previous plain `xlsx` (SheetJS community edition) sheets,
// which can't apply any styling. This version adds a colored header band,
// bold white header rows, currency/percent number formats (so figures stay
// as real numbers Excel can sum/chart, not pre-formatted strings), a frozen
// header row + autofilter per sheet, conditional red fill on critical
// inventory rows, and auto-sized columns.
// ---------------------------------------------------------------------------

const BRAND_ARGB = 'FF4A5F4A';
const ALERT_ARGB = 'FFF6DEDE';
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } } as const;
const CURRENCY_FMT = '"₱"#,##0';

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB } };
    cell.alignment = { vertical: 'middle' };
  });
  row.height = 20;
}

function autoSizeColumns(sheet: ExcelJS.Worksheet, minWidth = 10, maxWidth = 42) {
  sheet.columns.forEach((column) => {
    let maxLen = minWidth;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(maxLen + 2, maxWidth);
  });
}

function addBannerTitle(sheet: ExcelJS.Worksheet, title: string, subtitleLines: string[], spanCols: number) {
  sheet.mergeCells(1, 1, 1, spanCols);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB } };
  titleCell.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 26;

  subtitleLines.forEach((line, i) => {
    const rowIndex = i + 2;
    sheet.mergeCells(rowIndex, 1, rowIndex, spanCols);
    const cell = sheet.getCell(rowIndex, 1);
    cell.value = line;
    cell.font = { italic: true, color: { argb: 'FF666666' }, size: 9 };
  });
}

async function buildWorkbook(payload: ReportPayload): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VERDE Decision Support System';
  workbook.created = new Date();

  // --- Summary sheet ---------------------------------------------------
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 24 }, { width: 60 }];
  addBannerTitle(summary, payload.reportTitle, [`Generated ${payload.generatedAt}  ·  ${payload.pathname}`], 2);
  summary.addRow([]);
  const summaryFields: Array<[string, string]> = [
    ['Forecast Method', payload.forecastMethodUsed],
    ['Report Period', payload.periodLabels.length > 0 ? `${payload.periodLabels[0]} – ${payload.periodLabels[payload.periodLabels.length - 1]}` : 'No data'],
  ];
  for (const [label, value] of summaryFields) {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
  summary.addRow([]);
  const execHeaderRow = summary.addRow(['Executive Summary']);
  execHeaderRow.getCell(1).font = { bold: true, size: 11, color: { argb: BRAND_ARGB } };
  const execRow = summary.addRow([payload.executiveSummary]);
  summary.mergeCells(execRow.number, 1, execRow.number, 2);
  execRow.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  summary.getRow(execRow.number).height = 60;

  // --- KPIs sheet --------------------------------------------------------
  const kpiSheet = workbook.addWorksheet('KPIs');
  const kpiHeader = kpiSheet.addRow(['Metric', 'Current', 'Previous', 'Change %', 'Interpretation']);
  styleHeaderRow(kpiHeader);
  for (const row of payload.kpis) {
    const excelRow = kpiSheet.addRow([
      row.metric,
      row.current,
      row.previous,
      row.changePct !== null ? row.changePct / 100 : null,
      row.interpretation,
    ]);
    const fmt = row.unit === 'currency' ? CURRENCY_FMT : row.unit === 'percent' ? '0.0"%"' : '#,##0';
    excelRow.getCell(2).numFmt = fmt;
    if (row.previous !== null) excelRow.getCell(3).numFmt = fmt;
    if (row.changePct !== null) {
      excelRow.getCell(4).numFmt = '+0.0%;-0.0%';
      excelRow.getCell(4).font = { color: { argb: row.changePct >= 0 ? 'FF1E7A3F' : 'FFB81E1E' } };
    }
  }
  kpiSheet.views = [{ state: 'frozen', ySplit: 1 }];
  kpiSheet.autoFilter = { from: 'A1', to: 'E1' };
  autoSizeColumns(kpiSheet);

  // --- Historical Data sheet ----------------------------------------------
  const historySheet = workbook.addWorksheet('Historical Data');
  const historyHeader = historySheet.addRow(['Period', 'Revenue', 'Expenses', 'Net Income']);
  styleHeaderRow(historyHeader);
  payload.periodLabels.forEach((label, index) => {
    const row = historySheet.addRow([
      label,
      payload.revenueSeries[index] ?? 0,
      payload.expenseSeries[index] ?? 0,
      payload.netIncomeSeries[index] ?? 0,
    ]);
    [2, 3, 4].forEach((col) => (row.getCell(col).numFmt = CURRENCY_FMT));
    if ((payload.netIncomeSeries[index] ?? 0) < 0) {
      row.getCell(4).font = { color: { argb: 'FFB81E1E' } };
    }
  });
  historySheet.views = [{ state: 'frozen', ySplit: 1 }];
  historySheet.autoFilter = { from: 'A1', to: 'D1' };
  autoSizeColumns(historySheet);

  // --- Forecasts sheet -----------------------------------------------------
  const forecastSheet = workbook.addWorksheet('Forecasts');
  const forecastHeader = forecastSheet.addRow(['Service', 'Category', 'Bookings', 'MAPE', 'Forecast Method', 'Forecast Values']);
  styleHeaderRow(forecastHeader);
  for (const row of payload.forecastRows) {
    forecastSheet.addRow([row.service, row.category, row.bookings, row.mape, row.forecastMethod, row.forecasts]);
  }
  forecastSheet.views = [{ state: 'frozen', ySplit: 1 }];
  forecastSheet.autoFilter = { from: 'A1', to: 'F1' };
  autoSizeColumns(forecastSheet);

  // --- Inventory sheet -------------------------------------------------------
  const inventorySheet = workbook.addWorksheet('Inventory');
  const inventoryHeader = inventorySheet.addRow(['Item', 'Stock', 'Reorder Point', 'Days of Cover', 'Status', 'Supplier', 'Reorder Quantity']);
  styleHeaderRow(inventoryHeader);
  for (const item of payload.inventoryItems) {
    const row = inventorySheet.addRow([
      item.name,
      item.stock,
      item.reorderPoint,
      Number.isFinite(item.daysOfCover) ? item.daysOfCover : null,
      item.status,
      item.supplier ?? '',
      item.reorderQuantity ?? 0,
    ]);
    if (item.status === 'Critical') {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALERT_ARGB } };
      });
      row.getCell(5).font = { bold: true, color: { argb: 'FFB81E1E' } };
    } else if (item.status === 'Low') {
      row.getCell(5).font = { bold: true, color: { argb: 'FF9E6B0A' } };
    }
  }
  inventorySheet.views = [{ state: 'frozen', ySplit: 1 }];
  inventorySheet.autoFilter = { from: 'A1', to: 'G1' };
  autoSizeColumns(inventorySheet);

  // --- Financials sheet --------------------------------------------------
  const financialSheet = workbook.addWorksheet('Financials');
  const financialHeader = financialSheet.addRow(['Category', 'Total', 'Latest Amount']);
  styleHeaderRow(financialHeader);
  for (const item of payload.expenseBreakdown) {
    const row = financialSheet.addRow([item.category, item.total, item.latestAmount]);
    row.getCell(2).numFmt = CURRENCY_FMT;
    row.getCell(3).numFmt = CURRENCY_FMT;
  }
  financialSheet.views = [{ state: 'frozen', ySplit: 1 }];
  financialSheet.autoFilter = { from: 'A1', to: 'C1' };
  autoSizeColumns(financialSheet);

  // --- Staffing sheet ------------------------------------------------------
  const staffingSheet = workbook.addWorksheet('Staffing');
  const staffingHeader = staffingSheet.addRow(['Day', 'Revenue', 'Sessions', 'Demand Level', 'Recommended Staff']);
  styleHeaderRow(staffingHeader);
  for (const row of payload.weekdayPatterns) {
    const excelRow = staffingSheet.addRow([row.day, row.revenue, row.sessions, row.demandLevel ?? '', row.recommendedStaff ?? 0]);
    excelRow.getCell(2).numFmt = CURRENCY_FMT;
  }
  staffingSheet.views = [{ state: 'frozen', ySplit: 1 }];
  staffingSheet.autoFilter = { from: 'A1', to: 'E1' };
  autoSizeColumns(staffingSheet);

  // --- Daily Log sheet (replaces the old near-empty "Raw Data" sheet) ------
  if (payload.dailyLog.length > 0) {
    const logSheet = workbook.addWorksheet('Daily Log');
    const sampleKeys = Object.keys(payload.dailyLog[0]);
    const headerRow = logSheet.addRow(sampleKeys.map((key) => key.charAt(0).toUpperCase() + key.slice(1)));
    styleHeaderRow(headerRow);
    for (const entry of payload.dailyLog) {
      logSheet.addRow(sampleKeys.map((key) => entry[key] as string | number | null));
    }
    logSheet.views = [{ state: 'frozen', ySplit: 1 }];
    logSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sampleKeys.length } };
    autoSizeColumns(logSheet);
  }

  return workbook;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { businessId, userId } = await resolveAuthenticatedBusinessId();
    if (!businessId || !userId) {
      return applyNoStoreHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }

    const { searchParams } = new URL(req.url);
    const requestedFormat = (searchParams.get('format') || 'pdf').toLowerCase();
    const format = requestedFormat === 'excel' ? 'excel' : 'pdf';
    const pathname = searchParams.get('path') || '/overview';
    const reportTitle = searchParams.get('title') || inferReportTitle(pathname);
    const generatedAt = new Date().toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    // These independently call getSupabaseDashboardData({businessId}), but
    // that function is wrapped in React's cache() (see lib/data/supabase.ts),
    // so within this single request they collapse into ONE underlying
    // Supabase fetch sequence rather than nine.
    const reportData = await Promise.all([
      getKPIsOverview({ businessId }),
      getRevenueSeries({ businessId }),
      getServicesForecastTable({ businessId }),
      getDailyLog({ businessId }),
      getFinancialSummary({ businessId }),
      getInventoryItems({ businessId }),
      getWeekdayPatternsData({ businessId }),
      getExpenseCategoryBreakdownData({ businessId }),
      getInventoryConsumptionSignalData({ businessId }),
    ]);

    const [
      kpis,
      revenueSeries,
      serviceForecasts,
      dailyLog,
      financialSummary,
      inventoryItems,
      weekdayPatterns,
      expenseBreakdown,
      inventorySignal,
    ] = reportData;

    const normalizedRevenueSeries = Array.isArray(revenueSeries) ? revenueSeries : [];
    const normalizedServiceForecasts = Array.isArray(serviceForecasts) ? serviceForecasts : [];
    const normalizedInventoryItems = Array.isArray(inventoryItems) ? inventoryItems : [];
    const normalizedWeekdayPatterns = Array.isArray(weekdayPatterns) ? weekdayPatterns : [];
    const normalizedExpenseBreakdown = Array.isArray(expenseBreakdown) ? expenseBreakdown : [];
    const normalizedDailyLog = Array.isArray(dailyLog) ? (dailyLog as Array<Record<string, unknown>>) : [];

    const periodLabels = (financialSummary.periodLabels ?? []).length > 0
      ? financialSummary.periodLabels
      : normalizedRevenueSeries.map((_: number, index: number) => `P${index + 1}`);

    const latestRevenue = normalizedRevenueSeries[normalizedRevenueSeries.length - 1] ?? 0;
    const previousRevenue = normalizedRevenueSeries[normalizedRevenueSeries.length - 2] ?? latestRevenue;
    const revenueChange = previousRevenue > 0 ? ((latestRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const expenseSeries = Array.isArray(financialSummary.expenseSeries) ? financialSummary.expenseSeries : [];
    const latestExpense = expenseSeries[expenseSeries.length - 1] ?? 0;
    const previousExpense = expenseSeries[expenseSeries.length - 2] ?? latestExpense;
    const expenseChange = previousExpense > 0 ? ((latestExpense - previousExpense) / previousExpense) * 100 : 0;
    const avgMape = normalizedServiceForecasts.length > 0
      ? normalizedServiceForecasts.reduce((sum, item) => sum + Number(String(item.mape ?? '0').replace('%', '')), 0) / normalizedServiceForecasts.length
      : 0;
    const urgentInventoryCount = normalizedInventoryItems.filter((item) => item.status === 'Critical').length;

    const kpiRows: ReportKpiRow[] = [
      {
        metric: 'Projected Revenue',
        unit: 'currency',
        current: Number(kpis.projectedRevenue ?? 0),
        previous: previousRevenue,
        changePct: Number(kpis.projectedPct ?? 0),
        interpretation: 'Forecasted revenue for the next period based on the active model.',
      },
      {
        metric: 'Revenue Change',
        unit: 'currency',
        current: latestRevenue,
        previous: previousRevenue,
        changePct: revenueChange,
        interpretation: 'Shows whether recent revenue performance is improving or weakening.',
      },
      {
        metric: 'Expense Change',
        unit: 'currency',
        current: latestExpense,
        previous: previousExpense,
        changePct: expenseChange,
        interpretation: 'Tracks whether operating costs are rising faster than revenue.',
      },
      {
        metric: 'Urgent Inventory Items',
        unit: 'count',
        current: urgentInventoryCount,
        previous: null,
        changePct: null,
        interpretation: 'Highlights stock positions that need immediate management attention.',
      },
      {
        metric: 'Average Forecast Error',
        unit: 'percent',
        current: avgMape,
        previous: null,
        changePct: null,
        interpretation: 'Indicates how far forecasts are expected to deviate from realized outcomes.',
      },
    ];

    const forecastRows: ForecastRow[] = normalizedServiceForecasts.map((service) => ({
      service: sanitizeText(service.service),
      category: sanitizeText(service.category),
      bookings: Number(service.bookings ?? 0),
      mape: sanitizeText(service.mape ?? '0%'),
      forecastMethod: sanitizeText(service.forecastMethodUsed ?? financialSummary.forecastMethodUsed ?? 'WMA'),
      forecasts: Array.isArray(service.forecasts) ? service.forecasts.join(' | ') : sanitizeText(service.forecasts ?? ''),
    }));

    const inventoryRows: InventoryItemRow[] = normalizedInventoryItems.map((item) => ({
      name: sanitizeText(item.name),
      stock: Number(item.stock ?? 0),
      reorderPoint: Number(item.reorderPoint ?? 0),
      daysOfCover: Number(item.daysOfCover ?? 0),
      status: sanitizeText(item.status),
      supplier: sanitizeText(item.supplier),
      reorderQuantity: Number(item.reorderQuantity ?? 0),
    }));

    const expenseBreakdownRows: ExpenseBreakdownRow[] = normalizedExpenseBreakdown.map((item) => ({
      category: sanitizeText(item.category),
      total: Number(item.total ?? 0),
      latestAmount: Number(item.latestAmount ?? item.total ?? 0),
    }));

    const staffingRows: StaffingPatternRow[] = (normalizedWeekdayPatterns as Array<Record<string, unknown>>).map((row) => ({
      day: sanitizeText(row.day),
      revenue: Number(row.revenue ?? 0),
      sessions: Number(row.sessions ?? 0),
      demandLevel: sanitizeText(row.demandLevel ?? ''),
      recommendedStaff: Number(row.recommendedStaff ?? 0),
    }));

    const executiveSummary = [
      `${reportTitle} summarizes the current business performance for the active dashboard period.`,
      `Revenue is projected at ${formatCurrency(kpis.projectedRevenue ?? 0)} for the next period, with a ${formatPercent(kpis.projectedPct ?? 0)} change from the latest available trend.`,
      `The most active service is ${forecastRows[0]?.service ?? 'N/A'} and ${urgentInventoryCount} inventory items currently require urgent attention.`,
      `The busiest operating day is ${staffingRows[0]?.day ?? 'N/A'} and the current forecasting method is ${financialSummary.forecastMethodUsed ?? 'WMA'}.`,
      `Expense concentration is led by ${expenseBreakdownRows[0]?.category ?? 'N/A'} at ${formatCurrency(expenseBreakdownRows[0]?.total ?? 0)}, which should be monitored closely for margin pressure.`,
    ].join(' ');

    const payload: ReportPayload = {
      reportTitle,
      generatedAt,
      pathname,
      forecastMethodUsed: financialSummary.forecastMethodUsed ?? 'WMA',
      executiveSummary,
      kpis: kpiRows,
      forecastRows,
      inventoryItems: inventoryRows,
      expenseBreakdown: expenseBreakdownRows,
      weekdayPatterns: staffingRows,
      periodLabels,
      revenueSeries: normalizedRevenueSeries,
      expenseSeries: financialSummary.expenseSeries ?? [],
      netIncomeSeries: financialSummary.netIncomeSeries ?? [],
      dailyLog: normalizedDailyLog,
      inventorySignal: inventorySignal ?? [],
    };

    if (format === 'excel') {
      const workbook = await buildWorkbook(payload);
      const buffer = await workbook.xlsx.writeBuffer();
      const response = new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${sanitizeFileName(reportTitle)}.xlsx"`,
        },
      });
      return applyNoStoreHeaders(response);
    }

    const pdfBytes = await buildPdfDocument(payload);
    const response = new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizeFileName(reportTitle)}.pdf"`,
      },
    });

    return applyNoStoreHeaders(response);
  } catch (error) {
    console.error('Report export failed', error);
    return applyNoStoreHeaders(NextResponse.json({ error: 'Report export failed' }, { status: 500 }));
  }
}