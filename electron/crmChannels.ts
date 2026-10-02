/** IPC channels for the island's CRM tab. */
export const CRM = {
  OVERVIEW: 'crm:overview', // invoke -> CrmOverview
  CHANGED: 'crm:changed', // main -> renderer: something changed (CrmChanges when the agent changed it)
  CONTACTS: 'crm:contacts', // invoke(query, status?) -> ContactSummary[]
  CONTACT: 'crm:contact', // invoke(id) -> ContactPage
  SAVE_CONTACT: 'crm:save-contact', // invoke(id | null, ContactInput) -> Contact
  LOG: 'crm:log', // invoke({ contactId?, dealId?, kind, text }) -> Activity
  TASKS: 'crm:tasks', // invoke(filter) -> TaskSummary[]
  SAVE_TASK: 'crm:save-task', // invoke(id | null, { title?, due?, done?, contactId?, dealId? }) -> Task
  DEALS: 'crm:deals', // invoke() -> DealSummary[]
  DEAL: 'crm:deal', // invoke(id) -> CrmDealPage
  SAVE_DEAL: 'crm:save-deal', // invoke(id | null, DealInput) -> Deal
  DELETE: 'crm:delete', // invoke(what, id) -> batch id (to undo)
  UNDO: 'crm:undo', // invoke(batch?) -> { undone, kept }
  IMPORT: 'crm:import', // invoke: choose a file -> { added, updated, skipped, batch }
  EXPORT: 'crm:export', // invoke(what) -> DocEntry (saved in Documents)
  SET_CURRENCY: 'crm:set-currency', // invoke(code)
} as const
