# Supabase setup

The app uses Supabase Auth for email/password credentials and Postgres for profile, wallet, investment, auction, referral, and loan records. Deposit and withdrawal screens are display-only while a new payment method is being selected. The browser only receives the project URL and publishable/anon key. Never put a service-role key in a `VITE_*` variable or browser code.

## Configure a project

1. Create a Supabase project and enable email/password sign-in under **Authentication → Providers**.
2. In **Project Settings → API**, copy the project URL and publishable key (or legacy anon key).
3. Copy `.env.example` to `.env.local` and replace the Supabase placeholders.
4. In the Supabase SQL Editor, run the migrations in `supabase/migrations/` in date order. If the initial schema was already applied, run only migrations added afterward.
5. In **Authentication → URL Configuration**, set the local and deployed site URLs and add `/account` as an allowed redirect URL.
6. Configure email confirmation and SMTP before production use. New users start with a zero balance. Existing browser demo balances and records are deliberately not imported.
7. Create and deploy the Edge Functions in `supabase/functions/` after the migration is live and the secrets are configured.

When the environment variables are absent, the app stays in isolated browser-demo mode. That local demo data is never uploaded or migrated.

## M-Pesa and Supabase deployment

### 1) Apply the database migration

Run the SQL migrations in this order:

1. `supabase/migrations/202606010001_initial_backend.sql`
2. `supabase/migrations/202610170001_admin_user_profile_defaults.sql`
3. `supabase/migrations/202610180001_mpesa_wallet_integration.sql`
4. `supabase/migrations/202610190001_investment_returns.sql`
5. `supabase/migrations/202610190002_investment_returns_9_to_12.sql`
6. `supabase/migrations/202610190003_investment_return_swap.sql`
7. `supabase/migrations/202610200001_mpesa_reconciliation_hardening.sql`

This creates the profile, wallet, referral, transaction, and M-Pesa ledgers, protected RPCs, and simulated investment-return swap. The final M-Pesa migration keeps unresolved withdrawals blocked, creates an audited reconciliation path, protects destination/amount checks, and exposes receipt details only through the authenticated transaction-status function. Apply all migrations to a non-production project first.

### 2) Configure Supabase secrets

