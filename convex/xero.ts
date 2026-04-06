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
  const card = raw.card as Record<string, unknown> | undefined;
  const location = raw.location as Record<string, unknown> | undefined;
  const products = raw.products as Array<Record<string, unknown>> | undefined;

  const lines: (string | null)[] = [
    raw.merchant_code ? `Merchant code: ${raw.merchant_code}` : null,
    raw.username ? `Merchant: ${raw.username}` : null,
    location?.city ? `Location: ${location.city}${location.country ? `, ${location.country}` : ""}` : null,
    `Transaction code: ${raw.transaction_code}`,
    raw.internal_id ? `Internal ID: ${raw.internal_id}` : null,
    raw.client_transaction_id ? `Client transaction ID: ${raw.client_transaction_id}` : null,
    `Amount: ${raw.amount} ${raw.currency}`,
    raw.vat_amount != null ? `VAT amount: ${raw.vat_amount}` : null,
    raw.tip_amount != null ? `Tip amount: ${raw.tip_amount}` : null,
    raw.status ? `Status: ${raw.status}` : null,
    raw.payment_type ? `Payment type: ${raw.payment_type}` : null,
    raw.simple_payment_type ? `Simple payment type: ${raw.simple_payment_type}` : null,
    raw.entry_mode ? `Entry mode: ${raw.entry_mode}` : null,
    raw.verification_method ? `Verification: ${raw.verification_method}` : null,
    raw.auth_code ? `Auth code: ${raw.auth_code}` : null,
    card ? `Card: **** ${card.last_4_digits ?? "N/A"} (${card.type ?? "Unknown"})` : null,
    card?.scheme ? `Card scheme: ${card.scheme}` : null,
    raw.installments_count ? `Installments: ${raw.installments_count}` : null,
    raw.payout_type ? `Payout type: ${raw.payout_type}` : null,
    raw.payout_plan ? `Payout plan: ${raw.payout_plan}` : null,
    raw.payouts_total != null ? `Payouts total: ${raw.payouts_total}` : null,
    raw.payouts_received != null ? `Payouts received: ${raw.payouts_received}` : null,
    raw.tax_enabled != null ? `Tax enabled: ${raw.tax_enabled}` : null,
    raw.timestamp ? `Timestamp: ${raw.timestamp}` : null,
    raw.local_time ? `Local time: ${raw.local_time}` : null,
  ];

  if (products && products.length > 0) {
    lines.push(`Products:`);
    for (const p of products) {
      lines.push(`  - ${p.name}: qty ${p.quantity}, price ${p.price}${p.vat_rate != null ? `, VAT ${p.vat_rate}%` : ""}`);
    }
  }

  return lines.filter(Boolean).join("\n");
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
