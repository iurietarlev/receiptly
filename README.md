# Receiptly

A receipt retrieval platform that connects SumUp-powered merchants with customers, enabling automatic transaction lookup and Xero invoice sync.

## Stack

- **Frontend**: Next.js + Tailwind + shadcn/ui
- **Backend**: Convex
- **Auth**: Clerk
- **Integrations**: SumUp API, Xero API

## Getting Started

```
npm install
npx convex dev
npm run dev
```

### Environment Setup

1. Follow steps 1 to 3 in the [Clerk onboarding guide](https://docs.convex.dev/auth/clerk#get-started)
2. Paste the Issuer URL as `CLERK_JWT_ISSUER_DOMAIN` to your dev deployment environment variable settings on the Convex dashboard
3. Paste your publishable key as `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="<your publishable key>"` to the `.env.local` file
