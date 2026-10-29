/**
 * Requirement approval workflow: stage labels and pure helpers shared by the
 * client portal and the CRM. The database function requirement_transition()
 * is the source of truth for which moves are allowed; the helpers here only
 * decide what to show.
 */

export type WorkflowStage =
  | 'submitted'
  | 'changes_requested'
  | 'admin_rejected'
  | 'admin_approved'
  | 'client_confirmed'
  | 'selection_submitted'
  | 'selection_changes_requested'
  | 'selection_approved'
  | 'quotation_drafted'
  | 'quotation_sent'
  | 'quotation_accepted'
  | 'quotation_rejected'

type StageInfo = { label: string; clientLabel: string; tone: 'gray' | 'amber' | 'blue' | 'green' | 'red'; clientHint: string }

export const STAGES: Record<WorkflowStage, StageInfo> = {
  submitted: { label: 'Awaiting review', clientLabel: 'Submitted for review', tone: 'amber', clientHint: 'Our team is reviewing your requirement.' },
  changes_requested: { label: 'Changes requested', clientLabel: 'Changes requested', tone: 'amber', clientHint: 'Please update your requirement and resubmit it.' },
  admin_rejected: { label: 'Rejected', clientLabel: 'Not accepted', tone: 'red', clientHint: 'This requirement was not accepted.' },
  admin_approved: { label: 'Approved – awaiting client', clientLabel: 'Approved – please confirm', tone: 'blue', clientHint: 'Review the approved requirement and confirm it to start choosing products.' },
  client_confirmed: { label: 'Client confirmed', clientLabel: 'Confirmed – choose products', tone: 'blue', clientHint: 'Choose products and quantities within your approved budget.' },
  selection_submitted: { label: 'Selection to review', clientLabel: 'Selection under review', tone: 'amber', clientHint: 'Our team is reviewing your product selection.' },
  selection_changes_requested: { label: 'Selection changes requested', clientLabel: 'Selection changes requested', tone: 'amber', clientHint: 'Please adjust your product selection and submit it again.' },
  selection_approved: { label: 'Selection approved', clientLabel: 'Selection approved', tone: 'green', clientHint: 'We are preparing your quotation.' },
  quotation_drafted: { label: 'Quotation drafted', clientLabel: 'Preparing quotation', tone: 'green', clientHint: 'We are preparing your quotation.' },
  quotation_sent: { label: 'Quotation sent', clientLabel: 'Quotation ready', tone: 'blue', clientHint: 'Your quotation is ready to review.' },
  quotation_accepted: { label: 'Quotation accepted', clientLabel: 'Quotation accepted', tone: 'green', clientHint: 'Thank you. We will move ahead with your order.' },
  quotation_rejected: { label: 'Quotation declined', clientLabel: 'Quotation declined', tone: 'red', clientHint: 'You declined the quotation. Your account manager will be in touch.' },
}

export const STAGE_KEYS = Object.keys(STAGES) as WorkflowStage[]

export function isWorkflowStage(value: unknown): value is WorkflowStage {
  return typeof value === 'string' && value in STAGES
}

export const TONE_CLASSES: Record<StageInfo['tone'], string> = {
  gray: 'bg-gray-100 text-gray-700',
  amber: 'bg-amber-50 text-amber-800',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-700',
}

/** Client may edit the product selection only after confirming the requirement. */
export function clientCanSelectProducts(stage: string | null | undefined) {
  return stage === 'client_confirmed' || stage === 'selection_changes_requested'
}

export function clientCanConfirm(stage: string | null | undefined) {
  return stage === 'admin_approved'
}

export function clientCanResubmit(stage: string | null | undefined) {
  return stage === 'changes_requested'
}

export function staffCanDecideRequirement(stage: string | null | undefined) {
  return stage === 'submitted'
}

export function staffCanDecideSelection(stage: string | null | undefined) {
  return stage === 'selection_submitted'
}

export function staffCanCreateQuotation(stage: string | null | undefined) {
  return stage === 'selection_approved' || stage === 'quotation_rejected'
}

// ---------------------------------------------------------------------------
// Budget. requirements.budget is per unit, requirements.quantity is the total
// quantity, so the approved total budget is budget × quantity.
// ---------------------------------------------------------------------------

export type BudgetStatus = 'none' | 'within' | 'near' | 'over'

