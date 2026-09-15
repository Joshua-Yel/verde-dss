"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Save,
  X,
  ClipboardList,
  Package,
  Wallet,
  Users,
  Scissors,
  Plus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUI } from '@/components/UIContext';
import {
  type ManualEntryType,
  revenuePriceWarning,
  inventoryBalanceWarning,
} from '@/src/lib/manualEntry';
import { todayISODate, todayISOMonth } from '@/src/lib/dateUtils';

type CategoryMeta = {
  id: ManualEntryType;
  label: string;
  description: string;
  appearsOn: string;
  icon: React.ReactNode;
};

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'operation',
    label: 'Daily Log',
    description: 'Service sessions, revenue, and time of day',
    appearsOn: 'Overview · Daily Log · Staffing peaks',
    icon: <ClipboardList className="h-4 w-4" />,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Stock levels, reorder points, and movements',
    appearsOn: 'Inventory · Reorder alerts',
    icon: <Package className="h-4 w-4" />,
  },
  {
    id: 'expense',
    label: 'Expense',
    description: 'Operating costs for financials & net income',
    appearsOn: 'Financials · Net income',
    icon: <Wallet className="h-4 w-4" />,
  },
  {
    id: 'staffing',
    label: 'Staffing',
    description: 'Who worked, hours, and shift notes',
    appearsOn: 'Audit log (demand plans stay forecast-based)',
    icon: <Users className="h-4 w-4" />,
  },
  {
    id: 'service',
    label: 'Service',
    description: 'Catalog name, category, and unit price',
    appearsOn: 'Service catalog · forecasts',
    icon: <Scissors className="h-4 w-4" />,
  },
];

type OptionsPayload = {
  services: Array<{ name: string; category: string | null; price: number | null }>;
  products: Array<{
    name: string;
    supplier: string | null;
    stock: number;
    reorder_point: number;
    unit_cost: number;
  }>;
  serviceCategories: string[];
  expenseCategories: string[];
  suppliers: string[];
  staffNames: string[];
  roles: string[];
};

function emptyForm(type: ManualEntryType): Record<string, string> {
  const today = todayISODate();
  const month = todayISOMonth();
  switch (type) {
    case 'operation':
      return {
        date: today,
        service_name: '',
        quantity: '',
        revenue: '',
        category: '',
        price: '',
        notes: '',
        time_of_day: '',
      };
    case 'inventory':
      return {
        name: '',
        supplier: '',
        stock: '',
        reorder_point: '',
        unit_cost: '',
        month,
        purchased: '',
        used: '',
        opening_stock: '',
        closing_stock: '',
        notes: '',
      };
    case 'expense':
      return { date: today, category: '', amount: '', vendor: '', notes: '' };
    case 'staffing':
      return { date: today, staff_name: '', role: '', hours_worked: '', shift: '', notes: '' };
    case 'service':
      return { name: '', category: '', price: '' };
    default:
      return {};
  }
}

