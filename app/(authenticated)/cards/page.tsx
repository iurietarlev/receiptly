"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function AddCardForm() {
  const [cardLast4, setCardLast4] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const addCard = useMutation(api.userCards.add);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await addCard({
        cardLast4,
        label: label.trim() || undefined,
      });
      setCardLast4("");
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add card");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a Card</CardTitle>
        <CardDescription>
          Enter the last 4 digits of your card. Only these digits are stored —
          no other card information.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="card-last4">Last 4 digits</Label>
            <Input
              id="card-last4"
              placeholder="1234"
              maxLength={4}
              value={cardLast4}
              onChange={(e) =>
                setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              className="w-32"
            />
          </div>
          <div className="space-y-2 flex-1">
            <Label htmlFor="card-label">Label (optional)</Label>
            <Input
              id="card-label"
              placeholder="e.g., Company Amex"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={cardLast4.length !== 4}>
            Add Card
          </Button>
        </form>
        {error && (
          <p className="text-sm text-red-600 mt-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CardItem({ card }: { card: { _id: Id<"user_cards">; cardLast4: string; label?: string } }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(card.label ?? "");
  const updateCard = useMutation(api.userCards.update);
  const removeCard = useMutation(api.userCards.remove);

  async function handleSave() {
    await updateCard({ cardId: card._id, label: label.trim() || undefined });
    setEditing(false);
  }

  async function handleDelete() {
    await removeCard({ cardId: card._id });
  }

  return (
    <div className="flex items-center gap-3 border rounded-lg p-3">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-sm font-mono font-semibold">
        {card.cardLast4}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex gap-2 items-center">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Card label"
              className="h-8"
              onKeyDown={(e) => { if (e.key === "Enter") void handleSave(); }}
            />
            <Button size="sm" onClick={() => { void handleSave(); }}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLabel(card.label ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div>
            <span className="font-medium">
              •••• {card.cardLast4}
            </span>
            {card.label && (
              <span className="text-sm text-muted-foreground ml-2">
                — {card.label}
              </span>
            )}
          </div>
        )}
      </div>
      {!editing && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { void handleDelete(); }}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CardsPage() {
  const cards = useQuery(api.userCards.list);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Cards</h1>
        <p className="text-muted-foreground">
          Manage the cards used to match your transactions. Only the last 4
          digits are stored.
        </p>
      </div>

      <AddCardForm />

      <Card>
        <CardHeader>
          <CardTitle>Saved Cards</CardTitle>
          <CardDescription>
            Transactions from all your saved cards will appear on your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cards === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : cards.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No cards added yet. Add a card above to start finding your
              transactions.
            </p>
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
                <CardItem key={card._id} card={card} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
