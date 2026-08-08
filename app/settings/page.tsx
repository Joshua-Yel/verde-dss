"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { Button } from "@/components/ui/button";
import { canAccessModule, getUserRole } from "@/src/lib/roleAccess";
import {
  DeleteConfirmationModal,
  RESET_MODAL_CONFIG,
  type ResetAction,
} from "@/components/settings/delete-confirmation-modal";

type UserRow = {
  id: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: boolean;
};

type SettingsState = {
  businessProfile: {
    name: string;
    address: string;
    contactEmail: string;
    phone: string;
    industry: string;
    currency: string;
    dateFormat: string;
  };
  forecasting: {
    method: string;
    forecastPeriod: number;
    movingAverageWeights: string;
    historicalPeriod: number;
    lowStockThreshold: number;
    criticalStockThreshold: number;
    stockoutThreshold: number;
    overstockThreshold: number;
    financialWarningThreshold: number;
    minimumStaff: number;
    maximumStaff: number;
    capacityPerShift: number;
  };
  notifications: {
    lowStock: boolean;
    criticalStock: boolean;
    financialAlerts: boolean;
    importAlerts: boolean;
    forecastAlerts: boolean;
  };
  reports: {
    reportTitle: string;
    defaultPeriod: string;
    currency: string;
    dateFormat: string;
  };
  ai: {
    enabled: boolean;
    recommendationMode: string;
    usageLimit: number;
  };
};

const defaultSettings = (): SettingsState => ({
  businessProfile: {
    name: "",
    address: "",
    contactEmail: "",
    phone: "",
    industry: "",
    currency: "PHP",
    dateFormat: "DD/MM/YYYY",
  },
  forecasting: {
    method: "Weighted Moving Average",
    forecastPeriod: 30,
    movingAverageWeights: "0.5, 0.3, 0.2",
    historicalPeriod: 6,
    lowStockThreshold: 15,
    criticalStockThreshold: 5,
    stockoutThreshold: 0,
    overstockThreshold: 40,
    financialWarningThreshold: 10,
    minimumStaff: 2,
    maximumStaff: 6,
    capacityPerShift: 4,
  },
  notifications: {
    lowStock: true,
    criticalStock: true,
    financialAlerts: true,
    importAlerts: true,
    forecastAlerts: false,
  },
  reports: {
    reportTitle: "VERDE Business Summary",
    defaultPeriod: "Monthly",
    currency: "PHP",
    dateFormat: "MM/DD/YYYY",
  },
  ai: {
    enabled: true,
    recommendationMode: "Explain + recommend",
    usageLimit: 200,
  },
});

const ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "finance", label: "Finance" },
  { value: "inventory", label: "Inventory" },
  { value: "staff", label: "Staff" },
  { value: "user", label: "User" },
] as const;

const NOTIFICATION_ITEMS: Array<{ key: keyof SettingsState["notifications"]; label: string }> = [
  { key: "lowStock", label: "Low stock" },
  { key: "criticalStock", label: "Critical stock" },
  { key: "financialAlerts", label: "Financial" },
  { key: "importAlerts", label: "Imports" },
  { key: "forecastAlerts", label: "Forecasts" },
];

const fieldClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30";
const labelClass = "block space-y-1.5 text-sm";
const labelTextClass = "text-muted-foreground";

