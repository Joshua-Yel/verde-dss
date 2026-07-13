import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { resolveAuthenticatedBusinessId, applyNoStoreHeaders } from '@/src/lib/ariaAccess';
import {
  getKPIsOverview,
  getRevenueSeries,
  getServicesForecastTable,
  getRestockList,
  getDailyLog,
  getFinancialSummary,
  getInventoryItems,
  getWeekdayPatternsData,
  getServiceByWeekdayData,
  getExpenseCategoryBreakdownData,
  getInventoryConsumptionSignalData,
} from '@/lib/data';

interface ReportKpiRow {
  metric: string;
  current: number | string | null;
  previous: number | string | null;
  change: number | string | null;
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
  mape: string | number;
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
  dailyLog: unknown[];
  inventorySignal: unknown[];
}

interface PdfSection {
  title: string;
  body: string[];
}

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

function formatCurrency(value: number | string | null | undefined): string {
  const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
  return `₱${numericValue.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number | string | null | undefined): string {
  const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
  return `${Number.isFinite(numericValue) ? numericValue.toFixed(1) : '0.0'}%`;
}

function sanitizeFileName(value: string): string {
  const sanitized = value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
  return sanitized || 'report';
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/₱/g, 'PHP');
}

function wrapText(value: string, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines;
}

function createPdfSections(payload: ReportPayload): PdfSection[] {
  const urgentInventory = payload.inventoryItems.filter((item) => item.stock <= item.reorderPoint).slice(0, 8);
  const topExpense = payload.expenseBreakdown.slice(0, 6);
  const topForecast = payload.forecastRows.slice(0, 6);

  return [
    {
      title: 'Executive Summary',
      body: [payload.executiveSummary],
    },
    {
      title: 'Key Performance Indicators',
      body: payload.kpis.map((row) => {
        const currentValue = sanitizeText(row.current);
        const previousValue = sanitizeText(row.previous);
        const changeValue = row.change === null || row.change === undefined ? '' : ` | Change: ${formatPercent(row.change)}`;
        return `${row.metric}: ${currentValue}${previousValue ? ` (previous: ${previousValue})` : ''}${changeValue} — ${row.interpretation}`;
      }),
    },
    {
      title: 'Forecast Analysis',
      body: topForecast.map((row) => `${row.service} (${row.category}) — bookings: ${row.bookings}; MAPE: ${row.mape}; forecast method: ${row.forecastMethod}; values: ${row.forecasts}`),
    },
    {
      title: 'Inventory Analysis',
      body: urgentInventory.length > 0
        ? urgentInventory.map((item) => `${item.name}: stock ${item.stock}, reorder point ${item.reorderPoint}, status ${item.status}`)
        : ['No urgent inventory items were identified.'],
    },
    {
      title: 'Financial Overview',
      body: topExpense.map((item) => `${item.category}: ${formatCurrency(item.total)} (latest: ${formatCurrency(item.latestAmount)})`),
    },
    {
      title: 'Staffing Recommendations',
      body: payload.weekdayPatterns.map((row) => `${row.day}: revenue ${formatCurrency(row.revenue)}, sessions ${row.sessions}, demand ${row.demandLevel}, recommended staff ${row.recommendedStaff}`),
    },
    {
      title: 'Methodology & Limitations',
      body: [
        `Forecast method: ${payload.forecastMethodUsed}.`,
        'All figures are derived from the current business data and refreshed at export time.',
        'Inventory reorder signals are limited by the available data points and may need review when supplier lead times are missing.',
      ],
    },
  ];
}

function buildPdfDocument(payload: ReportPayload): Buffer {
  const sections = createPdfSections(payload);
  const lines: string[] = [];
  lines.push('VERDE Decision Support System');
  lines.push(payload.reportTitle);
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push(`Path: ${payload.pathname}`);
  lines.push('');

  for (const section of sections) {
    lines.push(section.title.toUpperCase());
    lines.push(''.padEnd(section.title.length, '-'));
    for (const paragraph of section.body) {
      for (const wrappedLine of wrapText(paragraph, 90)) {
        lines.push(wrappedLine);
      }
    }
    lines.push('');
  }

  lines.push(`Page 1 of 1`);

  const contentStream = lines
    .map((line, index) => `BT /F1 10 Tf 50 ${760 - index * 12} Td (${escapePdfText(line)}) Tj ET`)
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  const pdfParts: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [];
  const bodyParts: string[] = [];

  for (let index = 0; index < objects.length; index += 1) {
    const objectNumber = index + 1;
    offsets.push(Buffer.byteLength(pdfParts.join('') + bodyParts.join(''), 'utf8'));
    bodyParts.push(`${objectNumber} 0 obj\n${objects[index]}\nendobj\n`);
  }

  const pdfBody = bodyParts.join('');
  const xrefOffset = Buffer.byteLength(pdfParts.join('') + pdfBody, 'utf8');
  const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
  for (const offset of offsets) {
    xrefLines.push(`${String(offset).padStart(10, '0')} 00000 n `);
  }

  return Buffer.from(`${pdfParts.join('')}${pdfBody}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, 'binary');
}

