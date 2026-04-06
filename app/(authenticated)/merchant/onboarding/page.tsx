"use client";

import { useQuery, useMutation } from "convex/react";
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
import { useSearchParams } from "next/navigation";

export default function MerchantOnboarding() {
  const merchant = useQuery(api.merchants.myMerchant);
  const startOAuth = useMutation(api.merchants.startSumupOAuth);
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  function handleConnect() {
    void startOAuth({}).then((url) => {
      window.location.href = url;
    });
  }

  if (merchant === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Connect SumUp</h1>

      {status === "success" && (
        <Card className="border-green-500">
          <CardContent className="py-4">
            <p className="text-green-700 font-medium">
              SumUp connected successfully! Your transactions will start syncing
              shortly.
            </p>
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <Card className="border-red-500">
          <CardContent className="py-4">
            <p className="text-red-700 font-medium">
              There was an error connecting SumUp. Please try again.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>SumUp Integration</CardTitle>
          <CardDescription>
            Connect your SumUp account to allow customers to retrieve their
            transaction receipts from your business.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {merchant ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge
                  variant={
                    merchant.status === "active" ? "default" : "secondary"
                  }
                >
                  {merchant.status}
                </Badge>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Business:
                </span>
                <span className="font-medium">{merchant.businessName}</span>
              </div>
              {merchant.status === "active" && (
                <p className="text-sm text-muted-foreground">
                  Your SumUp account is connected and transactions are being
                  synced automatically every 6 hours.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Click the button below to authorise Receiptly to access your
                SumUp transaction history. You will be redirected to SumUp to
                grant permission.
              </p>
              <Button onClick={handleConnect}>Connect SumUp Account</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
