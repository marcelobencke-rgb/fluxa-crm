export interface NormalizedIncomingMessage {
  id: string;
  from: string; // The phone number of the sender
  timestamp: Date;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'interactive' | 'other';
  text?: string;
  mediaId?: string;
  mediaUrl?: string; // Evolution/Waha usually provide a URL directly instead of just an ID
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  context?: {
    message_id?: string; // If replying to another message
  };
}

export interface SendMessageParams {
  to: string; // Phone number without '+'
  text: string;
  previewUrl?: boolean;
  contextMessageId?: string;
}

export interface SendInteractiveParams {
  to: string;
  interactive: any; // Use the existing interactive payload types
  contextMessageId?: string;
}

export interface SendMediaParams {
  to: string;
  mediaId?: string; // Meta uses mediaId
  mediaUrl?: string; // Evolution uses URLs or base64
  type: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  contextMessageId?: string;
}

export interface SendTemplateParams {
  to: string;
  templateName: string;
  templateLanguage: string;
  templateMessageParams?: any;
  contextMessageId?: string;
}

export interface IWhatsAppProvider {
  /**
   * Send a standard text message
   */
  sendMessage(params: SendMessageParams): Promise<{ messageId: string }>;

  /**
   * Send an interactive message (buttons/lists)
   */
  sendInteractive(params: SendInteractiveParams): Promise<{ messageId: string }>;

  /**
   * Send media (image, video, document)
   */
  sendMedia(params: SendMediaParams): Promise<{ messageId: string }>;

  /**
   * Send a template message.
   * For Meta, this sends a real template. For Evolution, it just resolves the template text and sends a normal message.
   */
  sendTemplate(params: SendTemplateParams): Promise<{ messageId: string }>;
}
