"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type NewRedemption = { id: string; venue_name: string; checked_in_count: number; redeemed_at: string };

// Live feed: Realtime tells the founder about each new redemption while this page is open and reloads the list.
// (Phone notifications when the panel is closed come later, via web push.)
export function LiveRedemptions() {
  const router = useRouter();
  const [latest, setLatest] = useState<NewRedemption[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`redemptions-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "redemptions" }, (payload) => {
        const row = payload.new as NewRedemption;
        setLatest((current) => [row, ...current].slice(0, 5));
        router.refresh();
      })
      .subscribe((state) => {
        setStatus(state === "SUBSCRIBED" ? "live" : state === "CLOSED" || state === "CHANNEL_ERROR" ? "offline" : "connecting");
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className="mt-4 space-y-2">
      <p className="flex items-center gap-2 text-xs text-ink-500">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 rounded-full ${status === "live" ? "bg-green-500" : status === "offline" ? "bg-red-500" : "bg-ink-300"}`}
        />
        {status === "live" ? "Live: new redemptions appear here" : status === "offline" ? "Live updates disconnected (reload)" : "Connecting…"}
      </p>
      {latest.map((row) => (
        <p key={row.id} role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          New redemption at <strong>{row.venue_name}</strong> · {row.checked_in_count} checked in ·{" "}
          {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(
            new Date(row.redeemed_at),
          )}
        </p>
      ))}
    </div>
  );
}
