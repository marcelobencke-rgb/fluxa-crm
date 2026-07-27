import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processMessage, handleStatusUpdate } from '../route' // Reuse core logic
import { findExistingContact } from '@/lib/contacts/dedupe'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'

export const maxDuration = 60

let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

export async function POST(request: Request) {
  let body: any
  try {
    body = await request.json()
  } catch (error) {
    console.error('[evo-webhook] Invalid JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Extract instance identifier regardless of structure (string, object, etc.)
  const rawInstance = body.instance ?? body.instanceId ?? body.instanceName
  const instanceName = typeof rawInstance === 'object'
    ? (rawInstance?.instanceName || rawInstance?.name || rawInstance?.id || '')
    : String(rawInstance || '')

  console.log('[evo-webhook] POST received', JSON.stringify({
    event: body.event,
    instance: instanceName,
    hasData: !!body.data,
    topKeys: Object.keys(body),
  }))

  after(async () => {
    try {
      await processEvolutionWebhook(body, instanceName)
    } catch (error) {
      console.error('Error processing Evolution webhook:', error)
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processEvolutionWebhook(body: any, instanceName: string) {
  let configRows: any[] = []
  if (instanceName) {
    const { data } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('evolution_instance_id', instanceName)
    if (data && data.length > 0) configRows = data
  }

  if (configRows.length === 0) {
    const { data: fallbackRows } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('*')
      .eq('provider', 'evolution')
    if (fallbackRows && fallbackRows.length > 0) {
      configRows = fallbackRows
    }
  }

  if (configRows.length === 0) {
    console.error('[evo-webhook] No config found for instance:', instanceName || 'unknown')
    return
  }

  const config = configRows[0]
  const rawEvent = String(body.event || body.type || body.action || '')
  const event = rawEvent.toLowerCase()

  console.log('[evo-webhook] Processing event:', rawEvent, '| instance:', instanceName, '| config.account_id:', config.account_id)

  const rawData = body.data || body.response || body
  let msgData = Array.isArray(rawData) ? rawData[0] : rawData
  if (msgData?.messages && Array.isArray(msgData.messages)) {
    msgData = msgData.messages[0]
  }
  if (msgData?.messageData) {
    msgData = msgData.messageData
  }

  if (!msgData) {
    console.log('[evo-webhook] No msgData found after extraction. rawData keys:', rawData ? Object.keys(rawData) : 'null')
    return
  }

  const remoteJid =
    msgData?.key?.remoteJid || msgData?.remoteJid || msgData?.key?.participant
  const hasMessage = !!(
    msgData?.message ||
    msgData?.messageContent ||
    msgData?.conversation ||
    msgData?.extendedTextMessage ||
    msgData?.imageMessage ||
    msgData?.videoMessage ||
    msgData?.audioMessage ||
    msgData?.documentMessage
  )

  console.log('[evo-webhook] Payload analysis:', JSON.stringify({
    remoteJid: remoteJid || null,
    hasMessage,
    fromMe: msgData?.key?.fromMe,
    hasKey: !!msgData?.key,
    msgDataKeys: Object.keys(msgData || {}),
    messageKeys: msgData?.message ? Object.keys(msgData.message) : null,
  }))

  // 1. Handle incoming / outgoing messages (if remoteJid + message contents exist)
  if (remoteJid && hasMessage) {
    // Messages sent from the user's mobile phone (fromMe: true)
    if (msgData?.key?.fromMe === true || msgData?.fromMe === true) {
      await processOutboundEvolutionMessage(msgData, config)
      return
    }

    if (remoteJid.includes('@g.us')) return // Ignore groups for now

    // Remove @s.whatsapp.net and device suffix like :12
    const phone = remoteJid.split('@')[0].split(':')[0]
    const pushName = msgData?.pushName || msgData?.verifiedBizName || phone
    const msgId = msgData?.key?.id || msgData?.id || `evo-${Date.now()}`

    // The actual text/media content is inside msgData.message or msgData
    const messageContent =
      msgData?.message || msgData?.messageContent || msgData

    // Extract reply context — Evolution sends this as contextInfo.stanzaId
    // inside the message content (e.g. extendedTextMessage.contextInfo.stanzaId)
    const contextInfo =
      msgData?.contextInfo ||
      messageContent?.contextInfo ||
      messageContent?.extendedTextMessage?.contextInfo ||
      messageContent?.imageMessage?.contextInfo ||
      messageContent?.videoMessage?.contextInfo ||
      messageContent?.audioMessage?.contextInfo ||
      messageContent?.documentMessage?.contextInfo
    const quotedStanzaId = contextInfo?.stanzaId || contextInfo?.quotedMessage?.key?.id || null

    // Transform Evolution payload into Meta-like format
    const metaMessage: any = {
      id: msgId,
      from: phone,
      timestamp: String(
        msgData.messageTimestamp || Math.floor(Date.now() / 1000),
      ),
      type: 'text', // default
      // Reply context — processMessage uses message.context.id to resolve the parent
      ...(quotedStanzaId ? { context: { id: quotedStanzaId } } : {}),
    }

    const textBody =
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.text ||
      msgData.body ||
      msgData.text

    if (
      textBody ||
      messageContent.conversation ||
      messageContent.extendedTextMessage
    ) {
      metaMessage.type = 'text'
      metaMessage.text = { body: textBody || '' }
    } else if (messageContent.imageMessage) {
      metaMessage.type = 'image'
      const base64 = msgData.base64 || messageContent.imageMessage?.base64
      const url = base64
        ? `data:${messageContent.imageMessage.mimetype};base64,${base64}`
        : messageContent.imageMessage.url
      metaMessage.image = {
        id: url,
        mime_type: messageContent.imageMessage.mimetype,
        caption: messageContent.imageMessage.caption,
      }
    } else if (messageContent.videoMessage) {
      metaMessage.type = 'video'
      const base64 = msgData.base64
      const url = base64
        ? `data:${messageContent.videoMessage.mimetype};base64,${base64}`
        : messageContent.videoMessage.url
      metaMessage.video = {
        id: url,
        mime_type: messageContent.videoMessage.mimetype,
        caption: messageContent.videoMessage.caption,
      }
    } else if (messageContent.audioMessage) {
      metaMessage.type = 'audio'
      const base64 = msgData.base64
      const url = base64
        ? `data:${messageContent.audioMessage.mimetype};base64,${base64}`
        : messageContent.audioMessage.url
      metaMessage.audio = {
        id: url,
        mime_type: messageContent.audioMessage.mimetype,
      }
    } else if (messageContent.documentMessage) {
      metaMessage.type = 'document'
      const base64 = msgData.base64
      const url = base64
        ? `data:${messageContent.documentMessage.mimetype};base64,${base64}`
        : messageContent.documentMessage.url
      metaMessage.document = {
        id: url,
        mime_type: messageContent.documentMessage.mimetype,
        filename: messageContent.documentMessage.fileName,
        caption: messageContent.documentMessage.caption,
      }
    } else {
      // Fallback
      metaMessage.type = 'text'
      metaMessage.text = { body: textBody || '[Mensagem não suportada]' }
    }

    const contact = { profile: { name: pushName }, wa_id: phone }

    console.log('[evo-webhook] → Calling processMessage for inbound message:', JSON.stringify({
      id: metaMessage.id,
      from: metaMessage.from,
      type: metaMessage.type,
      textBody: metaMessage.text?.body?.substring(0, 100),
      accountId: config.account_id,
      userId: config.user_id,
    }))

    // Use dummy access token since Evolution doesn't need it
    await processMessage(
      metaMessage,
      contact,
      config.account_id,
      config.user_id,
      'evolution-dummy-token',
      'evolution',
    )
    console.log('[evo-webhook] ✓ processMessage completed successfully')
  }
  // 2. Handle status updates
  else {
    console.log('[evo-webhook] → Status update branch (no message content detected)')
    console.log('[evo-webhook] Status payload:', JSON.stringify({
      event,
      bodyKeys: Object.keys(body),
      dataKeys: rawData ? Object.keys(rawData) : null,
    }))
    const updates = Array.isArray(rawData) ? rawData : [rawData]
    for (const update of updates) {
      const msgId =
        update?.key?.id ||
        update?.id ||
        update?.messageId ||
        update?.keyId

      const rawStatus =
        update?.update?.status ??
        update?.status ??
        update?.statusNumber ??
        update?.statusText

      console.log('[evo-webhook] Status update item:', JSON.stringify({
        msgId: msgId || null,
        rawStatus: rawStatus ?? null,
        updateKeys: update ? Object.keys(update) : null,
      }))

      if (!msgId || rawStatus === undefined || rawStatus === null) continue

      let metaStatus: string | null = null
      const statusStr = String(rawStatus).toUpperCase()

      if (
        rawStatus === 3 ||
        statusStr === 'DELIVERY_ACK' ||
        statusStr === 'DELIVERED' ||
        statusStr === 'RECEIPT'
      ) {
        metaStatus = 'delivered'
      } else if (
        rawStatus === 4 ||
        rawStatus === 5 ||
        statusStr === 'READ' ||
        statusStr === 'PLAYED' ||
        statusStr === 'READ_BY_ME'
      ) {
        metaStatus = 'read'
      } else if (
        rawStatus === 2 ||
        statusStr === 'SERVER_ACK' ||
        statusStr === 'SENT'
      ) {
        metaStatus = 'sent'
      } else if (statusStr === 'ERROR' || statusStr === 'FAILED') {
        metaStatus = 'failed'
      }

      if (metaStatus) {
        await handleStatusUpdate({
          id: msgId,
          status: metaStatus,
          timestamp: String(Math.floor(Date.now() / 1000)),
          recipient_id:
            update?.key?.remoteJid?.split('@')[0] ||
            update?.remoteJid?.split('@')[0] ||
            ''
        })
      }
    }
  }
}

async function processOutboundEvolutionMessage(msgData: any, config: any) {
  const remoteJid = msgData?.key?.remoteJid || msgData?.remoteJid || msgData?.key?.participant
  if (!remoteJid || remoteJid.includes('@g.us')) return // Ignore groups for now

  const msgId = msgData?.key?.id || msgData?.id
  if (!msgId) return

  // 1) Deduplicate: check if this message is already in DB (e.g. sent via WACRM web interface)
  const { data: existingMsg } = await supabaseAdmin()
    .from('messages')
    .select('id')
    .eq('message_id', msgId)
    .maybeSingle()

  if (existingMsg) {
    // Already recorded — sent from WACRM directly
    return
  }

  const rawPhone = remoteJid.split('@')[0].split(':')[0]
  const phone = normalizePhone(rawPhone) || rawPhone
  const pushName = msgData?.pushName || msgData?.verifiedBizName || phone
  const messageContent = msgData?.message || msgData?.messageContent || msgData
  if (!messageContent) return

  // Extract content & type
  let contentType = 'text'
  let contentText: string | null = null
  let mediaUrl: string | null = null

  const textBody =
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.text ||
    msgData.body ||
    msgData.text

  if (textBody || messageContent.conversation || messageContent.extendedTextMessage) {
    contentType = 'text'
    contentText = textBody || null
  } else if (messageContent.imageMessage) {
    contentType = 'image'
    const base64 = msgData.base64 || messageContent.imageMessage?.base64
    mediaUrl = base64 ? `data:${messageContent.imageMessage.mimetype};base64,${base64}` : messageContent.imageMessage.url
    contentText = messageContent.imageMessage.caption || null
  } else if (messageContent.videoMessage) {
    contentType = 'video'
    const base64 = msgData.base64
    mediaUrl = base64 ? `data:${messageContent.videoMessage.mimetype};base64,${base64}` : messageContent.videoMessage.url
    contentText = messageContent.videoMessage.caption || null
  } else if (messageContent.audioMessage) {
    contentType = 'audio'
    const base64 = msgData.base64
    mediaUrl = base64 ? `data:${messageContent.audioMessage.mimetype};base64,${base64}` : messageContent.audioMessage.url
  } else if (messageContent.documentMessage) {
    contentType = 'document'
    const base64 = msgData.base64
    mediaUrl = base64 ? `data:${messageContent.documentMessage.mimetype};base64,${base64}` : messageContent.documentMessage.url
    contentText = messageContent.documentMessage.caption || messageContent.documentMessage.fileName || null
  } else {
    contentType = 'text'
    contentText = textBody || '[Mensagem enviada do celular]'
  }

  // 2) Find or create contact
  let contactId: string | undefined
  const existingContact = await findExistingContact(supabaseAdmin(), config.account_id, phone)

  if (existingContact) {
    contactId = existingContact.id
    if (pushName && pushName !== phone && pushName !== existingContact.name) {
      await supabaseAdmin()
        .from('contacts')
        .update({ name: pushName, updated_at: new Date().toISOString() })
        .eq('id', existingContact.id)
    }
  } else {
    const { data: newContact, error: createContactErr } = await supabaseAdmin()
      .from('contacts')
      .insert({
        account_id: config.account_id,
        user_id: config.user_id,
        phone,
        name: pushName || phone,
      })
      .select('id')
      .single()

    if (!createContactErr && newContact) {
      contactId = newContact.id
    } else if (createContactErr) {
      console.error('Error creating contact in outbound evolution message:', createContactErr)
    }
  }

  if (!contactId) return

  // 3) Find or create conversation
  let conversationId: string | undefined
  const { data: existingConv } = await supabaseAdmin()
    .from('conversations')
    .select('id')
    .eq('account_id', config.account_id)
    .eq('contact_id', contactId)
    .maybeSingle()

  if (existingConv) {
    conversationId = existingConv.id
  } else {
    const { data: newConv, error: createConvErr } = await supabaseAdmin()
      .from('conversations')
      .insert({
        account_id: config.account_id,
        user_id: config.user_id,
        contact_id: contactId,
        status: 'open',
        unread_count: 0,
      })
      .select('id')
      .single()

    if (!createConvErr && newConv) {
      conversationId = newConv.id
    } else if (createConvErr) {
      console.error('Error creating conversation in outbound evolution message:', createConvErr)
    }
  }

  if (!conversationId) return

  const rawTs = Number(msgData?.messageTimestamp)
  const timestampMs =
    !isNaN(rawTs) && rawTs > 0
      ? rawTs < 100000000000
        ? rawTs * 1000
        : rawTs
      : Date.now()
  const timestampIso = new Date(timestampMs).toISOString()

  // 4) Insert message with sender_type = 'agent'
  const { error: msgErr } = await supabaseAdmin()
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      content_type: contentType,
      content_text: contentText,
      media_url: mediaUrl,
      message_id: msgId,
      status: 'sent',
      created_at: timestampIso,
    })

  if (msgErr) {
    console.error('Error inserting mobile-sent outbound message:', msgErr)
    return
  }

  // 5) Update conversation last_message_text & last_message_at
  const previewText = contentText || `[${contentType}]`
  await supabaseAdmin()
    .from('conversations')
    .update({
      last_message_text: previewText,
      last_message_at: timestampIso,
      updated_at: timestampIso,
    })
    .eq('id', conversationId)
}
