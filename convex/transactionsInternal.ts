import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

export const upsertTransactions = internalMutation({
  args: {
    merchantId: v.id("merchants"),
    merchantName: v.string(),
    transactions: v.array(
      v.object({
        transactionCode: v.string(),
        amount: v.number(),
        currency: v.string(),
        status: v.string(),
        paymentType: v.optional(v.string()),
        entryMode: v.optional(v.string()),
        cardLast4: v.optional(v.string()),
        cardType: v.optional(v.string()),
        timestamp: v.number(),
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
        sumupRawDetail: v.optional(v.any()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    for (const txn of args.transactions) {
      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_transactionCode", (q) =>
          q.eq("transactionCode", txn.transactionCode)
        )
        .unique();

      if (!existing) {
        await ctx.db.insert("transactions", {
          merchantId: args.merchantId,
          merchantName: args.merchantName,
          ...txn,
        });
        inserted++;
      } else {
        // Backfill missing detail fields
        const patch: Record<string, unknown> = {};
        if (txn.cardLast4 && !existing.cardLast4) {
          patch.cardLast4 = txn.cardLast4;
          patch.cardType = txn.cardType;
        }
        if (txn.vatAmount !== undefined && existing.vatAmount === undefined) {
          patch.vatAmount = txn.vatAmount;
        }
        if (txn.tipAmount !== undefined && existing.tipAmount === undefined) {
          patch.tipAmount = txn.tipAmount;
        }
        if (txn.verificationMethod && !existing.verificationMethod) {
          patch.verificationMethod = txn.verificationMethod;
        }
        if (txn.authCode && !existing.authCode) {
          patch.authCode = txn.authCode;
        }
        if (txn.products && !existing.products) {
          patch.products = txn.products;
        }
        if (txn.sumupRawDetail) {
          patch.sumupRawDetail = txn.sumupRawDetail;
        }
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(existing._id, patch);
        }
      }
    }
    return inserted;
  },
});

export const syncMerchantTransactions = internalAction({
  args: {
    merchantId: v.id("merchants"),
  },
  handler: async (ctx, args) => {
    const merchant = await ctx.runQuery(
      internal.merchantsInternal.getById,
      { merchantId: args.merchantId }
    );
    if (!merchant || merchant.status !== "active") return;

    // Create sync log entry
    const syncLogId: Id<"sync_log"> = await ctx.runMutation(
      internal.syncLog.createLog,
      {
        merchantId: args.merchantId,
        startedAt: Date.now(),
        status: "running",
      }
    );

    try {
      // Check if token needs refresh
      let accessToken = merchant.sumupAccessToken;
      if (merchant.sumupTokenExpiresAt < Date.now()) {
        const refreshed = await refreshSumupToken(
          merchant.sumupRefreshToken
        );
        accessToken = refreshed.access_token;
        await ctx.runMutation(internal.merchantsInternal.updateTokens, {
          merchantId: args.merchantId,
          sumupAccessToken: refreshed.access_token,
          sumupRefreshToken: refreshed.refresh_token,
          sumupTokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
        });
      }

      // Fetch all transactions from SumUp (deduplication happens in upsertTransactions)
      let totalFetched = 0;
      let totalInserted = 0;
      let hasMore = true;
      let oldestRef: string | undefined;

      while (hasMore) {
        const url = new URL(
          `https://api.sumup.com/v2.1/merchants/${merchant.merchantCode}/transactions/history`
        );
        url.searchParams.set("limit", "100");
        url.searchParams.set("order", "ascending");
        url.searchParams.set("statuses[]", "SUCCESSFUL");
        if (oldestRef) url.searchParams.set("oldest_ref", oldestRef);

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(
            `SumUp API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        const items = data.items ?? [];
        totalFetched += items.length;

        if (items.length > 0) {
          // Fetch individual transaction details to get card last 4 digits
          const detailed = await Promise.all(
            items.map(async (item: SumUpHistoryItem) => {
              try {
                const detailRes = await fetch(
                  `https://api.sumup.com/v0.1/me/transactions?transaction_code=${item.transaction_code}`,
                  { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                const contentType = detailRes.headers.get("content-type") ?? "";
                if (detailRes.ok && contentType.includes("application/json")) {
                  const detail = await detailRes.json();
                  return {
                    ...item,
                    card: detail.card as
                      | { last_4_digits?: string; type?: string }
                      | undefined,
                    vat_amount: detail.vat_amount as number | undefined,
                    tip_amount: detail.tip_amount as number | undefined,
                    verification_method: detail.verification_method as string | undefined,
                    auth_code: detail.auth_code as string | undefined,
                    products: detail.products as SumUpProduct[] | undefined,
                    rawDetail: detail,
                  };
                }
              } catch {
                // Fall through to use history-level data only
              }
              return { ...item, card: undefined, vat_amount: undefined, tip_amount: undefined, verification_method: undefined, auth_code: undefined, products: undefined, rawDetail: undefined };
            })
          );

          // Transform and upsert
          const transformed = detailed.map((item) => ({
            transactionCode: item.transaction_code,
            amount: item.amount,
            currency: item.currency,
            status: item.status,
            paymentType: item.payment_type ?? undefined,
            entryMode: item.entry_mode ?? undefined,
            cardLast4: item.card?.last_4_digits ?? undefined,
            cardType: item.card?.type ?? item.card_type ?? undefined,
            timestamp: new Date(item.timestamp).getTime(),
            vatAmount: item.vat_amount ?? undefined,
            tipAmount: item.tip_amount ?? undefined,
            verificationMethod: item.verification_method ?? undefined,
            authCode: item.auth_code ?? undefined,
            products: item.products?.map((p: SumUpProduct) => ({
              name: p.name ?? "Item",
              quantity: p.quantity ?? 1,
              price: p.price ?? 0,
              vatRate: p.vat_rate ?? undefined,
              vatAmount: p.vat_amount ?? undefined,
            })) ?? undefined,
            sumupRawDetail: item.rawDetail ?? undefined,
          }));

          const inserted = await ctx.runMutation(
            internal.transactionsInternal.upsertTransactions,
            {
              merchantId: args.merchantId,
              merchantName: merchant.businessName,
              transactions: transformed,
            }
          );
          totalInserted += inserted as number;
        }

        // Check for next page
        const nextLink = data.links?.find(
          (l: { rel: string; href: string }) => l.rel === "next"
        );
        if (nextLink && items.length > 0) {
          const nextUrl = new URL(nextLink.href);
          oldestRef = nextUrl.searchParams.get("oldest_ref") ?? undefined;
        } else {
          hasMore = false;
        }
      }

      // Update sync status
      await ctx.runMutation(internal.syncLog.updateLog, {
        syncLogId,
        status: "success",
        completedAt: Date.now(),
        transactionsFetched: totalFetched,
        transactionsInserted: totalInserted,
      });

      await ctx.runMutation(internal.merchantsInternal.updateLastSync, {
        merchantId: args.merchantId,
        lastSyncAt: Date.now(),
      });
    } catch (error) {
      await ctx.runMutation(internal.syncLog.updateLog, {
        syncLogId,
        status: "failed",
        completedAt: Date.now(),
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

export const syncAllMerchants = internalAction({
  args: {},
  handler: async (ctx) => {
    const merchants = await ctx.runQuery(
      internal.merchantsInternal.listActiveMerchants,
      {}
    );
    for (const merchant of merchants) {
      await ctx.scheduler.runAfter(0, internal.transactionsInternal.syncMerchantTransactions, {
        merchantId: merchant._id,
      });
    }
  },
});

// SumUp token refresh helper
async function refreshSumupToken(refreshToken: string) {
  const response = await fetch("https://api.sumup.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.SUMUP_CLIENT_ID!,
      client_secret: process.env.SUMUP_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    throw new Error(`SumUp token refresh failed: ${response.status}`);
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

interface SumUpProduct {
  name?: string;
  quantity?: number;
  price?: number;
  vat_rate?: number;
  vat_amount?: number;
}

// SumUp v2.1 history endpoint item shape
interface SumUpHistoryItem {
  transaction_code: string;
  amount: number;
  currency: string;
  status: string;
  timestamp: string;
  payment_type?: string;
  entry_mode?: string;
  card_type?: string;
}
