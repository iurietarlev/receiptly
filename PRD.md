# Receiptly — Product Requirements Document (PRD)

**Version:** 1.0
**Date:** 2026-03-21
**Status:** Draft

---

## 1. Overview

Receiptly is a web application that bridges two ecosystems: SumUp (merchant payment processing) and Xero (business accounting). It serves as an intermediary platform where business customers can retrieve receipts for card transactions made at SumUp-powered merchants, then push those transactions directly into their Xero accounting software as invoices/bills.

**Tech Stack:** Next.js 14 (App Router) + Convex (serverless backend/database) + Clerk (authentication) + ShadCN/ui + TailwindCSS.

---

## 2. Problem Statement

Business customers who pay at merchants using credit/debit cards often need those transaction receipts for accounting and tax purposes. Today, retrieving receipts involves contacting merchants directly, searching through email, or manually entering data into accounting software. This is time-consuming, error-prone, and does not scale.

Merchants using SumUp as their payment processor have transaction data accessible via API, but there is no self-service mechanism for their customers to pull receipts and push them into accounting tools like Xero.

Receiptly solves this by:

1. Allowing merchants to authorise access to their SumUp transaction history.
2. Allowing business customers to look up their own transactions by card last-4-digits across all participating merchants.
3. Enabling one-click push of selected transactions into Xero as invoices/bills.

---

## 3. User Personas

### 3.1 Merchant (SumUp Business)

- **Who:** A business that accepts payments through SumUp terminals/POS.
- **Goal:** Onboard onto Receiptly so their customers can self-serve receipt retrieval.
- **Pain point:** Fielding receipt requests from customers is manual and disruptive.
- **Interaction frequency:** Infrequent after initial setup (occasional dashboard checks).
- **Clerk role:** `merchant`

### 3.2 Business Customer (Xero User)

- **Who:** A business that pays at merchant outlets with corporate credit/debit cards and uses Xero for accounting.
- **Goal:** Find transaction receipts and push them into Xero with minimal manual work.
- **Pain point:** Reconciling card transactions against receipts and entering them into Xero is tedious.
- **Interaction frequency:** Weekly or monthly (aligned with accounting cycles).
- **Clerk role:** `customer`

---

## 4. User Flows

### 4.1 Merchant Onboarding Flow

```
1. Merchant navigates to /signup or /sign-in (Clerk modal)
2. During or after signup, selects role "Merchant"
3. Redirected to /merchant/onboarding
4. Clicks "Connect SumUp" button
5. Redirected to SumUp OAuth authorize URL
6. Grants permission (scope: transactions.history)
7. SumUp redirects back to /api/callbacks/sumup (Convex HTTP endpoint)
8. Server exchanges authorization code for access_token + refresh_token
9. Tokens + merchant_code stored in `merchants` table
10. Merchant lands on /merchant/dashboard showing connection status
```

### 4.2 Customer Card Management Flow

```
1. Customer navigates to /sign-in (Clerk modal)
2. After auth, lands on /dashboard
3. Customer adds cards to their profile via Settings or a dedicated Cards section:
   a. Enters the last 4 digits of a card (nothing else is stored)
   b. Optionally gives the card a label (e.g., "Company Amex", "Personal Visa")
   c. Card is saved to the `user_cards` table
4. Customer can view, edit (update label), or delete saved cards at any time
5. Multiple cards can be added per user
```

### 4.3 Customer Transaction Lookup Flow

```
1. Customer navigates to /dashboard
2. Transactions are automatically fetched using ALL of the customer's saved cards
   — no manual search required; all matching transactions appear in a unified list
3. Optionally, customer can filter by a specific card or date range
4. Results displayed: date, merchant, amount, currency, card type, status, which card matched
5. Customer selects one or more transactions via checkboxes
```

### 4.4 Xero Push Flow

```
1. Customer selects transactions on /dashboard
2. If not yet connected to Xero:
   a. Clicks "Connect Xero"
   b. Redirected to Xero OAuth 2.0 authorize URL
   c. Grants permission
   d. Redirected back to /api/callbacks/xero
   e. Tokens stored in `xero_connections` table
3. Clicks "Push to Xero"
4. Convex action calls Xero API for each selected transaction
5. Creates invoices/bills (ACCPAY type) in user's Xero tenant
6. UI shows success/failure status per transaction
7. Pushed transactions marked in DB to prevent duplicates
```

