import { normalizeDate } from './dateUtils';

export type ManualEntryType = 'operation' | 'inventory' | 'expense' | 'staffing' | 'service';

export type ManualOperationInput = {
  date?: unknown;
  service_name?: unknown;
  quantity?: unknown;
  revenue?: unknown;
  category?: unknown;
  price?: unknown;
  notes?: unknown;
  business_name?: unknown;
  time_of_day?: unknown;
};

export type ManualOperationNormalized = {
  date: string | null;
  service_name: string;
  quantity: number | null;
  revenue: number | null;
  category: string | null;
  price: number | null;
  notes: string | null;
  business_name: string | null;
  time_of_day: string | null;
  hour: number | null;
};

export type ManualInventoryInput = {
  name?: unknown;
  supplier?: unknown;
  stock?: unknown;
  reorder_point?: unknown;
  unit_cost?: unknown;
  /** Optional movement fields for history-friendly raw_import rows */
  month?: unknown;
  purchased?: unknown;
  used?: unknown;
  opening_stock?: unknown;
  closing_stock?: unknown;
  notes?: unknown;
};

export type ManualInventoryNormalized = {
  name: string;
  supplier: string | null;
  stock: number | null;
  reorder_point: number | null;
  unit_cost: number | null;
  month: string | null;
  purchased: number | null;
  used: number | null;
  opening_stock: number | null;
  closing_stock: number | null;
  notes: string | null;
};

export type ManualExpenseInput = {
  date?: unknown;
  category?: unknown;
  amount?: unknown;
  notes?: unknown;
  vendor?: unknown;
};

export type ManualExpenseNormalized = {
  date: string | null;
  category: string;
  amount: number | null;
  notes: string | null;
  vendor: string | null;
};

export type ManualStaffingInput = {
  date?: unknown;
  staff_name?: unknown;
  role?: unknown;
  hours_worked?: unknown;
  shift?: unknown;
  notes?: unknown;
};

export type ManualStaffingNormalized = {
  date: string | null;
  staff_name: string;
  role: string | null;
  hours_worked: number | null;
  shift: string | null;
  notes: string | null;
};

export type ManualServiceInput = {
  name?: unknown;
  category?: unknown;
  price?: unknown;
};

export type ManualServiceNormalized = {
  name: string;
  category: string | null;
  price: number | null;
};

