import { supabaseAdmin } from './admin-client'

export const AI_TOOLS_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'update_deal_stage',
      description: "Move the customer's most recent open deal to a different stage in the funnel. Use this when the customer expresses intent to buy, has paid, or otherwise advances in the sales process.",
      parameters: {
        type: 'object',
        properties: {
          pipeline_name: {
            type: 'string',
            description: 'The exact name of the funnel/pipeline.'
          },
          stage_name: {
            type: 'string',
            description: 'The exact name of the stage to move the deal to (e.g. "Venda Fechada").'
          }
        },
        required: ['pipeline_name', 'stage_name']
      }
    }
  }
]

export async function executeAiTool(
  accountId: string,
  contactId: string,
  toolName: string,
  args: any
): Promise<string> {
  const db = supabaseAdmin()

  if (toolName === 'update_deal_stage') {
    const { pipeline_name, stage_name } = args
    if (!pipeline_name || !stage_name) return 'Error: pipeline_name and stage_name are required.'

    // 1. Resolve pipeline ID by name
    const { data: pipelines } = await db
      .from('deal_pipelines')
      .select('id')
      .eq('account_id', accountId)
      .ilike('name', pipeline_name)
      .limit(1)
    
    if (!pipelines || pipelines.length === 0) {
      return `Error: Could not find pipeline matching "${pipeline_name}".`
    }
    const pipelineId = pipelines[0].id

    // 2. Resolve stage ID by name within that pipeline
    const { data: stages } = await db
      .from('deal_pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .ilike('name', stage_name)
      .limit(1)

    if (!stages || stages.length === 0) {
      return `Error: Could not find stage matching "${stage_name}" in pipeline "${pipeline_name}".`
    }
    const stageId = stages[0].id

    // 3. Find the most recent open deal for this contact in this pipeline
    const { data: deals } = await db
      .from('deals')
      .select('id')
      .eq('contact_id', contactId)
      .eq('pipeline_id', pipelineId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!deals || deals.length === 0) {
      return `Warning: The customer does not have any open deal in pipeline "${pipeline_name}" to update.`
    }

    // 4. Update the deal
    const { error } = await db
      .from('deals')
      .update({ stage_id: stageId, updated_at: new Date().toISOString() })
      .eq('id', deals[0].id)
    
    if (error) {
      console.error('Failed to update deal stage via AI tool:', error)
      return `Error: Failed to update deal stage in database.`
    }

    return `Success! The customer's deal was successfully moved to stage "${stage_name}".`
  }

  return `Error: Unknown tool "${toolName}".`
}
