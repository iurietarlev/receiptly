import { v } from "convex/values";
import { query, action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getUserByToken } from "./users";
import { Id } from "./_generated/dataModel";

export const getConnection = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUserByToken(ctx);
    if (!user) return null;

    const connection = await ctx.db
      .query("xero_connections")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    if (!connection) return null;

    // Don't expose tokens to client
    return {
      _id: connection._id,
      xeroTenantId: connection.xeroTenantId,
      tenantName: connection.tenantName,
      connected: true,
      tokenExpired: connection.tokenExpiresAt < Date.now(),
    };
  },
});

export const disconnect = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.xeroInternal.deleteConnectionForUser, {});
  },
});

export const verifyConnection = action({
  args: {},
  handler: async (ctx) => {
    const connection = await ctx.runQuery(
      internal.xeroInternal.getConnectionWithTokens,
      {}
    );
    if (!connection) return null;

    // Try refreshing the token — if the app connection was fully revoked
    // this will fail and we remove the record.
    let accessToken: string;
    try {
      const refreshed = await refreshXeroToken(connection.refreshToken);
      accessToken = refreshed.access_token;

      // Persist the new tokens
      await ctx.runMutation(internal.xeroInternal.updateTokens, {
        connectionId: connection._id,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        tokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
      });
    } catch {
      // Token refresh failed — connection revoked
      await ctx.runMutation(internal.xeroInternal.deleteConnection, {
        connectionId: connection._id,
      });
      return { valid: false } as const;
    }

    // Verify the stored tenant is still accessible by calling the
    // Xero API directly with that tenant ID. Uses the Invoices endpoint
    // (covered by accounting.transactions scope) with a limit of 0
    // so it returns quickly without fetching data.
    try {
      const testResponse = await fetch(
        "https://api.xero.com/api.xro/2.0/Invoices?page=1&pageSize=1",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "Xero-Tenant-Id": connection.xeroTenantId,
          },
        }
      );

      if (!testResponse.ok) {
        // Tenant no longer accessible — remove the record
        await ctx.runMutation(internal.xeroInternal.deleteConnection, {
          connectionId: connection._id,
        });
        return { valid: false } as const;
      }

      return { valid: true } as const;
    } catch {
      await ctx.runMutation(internal.xeroInternal.deleteConnection, {
        connectionId: connection._id,
      });
      return { valid: false } as const;
    }
  },
});

