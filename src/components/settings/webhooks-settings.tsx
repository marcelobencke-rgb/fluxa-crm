'use client';

// ============================================================
// WebhooksSettings — Settings → Webhooks
//
// Combines Inbound Webhook Sources, Outbound Webhook Endpoints, and
// Real-time Activity Logs into a cohesive 3-tab UI.
// ============================================================

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SourcesTab } from './webhooks/sources-tab';
import { OutboundTab } from './webhooks/outbound-tab';
import { ActivityTab } from './webhooks/activity-tab';

export function WebhooksSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Webhooks & Automações de Integração
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Receba contatos externos de Landing Pages e envie notificações em
          tempo real para sistemas conectados (n8n, Zapier, Make, ERP).
        </p>
      </div>

      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="sources">Receber dados (Inbound)</TabsTrigger>
          <TabsTrigger value="outbound">
            Webhooks de saída (Outbound)
          </TabsTrigger>
          <TabsTrigger value="activity">Atividade & Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="sources" className="space-y-4">
          <SourcesTab />
        </TabsContent>
        <TabsContent value="outbound" className="space-y-4">
          <OutboundTab />
        </TabsContent>
        <TabsContent value="activity" className="space-y-4">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