### 4.5 Background Transaction Sync Flow

```
1. Convex cron job fires every 6 hours
2. For each merchant with status "active":
   a. Internal action fetches transactions from SumUp API
   b. Uses oldest_time = last_sync_timestamp to fetch only new data
   c. Paginates through all results using cursor (oldest_ref/newest_ref)
   d. Each transaction upserted into `transactions` table (dedup by transactionCode)
   e. Sync log entry created/updated
3. On-demand sync: if a customer searches and the relevant merchant's
   last sync was >1 hour ago, trigger an immediate sync for that merchant
```

### 4.6 Merchant Directory Flow

```
1. Any authenticated user navigates to /merchants
2. Sees list of all merchants with status "active"
3. Shows merchant name, category/type, connection status
4. No sensitive data exposed (no tokens, no merchant_code)
```

---

## 5. System Architecture

### 5.1 High-Level Architecture

```
[Browser / Next.js Client]
    |
    |-- Clerk (auth provider, JWT tokens)
    |-- Convex React Client (real-time queries/mutations)
    |
[Convex Backend]
    |-- Queries: transaction lookup, merchant list, sync status
    |-- Mutations: store tokens, mark transactions as pushed
    |-- Actions: SumUp API calls, Xero API calls, OAuth token exchange
    |-- HTTP Endpoints: OAuth callbacks (/api/callbacks/sumup, /api/callbacks/xero)
    |-- Cron Jobs: 6-hour transaction sync
    |
[External APIs]
    |-- SumUp API (GET /v2.1/merchants/{code}/transactions/history)
    |-- Xero API (POST invoices/bills)
```

### 5.2 Convex File Organisation

```
convex/
  schema.ts              -- Database schema (all tables + indexes)
  auth.config.js         -- Clerk JWT config (already exists)
  http.ts                -- HTTP endpoints for OAuth callbacks
  crons.ts               -- Scheduled sync jobs

  // Domain modules
  users.ts               -- User queries/mutations (role management)
  userCards.ts            -- Card management queries/mutations (add, list, update, delete)
  merchants.ts           -- Merchant queries/mutations (public-facing)
  merchantsInternal.ts   -- Internal merchant functions (token management)
  transactions.ts        -- Transaction queries (customer-facing lookup)
  transactionsInternal.ts-- Internal transaction sync logic
  sumup.ts               -- SumUp API actions (fetch transactions, OAuth)
  xero.ts                -- Xero API actions (push invoices, OAuth)
  syncLog.ts             -- Sync logging queries/mutations
```

### 5.3 Next.js Route Organisation

```
app/
  page.tsx                    -- Landing page (public)
  sign-in/[[...sign-in]]/     -- Clerk sign-in page
  sign-up/[[...sign-up]]/     -- Clerk sign-up page

  (authenticated)/            -- Route group with auth middleware
    dashboard/
      page.tsx                -- Customer dashboard (auto-matched transactions + Xero push)
    cards/
      page.tsx                -- Card management (add, view, edit, delete saved cards)
    merchants/
      page.tsx                -- Merchant directory

    merchant/                 -- Merchant-only routes
      dashboard/
        page.tsx              -- Merchant dashboard (connection status, sync logs)
      onboarding/
        page.tsx              -- SumUp OAuth connection flow

    settings/
      page.tsx                -- Account settings, Xero connection management
```

---

## 6. Database Schema

All tables defined in `convex/schema.ts`.

### 6.1 `users` Table

Stores application-level user data linked to Clerk identity.

| Field | Type | Notes |
|-------|------|-------|
| tokenIdentifier | `v.string()` | From `ctx.auth.getUserIdentity().tokenIdentifier` |
| email | `v.string()` | User email |
| name | `v.optional(v.string())` | Display name |
| role | `v.union(v.literal("merchant"), v.literal("customer"))` | User type |

**Indexes:**
- `by_tokenIdentifier`: `["tokenIdentifier"]`
- `by_role`: `["role"]`

### 6.2 `user_cards` Table

Stores saved card last-4-digits per customer. Only the last 4 digits are stored — no full card numbers, no PANs, no sensitive card data.