export const NEAR_BUDGET_RATIO = 0.9

export function totalBudget(perUnit: number | null | undefined, quantity: number | null | undefined): number | null {
  const unit = Number(perUnit)
  const qty = Number(quantity)
  if (!Number.isFinite(unit) || unit <= 0 || !Number.isFinite(qty) || qty < 1) return null
  return Math.round(unit * qty * 100) / 100
}

export function budgetStatus(selectionTotal: number, budgetTotal: number | null): BudgetStatus {
  if (budgetTotal === null || budgetTotal <= 0) return 'none'
  if (selectionTotal > budgetTotal) return 'over'
  if (selectionTotal >= budgetTotal * NEAR_BUDGET_RATIO) return 'near'
  return 'within'
}

export type SelectionLine = { quantity: number; unitPrice: number | null }

export function selectionTotals(lines: SelectionLine[]) {
  let paise = 0
  let units = 0
  let unpriced = 0
  for (const line of lines) {
    const qty = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0
    units += qty
    if (line.unitPrice === null || !Number.isFinite(line.unitPrice)) {
      if (qty > 0) unpriced += 1
      continue
    }
    paise += Math.round(line.unitPrice * 100) * qty
  }
  return { total: paise / 100, units, unpriced }
}

// ---------------------------------------------------------------------------
// Origin and "who acts next". One canonical requirement record serves both the
// client-created flow (client submits -> staff review) and the staff-created
// flow (staff share with the company -> client responds); these helpers only
// change how the same stage is described, never what the database allows.
// ---------------------------------------------------------------------------

export type RequirementOrigin = 'client' | 'staff'

/** The stages in which the next move belongs to the client; every other open stage waits for staff. */
const WAITING_ON_CLIENT: ReadonlySet<string> = new Set([
  'changes_requested',
  'admin_approved',
  'client_confirmed',
  'selection_changes_requested',
  'quotation_sent',
])
const WAITING_ON_STAFF: ReadonlySet<string> = new Set([
  'submitted',
  'selection_submitted',
  'selection_approved',
  'quotation_drafted',
  'quotation_rejected',
])

export type WaitingOn = 'client' | 'staff' | null

/** Who has to act next. Null for finished requirements and for staff-created ones outside the approval flow. */
export function waitingOn(stage: string | null | undefined): WaitingOn {
  if (!stage) return null
  if (WAITING_ON_CLIENT.has(stage)) return 'client'
  if (WAITING_ON_STAFF.has(stage)) return 'staff'
  return null
}

/** Stages where the client is asked to respond (shown under "Awaiting your response" in the portal). */
export function clientActionNeeded(stage: string | null | undefined) {
  return waitingOn(stage) === 'client'
}

/** Staff-side label. A staff-created requirement shared with the client reads differently from a client submission. */
export function staffStageLabel(stage: WorkflowStage, origin: RequirementOrigin): string {
  if (origin === 'staff') {
    if (stage === 'admin_approved') return 'Sent to client – awaiting response'
    if (stage === 'submitted') return 'Client asked for changes – awaiting review'
  }
  return STAGES[stage].label
}

/** Client-side label and hint, aware of who started the requirement. */
export function clientStageText(stage: WorkflowStage, origin: RequirementOrigin): { label: string; hint: string } {
  if (origin === 'staff') {
    if (stage === 'admin_approved') {
      return {
        label: 'From your account manager – please respond',
        hint: 'Your account manager prepared this requirement for you. Review it, then confirm it to start choosing products, or request changes.',
      }
    }
    if (stage === 'submitted') {
      return { label: 'Changes requested – with our team', hint: 'You asked for changes. Our team will update the requirement and share it with you again.' }
    }
  }
  return { label: STAGES[stage].clientLabel, hint: STAGES[stage].clientHint }
}

/** Origin from the first history row (from_stage null): who created the requirement. */
export function originFromCreationEvent(actorKind: string | null | undefined): RequirementOrigin {
  return actorKind === 'staff' ? 'staff' : 'client'
}

/** Staff may share a requirement with the company's client users once, from outside the approval flow. */
export function staffCanShareWithClient(stage: string | null | undefined, status: string | null | undefined) {
  return !stage && status !== 'closed' && status !== 'won' && status !== 'lost'
}
