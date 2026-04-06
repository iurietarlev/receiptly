import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const upsertConnection = internalMutation({
  args: {
    userId: v.id("users"),
    xeroTenantId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiresAt: v.number(),
    tenantName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("xero_connections")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        xeroTenantId: args.xeroTenantId,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiresAt: args.tokenExpiresAt,
        tenantName: args.tenantName,
      });
      return existing._id;
    }

    return await ctx.db.insert("xero_connections", args);
  },
});

export const getConnectionWithTokens = internalQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return null;

    return await ctx.db
      .query("xero_connections")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const updateTokens = internalMutation({
  args: {
    connectionId: v.id("xero_connections"),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { connectionId, ...updates } = args;
    await ctx.db.patch(connectionId, updates);
  },
});

export const getTransactionsByIds = internalQuery({
  args: {
    transactionIds: v.array(v.id("transactions")),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const id of args.transactionIds) {
      const txn = await ctx.db.get(id);
      if (txn) results.push(txn);
    }
    return results;
  },
});

export const deleteConnection = internalMutation({
  args: {
    connectionId: v.id("xero_connections"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.connectionId);
  },
});

export const deleteConnectionForUser = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return;

    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return;

    const connection = await ctx.db
      .query("xero_connections")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (connection) {
      await ctx.db.delete(connection._id);
    }
  },
});

export const markTransactionPushed = internalMutation({
  args: {
    transactionId: v.id("transactions"),
    xeroInvoiceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.transactionId, {
      pushedToXero: true,
      xeroInvoiceId: args.xeroInvoiceId,
    });
  },
});
