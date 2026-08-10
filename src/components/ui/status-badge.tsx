"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type StatusVariant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral"
  | "active"
  | "inactive"

export interface StatusBadgeProps {
  status: StatusVariant | string
  label?: string
  dot?: boolean
  className?: string
}

const statusStyles: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  error: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  inactive: "bg-muted text-muted-foreground border-transparent",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  neutral: "bg-secondary text-secondary-foreground border-transparent",
}

const dotStyles: Record<string, string> = {
  success: "bg-emerald-500",
  active: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
  inactive: "bg-muted-foreground",
  info: "bg-blue-500",
  neutral: "bg-slate-400",
}

export function StatusBadge({
  status,
  label,
  dot = true,
  className,
}: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase()
  const styleClass = statusStyles[normalizedStatus] || statusStyles.neutral
  const dotClass = dotStyles[normalizedStatus] || dotStyles.neutral
  const displayLabel = label || status

  return (
    <Badge
      variant="outline"
      className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 font-medium text-xs rounded-full", styleClass, className)}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dotClass)}
          aria-hidden="true"
        />
      )}
      <span>{displayLabel}</span>
    </Badge>
  )
}
