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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function MerchantDirectory() {
  const merchants = useQuery(api.merchants.listActive);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Merchant Directory</h1>
        <p className="text-muted-foreground">
          These merchants have connected their SumUp accounts to Receiptly. You
          can search for transactions made at any of these businesses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participating Merchants</CardTitle>
          <CardDescription>
            All active merchants on the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {merchants === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : merchants.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No merchants have connected yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchants.map((m) => (
                    <TableRow key={m._id}>
                      <TableCell className="font-medium">
                        {m.businessName}
                      </TableCell>
                      <TableCell>
                        <Badge>Active</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
