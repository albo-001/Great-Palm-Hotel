# DarkNode

A responsive recreation of the DarkNode investment dashboard reference, built with React, TypeScript, Vite, React Router, Tailwind CSS, Lucide icons, and Framer Motion.

## Routes

- `/` - Home stock list and search
- `/arena` - Investor rank and active auctions
- `/investments` - Portfolio summary and holdings
- `/account` - Account actions, preferences, and help

## Development

```sh
npm install
npm run dev
```

`npm run build` runs the TypeScript project build and creates the production bundle in `dist/`.

## M-Pesa and Supabase

Wallet deposits and withdrawals use authenticated Supabase Edge Functions. No Daraja credentials or service-role key are included in the frontend. Deposits remain pending until verified with Safaricom; withdrawals reserve wallet funds atomically and remain unresolved until a final B2C result or an audited administrator reconciliation.

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for database migrations, server-side secrets, callback setup, deployment, sandbox testing, transaction-status requests, and production approval gates. Safaricom B2C withdrawals are intentionally disabled until the account has explicit production approval.

Portfolio, auction, and investment activity remain a simulation; payment requests are not a substitute for legal, financial, or operational review before handling real funds.
