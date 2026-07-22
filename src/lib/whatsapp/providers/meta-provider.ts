import {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  type MediaKind,
} from '@/lib/whatsapp/meta-api';
import type { MessageTemplate } from '@/types';
import type {
  IWhatsAppProvider,
  SendMessageParams,
  SendInteractiveParams,
  SendMediaParams,
  SendTemplateParams,
} from './types';

export class MetaProvider implements IWhatsAppProvider {
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly dbContext?: {
      fetchTemplateRow: (name: string, lang: string) => Promise<MessageTemplate | null>;
    }
  ) {}

  async sendMessage(params: SendMessageParams): Promise<{ messageId: string }> {
    const result = await sendTextMessage({
      phoneNumberId: this.phoneNumberId,
      accessToken: this.accessToken,
      to: params.to,
      text: params.text,
      contextMessageId: params.contextMessageId,
    });
    return { messageId: result.messageId };
  }

  async sendInteractive(params: SendInteractiveParams): Promise<{ messageId: string }> {
    const p = params.interactive;
    if (p.kind === 'buttons') {
      const result = await sendInteractiveButtons({
        phoneNumberId: this.phoneNumberId,
        accessToken: this.accessToken,
        to: params.to,
        bodyText: p.body,
        headerText: p.header || undefined,
        footerText: p.footer || undefined,
        buttons: p.buttons,
        contextMessageId: params.contextMessageId,
      });
      return { messageId: result.messageId };
    } else {
      const result = await sendInteractiveList({
        phoneNumberId: this.phoneNumberId,
        accessToken: this.accessToken,
        to: params.to,
        bodyText: p.body,
        buttonLabel: p.button_label,
        headerText: p.header || undefined,
        footerText: p.footer || undefined,
        sections: p.sections,
        contextMessageId: params.contextMessageId,
      });
      return { messageId: result.messageId };
    }
  }

  async sendMedia(params: SendMediaParams): Promise<{ messageId: string }> {
    const result = await sendMediaMessage({
      phoneNumberId: this.phoneNumberId,
      accessToken: this.accessToken,
      to: params.to,
      kind: params.type as MediaKind,
      link: params.mediaUrl || params.mediaId!,
      caption: params.caption || undefined,
      contextMessageId: params.contextMessageId,
    });
    return { messageId: result.messageId };
  }

  async sendTemplate(params: SendTemplateParams): Promise<{ messageId: string }> {
    let templateRow: MessageTemplate | undefined;
    if (this.dbContext) {
      const row = await this.dbContext.fetchTemplateRow(params.templateName, params.templateLanguage);
      if (row) templateRow = row;
    }

    const result = await sendTemplateMessage({
      phoneNumberId: this.phoneNumberId,
      accessToken: this.accessToken,
      to: params.to,
      templateName: params.templateName,
      language: params.templateLanguage,
      template: templateRow,
      messageParams: params.templateMessageParams,
      params: [], // For legacy positional params, could be added to SendTemplateParams
      contextMessageId: params.contextMessageId,
    });
    return { messageId: result.messageId };
  }
}