| Field | Type | Notes |
|-------|------|-------|
| userId | `v.id("users")` | FK to users table |
| cardLast4 | `v.string()` | Last 4 digits of the card |
| label | `v.optional(v.string())` | User-defined label (e.g., "Company Amex") |

**Indexes:**
- `by_userId`: `["userId"]` — list all cards for a user
- `by_userId_and_cardLast4`: `["userId", "cardLast4"]` — prevent duplicates per user

### 6.3 `merchants` Table

Stores merchant details and SumUp OAuth credentials.

| Field | Type | Notes |
|-------|------|-------|
| userId | `v.id("users")` | FK to users table |
| merchantCode | `v.string()` | SumUp merchant code |
| businessName | `v.string()` | Display name |
| status | `v.union(v.literal("active"), v.literal("inactive"), v.literal("pending"))` | Connection status |
| sumupAccessToken | `v.string()` | SumUp access token |
| sumupRefreshToken | `v.string()` | SumUp refresh token |
| sumupTokenExpiresAt | `v.number()` | Token expiry timestamp (ms) |
| lastSyncAt | `v.optional(v.number())` | Last successful sync timestamp |

**Indexes:**
- `by_userId`: `["userId"]`
- `by_status`: `["status"]`
- `by_merchantCode`: `["merchantCode"]`

### 6.4 `transactions` Table

Synced transaction data from SumUp. Core lookup table.

| Field | Type | Notes |
|-------|------|-------|
| merchantId | `v.id("merchants")` | FK to merchants table |
| transactionCode | `v.string()` | SumUp unique transaction ID (dedup key) |
| amount | `v.number()` | Transaction amount |
| currency | `v.string()` | ISO currency code |
| status | `v.string()` | Transaction status from SumUp |
| paymentType | `v.optional(v.string())` | e.g., "ECOM", "POS" |
| entryMode | `v.optional(v.string())` | e.g., "CONTACTLESS" |
| cardLast4 | `v.optional(v.string())` | Last 4 digits of card |
| cardType | `v.optional(v.string())` | e.g., "VISA", "MASTERCARD" |
| timestamp | `v.number()` | Transaction timestamp (ms) |
| merchantName | `v.string()` | Denormalised for query performance |
| pushedToXero | `v.optional(v.boolean())` | Whether already pushed |
| xeroInvoiceId | `v.optional(v.string())` | Xero invoice/bill ID if pushed |
| rawData | `v.optional(v.any())` | Full SumUp response for reference |

**Indexes:**
- `by_transactionCode`: `["transactionCode"]` — deduplication on upsert
- `by_cardLast4_and_timestamp`: `["cardLast4", "timestamp"]` — primary customer lookup
- `by_merchantId_and_timestamp`: `["merchantId", "timestamp"]` — merchant-scoped queries
- `by_merchantId`: `["merchantId"]`

### 6.5 `xero_connections` Table

Per-user Xero OAuth credentials.

| Field | Type | Notes |
|-------|------|-------|
| userId | `v.id("users")` | FK to users table |
| xeroTenantId | `v.string()` | Xero organisation tenant ID |
| accessToken | `v.string()` | Xero OAuth access token |
| refreshToken | `v.string()` | Xero OAuth refresh token |
| tokenExpiresAt | `v.number()` | Token expiry timestamp (ms) |
| tenantName | `v.optional(v.string())` | Xero org display name |

**Indexes:**
- `by_userId`: `["userId"]`

### 6.6 `sync_log` Table

Tracks sync operations per merchant.

| Field | Type | Notes |
|-------|------|-------|
| merchantId | `v.id("merchants")` | FK to merchants table |
| startedAt | `v.number()` | Sync start timestamp |
| completedAt | `v.optional(v.number())` | Sync completion timestamp |
| status | `v.union(v.literal("running"), v.literal("success"), v.literal("failed"))` | Sync outcome |
| transactionsFetched | `v.optional(v.number())` | Count of transactions fetched |
| transactionsInserted | `v.optional(v.number())` | Count of new transactions inserted |
| errorMessage | `v.optional(v.string())` | Error details if failed |

**Indexes:**
- `by_merchantId_and_startedAt`: `["merchantId", "startedAt"]`

---

## 7. API Integrations

### 7.1 SumUp Integration

**OAuth 2.0 Authorization Code Flow:**

