"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useAuth() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: api.me,
    retry: false,
  });
}
