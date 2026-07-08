import { getSupabaseDashboardData } from './supabase'

export async function getMonths() {
  const data = await getSupabaseDashboardData()
  return data.months
}

export async function getRevenueSeries() {
  const data = await getSupabaseDashboardData()
  return data.revenueSeries
}

export async function getKPIsOverview() {
  const data = await getSupabaseDashboardData()
  return data.kpis
}

export async function getTopServices(limit = 5) {
  const data = await getSupabaseDashboardData()
  return data.topServices.slice(0, limit)
}

export async function getRestockList() {
  const data = await getSupabaseDashboardData()
  return data.restockList
}

export async function getServicesForecastTable() {
  const data = await getSupabaseDashboardData()
  return data.serviceForecasts
}

export async function getInventoryItems() {
  const data = await getSupabaseDashboardData()
  return data.inventoryItems
}

export async function getFinancialSummary() {
  const data = await getSupabaseDashboardData()
  return {
    revenueSeries: data.revenueSeries ?? [],
    expenseSeries: data.expenseSeries ?? [],
    netIncomeSeries: data.netIncomeSeries ?? [],
  }
}

export async function getExpenseSeries() {
  const data = await getSupabaseDashboardData()
  return data.expenseSeries ?? []
}

export async function getDailyLog() {
  const data = await getSupabaseDashboardData()
  return data.dailyLog ?? []
}
