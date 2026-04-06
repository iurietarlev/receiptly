"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export default function CustomerDashboard() {
  const [selectedTxns, setSelectedTxns] = useState<Set<string>>(new Set());
  const [filterCard, setFilterCard] = useState<string | "all">("all");
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState<
    { transactionId: string; success: boolean; error?: string }[] | null
  >(null);
  const pushToXero = useAction(api.xero.pushToXero);
  const syncAllNow = useAction(api.transactions.syncAllNow);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"success" | "error" | null>(null);

  const cards = useQuery(api.userCards.list);
  const cardLast4List = cards?.map((c) => c.cardLast4) ?? [];

  const transactions = useQuery(
    api.transactions.searchByCards,
    cardLast4List.length > 0 ? { cardLast4List } : "skip"
  );

  const xeroConnection = useQuery(api.xero.getConnection);

  const filteredTransactions =
    transactions && filterCard !== "all"
      ? transactions.filter((t) => t.cardLast4 === filterCard)
      : transactions;

  function toggleTxn(id: string) {
    setSelectedTxns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasCards = cards && cards.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">
            Transactions matching your saved cards are shown automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncStatus === "success" && (
            <span className="text-sm text-green-600">Sync complete</span>
          )}
          {syncStatus === "error" && (
            <span className="text-sm text-red-600">Sync failed</span>
          )}
          <Button
            size="sm"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              setSyncStatus(null);
              try {
                await syncAllNow();
                setSyncStatus("success");
              } catch {
                setSyncStatus("error");
              } finally {
                setSyncing(false);
              }
            }}
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* No cards prompt */}
      {cards !== undefined && !hasCards && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              You haven&apos;t added any cards yet. Add a card to start seeing
              your transactions.
            </p>
            <Link href="/cards">
              <Button>Add a Card</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Card filter pills */}
      {hasCards && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground mr-1">Filter:</span>
          <Button
            size="sm"
            variant={filterCard === "all" ? "default" : "outline"}
            onClick={() => setFilterCard("all")}
          >
            All cards
          </Button>
          {cards.map((card) => (
            <Button
              key={card._id}
              size="sm"
              variant={filterCard === card.cardLast4 ? "default" : "outline"}
              onClick={() => setFilterCard(card.cardLast4)}
            >
              •••• {card.cardLast4}
              {card.label && (
                <span className="ml-1 text-xs opacity-70">({card.label})</span>
              )}
            </Button>
          ))}
          <Link href="/cards" className="ml-auto">
            <Button size="sm" variant="ghost">
              Manage cards
            </Button>
          </Link>
        </div>
      )}

      {pushResults && (
        <Card>
          <CardContent className="py-4">
            {pushResults.every((r) => r.success) ? (
              <p className="text-green-700 font-medium">
                Successfully pushed {pushResults.length} transaction(s) to Xero.
              </p>
            ) : (
              <div className="space-y-1">
                {pushResults.map((r, i) => (
                  <p
                    key={i}
                    className={
                      r.success ? "text-green-700" : "text-red-700"
                    }
                  >
                    {r.success ? "Pushed" : `Failed: ${r.error}`}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasCards && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Results</CardTitle>
                <CardDescription>
                  {filterCard === "all"
                    ? "Transactions matching all your saved cards"
                    : `Transactions matching card ending in ${filterCard}`}
                </CardDescription>
              </div>
              {selectedTxns.size > 0 && (
                <div className="flex gap-2">
                  {xeroConnection ? (
                    <Button
                      disabled={pushing}
                      onClick={() => {
                        setPushing(true);
                        setPushResults(null);
                        void pushToXero({
                          transactionIds: Array.from(selectedTxns) as Id<"transactions">[],
                        })
                          .then((results) => {
                            setPushResults(results);
                            setSelectedTxns(new Set());
                          })
                          .finally(() => setPushing(false));
                      }}
                    >
                      {pushing ? "Pushing..." : `Push ${selectedTxns.size} to Xero`}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        window.location.href = "/settings";
                      }}
                    >
                      Connect Xero first
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {filteredTransactions === undefined ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : filteredTransactions.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No transactions found
                {filterCard !== "all" && ` for card ending in ${filterCard}`}.
              </p>
            ) : (
              <>
                {/* Mobile: card-based layout */}
                <div className="space-y-3 md:hidden">
                  {filteredTransactions.map((txn) => (
                    <div
                      key={txn._id}
                      className="flex items-start gap-3 border rounded-lg p-3"
                    >
                      <Checkbox
                        checked={selectedTxns.has(txn._id)}
                        onCheckedChange={() => toggleTxn(txn._id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">
                            {txn.merchantName}
                          </span>
                          <span className="font-semibold whitespace-nowrap">
                            {txn.amount.toFixed(2)} {txn.currency}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>
                            {new Date(txn.timestamp).toLocaleDateString()}
                          </span>
                          {txn.cardLast4 && (
                            <span>&middot; •••• {txn.cardLast4}</span>
                          )}
                          {txn.cardType && <span>&middot; {txn.cardType}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              txn.status === "SUCCESSFUL"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {txn.status}
                          </Badge>
                          {txn.pushedToXero && (
                            <Badge variant="outline">Pushed</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: table layout */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Date</TableHead>
                        <TableHead>Merchant</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Card</TableHead>
                        <TableHead>Card Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Xero</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((txn) => (
                        <TableRow key={txn._id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedTxns.has(txn._id)}
                              onCheckedChange={() => toggleTxn(txn._id)}

                            />
                          </TableCell>
                          <TableCell>
                            {new Date(txn.timestamp).toLocaleDateString()}
                          </TableCell>
                          <TableCell>{txn.merchantName}</TableCell>
                          <TableCell>
                            {txn.amount.toFixed(2)} {txn.currency}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {txn.cardLast4 ? `•••• ${txn.cardLast4}` : "-"}
                          </TableCell>
                          <TableCell>{txn.cardType ?? "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                txn.status === "SUCCESSFUL"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {txn.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {txn.pushedToXero ? (
                              <Badge variant="outline">Pushed</Badge>
                            ) : (
                              "-"
                            )}
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
      )}
    </div>
  );
}
