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
  time_of_day?: string | null;
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
    setCategoryKey(null); setPriceKey(null); setTimeOfDayKey(null);
    setAmountKey(null);
    setProductKey(null); setUnitKey(null); setMonthKey(null);
    setOpeningKey(null); setPurchasedKey(null); setUsedKey(null);
    setClosingKey(null); setSupplierKey(null); setReorderPointKey(null); setUnitCostKey(null);
    setStatusKey(null); setNotesKey(null);
    setBusinessKey(null);
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
      await loadSheet(sheets[0], workbook);
      setStep('map');
    } else {
      setParsed([]);
      setError('We couldn’t find any data sheets inside this Excel file.');
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
        { id: 'month', label: 'Month (YYYY-MM-DD)', value: monthKey, set: setMonthKey, required: true },
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
          quantity: amountKey ? normalizeNumber(r[amountKey]) : null,
          revenue: null,
          category: categoryKey ? normalizeText(r[categoryKey]) : null,
          price: amountKey ? normalizeNumber(r[amountKey]) : null,
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
        notes: notesKey ? normalizeText(r[notesKey]) : null,
        business_name: businessKey ? normalizeText(r[businessKey]) : null,
        raw: r,
      } satisfies OperationsMappedRow;
    });
  }, [
    parsed, importMode,
    dateKey, serviceKey, qtyKey, revKey, categoryKey, priceKey, timeOfDayKey,
    amountKey,
    productKey, unitKey, monthKey, openingKey, purchasedKey, usedKey, closingKey, supplierKey, reorderPointKey, unitCostKey, statusKey, notesKey, businessKey,
  ]);

  // Deep structural file row validations
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
        setError(body.error || "The server rejected this submission. Please verify file columns and try uploading again.");
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
    <Card className="w-full max-w-4xl mx-auto overflow-hidden py-0 transition-all duration-300">
      {/* Progress stepper */}
      {step !== 'done' && (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-4 sm:px-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex flex-1 items-center gap-2 last:flex-initial">
              <div className="flex items-center gap-2">
                <div
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors",
                    i < stepIndex ? "bg-emerald-600 text-white" :
                    i === stepIndex ? "bg-primary text-primary-foreground ring-4 ring-primary/15" :
                    "bg-muted text-muted-foreground",
                  ].join(' ')}
                >
                  {i < stepIndex ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`hidden text-sm sm:inline ${i === stepIndex ? 'font-medium' : 'text-muted-foreground'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-1 h-px flex-1 ${i < stepIndex ? 'bg-emerald-600' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      <CardContent className="p-5 sm:p-8">
        {/* STEP 1 — Upload */}
        {step === 'upload' && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div>
              <h2 className="text-lg font-semibold">What kind of data are you importing?</h2>
              <p className="mt-1 text-sm text-muted-foreground">This tells us which columns to look for.</p>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <p className="font-medium text-foreground">
                {importMode === 'operations' ? 'Expected template columns' : 'Expected template columns'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {importMode === 'operations'
                  ? 'Date, Service Name, Quantity, Revenue (PHP), Category, Unit Price (PHP), Time of Day, Notes, Business Name'
                  : importMode === 'expenses'
                    ? 'Date, Category, Amount (PHP), Notes, Business Name'
                    : 'Product Name, Unit, Month, Opening Stock, Purchased, Used, Closing Stock, Status, Notes, Business Name'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setImportMode('operations')}
                className={[
                  "flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                  importMode === 'operations' ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30",
                ].join(' ')}
              >
                <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Operations</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Sales, services, revenue by date</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setImportMode('inventory')}
                className={[
                  "flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                  importMode === 'inventory' ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30",
                ].join(' ')}
              >
                <Boxes className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Inventory</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Stock levels, purchases, usage by month</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setImportMode('expenses')}
                className={[
                  "flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors",
                  importMode === 'expenses' ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30",
                ].join(' ')}
              >
                <Receipt className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">Expenses</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Expenses / bills by date</p>
                </div>
              </button>
            </div>

            <label className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/20 px-6 py-10 text-center transition-colors hover:border-primary/50">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={onFile}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground transition-colors group-hover:text-primary" />
              <p className="text-sm font-medium">Drop your Excel file here, or tap to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">Accepts .xlsx and .xls files</p>
            </label>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Upload Problem</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* STEP 2 — Map columns (LANDSCAPE SPLIT GRID WITH VALIDATION CHIPS) */}
        {step === 'map' && parsed && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Match your columns</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We auto-matched what we could from <span className="font-semibold text-foreground">{filename}</span>.
                </p>
              </div>
              {sheetNames.length > 1 && (
                <Select
                  value={selectedSheet ?? ''}
                  onValueChange={async (val) => {
                    if (workbookRef.current && val) await loadSheet(val, workbookRef.current);
                  }}
                >
                  <SelectTrigger className="h-10 w-[180px] text-sm bg-background">
                    <SelectValue placeholder="Select Sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheetNames.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Left Side: Required fields */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Required Fields</span>
                  <span className="text-xs font-medium text-muted-foreground">{requiredFields.filter(f => f.value).length}/{requiredFields.length} mapped</span>
                </div>
                <div className="space-y-2">
                  {requiredFields.map(field => (
                    <MappingRow key={field.id} field={field} columns={columns} />
                  ))}
                </div>
              </div>

              {/* Right Side: Optional fields */}
              <div className="space-y-3">
                <Collapsible open={showOptional} onOpenChange={setShowOptional} className="w-full">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Optional Fields</span>
                    <CollapsibleTrigger className="inline-flex h-6 items-center justify-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                      {showOptional ? 'Collapse' : 'Expand'} ({optionalFields.length})
                      <ChevronDown className={`ml-1 h-3 w-3 transition-transform duration-200 ${showOptional ? 'rotate-180' : ''}`} />
                    </CollapsibleTrigger>
                  </div>
                  
                  <CollapsibleContent className="space-y-2">
                    {optionalFields.map(field => (
                      <MappingRow key={field.id} field={field} columns={columns} muted />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>

            {/* Comprehensive Content/Data Quality Validation Block */}
            {missingRequired.length === 0 && validationErrors.length > 0 && (
              <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 text-destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle className="font-semibold text-sm">We found some formatting issues inside your sheet</AlertTitle>
                <AlertDescription className="mt-2 text-xs space-y-1">
                  <p className="mb-2 opacity-90">Please map columns to match the requested structures or verify the row rows in your file:</p>
                  <ScrollArea className="h-28 border rounded-lg p-2 bg-background/50 text-foreground">
                    <ul className="list-disc pl-4 space-y-1">
                      {validationErrors.map((err, idx) => (
                        <li key={idx} className="text-muted-foreground text-[11px]">
                          <span className="font-medium text-destructive">{err.message}</span>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}

            {missingRequired.length > 0 && (
              <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <AlertTitle className="font-medium">Columns still need matching</AlertTitle>
                <AlertDescription className="text-xs opacity-90">
                  Please specify mappings for: {missingRequired.join(', ')}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* STEP 3 — Review & send */}
        {step === 'review' && parsed && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Ready to send</h2>
              <p className="mt-1 text-sm text-muted-foreground">Take a quick look before this goes in.</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Rows" value={String(parsed.length)} />
              <StatBox label="Import type" value={importMode === 'operations' ? 'Operations' : 'Inventory'} />
              <StatBox label="File" value={filename ?? '—'} truncate />
            </div>

            <div className="rounded-xl border">
              <div className="border-b px-4 py-2.5">
                <p className="text-sm font-medium">Sample of your data</p>
              </div>
              <ScrollArea className="h-[220px]">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {requiredFields.map(f => <TableHead key={f.id} className="whitespace-nowrap">{f.label}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, i) => (
                        <TableRow key={i}>
                            {importMode === 'operations' ? (
                            <>
                              <TableCell className="whitespace-nowrap">{(row as OperationsMappedRow).date ?? '—'}</TableCell>
                              <TableCell className="font-medium">{(row as OperationsMappedRow).service_name || '—'}</TableCell>
                              <TableCell>{(row as OperationsMappedRow).quantity ?? '—'}</TableCell>
                              <TableCell>{(row as OperationsMappedRow).revenue ?? '—'}</TableCell>
                            </>
                            ) : importMode === 'expenses' ? (
                              <>
                                <TableCell className="whitespace-nowrap">{(row as OperationsMappedRow).date ?? '—'}</TableCell>
                                <TableCell className="font-medium">{(row as OperationsMappedRow).category || '—'}</TableCell>
                                <TableCell>{(row as OperationsMappedRow).price ?? '—'}</TableCell>
                                <TableCell>{(row as OperationsMappedRow).notes ?? '—'}</TableCell>
                              </>
                            ) : (
                            <>
                              <TableCell className="font-medium">{(row as InventoryMappedRow).product_name || '—'}</TableCell>
                              <TableCell>{(row as InventoryMappedRow).unit || '—'}</TableCell>
                              <TableCell className="whitespace-nowrap">{(row as InventoryMappedRow).month ?? '—'}</TableCell>
                              <TableCell>{(row as InventoryMappedRow).opening_stock ?? '—'}</TableCell>
                              <TableCell>{(row as InventoryMappedRow).purchased ?? '—'}</TableCell>
                              <TableCell>{(row as InventoryMappedRow).used ?? '—'}</TableCell>
                              <TableCell>{(row as InventoryMappedRow).closing_stock ?? '—'}</TableCell>
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
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Import failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* DONE — confirmation (STANDARDIZED EMERALD GREEN SUCCESS VIEW) */}
        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center max-w-md mx-auto">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">Upload Completed Successfully!</h2>
              <p className="mt-2 text-sm text-muted-foreground">{resultMessage}</p>
            </div>
            <Button onClick={startOver} className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import another file
            </Button>
          </div>
        )}
      </CardContent>

      {/* Footer navigation */}
      {(step === 'map' || step === 'review') && (
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-4 sm:px-8">
          <Button variant="ghost" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {step === 'map' ? (
            <Button 
              onClick={goNext} 
              disabled={missingRequired.length > 0 || validationErrors.length > 0}
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={sendImport} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {sending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                  Sending...
                </>
              ) : (
                <>
                  Send import
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function MappingRow({
  field,
  columns,
  muted,
}: {
  field: FieldConfig;
  columns: string[];
  muted?: boolean;
}) {
  const isMapped = Boolean(field.value);
  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border p-3 bg-background transition-all ${
      !isMapped && field.required 
        ? "border-amber-500/30 bg-amber-500/[0.01]" 
        : isMapped 
          ? "border-emerald-500/20 bg-emerald-500/[0.01]"
          : "border-border"
    }`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {isMapped ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <AlertCircle className={`h-4 w-4 shrink-0 ${field.required ? 'text-amber-500' : 'text-muted-foreground/40'}`} />
        )}
        <Label className={`text-sm font-medium truncate ${muted ? 'text-muted-foreground/80' : ''}`}>
          {field.label}
          {field.required && !isMapped && (
            <span className="block text-[10px] font-normal text-amber-600 dark:text-amber-400 mt-0.5">Required mapping</span>
          )}
        </Label>
      </div>
      <Select value={field.value ?? '__none'} onValueChange={v => field.set(v === '__none' ? null : v)}>
        <SelectTrigger className="h-9 w-[160px] text-sm shrink-0 bg-background shadow-xs">
          <SelectValue placeholder="Select column..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">{field.required ? '(Not mapped)' : '(Skip)'}</SelectItem>
          {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function StatBox({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${truncate ? 'truncate' : ''}`} title={truncate ? value : undefined}>
        {value}
      </p>
    </div>
  );
}