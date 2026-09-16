/**
 * Every user-facing message the API can return, in each supported language.
 *
 * Services throw the *key* (e.g. `throw new NotFoundException(MSG.invoice_not_found)`)
 * and `HttpExceptionFilter` swaps it for the caller's language, chosen from
 * the request's `Accept-Language` header. A key that isn't in this catalog is
 * passed through untouched, so a message written inline still works — it just
 * won't be translated.
 *
 * Messages with a runtime value use `{placeholder}` and are built with
 * `formatMessage(key, { placeholder: value })` at the throw site.
 */

export type Language = 'ar' | 'en';

export const SUPPORTED_LANGUAGES: readonly Language[] = ['ar', 'en'] as const;

/** Arabic is the product's primary language: it's the fallback whenever the
 * request doesn't ask for something we support. */
export const DEFAULT_LANGUAGE: Language = 'ar';

/** Keys are namespaced by domain so the catalog stays navigable as it grows.
 * The value is the key itself — this indirection is what lets a service refer
 * to `MSG.invoice_not_found` and get compile-time safety against typos. */
export const MSG = {
  // generic
  internal_error: 'common.internal_error',

  // auth / session
  invalid_credentials: 'auth.invalid_credentials',
  session_expired: 'auth.session_expired',
  session_invalid: 'auth.session_invalid',
  session_missing: 'auth.session_missing',
  company_login_required: 'auth.company_login_required',
  platform_admin_only: 'auth.platform_admin_only',
  reset_token_invalid: 'auth.reset_token_invalid',
  register_disabled: 'auth.register_disabled',
  register_unavailable: 'auth.register_unavailable',
  register_username_unavailable: 'auth.register_username_unavailable',

  // accounts / journal
  account_not_found: 'accounts.not_found',
  account_code_taken: 'accounts.code_taken',
  account_type_locked: 'accounts.type_locked',
  account_has_journal_lines: 'accounts.has_journal_lines',
  account_opening_equity_protected: 'accounts.opening_equity_protected',
  account_opening_equity_type_conflict: 'accounts.opening_equity_type_conflict',
  account_reserved_type_conflict: 'accounts.reserved_type_conflict',
  purchase_lines_total_mismatch: 'purchases.lines_total_mismatch',
  purchase_stocked_needs_warehouse: 'purchases.stocked_needs_warehouse',
  journal_entry_not_found: 'journal.entry_not_found',
  journal_entry_unbalanced: 'journal.entry_unbalanced',
  journal_line_account_not_found: 'journal.line_account_not_found',
  journal_auto_entry_undeletable: 'journal.auto_entry_undeletable',
  account_opening_after_movement: 'accounts.opening_after_movement',
  account_opening_date_locked: 'accounts.opening_date_locked',
  writeoff_deemed_supply_not_built: 'journal.writeoff_deemed_supply_not_built',
  writeoff_reason_unknown: 'inventory.writeoff_reason_unknown',
  writeoff_not_found: 'inventory.writeoff_not_found',
  writeoff_already_decided: 'inventory.writeoff_already_decided',
  writeoff_status_unknown: 'inventory.writeoff_status_unknown',
  writeoff_two_persons_required: 'inventory.writeoff_two_persons_required',

  // customers / invoices
  credit_limit_exceeded: 'customers.credit_limit_exceeded',
  credit_limit_hard_block: 'customers.credit_limit_hard_block',
  credit_limit_override_forbidden: 'customers.credit_limit_override_forbidden',
  customer_not_found: 'customers.not_found',
  customer_has_invoices: 'customers.has_invoices',
  invoice_not_found: 'invoices.not_found',
  payment_not_found: 'payments.not_found',
  payment_posted_immutable: 'payments.posted_immutable',
  payment_reversal_immutable: 'payments.reversal_immutable',
  payment_already_reversed: 'payments.already_reversed',
  allocations_exceed_payment: 'payments.allocations_exceed_payment',
  allocation_exceeds_remaining: 'payments.allocation_exceeds_remaining',
  allocation_wrong_customer: 'payments.allocation_wrong_customer',
  allocation_currency_mismatch: 'payments.allocation_currency_mismatch',
  quote_not_found: 'quotes.not_found',
  quote_expired: 'quotes.expired',
  quote_already_converted: 'quotes.already_converted',
  quote_converted_immutable: 'quotes.converted_immutable',
  quote_converted_undeletable: 'quotes.converted_undeletable',

  // suppliers / purchases
  supplier_not_found: 'suppliers.not_found',
  supplier_has_purchases: 'suppliers.has_purchases',
  purchase_not_found: 'purchases.not_found',
  purchase_amortize_requires_incorporation: 'purchases.amortize_requires_incorporation',
  purchase_has_payments: 'purchases.has_payments',
  purchase_total_below_allocated: 'purchases.total_below_allocated',
  supplier_payment_not_found: 'supplier_payments.not_found',
  allocation_wrong_supplier: 'supplier_payments.allocation_wrong_supplier',

  // products / inventory
  product_not_found: 'products.not_found',
  warehouse_not_found: 'warehouses.not_found',
  warehouse_has_movements: 'warehouses.has_movements',
  destination_warehouse_required: 'inventory.destination_required',
  destination_warehouse_not_found: 'inventory.destination_not_found',
  destination_same_as_source: 'inventory.destination_same_as_source',
  movement_not_found: 'inventory.movement_not_found',
  quantity_must_be_positive: 'inventory.quantity_must_be_positive',
  adjustment_cannot_be_zero: 'inventory.adjustment_cannot_be_zero',

  // employees / banks
  employee_not_found: 'employees.not_found',
  leave_type_not_found: 'leaves.type_not_found',
  leave_type_duplicate_name: 'leaves.type_duplicate_name',
  leave_type_in_use: 'leaves.type_in_use',
  leave_request_not_found: 'leaves.request_not_found',
  leave_request_not_pending: 'leaves.request_not_pending',
  leave_dates_invalid: 'leaves.dates_invalid',
  leave_overlap: 'leaves.overlap',
  leave_two_persons_required: 'leaves.two_persons_required',
  attendance_not_found: 'attendance.not_found',
  attendance_already_recorded: 'attendance.already_recorded',
  sub_start_no_backdate: 'subscription.start_no_backdate',
  sub_owner_only: 'subscription.owner_only',
  sub_renew_months_invalid: 'subscription.renew_months_invalid',
  bank_not_found: 'banks.not_found',
  bank_code_range_full: 'banks.code_range_full',
  bank_required: 'banks.required',
  bank_transaction_not_found: 'transactions.not_found',

  // properties / units / contracts
  property_not_found: 'properties.not_found',
  property_has_units: 'properties.has_units',
  unit_not_found: 'units.not_found',
  unit_number_taken: 'units.number_taken',
  unit_has_contracts: 'units.has_contracts',
  unit_subtype_mismatch: 'units.subtype_mismatch',
  contract_not_found: 'contracts.not_found',
  contract_classification_required: 'contracts.classification_required',
  contract_vat_inclusion_required: 'contracts.vat_inclusion_required',
  contract_already_cancelled: 'contracts.already_cancelled',
  contract_start_after_end: 'contracts.start_after_end',
  contract_outside_head_lease: 'contracts.outside_head_lease',
  contract_dates_overlap: 'contracts.dates_overlap',
  installment_not_found: 'contracts.installment_not_found',
  contract_cancelled_cannot_renew: 'contracts.cancelled_cannot_renew',
  contract_already_renewed: 'contracts.already_renewed',
  contract_no_taken: 'contracts.no_taken',
  renewal_must_start_after_source: 'contracts.renewal_start_before_source',
  warranty_not_found: 'warranties.not_found',
  warranty_end_before_start: 'warranties.end_before_start',
  warranty_has_claims: 'warranties.has_claims',
  warranty_not_covering: 'warranties.not_covering',
  notification_not_found: 'notifications.not_found',
  escalation_recipient_not_found: 'notifications.escalation_recipient_not_found',
  maintenance_not_found: 'maintenance.not_found',
  maintenance_invalid_transition: 'maintenance.invalid_transition',
  maintenance_status_final: 'maintenance.status_final',
  unit_not_in_property: 'units.not_in_property',
  handover_not_found: 'handovers.not_found',
  handover_signed_immutable: 'handovers.signed_immutable',
  handover_item_not_found: 'contracts.handover_item_not_found',
  settlement_lines_mismatch: 'contracts.settlement_lines_mismatch',
  unearned_disposition_required: 'contracts.unearned_disposition_required',
  bulk_units_collision: 'units.bulk_collision',
  claim_not_found: 'claims.not_found',
  claim_already_settled: 'claims.already_settled',
  deposit_not_found: 'deposits.not_found',
  deposit_already_settled: 'deposits.already_settled',
  deductions_exceed_deposit: 'deposits.deductions_exceed',
  payment_net_must_be_positive: 'contracts.payment_net_must_be_positive',

  // reservations
  reservation_not_found: 'reservations.not_found',
  reservation_unit_rented: 'reservations.unit_rented',
  reservation_already_active: 'reservations.already_active',
  reservation_name_mismatch: 'reservations.name_mismatch',

  // obligations
  obligation_not_found: 'obligations.not_found',

  // platform admin / templates / company users
  company_not_found: 'companies.not_found',
  company_delete_blocked: 'companies.delete_blocked',
  username_taken: 'companies.username_taken',
  template_not_found: 'templates.not_found',
  template_name_required: 'templates.name_required',
  template_name_taken: 'templates.name_taken',
  template_in_use: 'templates.in_use',
  template_system_immutable: 'templates.system_immutable',
  template_system_undeletable: 'templates.system_undeletable',
  template_system_not_assignable: 'templates.system_not_assignable',
  templates_read_forbidden: 'templates.read_forbidden',
  templates_owner_only: 'templates.owner_only',
  pos_shift_already_open: 'pos.shift_already_open',
  pos_no_open_shift: 'pos.no_open_shift',
  pos_shift_not_found: 'pos.shift_not_found',
  pos_shift_closed: 'pos.shift_closed',
  pos_not_your_shift: 'pos.not_your_shift',
  pos_empty_sale: 'pos.empty_sale',
  pos_split_parts_required: 'pos.split_parts_required',
  pos_split_only_for_split: 'pos.split_only_for_split',
  pos_split_mismatch: 'pos.split_mismatch',
  pos_terminal_declined: 'pos.terminal_declined',
  integration_unknown_provider: 'integrations.unknown_provider',
  integration_credentials_required: 'integrations.credentials_required',
  integration_kind_already_active: 'integrations.kind_already_active',
  integration_not_found: 'integrations.not_found',
  integration_owner_only: 'integrations.owner_only',
  integration_mock_forbidden_in_production: 'integrations.mock_forbidden_in_production',

  zatca_test_environment_forbidden_in_production: 'zatca.test_environment_forbidden_in_production',

  // التفويض
  delegation_cycle_rejected: 'delegation.cycle_rejected',
  delegation_exceeds_grantor: 'delegation.exceeds_grantor',
  delegation_grantee_not_found: 'delegation.grantee_not_found',
  delegation_self: 'delegation.self',
  delegation_not_found: 'delegation.not_found',
  delegation_already_revoked: 'delegation.already_revoked',
  delegation_revoke_forbidden: 'delegation.revoke_forbidden',
  delegation_empty_grant: 'delegation.empty_grant',
  delegation_sequence_conflict: 'delegation.sequence_conflict',

  // المهام
  task_assignee_not_found: 'task.assignee_not_found',
  task_target_incomplete: 'task.target_incomplete',
  task_target_not_visible: 'task.target_not_visible',
  task_recurrence_needs_anchor: 'task.recurrence_needs_anchor',
  task_not_found: 'task.not_found',
  task_transition_forbidden: 'task.transition_forbidden',
  task_transition_not_party: 'task.transition_not_party',
  task_comment_forbidden: 'task.comment_forbidden',
  owner_only: 'common.owner_only',
  support_no_active_grant: 'support.no_active_grant',
  support_read_only: 'support.read_only',
  support_request_exists: 'support.request_exists',
  support_grant_not_found: 'support.grant_not_found',
  support_grant_not_pending: 'support.grant_not_pending',
  support_grant_not_active: 'support.grant_not_active',
  support_scope_forbidden: 'support.scope_forbidden',
  support_scope_undeclared: 'support.scope_undeclared',
  support_grant_not_yours: 'support.grant_not_yours',
  company_user_not_found: 'companyUsers.not_found',
  company_users_owner_only: 'companyUsers.owner_only',
  company_profile_owner_only: 'companyProfile.owner_only',

  // zatca
  zatca_profile_incomplete: 'zatca.profile_incomplete',
  zatca_buyer_address_incomplete: 'zatca.buyer_address_incomplete',
  zatca_onboarding_not_started: 'zatca.onboarding_not_started',
  zatca_already_onboarded: 'zatca.already_onboarded',
  zatca_qr_value_too_long: 'zatca.qr_value_too_long',
  zatca_compliance_required: 'zatca.compliance_required',
  zatca_not_onboarded: 'zatca.not_onboarded',
  zatca_already_cleared: 'zatca.already_cleared',
  zatca_stamp_in_progress: 'zatca.stamp_in_progress',
  zatca_not_stamped: 'zatca.not_stamped',
  zatca_invoice_stamped_locked: 'zatca.invoice_stamped_locked',
  // chain integrity. Deletion is refused for any document that took a place
  // in the sequence; editing is refused only once the authority has accepted
  // it (or may be about to) — see InvoicesService.
  zatca_invoice_chain_locked: 'zatca.invoice_chain_locked',
  zatca_invoice_cleared_locked: 'zatca.invoice_cleared_locked',
  zatca_invoice_submitting_locked: 'zatca.invoice_submitting_locked',
  zatca_invoice_successor_locked: 'zatca.invoice_successor_locked',

  // credit/debit notes
  credit_note_target_invalid: 'creditNotes.target_invalid',
  credit_note_exceeds_remaining: 'creditNotes.exceeds_remaining',
  credit_note_immutable: 'creditNotes.immutable',
  invoice_has_credit_notes: 'creditNotes.invoice_has_notes',

  // returns (SPEC §30 — موجة أ)
  return_line_not_original: 'returns.line_not_original',
  return_exceeds_sold: 'returns.exceeds_sold',
  refund_target_invalid: 'returns.refund_target_invalid',
  refund_nothing_refundable: 'returns.refund_nothing_refundable',
  refund_exceeds_refundable: 'returns.refund_exceeds_refundable',

  // أدراج الكاشير (ق-٢١٨ · ق-٢٦٥)
  cash_drawer_not_found: 'cash_drawers.not_found',
  cash_drawer_name_taken: 'cash_drawers.name_taken',
  cash_drawer_forbidden: 'cash_drawers.forbidden',
  cash_drawer_has_balance: 'cash_drawers.has_balance',
  cash_drawer_has_open_shift: 'cash_drawers.has_open_shift',
  cash_drawer_code_range_full: 'cash_drawers.code_range_full',
  cash_drawer_has_movements: 'cash_drawers.has_movements',
  cash_drawer_inactive: 'cash_drawers.inactive',
  cash_drawer_branch_mismatch: 'cash_drawers.branch_mismatch',
  // branches / activities
  branch_not_found: 'branches.not_found',
  branch_name_taken: 'branches.name_taken',
  branch_forbidden: 'branches.forbidden',
  branch_has_data: 'branches.has_data',
  activity_not_found: 'activities.not_found',
  activity_name_taken: 'activities.name_taken',
  activity_in_use: 'activities.in_use',
  activity_last_one: 'activities.last_one',

  // currencies / exchange rates
  currency_not_found: 'currencies.not_found',
  currency_code_taken: 'currencies.code_taken',
  currency_base_immutable: 'currencies.base_immutable',
  currency_base_undeletable: 'currencies.base_undeletable',
  currency_in_use: 'currencies.in_use',
  currency_rate_must_be_positive: 'currencies.rate_must_be_positive',
  exchange_rate_same_currency: 'exchangeRates.same_currency',

  // fiscal year / period close
  fiscal_year_not_found: 'fiscal.year_not_found',
  fiscal_period_not_found: 'fiscal.period_not_found',
  fiscal_year_overlaps: 'fiscal.year_overlaps',
  fiscal_year_start_after_end: 'fiscal.year_start_after_end',
  fiscal_no_period_for_date: 'fiscal.no_period_for_date',
  fiscal_period_closed: 'fiscal.period_closed',

  // tenant status / screen access
  account_frozen: 'tenant.account_frozen',
  account_stopped: 'tenant.account_stopped',
  account_closed: 'tenant.account_closed',
  consent_required: 'tenant.consent_required',
  consent_notice_too_short: 'consent.notice_too_short',
  consent_version_not_found: 'consent.version_not_found',
  consent_not_effective_yet: 'consent.not_effective_yet',
  consent_already_accepted: 'consent.already_accepted',
  consent_owner_only: 'consent.owner_only',
  deletion_company_closed: 'deletion.company_closed',
  reopen_not_closed: 'deletion.reopen_not_closed',
  reopen_window_closed: 'deletion.reopen_window_closed',
  erasure_only_closed: 'deletion.erasure_only_closed',
  erasure_already_done: 'deletion.erasure_already_done',
  screen_forbidden: 'tenant.screen_forbidden',
  screen_not_in_sector: 'tenant.screen_not_in_sector',
  primary_activity_needs_confirmation: 'activity.primary_needs_confirmation',
  primary_activity_disabled: 'activity.primary_disabled',
  action_forbidden: 'tenant.action_forbidden',
  master_data_locked: 'tenant.master_data_locked',
  trash_entity_unknown: 'trash.entity_unknown',
  trash_item_not_found: 'trash.item_not_found',
  deletion_owner_only: 'deletion.owner_only',
  export_owner_only: 'export.owner_only',
  archive_not_ready: 'archive.not_ready',
  archive_expired: 'archive.expired',
  archive_storage_unavailable: 'archive.storage_unavailable',
  deletion_already_pending: 'deletion.already_pending',
  deletion_request_not_found: 'deletion.not_found',
  deletion_not_pending: 'deletion.not_pending',

  // files
  file_missing: 'files.missing',
  file_too_large: 'files.too_large',
  file_type_unsupported: 'files.type_unsupported',
  file_access_denied: 'files.access_denied',
  file_not_found: 'files.not_found',

  // validation (used by class-validator DTOs)
  vat_number_invalid: 'validation.vat_number',
  cr_number_invalid: 'validation.cr_number',
  postal_code_invalid: 'validation.postal_code',
  additional_number_invalid: 'validation.additional_number_invalid',
  email_invalid: 'validation.email',
  legal_name_required: 'validation.legal_name_required',
  legal_name_too_long_for_qr: 'validation.legal_name_too_long_for_qr',
  file_key_required: 'validation.file_key_required',
} as const;

