"use client";

import { useEffect, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Settings() {
  const { user: clerkUser } = useUser();
  const user = useQuery(api.users.currentUser);
  const xeroConnection = useQuery(api.xero.getConnection);
  const verifyConnection = useAction(api.xero.verifyConnection);
  const disconnectXero = useAction(api.xero.disconnect);
  const verifiedRef = useRef(false);
  const searchParams = useSearchParams();
  const xeroStatus = searchParams.get("xero");
  const xeroDetail = searchParams.get("detail");

  useEffect(() => {
    if (xeroConnection && !verifiedRef.current) {
      verifiedRef.current = true;
      verifyConnection().catch(() => {
        // Verification failed — connection will be deleted and
        // xeroConnection will reactively update to null
      });
    }
  }, [xeroConnection, verifyConnection]);

  if (user === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  function handleConnectXero() {
    const clientId = process.env.NEXT_PUBLIC_XERO_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_XERO_REDIRECT_URI;
    if (!clientId || !redirectUri || !user?._id) return;
    const url = new URL("https://login.xero.com/identity/connect/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", user._id);
    url.searchParams.set(
      "scope",
      "openid profile email accounting.transactions offline_access"
    );
    window.location.href = url.toString();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-20">Email:</span>
            <span>{clerkUser?.primaryEmailAddress?.emailAddress ?? user?.email}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-20">Role:</span>
            <Badge variant="outline">{user?.role}</Badge>
          </div>
        </CardContent>
      </Card>

      {user?.role === "customer" && (
        <Card>
          <CardHeader>
            <CardTitle>Xero Connection</CardTitle>
            <CardDescription>
              Connect your Xero account to push transactions as invoices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {xeroStatus === "success" && (
              <p className="text-sm text-green-600 font-medium">
                Xero connected successfully.
              </p>
            )}
            {xeroStatus === "error" && (
              <p className="text-sm text-red-600 font-medium">
                Failed to connect Xero.{xeroDetail ? ` ${xeroDetail}` : ""} Please try again.
              </p>
            )}
            {xeroConnection === undefined ? (
              <Skeleton className="h-10 w-48" />
            ) : xeroConnection ? (
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Status:
                  </span>
                  {xeroConnection.tokenExpired ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <Badge>Connected</Badge>
                  )}
                </div>
                {xeroConnection.tenantName && (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      Organisation:
                    </span>
                    <span>{xeroConnection.tenantName}</span>
                  </div>
                )}
                {xeroConnection.tokenExpired && (
                  <p className="text-sm text-muted-foreground">
                    Your Xero connection has expired. Please reconnect to continue pushing transactions.
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" onClick={handleConnectXero}>
                    Reconnect Xero
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectXero()}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={handleConnectXero}>Connect Xero</Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