Set the values in your Supabase project secret manager (not in browser code):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MPESA_ENV`
- `MPESA_PRODUCTION_ENABLED`
 - `MPESA_ALLOWED_ORIGINS` (comma-separated exact HTTPS origins, plus `http://localhost:5173` for local development)
 - `MPESA_CONSUMER_KEY`
 - `MPESA_CONSUMER_SECRET`
 - `MPESA_SHORTCODE`
 - `MPESA_PARTY_B`
 - `MPESA_PASSKEY`
 - `MPESA_CALLBACK_BASE_URL` (e.g. `https://<project-ref>.supabase.co/functions/v1`)
 - `MPESA_CALLBACK_TOKEN`
 - `MPESA_ACCOUNT_REFERENCE`
 - `MPESA_MERCHANT_CONFIG_CONFIRMED`
 - `MPESA_TRANSACTION_TYPE` (`CustomerBuyGoodsOnline` for an approved Till product or `CustomerPayBillOnline` for an approved Paybill product)
 - `MPESA_MIN_AMOUNT_KES`
 - `MPESA_MAX_AMOUNT_KES`
 - `MPESA_USER_HOURLY_REQUEST_LIMIT`
 - `MPESA_B2C_ENABLED` and `MPESA_B2C_APPROVAL_CONFIRMED` (both must remain `false` until Safaricom has approved production B2C payouts)
 - `MPESA_B2C_SHORTCODE`, `MPESA_B2C_COMMAND_ID`, `MPESA_INITIATOR_NAME`, `MPESA_SECURITY_CREDENTIAL`
 - `MPESA_B2C_RESULT_TOKEN`, `MPESA_B2C_TIMEOUT_TOKEN`, `MPESA_MAX_WITHDRAWAL_KES`
 - `MPESA_RECONCILIATION_ADMIN_USER_IDS` (comma-separated Supabase Auth user UUID allowlist; never use a client-supplied admin role)

 Set secrets in the Supabase project secret manager or from a private local env file using `npx supabase secrets set --env-file <private-env-file> --project-ref <project-ref>`. Do not put server secrets in `.env.local`, frontend `VITE_*` variables, source files, SQL migrations, or logs. `MPESA_ALLOWED_ORIGINS` must list the site's exact origins; wildcard CORS is not used.

 ### 3) Deploy the Edge Functions

 From the project root:

 ```bash
 npx supabase db push --project-ref <project-ref>
 npx supabase functions deploy mpesa-deposit --project-ref <project-ref>
 npx supabase functions deploy mpesa-payments --project-ref <project-ref>
 npx supabase functions deploy mpesa-callback --project-ref <project-ref>
 npx supabase functions deploy mpesa-withdrawal --project-ref <project-ref>
 npx supabase functions deploy mpesa-b2c-result --project-ref <project-ref>
 npx supabase functions deploy mpesa-b2c-timeout --project-ref <project-ref>
 npx supabase functions deploy transaction-status --project-ref <project-ref>
 npx supabase functions deploy mpesa-admin-reconcile --project-ref <project-ref>
 ```

 `mpesa-payments` remains as a backward-compatible alias for `mpesa-deposit`. The browser now calls `mpesa-deposit` and `mpesa-withdrawal`; `transaction-status` returns only the signed-in user's records. All user-facing functions verify the Supabase JWT; Safaricom callbacks have JWT verification disabled in `supabase/config.toml` and use a separate high-entropy callback token plus transaction matching/provider checks.

 ### 4) Required Daraja and merchant configuration

 Before deposits can be enabled:

 - Safaricom sandbox credentials must be configured in Supabase secrets.
 - The merchant account must be an approved M-Pesa Till or paybill configuration.
 - `MPESA_MERCHANT_CONFIG_CONFIRMED` must be set to `true`.
 - `MPESA_TRANSACTION_TYPE` and `MPESA_PARTY_B` must match the actual approved Till/Paybill product configuration; not every Till supports the same STK product or passkey.
 - `MPESA_CALLBACK_BASE_URL` must be the HTTPS Supabase Functions base URL reachable from the public internet. Callback tokens are appended by the server and must be long, random values stored only as Supabase secrets.
 - `MPESA_PARTY_B` must match the approved merchant B-party shortcode used for the deposit flow.
 - For withdrawals, confirm that Safaricom has approved production B2C access, the shortcode, initiator, security credential, command, and callback URLs before setting `MPESA_PRODUCTION_ENABLED=true`, `MPESA_B2C_ENABLED=true`, and `MPESA_B2C_APPROVAL_CONFIRMED=true`. The code rejects B2C in sandbox and remains disabled otherwise.

 Switch production on only after completing sandbox and low-value controlled verification, confirming the correct Till/Paybill Daraja product and passkey with Safaricom, and reviewing production callback reachability. The frontend does not claim success from an STK acknowledgement or URL; only the server-side provider query and callback verification credit deposits. An uncertain payout keeps funds reserved and blocks another withdrawal until final callback or admin reconciliation.

 ### 5) Authenticated frontend requests

 The existing `supabase` client automatically attaches the current session JWT. The app's `src/lib/mpesaPayments.ts` wraps the requests; equivalent direct calls are:

 ```ts
 const { data: deposit, error } = await supabase.functions.invoke('mpesa-deposit', {
   body: {
     phone_number: '0712345678',
     amount_kes: 500,
     idempotency_key: crypto.randomUUID(),
   },
 })
 if (error) throw error

 const { data: withdrawal, error: withdrawalError } = await supabase.functions.invoke('mpesa-withdrawal', {
   body: { phone_number: '0712345678', amount_kes: 250 },
   headers: { 'idempotency-key': crypto.randomUUID() },
 })
 if (withdrawalError) throw withdrawalError

 const { data: status, error: statusError } = await supabase.functions.invoke('transaction-status', {
   body: { transaction_id: deposit.transaction_id },
 })
 if (statusError) throw statusError
 ```

 Generate and retain the same idempotency key when retrying an ambiguous request; do not create a new key or automatically retry a withdrawal until status is reconciled. The withdrawal function accepts signed-in users directly and does not require a server-only secret in browser headers. Its B2C approval gates remain authoritative. A `202` response means pending/submitted/reconciliation—not completed.

 ### 6) Administrator reconciliation

 Set `MPESA_RECONCILIATION_ADMIN_USER_IDS` to UUIDs of trusted Supabase Auth operators. After checking the matching provider transaction in Safaricom's portal and confirming amount, receipt, finality, and transaction reference, the operator can call `mpesa-admin-reconcile` with a valid JWT:

 ```ts
 await supabase.functions.invoke('mpesa-admin-reconcile', {
   body: {
     transaction_id: '<internal transaction UUID>',
     verified_status: 'succeeded', // or 'failed' only after a definitive provider outcome
     amount_kes: 500,
     receipt_number: '<Safaricom receipt for success>',
     evidence_reference: '<Safaricom portal transaction or case reference>',
     admin_note: 'Matched final Safaricom result and exact amount in the portal.',
   },
 })
 ```

 Successful reconciliation requires the exact stored amount and a receipt. A failed withdrawal is released atomically and creates a compensating ledger/history entry. Every reconciliation is stored in the service-only `mpesa_reconciliation_events` table. Never mark a timeout as failed without confirming Safaricom did not pay the recipient.

 ### 7) Test plan

 - Run `npm test` for client behavior, input validation, and origin allowlist tests; `npm run build` and `npm run lint` for frontend validation.
 - Use `npx supabase start`, `npx supabase db reset`, and `npx supabase functions serve --env-file <private-sandbox-env-file>` against sandbox credentials. Do not use real payment credentials in automated tests.
 - Test valid/invalid `07...`, `01...`, `2547...`, `2541...` numbers; fractional, over-limit, and malformed amounts; invalid/expired JWTs; and unapproved CORS origins.
 - Test sandbox STK acknowledgement, cancel/fail/success callbacks, replay a callback, and confirm one deposit ledger credit and one wallet transaction only. STK query or callback mismatch must lead to reconciliation, never a credit.
 - With production B2C approval only, test insufficient balance, parallel same-user withdrawals, idempotent retry using the same key, duplicate result callbacks, definitive failure and release, and timeout/unknown outcomes retaining the reservation. Verify there is never an automatic payout retry.
 - In a non-production database, call status APIs with another user's transaction UUID and confirm `404`; call direct user writes against wallets/ledger and confirm they are denied. Use two concurrent withdrawal requests whose sum is greater than the balance; at most one may reserve.
 - Exercise `mpesa-admin-reconcile` with a non-admin JWT, missing evidence, amount mismatch, reused receipt, and already-terminal transaction; all must be rejected without balance changes.

 This workspace's automated tests mock validation/client behavior; live Daraja calls and PostgreSQL concurrency behavior were not run here. Perform the listed Supabase integration tests before deployment.

