import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getById = internalQuery({
  args: { merchantId: v.id("merchants") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.merchantId);
  },
});

export const listActiveMerchants = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("merchants")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(500);
  },
});

export const createMerchant = internalMutation({
  args: {
    userId: v.id("users"),
    merchantCode: v.string(),
    businessName: v.string(),
    sumupAccessToken: v.string(),
    sumupRefreshToken: v.string(),
    sumupTokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("merchants", {
      ...args,
      status: "active",
    });
  },
});

export const updateTokens = internalMutation({
  args: {
    merchantId: v.id("merchants"),
    sumupAccessToken: v.string(),
    sumupRefreshToken: v.string(),
    sumupTokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.merchantId, {
      sumupAccessToken: args.sumupAccessToken,
      sumupRefreshToken: args.sumupRefreshToken,
      sumupTokenExpiresAt: args.sumupTokenExpiresAt,
    });
  },
});

export const updateLastSync = internalMutation({
  args: {
    merchantId: v.id("merchants"),
    lastSyncAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.merchantId, {
      lastSyncAt: args.lastSyncAt,
    });
  },
});

export const getByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("merchants")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const findUserByTokenIdentifier = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", args.tokenIdentifier)
      )
      .unique();
  },
});
