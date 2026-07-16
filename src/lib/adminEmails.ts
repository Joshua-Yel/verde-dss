function normalizeEmails(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const DEFAULT_ADMIN_EMAILS = normalizeEmails(
  process.env.NEXT_PUBLIC_ADMIN_EMAILS || process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL
);

export function getConfiguredAdminEmails() {
  return DEFAULT_ADMIN_EMAILS;
}