export const pushToXero = action({
  args: {
    transactionIds: v.array(v.id("transactions")),
  },
  handler: async (ctx, args) => {
    // Get user's Xero connection
    const connection = await ctx.runQuery(
      internal.xeroInternal.getConnectionWithTokens,
      {}
    );
    if (!connection) {
      throw new Error("Xero not connected");
    }

    // Always refresh token to ensure it's valid
    const refreshed = await refreshXeroToken(connection.refreshToken);
    const accessToken = refreshed.access_token;
    await ctx.runMutation(internal.xeroInternal.updateTokens, {
      connectionId: connection._id,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt: Date.now() + refreshed.expires_in * 1000,
    });

    // Get transaction details
    const transactions = await ctx.runQuery(
      internal.xeroInternal.getTransactionsByIds,
      { transactionIds: args.transactionIds }
    );

    const results: { transactionId: string; success: boolean; error?: string }[] = [];

    for (const txn of transactions) {
      try {
        // Create bill (ACCPAY invoice) in Xero
        const txnDate = new Date(txn.timestamp);
        const now = new Date();
        const billDate = txnDate > now ? now : txnDate;
        const dateStr = billDate.toISOString().split("T")[0];

        // Build receipt details from stored SumUp raw detail
        const paymentDetails = txn.sumupRawDetail
          ? formatRawDetail(txn.sumupRawDetail as Record<string, unknown>)
          : [
              `Merchant: ${txn.merchantName}`,
              `SumUp Transaction Code: ${txn.transactionCode}`,
              txn.paymentType ? `Payment type: ${txn.paymentType}` : null,
              txn.cardLast4 ? `Card: **** ${txn.cardLast4} (${txn.cardType ?? "Unknown"})` : null,
              txn.entryMode ? `Entry mode: ${txn.entryMode}` : null,
              txn.verificationMethod ? `Verification: ${txn.verificationMethod}` : null,
              txn.authCode ? `Auth code: ${txn.authCode}` : null,
            ]
              .filter(Boolean)
              .join("\n");

        // Build line items from SumUp products if available
        const lineItems: {
          Description: string;
          Quantity: number;
          UnitAmount: number;
          AccountCode: string;
          TaxAmount?: number;
        }[] =
          txn.products && txn.products.length > 0
            ? txn.products.map((p, i) => ({
                // Append receipt details to the first product's description
                Description:
                  i === 0
                    ? `${p.name}\n${paymentDetails}`
                    : p.name,
                Quantity: p.quantity,
                UnitAmount: p.price,
                AccountCode: "400",
                ...(p.vatAmount != null ? { TaxAmount: p.vatAmount } : {}),
              }))
            : [
                {
                  Description: `Payment - ${paymentDetails}`,
                  Quantity: 1,
                  UnitAmount: txn.amount - (txn.tipAmount ?? 0),
                  AccountCode: "400",
                  ...(txn.vatAmount != null ? { TaxAmount: txn.vatAmount } : {}),
                },
              ];

        // Add tip as a separate line item
        if (txn.tipAmount && txn.tipAmount > 0) {
          lineItems.push({
            Description: "Tip",
            Quantity: 1,
            UnitAmount: txn.tipAmount,
            AccountCode: "400",
          });
        }

        const invoice = {
          Type: "ACCPAY",
          Contact: { Name: txn.merchantName },
          Date: dateStr,
          DueDate: dateStr,
          LineItems: lineItems,
          LineAmountTypes: "Exclusive",
          CurrencyCode: txn.currency,
          Reference: txn.transactionCode,
          Status: "DRAFT",
        };

        const xeroHeaders = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Xero-Tenant-Id": connection.xeroTenantId,
        };

        const response = await fetch(
          "https://api.xero.com/api.xro/2.0/Invoices",
          {
            method: "POST",
            headers: xeroHeaders,
            body: JSON.stringify({ Invoices: [invoice] }),
          }
        );

        const responseText = await response.text();
        if (!response.ok) {
          throw new Error(`Xero API error: ${response.status} - ${responseText}`);
        }

        let result;
        try {
          result = JSON.parse(responseText);
        } catch {
          throw new Error(`Xero returned non-JSON response: ${responseText.slice(0, 200)}`);
        }
        const xeroInvoiceId = result.Invoices?.[0]?.InvoiceID;

        // Try to approve the draft bill and record payment.
        // If the user lacks Approver permissions in Xero, the bill
        // stays as DRAFT — the accountant can approve it manually.
        if (xeroInvoiceId) {
          let approved = false;

          // Step 1: Approve the bill (DRAFT → AUTHORISED)
          const approveRes = await fetch(
            "https://api.xero.com/api.xro/2.0/Invoices/" + xeroInvoiceId,
            {
              method: "POST",
              headers: xeroHeaders,
              body: JSON.stringify({
                InvoiceID: xeroInvoiceId,
                Status: "AUTHORISED",
              }),
            }
          );
          approved = approveRes.ok;

          // Step 2: Record payment (only if bill was approved)
          if (approved) {
            const accountsRes = await fetch(
              "https://api.xero.com/api.xro/2.0/Accounts?where=Type%3D%3D%22BANK%22",
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: "application/json",
                  "Xero-Tenant-Id": connection.xeroTenantId,
                },
              }
            );

            if (accountsRes.ok) {
              const accountsData = await accountsRes.json();
              const bankAccount = accountsData.Accounts?.[0];
              if (bankAccount) {
                const payment = {
                  Invoice: { InvoiceID: xeroInvoiceId },
                  Account: { Code: bankAccount.Code },
                  Date: dateStr,
                  Amount: txn.amount,
                };

                await fetch(
                  "https://api.xero.com/api.xro/2.0/Payments",
                  {
                    method: "PUT",
                    headers: xeroHeaders,
                    body: JSON.stringify(payment),
                  }
                );
              }
            }
          }
        }

        // Mark as pushed
        await ctx.runMutation(internal.xeroInternal.markTransactionPushed, {
          transactionId: txn._id as Id<"transactions">,
          xeroInvoiceId: xeroInvoiceId ?? "",
        });

        results.push({ transactionId: txn._id, success: true });
      } catch (error) {
        results.push({
          transactionId: txn._id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  },
});

function formatRawDetail(raw: Record<string, unknown>): string {
  const lines: string[] = [];

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value);
  }

  function flattenObject(
    obj: Record<string, unknown>,
    prefix: string
  ) {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;

      const label = prefix ? `${prefix} ${key}` : key;

      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        // Check if it's an array of objects (like products, links, events)
        if (typeof value[0] === "object" && value[0] !== null) {
          for (let i = 0; i < value.length; i++) {
            const item = value[i] as Record<string, unknown>;
            for (const [itemKey, itemVal] of Object.entries(item)) {
              if (itemVal === null || itemVal === undefined) continue;
              if (typeof itemVal === "object" && !Array.isArray(itemVal)) {
                flattenObject(
                  itemVal as Record<string, unknown>,
                  `${label}[${i}] ${itemKey}`
                );
              } else {
                lines.push(`${label}[${i}] ${itemKey}: ${formatValue(itemVal)}`);
              }
            }
          }
        } else {
          lines.push(`${label}: ${value.map(formatValue).join(", ")}`);
        }
      } else if (typeof value === "object") {
        flattenObject(value as Record<string, unknown>, label);
      } else {
        lines.push(`${label}: ${formatValue(value)}`);
      }
    }
  }

  flattenObject(raw, "");

  return lines.join("\n");
}

async function refreshXeroToken(refreshToken: string) {
  const credentials = btoa(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  );

  const response = await fetch(
    "https://identity.xero.com/connect/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    }
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Xero token refresh failed: ${response.status} - ${body.slice(0, 200)}`);
  }

  try {
    return JSON.parse(body) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
  } catch {
    throw new Error(`Xero token refresh returned non-JSON: ${body.slice(0, 200)}`);
  }
}