export type MessageKey = (typeof MSG)[keyof typeof MSG];

const CATALOG: Record<string, Record<Language, string>> = {
  [MSG.internal_error]: { ar: 'حدث خطأ غير متوقع في الخادم', en: 'An unexpected server error occurred' },

  [MSG.invalid_credentials]: { ar: 'بيانات الدخول غير صحيحة', en: 'Invalid username or password' },
  [MSG.session_expired]: { ar: 'انتهت صلاحية الجلسة', en: 'Your session has expired' },
  [MSG.session_invalid]: { ar: 'جلسة غير صالحة', en: 'Invalid session' },
  [MSG.session_missing]: { ar: 'لا توجد جلسة', en: 'No active session' },
  [MSG.company_login_required]: { ar: 'مطلوب تسجيل دخول بحساب شركة', en: 'A company account login is required' },
  [MSG.reset_token_invalid]: { ar: 'رابط الاستعادة غير صالح أو منتهي — اطلب رابطاً جديداً', en: 'This reset link is invalid or expired — request a new one' },
  [MSG.register_disabled]: { ar: 'التسجيل الذاتي غير متاح حالياً', en: 'Self-registration is currently disabled' },
  [MSG.register_unavailable]: { ar: 'التسجيل غير متاح مؤقتاً — تواصل مع الدعم', en: 'Registration is temporarily unavailable — contact support' },
  // لا يردّ الاسم ولا يقول «مستخدَم» — `/auth/register` بوّابة عامّة، فردٌّ يؤكّد
  // وجود حساب يجعلها أداة تعداد. و`username_taken` يبقى للوحتَي المدير والتاجر
  // حيث الفاعل موثَّق ويُدير حساباتٍ يملكها.
  [MSG.register_username_unavailable]: { ar: 'تعذّر إنشاء الحساب بهذا الاسم — جرّب اسماً آخر', en: 'Could not create an account with that username — try another' },
  [MSG.platform_admin_only]: { ar: 'هذا الإجراء متاح لحساب المطوّر فقط', en: 'This action is restricted to the platform administrator' },

  [MSG.account_not_found]: { ar: 'الحساب غير موجود', en: 'Account not found' },
  [MSG.account_code_taken]: { ar: 'رمز الحساب "{code}" مستخدَم بالفعل', en: 'Account code "{code}" is already in use' },
  [MSG.account_type_locked]: { ar: 'لا يمكن تغيير نوع حساب مستخدَم بقيود مرحّلة', en: "Cannot change the type of an account that has posted journal entries" },
  [MSG.account_has_journal_lines]: {
    ar: 'لا يمكن حذف حساب مرتبط بقيود يومية — احذف القيود المرتبطة أولاً',
    en: 'Cannot delete an account linked to journal entries — delete those entries first',
  },
  [MSG.account_opening_equity_protected]: {
    ar: 'حساب الأرصدة الافتتاحية ({code}) يُدار آلياً كطرف مقابل للقيود الافتتاحية — لا يُدخل له رصيد افتتاحي',
    en: 'The opening-balances account ({code}) is managed automatically as the counterpart of opening entries — it cannot take an opening balance of its own',
  },
  [MSG.account_opening_equity_type_conflict]: {
    ar: 'الرمز {code} محجوز لحساب الأرصدة الافتتاحية (حقوق ملكية)، وهو موجود لديك بنوع مختلف — عدّل رمز ذلك الحساب أولاً',
    en: 'Code {code} is reserved for the opening-balances equity account, but it already exists with a different type — change that account\'s code first',
  },
  [MSG.account_reserved_type_conflict]: {
    ar: 'الرمز {code} محجوز لحسابٍ من نوع «{type}»، وهو موجود لديك بنوع مختلف — عدّل رمز ذلك الحساب أولاً',
    en: 'Code {code} is reserved for a "{type}" account but already exists with a different type — change that account\'s code first',
  },
  [MSG.purchase_lines_total_mismatch]: {
    ar: 'مجموع بنود الشراء ({lines}) لا يساوي الإجمالي قبل الضريبة ({subtotal}) — والبنود هي ما يُرحَّل، فلا يُقبل اختلافهما',
    en: 'Purchase lines total ({lines}) does not equal the subtotal ({subtotal}) — the lines drive posting, so they cannot disagree',
  },
  [MSG.purchase_stocked_needs_warehouse]: {
    ar: 'بندٌ مخزني بلا مستودع — حدّد مستودعاً للشراء أو اربط مستودعاً بالفرع، فالبضاعة لا تُستلم في لا مكان',
    en: 'A stocked line has no warehouse — set one on the purchase or link one to the branch; goods cannot be received into nowhere',
  },
  [MSG.journal_entry_not_found]: { ar: 'القيد غير موجود', en: 'Journal entry not found' },
  [MSG.journal_entry_unbalanced]: { ar: 'القيد غير متوازن — لا يمكن ترحيله', en: 'Journal entry is unbalanced — it cannot be posted' },
  [MSG.journal_line_account_not_found]: { ar: 'أحد الحسابات المحددة بالقيد غير موجود', en: 'One of the accounts referenced by this entry does not exist' },
  [MSG.journal_auto_entry_undeletable]: {
    ar: 'لا يمكن حذف قيد آلي مباشرة — احذف المستند المصدر (الفاتورة/فاتورة الشراء) بدلاً من ذلك',
    en: 'An automatic entry cannot be deleted directly — delete the source document (invoice/purchase) instead',
  },
  [MSG.account_opening_date_locked]: {
    ar: 'الحساب {code} — {name} عليه حركة بتاريخ {moved} (القيد {entry})، فتاريخ الافتتاح لا يُعدَّل بعدها — تعديله يعيد تأريخ قيدٍ صار له تاريخ. المخرج: أدخل الفرق بقيد بتاريخه',
    en: 'Account {code} — {name} has movement dated {moved} (entry {entry}), so its opening date can no longer be changed — changing it would re-date an entry that already has history. Post the difference as a dated entry instead',
  },
  [MSG.account_opening_after_movement]: {
    ar: 'الحساب {code} — {name} له حركة بتاريخ {moved} (القيد {entry})، وهي تسبق تاريخ الافتتاح {opening} — فالرصيد الافتتاحي سيُحتسب مرتين. المخرج: اجعل الرصيد الافتتاحي صفراً وأدخل الرصيد بقيد يدوي بتاريخه، أو ابدأ سنة مالية تبدأ قبل أقدم حركة',
    en: 'Account {code} — {name} has movement dated {moved} (entry {entry}), before the opening date {opening} — the opening balance would be counted twice. Either leave the opening balance at zero and post the balance as a dated manual entry, or start a fiscal year that begins before the earliest movement',
  },
  [MSG.writeoff_deemed_supply_not_built]: {
    ar: 'سبب الشطب «{reason}» توريدٌ اعتباري يوجب ضريبة مخرجات، ومساره غير مبنيّ بعد — فلا يُرحَّل شطباً بلا ضريبة',
    en: 'Write-off reason "{reason}" is a deemed supply that carries output VAT; that path is not built yet — it will not be posted as a plain write-off',
  },
  [MSG.writeoff_reason_unknown]: {
    ar: 'رمز سبب الشطب «{code}» غير معروف — والسبب حقلٌ إلزامي يُختار من القائمة، ولا يُفترَض',
    en: 'Write-off reason code "{code}" is unknown — the reason is mandatory and must come from the list, never assumed',
  },
  [MSG.writeoff_not_found]: { ar: 'واقعة الشطب غير موجودة', en: 'Write-off not found' },
  [MSG.writeoff_already_decided]: {
    ar: 'واقعة الشطب حُسمت من قبل — لا تُعتمد ولا تُرفض مرتين',
    en: 'This write-off has already been decided — it cannot be approved or rejected twice',
  },
  [MSG.writeoff_status_unknown]: {
    ar: 'حالة غير معروفة «{status}» — المتاح: {allowed}',
    en: 'Unknown status "{status}" — allowed: {allowed}',
  },
  [MSG.writeoff_two_persons_required]: {
    ar: 'المنشأة تشترط شخصين على الشطب — فمن سجّل الواقعة {no} لا يعتمدها. اطلب اعتماد صاحب صلاحية آخر، أو أطفئ الاشتراط من إعدادات المنشأة',
    en: 'This company requires two people for a write-off — whoever recorded {no} cannot approve it. Ask another authorised user to approve, or turn the requirement off in company settings',
  },

  // ⚠️ **الرسالةُ تحمل الأرقام الثلاثة** — الحدَّ والقائمَ والمطلوب: تحذيرٌ
  //    يقول «تجاوزتَ الحدّ» بلا رقمٍ **يُضغَط بلا قراءة**، وهو عينُ «شيءٍ يُرى
  //    ولا يفعل» الذي بُنيت الميزةُ لعلاجه (`ق-٣٣٩`).
  [MSG.credit_limit_exceeded]: {
    ar: 'حدّ ائتمان {customer} {limit} وعليه {exposure}، وهذه الفاتورة {adding} — فيصير {after}. من يملك صلاحية الاعتماد يتجاوز الحدّ، ويُسجَّل تجاوزه على الفاتورة',
    en: "{customer}'s credit limit is {limit} with {exposure} outstanding, and this invoice adds {adding} — reaching {after}. An authorised approver may override, and the override is recorded on the invoice",
  },
  [MSG.credit_limit_hard_block]: {
    ar: 'حدّ ائتمان {customer} {limit} وعليه {exposure}، وهذه الفاتورة {adding} — فيصير {after}. والمنشأة تمنع التجاوز منعاً صلباً: حصِّل من العميل أو ارفع حدّه أو أطفئ المنع الصلب من إعدادات المنشأة',
    en: "{customer}'s credit limit is {limit} with {exposure} outstanding, and this invoice adds {adding} — reaching {after}. This company enforces a hard block: collect from the customer, raise their limit, or turn the hard block off in company settings",
  },
  [MSG.credit_limit_override_forbidden]: {
    ar: 'تجاوز حدّ الائتمان يملكه صاحب صلاحية الاعتماد وحده — اطلب من يملكها',
    en: 'Only a user with approval permission may override a credit limit — ask someone who has it',
  },
  [MSG.customer_not_found]: { ar: 'العميل غير موجود', en: 'Customer not found' },
  [MSG.customer_has_invoices]: {
    ar: 'لا يمكن حذف عميل مرتبط بفواتير — احذف فواتيره أولاً',
    en: 'Cannot delete a customer that has invoices — delete their invoices first',
  },
  [MSG.quote_not_found]: { ar: 'عرض السعر غير موجود', en: 'Quote not found' },
  [MSG.quote_expired]: { ar: 'انتهت صلاحية العرض بتاريخ {date} — أصدر عرضاً محدَّثاً', en: 'The quote expired on {date} — issue an updated one' },
  [MSG.quote_already_converted]: { ar: 'حُوِّل سابقاً إلى الفاتورة {invoiceNo}', en: 'Already converted to invoice {invoiceNo}' },
  [MSG.quote_converted_immutable]: { ar: 'عرضٌ محوَّل لا يُعدَّل — فاتورته {invoiceNo} قائمة', en: 'A converted quote is immutable — its invoice {invoiceNo} stands' },
  [MSG.quote_converted_undeletable]: { ar: 'عرضٌ محوَّل لا يُحذف — فاتورته {invoiceNo} قائمة', en: 'A converted quote cannot be deleted — its invoice {invoiceNo} stands' },
  [MSG.invoice_not_found]: { ar: 'الفاتورة غير موجودة', en: 'Invoice not found' },
  [MSG.payment_not_found]: { ar: 'سند القبض غير موجود', en: 'Payment not found' },
  [MSG.payment_posted_immutable]: { ar: 'السند {no} مرحَّل محاسبياً — لا يُعدَّل ولا يُحذف؛ صحّحه بسند عكسي', en: 'Payment {no} is posted — it cannot be edited or deleted; correct it with a reversal' },
  [MSG.payment_reversal_immutable]: { ar: 'هذا سند عكسي — لا يُعاد عكسه ولا تُعدَّل تخصيصاته', en: 'This is a reversal — it cannot be reversed again or re-allocated' },
  [MSG.payment_already_reversed]: { ar: 'عُكِس سابقاً بالسند {no}', en: 'Already reversed by payment {no}' },
  [MSG.allocations_exceed_payment]: { ar: 'مجموع التخصيصات {sum} يتجاوز مبلغ السند {amount}', en: 'Allocations {sum} exceed the payment amount {amount}' },
  [MSG.allocation_exceeds_remaining]: { ar: 'التخصيص {amount} يتجاوز المتبقي على الفاتورة {no} وهو {remaining}', en: 'Allocating {amount} exceeds the {remaining} remaining on invoice {no}' },
  [MSG.allocation_wrong_customer]: { ar: 'الفاتورة {no} ليست لهذا العميل', en: 'Invoice {no} belongs to another customer' },
  [MSG.allocation_currency_mismatch]: { ar: 'عملة الفاتورة {no} ({invoiceCurrency}) تخالف عملة السند ({paymentCurrency})', en: 'Invoice {no} is in {invoiceCurrency} but the payment is in {paymentCurrency}' },

  [MSG.supplier_not_found]: { ar: 'المورد غير موجود', en: 'Supplier not found' },
  [MSG.supplier_has_purchases]: {
    ar: 'لا يمكن حذف مورد مرتبط بفواتير شراء — احذف فواتيره أولاً',
    en: 'Cannot delete a supplier that has purchase invoices — delete those invoices first',
  },
  [MSG.purchase_not_found]: { ar: 'فاتورة الشراء غير موجودة', en: 'Purchase invoice not found' },
  [MSG.purchase_amortize_requires_incorporation]: {
    ar: 'الاستهلاك على فترة متاح فقط لمصروفات التأسيس، مع عدد أشهر صحيح.',
    en: 'Amortization is only available for establishment expenses, with a valid number of months.',
  },
  [MSG.purchase_has_payments]: {
    ar: 'فاتورة الشراء {no} عليها سندات صرف — اعكس سنداتها أولاً',
    en: 'Purchase invoice {no} has supplier payments allocated — reverse them first',
  },
  [MSG.purchase_total_below_allocated]: {
    ar: 'إجمالي الفاتورة {no} الجديد {total} أقل مما سُدِّد عليها فعلاً {allocated}',
    en: 'The new total {total} of purchase invoice {no} is below what has already been paid on it ({allocated})',
  },
  [MSG.supplier_payment_not_found]: { ar: 'سند الصرف غير موجود', en: 'Supplier payment not found' },
  [MSG.allocation_wrong_supplier]: { ar: 'فاتورة الشراء {no} ليست لهذا المورّد', en: 'Purchase invoice {no} belongs to another supplier' },

  [MSG.product_not_found]: { ar: 'المنتج غير موجود', en: 'Product not found' },
  [MSG.warehouse_not_found]: { ar: 'المستودع غير موجود', en: 'Warehouse not found' },
  [MSG.warehouse_has_movements]: {
    ar: 'لا يمكن حذف مستودع له حركات مخزون — احذف حركاته أولاً',
    en: 'Cannot delete a warehouse that has stock movements — delete those movements first',
  },
  [MSG.destination_warehouse_required]: { ar: 'الرجاء اختيار المستودع الوجهة', en: 'Please choose a destination warehouse' },
  [MSG.destination_warehouse_not_found]: { ar: 'المستودع الوجهة غير موجود', en: 'Destination warehouse not found' },
  [MSG.destination_same_as_source]: { ar: 'لا يمكن التحويل لنفس المستودع', en: 'Cannot transfer to the same warehouse' },
  [MSG.movement_not_found]: { ar: 'الحركة غير موجودة', en: 'Stock movement not found' },
  [MSG.quantity_must_be_positive]: { ar: 'الكمية يجب أن تكون أكبر من صفر', en: 'Quantity must be greater than zero' },
  [MSG.adjustment_cannot_be_zero]: { ar: 'قيمة التسوية يجب ألا تساوي صفراً', en: 'Adjustment amount cannot be zero' },

  [MSG.employee_not_found]: { ar: 'الموظف غير موجود', en: 'Employee not found' },
  [MSG.leave_type_not_found]: { ar: 'نوع الإجازة غير موجود', en: 'Leave type not found' },
  [MSG.leave_type_duplicate_name]: { ar: 'يوجد نوع إجازة بنفس الاسم', en: 'A leave type with this name already exists' },
  [MSG.leave_type_in_use]: { ar: 'لا يمكن حذف نوع إجازة مستخدم في طلبات قائمة', en: 'A leave type used by existing requests cannot be deleted' },
  [MSG.leave_request_not_found]: { ar: 'طلب الإجازة غير موجود', en: 'Leave request not found' },
  [MSG.leave_request_not_pending]: { ar: 'لا يمكن تعديل طلب سبق البتّ فيه — فقط الطلبات المعلّقة', en: 'Only a pending request can be changed' },
  [MSG.leave_dates_invalid]: { ar: 'تاريخ البداية يجب ألا يكون بعد تاريخ النهاية', en: 'Start date must not be after end date' },
  [MSG.attendance_not_found]: { ar: 'سجل الحضور غير موجود', en: 'Attendance record not found' },
  [MSG.attendance_already_recorded]: { ar: 'سُجِّل حضور هذا الموظف لهذا اليوم بالفعل — عدِّل السجل القائم', en: 'Attendance for this employee on this day is already recorded — edit the existing row' },
  [MSG.leave_overlap]: { ar: 'للموظف إجازة أخرى تتداخل مع هذه الفترة', en: 'The employee already has leave overlapping this period' },
  // ⚠️ **الرسالةُ تسمّي المخرج** كما في الشطب: من مُنع يحتاج أن يعرف **ما يفعل**
  //    لا أن يُقال له «ممنوع» — فإمّا معتمِدٌ آخر، وإمّا إطفاء الاشتراط.
  [MSG.leave_two_persons_required]: {
    ar: 'المنشأة تشترط شخصين على اعتماد الإجازة — فمن قدّم طلب {employee} لا يعتمده. اطلب اعتماد صاحب صلاحية آخر، أو أطفئ الاشتراط من إعدادات المنشأة',
    en: 'This company requires two people to approve leave — whoever filed {employee}’s request cannot approve it. Ask another authorised user to approve, or turn the requirement off in company settings',
  },
  [MSG.sub_start_no_backdate]: { ar: 'تاريخ بداية الاشتراك يُثبَّت في يوم التفعيل ولا يقبل تاريخاً سابقاً', en: 'Subscription start is fixed to the activation day and cannot be backdated' },
  [MSG.sub_owner_only]: { ar: 'إدارة الاشتراك متاحة لمالك المنشأة فقط', en: 'Only the company owner can manage the subscription' },
  [MSG.sub_renew_months_invalid]: { ar: 'مدة التجديد يجب أن تكون بين شهر و36 شهراً', en: 'Renewal duration must be between 1 and 36 months' },
  [MSG.bank_not_found]: { ar: 'الحساب البنكي غير موجود', en: 'Bank account not found' },
  [MSG.bank_code_range_full]: {
    ar: 'نطاق رموز حسابات البنوك (1100–1199) ممتلئ — احذف بنكاً غير مستعمل أو وسّع النطاق بقرار',
    en: 'The bank account code range (1100–1199) is full — remove an unused bank or widen the range by decision',
  },
  [MSG.bank_required]: { ar: 'الرجاء اختيار الحساب البنكي', en: 'Please choose a bank account' },
  [MSG.bank_transaction_not_found]: { ar: 'الحركة البنكية غير موجودة', en: 'Bank transaction not found' },

  [MSG.property_not_found]: { ar: 'العقار غير موجود', en: 'Property not found' },
  [MSG.property_has_units]: {
    ar: 'لا يمكن حذف عقار له وحدات — احذف وحداته أولاً',
    en: 'Cannot delete a property that has units — delete its units first',
  },
  [MSG.unit_not_found]: { ar: 'الوحدة غير موجودة', en: 'Unit not found' },
  [MSG.unit_number_taken]: { ar: 'رقم الوحدة "{unitNo}" مستخدَم بالفعل في هذا العقار', en: 'Unit number "{unitNo}" is already used in this property' },
  [MSG.unit_has_contracts]: {
    ar: 'لا يمكن حذف وحدة مرتبطة بعقود — احذف عقودها أولاً',
    en: 'Cannot delete a unit that has contracts — delete its contracts first',
  },
  [MSG.unit_subtype_mismatch]: {
    ar: 'فئة الوحدة لا تتوافق مع الفئة السكنية المحدَّدة للعقار',
    en: "Unit category does not match the property's designated residential category",
  },
  [MSG.contract_not_found]: { ar: 'العقد غير موجود', en: 'Contract not found' },
  [MSG.contract_classification_required]: {
    ar: 'عقدٌ قديم بلا تصنيف — اختر تصنيفه (سكني معفى / تجاري خاضع) قبل أي تعديل',
    en: 'Legacy contract without a classification — choose residential (exempt) or commercial (taxable) before editing it',
  },
  [MSG.contract_vat_inclusion_required]: {
    ar: 'عقدٌ قديم لم يُعلَن شمولُ قيمته للضريبة — اختر «شاملة» أو «غير شاملة» قبل أي تعديل',
    en: 'Legacy contract without a declared VAT inclusion — choose inclusive or exclusive before editing it',
  },
  [MSG.contract_already_cancelled]: { ar: 'العقد ملغى بالفعل', en: 'Contract is already cancelled' },
  [MSG.contract_start_after_end]: { ar: 'تاريخ البداية يجب أن يسبق تاريخ النهاية', en: 'Start date must come before the end date' },
  [MSG.contract_outside_head_lease]: {
    ar: 'مدة العقد يجب أن تقع ضمن فترة عقد إيجار العقار الأصلي',
    en: "Contract period must fall within the property's own head-lease window",
  },
  [MSG.contract_dates_overlap]: {
    ar: 'تعارض تواريخ — الوحدة مؤجَّرة بالفعل بموجب العقد {contractNo} خلال هذه الفترة',
    en: 'Date conflict — this unit is already leased under contract {contractNo} during that period',
  },
  [MSG.installment_not_found]: { ar: 'القسط غير موجود', en: 'Installment not found' },
  [MSG.contract_cancelled_cannot_renew]: { ar: 'لا يمكن تجديد عقد ملغى', en: 'A cancelled contract cannot be renewed' },
  [MSG.contract_already_renewed]: {
    ar: 'هذا العقد مجدَّد بالفعل بالعقد {contractNo}',
    en: 'This contract has already been renewed as {contractNo}',
  },
  [MSG.contract_no_taken]: { ar: 'رقم العقد "{contractNo}" مستخدَم بالفعل', en: 'Contract number "{contractNo}" is already in use' },
  [MSG.renewal_must_start_after_source]: {
    ar: 'تاريخ بداية التجديد يجب أن يكون بعد بداية العقد الأصلي',
    en: 'The renewal must start after the original contract began',
  },
  [MSG.warranty_not_found]: { ar: 'الضمان غير موجود', en: 'Warranty not found' },
  [MSG.warranty_end_before_start]: { ar: 'تاريخ انتهاء الضمان قبل تاريخ بدايته', en: 'The warranty ends before it starts' },
  [MSG.warranty_has_claims]: { ar: 'لا يمكن حذف ضمان استُخدم في بلاغات صيانة — هو المستند خلفها', en: 'A warranty already claimed against cannot be deleted — it is the evidence behind those jobs' },
  [MSG.warranty_not_covering]: { ar: 'هذا الضمان لا يغطي موقع البلاغ أو تاريخه', en: 'This warranty does not cover the location or the date of the request' },
  [MSG.notification_not_found]: { ar: 'الإشعار غير موجود', en: 'Notification not found' },
  [MSG.escalation_recipient_not_found]: { ar: 'مستلم التصعيد غير موجود أو غير تابع لهذه الشركة', en: 'The escalation recipient does not exist in this company' },
  [MSG.maintenance_not_found]: { ar: 'بلاغ الصيانة غير موجود', en: 'Maintenance request not found' },
  [MSG.maintenance_invalid_transition]: {
    ar: 'لا يمكن نقل البلاغ من "{from}" إلى "{to}"',
    en: 'A request cannot move from "{from}" to "{to}"',
  },
  [MSG.maintenance_status_final]: {
    ar: 'البلاغ "{status}" ولا يقبل التعديل',
    en: 'This request is "{status}" and can no longer be edited',
  },
  [MSG.unit_not_in_property]: { ar: 'الوحدة لا تتبع العقار المحدَّد', en: 'The unit does not belong to the selected property' },
  [MSG.handover_not_found]: { ar: 'النموذج غير موجود', en: 'Handover form not found' },
  [MSG.handover_signed_immutable]: {
    ar: 'النموذج موقَّع ولا يمكن تعديله أو حذفه',
    en: 'This form is signed and can no longer be changed or deleted',
  },
  [MSG.claim_not_found]: { ar: 'المطالبة غير موجودة', en: 'Claim not found' },
  [MSG.claim_already_settled]: { ar: 'هذه المطالبة مسوّاة بالفعل', en: 'This claim has already been settled' },
  [MSG.deposit_not_found]: { ar: 'التأمين غير موجود', en: 'Deposit not found' },
  [MSG.deposit_already_settled]: { ar: 'تمت تسوية هذا التأمين مسبقاً', en: 'This deposit has already been settled' },
  [MSG.deductions_exceed_deposit]: {
    ar: 'مجموع الخصومات يتجاوز مبلغ التأمين ({held})',
    en: 'Deductions exceed the deposit amount ({held})',
  },
  [MSG.payment_net_must_be_positive]: { ar: 'المبلغ الصافي يجب أن يكون أكبر من صفر', en: 'Net amount must be greater than zero' },

  [MSG.reservation_not_found]: { ar: 'الحجز غير موجود', en: 'Reservation not found' },
  [MSG.reservation_unit_rented]: {
    ar: 'هذه الوحدة مؤجَّرة حالياً بعقد سارٍ — لا يمكن حجزها',
    en: 'This unit is currently leased under an active contract — it cannot be reserved',
  },
  [MSG.reservation_already_active]: {
    ar: 'يوجد حجز نشط على هذه الوحدة بالفعل حتى {expiryDate}',
    en: 'This unit already has an active reservation until {expiryDate}',
  },
  [MSG.reservation_name_mismatch]: {
    ar: 'تعذّر الحفظ — هذه الوحدة محجوزة بعربون لـ"{name}" حتى {expiryDate}. لا يمكن تأجيرها لمستأجر آخر قبل انتهاء الحجز، أو أدخل نفس الاسم لتحويل الحجز إلى عقد',
    en: 'Cannot save — this unit is reserved with a deposit for "{name}" until {expiryDate}. It cannot be leased to a different tenant before the reservation ends; enter the same name to convert the reservation into a contract',
  },

  [MSG.obligation_not_found]: { ar: 'البند غير موجود', en: 'Obligation item not found' },

  [MSG.company_not_found]: { ar: 'الشركة غير موجودة', en: 'Company not found' },
  [MSG.company_delete_blocked]: {
    ar: 'لا يمكن حذف المنشأة: لها سجلّاتٌ لا تُحذف بحال ({records}) — وبياناتُها تبقى',
    en: 'The company cannot be deleted: it holds records that are never deleted ({records}) — its data stays',
  },
  [MSG.username_taken]: { ar: 'اسم المستخدم "{username}" مستخدَم بالفعل', en: 'Username "{username}" is already taken' },
  [MSG.template_not_found]: { ar: 'القالب غير موجود', en: 'Permission template not found' },
  [MSG.template_name_required]: { ar: 'اسم النموذج مطلوب', en: 'Template name is required' },
  [MSG.template_name_taken]: { ar: 'يوجد نموذج بالاسم "{name}" بالفعل', en: 'A template named "{name}" already exists' },
  [MSG.template_in_use]: {
    ar: 'لا يمكن حذف قالب مستخدَم من قِبل شركة أو حساب موظف',
    en: 'Cannot delete a template that is assigned to a company or an employee account',
  },
  [MSG.template_system_immutable]: { ar: 'نموذج المطوّر ثابت ولا يمكن تعديله', en: 'The developer template is fixed and cannot be edited' },
  [MSG.template_system_undeletable]: { ar: 'نموذج المطوّر ثابت ولا يمكن حذفه', en: 'The developer template is fixed and cannot be deleted' },
  [MSG.template_system_not_assignable]: { ar: 'لا يمكن إسناد نموذج المطوّر لحساب موظف', en: 'The developer template cannot be assigned to an employee account' },
  [MSG.pos_shift_already_open]: { ar: 'لديك مناوبة مفتوحة بالفعل — أقفلها قبل فتح غيرها', en: 'You already have an open shift — close it before opening another' },
  [MSG.pos_no_open_shift]: { ar: 'لا توجد مناوبة مفتوحة — افتح مناوبة قبل تسجيل البيع', en: 'No open shift — open one before ringing a sale' },
  [MSG.pos_shift_not_found]: { ar: 'المناوبة غير موجودة', en: 'Shift not found' },
  [MSG.pos_shift_closed]: { ar: 'المناوبة مقفلة بالفعل', en: 'Shift is already closed' },
  [MSG.pos_not_your_shift]: { ar: 'لا يمكنك إقفال مناوبة فتحها غيرك', en: 'You cannot close a shift someone else opened' },
  [MSG.pos_empty_sale]: { ar: 'لا يمكن تسجيل بيع بلا أصناف', en: 'A sale needs at least one line' },
  [MSG.pos_split_parts_required]: { ar: 'الدفع المقسّم يحتاج تفصيل المبالغ (نقدي/شبكة)', en: 'A split payment needs its parts (cash/card amounts)' },
  [MSG.pos_split_only_for_split]: { ar: 'تفصيل المبالغ يُرسل فقط مع الدفع المقسّم', en: 'Payment parts are only accepted with a SPLIT payment' },
  [MSG.pos_split_mismatch]: { ar: 'مجموع أجزاء الدفع لا يساوي إجمالي الفاتورة', en: 'The payment parts do not add up to the invoice total' },
  [MSG.pos_terminal_declined]: { ar: 'رفضت بوابة الدفع العملية: {reason}', en: 'The payment gateway declined: {reason}' },
  [MSG.integration_unknown_provider]: { ar: 'مزوّد غير معروف لهذا النوع من الربط', en: 'Unknown provider for this integration kind' },
  [MSG.zatca_test_environment_forbidden_in_production]: { ar: 'بيئة الاختبار (SANDBOX/SIMULATION) غير مسموحة في الإنتاج — فواتيرها لا تُعتمد لدى هيئة الزكاة والضريبة والجمارك', en: 'Test environments (SANDBOX/SIMULATION) are not allowed in production — their invoices are not accepted by ZATCA' },
  [MSG.delegation_cycle_rejected]: {
    ar: 'لا يمكن التفويض لهذا المستخدم — فهو يفوّضك أصلاً (مباشرةً أو عبر سلسلة)، والتفويض الدائري غير مسموح',
    en: 'Cannot delegate to this user — they already delegate to you (directly or through a chain), and circular delegation is not allowed',
  },
  [MSG.delegation_exceeds_grantor]: {
    ar: 'لا يمكنك تفويض صلاحية لا تملكها أنت',
    en: 'You cannot delegate a permission you do not hold yourself',
  },
  [MSG.delegation_grantee_not_found]: { ar: 'الموظف غير موجود في هذه المنشأة', en: 'Employee not found in this company' },
  [MSG.delegation_self]: { ar: 'لا يفوّض أحدٌ نفسه', en: 'Nobody delegates to themselves' },
  [MSG.delegation_not_found]: { ar: 'التفويض غير موجود', en: 'Delegation not found' },
  [MSG.delegation_already_revoked]: { ar: 'التفويض مسحوبٌ بالفعل', en: 'This delegation is already revoked' },
  [MSG.delegation_revoke_forbidden]: {
    ar: 'السحب لمن فوّض أو لصاحب المنشأة وحدهما',
    en: 'Only the grantor or the company owner may revoke',
  },
  [MSG.delegation_empty_grant]: { ar: 'اختر صلاحيةً واحدة على الأقل', en: 'Select at least one permission' },
  [MSG.task_assignee_not_found]: { ar: 'الموظف غير موجود في هذه المنشأة', en: 'Employee not found in this company' },
  [MSG.task_target_incomplete]: {
    ar: 'المستند المرتبط يحتاج الشاشة والمعرّف معاً — أو لا شيء',
    en: 'A linked document needs both a screen and an id — or neither',
  },
  [MSG.task_target_not_visible]: {
    ar: 'لا تربط مهمةً بمستندٍ لا تراه أنت',
    en: 'You cannot link a task to a document you cannot see yourself',
  },
  [MSG.task_recurrence_needs_anchor]: { ar: 'المهمة المتكرّرة تحتاج أول موعد استحقاق', en: 'A recurring task needs a first due date' },
  [MSG.task_not_found]: { ar: 'المهمة غير موجودة', en: 'Task not found' },
  [MSG.task_comment_forbidden]: { ar: 'حوارُ المهمة لطرفيها وحدهما — المكلَّف ومن أسندها', en: 'Only the assignee and the assigner may take part in this task thread' },
  [MSG.task_transition_forbidden]: {
    ar: 'لا تملك صلاحية هذا الانتقال على شاشة المستند — والإسناد لا يمنح صلاحية',
    en: 'You lack the permission for this transition on the document screen — assignment grants none',
  },
  // (ق-٦٣٦) **الصلاحيةُ شرطٌ لا مفتاح**: تُغيَّر حالةُ مهمّةٍ أنت طرفُها — المكلَّف أو من أسندها.
  [MSG.task_transition_not_party]: {
    ar: 'حالةُ المهمة يغيّرها طرفاها وحدهما — المكلَّف ومن أسندها؛ والصلاحيةُ على الشاشة لا تجعلك طرفاً',
    en: 'Only the parties to a task — its assignee and its assigner — may change its status; a screen permission does not make you a party',
  },
  [MSG.delegation_sequence_conflict]: {
    ar: 'تفويضٌ آخر سُجِّل في اللحظة نفسها — أعد المحاولة',
    en: 'Another delegation was recorded at the same moment — please retry',
  },
  [MSG.integration_mock_forbidden_in_production]: { ar: 'المزوّد التجريبي غير مسموح في بيئة الإنتاج — يعتمد كل عملية دفع بلا تحصيل فعلي', en: 'The test provider is not allowed in production — it approves every payment without collecting money' },
  [MSG.integration_credentials_required]: { ar: 'مفاتيح الربط مطلوبة', en: 'Credentials are required' },
  [MSG.integration_kind_already_active]: { ar: 'يوجد ربط فعّال من هذا النوع بالفعل — عطّله أولاً', en: 'An active connection of this kind already exists — disable it first' },
  [MSG.integration_not_found]: { ar: 'الربط غير موجود', en: 'Connection not found' },
  [MSG.integration_owner_only]: { ar: 'إدارة الربط والمفاتيح لمالك المنشأة فقط', en: 'Only the company owner manages integrations and keys' },
  [MSG.owner_only]: { ar: 'هذا القرار لمالك المنشأة وحده', en: 'This decision belongs to the company owner alone' },
  [MSG.support_no_active_grant]: { ar: 'لا توجد موافقة دعم فعّالة من هذه المنشأة', en: 'No active support consent from this company' },
  [MSG.support_read_only]: { ar: 'وضع الدعم للقراءة فقط — لا تعديل على بيانات المنشأة', en: 'Support mode is read-only — no changes to company data' },
  [MSG.support_request_exists]: { ar: 'يوجد طلب دعم معلّق أو نافذة فعّالة لهذه المنشأة بالفعل', en: 'A pending request or active window already exists for this company' },
  [MSG.support_grant_not_found]: { ar: 'طلب الدعم غير موجود', en: 'Support request not found' },
  [MSG.support_grant_not_pending]: { ar: 'طلب الدعم محسوم بالفعل', en: 'This support request was already decided' },
  [MSG.support_grant_not_active]: { ar: 'لا توجد نافذة دعم فعّالة لقطعها', en: 'No active support window to revoke' },
  [MSG.support_scope_forbidden]: { ar: 'هذه الشاشة خارج نطاق إذن الدعم الذي وافقت عليه المنشأة', en: 'This screen is outside the support scope the company approved' },
  [MSG.support_scope_undeclared]: { ar: 'هذا المسار لا يُعلن شاشته، فلا يُقرأ في وضع الدعم', en: 'This route declares no screen, so it cannot be read in support mode' },
  [MSG.support_grant_not_yours]: { ar: 'إذن الدعم الفعّال لهذه المنشأة مُنح لمدير آخر — لا يُدخَل بإذن غيرك', en: 'The active support consent for this company was granted to another admin — you cannot enter on their consent' },
  [MSG.handover_item_not_found]: { ar: 'بند النموذج غير موجود في هذا النموذج', en: 'Checklist item not found on this handover' },
  [MSG.settlement_lines_mismatch]: { ar: 'مجموع بنود التسوية لا يساوي مبلغ التسوية', en: 'Settlement lines do not add up to the settlement amount' },
  [MSG.unearned_disposition_required]: {
    ar: 'بقي {amount} مقبوضاً عن مدّة لم تُقدَّم — حدّد وجهته: يُردّ للمستأجر أم يُحتجَز دخلاً بشرط العقد',
    en: 'A collected amount of {amount} covers a period not served — choose its destination: refunded to the tenant, or kept as income under the contract',
  },
  [MSG.bulk_units_collision]: { ar: 'أرقام وحدات موجودة مسبقاً ضمن النطاق المطلوب: {units}', en: 'Unit numbers already exist in the requested range: {units}' },
  [MSG.templates_owner_only]: { ar: 'إدارة نماذج الصلاحيات متاحة لمالك المنشأة أو مدير المنصة فقط', en: 'Only the company owner or the platform admin can manage permission templates' },
  [MSG.templates_read_forbidden]: { ar: 'لا تملك صلاحية عرض قوالب الصلاحيات', en: 'You do not have permission to view permission templates' },
  [MSG.company_user_not_found]: { ar: 'حساب الموظف غير موجود', en: 'Employee account not found' },
  [MSG.company_users_owner_only]: {
    ar: 'إدارة حسابات الموظفين متاحة لحساب الشركة الرئيسي فقط',
    en: 'Managing employee accounts is restricted to the main company account',
  },
  [MSG.company_profile_owner_only]: {
    ar: 'تعديل بيانات المنشأة متاح لحساب الشركة الرئيسي فقط',
    en: 'Editing company details is restricted to the main company account',
  },

  [MSG.zatca_profile_incomplete]: { ar: 'أكمل الاسم القانوني والرقم الضريبي في بيانات المنشأة قبل الإرسال لهيئة الزكاة', en: 'Complete the legal name and VAT number in the company profile before submitting to ZATCA' },
  [MSG.zatca_buyer_address_incomplete]: {
    ar: 'الفاتورة القياسية تشترط عنوان المشتري كاملاً — وينقص من بطاقة «{customer}»: {missing}. أكملها ثم أعد الإرسال',
    en: 'A standard invoice requires the buyer\'s full national address — missing from "{customer}": {missing}. Complete it and resubmit',
  },
  [MSG.zatca_onboarding_not_started]: { ar: 'ابدأ ربط الفوترة الإلكترونية أولاً من إعدادات المنشأة', en: 'Start e-invoicing onboarding first' },
  [MSG.zatca_qr_value_too_long]: {
    ar: 'تعذّر توليد رمز الاستجابة: قيمة الوسم {tag} تبلغ {bytes} بايتاً وحدّ المواصفة 255 — قصّر الاسم القانوني في بيانات المنشأة',
    en: 'Cannot build the QR code: tag {tag} is {bytes} bytes and the specification allows 255 — shorten the legal name in the company profile',
  },
  [MSG.zatca_already_onboarded]: { ar: 'الربط مكتمل بالفعل — إعادة التوليد ستُبطل شهادتك الحالية', en: 'Onboarding is already complete — regenerating would invalidate your current certificate' },
  [MSG.zatca_compliance_required]: { ar: 'يجب الحصول على شهادة الامتثال أولاً بإدخال رمز التحقق من بوابة فاتورة', en: 'Obtain the compliance certificate first by entering the OTP from the Fatoora portal' },
  [MSG.zatca_not_onboarded]: { ar: 'لم يكتمل ربط الفوترة الإلكترونية مع هيئة الزكاة بعد', en: 'E-invoicing onboarding with the authority is not complete yet' },
  [MSG.zatca_already_cleared]: { ar: 'الفاتورة مُصدَّقة بالفعل لدى الهيئة — لا يمكن إعادة إرسالها', en: 'This invoice is already cleared by the authority and cannot be resubmitted' },
  [MSG.zatca_stamp_in_progress]: { ar: 'المستند قيد الختم الآن من مسارٍ آخر — أعد المحاولة بعد لحظات', en: 'This document is being stamped by another process — retry shortly' },
  [MSG.zatca_not_stamped]: { ar: 'لا مستندٌ موقَّعٌ محفوظٌ لهذه الفاتورة — تُختم أولاً ثم تُبلَّغ', en: 'No stored signed document for this invoice — it must be stamped before it is reported' },
  [MSG.zatca_invoice_stamped_locked]: { ar: 'الفاتورة مختومةٌ وبانتظار إبلاغ الهيئة — لا تُعدَّل؛ إن رُدّت تُصحَّح ثم تُعاد', en: 'This invoice is stamped and awaiting the authority — it cannot be edited; if rejected, correct it and resubmit' },
  [MSG.credit_note_target_invalid]: { ar: 'إشعار الدائن يُصدَر على فاتورة أصلية فقط، لا على إشعار آخر', en: 'A credit note can only be issued against an original invoice, not another note' },
  [MSG.credit_note_exceeds_remaining]: { ar: 'قيمة إشعار الدائن تتجاوز المتبقي من الفاتورة الأصلية', en: 'The credit note amount exceeds what remains of the original invoice' },
  [MSG.credit_note_immutable]: { ar: 'إشعار الدائن لا يُعدَّل بعد إصداره — احذفه وأصدر إشعاراً جديداً، أو أصدر إشعاراً مصححاً', en: 'A credit note cannot be edited after issue — delete and reissue it, or issue a correcting note' },
  [MSG.invoice_has_credit_notes]: { ar: 'لا يمكن حذف فاتورة صدرت عليها إشعارات دائن — احذف الإشعارات أولاً', en: 'An invoice with issued credit notes cannot be deleted — remove the notes first' },
  [MSG.return_line_not_original]: { ar: 'سطر المرتجع يجب أن يشير إلى سطرٍ من الفاتورة الأصلية نفسها وبصنفه', en: 'A returned line must reference a line of the same original invoice, with its product' },
  [MSG.return_exceeds_sold]: { ar: 'الكمية المرتجعة ({requested}) تتجاوز المتاح: بِيع {sold} وأُرجع منه {returned} من قبل', en: 'Returned quantity ({requested}) exceeds what is available: {sold} sold, {returned} already returned' },
  [MSG.refund_target_invalid]: { ar: 'سند الردّ يُصدَر على إشعارٍ دائن مرتبطٍ بفاتورةٍ أصلية فقط', en: 'A refund is issued against a credit note linked to an original invoice only' },
  [MSG.refund_nothing_refundable]: { ar: 'لا شيء قابلٌ للردّ: الإشعار خُصم من متبقي الفاتورة غير المسدَّد، أو رُدّ من قبل', en: 'Nothing is refundable: the note offset the unpaid balance of its invoice, or was already refunded' },
  [MSG.refund_exceeds_refundable]: { ar: 'مبلغ الردّ ({amount}) يتجاوز القابل للردّ ({refundable}) — الخصم من الفاتورة غير المسدَّدة إلزاميّ أولاً', en: 'Refund ({amount}) exceeds the refundable amount ({refundable}) — the unpaid invoice balance must be offset first' },
  [MSG.zatca_invoice_chain_locked]: {
    ar: 'لا يمكن حذف فاتورة دخلت سلسلة الفوترة الإلكترونية — حذفها يكسر ترابط السلسلة الذي تتحقق منه هيئة الزكاة، والتصحيح يكون بإشعار دائن',
    en: 'An invoice that has entered the e-invoicing chain cannot be deleted — removing it would break the hash chain ZATCA verifies; issue a credit note to correct it',
  },
  [MSG.zatca_invoice_cleared_locked]: {
    ar: 'لا يمكن تعديل بيانات فاتورة مصدَّقة لدى هيئة الزكاة — هي مستند قانوني قائم، والتصحيح يكون بإشعار دائن. (تعديل الملاحظات وحالة السداد يبقى متاحاً)',
    en: 'An invoice cleared by ZATCA cannot have its content edited — it is a standing legal document; correct it with a credit note. (Notes and payment status can still be changed.)',
  },
  [MSG.zatca_invoice_submitting_locked]: {
    ar: 'الفاتورة قيد الإرسال إلى هيئة الزكاة — انتظر نتيجة الإرسال قبل تعديلها؛ فإن صُدِّقت صار التصحيح بإشعار دائن',
    en: 'This invoice is being submitted to ZATCA — wait for the result before editing it; if it clears, correction is by credit note',
  },
  [MSG.zatca_invoice_successor_locked]: {
    ar: 'لا يمكن تعديل هذه الفاتورة المرفوضة: صدر بعدها مستند يرتبط بها في سلسلة الهيئة، وتعديلها يقطع ارتباطه — أرسلها كما هي أو صحّح بإشعار دائن',
    en: 'This rejected invoice cannot be edited: a later document is already chained to it in the authority’s sequence and editing it would break that link — resubmit it as is, or correct it with a credit note',
  },

  [MSG.cash_drawer_not_found]: { ar: 'الدرج غير موجود', en: 'Cash drawer not found' },
  [MSG.cash_drawer_name_taken]: { ar: 'يوجد درج بالاسم "{name}" في هذا الفرع بالفعل', en: 'A drawer named "{name}" already exists in this branch' },
  [MSG.cash_drawer_forbidden]: { ar: 'إدارة الأدراج لمالك المنشأة', en: 'Managing drawers is limited to the company owner' },
  // ⚠️ (ق-٢٦٥) المنعُ يسمّي الرصيد **ويدلّ على المخرج** — فمنعٌ بلا مخرجٍ يُلتفّ عليه.
  [MSG.cash_drawer_has_balance]: {
    ar: 'الدرج فيه {balance} · انقلها إلى درج آخر أو إلى البنك ثم عطّله',
    en: 'The drawer holds {balance} · move it to another drawer or to the bank, then deactivate it',
  },
  [MSG.cash_drawer_has_open_shift]: {
    ar: 'على الدرج مناوبة مفتوحة لـ{cashier} منذ {since} · أقفلها ثم عطّل الدرج',
    en: 'The drawer has an open shift for {cashier} since {since} · close it, then deactivate the drawer',
  },
  [MSG.cash_drawer_code_range_full]: {
    ar: 'نطاق رموز الأدراج (1010–1099) ممتلئ — احذف درجاً غير مستعمل أو وسّع النطاق بقرار',
    en: 'The drawer code range (1010–1099) is full — remove an unused drawer or widen the range by decision',
  },
  [MSG.cash_drawer_has_movements]: {
    ar: 'لا يمكن حذف درج تحرّك حسابه — عطّله بدل حذفه',
    en: 'A drawer whose account has postings cannot be deleted — deactivate it instead',
  },
  [MSG.cash_drawer_inactive]: {
    ar: 'الدرج "{name}" معطَّل — فعّله أو اختر درجاً آخر',
    en: 'Drawer "{name}" is inactive — activate it or pick another',
  },
  [MSG.cash_drawer_branch_mismatch]: {
    ar: 'الدرج "{name}" يخصّ فرعاً آخر — اختر درجاً من فرع المناوبة',
    en: 'Drawer "{name}" belongs to another branch — pick one from the shift branch',
  },
  [MSG.branch_not_found]: { ar: 'الفرع غير موجود', en: 'Branch not found' },
  [MSG.branch_name_taken]: { ar: 'يوجد فرع بالاسم "{name}" بالفعل', en: 'A branch named "{name}" already exists' },
  [MSG.branch_forbidden]: { ar: 'لا تملك صلاحية الوصول إلى هذا الفرع', en: 'You do not have permission to access this branch' },
  [MSG.branch_has_data]: {
    ar: 'لا يمكن حذف فرع مرتبط بحركات — انقل بياناته أو أعد إسنادها أولاً',
    en: 'Cannot delete a branch that has activity — move or reassign its records first',
  },
  [MSG.activity_not_found]: { ar: 'النشاط التجاري غير موجود', en: 'Business activity not found' },
  [MSG.activity_name_taken]: { ar: 'يوجد نشاط بالاسم "{name}" بالفعل', en: 'An activity named "{name}" already exists' },
  [MSG.activity_in_use]: {
    ar: 'لا يمكن حذف نشاط مرتبط بفروع أو منتجات — أعد إسنادها أولاً',
    en: 'Cannot delete an activity linked to branches or products — reassign them first',
  },
  [MSG.activity_last_one]: {
    ar: 'لا يمكن حذف آخر نشاط — يجب أن يبقى للمنشأة نشاط واحد على الأقل',
    en: 'Cannot delete the last activity — a company must keep at least one',
  },

  [MSG.currency_not_found]: { ar: 'العملة غير موجودة', en: 'Currency not found' },
  [MSG.currency_code_taken]: { ar: 'العملة "{code}" مضافة بالفعل', en: 'Currency "{code}" is already defined' },
  [MSG.currency_base_immutable]: {
    ar: 'لا يمكن تغيير العملة الأساسية — كل الأرصدة المحاسبية مسجّلة بها',
    en: 'The base currency cannot be changed — every posted balance is recorded in it',
  },
  [MSG.currency_base_undeletable]: { ar: 'لا يمكن حذف العملة الأساسية', en: 'The base currency cannot be deleted' },
  [MSG.currency_in_use]: {
    ar: 'لا يمكن حذف عملة مستخدَمة في مستندات — راجع الفواتير والمشتريات أولاً',
    en: 'Cannot delete a currency used by documents — check invoices and purchases first',
  },
  [MSG.currency_rate_must_be_positive]: { ar: 'سعر الصرف يجب أن يكون أكبر من صفر', en: 'The exchange rate must be greater than zero' },
  [MSG.exchange_rate_same_currency]: { ar: 'لا يمكن تسجيل سعر صرف بين العملة ونفسها', en: 'An exchange rate cannot be between a currency and itself' },

  [MSG.fiscal_year_not_found]: { ar: 'السنة المالية غير موجودة', en: 'Fiscal year not found' },
  [MSG.fiscal_period_not_found]: { ar: 'الفترة المالية غير موجودة', en: 'Fiscal period not found' },
  [MSG.fiscal_year_overlaps]: {
    ar: 'توجد سنة مالية معرَّفة بالفعل تتداخل مع هذه الفترة',
    en: 'A fiscal year covering part of this period is already defined',
  },
  [MSG.fiscal_year_start_after_end]: { ar: 'تاريخ بداية السنة المالية يجب أن يسبق تاريخ نهايتها', en: "The fiscal year's start date must come before its end date" },
  [MSG.fiscal_no_period_for_date]: {
    ar: 'لا توجد فترة مالية معرَّفة لهذا التاريخ',
    en: 'No fiscal period is defined for this date',
  },
  [MSG.fiscal_period_closed]: {
    ar: 'الفترة {period} مقفلة — التصحيح يكون بقيد عكسي في فترة مفتوحة',
    en: 'Period {period} is closed — post a reversing entry in an open period instead',
  },

  [MSG.account_frozen]: { ar: 'الحساب مجمّد بسبب انتهاء الاشتراك', en: 'Account is frozen — the subscription has ended' },
  [MSG.account_stopped]: { ar: 'الحساب متوقف', en: 'Account is stopped' },
  [MSG.account_closed]: {
    ar: 'حسابُك مغلقٌ بطلبك، وبياناتُك محفوظةٌ بمدد الحفظ النظامية حتى {retainUntil} على الأقلّ ثم تُمحى — ويكتمل الإتلافُ خلال أربعةَ عشرَ يوماً من دوران النسخ الاحتياطية. ويمكنك طلبُ إعادة الفتح حتى {reopenUntil}، وبعدها تُمحى بياناتُك غيرُ الملزِمة آلياً ولا عودة',
    en: 'Your account is closed at your request; your data is retained under the statutory retention periods until at least {retainUntil}, then erased — destruction completes within fourteen days as backups rotate. You may request reopening until {reopenUntil}; after that, non-mandatory data is erased automatically and reopening is no longer possible',
  },
  [MSG.deletion_company_closed]: { ar: 'الحساب مغلق بالفعل — يمكنك طلب إعادة فتحه', en: 'The account is already closed — you may request reopening' },
  [MSG.consent_required]: {
    ar: 'تغيّرت قائمةُ المعالجين الفرعيين ({effectiveFrom})، وخدمتُك صارت تقتضيها. أمامك ثلاثةٌ: تقبل الآن، أو تنزّل بياناتك، أو تُغلق حسابك — والتصديرُ والإغلاق يعملان الآن',
    en: 'The sub-processor list changed ({effectiveFrom}) and your service now requires it. Three options remain open: accept now, download your data, or close your account — export and closure still work',
  },
  [MSG.consent_notice_too_short]: { ar: 'مهلةُ الإشعار دون الحدّ: {days} يوماً على الأقلّ من النشر', en: 'Notice period below the minimum: at least {days} days from publication' },
  [MSG.consent_version_not_found]: { ar: 'لا نسخةَ بهذا الرقم من قائمة المعالجين الفرعيين', en: 'No sub-processor list version with this number' },
  [MSG.consent_not_effective_yet]: { ar: 'هذه النسخة لم تسرِ بعد — تُقبل من {effectiveFrom}', en: 'This version is not in effect yet — acceptable from {effectiveFrom}' },
  [MSG.consent_already_accepted]: { ar: 'قبِلتَ هذه النسخة بالفعل', en: 'You have already accepted this version' },
  [MSG.consent_owner_only]: { ar: 'الموافقة على معالجة البيانات لمالك الحساب وحده', en: 'Only the account owner may accept the data-processing terms' },
  [MSG.reopen_not_closed]: { ar: 'إعادة الفتح لحسابٍ مغلق فقط', en: 'Reopening applies to a closed account only' },
  [MSG.reopen_window_closed]: { ar: 'انقضت نافذةُ إعادة الفتح ({reopenUntil}) — وبياناتُك الملزِمة محفوظةٌ حتى أجلها', en: 'The reopening window has closed ({reopenUntil}) — mandatory records stay retained until their deadline' },
  [MSG.erasure_only_closed]: { ar: 'محوُ البيانات غير الملزِمة لحسابٍ مغلق فقط', en: 'Erasure of non-mandatory data applies to a closed account only' },
  [MSG.erasure_already_done]: { ar: 'مُحي غيرُ الملزِم من بيانات هذا الحساب بالفعل', en: 'Non-mandatory data of this account has already been erased' },
  [MSG.screen_forbidden]: { ar: 'لا تملك صلاحية الوصول لشاشة "{screen}"', en: 'You do not have permission to access the "{screen}" screen' },
  /**
   * ⚠️ الرسالة تقول **ثلاثة** لا واحداً: الشاشة موجودة · وغير مفعّلة
   * لنشاطك · ويمكن تفعيلها من الإعدادات. ورفضٌ مجرّد يترك التاجر يظنّ
   * المنصة ناقصة، فيبحث عن بديل بدل أن يضيف نشاطاً بنقرة.
   */
  [MSG.primary_activity_needs_confirmation]: {
    ar: 'تغيير النشاط الرئيسي يحتاج تأكيداً — اعرض الشاشات التي ستختفي أولاً',
    en: 'Changing the primary activity needs confirmation — show which screens will disappear first',
  },
  [MSG.primary_activity_disabled]: {
    ar: 'لا يصلح نشاطٌ معطَّل نشاطاً رئيسياً — فعّله أولاً',
    en: 'A disabled activity cannot be the primary one — enable it first',
  },
  [MSG.screen_not_in_sector]: {
    ar: 'شاشة "{screen}" غير مفعّلة لنشاط منشأتك — أضِف النشاط المناسب من الإعدادات لتظهر',
    en: 'The "{screen}" screen is not enabled for your business activity — add the matching activity in Settings to show it',
  },
  [MSG.export_owner_only]: { ar: 'تصدير البيانات متاح لمالك المنشأة فقط', en: 'Only the company owner can export the data' },
  [MSG.archive_not_ready]: { ar: 'لا نسخةَ بعد — تُنتَج عند البتّ في الطلب', en: 'No copy yet — it is produced when the request is decided' },
  [MSG.archive_expired]: { ar: 'انقضى أجلُ إتاحة النسخة', en: 'The copy is no longer available for download' },
  [MSG.archive_storage_unavailable]: {
    ar: 'تعذّر إنتاج نسخة المنشأة — ولا يُغلق الحساب ولا يُمحى شيءٌ قبلها',
    en: 'The company copy could not be produced — nothing is closed or erased before it',
  },
  [MSG.deletion_owner_only]: { ar: 'طلب حذف الحساب متاح لمالك المنشأة فقط', en: 'Only the company owner can request account deletion' },
  [MSG.deletion_already_pending]: { ar: 'يوجد طلب حذف قيد المراجعة بالفعل', en: 'A deletion request is already under review' },
  [MSG.deletion_request_not_found]: { ar: 'طلب الحذف غير موجود', en: 'Deletion request not found' },
  [MSG.deletion_not_pending]: { ar: 'لا يمكن تعديل طلب سبق البتّ فيه', en: 'This request has already been decided' },
  [MSG.trash_entity_unknown]: { ar: 'نوع السجل غير معروف', en: 'Unknown record type' },
  [MSG.trash_item_not_found]: { ar: 'السجل غير موجود في سلة المحذوفات', en: 'Record not found in trash' },
  [MSG.master_data_locked]: { ar: 'البيانات الرئيسية مقفلة — لا يمكن تعديل العقارات أو العقود إلا لمالك المنشأة أو موظف مُستثنى', en: 'Master data is locked — only the owner or an exempted employee may change properties or contracts' },
  [MSG.action_forbidden]: { ar: 'لا تملك صلاحية تنفيذ هذا الإجراء ({action}) على شاشة "{screen}"', en: 'You do not have permission to perform this action ({action}) on the "{screen}" screen' },

  [MSG.file_missing]: { ar: 'لم يتم إرسال أي ملف', en: 'No file was uploaded' },
  [MSG.file_too_large]: { ar: 'حجم الملف يتجاوز الحد المسموح (10 ميغابايت)', en: 'File exceeds the maximum allowed size (10 MB)' },
  [MSG.file_type_unsupported]: {
    ar: 'نوع الملف غير مدعوم — المسموح: PDF أو صورة (JPEG/PNG/WebP)',
    en: 'Unsupported file type — allowed: PDF or image (JPEG/PNG/WebP)',
  },
  [MSG.file_access_denied]: { ar: 'لا تملك صلاحية الوصول إلى هذا الملف', en: 'You do not have permission to access this file' },
  [MSG.file_not_found]: { ar: 'الملف غير موجود', en: 'File not found' },

  [MSG.vat_number_invalid]: {
    ar: 'الرقم الضريبي يجب أن يتكوّن من 15 رقماً ويبدأ وينتهي بالرقم 3',
    en: 'VAT number must be 15 digits, starting and ending with 3',
  },
  [MSG.cr_number_invalid]: { ar: 'رقم السجل التجاري يجب أن يتكوّن من 10 أرقام بالضبط', en: 'Commercial registration number must be exactly 10 digits' },
  [MSG.postal_code_invalid]: { ar: 'الرمز البريدي يجب أن يكون 5 أرقام', en: 'The postal code must be 5 digits' },
  [MSG.additional_number_invalid]: { ar: 'الرقم الإضافي يجب أن يكون أربع خانات', en: 'The additional number must be four digits' },
  [MSG.email_invalid]: { ar: 'صيغة البريد الإلكتروني غير صحيحة', en: 'Email address format is invalid' },
  [MSG.legal_name_required]: { ar: 'الاسم القانوني مطلوب', en: 'Legal name is required' },
  [MSG.legal_name_too_long_for_qr]: {
    ar: 'الاسم القانوني أطول من حدّ رمز الاستجابة لهيئة الزكاة (255 بايتاً — الحرف العربي بايتان، أي نحو 127 حرفاً)',
    en: 'Legal name exceeds the ZATCA QR limit (255 bytes — Arabic letters are two bytes each, about 127 characters)',
  },
  [MSG.file_key_required]: { ar: 'مفتاح الملف مطلوب', en: 'File key is required' },
};

