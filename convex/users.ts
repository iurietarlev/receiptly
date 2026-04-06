import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { QueryCtx } from "./_generated/server";

export async function getUserByToken(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();
}

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getUserByToken(ctx);
  },
});

export const createUser = mutation({
  args: {
    role: v.union(v.literal("merchant"), v.literal("customer")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email ?? "",
      name: identity.name ?? undefined,
      role: args.role,
    });
  },
});

export const updateRole = mutation({
  args: {
    role: v.union(v.literal("merchant"), v.literal("customer")),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.db.patch(user._id, { role: args.role });
  },
});