function buildWorkbook(payload: ReportPayload): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  const summaryRows: Array<Array<string | number>> = [
    ['VERDE Decision Support System'],
    ['Report Title', payload.reportTitle],
    ['Generated At', payload.generatedAt],
    ['Path', payload.pathname],
    ['Forecast Method', payload.forecastMethodUsed],
    [],
    ['Executive Summary'],
    [payload.executiveSummary],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

  const kpiRows: Array<Array<string | number>> = [
    ['Metric', 'Current', 'Previous', 'Change', 'Interpretation'] as Array<string | number>,
    ...payload.kpis.map((row) => [row.metric, row.current ?? '', row.previous ?? '', row.change ?? '', row.interpretation] as Array<string | number>),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(kpiRows), 'KPIs');

  const historicalRows: Array<Array<string | number>> = [
    ['Period', 'Revenue', 'Expenses', 'Net Income'] as Array<string | number>,
    ...payload.periodLabels.map((label, index) => [label, payload.revenueSeries[index] ?? 0, payload.expenseSeries[index] ?? 0, payload.netIncomeSeries[index] ?? 0] as Array<string | number>),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(historicalRows), 'Historical Data');

  const forecastRows: Array<Array<string | number>> = [
    ['Service', 'Category', 'Bookings', 'MAPE', 'Forecast Method', 'Forecast Values'] as Array<string | number>,
    ...payload.forecastRows.map((row) => [row.service, row.category, row.bookings, row.mape, row.forecastMethod, row.forecasts] as Array<string | number>),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(forecastRows), 'Forecasts');

  const inventoryRows: Array<Array<string | number>> = [
    ['Item', 'Stock', 'Reorder Point', 'Days of Cover', 'Status', 'Supplier', 'Reorder Quantity'] as Array<string | number>,
    ...payload.inventoryItems.map((item) => [item.name, item.stock, item.reorderPoint, item.daysOfCover, item.status, item.supplier ?? '', item.reorderQuantity ?? ''] as Array<string | number>),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(inventoryRows), 'Inventory');

  const financialRows: Array<Array<string | number>> = [
    ['Category', 'Total', 'Latest Amount'] as Array<string | number>,
    ...payload.expenseBreakdown.map((item) => [item.category, item.total, item.latestAmount] as Array<string | number>),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(financialRows), 'Financials');

  const staffingRows: Array<Array<string | number>> = [
    ['Day', 'Revenue', 'Sessions', 'Demand Level', 'Recommended Staff'] as Array<string | number>,
    ...payload.weekdayPatterns.map((row) => [row.day, row.revenue, row.sessions, row.demandLevel ?? '', row.recommendedStaff ?? 0] as Array<string | number>),
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(staffingRows), 'Staffing');

  const rawRows: Array<Array<string | number>> = [
    ['Section', 'Value'] as Array<string | number>,
    ['Executive Summary', payload.executiveSummary] as Array<string | number>,
    ['Forecast Method', payload.forecastMethodUsed] as Array<string | number>,
    ['Inventory Flag Count', payload.inventoryItems.filter((item) => item.stock <= item.reorderPoint).length] as Array<string | number>,
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rawRows), 'Raw Data');

  return workbook;
}

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

    const reportData = await Promise.all([
      getKPIsOverview({ businessId }),
      getRevenueSeries({ businessId }),
      getServicesForecastTable({ businessId }),
      getRestockList({ businessId }),
      getDailyLog({ businessId }),
      getFinancialSummary({ businessId }),
      getInventoryItems({ businessId }),
      getWeekdayPatternsData({ businessId }),
      getServiceByWeekdayData({ businessId }),
      getExpenseCategoryBreakdownData({ businessId }),
      getInventoryConsumptionSignalData({ businessId }),
    ]);

    const [
      kpis,
      revenueSeries,
      serviceForecasts,
      _restockList,
      dailyLog,
      financialSummary,
      inventoryItems,
      weekdayPatterns,
      _serviceByWeekday,
      expenseBreakdown,
      inventorySignal,
    ] = reportData;

    const normalizedRevenueSeries = Array.isArray(revenueSeries) ? revenueSeries : [];
    const normalizedServiceForecasts = Array.isArray(serviceForecasts) ? serviceForecasts : [];
    const normalizedInventoryItems = Array.isArray(inventoryItems) ? inventoryItems : [];
    const normalizedWeekdayPatterns = Array.isArray(weekdayPatterns) ? weekdayPatterns : [];
    const normalizedExpenseBreakdown = Array.isArray(expenseBreakdown) ? expenseBreakdown : [];
    const normalizedDailyLog = Array.isArray(dailyLog) ? dailyLog : [];

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
      ? normalizedServiceForecasts.reduce((sum, item) => sum + Number(item.mape ?? 0), 0) / normalizedServiceForecasts.length
      : 0;

    const kpiRows: ReportKpiRow[] = [
      {
        metric: 'Projected Revenue',
        current: formatCurrency(kpis.projectedRevenue ?? 0),
        previous: formatCurrency(previousRevenue),
        change: formatPercent(kpis.projectedPct ?? 0),
        interpretation: 'Forecasted revenue for the next period based on the active model.',
      },
      {
        metric: 'Revenue Change',
        current: formatCurrency(latestRevenue),
        previous: formatCurrency(previousRevenue),
        change: formatPercent(revenueChange),
        interpretation: 'Shows whether recent revenue performance is improving or weakening.',
      },
      {
        metric: 'Expense Change',
        current: formatCurrency(latestExpense),
        previous: formatCurrency(previousExpense),
        change: formatPercent(expenseChange),
        interpretation: 'Tracks whether operating costs are rising faster than revenue.',
      },
      {
        metric: 'Urgent Inventory Items',
        current: normalizedInventoryItems.filter((item) => item.status === 'Critical').length,
        previous: null,
        change: null,
        interpretation: 'Highlights stock positions that need immediate management attention.',
      },
      {
        metric: 'Average Forecast Error',
        current: formatPercent(avgMape),
        previous: null,
        change: null,
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
      `The most active service is ${forecastRows[0]?.service ?? 'N/A'} and ${inventoryRows.filter((item) => item.stock <= item.reorderPoint).length} inventory items currently require urgent attention.`,
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
      revenueSeries: revenueSeries ?? [],
      expenseSeries: financialSummary.expenseSeries ?? [],
      netIncomeSeries: financialSummary.netIncomeSeries ?? [],
      dailyLog: dailyLog ?? [],
      inventorySignal: inventorySignal ?? [],
    };

    if (format === 'excel') {
      const workbook = buildWorkbook(payload);
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      const response = new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${sanitizeFileName(reportTitle)}.xlsx"`,
        },
      });
      return applyNoStoreHeaders(response);
    }

    const pdfBuffer = buildPdfDocument(payload);
    const response = new NextResponse(pdfBuffer.toString('binary'), {
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
