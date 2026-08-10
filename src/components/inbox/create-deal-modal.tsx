"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Pipeline, PipelineStage } from "@/types";
import { DealForm } from "@/components/pipelines/deal-form";

interface CreateDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onSaved: () => void;
}

export function CreateDealModal({
  open,
  onOpenChange,
  contactId,
  onSaved,
}: CreateDealModalProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [fetching, setFetching] = useState(true);

  // When opened, fetch all pipelines and stages
  useEffect(() => {
    if (!open) return;
    setFetching(true);

    const supabase = createClient();
    Promise.all([
      supabase.from("pipelines").select("*").order("name"),
      supabase.from("pipeline_stages").select("*").order("position"),
    ])
      .then(([pipesRes, stagesRes]) => {
        const loadedPipes = pipesRes.data || [];
        const loadedStages = stagesRes.data || [];
        setPipelines(loadedPipes);
        setStages(loadedStages);

        if (loadedPipes.length > 0) {
          setSelectedPipelineId(loadedPipes[0].id);
        }
      })
      .finally(() => {
        setFetching(false);
      });
  }, [open]);

  // Once a pipeline is selected (or there is only one), we render the DealForm.
  // Wait, DealForm uses a Sheet. If we render DealForm inside a Dialog, it might conflict 
  // because DealForm renders its own Sheet.
  // Actually, DealForm renders `<Sheet>` at its root. 
  // We can just conditionally render the DealForm sheet when the user confirms the pipeline,
  // OR we can pass `contactId` down to DealForm? Wait, DealForm manages its own state and contact selector.
  // But wait, if DealForm is a `<Sheet>`, we don't need a `<Dialog>` wrapper for it!
  // We can just use the `<Dialog>` to select the pipeline, and when they click "Continue", 
  // we open the `DealForm` Sheet.
  
  const [dealFormOpen, setDealFormOpen] = useState(false);

  // If there's only 1 pipeline, skip the dialog and go straight to the DealForm?
  // Let's just use a simple state machine.
  useEffect(() => {
    if (open && !fetching && pipelines.length === 1) {
      setDealFormOpen(true);
    }
  }, [open, fetching, pipelines.length]);

  const handlePipelineConfirm = () => {
    setDealFormOpen(true);
  };

  const handleSaved = () => {
    setDealFormOpen(false);
    onOpenChange(false);
    onSaved();
  };

  const handleDealFormChange = (isOpen: boolean) => {
    setDealFormOpen(isOpen);
    if (!isOpen) {
      onOpenChange(false);
    }
  };

  // The stages passed to DealForm must be filtered by the selected pipeline
  const filteredStages = stages.filter((s) => s.pipeline_id === selectedPipelineId);
  const defaultStage = filteredStages.length > 0 ? filteredStages[0].id : undefined;

  return (
    <>
      <Dialog 
        open={open && !dealFormOpen && !fetching && pipelines.length > 1} 
        onOpenChange={(isOpen) => {
          if (!isOpen) onOpenChange(false);
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Criar Novo Negócio</DialogTitle>
            <DialogDescription>
              Selecione em qual funil de vendas este negócio será criado.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Funil de Vendas</Label>
              <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um funil" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <button 
              className="mt-4 flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              onClick={handlePipelineConfirm}
              disabled={!selectedPipelineId}
            >
              Continuar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Render DealForm once pipeline is chosen */}
      {dealFormOpen && selectedPipelineId && (
        <DealForm
          open={dealFormOpen}
          onOpenChange={handleDealFormChange}
          pipelineId={selectedPipelineId}
          stages={filteredStages}
          defaultStageId={defaultStage}
          onSaved={handleSaved}
          // We need a way to pre-fill the contact in DealForm.
          // DealForm has `deal?: Deal | null`. If we pass a partial Deal? No, it expects a full deal for editing.
          // Let's check DealForm props. 
        />
      )}
    </>
  );
}
