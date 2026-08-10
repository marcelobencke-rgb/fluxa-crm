"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCachedQuery } from "./use-cached-query";
import type { WhatsAppConfig } from "@/types";

export interface WhatsAppHealth {
  configured: boolean;
  connected: boolean;
  statusText?: string;
}

export function useWhatsAppConfig() {
  const { accountId } = useAuth();
  
  const key = accountId ? `whatsapp-config:${accountId}` : null;

  const { data, loading, error, mutate } = useCachedQuery<{
    config: WhatsAppConfig | null;
    health: WhatsAppHealth;
  }>(key, async () => {
    const supabase = createClient();
    
    // We can fetch the config row and the health check in parallel
    const [configRes, healthRes] = await Promise.all([
      supabase
        .from("whatsapp_config")
        .select("*")
        .eq("account_id", accountId!)
        .maybeSingle(),
      fetch("/api/whatsapp/config").then(r => r.json() as Promise<WhatsAppHealth>).catch(() => ({
        configured: false,
        connected: false
      }))
    ]);

    if (configRes.error) throw configRes.error;

    return {
      config: configRes.data as WhatsAppConfig | null,
      health: healthRes
    };
  });

  return { 
    config: data?.config ?? null,
    health: data?.health ?? { configured: false, connected: false },
    loading, 
    error, 
    mutate 
  };
}
