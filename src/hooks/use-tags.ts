"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCachedQuery } from "./use-cached-query";
import type { Tag } from "@/types";

export function useTags() {
  const { accountId } = useAuth();
  
  // Use accountId as the cache key so switching accounts refetches
  const key = accountId ? `tags:${accountId}` : null;

  const { data, loading, error, mutate } = useCachedQuery<Tag[]>(key, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .order("name");
    
    if (error) throw error;
    return data as Tag[];
  });

  return { tags: data ?? [], loading, error, mutate };
}
