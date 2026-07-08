# Decision Support System — Local Setup

Quick steps to get a local dev instance running and the DB prepared.

1. Install dependencies

```bash
npm install
```

2. Copy env example

```bash
cp .env.local.example .env.local
# fill the values in .env.local (Supabase project info)
```

3. Create your Supabase project (if using Supabase)

- Go to app.supabase.com → create new project
- In the SQL editor, run `sql/001_schema.sql`
- Run `sql/002_seed.sql` to add demo data

4. Start development server

```bash
npm run dev
```

Notes

- For server-side writes (persisting imports), set `SUPABASE_SERVICE_ROLE_KEY` in your environment.
- Do not commit `.env.local` to source control.
  This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
