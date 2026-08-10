"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES } from "@/lib/currency";
import type {
  Contact,
  Conversation,
  Deal,
  DealStatus,
  PipelineStage,
  Profile,
} from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Check,
  X,
  Trash2,
  MessageSquare,
  DollarSign,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  defaultContactId?: string;
  onSaved: () => void;
}

export function DealForm({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  defaultContactId,
  onSaved,
}: DealFormProps) {
  const t = useTranslations("Pipelines.form");
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [contactId, setContactId] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [linkedConversation, setLinkedConversation] =
    useState<Conversation | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [availableConversations, setAvailableConversations] = useState<
    Conversation[]
  >([]);
  const [fetchingConvs, setFetchingConvs] = useState(false);

  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Reset the form fields every time the sheet opens or its input
  // props change. This is a legitimate prop-driven sync; the rule is
  // over-cautious here, hence the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (deal) {
      setTitle(deal.title);
      setValue(String(deal.value ?? ""));
      setCurrency(deal.currency || defaultCurrency);
      setContactId(deal.contact_id ?? "");
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? "");
      setExpectedCloseDate(deal.expected_close_date ?? "");
      setNotes(deal.notes ?? "");
    } else {
      setTitle("");
      setValue("");
      setCurrency(defaultCurrency);
      setContactId(defaultContactId ?? "");
      setStageId(defaultStageId || stages[0]?.id || "");
      setAssignedTo("");
      setExpectedCloseDate("");
      setNotes("");
    }
  }, [open, deal, defaultStageId, defaultContactId, stages, defaultCurrency]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load supporting data once the sheet is open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [c, p] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      if (cancelled) return;
      setContacts((c.data ?? []) as Contact[]);
      setProfiles((p.data ?? []) as Profile[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  // Fetch linked conversation for the selected contact (newest open one).
  // Clearing on no-selection is sync with prop state; the populated
  // case runs setLinkedConversation inside the async fetch callback.
  useEffect(() => {
    if (!open) {
      queueMicrotask(() => setLinkedConversation(null));
      return;
    }
    let cancelled = false;
    (async () => {
      if (deal?.conversation_id) {
        const { data } = await supabase
          .from("conversations")
          .select("*")
          .eq("id", deal.conversation_id)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setLinkedConversation(data as Conversation);
          return;
        }
      }
      if (!contactId) {
        queueMicrotask(() => setLinkedConversation(null));
        return;
      }
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setLinkedConversation((data as Conversation | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, deal?.conversation_id, contactId, supabase]);

  useEffect(() => {
    if (!linkModalOpen) return;
    let cancelled = false;
    queueMicrotask(() => setFetchingConvs(true));
    (async () => {
      let query = supabase
        .from("conversations")
        .select("*, contact:contacts(*)")
        .order("last_message_at", { ascending: false })
        .limit(30);
      if (contactId) {
        query = query.eq("contact_id", contactId);
      } else if (accountId) {
        query = query.eq("account_id", accountId);
      }
      const { data } = await query;
      if (cancelled) return;
      setAvailableConversations((data as Conversation[] | null) ?? []);
      setFetchingConvs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [linkModalOpen, contactId, accountId, supabase]);

  async function handleLinkConversation(conv: Conversation) {
    setLinkedConversation(conv);
    if (!contactId && conv.contact_id) {
      setContactId(conv.contact_id);
    }
    if (deal?.id) {
      const updatePayload: Record<string, unknown> = {
        conversation_id: conv.id,
      };
      if (!contactId && conv.contact_id) {
        updatePayload.contact_id = conv.contact_id;
      }
      const { error } = await supabase
        .from("deals")
        .update(updatePayload)
        .eq("id", deal.id);
      if (error) {
        toast.error("Erro ao vincular conversa");
      } else {
        toast.success("Conversa vinculada com sucesso");
        onSaved();
      }
    } else {
      toast.success("Conversa selecionada para o negócio");
    }
    setLinkModalOpen(false);
  }

  async function handleUnlinkConversation() {
    setLinkedConversation(null);
    if (deal?.id) {
      await supabase
        .from("deals")
        .update({ conversation_id: null })
        .eq("id", deal.id);
      toast.success("Vínculo removido");
      onSaved();
    }
    setLinkModalOpen(false);
  }


  async function handleSave() {
    if (!title.trim() || !contactId || !stageId) {
      toast.error(t("toastRequired"));
      return;
    }
    setSaving(true);

    const payload = {
      title: title.trim(),
      value: parseFloat(value) || 0,
      currency,
      contact_id: contactId,
      conversation_id: linkedConversation?.id || null,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: notes.trim() || null,
      expected_close_date: expectedCloseDate || null,
    };

    if (deal) {
      const { error } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", deal.id);
      if (error) {
        toast.error(t("toastFailedSave"));
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error(t("toastNotSignedIn"));
        setSaving(false);
        return;
      }
      if (!accountId) {
        toast.error(t("toastNotLinked"));
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from("deals")
        .insert({ ...payload, user_id: user.id, account_id: accountId, status: "open" });
      if (error) {
        toast.error(t("toastFailedCreate"));
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    toast.success(deal ? t("toastUpdated") : t("toastCreated"));
    onOpenChange(false);
    onSaved();
  }

  async function handleStatusChange(status: DealStatus) {
    if (!deal) return;
    setStatusAction(status);
    const { error } = await supabase
      .from("deals")
      .update({ status })
      .eq("id", deal.id);
    setStatusAction(null);
    if (error) {
      toast.error(t("toastFailedStatus"));
      return;
    }
    toast.success(
      status === "won" ? t("toastMarkedWon") : status === "lost" ? t("toastMarkedLost") : t("toastReopened"),
    );
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    setDeleting(false);
    if (error) {
      toast.error(t("toastFailedDelete"));
      return;
    }
    toast.success(t("toastDeleted"));
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  const selectedContact = contacts.find((c) => c.id === contactId);
  const selectedContactLabel = selectedContact
    ? (selectedContact.name &&
       selectedContact.name !== selectedContact.phone &&
       selectedContact.name.replace(/\D/g, "") !== selectedContact.phone.replace(/\D/g, "")
        ? `${selectedContact.name} (${selectedContact.phone})`
        : selectedContact.phone || selectedContact.name)
    : t("selectContact");

  const uniqueStages = useMemo(() => {
    const seen = new Set<string>();
    return stages.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [stages]);

  const selectedStage = uniqueStages.find((s) => s.id === stageId);
  const selectedStageLabel = selectedStage ? selectedStage.name : t("stage");

  const selectedProfile = profiles.find((p) => p.id === assignedTo);
  const selectedAssignedLabel = selectedProfile
    ? (selectedProfile.full_name || selectedProfile.email)
    : t("unassigned");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {deal ? t("editDeal") : t("newDeal")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            {/* INFORMAÇÕES BÁSICAS */}
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("title")}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                  className="border-border bg-muted text-foreground"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("contact")}</Label>
                <Select
                  value={contactId || "none"}
                  onValueChange={(val) => setContactId(val === "none" || !val ? "" : val)}
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder={t("selectContact")}>
                      {selectedContactLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("selectContact")}</SelectItem>
                    {contacts.map((c) => {
                      const hasCustomName =
                        c.name &&
                        c.name !== c.phone &&
                        c.name.replace(/\D/g, "") !== c.phone.replace(/\D/g, "");
                      const label = hasCustomName
                        ? `${c.name} (${c.phone})`
                        : c.phone || c.name;
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">Conversa Vinculada</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {linkedConversation ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setLinkModalOpen(true)}
                        className="gap-1.5 text-xs h-8"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        <span>{t("linkToConversation")}</span>
                      </Button>
                      <Link
                        href={`/inbox?c=${linkedConversation.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Abrir conversa</span>
                      </Link>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLinkModalOpen(true)}
                      className="gap-1.5 text-xs h-8 text-muted-foreground"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>{t("linkToConversation")}</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="h-px w-full bg-border/50" />

            {/* VALORES E DATAS */}
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <div className="grid gap-2">
                  <Label className="text-muted-foreground">{t("value")}</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="0"
                      className="border-border bg-muted pl-7 text-foreground"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-muted-foreground">{t("currency")}</Label>
                  <Select
                    value={currency}
                    onValueChange={(val) => val && setCurrency(val)}
                  >
                    <SelectTrigger className="w-full bg-muted border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("expectedCloseDate")}</Label>
                <Input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>
            </div>

            <div className="h-px w-full bg-border/50" />

            {/* FUNIL E ATRIBUIÇÃO */}
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("stage")}</Label>
                <Select
                  value={stageId}
                  onValueChange={(val) => val && setStageId(val)}
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder={t("stage")}>
                      {selectedStageLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("assignedTo")}</Label>
                <Select
                  value={assignedTo || "unassigned"}
                  onValueChange={(val) => setAssignedTo(val === "unassigned" || !val ? "" : val)}
                >
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder={t("unassigned")}>
                      {selectedAssignedLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t("unassigned")}</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="h-px w-full bg-border/50" />

            {/* NOTAS */}
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("notes")}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("notesPlaceholder")}
                  className="min-h-[100px] border-border bg-muted text-foreground resize-none"
                />
              </div>
            </div>

            {deal && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("status")}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("won")}
                    disabled={!!statusAction || deal.status === "won"}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {statusAction === "won" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-3.5 w-3.5 shrink-0" />
                        <span>{t("markAsWon")}</span>
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("lost")}
                    disabled={!!statusAction || deal.status === "lost"}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {statusAction === "lost" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="mr-1 h-3.5 w-3.5 shrink-0" />
                        <span>{t("markAsLost")}</span>
                      </>
                    )}
                  </Button>
                </div>
                {deal.status && deal.status !== "open" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleStatusChange("open")}
                    disabled={!!statusAction}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    {t("reopenDeal")}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 bg-popover/80 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim() || !contactId || !stageId}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? t("saving") : deal ? t("saveChanges") : t("createDeal")}
              </Button>
            </div>

            {deal &&
              (confirmDelete ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
                  <span className="text-red-300">{t("deletePrompt")}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? t("deleting") : t("confirm")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("deleteDeal")}
                </button>
              ))}
          </div>
        </div>
      </SheetContent>

      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Conversa ao Negócio</DialogTitle>
            <DialogDescription className="text-xs">
              Selecione uma conversa para vincular a este negócio.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto space-y-1.5 py-2">
            {fetchingConvs ? (
              <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando conversas...
              </div>
            ) : availableConversations.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Nenhuma conversa encontrada.
              </div>
            ) : (
              availableConversations.map((conv) => {
                const convContact = (conv as { contact?: Contact }).contact ||
                  contacts.find((c) => c.id === conv.contact_id);
                const isSelected = linkedConversation?.id === conv.id;
                const contactName =
                  convContact?.name ||
                  convContact?.phone ||
                  "Contato " + conv.contact_id.slice(0, 6);
                return (
                  <div
                    key={conv.id}
                    onClick={() => handleLinkConversation(conv)}
                    className={`flex items-center justify-between rounded-lg border p-2.5 text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{contactName}</div>
                      <div className="text-muted-foreground truncate text-[11px]">
                        Status: {conv.status === "open" ? "Aberta" : "Fechada"} • Última msg:{" "}
                        {conv.last_message_at
                          ? new Date(conv.last_message_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "---"}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex justify-between border-t pt-3">
            {linkedConversation ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleUnlinkConversation}
                className="text-xs text-destructive hover:text-destructive"
              >
                Remover vínculo
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLinkModalOpen(false)}
              className="text-xs"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
