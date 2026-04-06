"use client";

import { Button } from "@/components/ui/button";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { StickyHeader } from "@/components/layout/sticky-header";
import { AuthedRedirect } from "@/components/auth/authed-redirect";

export default function Home() {
  return (
    <>
      <StickyHeader className="px-4 py-2">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-lg">Receiptly</span>
          <div className="flex gap-4">
            <Unauthenticated>
              <SignInButton mode="modal">
                <Button variant="ghost">Sign in</Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button>Sign up</Button>
              </SignUpButton>
            </Unauthenticated>
          </div>
        </div>
      </StickyHeader>
      <main className="container max-w-4xl flex flex-col gap-8 px-4 py-8 md:py-16">
        <Authenticated>
          <AuthedRedirect />
        </Authenticated>
        <Unauthenticated>
          <div className="text-center space-y-6">
            <h1 className="text-4xl font-extrabold">
              Receipt retrieval, simplified
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Retrieve your transaction receipts from SumUp-powered merchants
              and push them directly into Xero as invoices.
            </p>
            <div className="flex gap-4 justify-center">
              <SignUpButton mode="modal">
                <Button size="lg">Get started</Button>
              </SignUpButton>
              <SignInButton mode="modal">
                <Button size="lg" variant="outline">
                  Sign in
                </Button>
              </SignInButton>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="border rounded-lg p-6 space-y-2">
              <h3 className="font-semibold">For Merchants</h3>
              <p className="text-sm text-muted-foreground">
                Connect your SumUp account and let customers self-serve their
                receipts. No more fielding receipt requests.
              </p>
            </div>
            <div className="border rounded-lg p-6 space-y-2">
              <h3 className="font-semibold">Find Transactions</h3>
              <p className="text-sm text-muted-foreground">
                Enter the last 4 digits of your card to find transactions across
                all participating merchants.
              </p>
            </div>
            <div className="border rounded-lg p-6 space-y-2">
              <h3 className="font-semibold">Push to Xero</h3>
              <p className="text-sm text-muted-foreground">
                Connect your Xero account and push transactions as invoices with
                a single click.
              </p>
            </div>
          </div>
        </Unauthenticated>
      </main>
    </>
  );
}
