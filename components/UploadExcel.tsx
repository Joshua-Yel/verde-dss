"use client";

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { WorkSheet } from 'xlsx';
import {
  UploadCloud,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Receipt,
  Boxes,
  Check,
  XCircle,
} from 'lucide-react';

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Row = Record<string, unknown>;

type WorkbookShape = {
  Sheets: Record<string, WorkSheet>;
  SheetNames: string[];
};

type ImportMode = 'operations' | 'inventory' | 'expenses';
type Step = 'upload' | 'map' | 'review' | 'done';

type OperationsMappedRow = {
  date: string | null;
  service_name: string;
  quantity: number | null;
  revenue: number | null;
  category?: string | null;
  price?: number | null;
  amount?: number | null;
  time_of_day?: string | null;
  visit_id?: string | null;
  notes?: string | null;
  business_name?: string | null;
  raw: Row;
};

type InventoryMappedRow = {
  product_name: string;
  unit: string;
  month: string | null;
  opening_stock: number | null;
  purchased: number | null;
  used: number | null;
  closing_stock: number | null;
  supplier: string | null;
  reorder_point: number | null;
  unit_cost: number | null;
  status?: string | null;
  notes?: string | null;
  business_name?: string | null;
  raw: Row;
};

type MappedRow = OperationsMappedRow | InventoryMappedRow;

type FieldConfig = {
  id: string;
  label: string;
  value: string | null;
  set: (v: string | null) => void;
  required?: boolean;
};

type ValidationError = {
  rowIdx?: number;
  type: 'missing' | 'invalid_number' | 'invalid_date' | 'duplicate';
  message: string;
};

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload file' },
  { id: 'map', label: 'Match columns' },
  { id: 'review', label: 'Review & send' },
];

