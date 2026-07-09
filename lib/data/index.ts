import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getSupabaseDashboardData } from './supabase'
import { createSupabaseRouteClient } from '@/src/lib/supabaseRoute'

// Resolves the current logged-in user's id once per request.
// `cache()` dedupes this across the 10 functions below, so a single
// page render (which may call several of these) only hits Supabase
// auth once, not ten times.
const getCurrentUserId = cache(async (): Promise<string> => {
  const client = await createSupabaseRouteClient()
  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    // Server Components can't return a 401 body the way an API route can —
    // redirecting to login is the correct behavior here.
    redirect('/login')
  }

  return user.id
})

export async function getMonths() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.months
}

export async function getRevenueSeries() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.revenueSeries
}

export async function getKPIsOverview() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.kpis
}

export async function getTopServices(limit = 5) {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.topServices.slice(0, limit)
}

export async function getRestockList() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.restockList
}

export async function getServicesForecastTable() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.serviceForecasts
}

export async function getInventoryItems() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.inventoryItems
}

export async function getFinancialSummary() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return {
    revenueSeries: data.revenueSeries ?? [],
    expenseSeries: data.expenseSeries ?? [],
    netIncomeSeries: data.netIncomeSeries ?? [],
  }
}

export async function getExpenseSeries() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.expenseSeries ?? []
}

export async function getDailyLog() {
  const userId = await getCurrentUserId()
  const data = await getSupabaseDashboardData(userId)
  return data.dailyLog ?? []
}