## Security and operation boundaries

- Auth passwords are handled only by Supabase Auth. Full name and phone number are display fields in `profiles`.
- The app's public signup page uses `supabase.auth.signUp(...)`. Supabase Auth Admin API calls such as `supabase.auth.admin.createUser(...)` require a secret/service-role key and must only run in a trusted server or Supabase Edge Function, never in this browser app.
- Row-level security scopes profile and account records to their owner. Users cannot write wallet balances, ledger entries, referrals, investment positions, bids, or administrative review results directly.
- `buy_demo_investment`, `place_auction_bid`, and `swap_investment_returns` perform balance changes and create corresponding records inside database transactions. Simulated returns use a server-stored daily rate and can be transferred once per accrued amount; transfers do not change invested principal. The first investment receives a 20% user discount; the inviter receives a platform-funded 20% commission on the invitee's gross first investment. Unique constraints and database locking prevent duplicate payouts.
- The asset catalogue, displayed quotes, and investment records are a **simulation**, not brokerage orders, live prices, financial advice, or guaranteed returns. No broker or market-data provider is connected.
- M-Pesa deposit and withdrawal flows are server-side only. The frontend never holds Daraja credentials or service-role secrets. Wallet balance changes are not trusted to come from the browser; they come from the Supabase database and verified provider callbacks.
- Loan submissions are requests marked pending; no lending or credit decision is automated.
- Supabase service-role credentials must remain in a trusted server/secret manager. Never expose them to this frontend.

## Before launch

Deploy and test the migration against a non-production project first. Set up secure admin authorization and audited approval workflows for payment/loan requests, integrate real payment providers only through trusted server-side services, and obtain appropriate legal, financial, and security review before handling real funds or investments.
