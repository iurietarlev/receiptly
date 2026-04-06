import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal("merchant"), v.literal("customer")),
  })
    .index("by_tokenIdentifier", ["tokenIdentifier"])
    .index("by_role", ["role"]),

  user_cards: defineTable({
    userId: v.id("users"),
    cardLast4: v.string(),
    label: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_cardLast4", ["userId", "cardLast4"]),

  merchants: defineTable({
    userId: v.id("users"),
    merchantCode: v.string(),
    businessName: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending")
    ),
    sumupAccessToken: v.string(),
    sumupRefreshToken: v.string(),
    sumupTokenExpiresAt: v.number(),
    lastSyncAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_status", ["status"])
    .index("by_merchantCode", ["merchantCode"]),

  transactions: defineTable({
    merchantId: v.id("merchants"),
    transactionCode: v.string(),
    amount: v.number(),
    currency: v.string(),
    status: v.string(),
    paymentType: v.optional(v.string()),
    entryMode: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardType: v.optional(v.string()),
    timestamp: v.number(),
    merchantName: v.string(),
    pushedToXero: v.optional(v.boolean()),
    xeroInvoiceId: v.optional(v.string()),
    vatAmount: v.optional(v.number()),
    tipAmount: v.optional(v.number()),
    verificationMethod: v.optional(v.string()),
    authCode: v.optional(v.string()),
    products: v.optional(
      v.array(
        v.object({
          name: v.string(),
          quantity: v.number(),
          price: v.number(),
          vatRate: v.optional(v.number()),
          vatAmount: v.optional(v.number()),
        })
      )
    ),
  })
    .index("by_transactionCode", ["transactionCode"])
    .index("by_cardLast4_and_timestamp", ["cardLast4", "timestamp"])
    .index("by_merchantId_and_timestamp", ["merchantId", "timestamp"])
    .index("by_merchantId", ["merchantId"]),

  xero_connections: defineTable({
    userId: v.id("users"),
    xeroTenantId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiresAt: v.number(),
    tenantName: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  sync_log: defineTable({
    merchantId: v.id("merchants"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("failed")
    ),
    transactionsFetched: v.optional(v.number()),
    transactionsInserted: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  }).index("by_merchantId_and_startedAt", ["merchantId", "startedAt"]),
});
