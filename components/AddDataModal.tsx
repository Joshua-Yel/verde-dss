"use client"

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  Save,
  X,
  ClipboardList,
  Package,
  Wallet,
  Users,
  Scissors,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUI } from '@/components/UIContext';
import type { ManualEntryType } from '@/src/lib/manualEntry';

type CategoryMeta = {
  id: ManualEntryType;
  label: string;
  description: string;
  icon: React.ReactNode;
};

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'operation',
    label: 'Daily Log',
    description: 'Service sessions, revenue, and time of day',
    icon: <ClipboardList className="h-4 w-4" />,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Stock levels, reorder points, and movements',
    icon: <Package className="h-4 w-4" />,
  },
  {
    id: 'expense',
    label: 'Expense',
    description: 'Operating costs for financials & net income',
    icon: <Wallet className="h-4 w-4" />,
  },
  {
    id: 'staffing',
    label: 'Staffing',
    description: 'Who worked, hours, and shift notes',
    icon: <Users className="h-4 w-4" />,
  },
  {
    id: 'service',
    label: 'Service',
    description: 'Catalog name, category, and unit price',
    icon: <Scissors className="h-4 w-4" />,
  },
];

const emptyByType: Record<ManualEntryType, Record<string, string>> = {
  operation: {
    date: '',
    service_name: '',
    quantity: '',
    revenue: '',
    category: '',
    price: '',
    notes: '',
    time_of_day: '',
  },
  inventory: {
    name: '',
    supplier: '',
    stock: '',
    reorder_point: '',
    unit_cost: '',
    month: '',
    purchased: '',
    used: '',
    opening_stock: '',
    closing_stock: '',
    notes: '',
  },
  expense: {
    date: '',
    category: '',
    amount: '',
    vendor: '',
    notes: '',
  },
  staffing: {
    date: '',
    staff_name: '',
    role: '',
    hours_worked: '',
    shift: '',
    notes: '',
  },
  service: {
    name: '',
    category: '',
    price: '',
  },
};