1. **Authorize URL:** `https://api.sumup.com/authorize?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=transactions.history`
2. **Token Exchange:** `POST https://api.sumup.com/token` with `grant_type=authorization_code`
3. **Token Refresh:** `POST https://api.sumup.com/token` with `grant_type=refresh_token`
4. **Token Lifetime:** Access token ~1 hour; refresh token ~6 months

**Transaction History Endpoint:**

- `GET https://api.sumup.com/v2.1/merchants/{merchant_code}/transactions/history`
- Headers: `Authorization: Bearer {access_token}`
- Query params: `oldest_time`, `newest_time`, `statuses[]`, `limit`, `order`
- Pagination: cursor-based via `oldest_ref` / `newest_ref` in response links
- Response includes `card.last_4_digits` and `card.type` as nested fields

**Key constraint:** SumUp does NOT support filtering by card last-4-digits or card type as query parameters. All transactions must be fetched and stored locally, with filtering performed via Convex indexed queries on `cardLast4`.

### 7.2 Xero Integration

**OAuth 2.0 Authorization Code Flow:**

1. **Authorize URL:** `https://login.xero.com/identity/connect/authorize?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&scope=openid profile email accounting.transactions offline_access`
2. **Token Exchange:** `POST https://identity.xero.com/connect/token`
3. **Token Refresh:** Same endpoint with `grant_type=refresh_token`
4. **Connections:** `GET https://api.xero.com/connections` to get tenant IDs after auth

**Invoice/Bill Creation:**

- `PUT https://api.xero.com/api.xro/2.0/Invoices`
- Creates an `ACCPAY` type invoice (bill) for each selected transaction
- Maps transaction fields: date, amount, currency, merchant name as contact, description with card/transaction details

---

## 8. Security Considerations

### 8.1 OAuth Token Storage

- SumUp and Xero tokens are stored in Convex DB (encrypted at rest by Convex).
- Access to token fields restricted: never return tokens in public queries. Use `internalQuery`/`internalMutation` for all token read/write operations.
- Token refresh logic in internal actions only, never exposed publicly.

### 8.2 Authentication and Authorisation

- All user identity derived server-side via `ctx.auth.getUserIdentity()`. Never accept `userId` as a function argument.
- Use `tokenIdentifier` (not `subject`) as the canonical identity key.
- Role-based access: merchant-only functions must verify `user.role === "merchant"` server-side.
- Customer queries must only return transaction data (no tokens, no merchant internal details).

### 8.3 OAuth CSRF Protection

- Both SumUp and Xero OAuth flows must use a `state` parameter.
- Generate a random state string, store temporarily, and validate on callback.

### 8.4 Data Access Boundaries

- Customers can see transactions but NOT merchant OAuth details.
- Merchants can see their own sync logs and connection status but NOT other merchants' data.
- The `transactions` table is accessible to all authenticated customers by design — the card-last-4 filter is a UX convenience, not a security boundary.

### 8.5 Environment Variables

Required (stored in Convex dashboard, not in code):

- `SUMUP_CLIENT_ID`, `SUMUP_CLIENT_SECRET`, `SUMUP_REDIRECT_URI`
- `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI`
- `CLERK_JWT_ISSUER_DOMAIN` (already configured)

---

## 9. Technical Constraints

### 9.1 SumUp API Constraints

- No server-side filtering by card digits. All transactions must be fetched and stored locally, then filtered by Convex indexed query on `cardLast4`.
- Pagination cursor-based, default page size 10. Should increase `limit` to reduce API calls during sync.
- Rate limits not explicitly documented; implement exponential backoff in sync actions.

### 9.2 Convex Constraints

- **No `.filter()` in queries** — must use indexed queries with `.withIndex()`.
- **Batch processing** required for large sync operations. Use `ctx.scheduler.runAfter(0, ...)` for continuation when hitting limits.
- **Actions cannot access `ctx.db`** — must call mutations/queries via `ctx.runMutation`/`ctx.runQuery`.
- **Node.js actions** — any action using Node.js built-ins must be in a file with `"use node"` at top and must not export queries/mutations from the same file.
- **1MB document size limit** — `rawData` field on transactions should be kept minimal.

### 9.3 Sync Strategy Details