/** Looks up `key` in the requested language. An unknown key is returned as-is
 * so an inline message (or a NestJS built-in like "Unauthorized") still
 * reaches the caller instead of being swallowed. */
export function translate(key: string, language: Language): string {
  const entry = CATALOG[key];
  if (!entry) return key;
  return entry[language] ?? entry[DEFAULT_LANGUAGE];
}

/** Encodes a key plus its runtime values into a single string, so it can ride
 * through NestJS's exception plumbing (which only carries a message string)
 * and still be translated later. Format: `key {"a":"b"}`. */
export function formatMessage(key: MessageKey, params: Record<string, string | number>): string {
  return `${key} ${JSON.stringify(params)}`;
}

const PARAM_SEPARATOR = ' ';

/** Reverses `formatMessage`, translates, then substitutes `{placeholder}`s. */
export function resolveMessage(raw: string, language: Language): string {
  const separatorIndex = raw.indexOf(PARAM_SEPARATOR);
  if (separatorIndex === -1) return translate(raw, language);

  const key = raw.slice(0, separatorIndex);
  let params: Record<string, string | number> = {};
  try {
    params = JSON.parse(raw.slice(separatorIndex + 1));
  } catch {
    // Malformed payload: fall back to translating the key alone rather than
    // leaking the raw JSON to the user.
    return translate(key, language);
  }

  return Object.entries(params).reduce<string>(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    translate(key, language),
  );
}