function Field({
  id,
  label,
  children,
  span = 1,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  span?: 1 | 2;
}) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : 'sm:col-span-1'}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export default function AddDataModal() {
  const { addDataOpen, setAddDataOpen } = useUI();
  const [type, setType] = useState<ManualEntryType>('operation');
  const [form, setForm] = useState<Record<string, string>>(emptyByType.operation);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const activeCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === type) ?? CATEGORIES[0],
    [type]
  );

  if (!addDataOpen) return null;

  const switchType = (next: ManualEntryType) => {
    setType(next);
    setForm(emptyByType[next]);
    setError(null);
    setSuccess(null);
  };

  const handleChange = (field: string, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/add-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...form }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to save this record.');
      }

      setSuccess(payload.message || 'Record saved successfully.');
      setForm(emptyByType[type]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save this record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => setAddDataOpen(false)} />

      <div className="relative w-[780px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CalendarDays className="h-5 w-5 text-primary" />
              Add Data
            </div>
            <p className="text-sm text-zinc-500">
              Enter complete records by category — daily logs, inventory, expenses, staffing, or services.
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

        {/* Category tabs */}
        <div className="mb-5 flex flex-wrap gap-2 border-b border-zinc-100 pb-4">
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

        <p className="mb-4 text-xs text-zinc-500">{activeCategory.description}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          {type === 'operation' && (
            <>
              <Field id="manual-date" label="Date *">
                <Input
                  id="manual-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                />
              </Field>
              <Field id="manual-service" label="Service *">
                <Input
                  id="manual-service"
                  value={form.service_name}
                  placeholder="e.g. Consultation, Haircut"
                  onChange={(e) => handleChange('service_name', e.target.value)}
                />
              </Field>
              <Field id="manual-quantity" label="Quantity / Sessions *">
                <Input
                  id="manual-quantity"
                  type="number"
                  step="any"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => handleChange('quantity', e.target.value)}
                />
              </Field>
              <Field id="manual-revenue" label="Revenue *">
                <Input
                  id="manual-revenue"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.revenue}
                  onChange={(e) => handleChange('revenue', e.target.value)}
                />
              </Field>
              <Field id="manual-category" label="Category">
                <Input
                  id="manual-category"
                  value={form.category}
                  placeholder="Optional — e.g. Hair, Skin"
                  onChange={(e) => handleChange('category', e.target.value)}
                />
              </Field>
              <Field id="manual-price" label="Unit Price">
                <Input
                  id="manual-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => handleChange('price', e.target.value)}
                />
              </Field>
              <Field id="manual-time" label="Time of Day">
                <Input
                  id="manual-time"
                  value={form.time_of_day}
                  placeholder="e.g. 2:30 PM or AM / PM"
                  onChange={(e) => handleChange('time_of_day', e.target.value)}
                />
              </Field>
              <Field id="manual-notes" label="Notes">
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
              <Field id="inv-name" label="Product / Item Name *">
                <Input
                  id="inv-name"
                  value={form.name}
                  placeholder="e.g. Shampoo 1L"
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </Field>
              <Field id="inv-supplier" label="Supplier">
                <Input
                  id="inv-supplier"
                  value={form.supplier}
                  placeholder="Optional"
                  onChange={(e) => handleChange('supplier', e.target.value)}
                />
              </Field>
              <Field id="inv-stock" label="Current Stock *">
                <Input
                  id="inv-stock"
                  type="number"
                  step="1"
                  min="0"
                  value={form.stock}
                  onChange={(e) => handleChange('stock', e.target.value)}
                />
              </Field>
              <Field id="inv-rp" label="Reorder Point">
                <Input
                  id="inv-rp"
                  type="number"
                  step="1"
                  min="0"
                  value={form.reorder_point}
                  onChange={(e) => handleChange('reorder_point', e.target.value)}
                />
              </Field>
              <Field id="inv-cost" label="Unit Cost">
                <Input
                  id="inv-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unit_cost}
                  onChange={(e) => handleChange('unit_cost', e.target.value)}
                />
              </Field>
              <Field id="inv-month" label="Month (for movement history)">
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
              <Field id="exp-date" label="Date *">
                <Input
                  id="exp-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                />
              </Field>
              <Field id="exp-category" label="Category *">
                <Input
                  id="exp-category"
                  value={form.category}
                  placeholder="e.g. Rent, Utilities, Supplies"
                  onChange={(e) => handleChange('category', e.target.value)}
                />
              </Field>
              <Field id="exp-amount" label="Amount *">
                <Input
                  id="exp-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => handleChange('amount', e.target.value)}
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
              <Field id="st-date" label="Date *">
                <Input
                  id="st-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => handleChange('date', e.target.value)}
                />
              </Field>
              <Field id="st-name" label="Staff Name *">
                <Input
                  id="st-name"
                  value={form.staff_name}
                  placeholder="e.g. Maria Santos"
                  onChange={(e) => handleChange('staff_name', e.target.value)}
                />
              </Field>
              <Field id="st-role" label="Role">
                <Input
                  id="st-role"
                  value={form.role}
                  placeholder="e.g. Stylist, Front desk"
                  onChange={(e) => handleChange('role', e.target.value)}
                />
              </Field>
              <Field id="st-hours" label="Hours Worked">
                <Input
                  id="st-hours"
                  type="number"
                  step="0.25"
                  min="0"
                  value={form.hours_worked}
                  onChange={(e) => handleChange('hours_worked', e.target.value)}
                />
              </Field>
              <Field id="st-shift" label="Shift">
                <Input
                  id="st-shift"
                  value={form.shift}
                  placeholder="e.g. Morning, 9–5, Closing"
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
              <Field id="svc-name" label="Service Name *">
                <Input
                  id="svc-name"
                  value={form.name}
                  placeholder="e.g. Deep Conditioning"
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </Field>
              <Field id="svc-category" label="Category">
                <Input
                  id="svc-category"
                  value={form.category}
                  placeholder="e.g. Hair, Nails"
                  onChange={(e) => handleChange('category', e.target.value)}
                />
              </Field>
              <Field id="svc-price" label="Unit Price">
                <Input
                  id="svc-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => handleChange('price', e.target.value)}
                />
              </Field>
            </>
          )}
        </div>

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

        <div className="mt-5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-400">
            Required fields marked with *. Inventory movements and expenses feed the same analytics as Excel imports.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => setAddDataOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Record'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}