export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const cleaned = String(value).replace(/[₱,$]/g, '').replace(/,/g, '').trim();
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseTimeOfDay(value: unknown): { time_of_day: string | null; hour: number | null } {
  if (value === undefined || value === null || value === '') {
    return { time_of_day: null, hour: null };
  }

  const fromFraction = (n: number): { time_of_day: string; hour: number } | null => {
    if (!Number.isFinite(n)) return null;
    let fraction = n;
    if (n >= 1) fraction = n - Math.floor(n);
    if (fraction < 0 || fraction >= 1) return null;

    const totalMinutes = Math.round(fraction * 24 * 60);
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;

    return {
      hour,
      time_of_day: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    };
  };

  if (typeof value === 'number') {
    const parsed = fromFraction(value);
    if (parsed) return parsed;
  }

  const raw = String(value).trim();
  if (!raw) return { time_of_day: null, hour: null };

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = fromFraction(Number(raw));
    if (parsed) return parsed;
  }

  const clockMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (clockMatch) {
    let hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2]);
    const meridiem = clockMatch[4]?.toUpperCase();

    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const sec = clockMatch[3] ?? '00';
      return {
        hour,
        time_of_day: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(sec).padStart(2, '0')}`,
      };
    }
  }

  const upper = raw.toUpperCase();
  if (upper === 'AM' || upper === 'MORNING' || upper.includes('MORNING')) {
    return { time_of_day: 'AM', hour: 10 };
  }
  if (upper === 'PM' || upper === 'AFTERNOON' || upper.includes('AFTERNOON')) {
    return { time_of_day: 'PM', hour: 15 };
  }
  if (upper === 'EVENING' || upper.includes('EVENING') || upper.includes('NIGHT')) {
    return { time_of_day: 'PM', hour: 19 };
  }

  return { time_of_day: raw, hour: null };
}

/** YYYY-MM from free text or date */
export function normalizeMonth(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  const ym = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) {
    const year = Number(ym[1]);
    const month = Number(ym[2]);
    if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
  }
  const date = normalizeDate(value);
  if (date) return date.slice(0, 7);
  return null;
}

export function validateManualOperationInput(input: ManualOperationInput) {
  const { time_of_day, hour } = parseTimeOfDay(input.time_of_day ?? null);
  const normalized: ManualOperationNormalized = {
    date: normalizeDate(input.date),
    service_name: normalizeText(input.service_name),
    quantity: normalizeNumber(input.quantity),
    revenue: normalizeNumber(input.revenue),
    category: normalizeText(input.category) || null,
    price: normalizeNumber(input.price),
    notes: normalizeText(input.notes) || null,
    business_name: normalizeText(input.business_name) || null,
    time_of_day,
    hour,
  };

  const errors: string[] = [];

  if (!normalized.date) errors.push('Date is required.');
  if (!normalized.service_name) errors.push('Service name is required.');
  if (normalized.quantity === null) errors.push('Quantity is required.');
  if (normalized.revenue === null) errors.push('Revenue is required.');
  if (normalized.price !== null && normalized.price < 0) errors.push('Price cannot be negative.');
  if (normalized.quantity !== null && normalized.quantity < 0) errors.push('Quantity cannot be negative.');

  return { normalized, errors };
}

export function validateInventoryInput(input: ManualInventoryInput) {
  const normalized: ManualInventoryNormalized = {
    name: normalizeText(input.name),
    supplier: normalizeText(input.supplier) || null,
    stock: normalizeNumber(input.stock),
    reorder_point: normalizeNumber(input.reorder_point),
    unit_cost: normalizeNumber(input.unit_cost),
    month: normalizeMonth(input.month),
    purchased: normalizeNumber(input.purchased),
    used: normalizeNumber(input.used),
    opening_stock: normalizeNumber(input.opening_stock),
    closing_stock: normalizeNumber(input.closing_stock),
    notes: normalizeText(input.notes) || null,
  };

  const errors: string[] = [];
  if (!normalized.name) errors.push('Product / item name is required.');
  if (normalized.stock === null && normalized.closing_stock === null) {
    errors.push('Current stock (or closing stock) is required.');
  }
  if (normalized.stock !== null && normalized.stock < 0) errors.push('Stock cannot be negative.');
  if (normalized.reorder_point !== null && normalized.reorder_point < 0) errors.push('Reorder point cannot be negative.');
  if (normalized.unit_cost !== null && normalized.unit_cost < 0) errors.push('Unit cost cannot be negative.');

  return { normalized, errors };
}

export function validateExpenseInput(input: ManualExpenseInput) {
  const normalized: ManualExpenseNormalized = {
    date: normalizeDate(input.date),
    category: normalizeText(input.category),
    amount: normalizeNumber(input.amount),
    notes: normalizeText(input.notes) || null,
    vendor: normalizeText(input.vendor) || null,
  };

  const errors: string[] = [];
  if (!normalized.date) errors.push('Date is required.');
  if (!normalized.category) errors.push('Expense category is required.');
  if (normalized.amount === null) errors.push('Amount is required.');
  if (normalized.amount !== null && normalized.amount < 0) errors.push('Amount cannot be negative.');

  return { normalized, errors };
}

export function validateStaffingInput(input: ManualStaffingInput) {
  const normalized: ManualStaffingNormalized = {
    date: normalizeDate(input.date),
    staff_name: normalizeText(input.staff_name),
    role: normalizeText(input.role) || null,
    hours_worked: normalizeNumber(input.hours_worked),
    shift: normalizeText(input.shift) || null,
    notes: normalizeText(input.notes) || null,
  };

  const errors: string[] = [];
  if (!normalized.date) errors.push('Date is required.');
  if (!normalized.staff_name) errors.push('Staff name is required.');
  if (normalized.hours_worked !== null && normalized.hours_worked < 0) {
    errors.push('Hours worked cannot be negative.');
  }

  return { normalized, errors };
}

export function validateServiceInput(input: ManualServiceInput) {
  const normalized: ManualServiceNormalized = {
    name: normalizeText(input.name),
    category: normalizeText(input.category) || null,
    price: normalizeNumber(input.price),
  };

  const errors: string[] = [];
  if (!normalized.name) errors.push('Service name is required.');
  if (normalized.price !== null && normalized.price < 0) errors.push('Price cannot be negative.');

  return { normalized, errors };
}

export function validateManualEntry(
  type: ManualEntryType,
  body: Record<string, unknown>
): { errors: string[]; normalized: Record<string, unknown> } {
  switch (type) {
    case 'operation': {
      const r = validateManualOperationInput(body);
      return { errors: r.errors, normalized: r.normalized as unknown as Record<string, unknown> };
    }
    case 'inventory': {
      const r = validateInventoryInput(body);
      return { errors: r.errors, normalized: r.normalized as unknown as Record<string, unknown> };
    }
    case 'expense': {
      const r = validateExpenseInput(body);
      return { errors: r.errors, normalized: r.normalized as unknown as Record<string, unknown> };
    }
    case 'staffing': {
      const r = validateStaffingInput(body);
      return { errors: r.errors, normalized: r.normalized as unknown as Record<string, unknown> };
    }
    case 'service': {
      const r = validateServiceInput(body);
      return { errors: r.errors, normalized: r.normalized as unknown as Record<string, unknown> };
    }
    default:
      return { errors: ['Unknown entry type.'], normalized: {} };
  }
}
