"use client";

import { BookOpen } from "lucide-react";
import type React from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type AdminPageHeaderProps = {
  title: string;
  description?: string;
  docsHref?: string;
  isDirty?: boolean;
  /** Page-specific action area, rendered to the right of the title. */
  children?: React.ReactNode;
};

/**
 * Shared header used by every admin page. Owns the unsaved-changes
 * badge (driven by `isDirty`) and the optional docs icon button.
 */
export function AdminPageHeader({
  title,
  description,
  docsHref,
  isDirty = false,
  children,
}: AdminPageHeaderProps) {
  return (
    <header className="flex flex-row items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="font-serif text-2xl font-medium text-foreground">
            {title}
          </h1>
          {isDirty && (
            <span
              className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400"
              role="status"
              aria-live="polite"
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {(children || docsHref) && (
        <div className="flex items-center gap-2">
          {children}
          {docsHref && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" asChild>
                  <a href={docsHref} target="_blank" rel="noreferrer">
                    <BookOpen className="h-4 w-4" />
                    <span className="sr-only">Documentation</span>
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Documentation</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </header>
  );
}
