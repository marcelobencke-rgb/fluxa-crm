"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { 
  MessageSquare, 
  MailWarning, 
  CircleDot, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Filter,
  User,
  Users,
  UserMinus
} from "lucide-react";
import type { InboxFilter, AssignmentFilter } from "./conversation-list";

interface InboxSidebarProps {
  filter: InboxFilter;
  onFilterChange: (f: InboxFilter) => void;
  assignmentFilter: AssignmentFilter;
  onAssignmentFilterChange: (f: AssignmentFilter) => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function InboxSidebar({ filter, onFilterChange, assignmentFilter, onAssignmentFilterChange, isCollapsed, onToggle }: InboxSidebarProps) {
  const t = useTranslations("Inbox.conversationList");

  const filterOptions = [
    { label: t("filterAll"), value: "all" as InboxFilter, icon: MessageSquare },
    { label: t("filterUnread"), value: "unread" as InboxFilter, icon: MailWarning },
    { label: t("filterOpen"), value: "open" as InboxFilter, icon: CircleDot },
    { label: t("filterPending"), value: "pending" as InboxFilter, icon: Clock },
    { label: t("filterClosed"), value: "closed" as InboxFilter, icon: CheckCircle },
    { label: t("filterNeedsAttention"), value: "needs_attention" as InboxFilter, icon: AlertCircle },
  ];

  const assignmentOptions = [
    { label: t("filterAssignedAll"), value: "all" as AssignmentFilter, icon: Users },
    { label: t("filterAssignedMine"), value: "mine" as AssignmentFilter, icon: User },
    { label: t("filterAssignedUnassigned"), value: "unassigned" as AssignmentFilter, icon: UserMinus },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center border-b border-border gap-2", isCollapsed ? "justify-center px-2" : "justify-between px-4")}>
        {!isCollapsed && (
          <span className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Conversas
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={isCollapsed ? "Expandir" : "Recolher"}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="flex flex-col gap-1 px-2">
          {filterOptions.map((opt) => (
            <li key={opt.value}>
              <button
                onClick={() => onFilterChange(opt.value)}
                title={isCollapsed ? opt.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  filter === opt.value
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  isCollapsed && "justify-center px-0"
                )}
              >
                <opt.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{opt.label}</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className="my-3 mx-4 border-t border-border" />

        <ul className="flex flex-col gap-1 px-2">
          {!isCollapsed && (
            <li className="px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Atribuição
            </li>
          )}
          {assignmentOptions.map((opt) => (
            <li key={opt.value}>
              <button
                onClick={() => onAssignmentFilterChange(opt.value)}
                title={isCollapsed ? opt.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  assignmentFilter === opt.value
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  isCollapsed && "justify-center px-0"
                )}
              >
                <opt.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{opt.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
