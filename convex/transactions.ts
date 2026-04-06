import { v } from "convex/values";
import { query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { getUserByToken } from "./users";

export const syncAllNow = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const merchants = await ctx.runQuery(
      internal.merchantsInternal.listActiveMerchants,
      {}
    );

    for (const merchant of merchants) {
      await ctx.runAction(
        internal.transactionsInternal.syncMerchantTransactions,
        { merchantId: merchant._id }
      );
    }
  },
});

export const searchByCard = query({
  args: {
    cardLast4: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const results = await ctx.db
      .query("transactions")
      .withIndex("by_cardLast4_and_timestamp", (q) =>
        q.eq("cardLast4", args.cardLast4)
      )
      .order("desc")
      .take(100);

    return results;
  },
});

export const searchByCards = query({
  args: {
    cardLast4List: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx);
    if (!user) throw new Error("Not authenticated");

    if (args.cardLast4List.length === 0) return [];

    // Query each card's transactions and merge
    const allResults = await Promise.all(
      args.cardLast4List.map((cardLast4) =>
        ctx.db
          .query("transactions")
          .withIndex("by_cardLast4_and_timestamp", (q) =>
            q.eq("cardLast4", cardLast4)
          )
          .order("desc")
          .take(50)
      )
    );

    // Flatten and sort by timestamp descending
    const merged = allResults.flat();
    merged.sort((a, b) => b.timestamp - a.timestamp);

    // Return top 200
    return merged.slice(0, 200);
  },
});