function Field({
  id,
  label,
  children,
  span = 1,
  error,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  span?: 1 | 2;
  error?: string;
  hint?: string;
}) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : 'sm:col-span-1'}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-[11px] text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
        ₱
      </span>
      <Input
        id={id}
        type="number"
        step="0.01"
        min="0"
        className="pl-7"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SuggestList({
  open,
  items,
  onPick,
}: {
  open: boolean;
  items: string[];
  onPick: (value: string) => void;
}) {
  if (!open || items.length === 0) return null;
  return (
    <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg">
      {items.slice(0, 12).map((item) => (
        <li key={item}>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left hover:bg-zinc-100"
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
          >
            {item}
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function AddDataModal() {
  const { addDataOpen, setAddDataOpen } = useUI();
  const [type, setType] = useState<ManualEntryType>('operation');
  const [form, setForm] = useState<Record<string, string>>(() => emptyForm('operation'));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [activeSuggest, setActiveSuggest] = useState<string | null>(null);
  const [inventoryConfirm, setInventoryConfirm] = useState<{
    name: string;
    previous: number;
    next: number;
  } | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const activeCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === type) ?? CATEGORIES[0],
    [type]
  );

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/add-data/options');
      if (!res.ok) return;
      const payload = (await res.json()) as OptionsPayload;
      setOptions(payload);
    } catch {
      // Autocomplete is best-effort
    }
  }, []);

  useEffect(() => {
    if (addDataOpen) {
      loadOptions();
      setType('operation');
      setForm(emptyForm('operation'));
      setError(null);
      setFieldErrors({});
      setSuccess(null);
      setInventoryConfirm(null);
    }
  }, [addDataOpen, loadOptions]);

  // Soft validation warnings — must stay above any early return (Rules of Hooks).
  const softWarning = useMemo(() => {
    if (type === 'operation') {
      return revenuePriceWarning(form.quantity ?? '', form.price ?? '', form.revenue ?? '');
    }
    if (type === 'inventory') {
      return inventoryBalanceWarning(
        form.opening_stock ?? '',
        form.purchased ?? '',
        form.used ?? '',
        form.closing_stock ?? ''
      );
    }
    return null;
  }, [type, form]);

  // Cmd/Ctrl+Enter to save · Esc to close
  useEffect(() => {
    if (!addDataOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        // Dispatched via custom event so we don't close over a stale submit
        window.dispatchEvent(new CustomEvent('add-data-save'));
      }
      if (e.key === 'Escape') {
        setAddDataOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addDataOpen, setAddDataOpen]);

  // Listener for keyboard save (stable, no stale closure on submit)
  const submitRef = useRef<(addAnother: boolean, skipInventoryConfirm?: boolean) => Promise<void>>(
    async () => {}
  );

  useEffect(() => {
    if (!addDataOpen) return;
    const onSave = () => {
      void submitRef.current(false);
    };
    window.addEventListener('add-data-save', onSave);
    return () => window.removeEventListener('add-data-save', onSave);
  }, [addDataOpen]);

  if (!addDataOpen) return null;

  const switchType = (next: ManualEntryType) => {
    setType(next);
    setForm(emptyForm(next));
    setError(null);
    setFieldErrors({});
    setSuccess(null);
    setInventoryConfirm(null);
    setActiveSuggest(null);
  };

  const handleChange = (field: string, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccess(null);
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const filterSuggest = (pool: string[], query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return pool.slice(0, 12);
    return pool.filter((item) => item.toLowerCase().includes(q)).slice(0, 12);
  };

  const pickService = (name: string) => {
    const match = options?.services.find((s) => s.name === name);
    setForm((current) => ({
      ...current,
      service_name: name,
      category: match?.category ?? current.category,
      price:
        match?.price != null && match.price !== null && !Number.isNaN(match.price)
          ? String(match.price)
          : current.price,
    }));
    setActiveSuggest(null);
  };

  const pickProduct = (name: string) => {
    const match = options?.products.find((p) => p.name === name);
    setForm((current) => ({
      ...current,
      name,
      supplier: match?.supplier ?? current.supplier,
      stock: match ? String(match.stock) : current.stock,
      reorder_point: match ? String(match.reorder_point) : current.reorder_point,
      unit_cost: match ? String(match.unit_cost) : current.unit_cost,
    }));
    setActiveSuggest(null);
  };

  const submit = async (addAnother: boolean, skipInventoryConfirm = false) => {
    if (saving) return;

    // Inventory upsert confirmation when product already exists and stock changes
    if (type === 'inventory' && !skipInventoryConfirm && options) {
      const match = options.products.find(
        (p) => p.name.toLowerCase() === (form.name ?? '').trim().toLowerCase()
      );
      const nextStock = form.stock !== '' ? Number(form.stock) : Number(form.closing_stock || NaN);
      if (match && Number.isFinite(nextStock) && nextStock !== match.stock) {
        setInventoryConfirm({ name: match.name, previous: match.stock, next: nextStock });
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setInventoryConfirm(null);

    try {
      const response = await fetch('/api/add-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...form }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload.fieldErrors && typeof payload.fieldErrors === 'object') {
          setFieldErrors(payload.fieldErrors as Record<string, string>);
        }
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to save this record.');
      }

      setSuccess(payload.message || 'Record saved successfully.');
      await loadOptions();

      if (addAnother) {
        // Keep date / type; clear the rest
        const next = emptyForm(type);
        if ('date' in form) next.date = form.date || todayISODate();
        if ('month' in form) next.month = form.month || todayISOMonth();
        setForm(next);
      } else {
        setForm(emptyForm(type));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this record.');
    } finally {
      setSaving(false);
    }
  };

  // Keep keyboard handler pointed at latest submit (defined after early-return-safe hooks).
  submitRef.current = submit;

  const serviceNames = options?.services.map((s) => s.name) ?? [];
  const productNames = options?.products.map((p) => p.name) ?? [];
  const expenseCats = options?.expenseCategories ?? [];
  const serviceCats = options?.serviceCategories ?? [];
  const suppliers = options?.suppliers ?? [];
  const staffNames = options?.staffNames ?? [];
  const roles = options?.roles ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => setAddDataOpen(false)} />

      <div
        ref={formRef}
        className="relative w-[800px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Add Data"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays className="h-5 w-5 text-primary" />
              Add Data
            </div>
            <p className="text-sm text-zinc-500">
              Enter complete records by category. Excel import remains for bulk history.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAddDataOpen(false)}
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Close add data modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 border-b border-zinc-100 pb-4">
          {CATEGORIES.map((cat) => {
            const active = cat.id === type;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => switchType(cat.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900'
                }`}
              >
                {cat.icon}
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="mb-4 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">{activeCategory.description}</p>
          <p className="text-[11px] text-zinc-400">Shows on: {activeCategory.appearsOn}</p>
        </div>

        {/* Inventory confirm banner */}
        {inventoryConfirm && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">
              Update stock for “{inventoryConfirm.name}”?
            </p>
            <p className="mt-0.5 text-xs">
              Current stock <strong>{inventoryConfirm.previous}</strong> → new value{' '}
              <strong>{inventoryConfirm.next}</strong>
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInventoryConfirm(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={() => void submit(false, true)} disabled={saving}>
                Confirm update
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {type === 'operation' && (
            <>
              <Field id="manual-date" label="Date *" error={fieldErrors.date}>
                <Input
                  id="manual-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                />
              </Field>
              <Field id="manual-service" label="Service *" error={fieldErrors.service_name}>
                <div className="relative">
                  <Input
                    id="manual-service"
                    value={form.service_name}
                    placeholder="e.g. Consultation, Haircut"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('service')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('service_name', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'service'}
                    items={filterSuggest(serviceNames, form.service_name ?? '')}
                    onPick={pickService}
                  />
                </div>
              </Field>
              <Field id="manual-quantity" label="Quantity / Sessions *" error={fieldErrors.quantity}>
                <Input
                  id="manual-quantity"
                  type="number"
                  step="any"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => handleChange('quantity', e.target.value)}
                />
              </Field>
              <Field id="manual-revenue" label="Revenue *" error={fieldErrors.revenue}>
                <MoneyInput
                  id="manual-revenue"
                  value={form.revenue}
                  onChange={(v) => handleChange('revenue', v)}
                />
              </Field>
              <Field id="manual-category" label="Category">
                <div className="relative">
                  <Input
                    id="manual-category"
                    value={form.category}
                    placeholder="e.g. Hair, Skin"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('svcCat')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('category', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'svcCat'}
                    items={filterSuggest(serviceCats, form.category ?? '')}
                    onPick={(v) => {
                      handleChange('category', v);
                      setActiveSuggest(null);
                    }}
                  />
                </div>
              </Field>
              <Field id="manual-price" label="Unit Price" error={fieldErrors.price}>
                <MoneyInput
                  id="manual-price"
                  value={form.price}
                  onChange={(v) => handleChange('price', v)}
                />
              </Field>
              <Field id="manual-time" label="Time of Day" hint="e.g. 2:30 PM, AM, Afternoon">
                <Input
                  id="manual-time"
                  value={form.time_of_day}
                  placeholder="2:30 PM"
                  onChange={(e) => handleChange('time_of_day', e.target.value)}
                />
              </Field>
              <Field
                id="manual-notes"
                label="Notes"
                hint="Stored as an audit note (no extra DB column required)"
              >
                <Input
                  id="manual-notes"
                  value={form.notes}
                  placeholder="Optional"
                  onChange={(e) => handleChange('notes', e.target.value)}
                />
              </Field>
            </>
          )}

          {type === 'inventory' && (
            <>
              <Field id="inv-name" label="Product / Item Name *" error={fieldErrors.name}>
                <div className="relative">
                  <Input
                    id="inv-name"
                    value={form.name}
                    placeholder="e.g. Shampoo 1L"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('product')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('name', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'product'}
                    items={filterSuggest(productNames, form.name ?? '')}
                    onPick={pickProduct}
                  />
                </div>
              </Field>
              <Field id="inv-supplier" label="Supplier">
                <div className="relative">
                  <Input
                    id="inv-supplier"
                    value={form.supplier}
                    placeholder="Optional"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('supplier')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('supplier', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'supplier'}
                    items={filterSuggest(suppliers, form.supplier ?? '')}
                    onPick={(v) => {
                      handleChange('supplier', v);
                      setActiveSuggest(null);
                    }}
                  />
                </div>
              </Field>
              <Field id="inv-stock" label="Current Stock *" error={fieldErrors.stock}>
                <Input
                  id="inv-stock"
                  type="number"
                  step="1"
                  min="0"
                  value={form.stock}
                  onChange={(e) => handleChange('stock', e.target.value)}
                />
              </Field>
              <Field id="inv-rp" label="Reorder Point" error={fieldErrors.reorder_point}>
                <Input
                  id="inv-rp"
                  type="number"
                  step="1"
                  min="0"
                  value={form.reorder_point}
                  onChange={(e) => handleChange('reorder_point', e.target.value)}
                />
              </Field>
              <Field id="inv-cost" label="Unit Cost" error={fieldErrors.unit_cost}>
                <MoneyInput
                  id="inv-cost"
                  value={form.unit_cost}
                  onChange={(v) => handleChange('unit_cost', v)}
                />
              </Field>
              <Field id="inv-month" label="Month (movement history)">
                <Input
                  id="inv-month"
                  type="month"
                  value={form.month}
                  onChange={(e) => handleChange('month', e.target.value)}
                />
              </Field>
              <Field id="inv-opening" label="Opening Stock">
                <Input
                  id="inv-opening"
                  type="number"
                  step="1"
                  min="0"
                  value={form.opening_stock}
                  onChange={(e) => handleChange('opening_stock', e.target.value)}
                />
              </Field>
              <Field id="inv-purchased" label="Purchased">
                <Input
                  id="inv-purchased"
                  type="number"
                  step="1"
                  min="0"
                  value={form.purchased}
                  onChange={(e) => handleChange('purchased', e.target.value)}
                />
              </Field>
              <Field id="inv-used" label="Used / Consumed">
                <Input
                  id="inv-used"
                  type="number"
                  step="1"
                  min="0"
                  value={form.used}
                  onChange={(e) => handleChange('used', e.target.value)}
                />
              </Field>
              <Field id="inv-closing" label="Closing Stock">
                <Input
                  id="inv-closing"
                  type="number"
                  step="1"
                  min="0"
                  value={form.closing_stock}
                  onChange={(e) => handleChange('closing_stock', e.target.value)}
                />
              </Field>
              <Field id="inv-notes" label="Notes" span={2}>
                <Input
                  id="inv-notes"
                  value={form.notes}
                  placeholder="Optional"
                  onChange={(e) => handleChange('notes', e.target.value)}
                />
              </Field>
            </>
          )}

          {type === 'expense' && (
            <>
              <Field id="exp-date" label="Date *" error={fieldErrors.date}>
                <Input
                  id="exp-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                />
              </Field>
              <Field id="exp-category" label="Category *" error={fieldErrors.category}>
                <div className="relative">
                  <Input
                    id="exp-category"
                    value={form.category}
                    placeholder="e.g. Rent, Utilities"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('expCat')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('category', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'expCat'}
                    items={filterSuggest(expenseCats, form.category ?? '')}
                    onPick={(v) => {
                      handleChange('category', v);
                      setActiveSuggest(null);
                    }}
                  />
                </div>
              </Field>
              <Field id="exp-amount" label="Amount *" error={fieldErrors.amount}>
                <MoneyInput
                  id="exp-amount"
                  value={form.amount}
                  onChange={(v) => handleChange('amount', v)}
                />
              </Field>
              <Field id="exp-vendor" label="Vendor / Payee">
                <Input
                  id="exp-vendor"
                  value={form.vendor}
                  placeholder="Optional"
                  onChange={(e) => handleChange('vendor', e.target.value)}
                />
              </Field>
              <Field id="exp-notes" label="Notes" span={2}>
                <Input
                  id="exp-notes"
                  value={form.notes}
                  placeholder="Optional"
                  onChange={(e) => handleChange('notes', e.target.value)}
                />
              </Field>
            </>
          )}

          {type === 'staffing' && (
            <>
              <Field id="st-date" label="Date *" error={fieldErrors.date}>
                <Input
                  id="st-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                />
              </Field>
              <Field id="st-name" label="Staff Name *" error={fieldErrors.staff_name}>
                <div className="relative">
                  <Input
                    id="st-name"
                    value={form.staff_name}
                    placeholder="e.g. Maria Santos"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('staff')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('staff_name', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'staff'}
                    items={filterSuggest(staffNames, form.staff_name ?? '')}
                    onPick={(v) => {
                      handleChange('staff_name', v);
                      setActiveSuggest(null);
                    }}
                  />
                </div>
              </Field>
              <Field id="st-role" label="Role">
                <div className="relative">
                  <Input
                    id="st-role"
                    value={form.role}
                    placeholder="e.g. Stylist, Front desk"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('role')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('role', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'role'}
                    items={filterSuggest(roles, form.role ?? '')}
                    onPick={(v) => {
                      handleChange('role', v);
                      setActiveSuggest(null);
                    }}
                  />
                </div>
              </Field>
              <Field id="st-hours" label="Hours Worked" error={fieldErrors.hours_worked}>
                <Input
                  id="st-hours"
                  type="number"
                  step="0.25"
                  min="0"
                  max="24"
                  value={form.hours_worked}
                  onChange={(e) => handleChange('hours_worked', e.target.value)}
                />
              </Field>
              <Field id="st-shift" label="Shift">
                <Input
                  id="st-shift"
                  value={form.shift}
                  placeholder="e.g. Morning, 9–5"
                  onChange={(e) => handleChange('shift', e.target.value)}
                />
              </Field>
              <Field id="st-notes" label="Notes">
                <Input
                  id="st-notes"
                  value={form.notes}
                  placeholder="Optional"
                  onChange={(e) => handleChange('notes', e.target.value)}
                />
              </Field>
            </>
          )}

          {type === 'service' && (
            <>
              <Field id="svc-name" label="Service Name *" error={fieldErrors.name}>
                <div className="relative">
                  <Input
                    id="svc-name"
                    value={form.name}
                    placeholder="e.g. Deep Conditioning"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('svcName')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('name', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'svcName'}
                    items={filterSuggest(serviceNames, form.name ?? '')}
                    onPick={(v) => {
                      const match = options?.services.find((s) => s.name === v);
                      setForm((current) => ({
                        ...current,
                        name: v,
                        category: match?.category ?? current.category,
                        price:
                          match?.price != null ? String(match.price) : current.price,
                      }));
                      setActiveSuggest(null);
                    }}
                  />
                </div>
              </Field>
              <Field id="svc-category" label="Category">
                <div className="relative">
                  <Input
                    id="svc-category"
                    value={form.category}
                    placeholder="e.g. Hair, Nails"
                    autoComplete="off"
                    onFocus={() => setActiveSuggest('svcCat2')}
                    onBlur={() => setTimeout(() => setActiveSuggest(null), 150)}
                    onChange={(e) => handleChange('category', e.target.value)}
                  />
                  <SuggestList
                    open={activeSuggest === 'svcCat2'}
                    items={filterSuggest(serviceCats, form.category ?? '')}
                    onPick={(v) => {
                      handleChange('category', v);
                      setActiveSuggest(null);
                    }}
                  />
                </div>
              </Field>
              <Field id="svc-price" label="Unit Price" error={fieldErrors.price}>
                <MoneyInput
                  id="svc-price"
                  value={form.price}
                  onChange={(v) => handleChange('price', v)}
                />
              </Field>
            </>
          )}
        </div>

        {softWarning && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {softWarning}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-zinc-400">
            Required *. Shortcuts: <kbd className="rounded bg-zinc-100 px-1">Ctrl</kbd>+
            <kbd className="rounded bg-zinc-100 px-1">Enter</kbd> save ·{' '}
            <kbd className="rounded bg-zinc-100 px-1">Esc</kbd> close
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setAddDataOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => void submit(true)} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save & add another'}
            </Button>
            <Button onClick={() => void submit(false)} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Record'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}