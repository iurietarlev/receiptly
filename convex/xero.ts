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
        // Build receipt details for the accountant
        // Use the full raw SumUp detail if available, otherwise fall back to structured fields
        const paymentDetails = txn.sumupRawDetail
          ? `Receipt details:\n${JSON.stringify(txn.sumupRawDetail, null, 2)}`
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
          Status: "AUTHORISED",
        };

        const response = await fetch(
          "https://api.xero.com/api.xro/2.0/Invoices",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "Xero-Tenant-Id": connection.xeroTenantId,
            },
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

        // Mark the bill as paid — find a BANK account to pay from
        if (xeroInvoiceId) {
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

          if (!accountsRes.ok) {
            const err = await accountsRes.text();
            throw new Error(`Failed to fetch Xero bank accounts: ${accountsRes.status} - ${err}`);
          }

          const accountsData = await accountsRes.json();
          const bankAccount = accountsData.Accounts?.[0];
          if (!bankAccount) {
            throw new Error("No bank account found in Xero. Create a bank account in Xero to enable payments.");
          }

          const payment = {
            Invoice: { InvoiceID: xeroInvoiceId },
            Account: { Code: bankAccount.Code },
            Date: dateStr,
            Amount: txn.amount,
          };

          const paymentRes = await fetch(
            "https://api.xero.com/api.xro/2.0/Payments",
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
                "Xero-Tenant-Id": connection.xeroTenantId,
              },
              body: JSON.stringify(payment),
            }
          );

          if (!paymentRes.ok) {
            const paymentErr = await paymentRes.text();
            throw new Error(`Xero payment error: ${paymentRes.status} - ${paymentErr}`);
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
