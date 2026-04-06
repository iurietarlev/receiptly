"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthedRedirect() {
  const user = useQuery(api.users.currentUser);
  const router = useRouter();

  useEffect(() => {
    if (user === undefined) return; // loading
    if (user === null) {
      router.push("/role-select");
    } else if (user.role === "merchant") {
      router.push("/merchant/dashboard");
    } else {
      router.push("/dashboard");
    }
  }, [user, router]);

  return (
    <div className="flex flex-col gap-4 items-center py-12">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
