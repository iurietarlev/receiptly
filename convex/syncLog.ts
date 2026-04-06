import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { getUserByToken } from "./users";

export const recentLogs = query({
  args: {
    merchantId: v.id("merchants"),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx);
    if (!user || user.role !== "merchant") return [];

    // Verify the merchant belongs to this user
    const merchant = await ctx.db.get(args.merchantId);
    if (!merchant || merchant.userId !== user._id) return [];

    return await ctx.db
      .query("sync_log")
      .withIndex("by_merchantId_and_startedAt", (q) =>
        q.eq("merchantId", args.merchantId)
      )
      .order("desc")
      .take(20);
  },
});

export const createLog = internalMutation({
  args: {
    merchantId: v.id("merchants"),
    startedAt: v.number(),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sync_log", args);
  },
});

export const updateLog = internalMutation({
  args: {
    syncLogId: v.id("sync_log"),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("failed")
    ),
    completedAt: v.optional(v.number()),
    transactionsFetched: v.optional(v.number()),
    transactionsInserted: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { syncLogId, ...updates } = args;
    await ctx.db.patch(syncLogId, updates);
  },
});
