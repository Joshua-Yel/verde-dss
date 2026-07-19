import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createSupabaseRouteClient } from '@/src/lib/supabaseRoute'
import {
  getSupabaseDashboardData,
  getWeekdayPatterns,
  getServiceByWeekday,
  getExpenseCategoryBreakdown,
  getInventoryConsumptionSignal,
} from './supabase'

export type DashboardRangeOption = '1y' | '2y' | 'all';

interface DashboardDataOptions {
  businessId?: string | null
  userId?: string | null
  displayRange?: DashboardRangeOption
  lookbackMonths?: number
}

const getCurrentUserId = cache(async (): Promise<string> => {
  const client = await createSupabaseRouteClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return user.id
})

// NOTE: every getX() below independently calls getSupabaseDashboardData().
// This is intentional and cheap — getSupabaseDashboardData is wrapped in
// React's cache() (see supabase.ts), so all calls with the same
// (userId, businessId) within a single request/render dedupe into one
// underlying Supabase fetch sequence, no matter how many Suspense
// boundaries call in independently.

export async function getMonths(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.months
}

export async function getRevenueSeries(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.revenueSeries
}

export async function getKPIsOverview(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.kpis
}

export async function getTopServices(limit = 5, options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.topServices.slice(0, limit)
}

export async function getRestockList(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.restockList
}

export async function getServicesForecastTable(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.serviceForecasts
}

export async function getInventoryItems(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.inventoryItems
}

export async function getFinancialSummary(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return {
    revenueSeries: data.revenueSeries ?? [],
    expenseSeries: data.expenseSeries ?? [],
    netIncomeSeries: data.netIncomeSeries ?? [],
    periodLabels: data.periodLabels ?? [],
    expenseBreakdown: data.expenseBreakdown ?? [],
    forecastMethodUsed: data.forecastMethodUsed ?? 'WMA',
    confidenceBand: data.confidenceBand ?? null,
    dataAvailability: data.dataAvailability ?? null,
  }
}

export async function getExpenseSeries(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.expenseSeries ?? []
}

export async function getDailyLog(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  const data = await getSupabaseDashboardData(userId ?? '', {
    businessId: options?.businessId,
    lookbackMonths: options?.lookbackMonths,
    displayRange: options?.displayRange,
  })
  return data.dailyLog ?? []
}

export async function getWeekdayPatternsData(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  return getWeekdayPatterns(userId ?? '', { businessId: options?.businessId, lookbackMonths: options?.lookbackMonths })
}

export async function getServiceByWeekdayData(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  return getServiceByWeekday(userId ?? '', { businessId: options?.businessId, lookbackMonths: options?.lookbackMonths })
}

export async function getExpenseCategoryBreakdownData(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  return getExpenseCategoryBreakdown(userId ?? '', { businessId: options?.businessId, lookbackMonths: options?.lookbackMonths })
}

export async function getInventoryConsumptionSignalData(options?: DashboardDataOptions) {
  const userId = options?.userId ?? (options?.businessId ? null : await getCurrentUserId())
  return getInventoryConsumptionSignal(userId ?? '', { businessId: options?.businessId, displayRange: options?.displayRange })
}