function Section({
  title,
  children,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`rounded-lg border bg-card ${danger ? "border-red-500/25" : "border-border"}`}
    >
      <div className={`border-b px-5 py-3 ${danger ? "border-red-500/20" : "border-border"}`}>
        <h2 className={`text-sm font-medium ${danger ? "text-red-600 dark:text-red-400" : ""}`}>
          {title}
        </h2>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { session } = useAuth();
  const role = getUserRole(
    session?.user
      ? { app_metadata: session.user.app_metadata, user_metadata: session.user.user_metadata }
      : null
  );
  const canAccess = useMemo(() => canAccessModule(role, "settings"), [role]);

  const [business, setBusiness] = useState({ id: "", name: "", currency: "PHP" });
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetAction, setResetAction] = useState<ResetAction | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }

    let ignore = false;

    async function loadSettings() {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const body = await response.json().catch(() => ({ error: "Unable to load settings." }));
        if (!response.ok) throw new Error(body.error || "Unable to load settings.");
        if (ignore) return;

        const payload = body ?? {};
        const fromServer = payload.settings ?? {};

        setBusiness({
          id: payload.business?.id ?? "",
          name: payload.business?.name ?? "",
          currency: payload.business?.currency ?? "PHP",
        });

        setSettings({
          businessProfile: {
            name: payload.business?.name ?? fromServer.businessProfile?.name ?? "",
            address: fromServer.businessProfile?.address ?? "",
            contactEmail: fromServer.businessProfile?.contactEmail ?? "",
            phone: fromServer.businessProfile?.phone ?? "",
            industry: fromServer.businessProfile?.industry ?? "",
            currency: payload.business?.currency ?? fromServer.businessProfile?.currency ?? "PHP",
            dateFormat: fromServer.businessProfile?.dateFormat ?? "DD/MM/YYYY",
          },
          forecasting: {
            method: fromServer.forecasting?.method ?? "Weighted Moving Average",
            forecastPeriod: Number(fromServer.forecasting?.forecastPeriod ?? 30),
            movingAverageWeights: fromServer.forecasting?.movingAverageWeights ?? "0.5, 0.3, 0.2",
            historicalPeriod: Number(fromServer.forecasting?.historicalPeriod ?? 6),
            lowStockThreshold: Number(fromServer.forecasting?.lowStockThreshold ?? 15),
            criticalStockThreshold: Number(fromServer.forecasting?.criticalStockThreshold ?? 5),
            stockoutThreshold: Number(fromServer.forecasting?.stockoutThreshold ?? 0),
            overstockThreshold: Number(fromServer.forecasting?.overstockThreshold ?? 40),
            financialWarningThreshold: Number(fromServer.forecasting?.financialWarningThreshold ?? 10),
            minimumStaff: Number(fromServer.forecasting?.minimumStaff ?? 2),
            maximumStaff: Number(fromServer.forecasting?.maximumStaff ?? 6),
            capacityPerShift: Number(fromServer.forecasting?.capacityPerShift ?? 4),
          },
          notifications: {
            lowStock: Boolean(fromServer.notifications?.lowStock ?? true),
            criticalStock: Boolean(fromServer.notifications?.criticalStock ?? true),
            financialAlerts: Boolean(fromServer.notifications?.financialAlerts ?? true),
            importAlerts: Boolean(fromServer.notifications?.importAlerts ?? true),
            forecastAlerts: Boolean(fromServer.notifications?.forecastAlerts ?? false),
          },
          reports: {
            reportTitle: fromServer.reports?.reportTitle ?? "VERDE Business Summary",
            defaultPeriod: fromServer.reports?.defaultPeriod ?? "Monthly",
            currency: fromServer.reports?.currency ?? payload.business?.currency ?? "PHP",
            dateFormat: fromServer.reports?.dateFormat ?? "MM/DD/YYYY",
          },
          ai: {
            enabled: Boolean(fromServer.ai?.enabled ?? true),
            recommendationMode: fromServer.ai?.recommendationMode ?? "Explain + recommend",
            usageLimit: Number(fromServer.ai?.usageLimit ?? 200),
          },
        });

        setUsers(Array.isArray(payload.users) ? payload.users : []);
      } catch (error) {
        if (!ignore) {
          setFeedback({
            type: "error",
            message: error instanceof Error ? error.message : "Unable to load settings.",
          });
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadSettings();
    return () => {
      ignore = true;
    };
  }, [session]);

  if (!session || !canAccess) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Settings is limited to owner and admin accounts.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const updateProfile = (field: keyof SettingsState["businessProfile"], value: string) => {
    setSettings((current) => ({
      ...current,
      businessProfile: { ...current.businessProfile, [field]: value },
    }));
    if (field === "name" || field === "currency") {
      setBusiness((current) => ({
        ...current,
        name: field === "name" ? value : current.name,
        currency: field === "currency" ? value : current.currency,
      }));
    }
  };

  const updateForecast = <K extends keyof SettingsState["forecasting"]>(
    field: K,
    value: SettingsState["forecasting"][K]
  ) => {
    setSettings((current) => ({
      ...current,
      forecasting: { ...current.forecasting, [field]: value },
    }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: {
            name: settings.businessProfile.name || business.name,
            currency: settings.businessProfile.currency || business.currency,
          },
          settings,
          users,
        }),
      });
      const body = await response.json().catch(() => ({ error: "Settings could not be saved." }));
      if (!response.ok) throw new Error(body.error || "Settings could not be saved.");

      setBusiness((current) => ({
        ...current,
        name: settings.businessProfile.name || current.name,
        currency: settings.businessProfile.currency || current.currency,
      }));
      setFeedback({ type: "success", message: "Saved." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Settings could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  };

  const exportBackup = async () => {
    setFeedback(null);
    try {
      const response = await fetch("/api/settings/backup", { method: "GET" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Unable to export backup." }));
        throw new Error(body.error || "Unable to export backup.");
      }
      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `verde-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setFeedback({ type: "success", message: "Backup downloaded." });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to export backup.",
      });
    }
  };

  const runReset = async (action: ResetAction) => {
    setResetting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirm: true }),
      });
      const body = await response.json().catch(() => ({ error: "Reset failed." }));
      if (!response.ok) throw new Error(body.error || "Reset failed.");
      setFeedback({ type: "success", message: body.message || "Done." });
      setResetAction(null);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Reset failed.",
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace config for {business.name || "this business"}
          </p>
        </div>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {feedback && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Section title="Business">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              <span className={labelTextClass}>Name</span>
              <input
                className={fieldClass}
                value={settings.businessProfile.name || business.name}
                onChange={(e) => updateProfile("name", e.target.value)}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Industry</span>
              <input
                className={fieldClass}
                value={settings.businessProfile.industry}
                onChange={(e) => updateProfile("industry", e.target.value)}
              />
            </label>
          </div>
          <label className={labelClass}>
            <span className={labelTextClass}>Address</span>
            <input
              className={fieldClass}
              value={settings.businessProfile.address}
              onChange={(e) => updateProfile("address", e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              <span className={labelTextClass}>Email</span>
              <input
                type="email"
                className={fieldClass}
                value={settings.businessProfile.contactEmail}
                onChange={(e) => updateProfile("contactEmail", e.target.value)}
              />
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Phone</span>
              <input
                className={fieldClass}
                value={settings.businessProfile.phone}
                onChange={(e) => updateProfile("phone", e.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              <span className={labelTextClass}>Currency</span>
              <select
                className={fieldClass}
                value={settings.businessProfile.currency || business.currency}
                onChange={(e) => updateProfile("currency", e.target.value)}
              >
                <option value="PHP">PHP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label className={labelClass}>
              <span className={labelTextClass}>Date format</span>
              <select
                className={fieldClass}
                value={settings.businessProfile.dateFormat}
                onChange={(e) => updateProfile("dateFormat", e.target.value)}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </label>
          </div>
        </Section>

        <Section title="Members">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {users.map((user) => (
                <li key={user.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {user.email || user.full_name || "Unknown"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {user.is_active ? "Active" : "Inactive"}
                    </div>
                  </div>
                  <select
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                    value={user.role || "user"}
                    onChange={(e) =>
                      setUsers((current) =>
                        current.map((row) =>
                          row.id === user.id ? { ...row, role: e.target.value } : row
                        )
                      )
                    }
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Forecasting">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            <span className={labelTextClass}>Method</span>
            <select
              className={fieldClass}
              value={settings.forecasting.method}
              onChange={(e) => updateForecast("method", e.target.value)}
            >
              <option>Weighted Moving Average</option>
              <option>Simple Moving Average</option>
              <option>Exponential Smoothing</option>
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Forecast period (days)</span>
            <input
              type="number"
              min={1}
              className={fieldClass}
              value={settings.forecasting.forecastPeriod}
              onChange={(e) => updateForecast("forecastPeriod", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>WMA weights</span>
            <input
              className={fieldClass}
              value={settings.forecasting.movingAverageWeights}
              onChange={(e) => updateForecast("movingAverageWeights", e.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Historical period (months)</span>
            <input
              type="number"
              min={1}
              className={fieldClass}
              value={settings.forecasting.historicalPeriod}
              onChange={(e) => updateForecast("historicalPeriod", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Low stock threshold</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.forecasting.lowStockThreshold}
              onChange={(e) => updateForecast("lowStockThreshold", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Critical stock threshold</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.forecasting.criticalStockThreshold}
              onChange={(e) => updateForecast("criticalStockThreshold", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Stockout threshold</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.forecasting.stockoutThreshold}
              onChange={(e) => updateForecast("stockoutThreshold", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Overstock threshold</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.forecasting.overstockThreshold}
              onChange={(e) => updateForecast("overstockThreshold", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Financial warning (%)</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.forecasting.financialWarningThreshold}
              onChange={(e) => updateForecast("financialWarningThreshold", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Min staff</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.forecasting.minimumStaff}
              onChange={(e) => updateForecast("minimumStaff", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Max staff</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.forecasting.maximumStaff}
              onChange={(e) => updateForecast("maximumStaff", Number(e.target.value))}
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Capacity per shift</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.forecasting.capacityPerShift}
              onChange={(e) => updateForecast("capacityPerShift", Number(e.target.value))}
            />
          </label>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Notifications">
          <div className="space-y-2">
            {NOTIFICATION_ITEMS.map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(settings.notifications[item.key])}
                  onChange={(e) =>
                    setSettings((current) => ({
                      ...current,
                      notifications: { ...current.notifications, [item.key]: e.target.checked },
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </Section>

        <Section title="Reports">
          <label className={labelClass}>
            <span className={labelTextClass}>Title</span>
            <input
              className={fieldClass}
              value={settings.reports.reportTitle}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  reports: { ...current.reports, reportTitle: e.target.value },
                }))
              }
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Default period</span>
            <select
              className={fieldClass}
              value={settings.reports.defaultPeriod}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  reports: { ...current.reports, defaultPeriod: e.target.value },
                }))
              }
            >
              <option>Monthly</option>
              <option>Quarterly</option>
              <option>Yearly</option>
            </select>
          </label>
        </Section>

        <Section title="ARIA">
          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <span>Enabled</span>
            <input
              type="checkbox"
              checked={settings.ai.enabled}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  ai: { ...current.ai, enabled: e.target.checked },
                }))
              }
            />
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Mode</span>
            <select
              className={fieldClass}
              value={settings.ai.recommendationMode}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  ai: { ...current.ai, recommendationMode: e.target.value },
                }))
              }
            >
              <option>Explain + recommend</option>
              <option>Explain only</option>
              <option>Recommend only</option>
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelTextClass}>Usage limit</span>
            <input
              type="number"
              min={0}
              className={fieldClass}
              value={settings.ai.usageLimit}
              onChange={(e) =>
                setSettings((current) => ({
                  ...current,
                  ai: { ...current.ai, usageLimit: Number(e.target.value) },
                }))
              }
            />
          </label>
        </Section>
      </div>

      <Section title="Data" danger>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={exportBackup}>
            Export backup
          </Button>
          <Button type="button" variant="outline" onClick={() => setResetAction("operational")}>
            Clear operational data
          </Button>
          <Button type="button" variant="outline" onClick={() => setResetAction("forecast")}>
            Clear forecasts
          </Button>
          <Button type="button" variant="outline" onClick={() => setResetAction("everything")}>
            Reset transactional data
          </Button>
        </div>

        <div className="rounded-md border border-dashed border-border p-3">
          <div className="text-sm font-medium">Inspect backup</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Counts only — records are not listed here.
          </p>
          <input
            type="file"
            accept="application/json,.json"
            className="mt-3 block w-full text-sm text-muted-foreground"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const backup = JSON.parse(text);
                const summary = backup?.summary;
                const services =
                  summary?.services ?? (Array.isArray(backup?.services) ? backup.services.length : 0);
                const inventory =
                  summary?.inventory_items ??
                  (Array.isArray(backup?.inventory_items) ? backup.inventory_items.length : 0);
                const operations =
                  summary?.daily_operations ??
                  (Array.isArray(backup?.daily_operations) ? backup.daily_operations.length : 0);
                setFeedback({
                  type: "success",
                  message: `${file.name}: ${services} services, ${inventory} inventory, ${operations} operations`,
                });
              } catch (error) {
                setFeedback({
                  type: "error",
                  message: error instanceof Error ? error.message : "Could not read backup file.",
                });
              } finally {
                event.target.value = "";
              }
            }}
          />
        </div>
      </Section>

      <Section title="System">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-muted-foreground">Version</dt>
            <dd>1.0.0</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-muted-foreground">Business</dt>
            <dd className="truncate">{business.name || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-muted-foreground">Currency</dt>
            <dd>{business.currency || "PHP"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-muted-foreground">Members</dt>
            <dd>{users.length}</dd>
          </div>
        </dl>
      </Section>

      <DeleteConfirmationModal
        open={resetAction !== null}
        config={resetAction ? RESET_MODAL_CONFIG[resetAction] : null}
        busy={resetting}
        onCancel={() => {
          if (!resetting) setResetAction(null);
        }}
        onConfirm={runReset}
      />
    </div>
  );
}