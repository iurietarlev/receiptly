"use client";

import { useState } from "react";
import { Authenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { UserButton } from "@clerk/nextjs";
import { StickyHeader } from "@/components/layout/sticky-header";
import { StickySidebar } from "@/components/layout/sticky-sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HamburgerMenuIcon, Cross2Icon } from "@radix-ui/react-icons";
import { RemoveScroll } from "react-remove-scroll";

function NavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "block px-3 py-2 rounded-md text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

function MerchantNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Merchant
      </p>
      <NavLink href="/merchant/dashboard" onClick={onNavigate}>Dashboard</NavLink>
      <NavLink href="/merchant/onboarding" onClick={onNavigate}>SumUp Connection</NavLink>
      <NavLink href="/settings" onClick={onNavigate}>Settings</NavLink>
    </nav>
  );
}

function CustomerNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Customer
      </p>
      <NavLink href="/dashboard" onClick={onNavigate}>Transactions</NavLink>
      <NavLink href="/cards" onClick={onNavigate}>My Cards</NavLink>
      <NavLink href="/merchants" onClick={onNavigate}>Merchant Directory</NavLink>
      <NavLink href="/settings" onClick={onNavigate}>Settings</NavLink>
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useQuery(api.users.currentUser);

  if (user === undefined) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (user?.role === "merchant") {
    return <MerchantNav onNavigate={onNavigate} />;
  }
  return <CustomerNav onNavigate={onNavigate} />;
}

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <Authenticated>
      <StickyHeader className="px-4 py-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? (
                <Cross2Icon className="h-5 w-5" />
              ) : (
                <HamburgerMenuIcon className="h-5 w-5" />
              )}
            </Button>
            <Link href="/" className="font-semibold text-lg">
              Receiptly
            </Link>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </StickyHeader>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <RemoveScroll>
          <div
            className="fixed inset-0 top-[calc(2.5rem+1px)] z-40 bg-background/80 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <div
              className="w-64 h-full bg-background border-r"
              onClick={(e) => e.stopPropagation()}
            >
              <SidebarContent onNavigate={() => setSidebarOpen(false)} />
            </div>
          </div>
        </RemoveScroll>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)]">
        {/* Desktop sidebar */}
        <StickySidebar className="hidden md:block top-[calc(2.5rem+1px)] h-[calc(100vh-(2.5rem+1px))] border-r">
          <SidebarContent />
        </StickySidebar>
        <main className="min-h-[calc(100vh-(2.5rem+1px))] p-4 md:p-6">
          {children}
        </main>
      </div>
    </Authenticated>
  );
}
