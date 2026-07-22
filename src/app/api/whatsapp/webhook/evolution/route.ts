import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processMessage, handleStatusUpdate } from '../route' // Reuse core logic

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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Evolution sends instance name. We use this to find the config.
  const instanceName = body.instance

  if (!instanceName) {
    return NextResponse.json({ status: 'ignored', reason: 'No instance name' }, { status: 200 })
  }

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
  const { data: configRows, error: configError } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('evolution_instance_id', instanceName)

  if (configError || !configRows || configRows.length === 0) {
    console.error('Evolution Webhook: No config found for instance:', instanceName)
    return
  }
  
  if (configRows.length > 1) {
    console.error('Evolution Webhook: Multiple configs found for instance:', instanceName)
    return
  }

  const config = configRows[0]
  const event = body.event

  // 1. Handle incoming messages
  if (event === 'messages.upsert') {
    const msgData = body.data?.message || body.data
    // Only process inbound messages
    if (msgData?.key?.fromMe === true) return

    const remoteJid = msgData?.key?.remoteJid
    if (!remoteJid || remoteJid.includes('@g.us')) return // Ignore groups for now

    const phone = remoteJid.split('@')[0]
    const pushName = msgData?.pushName || phone
    const msgId = msgData?.key?.id
    const messageContent = msgData?.message

    if (!messageContent) return

    // Transform Evolution payload into Meta-like format
    const metaMessage: any = {
      id: msgId,
      from: phone,
      timestamp: String(msgData.messageTimestamp || Math.floor(Date.now() / 1000)),
      type: 'text', // default
    }

    if (messageContent.conversation || messageContent.extendedTextMessage) {
      metaMessage.type = 'text'
      metaMessage.text = { body: messageContent.conversation || messageContent.extendedTextMessage?.text }
    } else if (messageContent.imageMessage) {
      metaMessage.type = 'image'
      const base64 = msgData.base64 || messageContent.imageMessage?.base64 // Evolution sometimes sends base64 alongside
      const url = base64 ? `data:${messageContent.imageMessage.mimetype};base64,${base64}` : messageContent.imageMessage.url
      metaMessage.image = { id: url, mime_type: messageContent.imageMessage.mimetype, caption: messageContent.imageMessage.caption }
    } else if (messageContent.videoMessage) {
      metaMessage.type = 'video'
      const base64 = msgData.base64
      const url = base64 ? `data:${messageContent.videoMessage.mimetype};base64,${base64}` : messageContent.videoMessage.url
      metaMessage.video = { id: url, mime_type: messageContent.videoMessage.mimetype, caption: messageContent.videoMessage.caption }
    } else if (messageContent.audioMessage) {
      metaMessage.type = 'audio'
      const base64 = msgData.base64
      const url = base64 ? `data:${messageContent.audioMessage.mimetype};base64,${base64}` : messageContent.audioMessage.url
      metaMessage.audio = { id: url, mime_type: messageContent.audioMessage.mimetype }
    } else if (messageContent.documentMessage) {
      metaMessage.type = 'document'
      const base64 = msgData.base64
      const url = base64 ? `data:${messageContent.documentMessage.mimetype};base64,${base64}` : messageContent.documentMessage.url
      metaMessage.document = { id: url, mime_type: messageContent.documentMessage.mimetype, filename: messageContent.documentMessage.fileName, caption: messageContent.documentMessage.caption }
    } else {
      // Fallback
      metaMessage.type = 'text'
      metaMessage.text = { body: '[Mensagem não suportada]' }
    }

    const contact = { profile: { name: pushName }, wa_id: phone }

    // Use dummy access token since Evolution doesn't need it
    await processMessage(
      metaMessage,
      contact,
      config.account_id,
      config.user_id,
      'evolution-dummy-token',
      'evolution'
    )
  } 
  // 2. Handle status updates
  else if (event === 'messages.update') {
    const updates = body.data || []
    for (const update of updates) {
      const msgId = update?.key?.id
      const statusNum = update?.update?.status

      if (!msgId || !statusNum) continue

      let metaStatus = 'sent'
      if (statusNum === 3) metaStatus = 'delivered'
      else if (statusNum === 4) metaStatus = 'read'
      
      // We only care about delivered and read for now
      if (metaStatus === 'delivered' || metaStatus === 'read') {
        await handleStatusUpdate({
          id: msgId,
          status: metaStatus,
          timestamp: String(Math.floor(Date.now() / 1000)),
          recipient_id: update?.key?.remoteJid?.split('@')[0] || ''
        })
      }
    }
  }
}
