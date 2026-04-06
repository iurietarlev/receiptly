import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUserByToken } from "./users";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUserByToken(ctx);
    if (!user) throw new Error("Not authenticated");

    return await ctx.db
      .query("user_cards")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("asc")
      .take(50);
  },
});

export const add = mutation({
  args: {
    cardLast4: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx);
    if (!user) throw new Error("Not authenticated");

    if (!/^\d{4}$/.test(args.cardLast4)) {
      throw new Error("Card must be exactly 4 digits");
    }

    // Check for duplicate
    const existing = await ctx.db
      .query("user_cards")
      .withIndex("by_userId_and_cardLast4", (q) =>
        q.eq("userId", user._id).eq("cardLast4", args.cardLast4)
      )
      .unique();

    if (existing) {
      throw new Error("This card is already saved");
    }

    return await ctx.db.insert("user_cards", {
      userId: user._id,
      cardLast4: args.cardLast4,
      label: args.label,
    });
  },
});

export const update = mutation({
  args: {
    cardId: v.id("user_cards"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx);
    if (!user) throw new Error("Not authenticated");

    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    await ctx.db.patch(args.cardId, { label: args.label });
  },
});

export const remove = mutation({
  args: {
    cardId: v.id("user_cards"),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx);
    if (!user) throw new Error("Not authenticated");

    const card = await ctx.db.get(args.cardId);
    if (!card || card.userId !== user._id) {
      throw new Error("Card not found");
    }

    await ctx.db.delete(args.cardId);
  },
});