- **Scheduled sync:** Every 6 hours via Convex cron.
- **Incremental sync:** Use `oldest_time` set to `merchant.lastSyncAt` to fetch only new transactions.
- **Deduplication:** Before inserting, query `by_transactionCode` index. If exists, skip or update.
- **On-demand sync:** When a customer searches, check if any relevant merchant's `lastSyncAt` is older than 1 hour. If so, schedule an immediate sync and inform the user data may take a moment to refresh.
- **Pagination handling:** The sync action must loop through all pages using cursor params until no more results. Each page's transactions should be inserted via a mutation call (batched).

---

## 10. MVP Scope

### 10.1 In Scope

1. Clerk authentication with role selection (merchant/customer) during onboarding
2. Merchant SumUp OAuth connection flow with token storage
3. Background transaction sync (6-hour cron) with incremental fetching and dedup
4. Customer card management — add, view, edit label, and delete saved cards (last 4 digits only)
5. Customer transaction lookup — automatic matching against all saved cards, with optional per-card and date range filters
6. Xero OAuth connection flow with token storage
7. Push to Xero — create bills/invoices from selected transactions
8. Merchant directory — list of active merchants
9. Merchant dashboard — connection status, last sync time, basic sync logs
10. Customer dashboard — transaction search, selection, Xero push
11. Token refresh logic for both SumUp and Xero
12. Mobile-friendly responsive design — all screens usable on mobile devices

### 10.2 Out of Scope

- Email notifications for sync failures
- Webhook-based real-time transaction updates from SumUp
- Bulk export to CSV/PDF
- Multi-currency conversion
- Admin panel for platform operators
- Merchant analytics or reporting
- Xero bank transaction reconciliation
- Multi-tenant Xero (multiple Xero orgs per user)

---

## 11. Future Considerations

1. **Webhook integration:** SumUp may offer webhooks for real-time transaction notifications, eliminating polling.
2. **Additional accounting platforms:** QuickBooks, FreshBooks, Sage integration.
3. **Receipt attachments:** If SumUp provides receipt images/PDFs, attach to Xero invoices.
4. **Merchant verification:** KYB (Know Your Business) flow before allowing merchants to onboard.
5. **Smart matching:** ML-based transaction matching beyond card-last-4 (e.g., amount + time proximity).
6. **Audit trail:** Full audit log of who accessed what transactions and when.
7. **Rate limiting:** Per-user rate limits on on-demand sync triggers.
8. **Token encryption:** Application-level encryption of OAuth tokens before storing in Convex.
9. **Batch Xero push:** Use Xero batch API for pushing multiple invoices in a single call.

---

## 12. Implementation Sequencing

### Phase 1: Foundation
- Replace boilerplate schema with production schema in `convex/schema.ts`
- Create `convex/users.ts` with user creation/lookup functions
- Set up role-based routing in Next.js (merchant vs. customer dashboards)
- Build basic layout shell with navigation

### Phase 2: Merchant Onboarding
- Create `convex/http.ts` with SumUp OAuth callback endpoint
- Create `convex/sumup.ts` with OAuth token exchange action
- Create `convex/merchants.ts` and `convex/merchantsInternal.ts`
- Build merchant onboarding page and dashboard

### Phase 3: Transaction Sync
- Create `convex/transactionsInternal.ts` with sync logic (paginated fetch, dedup, batch insert)
- Create `convex/crons.ts` with 6-hour sync schedule
- Create `convex/syncLog.ts` for sync tracking
- Implement token refresh logic for SumUp
- Test with real SumUp sandbox data

### Phase 4: Customer Experience
- Create `convex/userCards.ts` with card CRUD (add, list, update label, delete)
- Build card management UI (add/view/edit/delete saved cards)
- Create `convex/transactions.ts` with indexed card-last-4 query supporting multiple cards
- Build customer dashboard that auto-fetches transactions for all saved cards
- Add per-card filter and date range filter to dashboard
- Implement on-demand sync trigger
- Build merchant directory page

### Phase 5: Xero Integration
- Create `convex/xero.ts` with OAuth flow and invoice creation actions
- Add Xero callback to `convex/http.ts`
- Build Xero connection UI in settings
- Implement "Push to Xero" flow with status feedback
- Mark pushed transactions to prevent duplicates

### Phase 6: Polish and Testing
- Error handling and loading states throughout
- Token refresh edge cases
- End-to-end testing with SumUp and Xero sandboxes
- Security review (no token leakage, proper role checks)
