import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUserByToken } from "./users";

export const myMerchant = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUserByToken(ctx);
    if (!user || user.role !== "merchant") return null;
    return await ctx.db
      .query("merchants")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const merchants = await ctx.db
      .query("merchants")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(100);
    // Only return public-facing fields
    return merchants.map((m) => ({
      _id: m._id,
      businessName: m.businessName,
      status: m.status,
    }));
  },
});

export const startSumupOAuth = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getUserByToken(ctx);
    if (!user) throw new Error("Not authenticated");
    if (user.role !== "merchant") throw new Error("Must be a merchant");

    // Pass user ID via state so the callback can identify the user
    const state = user._id;

    const clientId = process.env.SUMUP_CLIENT_ID;
    const redirectUri = process.env.SUMUP_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new Error("SumUp OAuth not configured");
    }

    const url = new URL("https://api.sumup.com/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "transactions.history user.profile_readonly");
    url.searchParams.set("state", state);

    return url.toString();
  },
});
