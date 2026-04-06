"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Authenticated } from "convex/react";
import { StickyHeader } from "@/components/layout/sticky-header";
import { UserButton } from "@clerk/nextjs";

export default function RoleSelect() {
  const createUser = useMutation(api.users.createUser);
  const router = useRouter();

  function selectRole(role: "merchant" | "customer") {
    void createUser({ role }).then(() => {
      if (role === "merchant") {
        router.push("/merchant/onboarding");
      } else {
        router.push("/dashboard");
      }
    });
  }

  return (
    <Authenticated>
      <StickyHeader className="px-4 py-2">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-lg">Receiptly</span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </StickyHeader>
      <main className="container max-w-2xl px-4 py-8 md:py-16">
        <h1 className="text-3xl font-bold text-center mb-2">
          Welcome to Receiptly
        </h1>
        <p className="text-center text-muted-foreground mb-8">
          How will you use the platform?
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardHeader>
              <CardTitle>I&apos;m a Merchant</CardTitle>
              <CardDescription>
                I accept payments through SumUp and want to let my customers
                retrieve their receipts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                onClick={() => selectRole("merchant")}
              >
                Continue as Merchant
              </Button>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary transition-colors">
            <CardHeader>
              <CardTitle>I&apos;m a Customer</CardTitle>
              <CardDescription>
                I pay at merchants with my card and want to find my receipts and
                push them to Xero.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => selectRole("customer")}
              >
                Continue as Customer
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </Authenticated>
  );
}
