import type {
  IWhatsAppProvider,
  SendMessageParams,
  SendInteractiveParams,
  SendMediaParams,
  SendTemplateParams,
} from './types';
import { interactivePayloadPreviewText } from '@/lib/whatsapp/interactive';

export class EvolutionProvider implements IWhatsAppProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly instanceName: string
  ) {}

  private get headers() {
    return {
      'Content-Type': 'application/json',
      apikey: this.apiKey,
    };
  }

  private cleanUrl(url: string) {
    return url.replace(/\/$/, '');
  }

  async sendMessage(params: SendMessageParams): Promise<{ messageId: string }> {
    const url = `${this.cleanUrl(this.apiUrl)}/message/sendText/${this.instanceName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        number: params.to,
        text: params.text,
        linkPreview: params.previewUrl !== false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return { messageId: data.key?.id || `evo-${Date.now()}` };
  }

  async sendInteractive(params: SendInteractiveParams): Promise<{ messageId: string }> {
    // Evolution API doesn't support interactive buttons universally on all WhatsApp clients yet,
    // or requires a specific payload format. As a fallback/baseline, we can send it as text.
    // If Evolution v2 supports it natively, it uses /message/sendButtons or /message/sendList.
    // For now, we fallback to sending it as text (the title/description) to guarantee delivery.
    
    // Fallback text generator:
    const p = params.interactive;
    let fallbackText = p.body;
    
    if (p.kind === 'buttons') {
      fallbackText += '\n\n';
      p.buttons.forEach((btn: any, idx: number) => {
        fallbackText += `[${idx + 1}] ${btn.reply.title}\n`;
      });
      fallbackText += '\n(Responda com o número da opção)';
    } else if (p.kind === 'list') {
      fallbackText += '\n\n';
      p.sections.forEach((sec: any) => {
        fallbackText += `*${sec.title}*\n`;
        sec.rows.forEach((row: any, idx: number) => {
          fallbackText += `[${idx + 1}] ${row.title}${row.description ? ` - ${row.description}` : ''}\n`;
        });
      });
      fallbackText += '\n(Responda com o número da opção)';
    }

    return this.sendMessage({
      to: params.to,
      text: fallbackText,
    });
  }

  async sendMedia(params: SendMediaParams): Promise<{ messageId: string }> {
    const url = `${this.cleanUrl(this.apiUrl)}/message/sendMedia/${this.instanceName}`;
    
    // Evolution API requires base64 or URL for media. We will pass the mediaUrl.
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        number: params.to,
        mediaMessage: {
          mediatype: params.type === 'image' ? 'image' : params.type === 'video' ? 'video' : 'document',
          caption: params.caption,
          media: params.mediaUrl, 
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return { messageId: data.key?.id || `evo-${Date.now()}` };
  }

  async sendTemplate(params: SendTemplateParams): Promise<{ messageId: string }> {
    // Evolution API has no native concept of "approved templates" like Meta.
    // The CRM should pre-resolve the template text using `templateMessageParams`
    // and send it as a standard text message.
    
    let resolvedText = `[Template: ${params.templateName}]`;
    // Ideally, the caller resolves the text and passes it in, or we implement a template compiler here.
    // We will assume the caller passes the resolved text via `templateMessageParams.resolvedText` for Evolution.
    if (params.templateMessageParams?.resolvedText) {
      resolvedText = params.templateMessageParams.resolvedText;
    }
    
    return this.sendMessage({
      to: params.to,
      text: resolvedText,
    });
  }
}
