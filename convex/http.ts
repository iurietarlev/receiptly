import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/sumup-callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    if (error || !code) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/merchant/onboarding?status=error` },
      });
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch("https://api.sumup.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.SUMUP_CLIENT_ID!,
          client_secret: process.env.SUMUP_CLIENT_SECRET!,
          redirect_uri: process.env.SUMUP_REDIRECT_URI!,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: ${tokenResponse.status}`);
      }

      const tokens = await tokenResponse.json();

      // Get merchant profile to retrieve merchant_code
      const profileResponse = await fetch(
        "https://api.sumup.com/v0.1/me",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );

      if (!profileResponse.ok) {
        throw new Error(`Profile fetch failed: ${profileResponse.status}`);
      }

      const profile = await profileResponse.json();

      // The user's _id is passed via the OAuth state parameter
      const userId = url.searchParams.get("state");
      if (!userId) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${appUrl}/merchant/onboarding?status=error&reason=no_user`,
          },
        });
      }

      await ctx.runMutation(internal.merchantsInternal.createMerchant, {
        userId: userId as any,
        merchantCode: profile.merchant_profile?.merchant_code ?? profile.merchant_code ?? "",
        businessName:
          profile.merchant_profile?.business_name ??
          profile.personal_profile?.first_name ??
          "Unknown Business",
        sumupAccessToken: tokens.access_token,
        sumupRefreshToken: tokens.refresh_token,
        sumupTokenExpiresAt: Date.now() + (tokens.expires_in ?? 3599) * 1000,
      });

      // Schedule initial sync
      // We'd need the merchant ID, so the cron will pick it up on next run

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${appUrl}/merchant/onboarding?status=success`,
        },
      });
    } catch (e) {
      console.error("SumUp OAuth error:", e);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/merchant/onboarding?status=error` },
      });
    }
  }),
});

http.route({
  path: "/xero-callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    if (error || !code) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero=error` },
      });
    }

    try {
      // Exchange code for tokens
      const credentials = btoa(
        `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
      );

      const tokenResponse = await fetch(
        "https://identity.xero.com/connect/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${credentials}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: process.env.XERO_REDIRECT_URI!,
          }),
        }
      );

      if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        console.error("Xero token exchange error body:", errorBody);
        console.error("Xero token exchange status:", tokenResponse.status);
        console.error("XERO_REDIRECT_URI used:", process.env.XERO_REDIRECT_URI);
        throw new Error(`Xero token exchange failed: ${tokenResponse.status} - ${errorBody}`);
      }

      const tokens = await tokenResponse.json();

      // Get Xero connections to find tenant ID
      const connectionsResponse = await fetch(
        "https://api.xero.com/connections",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );

      if (!connectionsResponse.ok) {
        const connErrorBody = await connectionsResponse.text();
        console.error("Xero connections error:", connErrorBody);
        throw new Error(
          `Xero connections failed: ${connectionsResponse.status}`
        );
      }

      const connections = await connectionsResponse.json();
      const tenant = connections[0]; // Use first tenant

      if (!tenant) {
        throw new Error("No Xero tenants found");
      }

      // The user's _id is passed via the OAuth state parameter
      const userId = url.searchParams.get("state");
      if (!userId) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${appUrl}/settings?xero=error&reason=no_user`,
          },
        });
      }

      await ctx.runMutation(internal.xeroInternal.upsertConnection, {
        userId: userId as any,
        xeroTenantId: tenant.tenantId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: Date.now() + (tokens.expires_in ?? 1800) * 1000,
        tenantName: tenant.tenantName ?? undefined,
      });

      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero=success` },
      });
    } catch (e) {
      console.error("Xero OAuth error:", e);
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("Xero OAuth full error:", errorMessage);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/settings?xero=error&detail=${encodeURIComponent(errorMessage)}` },
      });
    }
  }),
});

export default http;
