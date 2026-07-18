/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const fetch =
  global.fetch ||
  function () {
    return import("node-fetch").then((m) => m.default.apply(null, arguments));
  };
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const s = fs.readFileSync(envPath, "utf8");
  s.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)=(?:"(.*)"|(.*))$/);
    if (m) process.env[m[1]] = m[2] === undefined ? m[3] : m[2];
  });
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE URL or key in env");
  process.exit(1);
}
(async () => {
  const endpoint =
    url.replace(/\/$/, "") +
    "/rest/v1/businesses?select=id,owner_id,name&order=created_at.asc&limit=100";
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: "Bearer " + key },
  });
  const j = await res.json();
  console.log(JSON.stringify(j, null, 2));
})();
