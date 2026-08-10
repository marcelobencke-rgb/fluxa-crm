"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Notification } from "@/types";

// ============================================================
// Global Realtime Context
//
// Replaces the two independent hooks (useTotalUnread +
// useUnreadNotifications) with a single Realtime channel that
// listens to both `conversations` and `notifications`. This
// halves the number of always-on WebSocket subscriptions in the
// dashboard shell (from 3 down to 2: this + presence).
//
// Mount <GlobalRealtimeProvider> once in the dashboard shell,
// then consume via useGlobalUnread().
// ============================================================

interface GlobalRealtimeValue {
  totalUnread: number;
  unreadNotifications: number;
}

const GlobalRealtimeContext = createContext<GlobalRealtimeValue>({
  totalUnread: 0,
  unreadNotifications: 0,
});

export function GlobalRealtimeProvider({ children }: { children: ReactNode }) {
  const [totalUnread, setTotalUnread] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Live mirror of {id: unread_count} for conversations so
  // INSERT/UPDATE/DELETE events adjust the total in O(1).
  const countsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // ── Initial loads (parallel) ──────────────────────────────

    // Conversations unread
    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, unread_count");
      if (cancelled || error || !data) return;

      const map = new Map<string, number>();
      let sum = 0;
      for (const row of data as { id: string; unread_count: number }[]) {
        const n = row.unread_count ?? 0;
        map.set(row.id, n);
        if (n > 0) sum += 1;
      }
      countsRef.current = map;
      setTotalUnread(sum);
    })();

    // Notifications unread count (head: true → no rows transferred)
    (async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .is("read_at", null);
      if (cancelled || error) return;
      setUnreadNotifications(count ?? 0);
    })();

    // ── Single Realtime channel ───────────────────────────────

    const channel = supabase
      .channel("global-unread-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          const map = countsRef.current;
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Conversation>;
            if (oldRow.id) map.delete(oldRow.id);
          } else {
            const row = payload.new as Conversation;
            map.set(row.id, row.unread_count ?? 0);
          }
          let sum = 0;
          for (const n of map.values()) if (n > 0) sum += 1;
          setTotalUnread(sum);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Notification;
            if (!row.read_at) setUnreadNotifications((n) => n + 1);
          } else if (payload.eventType === "UPDATE") {
            const newRow = payload.new as Notification;
            if (newRow.read_at) setUnreadNotifications((n) => Math.max(0, n - 1));
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Notification>;
            if (!oldRow.read_at) setUnreadNotifications((n) => Math.max(0, n - 1));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <GlobalRealtimeContext.Provider value={{ totalUnread, unreadNotifications }}>
      {children}
    </GlobalRealtimeContext.Provider>
  );
}

/** Read the global unread counts from context. */
export function useGlobalUnread(): GlobalRealtimeValue {
  return useContext(GlobalRealtimeContext);
}
