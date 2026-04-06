"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function MerchantDashboard() {
  const merchant = useQuery(api.merchants.myMerchant);
  const syncLogs = useQuery(
    api.syncLog.recentLogs,
    merchant?._id ? { merchantId: merchant._id } : "skip"
  );
  if (merchant === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (merchant === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Merchant Dashboard</h1>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              You haven&apos;t connected your SumUp account yet.
            </p>
            <Link href="/merchant/onboarding">
              <Button>Connect SumUp</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Merchant Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge
              variant={merchant.status === "active" ? "default" : "secondary"}
            >
              {merchant.status}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Business Name</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{merchant.businessName}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Sync</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-medium">
              {merchant.lastSyncAt
                ? new Date(merchant.lastSyncAt).toLocaleString()
                : "Never"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Sync Logs</CardTitle>
          <CardDescription>
            Transaction sync runs automatically every 6 hours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncLogs === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : syncLogs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No sync logs yet. The first sync will run shortly after
              connecting.
            </p>
          ) : (
            <>
              {/* Mobile: card layout */}
              <div className="space-y-3 md:hidden">
                {syncLogs.map((log) => (
                  <div key={log._id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">
                        {new Date(log.startedAt).toLocaleString()}
                      </span>
                      <Badge
                        variant={
                          log.status === "success"
                            ? "default"
                            : log.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {log.status}
                      </Badge>
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>Fetched: {log.transactionsFetched ?? "-"}</span>
                      <span>Inserted: {log.transactionsInserted ?? "-"}</span>
                    </div>
                    {log.errorMessage && (
                      <p className="text-sm text-red-600 truncate">
                        {log.errorMessage}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: table layout */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Fetched</TableHead>
                      <TableHead>Inserted</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.map((log) => (
                      <TableRow key={log._id}>
                        <TableCell>
                          {new Date(log.startedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.status === "success"
                                ? "default"
                                : log.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.transactionsFetched ?? "-"}</TableCell>
                        <TableCell>{log.transactionsInserted ?? "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {log.errorMessage ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