const normalizeText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[₱,$]/g, '').replace(/,/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || (!isNaN(Number(value)) && String(value).trim() !== '')) {
    const serial = Number(value);
    if (Number.isFinite(serial)) {
      const offset = serial > 59 ? serial - 1 : serial;
      const ms = (offset - 25569) * 86400000;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const normalizeMonth = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || (!isNaN(Number(value)) && String(value).trim() !== '')) {
    const serial = Number(value);
    if (Number.isFinite(serial)) {
      const offset = serial > 59 ? serial - 1 : serial;
      const ms = (offset - 25569) * 86400000;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${date.getFullYear()}-${month}`;
      }
    }
  }
  const text = String(value).trim();
  const monthMatch = text.match(/^\d{4}-\d{2}$/);
  if (monthMatch) return monthMatch[0];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}`;
};

const EXPENSE_CATEGORIES = ['Payroll', 'Rent', 'Utilities', 'Supplies', 'Marketing', 'Admin', 'Other'] as const;

const normalizeExpenseCategory = (value: unknown): string => {
  const text = normalizeText(value).trim().toLowerCase();
  if (!text) return 'Other';
  const exact = EXPENSE_CATEGORIES.find((category) => category.toLowerCase() === text);
  if (exact) return exact;
  if (['payroll', 'staff', 'employee', 'salary'].some((alias) => text.includes(alias))) return 'Payroll';
  if (['rent', 'lease'].some((alias) => text.includes(alias))) return 'Rent';
  if (['utilities', 'electric', 'water', 'internet', 'phone'].some((alias) => text.includes(alias))) return 'Utilities';
  if (['supplies', 'inventory', 'stock'].some((alias) => text.includes(alias))) return 'Supplies';
  if (['marketing', 'advertising', 'promo'].some((alias) => text.includes(alias))) return 'Marketing';
  if (['admin', 'office', 'software', 'fees'].some((alias) => text.includes(alias))) return 'Admin';
  return 'Other';
};

export default function UploadExcel() {
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<Row[] | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showOptional, setShowOptional] = useState(true);
  const workbookRef = useRef<WorkbookShape | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('operations');

  // Column mappings
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [serviceKey, setServiceKey] = useState<string | null>(null);
  const [qtyKey, setQtyKey] = useState<string | null>(null);
  const [revKey, setRevKey] = useState<string | null>(null);
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const [priceKey, setPriceKey] = useState<string | null>(null);
  const [timeOfDayKey, setTimeOfDayKey] = useState<string | null>(null);
  const [visitIdKey, setVisitIdKey] = useState<string | null>(null);
  const [amountKey, setAmountKey] = useState<string | null>(null);

  const [productKey, setProductKey] = useState<string | null>(null);
  const [unitKey, setUnitKey] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [purchasedKey, setPurchasedKey] = useState<string | null>(null);
  const [usedKey, setUsedKey] = useState<string | null>(null);
  const [closingKey, setClosingKey] = useState<string | null>(null);
  const [supplierKey, setSupplierKey] = useState<string | null>(null);
  const [reorderPointKey, setReorderPointKey] = useState<string | null>(null);
  const [unitCostKey, setUnitCostKey] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState<string | null>(null);
  const [notesKey, setNotesKey] = useState<string | null>(null);
  const [businessKey, setBusinessKey] = useState<string | null>(null);

  const columns = useMemo(() => {
    if (!parsed?.length) return [];
    return Object.keys(parsed[0]);
  }, [parsed]);

  const detectDefault = (sourceColumns: string[], candidates: string[]): string | null => {
    const lower = sourceColumns.map(c => c.toLowerCase());
    for (const cand of candidates) {
      const idx = lower.indexOf(cand.toLowerCase());
      if (idx >= 0) return sourceColumns[idx];
    }
    for (let i = 0; i < lower.length; i++) {
      if (candidates.some(cand => lower[i].includes(cand.toLowerCase()))) {
        return sourceColumns[i];
      }
    }
    return null;
  };

  const resetMapping = () => {
    setDateKey(null); setServiceKey(null); setQtyKey(null); setRevKey(null);
    setCategoryKey(null); setPriceKey(null); setTimeOfDayKey(null); setVisitIdKey(null);
    setAmountKey(null);
    setProductKey(null); setUnitKey(null); setMonthKey(null);
    setOpeningKey(null); setPurchasedKey(null); setUsedKey(null);
    setClosingKey(null); setSupplierKey(null); setReorderPointKey(null); setUnitCostKey(null);
    setStatusKey(null); setNotesKey(null);
    setBusinessKey(null);
  };

  const scoreSheetForImportMode = (headers: string[], mode: ImportMode) => {
    const normalized = headers.map((header) => header.toLowerCase());

    const includesAny = (candidates: string[]) => {
      return normalized.some((header) => candidates.some((candidate) => header.includes(candidate.toLowerCase())));
    };

    if (mode === 'inventory') {
      return Number(includesAny(['product', 'item', 'sku', 'inventory'])) * 3
        + Number(includesAny(['unit', 'uom', 'measurement'])) * 2
        + Number(includesAny(['month', 'period', 'date'])) * 2
        + Number(includesAny(['opening', 'purchased', 'used', 'closing', 'stock'])) * 2;
    }

    if (mode === 'expenses') {
      return Number(includesAny(['date', 'transaction'])) * 3
        + Number(includesAny(['category', 'expense'])) * 3
        + Number(includesAny(['amount', 'php', 'price'])) * 3;
    }

    return Number(includesAny(['date', 'transaction'])) * 3
      + Number(includesAny(['service', 'name', 'description'])) * 3
      + Number(includesAny(['quantity', 'qty', 'sessions'])) * 2
      + Number(includesAny(['revenue', 'amount', 'price', 'total'])) * 2;
  };

  const applyDefaultMapping = (newColumns: string[], mode: ImportMode = importMode) => {
    resetMapping();
    if (mode === 'inventory') {
      setProductKey(detectDefault(newColumns, ['product name', 'item', 'sku', 'inventory item']));
      setUnitKey(detectDefault(newColumns, ['unit', 'uom', 'measurement']));
      setSupplierKey(detectDefault(newColumns, ['supplier', 'vendor', 'source']));
      setReorderPointKey(detectDefault(newColumns, ['reorder point', 'reorder_point', 'reorder', 'rp']));
      setUnitCostKey(detectDefault(newColumns, ['unit cost', 'unit_cost', 'cost', 'price']));
      setMonthKey(detectDefault(newColumns, ['month', 'period', 'report month', 'date']));
      setOpeningKey(detectDefault(newColumns, ['opening stock', 'opening', 'beginning stock']));
      setPurchasedKey(detectDefault(newColumns, ['purchased', 'purchase', 'received']));
      setUsedKey(detectDefault(newColumns, ['used', 'consumed', 'issued']));
      setClosingKey(detectDefault(newColumns, ['closing stock', 'closing', 'ending stock']));
      setStatusKey(detectDefault(newColumns, ['status', 'condition']));
      setNotesKey(detectDefault(newColumns, ['notes', 'remarks', 'comments']));
      setBusinessKey(detectDefault(newColumns, ['business name', 'business', 'tenant', 'company']));
    } else if (mode === 'expenses') {
      setDateKey(detectDefault(newColumns, ['date', 'transaction date', 'day']))
      setCategoryKey(detectDefault(newColumns, ['category', 'expense category']))
      setAmountKey(detectDefault(newColumns, ['amount', 'amount (php)', 'amount (PHP)', 'amount_php']))
      setNotesKey(detectDefault(newColumns, ['notes', 'remarks', 'comments']))
      setBusinessKey(detectDefault(newColumns, ['business name', 'business', 'tenant', 'company']))
    } else {
      setDateKey(detectDefault(newColumns, ['date', 'transaction date', 'day']));
      setServiceKey(detectDefault(newColumns, ['service', 'service name', 'item', 'description']));
      setQtyKey(detectDefault(newColumns, ['quantity', 'qty', 'sessions', 'count']));
      setRevKey(detectDefault(newColumns, ['revenue', 'amount', 'price', 'total']));
      setCategoryKey(detectDefault(newColumns, ['category', 'service category']));
      setPriceKey(detectDefault(newColumns, ['unit price', 'price', 'rate']));
      setTimeOfDayKey(detectDefault(newColumns, ['time of day', 'time', 'session time']));
      setVisitIdKey(detectDefault(newColumns, ['visit id', 'visit_id', 'appointment id', 'appointment_id']));
      setNotesKey(detectDefault(newColumns, ['notes', 'remarks', 'comments']));
      setBusinessKey(detectDefault(newColumns, ['business name', 'business', 'tenant', 'company']));
    }
  };

  const loadSheet = async (sheetName: string, workbook: WorkbookShape) => {
    const XLSX = await import('xlsx');
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Row[];

    setParsed(json);
    setSelectedSheet(sheetName);
    applyDefaultMapping(Object.keys(json[0] ?? {}));
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFilename(file.name);

    const XLSX = await import('xlsx');
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' }) as WorkbookShape;
    workbookRef.current = workbook;

    const sheets = workbook.SheetNames || [];
    setSheetNames(sheets);

    if (sheets.length > 0) {
      let bestSheetName = sheets[0];
      let bestScore = -1;

      for (const sheetName of sheets) {
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Row[];
        const headers = Object.keys(json[0] ?? {});
        const score = scoreSheetForImportMode(headers, importMode);

        if (score > bestScore) {
          bestScore = score;
          bestSheetName = sheetName;
        }
      }

      await loadSheet(bestSheetName, workbook);
      setStep('map');
    } else {
      setParsed([]);
      setError('We couldn\'t find any data sheets inside this Excel file.');
    }
  };

  const startOver = () => {
    setStep('upload');
    setParsed(null);
    setFilename(null);
    setError(null);
    setResultMessage(null);
    setSheetNames([]);
    setSelectedSheet(null);
    setShowOptional(true);
    resetMapping();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const requiredFields: FieldConfig[] = importMode === 'inventory'
    ? [
        { id: 'product', label: 'Product Name', value: productKey, set: setProductKey, required: true },
        { id: 'unit', label: 'Unit', value: unitKey, set: setUnitKey, required: true },
        { id: 'month', label: 'Month (YYYY-MM)', value: monthKey, set: setMonthKey, required: true },
        { id: 'opening', label: 'Opening Stock', value: openingKey, set: setOpeningKey, required: true },
        { id: 'purchased', label: 'Purchased', value: purchasedKey, set: setPurchasedKey, required: true },
        { id: 'used', label: 'Used', value: usedKey, set: setUsedKey, required: true },
        { id: 'closing', label: 'Closing Stock', value: closingKey, set: setClosingKey, required: true },
      ]
    : importMode === 'expenses'
    ? [
        { id: 'date', label: 'Date', value: dateKey, set: setDateKey, required: true },
        { id: 'category', label: 'Category', value: categoryKey, set: setCategoryKey, required: true },
        { id: 'amount', label: 'Amount (PHP)', value: amountKey, set: setAmountKey, required: true },
      ]
    : [
        { id: 'date', label: 'Date', value: dateKey, set: setDateKey, required: true },
        { id: 'service', label: 'Service Name', value: serviceKey, set: setServiceKey, required: true },
        { id: 'qty', label: 'Quantity', value: qtyKey, set: setQtyKey, required: true },
        { id: 'rev', label: 'Revenue (PHP)', value: revKey, set: setRevKey, required: true },
      ];

  const optionalFields: FieldConfig[] = importMode === 'inventory'
    ? [
        { id: 'supplier', label: 'Supplier', value: supplierKey, set: setSupplierKey },
        { id: 'reorder_point', label: 'Reorder Point', value: reorderPointKey, set: setReorderPointKey },
        { id: 'unit_cost', label: 'Unit Cost (PHP)', value: unitCostKey, set: setUnitCostKey },
        { id: 'status', label: 'Status', value: statusKey, set: setStatusKey },
        { id: 'business', label: 'Business Name', value: businessKey, set: setBusinessKey },
        { id: 'notes', label: 'Notes', value: notesKey, set: setNotesKey },
      ]
    : importMode === 'expenses'
    ? [
        { id: 'business', label: 'Business Name', value: businessKey, set: setBusinessKey },
        { id: 'notes', label: 'Notes', value: notesKey, set: setNotesKey },
      ]
    : [
        { id: 'category', label: 'Category', value: categoryKey, set: setCategoryKey },
        { id: 'price', label: 'Unit Price (PHP)', value: priceKey, set: setPriceKey },
        { id: 'time_of_day', label: 'Time of Day', value: timeOfDayKey, set: setTimeOfDayKey },
        { id: 'visit_id', label: 'Visit ID', value: visitIdKey, set: setVisitIdKey },
        { id: 'business', label: 'Business Name', value: businessKey, set: setBusinessKey },
        { id: 'notes', label: 'Notes', value: notesKey, set: setNotesKey },
      ];

  const missingRequired = requiredFields.filter(f => !f.value).map(f => f.label);

  const mappedRows: MappedRow[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.map(r => {
      if (importMode === 'inventory') {
        return {
          product_name: productKey ? normalizeText(r[productKey]) : '',
          unit: unitKey ? normalizeText(r[unitKey]) : '',
          month: monthKey ? normalizeMonth(r[monthKey]) : null,
          opening_stock: openingKey ? normalizeNumber(r[openingKey]) : null,
          purchased: purchasedKey ? normalizeNumber(r[purchasedKey]) : null,
          used: usedKey ? normalizeNumber(r[usedKey]) : null,
          closing_stock: closingKey ? normalizeNumber(r[closingKey]) : null,
          supplier: supplierKey ? normalizeText(r[supplierKey]) : null,
          reorder_point: reorderPointKey ? normalizeNumber(r[reorderPointKey]) : null,
          unit_cost: unitCostKey ? normalizeNumber(r[unitCostKey]) : null,
          status: statusKey ? normalizeText(r[statusKey]) : null,
          notes: notesKey ? normalizeText(r[notesKey]) : null,
          business_name: businessKey ? normalizeText(r[businessKey]) : null,
          raw: r,
        } satisfies InventoryMappedRow;
      }
      if (importMode === 'expenses') {
        return {
          date: dateKey ? normalizeDate(r[dateKey]) : null,
          service_name: categoryKey ? normalizeText(r[categoryKey]) : '',
          quantity: null,
          revenue: null,
          category: categoryKey ? normalizeExpenseCategory(r[categoryKey]) : null,
          price: amountKey ? normalizeNumber(r[amountKey]) : null,
          amount: amountKey ? normalizeNumber(r[amountKey]) : null,
          time_of_day: null,
          notes: notesKey ? normalizeText(r[notesKey]) : null,
          business_name: businessKey ? normalizeText(r[businessKey]) : null,
          raw: r,
        } as unknown as OperationsMappedRow;
      }
      return {
        date: dateKey ? normalizeDate(r[dateKey]) : null,
        service_name: serviceKey ? normalizeText(r[serviceKey]) : '',
        quantity: qtyKey ? normalizeNumber(r[qtyKey]) : null,
        revenue: revKey ? normalizeNumber(r[revKey]) : null,
        category: categoryKey ? normalizeText(r[categoryKey]) : null,
        price: priceKey ? normalizeNumber(r[priceKey]) : null,
        time_of_day: timeOfDayKey ? normalizeText(r[timeOfDayKey]) : null,
        visit_id: visitIdKey ? normalizeText(r[visitIdKey]) : null,
        notes: notesKey ? normalizeText(r[notesKey]) : null,
        business_name: businessKey ? normalizeText(r[businessKey]) : null,
        raw: r,
      } satisfies OperationsMappedRow;
    });
  }, [
    parsed, importMode,
    dateKey, serviceKey, qtyKey, revKey, categoryKey, priceKey, timeOfDayKey, visitIdKey,
    amountKey,
    productKey, unitKey, monthKey, openingKey, purchasedKey, usedKey, closingKey, supplierKey, reorderPointKey, unitCostKey, statusKey, notesKey, businessKey,
  ]);

  const validationErrors: ValidationError[] = useMemo(() => {
    if (!parsed || step !== 'map') return [];
    const errors: ValidationError[] = [];

    mappedRows.forEach((row, index) => {
      const displayRow = index + 1;
      if (importMode === 'operations') {
        const opRow = row as OperationsMappedRow;
        if (!opRow.service_name) {
          errors.push({ type: 'missing', rowIdx: displayRow, message: `Row ${displayRow}: Service name is blank.` });
        }
        if (!opRow.date) {
          errors.push({ type: 'invalid_date', rowIdx: displayRow, message: `Row ${displayRow}: The date layout looks empty or unrecognized.` });
        }
        if (opRow.quantity === null) {
          errors.push({ type: 'invalid_number', rowIdx: displayRow, message: `Row ${displayRow}: Quantity must be a valid number entry.` });
        }
        if (opRow.revenue === null) {
          errors.push({ type: 'invalid_number', rowIdx: displayRow, message: `Row ${displayRow}: Revenue must contain numeric values.` });
        }
      } else if (importMode === 'expenses') {
        const expRow = row as OperationsMappedRow;
        if (!expRow.category) {
          errors.push({ type: 'missing', rowIdx: displayRow, message: `Row ${displayRow}: Category is blank.` });
        }
        if (!expRow.date) {
          errors.push({ type: 'invalid_date', rowIdx: displayRow, message: `Row ${displayRow}: Date must be a valid date.` });
        }
        if (expRow.price === null) {
          errors.push({ type: 'invalid_number', rowIdx: displayRow, message: `Row ${displayRow}: Amount (PHP) must contain numeric values.` });
        }
      } else {
        const invRow = row as InventoryMappedRow;
        if (!invRow.product_name) {
          errors.push({ type: 'missing', rowIdx: displayRow, message: `Row ${displayRow}: Product Name field is blank.` });
        }
        if (!invRow.month) {
          errors.push({ type: 'invalid_date', rowIdx: displayRow, message: `Row ${displayRow}: Month must use YYYY-MM configurations.` });
        }
        if (invRow.opening_stock === null || invRow.purchased === null || invRow.used === null || invRow.closing_stock === null) {
          errors.push({ type: 'invalid_number', rowIdx: displayRow, message: `Row ${displayRow}: Stock levels contain text or missing values.` });
        }
      }
    });

    return errors;
  }, [mappedRows, importMode, parsed, step]);

  const previewRows = mappedRows.slice(0, 5);

  const sendImport = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, mode: importMode, rows: mappedRows }),
      });
      const body = await res.json();
      if (res.ok) {
        setResultMessage(body.message || `Excellent! ${mappedRows.length} rows have been checked and successfully imported.`);
        setStep('done');
      } else {
        const errorMessage =
          typeof body.error === 'string' ? body.error :
          typeof body.message === 'string' ? body.message :
          body.detail ? String(body.detail) :
          JSON.stringify(body);
        setError(errorMessage || "The server rejected this submission. Please verify file columns and try uploading again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — please check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const stepIndex = step === 'done' ? STEPS.length : STEPS.findIndex(s => s.id === step);

  const goBack = () => {
    if (step === 'map') setStep('upload');
    else if (step === 'review') setStep('map');
  };

  const goNext = () => {
    if (step === 'map' && missingRequired.length === 0 && validationErrors.length === 0) {
      setStep('review');
    }
  };

  return (
    <Card className="w-full max-w-7xl mx-auto overflow-hidden transition-all duration-300">
      {/* Progress stepper */}
      {step !== 'done' && (
        <div className="flex items-center gap-1 sm:gap-2 border-b bg-muted/30 px-2 py-2 sm:px-4 md:px-6 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex flex-1 items-center gap-1 sm:gap-2 last:flex-initial min-w-0 whitespace-nowrap">
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <div
                  className={[
                    "flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full text-[10px] sm:text-xs font-medium transition-colors",
                    i < stepIndex ? "bg-emerald-600 text-white" :
                    i === stepIndex ? "bg-primary text-primary-foreground ring-4 ring-primary/15" :
                    "bg-muted text-muted-foreground",
                  ].join(' ')}
                >
                  {i < stepIndex ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : i + 1}
                </div>
                <span className={`hidden sm:inline text-xs truncate ${i === stepIndex ? 'font-medium' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-0.5 sm:mx-1 h-px flex-1 min-w-[8px] ${i < stepIndex ? 'bg-emerald-600' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      <CardContent className="p-3 sm:p-4">
        {/* STEP 1 — Upload */}
        {step === 'upload' && (
          <div className="space-y-3 sm:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-semibold">What kind of data are you importing?</h2>
                <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">This tells us which columns to look for.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-2 sm:gap-3 items-stretch">
              <div className="lg:col-span-2 flex flex-row lg:flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setImportMode('operations')}
                  className={[
                    "flex-1 flex items-center gap-2 rounded-lg border-2 p-2 text-left transition-colors touch-manipulation min-h-[44px] lg:min-h-[52px]",
                    importMode === 'operations' ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30 active:bg-muted/40",
                  ].join(' ')}
                >
                  <Receipt className="h-4 w-4 lg:h-5 lg:w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs lg:text-sm font-medium leading-tight">Operations</p>
                    <p className="text-[10px] lg:text-xs text-muted-foreground leading-tight hidden sm:block">Sales & revenue</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('inventory')}
                  className={[
                    "flex-1 flex items-center gap-2 rounded-lg border-2 p-2 text-left transition-colors touch-manipulation min-h-[44px] lg:min-h-[52px]",
                    importMode === 'inventory' ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30 active:bg-muted/40",
                  ].join(' ')}
                >
                  <Boxes className="h-4 w-4 lg:h-5 lg:w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs lg:text-sm font-medium leading-tight">Inventory</p>
                    <p className="text-[10px] lg:text-xs text-muted-foreground leading-tight hidden sm:block">Stock levels</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportMode('expenses')}
                  className={[
                    "flex-1 flex items-center gap-2 rounded-lg border-2 p-2 text-left transition-colors touch-manipulation min-h-[44px] lg:min-h-[52px]",
                    importMode === 'expenses' ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30 active:bg-muted/40",
                  ].join(' ')}
                >
                  <Receipt className="h-4 w-4 lg:h-5 lg:w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs lg:text-sm font-medium leading-tight">Expenses</p>
                    <p className="text-[10px] lg:text-xs text-muted-foreground leading-tight hidden sm:block">Bills by date</p>
                  </div>
                </button>
              </div>

              <label className="lg:col-span-3 group relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-3 py-3 lg:px-4 lg:py-4 min-h-[120px] lg:min-h-[140px] text-center transition-colors hover:border-primary/50 active:bg-muted/30 touch-manipulation">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={onFile}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
                <UploadCloud className="mb-1.5 h-6 w-6 lg:h-8 lg:w-8 text-muted-foreground transition-colors group-hover:text-primary" />
                <p className="text-xs lg:text-sm font-medium">Drop Excel here, or tap to browse</p>
                <p className="mt-0.5 text-[10px] lg:text-xs text-muted-foreground">Accepts .xlsx and .xls</p>
              </label>
            </div>

            <div className="rounded-lg border bg-muted/20 px-3 py-1.5 text-[10px] sm:text-xs text-muted-foreground leading-snug">
              <span className="font-medium text-foreground">Expected: </span>
              {importMode === 'operations'
                ? 'Date, Service Name, Quantity, Revenue (PHP) · optional: Category, Price, Time, Notes, Business'
                : importMode === 'expenses'
                  ? 'Date, Category, Amount (PHP) · optional: Notes, Business · categories: Payroll, Rent, Utilities, Supplies, Marketing, Admin, Other'
                  : 'Product, Unit, Month, Opening / Purchased / Used / Closing · optional: Supplier, Cost, Status, Notes, Business'}
            </div>

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertTitle className="text-sm">Upload Problem</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ============================================================
            STEP 2 — Improved multi-column card layout
            ============================================================ */}
        {step === 'map' && parsed && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold tracking-tight">Match your columns</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Auto-matched from <span className="font-medium text-foreground">{filename}</span>
                </p>
              </div>

              {sheetNames.length > 1 && (
                <Select
                  value={selectedSheet ?? ''}
                  onValueChange={async (val) => {
                    if (workbookRef.current && val) await loadSheet(val, workbookRef.current);
                  }}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs bg-background">
                    <SelectValue placeholder="Select sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheetNames.map(name => (
                      <SelectItem key={name} value={name} className="text-xs">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* REQUIRED */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Required
                </span>
                <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                  {requiredFields.filter(f => f.value).length}/{requiredFields.length}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {requiredFields.map(field => (
                  <MappingCard key={field.id} field={field} columns={columns} />
                ))}
              </div>
            </div>

            {/* OPTIONAL */}
            <div>
              <button
                type="button"
                onClick={() => setShowOptional(!showOptional)}
                className="flex items-center gap-2 mb-2.5 group"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                  Optional
                </span>
                <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                  {optionalFields.filter(f => f.value).length}/{optionalFields.length}
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                    showOptional ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showOptional && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {optionalFields.map(field => (
                    <MappingCard key={field.id} field={field} columns={columns} muted />
                  ))}
                </div>
              )}
            </div>

            {/* Validation */}
            <div className="space-y-2 pt-1">
              {missingRequired.length === 0 && validationErrors.length > 0 && (
                <Alert variant="destructive" className="py-2">
                  <XCircle className="h-3.5 w-3.5" />
                  <AlertTitle className="text-xs font-semibold">Data issues found</AlertTitle>
                  <AlertDescription className="text-[10px]">
                    <ScrollArea className="h-12 border rounded-md p-2 bg-background/50 mt-1">
                      <ul className="list-disc pl-4 space-y-0.5">
                        {validationErrors.slice(0, 4).map((err, idx) => (
                          <li key={idx} className="text-muted-foreground text-[10px]">
                            <span className="font-medium text-destructive">{err.message}</span>
                          </li>
                        ))}
                        {validationErrors.length > 4 && (
                          <li className="text-muted-foreground text-[10px]">
                            +{validationErrors.length - 4} more issues
                          </li>
                        )}
                      </ul>
                    </ScrollArea>
                  </AlertDescription>
                </Alert>
              )}

              {missingRequired.length > 0 && (
                <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <AlertTitle className="text-xs font-medium">Missing required mappings</AlertTitle>
                  <AlertDescription className="text-[10px] opacity-90 mt-0.5">
                    {missingRequired.join(', ')}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}

        {/* STEP 3 — Review */}
        {step === 'review' && parsed && (
          <div className="space-y-4 sm:space-y-5">
            <div>
              <h2 className="text-base sm:text-lg font-semibold">Ready to send</h2>
              <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">Quick look before importing</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              <StatBox label="Rows" value={String(parsed.length)} />
              <StatBox
                label="Import type"
                value={importMode === 'operations' ? 'Operations' : importMode === 'expenses' ? 'Expenses' : 'Inventory'}
              />
              <StatBox label="File" value={filename ?? '—'} truncate />
            </div>

            <div className="rounded-lg border overflow-hidden">
              <div className="border-b px-3 py-2">
                <p className="text-xs sm:text-sm font-medium">Sample of your data</p>
              </div>
              <ScrollArea className="h-[120px] sm:h-[140px] max-h-[25vh]">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {requiredFields.map(f => (
                          <TableHead key={f.id} className="whitespace-nowrap text-[10px] sm:text-xs px-2 sm:px-3">
                            {f.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, i) => (
                        <TableRow key={i}>
                          {importMode === 'operations' ? (
                            <>
                              <TableCell className="whitespace-nowrap text-[10px] sm:text-xs px-2 sm:px-3">{(row as OperationsMappedRow).date ?? '—'}</TableCell>
                              <TableCell className="font-medium text-[10px] sm:text-xs px-2 sm:px-3">{(row as OperationsMappedRow).service_name || '—'}</TableCell>
                              <TableCell className="text-[10px] sm:text-xs px-2 sm:px-3">{(row as OperationsMappedRow).quantity ?? '—'}</TableCell>
                              <TableCell className="text-[10px] sm:text-xs px-2 sm:px-3">{(row as OperationsMappedRow).revenue ?? '—'}</TableCell>
                            </>
                          ) : importMode === 'expenses' ? (
                            <>
                              <TableCell className="whitespace-nowrap text-[10px] sm:text-xs px-2 sm:px-3">{(row as OperationsMappedRow).date ?? '—'}</TableCell>
                              <TableCell className="font-medium text-[10px] sm:text-xs px-2 sm:px-3">{(row as OperationsMappedRow).category || '—'}</TableCell>
                              <TableCell className="text-[10px] sm:text-xs px-2 sm:px-3">{(row as OperationsMappedRow).price ?? '—'}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-medium text-[10px] sm:text-xs px-2 sm:px-3">{(row as InventoryMappedRow).product_name || '—'}</TableCell>
                              <TableCell className="text-[10px] sm:text-xs px-2 sm:px-3">{(row as InventoryMappedRow).unit || '—'}</TableCell>
                              <TableCell className="whitespace-nowrap text-[10px] sm:text-xs px-2 sm:px-3">{(row as InventoryMappedRow).month ?? '—'}</TableCell>
                              <TableCell className="text-[10px] sm:text-xs px-2 sm:px-3">{(row as InventoryMappedRow).opening_stock ?? '—'}</TableCell>
                              <TableCell className="text-[10px] sm:text-xs px-2 sm:px-3">{(row as InventoryMappedRow).purchased ?? '—'}</TableCell>
                              <TableCell className="text-[10px] sm:text-xs px-2 sm:px-3">{(row as InventoryMappedRow).used ?? '—'}</TableCell>
                              <TableCell className="text-[10px] sm:text-xs px-2 sm:px-3">{(row as InventoryMappedRow).closing_stock ?? '—'}</TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </div>

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertTitle className="text-sm">Import failed</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* DONE */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-3 py-6 sm:py-8 text-center max-w-md mx-auto px-2">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-bold text-emerald-900 dark:text-emerald-100">Upload Completed!</h2>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{resultMessage}</p>
            </div>
            <Button onClick={startOver} className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white touch-manipulation text-xs sm:text-sm">
              <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
              Import another file
            </Button>
          </div>
        )}
      </CardContent>

      {/* Footer */}
      {(step === 'map' || step === 'review') && (
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 sm:px-4 py-2.5">
          <Button variant="ghost" onClick={goBack} className="touch-manipulation shrink-0 text-xs sm:text-sm h-8">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back
          </Button>

          {step === 'map' ? (
            <Button
              onClick={goNext}
              disabled={missingRequired.length > 0 || validationErrors.length > 0}
              className="touch-manipulation text-xs sm:text-sm h-8"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={sendImport}
              disabled={sending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white touch-manipulation text-xs sm:text-sm h-8"
            >
              {sending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                  Sending...
                </>
              ) : (
                <>
                  Send import
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/* ================================================================
   Improved MappingCard
   ================================================================ */
function MappingCard({
  field,
  columns,
  muted = false,
}: {
  field: FieldConfig;
  columns: string[];
  muted?: boolean;
}) {
  const isMapped = Boolean(field.value);

  return (
    <div
      className={`
        flex flex-col gap-1.5 rounded-lg border p-2.5 transition-all
        ${!isMapped && field.required
          ? "border-amber-400/50 bg-amber-500/[0.06]"
          : isMapped
            ? "border-emerald-500/40 bg-emerald-500/[0.06]"
            : muted
              ? "border-border/60 bg-muted/20"
              : "border-border bg-background"
        }
      `}
    >
      {/* Label row */}
      <div className="flex items-center gap-1.5 min-w-0">
        {isMapped ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <AlertCircle
            className={`h-3.5 w-3.5 shrink-0 ${
              field.required ? "text-amber-500" : "text-muted-foreground/50"
            }`}
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-medium truncate leading-none ${
              muted && !isMapped ? "text-muted-foreground" : ""
            }`}
          >
            {field.label}
          </p>
          {field.required && !isMapped && (
            <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5 leading-none">
              Required
            </p>
          )}
        </div>
      </div>

      {/* Select */}
      <Select
        value={field.value ?? "__none"}
        onValueChange={(v) => field.set(v === "__none" ? null : v)}
      >
        <SelectTrigger className="h-7 w-full text-[11px] bg-background/80 shadow-none border-border/70">
          <SelectValue placeholder="Select column…" />
        </SelectTrigger>
        <SelectContent className="max-w-[240px]">
          <SelectItem value="__none" className="text-xs text-muted-foreground">
            {field.required ? "— Not mapped" : "— Skip"}
          </SelectItem>
          {columns.map((c) => (
            <SelectItem key={c} value={c} className="text-xs truncate" title={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatBox({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${truncate ? 'truncate' : ''}`} title={truncate ? value : undefined}>
        {value}
      </p>
    </div>
  );
}