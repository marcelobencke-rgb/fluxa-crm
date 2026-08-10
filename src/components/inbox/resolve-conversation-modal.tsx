"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { Conversation, Contact, PipelineStage, Pipeline } from "@/types";
import { Loader2 } from "lucide-react";

interface ResolveConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  contact: Contact;
  agentName?: string;
  onResolved: () => void;
}

export function ResolveConversationModal({
  open,
  onOpenChange,
  conversation,
  contact,
  agentName,
  onResolved,
}: ResolveConversationModalProps) {
  const t = useTranslations("Inbox.messageThread");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [archiveLead, setArchiveLead] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(true);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setArchiveLead(false);
    setFetching(true);

    const supabase = createClient();
    Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .order("position", { ascending: true }),
      supabase.from("pipelines").select("*").limit(1),
    ])
      .then(([stagesRes, pipelinesRes]) => {
        const loadedStages = stagesRes.data || [];
        setStages(loadedStages);
        setPipelines(pipelinesRes.data || []);

        // Preselect current contact stage if existing, otherwise first stage
        const existingStageId = contact.deals?.[0]?.stage_id;
        if (existingStageId && loadedStages.some((s) => s.id === existingStageId)) {
          setSelectedStageId(existingStageId);
        } else if (loadedStages.length > 0) {
          setSelectedStageId(loadedStages[0].id);
        }
      })
      .finally(() => {
        setFetching(false);
      });
  }, [open, contact]);

  async function handleResolve() {
    setLoading(true);
    const supabase = createClient();

    try {
      // 1. Advance deal / create deal for selected stage
      if (selectedStageId) {
        const existingDeal = contact.deals?.[0];
        if (existingDeal) {
          await supabase
            .from("deals")
            .update({
              stage_id: selectedStageId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingDeal.id);
        } else {
          const pipelineId = pipelines[0]?.id;
          if (pipelineId) {
            await supabase.from("deals").insert({
              contact_id: contact.id,
              user_id: conversation.user_id,
              pipeline_id: pipelineId,
              stage_id: selectedStageId,
              title: `Negócio - ${contact.name || contact.phone}`,
              value: 0,
            });
          }
        }
      }

      // 2. Remove attention and optionally archive
      const convUpdate: Record<string, unknown> = {
        needs_attention: false,
        ai_autoreply_disabled: false,
        ai_handoff_summary: null,
      };
      if (archiveLead) {
        convUpdate.status = "closed";
      }
      const { error: updateErr } = await supabase
        .from("conversations")
        .update(convUpdate)
        .eq("id", conversation.id);

      if (updateErr && updateErr.code === "42703") {
        delete convUpdate.needs_attention;
        await supabase
          .from("conversations")
          .update(convUpdate)
          .eq("id", conversation.id);
      }

      // 3. Always insert automatic resolution note (including stage & reason if provided)
      const selectedStage = stages.find((s) => s.id === selectedStageId);
      const stageText = selectedStage
        ? ` -> Etapa do funil: ${selectedStage.name}`
        : "";
      const reasonText = reason.trim() ? ` Motivo: ${reason.trim()}` : "";
      const byText = agentName ? ` por ${agentName}` : " pelo atendente";
      const noteText = `✅ Conversa resolvida${byText} e atenção finalizada${stageText}.${reasonText}`;

      const { error: noteErr } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_type: "agent",
        sender_id: conversation.user_id,
        content_type: "text",
        content_text: noteText,
        status: "sent",
        is_internal: true,
      });
      if (noteErr && noteErr.code === "42703") {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          sender_type: "agent",
          sender_id: conversation.user_id,
          content_type: "text",
          content_text: noteText,
          status: "sent",
        });
      }

      // Immediately clear local state flags
      conversation.needs_attention = false;
      conversation.ai_autoreply_disabled = false;
      conversation.ai_handoff_summary = null;

      toast.success(t("resolveSuccess"));
      onOpenChange(false);
      onResolved();
    } catch (err) {
      console.error("Failed to resolve conversation:", err);
      toast.error(t("resolveError"));
    } finally {
      setLoading(false);
    }
  }

  const selectedStageObj = stages.find((s) => s.id === selectedStageId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("resolveTitle")}</DialogTitle>
          <DialogDescription className="text-xs">
            {t("resolveSubtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo de Resolução (Funnel Stage) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("resolveStageLabel")}
            </Label>
            {fetching ? (
              <div className="flex h-9 items-center justify-center rounded-md border text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando etapas...
              </div>
            ) : (
              <Select
                value={selectedStageId}
                onValueChange={(val) => setSelectedStageId(val || "")}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder={t("resolveStagePlaceholder")}>
                    {selectedStageObj ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: selectedStageObj.color || "#64748b" }}
                        />
                        <span>{selectedStageObj.name}</span>
                      </div>
                    ) : (
                      t("resolveStagePlaceholder")
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: stage.color || "#64748b" }}
                        />
                        <span>{stage.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Motivo */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              {t("resolveReasonLabel")}
            </Label>
            <div className="relative">
              <Textarea
                value={reason}
                onChange={(e) => {
                  if (e.target.value.length <= 250) {
                    setReason(e.target.value);
                  }
                }}
                placeholder={t("resolveReasonPlaceholder")}
                className="min-h-[85px] resize-none text-xs"
                maxLength={250}
              />
              <span className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">
                {reason.length}/250
              </span>
            </div>
          </div>

          {/* Checkbox: Arquivar lead */}
          <div className="flex items-center space-x-2 pt-1">
            <Checkbox
              id="archive-lead-checkbox"
              checked={archiveLead}
              onCheckedChange={(checked) => setArchiveLead(checked === true)}
            />
            <Label
              htmlFor="archive-lead-checkbox"
              className="text-xs font-medium cursor-pointer"
            >
              {t("archiveLead")}
            </Label>
          </div>
        </div>

        <DialogFooter className="mt-4 flex items-center justify-end gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={handleResolve}
            disabled={loading || fetching || !selectedStageId}
          >
            {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("resolveBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
