"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut, KeyRound, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { getRuntimeConfig } from "@/lib/runtime-config";

export function UserMenu() {
  const [authMode, setAuthMode] = useState<string>("none");
  useEffect(() => {
    setAuthMode(getRuntimeConfig().authMode);
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Even if logout fails, redirect — cookie may already be gone.
    }
    window.location.href = "/login/";
  };

  if (authMode !== "password") return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <Avatar className="h-7 w-7">
            <AvatarFallback>A</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/admin/settings/">
            <User className="mr-2 h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/admin/settings/?tab=password">
            <KeyRound className="mr-2 h-4 w-4" />
            Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
