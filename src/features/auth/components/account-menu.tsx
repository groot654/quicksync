"use client";

import { DownloadIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

import { signOut } from "../actions";

export function AccountMenu({ email }: { email: string | null }) {
  const [isSigningOut, startSignOut] = useTransition();
  const { mode, promptInstall } = useInstallPrompt();

  const handleSignOut = () => {
    startSignOut(async () => {
      try {
        await signOut();
      } finally {
        // A full navigation drops every message held in memory; `replace` keeps the
        // signed-in page out of the back stack.
        window.location.replace("/login");
      }
    });
  };

  const handleInstall = async () => {
    if (mode === "prompt") {
      await promptInstall();
    } else if (mode === "ios-instructions") {
      toast.info("Install on iPhone", {
        description: "In Safari, tap the Share button, then choose “Add to Home Screen”.",
        duration: 8000,
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full"
          disabled={isSigningOut}
        >
          <SettingsIcon className="size-[18px]" aria-hidden="true" />
          <span className="sr-only">Account and settings</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-xs font-normal text-muted-foreground">Signed in as</span>
          <span className="truncate text-sm font-medium">{email ?? "Unknown account"}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(mode === "prompt" || mode === "ios-instructions") && (
          <DropdownMenuItem className="min-h-10" onSelect={() => void handleInstall()}>
            <DownloadIcon aria-hidden="true" />
            Install app
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          className="min-h-10"
          disabled={isSigningOut}
          onSelect={(event) => {
            event.preventDefault();
            handleSignOut();
          }}
        >
          <LogOutIcon aria-hidden="true" />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
