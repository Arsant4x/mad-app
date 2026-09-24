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
  /** دورُ مدير المنصّة (`ق-١٣١٢` · ⑪A2). */
  platform_role_denied: 'auth.platform_role_denied',
  /** القرارُ المنصّيُّ بيدين (`ق-١٣١٨` · ⑪A1). */
  decision_summary_required: 'platform.decision_summary_required',
  decision_already_open: 'platform.decision_already_open',
  decision_not_found: 'platform.decision_not_found',
  decision_not_pending: 'platform.decision_not_pending',
  decision_same_hand: 'platform.decision_same_hand',
  decision_required: 'platform.decision_required',
  /** المصادقةُ المتعدّدة (`ق-١٣١٨` · ⑨A1). */
  mfa_already_enrolled: 'auth.mfa_already_enrolled',
  mfa_not_started: 'auth.mfa_not_started',
  mfa_code_invalid: 'auth.mfa_code_invalid',
  mfa_required: 'auth.mfa_required',
  mfa_enrolment_required: 'auth.mfa_enrolment_required',
  reset_token_invalid: 'auth.reset_token_invalid',
  register_disabled: 'auth.register_disabled',
  register_unavailable: 'auth.register_unavailable',
  register_username_unavailable: 'auth.register_username_unavailable',

  // reports — ledger / statement (ق-١٢٦١ ج)
  ledger_filter_required: 'reports.ledger_filter_required',
  statement_party_required: 'reports.statement_party_required',

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
  journal_posted_reverse_instead: 'journal.posted_reverse_instead',
  journal_auto_entry_not_reversible: 'journal.auto_entry_not_reversible',
  journal_reversal_not_reversible: 'journal.reversal_not_reversible',
  journal_already_reversed: 'journal.already_reversed',
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
  // buyer kind (ق-١٢٦١ أ — ②A1)
  customer_kind_required: 'customers.kind_required',
  // line discount (ق-١٢٦١ ب — ④B1)
  invoice_line_discount_exceeds: 'invoices.line_discount_exceeds',
  customer_kind_undeclared: 'customers.kind_undeclared',
  customer_other_id_scheme_invalid: 'customers.other_id_scheme_invalid',
  customer_other_id_invalid: 'customers.other_id_invalid',
  customer_other_id_pair: 'customers.other_id_pair',
  customer_country_invalid: 'customers.country_invalid',
  /** الموافقةُ التسويقية (`ق-١٣٠٣` · ك/⑰A1). */
  consent_future_date: 'customers.consent_future_date',
  consent_unchanged: 'customers.consent_unchanged',
  // pos clearance gate (ق-١٢٦١ أ — ⑤A4)
  pos_clearance_required: 'pos.clearance_required',
  customer_has_invoices: 'customers.has_invoices',
  customer_has_contracts: 'customers.has_contracts',
  customer_in_trash: 'customers.in_trash',
  customer_same_name_exists: 'customers.same_name_exists',
  customer_same_name_in_trash: 'customers.same_name_in_trash',
  customer_archived_cannot_link: 'customers.archived_cannot_link',
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
  unit_code_required: 'products.unit_code_required',
  unit_code_unknown: 'products.unit_code_unknown',
  expiry_tracked_required: 'products.expiry_tracked_required',
  // ⑧ فئةُ ضريبة القيمة المضافة — على الصنف وعلى سطرٍ بلا صنف (ق-١٢١١ · ق-١٢١٢ · ق-١٢٢٢)
  tax_category_required: 'vat.category_required',
  tax_category_unknown: 'vat.category_unknown',
  tax_reason_code_required: 'vat.reason_code_required',
  tax_reason_code_unknown: 'vat.reason_code_unknown',
  tax_reason_code_mismatch: 'vat.reason_code_mismatch',
  tax_reason_code_unsupported: 'vat.reason_code_unsupported',
  tax_reason_forbidden_on_standard: 'vat.reason_forbidden_on_standard',
  tax_reason_text_required: 'vat.reason_text_required',
  tax_reason_text_length: 'vat.reason_text_length',
  tax_reason_text_forbidden: 'vat.reason_text_forbidden',
  line_tax_category_required: 'vat.line_category_required',
  line_tax_rate_conflict: 'vat.line_rate_conflict',
  line_legacy_zero_needs_category: 'vat.line_legacy_zero_needs_category',
  zatca_legacy_zero_unstampable: 'zatca.legacy_zero_unstampable',
  zatca_reason_missing: 'zatca.reason_missing',
  batch_required: 'inventory.batch_required',
  batch_expiry_required: 'inventory.batch_expiry_required',
  batch_expiry_conflict: 'inventory.batch_expiry_conflict',
  expired_stock_sale_refused: 'inventory.expired_stock_sale_refused',
  warehouse_not_found: 'warehouses.not_found',
  warehouse_has_movements: 'warehouses.has_movements',
  destination_warehouse_required: 'inventory.destination_required',
  destination_warehouse_not_found: 'inventory.destination_not_found',
  destination_same_as_source: 'inventory.destination_same_as_source',
  movement_not_found: 'inventory.movement_not_found',
  quantity_must_be_positive: 'inventory.quantity_must_be_positive',
  adjustment_cannot_be_zero: 'inventory.adjustment_cannot_be_zero',
  unit_cost_required: 'inventory.unit_cost_required',
  movement_is_reversal: 'inventory.movement_is_reversal',
  movement_already_reversed: 'inventory.movement_already_reversed',
  movement_has_document: 'inventory.movement_has_document',
  movement_layer_consumed: 'inventory.movement_layer_consumed',

  // employees / banks
  employee_not_found: 'employees.not_found',
  identity_identifier_invalid: 'identity.identifier_invalid',
  identity_iban_invalid: 'identity.iban_invalid',
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
  // bank reconciliation (ق-١٢٦١ ج)
  bank_reconciled_locked: 'banks.reconciled_locked',
  reconciliation_already_matched: 'reconciliation.already_matched',
  reconciliation_not_matched: 'reconciliation.not_matched',
  reconciliation_line_not_found: 'reconciliation.line_not_found',
  reconciliation_line_taken: 'reconciliation.line_taken',
  reconciliation_amount_mismatch: 'reconciliation.amount_mismatch',
  reconciliation_counterparty_is_bank: 'reconciliation.counterparty_is_bank',
  reconciliation_pending_lines: 'reconciliation.pending_lines',
  reconciliation_close_backwards: 'reconciliation.close_backwards',
  reconciliation_locked: 'reconciliation.locked',
  reconciliation_deposit_amount: 'reconciliation.deposit_amount',
  // cash deposits (ق-١٢٦١ ج — ⑦A3)
  cash_deposit_not_found: 'cash_deposits.not_found',
  cash_deposit_amount_positive: 'cash_deposits.amount_positive',
  cash_deposit_exceeds_drawer: 'cash_deposits.exceeds_drawer',
  cash_deposit_not_voidable: 'cash_deposits.not_voidable',
  cash_deposit_not_in_transit: 'cash_deposits.not_in_transit',
  // network settlements (ق-١٢٦١ ج — ⑦A2)
  network_settlement_not_found: 'network_settlements.not_found',
  network_settlement_nothing_open: 'network_settlements.nothing_open',
  network_settlement_receipt_not_open: 'network_settlements.receipt_not_open',
  network_settlement_fee_exceeds_gross: 'network_settlements.fee_exceeds_gross',
  network_settlement_fee_negative: 'network_settlements.fee_negative',
  network_settlement_period_backwards: 'network_settlements.period_backwards',
  network_settlement_bank_currency: 'network_settlements.bank_currency',
  network_settlement_not_voidable: 'network_settlements.not_voidable',
  network_settlement_matched: 'network_settlements.matched',
  payment_card_no_bank: 'payments.card_no_bank',
  // prepayment invoice (ق-١٢٦١ ب — ④A1)
  payment_unallocated_choice_required: 'payments.unallocated_choice_required',
  payment_on_account_uncovered: 'payments.on_account_uncovered',
  payment_has_prepayment_invoice: 'payments.has_prepayment_invoice',
  prepayment_immutable: 'invoices.prepayment_immutable',
  prepayment_note_unsupported: 'invoices.prepayment_note_unsupported',
  prepayment_amount_positive: 'invoices.prepayment_amount_positive',
  payment_prepayment_tax_required: 'payments.prepayment_tax_required',
  prepayment_not_found: 'invoices.prepayment_not_found',
  prepayment_other_customer: 'invoices.prepayment_other_customer',
  prepayment_already_applied: 'invoices.prepayment_already_applied',
  prepayment_exceeds_invoice: 'invoices.prepayment_exceeds_invoice',

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
  contract_cancelled_no_payment: 'contracts.cancelled_no_payment',
  installment_cancelled_no_payment: 'contracts.installment_cancelled_no_payment',
  contract_already_renewed: 'contracts.already_renewed',
  contract_no_taken: 'contracts.no_taken',
  contract_party_locked_after_posting: 'contracts.party_locked_after_posting',
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
  rent_accrual_period_locked: 'contracts.rent_accrual_period_locked',

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
  /** ق-١٣٦٨ — إقليمُ المنشأة عند ميلادها. */
  region_required: 'companies.region_required',
  region_unsupported: 'companies.region_unsupported',
  template_not_found: 'templates.not_found',
  /** مفاتيحُ الأنظمة (`ق-١٢٩١` · ي/⑫A3). */
  api_key_invalid: 'apiKeys.invalid',
  api_key_not_found: 'apiKeys.not_found',
  api_key_template_too_wide: 'apiKeys.template_too_wide',
  api_key_name_required: 'apiKeys.name_required',
  /** حصّةُ نداءات التكامل (`ق-١٢٩١` · ي/㉑A1). */
  integration_quota_exceeded: 'integrations.quota_exceeded',
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
  screen_undeclared: 'common.screen_undeclared',
  support_grant_not_yours: 'support.grant_not_yours',
  company_user_not_found: 'companyUsers.not_found',
  company_users_owner_only: 'companyUsers.owner_only',
  company_profile_owner_only: 'companyProfile.owner_only',
  /** معرّفُ النطاق الفرعيّ (`ق-١٣٠٣` · ك/⑬A2). */
  slug_invalid: 'companyProfile.slug_invalid',
  slug_taken: 'companyProfile.slug_taken',
  slug_reserved: 'companyProfile.slug_reserved',
  slug_not_cleared: 'companyProfile.slug_not_cleared',

  // zatca
  zatca_profile_incomplete: 'zatca.profile_incomplete',
  zatca_buyer_address_incomplete: 'zatca.buyer_address_incomplete',
  zatca_buyer_id_missing: 'zatca.buyer_id_missing',
  // export flag (ق-١٢٦١ ب — ⑤A3)
  zatca_export_buyer_vat: 'zatca.export_buyer_vat',
  customer_foreign_vat_conflict: 'customers.foreign_vat_conflict',
  zatca_onboarding_not_started: 'zatca.onboarding_not_started',
  zatca_already_onboarded: 'zatca.already_onboarded',
  zatca_qr_value_too_long: 'zatca.qr_value_too_long',
  zatca_compliance_required: 'zatca.compliance_required',
  zatca_not_onboarded: 'zatca.not_onboarded',
  zatca_already_cleared: 'zatca.already_cleared',
  zatca_stamp_in_progress: 'zatca.stamp_in_progress',
  zatca_previous_unstamped: 'zatca.previous_unstamped',
  zatca_not_stamped: 'zatca.not_stamped',
  /** ⚖️ سقوطُ المحاولة ليس جواباً من الهيئة (`ق-٩٧١`): يُرمى فيعود الطابور، ولا يُكتب `REJECTED`. */
  zatca_attempt_failed: 'zatca.attempt_failed',
  // chain integrity. Deletion is refused for any document that took a place
  // in the sequence; editing is refused only once the authority has accepted
  // it (or may be about to) — see InvoicesService.
  /** ⚖️ الصادرُ لا يُعدَّل ولا يُحذف — مختومةً كانت أو لا (`ق-٩٤٣`)، ورسالةٌ واحدةٌ للجميع تسمّي المخرج (`ق-٩٥٠` · `ق-٢٦٥`). */
  invoice_issued_locked: 'invoices.issued_locked',
  /** ⚖️ المردودةُ تُغلق ولا تُمسّ ويُصدَر بدلاً منها جديد (`ق-٩٥٨`) — والمنعُ بالشكل: لا إعادةَ ولا ادّعاءَ ولا إشعارَ عليها (`ق-٩٦٤`). */
  invoice_replacement_only_rejected: 'invoices.replacement_only_rejected',
  invoice_already_replaced: 'invoices.already_replaced',
  zatca_rejected_not_resubmittable: 'zatca.rejected_not_resubmittable',
  credit_note_target_rejected: 'creditNotes.target_rejected',

  // credit/debit notes
  credit_note_target_invalid: 'creditNotes.target_invalid',
  credit_note_exceeds_remaining: 'creditNotes.exceeds_remaining',
  credit_note_immutable: 'creditNotes.immutable',
  supplier_note_target_invalid: 'supplierNotes.target_invalid',
  supplier_note_exceeds_remaining: 'supplierNotes.exceeds_remaining',
  purchase_has_notes: 'purchases.has_notes',
  supplier_return_line_not_original: 'supplierNotes.return_line_not_original',
  supplier_return_exceeds_received: 'supplierNotes.return_exceeds_received',
  supplier_return_exceeds_stock: 'supplierNotes.return_exceeds_stock',
  supplier_note_debit_no_goods: 'supplierNotes.debit_no_goods',
  supplier_note_immutable: 'supplierNotes.immutable',
  purchase_frozen_after_consumption: 'purchases.frozen_after_consumption',
  purchase_voided: 'purchases.voided',
  purchase_void_consumed: 'purchases.void_consumed',
  supplier_note_target_voided: 'supplierNotes.target_voided',

  // ٢٥ الاستلامُ المستقلّ (ق-١١٣١)
  purchase_lines_frozen_after_receipt: 'purchases.lines_frozen_after_receipt',
  goods_receipt_not_found: 'goodsReceipts.not_found',
  goods_receipt_voided: 'goodsReceipts.voided',
  goods_receipt_on_note: 'goodsReceipts.on_note',
  goods_receipt_line_repeated: 'goodsReceipts.line_repeated',
  goods_receipt_line_not_of_purchase: 'goodsReceipts.line_not_of_purchase',
  goods_receipt_line_not_stocked: 'goodsReceipts.line_not_stocked',
  goods_receipt_exceeds_remaining: 'goodsReceipts.exceeds_remaining',
  goods_receipt_migration_missing: 'goodsReceipts.migration_missing',
  receipt_clearing_account_type_conflict: 'goodsReceipts.clearing_account_type_conflict',
  receipt_clearing_code_range_full: 'goodsReceipts.clearing_code_range_full',
  supplier_note_line_not_received: 'supplierNotes.line_not_received',
  supplier_note_line_multi_receipt: 'supplierNotes.line_multi_receipt',

  // ٧ التكاليفُ المحمَّلة (ق-١١٤٥) — كلُّ رفضٍ مسمّىً: التاجر يعرف لماذا
  landed_cost_not_found: 'landedCosts.not_found',
  landed_cost_voided: 'landedCosts.voided',
  landed_cost_on_note: 'landedCosts.on_note',
  landed_cost_purchase_not_posted: 'landedCosts.purchase_not_posted',
  landed_cost_line_not_of_purchase: 'landedCosts.line_not_of_purchase',
  landed_cost_line_not_service: 'landedCosts.line_not_service',
  landed_cost_line_zero: 'landedCosts.line_zero',
  landed_cost_line_already_distributed: 'landedCosts.line_already_distributed',
  landed_cost_no_layers: 'landedCosts.no_layers',
  landed_cost_layer_repeated: 'landedCosts.layer_repeated',
  landed_cost_layer_not_receipt: 'landedCosts.layer_not_receipt',
  landed_cost_layer_changed: 'landedCosts.layer_changed',
  non_deductible_vat_layer_changed: 'purchases.non_deductible_vat_layer_changed',
  supplier_note_layer_changed: 'purchases.supplier_note_layer_changed',
  landed_cost_manual_sum_mismatch: 'landedCosts.manual_sum_mismatch',
  landed_cost_manual_lines_required: 'landedCosts.manual_lines_required',
  landed_cost_void_after_consumption: 'landedCosts.void_after_consumption',
  purchase_frozen_by_landed_costs: 'purchases.frozen_by_landed_costs',
  goods_receipt_void_with_landed_cost: 'goodsReceipts.void_with_landed_cost',

  // ٣٠ الأرصدةُ الافتتاحية بالطبقات (ق-١١٧٧ · ق-١١٧٩)
  stock_opening_not_found: 'stockOpenings.not_found',
  stock_opening_lines_required: 'stockOpenings.lines_required',
  stock_opening_date_mismatch: 'stockOpenings.date_mismatch',
  stock_opening_acquired_after_opening: 'stockOpenings.acquired_after_opening',
  stock_opening_after_movement: 'stockOpenings.after_movement',
  stock_opening_line_not_found: 'stockOpenings.line_not_found',
  stock_opening_line_voided: 'stockOpenings.line_voided',
  stock_opening_line_consumed: 'stockOpenings.line_consumed',
  account_opening_inventory_via_stock: 'accounts.opening_inventory_via_stock',

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
  fiscal_year_span_out_of_range: 'fiscal.year_span_out_of_range',
  fiscal_no_period_for_date: 'fiscal.no_period_for_date',
  fiscal_period_closed: 'fiscal.period_closed',
  fiscal_year_has_closed_period: 'fiscal.year_has_closed_period',
  fiscal_year_close_needs_closed_periods: 'fiscal.year_close_needs_closed_periods',
  fiscal_year_already_closed: 'fiscal.year_already_closed',
  fiscal_year_nothing_to_close: 'fiscal.year_nothing_to_close',
  account_system_protected: 'account.system_protected',

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
  trash_retained_by_law: 'trash.retained_by_law',
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
  /** ⑥A2 (`ق-١٣٢٥`) — الفترةُ الضريبية: ربعٌ أو شهر، أحدُهما لا كلاهما. */
  vat_period_one_of: 'validation.vat_period_one_of',
  /** ⑥A1 (`ق-١٣٢٥`) — إسنادُ ضريبة المدخلات وإعلانُ نسبة الخصم النسبيّ. */
  input_vat_use_invalid: 'validation.input_vat_use_invalid',
  vat_ratio_range: 'validation.vat_ratio_range',
  vat_ratio_not_declared: 'obligations.vat_ratio_not_declared',
  /** ⑥A3 (`ق-١٣٢٥`) — تصحيحُ إقرارٍ سابق (م٦٣). */
  vat_correction_not_earlier: 'obligations.vat_correction_not_earlier',
  vat_correction_needs_notice: 'obligations.vat_correction_needs_notice',
  vat_correction_time_barred: 'obligations.vat_correction_time_barred',
  vat_correction_not_found: 'obligations.vat_correction_not_found',
  vat_correction_filed_locked: 'obligations.vat_correction_filed_locked',
  vat_period_quarter_range: 'validation.vat_period_quarter_range',
  vat_period_month_range: 'validation.vat_period_month_range',
  vat_number_invalid: 'validation.vat_number',
  cr_number_invalid: 'validation.cr_number',
  postal_code_invalid: 'validation.postal_code',
  additional_number_invalid: 'validation.additional_number_invalid',
  email_invalid: 'validation.email',
  legal_name_required: 'validation.legal_name_required',
  legal_name_too_long_for_qr: 'validation.legal_name_too_long_for_qr',
  file_key_required: 'validation.file_key_required',
  page_size_without_page: 'validation.page_size_without_page',
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
  [MSG.platform_role_denied]: {
    ar: 'هذا الإجراء خارج دورك في المنصّة ({role}) — اطلبه ممن يملكه',
    en: 'This action is outside your platform role ({role}) — ask whoever holds it',
  },
  [MSG.decision_summary_required]: { ar: 'اكتب ملخّص الأثر — فالمُقرّ يوافق على ما يقرأ', en: 'Write a summary of the effect — the approver agrees to what they read' },
  [MSG.decision_already_open]: { ar: 'يوجد قرار قائم على هذا الهدف بالفعل ({status})', en: 'A decision on this target is already open ({status})' },
  [MSG.decision_not_found]: { ar: 'القرار غير موجود', en: 'Decision not found' },
  [MSG.decision_not_pending]: { ar: 'القرار لم يعد معلّقاً ({status})', en: 'The decision is no longer pending ({status})' },
  [MSG.decision_same_hand]: {
    ar: 'من طلب القرار لا يُقرّه — الفعل الحرج بيدين لا بيد',
    en: 'Whoever requested the decision cannot approve it — a critical action takes two hands',
  },
  [MSG.decision_required]: {
    ar: 'هذا الإجراء ({action}) يحتاج قراراً مُقرّاً من مدير منصّة آخر قبل تنفيذه',
    en: 'This action ({action}) needs a decision approved by another platform administrator first',
  },
  [MSG.mfa_already_enrolled]: { ar: 'المصادقة المتعددة مفعّلة على هذا الحساب بالفعل', en: 'Multi-factor authentication is already enabled on this account' },
  [MSG.mfa_not_started]: { ar: 'ابدأ التفعيل أولاً للحصول على المفتاح', en: 'Start enrolment first to obtain the key' },
  // ⚠️ **رسالةٌ واحدة للحالتين**: تمييزُ «الرمز خاطئ» عن «رمز الاسترداد مستهلَك» يُعلّم المهاجمَ أكثر من صاحب الحساب.
  [MSG.mfa_code_invalid]: { ar: 'الرمز غير صحيح', en: 'Invalid code' },
  [MSG.mfa_required]: { ar: 'أدخل رمز المصادقة من تطبيق المصادقة أو أحد رموز الاسترداد', en: 'Enter the code from your authenticator app, or one of your recovery codes' },
  [MSG.mfa_enrolment_required]: {
    ar: 'المصادقة المتعددة إلزامية لحسابات المنصّة — فعّلها من إعدادات حسابك قبل الدخول',
    en: 'Multi-factor authentication is mandatory for platform accounts — enable it from your account settings first',
  },

  [MSG.ledger_filter_required]: {
    ar: 'دفتر الأستاذ يحتاج حساباً أو بُعداً (عقار · وحدة · عميل · مورّد) — بلا مرشّح هو ميزان المراجعة لا الأستاذ',
    en: 'The ledger needs an account or a dimension (property · unit · customer · supplier) — with no filter it is the trial balance, not a ledger',
  },
  [MSG.statement_party_required]: {
    ar: 'كشف الحساب يحتاج عميلاً أو مورّداً — واحداً منهما لا كليهما',
    en: 'The statement needs a customer or a supplier — one of them, not both',
  },
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
  [MSG.journal_posted_reverse_instead]: {
    ar: 'القيد {no} مرحَّل ولا يُحذف — التصحيح بقيدٍ عكسي في فترةٍ مفتوحة (عكس القيد)',
    en: 'Entry {no} is posted and cannot be deleted — correct it with a reversing entry in an open period (reverse the entry)',
  },
  [MSG.journal_auto_entry_not_reversible]: {
    ar: 'القيد {no} آلي يتبع مستنده — يُصحَّح من مستنده (إشعار أو إلغاء) لا بعكسه هنا',
    en: 'Entry {no} is automatic and follows its document — correct it from the document (note or void), not by reversing it here',
  },
  [MSG.journal_reversal_not_reversible]: {
    ar: 'القيد {no} قيدٌ عكسي — لا يُعكس؛ أعد القيد الأصلي قيداً جديداً إن لزم',
    en: 'Entry {no} is itself a reversing entry — it cannot be reversed; re-post the original as a new entry if needed',
  },
  [MSG.journal_already_reversed]: {
    ar: 'القيد {no} معكوسٌ سلفاً بالقيد {by}',
    en: 'Entry {no} has already been reversed by entry {by}',
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
  [MSG.invoice_line_discount_exceeds]: {
    ar: 'خصم البند {line} ({discount}) يفوق إجماليه ({gross}) — لا صافي سالب',
    en: 'The discount on line {line} ({discount}) exceeds its gross ({gross}) — no negative net',
  },
  [MSG.customer_kind_required]: {
    ar: 'صفة العميل مطلوبة: فرد، أو مؤسسة فردية، أو شخص اعتباري — هي ما يقرّر نوع الفاتورة',
    en: 'The customer kind is required: natural person, sole establishment, or legal person — it decides the invoice type',
  },
  [MSG.customer_kind_undeclared]: {
    ar: 'العميل «{customer}» سبق البناء ولم تُعلَن صفته — أعلنها من بطاقته (فرد · مؤسسة · شخص اعتباري) قبل إصدار مستند له',
    en: 'Customer "{customer}" predates this build and has no declared kind — declare it on the card (natural · establishment · legal person) before issuing a document',
  },
  [MSG.customer_other_id_scheme_invalid]: {
    ar: 'مخطّط المعرّف البديل غير معروف — المقبول: TIN · CRN · MOM · MLS · 700 · SAG · NAT · GCC · IQA · PAS · OTH',
    en: 'Unknown buyer identification scheme — allowed: TIN · CRN · MOM · MLS · 700 · SAG · NAT · GCC · IQA · PAS · OTH',
  },
  [MSG.customer_other_id_invalid]: { ar: 'المعرّف البديل حروف وأرقام لاتينية فقط', en: 'The alternative identifier must be alphanumeric' },
  [MSG.customer_other_id_pair]: { ar: 'المعرّف البديل يُذكر مع مخطّطه معاً — أو يُتركان معاً', en: 'The alternative identifier and its scheme go together — or both are left empty' },
  [MSG.consent_future_date]: {
    ar: 'تاريخ الموافقة لا يكون في المستقبل — تُسجَّل الواقعة بعد وقوعها لا قبله',
    en: 'A consent date cannot be in the future — the event is recorded after it happens, not before',
  },
  [MSG.consent_unchanged]: {
    ar: 'الحالة الحالية لهذه القناة هي نفسها — ولا تُسجَّل واقعة لا تغيّر شيئاً',
    en: 'This channel is already in that state — an event that changes nothing is not recorded',
  },
  [MSG.customer_country_invalid]: { ar: 'رمز البلد حرفان لاتينيان كبيران (ISO 3166-1)', en: 'The country code is two uppercase letters (ISO 3166-1)' },
  [MSG.pos_clearance_required]: {
    ar: 'فاتورة ضريبية كاملة — المشتري مؤسسة أو شخص اعتباري أو مسجَّل في الضريبة — تُجاز لدى الهيئة قبل تسليمها؛ لا تُطبع من الكاشير، وتُسلَّم من شاشة الفواتير بعد الإجازة',
    en: 'Standard tax invoice — the buyer is an establishment, a legal person, or VAT-registered — it is cleared by the authority before delivery; not printed at the register, delivered from the invoices screen once cleared',
  },
  [MSG.payment_unallocated_choice_required]: {
    ar: 'في السند {remainder} فوق ما خُصِّص للفواتير — أعلن ما يكون: دفعةً مقدَّمة (تُصدَر لها فاتورة 386 اليوم) أو مبلغاً على الحساب',
    en: 'The receipt carries {remainder} beyond what was allocated to invoices — declare it: a prepayment (a 386 invoice is issued today) or an on-account amount',
  },
  [MSG.payment_on_account_uncovered]: {
    ar: 'لا فواتير مفتوحة تغطّي {remainder} (المفتوح بعد التخصيص: {open}) — مقبوضٌ قبل التوريد دفعةٌ مقدَّمة توجب فاتورة 386 (م٥٣)، فأعلنه كذلك',
    en: 'No open invoices cover {remainder} (open after allocation: {open}) — money received before supply is a prepayment and requires a 386 invoice (Art. 53); declare it as such',
  },
  [MSG.payment_has_prepayment_invoice]: {
    ar: 'السند أصدر فاتورة دفعة مقدَّمة {no} — لا يُعاد توزيعه ولا يُعكس؛ تصحيحه إشعار دائن على مستندها',
    en: 'This receipt issued prepayment invoice {no} — it cannot be re-allocated or reversed; correct it with a credit note on that document',
  },
  [MSG.prepayment_immutable]: { ar: 'فاتورة الدفعة المقدَّمة صادرة من سند قبضها ولا تُعدَّل — تصحيحها إشعار دائن عليها', en: 'A prepayment invoice is issued from its receipt and cannot be edited — correct it with a credit note' },
  [MSG.prepayment_note_unsupported]: { ar: 'الإشعار على فاتورة دفعة مقدَّمة لم يُبنَ بعد — حدٌّ معلَن', en: 'Notes on a prepayment invoice are not built yet — a declared limit' },
  [MSG.payment_prepayment_tax_required]: {
    ar: 'الدفعة المقدَّمة تحمل فئة ما يُدفع عنه — خاضع (S) أو صفر (Z) بسببه أو معفى (E) بسببه أو خارج النطاق (O) بسببه — تُعلَن ولا تُفترض',
    en: 'A prepayment carries the VAT category of what it is paid for — S, Z with its reason, E with its reason, or O with its reason — declared, never assumed',
  },
  [MSG.prepayment_amount_positive]: { ar: 'مبلغ الدفعة المقدَّمة يجب أن يكون موجباً', en: 'The prepayment amount must be positive' },
  [MSG.prepayment_not_found]: { ar: 'مستند الدفعة المقدَّمة غير موجود', en: 'Prepayment invoice not found' },
  [MSG.prepayment_other_customer]: { ar: 'الدفعة المقدَّمة {no} لعميلٍ آخر — لا تُطبَّق على فاتورة غيره', en: 'Prepayment {no} belongs to another customer — it cannot be applied to this invoice' },
  [MSG.prepayment_already_applied]: { ar: 'الدفعة المقدَّمة {no} طُبِّقت من قبل على فاتورة', en: 'Prepayment {no} has already been applied to an invoice' },
  [MSG.prepayment_exceeds_invoice]: {
    ar: 'الدفعات المقدَّمة المطبَّقة ({applied}) تفوق إجمالي الفاتورة ({total}) عند {no} — أصدر فاتورة بقيمة الدفعات أو اترك ما زاد لفاتورة تالية',
    en: 'Applied prepayments ({applied}) exceed the invoice total ({total}) at {no} — invoice the full prepaid amount or leave the excess for a later invoice',
  },
  [MSG.customer_has_invoices]: {
    ar: 'لا يمكن حذف عميل مرتبط بفواتير — احذف فواتيره أولاً',
    en: 'Cannot delete a customer that has invoices — delete their invoices first',
  },
  [MSG.customer_has_contracts]: {
    ar: 'لا يمكن حذف عميلٍ له عقودُ إيجار — ولو مُلغاة، فقيودُها منسوبةٌ إليه — أرشِفه بدل حذفه',
    en: 'Cannot delete a customer that has lease contracts — even cancelled ones keep their entries under that customer — archive the customer instead',
  },
  [MSG.customer_in_trash]: {
    ar: 'يوجد عميلٌ بهذا الاسم أو الرقم الضريبي في سلة المحذوفات — استعِده من السلة أو اختر اسماً آخر',
    en: 'A customer with this name or VAT number is in the trash — restore it from the trash or choose another name',
  },
  [MSG.customer_same_name_exists]: {
    ar: 'يوجد عميلٌ بهذا الاسم — أهو نفسُه؟ اختره من القائمة، أو أكِّد الإنشاء إن كان شخصاً آخر بالاسم نفسِه',
    en: 'A customer with this name already exists — is it the same one? Pick it from the list, or confirm creation if this is a different person with the same name',
  },
  [MSG.customer_same_name_in_trash]: {
    ar: 'يوجد عميلٌ بهذا الاسم في سلة المحذوفات — استعِده من السلة، أو أكِّد إنشاءَ عميلٍ آخر بالاسم نفسِه',
    en: 'A customer with this name is in the trash — restore it, or confirm creating another customer with the same name',
  },
  [MSG.customer_archived_cannot_link]: {
    ar: 'العميلُ مؤرشَف — أعِد تفعيله من شاشة العملاء قبل ربط عقدٍ به',
    en: 'This customer is archived — unarchive them on the customers screen before linking a contract',
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
  [MSG.unit_code_required]: { ar: 'وحدة القياس مطلوبة — تُعلَن من القائمة ولا تُفترض', en: 'Unit of measure is required — declare it from the list; none is assumed' },
  [MSG.unit_code_unknown]: { ar: 'وحدة القياس ليست من القائمة المعتمدة (رموز UN/ECE Rec 20)', en: 'Unit of measure is not in the approved list (UN/ECE Rec 20 codes)' },
  [MSG.expiry_tracked_required]: { ar: 'إعلانُ التتبّع بالدفعة والانتهاء مطلوب — يُعلَن على البطاقة (نعم أو لا) ولا يُخمَّن', en: 'Batch-and-expiry tracking must be declared on the product (yes or no) — it is not assumed' },
  [MSG.tax_category_required]: { ar: 'فئةُ ضريبة القيمة المضافة مطلوبة — تُعلَن (خاضع · نسبة الصفر · معفى · خارج النطاق) ولا تُخمَّن', en: 'The VAT category is required — declare it (standard, zero-rated, exempt or out of scope); none is assumed' },
  [MSG.tax_category_unknown]: { ar: 'فئةُ الضريبة ليست من الفئات المعتمدة (S · Z · E · O)', en: 'The VAT category is not one of the approved categories (S · Z · E · O)' },
  [MSG.tax_reason_code_required]: { ar: 'فئةُ نسبة الصفر أو المعفى تحتاج سببَ الإعفاء من قائمة الهيئة', en: 'A zero-rated or exempt category requires an exemption reason from the authority list' },
  [MSG.tax_reason_code_unknown]: { ar: 'رمزُ سبب الإعفاء ليس من قائمة الهيئة (معيار XML §11.2.4)', en: 'The exemption reason code is not in the authority list (XML standard §11.2.4)' },
  [MSG.tax_reason_code_mismatch]: { ar: 'رمزُ سبب الإعفاء لا يتبع هذه الفئة', en: 'The exemption reason code does not belong to this category' },
  [MSG.tax_reason_code_unsupported]: { ar: 'الفئاتُ التابعة للمشتري (الخدمات الصحية والتعليمية للمواطنين) غيرُ مدعومة بعد — تتبع هويّةَ المشتري لا الصنف', en: 'Buyer-dependent categories (private healthcare and education for citizens) are not supported yet — they follow the buyer, not the product' },
  [MSG.tax_reason_forbidden_on_standard]: { ar: 'الفئةُ الخاضعة لا تحمل سببَ إعفاء', en: 'The standard-rated category carries no exemption reason' },
  [MSG.tax_reason_text_required]: { ar: 'فئةُ «خارج النطاق» تحتاج سببها نصّاً — يخرج للهيئة على كل حالة', en: 'The out-of-scope category requires its reason as text — it is reported to the authority case by case' },
  [MSG.tax_reason_text_length]: { ar: 'سببُ «خارج النطاق» من ٣ إلى ٢٥٠ حرفاً بعد قصّ الأطراف — لا فراغَ ولا مسافاتٍ وحدَها', en: 'The out-of-scope reason must be 3 to 250 characters after trimming — not empty, not whitespace only' },
  [MSG.tax_reason_text_forbidden]: { ar: 'نصُّ السبب يُكتب لفئة «خارج النطاق» وحدَها — ولغيرها يُشتقّ من رمزه', en: 'Free-text reason is for the out-of-scope category only — other categories derive it from the code' },
  [MSG.line_tax_category_required]: { ar: 'بندٌ بلا صنف يُلزَم بفئة الضريبة وسببها — نسبةٌ صفرٌ بلا فئةٍ غامضةٌ بين نسبة الصفر والمعفى وخارج النطاق', en: 'A line without a product must declare its VAT category and reason — a zero rate without a category is ambiguous between zero-rated, exempt and out of scope' },
  [MSG.line_tax_rate_conflict]: { ar: 'النسبةُ المرسَلة تخالف فئةَ الضريبة المعلَنة — النسبةُ تُشتقّ من الفئة ولا تُدخَل', en: 'The submitted rate contradicts the declared VAT category — the rate is derived from the category, not entered' },
  [MSG.line_legacy_zero_needs_category]: { ar: 'بندٌ قديم بنسبة صفرٍ بلا فئةٍ معلَنة لا يُنسخ إلى مستندٍ جديد — أعلن فئتَه أولاً (نسبة الصفر · معفى · خارج النطاق)', en: 'A legacy zero-rate line without a declared category cannot be copied into a new document — declare its category first (zero-rated, exempt or out of scope)' },
  [MSG.zatca_legacy_zero_unstampable]: { ar: 'الفاتورة تحمل بنداً قديماً بصفرٍ بلا فئةٍ معلَنة — لا تُختم؛ تُصحَّح بإشعارٍ ومستندٍ جديد بفئةٍ معلَنة', en: 'The invoice carries a legacy zero-rate line with no declared category — it cannot be stamped; correct it with a note and a new document that declares the category' },
  [MSG.zatca_reason_missing]: { ar: 'بندٌ بفئة نسبة الصفر أو المعفى أو خارج النطاق بلا سبب إعفاء — لا يُختم (BR-KSA-CL-04)', en: 'A zero-rated, exempt or out-of-scope line has no exemption reason — it cannot be stamped (BR-KSA-CL-04)' },
  [MSG.batch_required]: { ar: 'الصنف معلَنٌ تتبّعُه بالدفعة والانتهاء — لا يُستلم بلا رقم دفعةٍ وتاريخ انتهاء، فلم يُكتب شيء؛ أدخلهما أو أعلن على البطاقة أنه لا يُتتبَّع', en: 'This product is declared batch-and-expiry tracked — it is not received without a batch number and an expiry date; nothing was written. Enter both, or declare on the product that it is not tracked' },
  [MSG.batch_expiry_required]: { ar: 'رقم الدفعة بلا تاريخ انتهاء — الدفعة تُعلَن بانتهائها', en: 'A batch number without an expiry date — a batch is declared with its expiry' },
  [MSG.batch_expiry_conflict]: { ar: 'رقم الدفعة {batchNo} قائمٌ لهذا الصنف بتاريخ انتهاءٍ آخر ({existing}) — الدفعةُ هويّةٌ لا يتغيّر انتهاؤها، فلم يُكتب شيء؛ صحّح الرقم، أو صحّح الدفعة القائمة بحركةٍ لا بتعديل', en: 'Batch {batchNo} already exists for this product with another expiry ({existing}) — a batch is an identity whose expiry does not change; nothing was written. Correct the number, or correct the existing batch with a movement, not an edit' },
  [MSG.expired_stock_sale_refused]: { ar: 'لا يُباع من دفعةٍ منتهية: المتبقّي غير المنتهي من «{product}» {available} والمطلوب {requested} — المنتهي يُشطب أو يُعاد إلى المورّد', en: 'Expired stock is not sold: unexpired remaining of "{product}" is {available}, requested {requested} — expired stock is written off or returned to the supplier' },
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
  [MSG.unit_cost_required]: { ar: 'تكلفة الوحدة مطلوبة للإدخال اليدوي — لا تؤخذ من بطاقة الصنف', en: 'Unit cost is required for manual stock entry — it is not taken from the product card' },
  [MSG.movement_is_reversal]: { ar: 'هذه الحركة عكسٌ لحركةٍ أخرى — لا يُعكَس العكس، والتصحيح بحركةٍ جديدة', en: 'This movement is itself a reversal — reversals are not reversed; correct with a new movement' },
  [MSG.movement_already_reversed]: { ar: 'عُكست هذه الحركة من قبل — ولا تُعكَس مرّتين', en: 'This movement has already been reversed' },
  [MSG.movement_has_document]: { ar: 'الحركة لها مستند (بيع أو استلام أو شطب) — تُعكَس من مستندها لا من هنا', en: 'This movement belongs to a document (sale, receipt or write-off) — reverse it from its document' },
  [MSG.movement_layer_consumed]: { ar: 'طبقة هذه الحركة استُهلك منها — لا تُعكَس، والتصحيح بحركةٍ جديدة', en: 'The cost layer of this movement has been consumed — it cannot be reversed; correct with a new movement' },

  [MSG.employee_not_found]: { ar: 'الموظف غير موجود', en: 'Employee not found' },
  [MSG.identity_identifier_invalid]: { ar: 'المعرّف غير صالح — حروفٌ لاتينية وأرقامٌ حتى ٣٢، والمسافاتُ والشرطاتُ تُحذف', en: 'Invalid identifier — Latin letters and digits, up to 32; spaces and dashes are removed' },
  [MSG.identity_iban_invalid]: { ar: 'الآيبان غير صالح بالمعيار الدولي (رمزُ دولةٍ ورقما تحقّقٍ لا يطابقان الحساب)', en: 'Invalid IBAN under the international standard (country code and check digits do not match the account)' },
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
  [MSG.bank_reconciled_locked]: {
    ar: 'حساب البنك «{bank}» مُسوّى حتى {until} — لا يُقيَّد عليه بتاريخٍ قبل ذلك؛ التصحيح بقيدٍ بعد تاريخ الإقفال أو بإعادة فتح التسوية',
    en: 'Bank "{bank}" is reconciled through {until} — no entry may be dated on or before it; correct with a later-dated entry or reopen the reconciliation',
  },
  [MSG.reconciliation_already_matched]: { ar: 'سطر الكشف مطابَق بالفعل — فكّ المطابقة أولاً', en: 'This statement line is already matched — unmatch it first' },
  [MSG.reconciliation_not_matched]: { ar: 'سطر الكشف غير مطابَق', en: 'This statement line is not matched' },
  [MSG.reconciliation_line_not_found]: { ar: 'سطر الدفتر غير موجود على حساب هذا البنك', en: 'Ledger line not found on this bank account' },
  [MSG.reconciliation_line_taken]: { ar: 'سطر الدفتر مطابَق بسطر كشفٍ آخر', en: 'This ledger line is already matched to another statement line' },
  [MSG.reconciliation_amount_mismatch]: {
    ar: 'المبلغان لا يتطابقان: الكشف {statement} والدفتر {ledger} — المطابقة واحدٌ لواحد بمبلغٍ مساوٍ',
    en: 'Amounts differ: statement {statement} vs ledger {ledger} — matching is one-to-one with equal amounts',
  },
  [MSG.reconciliation_counterparty_is_bank]: { ar: 'الطرف المقابل لا يكون حساب البنك نفسه', en: 'The counterparty cannot be the bank account itself' },
  [MSG.reconciliation_pending_lines]: {
    ar: 'لا يُقفل الكشف حتى {until}: {count} سطر كشفٍ معلَّق قبل هذا التاريخ — طابِقه أو رحِّله أولاً',
    en: 'Cannot close through {until}: {count} statement line(s) before that date are still unmatched — match or post them first',
  },
  [MSG.reconciliation_close_backwards]: { ar: 'تاريخ الإقفال لا يرجع إلى ما قبل الإقفال القائم — أعد الفتح أولاً', en: 'The close date cannot move backwards — reopen first' },
  [MSG.reconciliation_locked]: { ar: 'الكشف مُسوّى حتى {until} — لا مطابقة ولا فكّ قبل هذا التاريخ', en: 'Reconciled through {until} — no matching or unmatching before that date' },
  [MSG.reconciliation_deposit_amount]: {
    ar: 'سطر الكشف ({statement}) لا يساوي مبلغ الإيداع {no} ({deposit}) — تأكيد الإيداع يكون بسطرٍ بمبلغه',
    en: 'Statement line ({statement}) does not equal deposit {no} ({deposit}) — a deposit is confirmed by a line of its exact amount',
  },
  [MSG.cash_deposit_not_found]: { ar: 'مستند الإيداع غير موجود', en: 'Cash deposit not found' },
  [MSG.cash_deposit_amount_positive]: { ar: 'مبلغ الإيداع يجب أن يكون موجباً', en: 'The deposit amount must be positive' },
  [MSG.cash_deposit_exceeds_drawer]: {
    ar: 'الدرج «{drawer}» يحمل {available} بالدفتر — لا يُودَع منه {amount}',
    en: 'Drawer "{drawer}" holds {available} on the books — {amount} cannot be deposited from it',
  },
  [MSG.cash_deposit_not_voidable]: { ar: 'لا يُلغى إلا إيداعٌ في الطريق — المؤكَّد رآه كشف البنك', en: 'Only an in-transit deposit can be voided — a confirmed one was seen on the bank statement' },
  [MSG.cash_deposit_not_in_transit]: { ar: 'مستند الإيداع ليس في الطريق — لا يُؤكَّد', en: 'This deposit is not in transit — it cannot be confirmed' },
  [MSG.network_settlement_not_found]: { ar: 'تسوية الشبكة غير موجودة', en: 'Network settlement not found' },
  [MSG.network_settlement_nothing_open]: {
    ar: 'لا سندات قبضٍ بالشبكة مفتوحة في هذا المدى — لا شيء يُسوّى',
    en: 'No open network receipts in this period — nothing to settle',
  },
  [MSG.network_settlement_receipt_not_open]: {
    ar: '{count} من السندات المسمّاة ليس مفتوحاً في المدى (طُولب به من قبل، أو خارج المدى، أو ليس بالشبكة)',
    en: '{count} of the named receipts is not open in the period (already settled, outside the period, or not a network receipt)',
  },
  [MSG.network_settlement_fee_exceeds_gross]: {
    ar: 'العمولة وضريبتها ({fee}) تستهلك إجمالي التحصيل ({gross}) أو تفوقه — لا صافي يدخل البنك',
    en: 'The fee and its VAT ({fee}) consume or exceed the gross ({gross}) — nothing would reach the bank',
  },
  [MSG.network_settlement_fee_negative]: { ar: 'العمولة وضريبتها لا تكونان سالبتين', en: 'The fee and its VAT cannot be negative' },
  [MSG.network_settlement_period_backwards]: { ar: 'نهاية المدى قبل بدايته', en: 'The period ends before it starts' },
  [MSG.network_settlement_bank_currency]: {
    ar: 'البنك «{bank}» بعملة {currency} — تسوية الشبكة تُرحَّل إلى بنكٍ بالعملة الأساسية',
    en: 'Bank "{bank}" is in {currency} — a network settlement is posted to a base-currency bank',
  },
  [MSG.network_settlement_not_voidable]: { ar: 'لا تُلغى إلا تسويةٌ مرحَّلة — هذه مُلغاة من قبل', en: 'Only a posted settlement can be voided — this one is already void' },
  [MSG.network_settlement_matched]: {
    ar: 'التسوية {no} طابقها كشفُ البنك — فُكّ المطابقة من التسوية البنكية قبل إلغائها',
    en: 'Settlement {no} is matched by the bank statement — unmatch it in the bank reconciliation before voiding',
  },
  [MSG.payment_card_no_bank]: {
    ar: 'مقبوض الشبكة يُقيَّد على مدينو شبكة المدفوعات (1251) حتى يحوّله المستحوذ — لا يُختار له بنك',
    en: 'A network receipt is posted to network receivables (1251) until the acquirer settles it — no bank is chosen for it',
  },
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
  [MSG.contract_cancelled_no_payment]: { ar: 'لا يُقبض على عقدٍ ملغى — سُوّي عند إلغائه، وما يُقبض بعده سندٌ على الحساب أو إيرادٌ آخر', en: 'No receipt on a cancelled contract — it was settled at cancellation; anything received afterwards is an on-account receipt or other income' },
  [MSG.installment_cancelled_no_payment]: { ar: 'القسطُ ملغى — أُسقط عند إلغاء العقد فلا يُقبض عليه', en: 'The installment is cancelled — it was dropped at cancellation, nothing is receivable against it' },
  [MSG.contract_party_locked_after_posting]: {
    ar: 'لا يُغيَّر طرفُ العقد بعد أوّل ترحيل — ذمّتُه وقيودُه منسوبةٌ إليه؛ أنهِ هذا العقدَ وأنشئ عقداً جديداً باسم الطرف الصحيح',
    en: 'The contract party cannot change after the first posting — its receivable and entries are attributed to it; end this contract and create a new one for the right party',
  },
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
  [MSG.rent_accrual_period_locked]: {
    ar: 'لا يمكن قبض هذه الدفعة: استحقاقُ القسط يقع في فترةٍ مقفلة — افتح الفترة أو قيّد الاستحقاق بقيدٍ عكسيّ في فترةٍ مفتوحة',
    en: 'This payment cannot be recorded: the installment accrues inside a closed period — reopen it, or post the accrual in an open period',
  },

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
  [MSG.region_required]: {
    ar: 'اختر دولة المنشأة — المنصّة تخدم أكثر من دولة، فلا تُفترض دولةٌ لم تُعلَن',
    en: 'Choose the company country — the platform serves more than one, so none is assumed',
  },
  [MSG.region_unsupported]: { ar: 'الدولة "{country}" لا تخدمها المنصّة بعد', en: 'The platform does not serve "{country}" yet' },
  [MSG.template_not_found]: { ar: 'القالب غير موجود', en: 'Permission template not found' },
  [MSG.api_key_invalid]: { ar: 'مفتاح النظام غير صالح أو مُبطَل', en: 'API key is invalid or revoked' },
  [MSG.api_key_not_found]: { ar: 'مفتاح النظام غير موجود', en: 'API key not found' },
  [MSG.api_key_template_too_wide]: {
    ar: 'لا يُنشأ مفتاح نظام بقالب يفتح كل الشاشات — اختر قالباً يحصر ما يحتاجه التكامل',
    en: 'An API key cannot use an all-screens template — pick one scoped to what the integration needs',
  },
  [MSG.api_key_name_required]: { ar: 'اسم مفتاح النظام مطلوب', en: 'API key name is required' },
  [MSG.integration_quota_exceeded]: {
    ar: 'تجاوزت حصة نداءات التكامل لهذا الشهر ({used} من {quota}) — والعدّ يشمل ما رُدّ',
    en: 'Monthly integration call quota exceeded ({used} of {quota}) — rejected calls are counted too',
  },
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
  [MSG.screen_undeclared]: { ar: 'هذا المسار لا يُعلن شاشتَه ولا صاحبَه ولا سببَ فتحه — مغلقٌ افتراضياً', en: 'This route declares neither a screen, an owner-only scope, nor a reason to be open — closed by default' },
  [MSG.support_grant_not_yours]: { ar: 'إذن الدعم الفعّال لهذه المنشأة مُنح لمدير آخر — لا يُدخَل بإذن غيرك', en: 'The active support consent for this company was granted to another admin — you cannot enter on their consent' },
  [MSG.handover_item_not_found]: { ar: 'بند النموذج غير موجود في هذا النموذج', en: 'Checklist item not found on this handover' },
  [MSG.settlement_lines_mismatch]: { ar: 'مجموع بنود التسوية لا يساوي مبلغ التسوية', en: 'Settlement lines do not add up to the settlement amount' },
  [MSG.unearned_disposition_required]: {
    ar: 'بقي {amount} مستحقّاً أو مقبوضاً عن مدّة لم تُقدَّم — حدّد وجهته: يُردّ للمستأجر (ولا يدين بما لم يُقبض) أم يُحتجَز دخلاً بشرط العقد',
    en: 'An amount of {amount} — accrued or collected — covers a period not served: choose its destination: refunded to the tenant (and not owed where unpaid), or kept as income under the contract',
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
  [MSG.slug_invalid]: {
    ar: 'معرّف النطاق يجب أن يكون من ٣ إلى ٤٠ حرفاً: حروف إنجليزية صغيرة وأرقام وشرطة، ولا يبدأ بشرطة ولا ينتهي بها',
    en: 'The subdomain must be 3–40 characters: lowercase letters, digits and hyphens, not starting or ending with a hyphen',
  },
  [MSG.slug_taken]: { ar: 'معرّف النطاق "{slug}" مستخدَم بالفعل', en: 'The subdomain "{slug}" is already in use' },
  [MSG.slug_reserved]: {
    ar: 'معرّف النطاق "{slug}" محجوز ولا يُمنح — وإن كان لك سابقاً فالمتروك لا يعود، لأن روابطه القديمة تبقى تشير إليه',
    en: 'The subdomain "{slug}" is reserved and cannot be granted — a released identifier never returns, since old links still point at it',
  },
  [MSG.slug_not_cleared]: {
    ar: 'لا يُمحى معرّف النطاق بعد اختياره — يُستبدل بغيره، والقديم يبقى محجوزاً',
    en: 'A subdomain cannot be cleared once chosen — replace it instead; the old one stays reserved',
  },

  [MSG.zatca_profile_incomplete]: { ar: 'أكمل الاسم القانوني والرقم الضريبي في بيانات المنشأة قبل الإرسال لهيئة الزكاة', en: 'Complete the legal name and VAT number in the company profile before submitting to ZATCA' },
  [MSG.zatca_buyer_address_incomplete]: {
    ar: 'الفاتورة القياسية تشترط عنوان المشتري كاملاً — وينقص من بطاقة «{customer}»: {missing}. أكملها ثم أعد الإرسال',
    en: 'A standard invoice requires the buyer\'s full national address — missing from "{customer}": {missing}. Complete it and resubmit',
  },
  [MSG.zatca_export_buyer_vat]: {
    ar: 'فاتورة صادرات لمشترٍ خارج المملكة لا تحمل رقم تسجيل ضريبي سعودي للمشتري (BR-KSA-46) — امسح الرقم من بطاقة «{customer}» أو صحّح بلده، ثم أعد الإرسال',
    en: 'An export invoice to a buyer outside the Kingdom must not carry a Saudi buyer VAT number (BR-KSA-46) — clear it on "{customer}" or correct the country, then resubmit',
  },
  [MSG.vat_correction_not_earlier]: {
    ar: 'التصحيح يقع على إقرار سابق للفترة التي يُعلَن فيها — اختر فترة تبدأ قبلها',
    en: 'A correction applies to a return earlier than the period declaring it — pick a period that starts before it',
  },
  [MSG.vat_correction_needs_notice]: {
    ar: 'هذا نقص في الضريبة المستحقة قدره {limit} ريال فأكثر — لا يُستدرك في إقرار لاحق: يجب إشعار الهيئة خلال عشرين يوماً من اكتشافه بتقديم تصحيح للإقرار الأصلي (المادة ٦٣ فقرة ١ و٣)',
    en: 'This understatement is {limit} SAR or more — it cannot be absorbed into a later return: the Authority must be notified within 20 days of discovery by filing a correction of the original return (Article 63(1) and (3))',
  },
  [MSG.vat_correction_time_barred]: {
    ar: 'لا يُصحَّح إقرار بزيادة في الضريبة بعد مضيّ {years} سنوات من نهاية السنة التقويمية لفترته (المادة ٦٣ فقرة ٤)',
    en: 'An overstatement cannot be corrected after {years} years from the end of the calendar year of its tax period (Article 63(4))',
  },
  [MSG.vat_correction_not_found]: {
    ar: 'التصحيح غير موجود',
    en: 'Correction not found',
  },
  [MSG.vat_correction_filed_locked]: {
    ar: 'أُعلن هذا التصحيح في إقرار وُسم «قُدِّم» — ما قُدِّم للهيئة يُصحَّح بتصحيح جديد لا بمحوه من السجل',
    en: 'This correction belongs to a return already marked as filed — what was filed is corrected by a new correction, not by deleting the record',
  },
  [MSG.input_vat_use_invalid]: {
    ar: 'إسناد ضريبة المدخلات أحد ثلاثة: «خاضع حصراً» أو «معفى حصراً» أو «مشترك» — وقيمة «ما سبق البناء» للمشتريات القديمة وحدها ولا تُقبل لشراء جديد',
    en: 'Input VAT use is one of: TAXABLE_ONLY, EXEMPT_ONLY or MIXED — LEGACY_UNASSIGNED is for pre-existing purchases only and is refused on a new one',
  },
  [MSG.vat_ratio_range]: {
    ar: 'نسبة الخصم النسبي كسر بين صفر وواحد (0.75 تعني 75%)',
    en: 'The proportional deduction ratio is a fraction between 0 and 1 (0.75 means 75%)',
  },
  [MSG.vat_ratio_not_declared]: {
    ar: 'لم تُعلَن نسبة الخصم النسبي لسنة {year} — أعلِنها من شاشة الإقرار قبل اعتماده',
    en: 'The proportional deduction ratio for {year} has not been declared — declare it on the VAT return screen before relying on it',
  },
  [MSG.vat_period_one_of]: {
    ar: 'الإقرار يُطلب بربعٍ أو بشهر — أحدهما لا كلاهما ولا واحد: أرسل «quarter» من 1 إلى 4، أو «month» من 1 إلى 12',
    en: 'A VAT return is requested by quarter or by month — one of them, not both and not neither: send "quarter" 1–4 or "month" 1–12',
  },
  [MSG.vat_period_quarter_range]: {
    ar: 'رقم الربع من 1 إلى 4',
    en: 'Quarter must be 1 to 4',
  },
  [MSG.vat_period_month_range]: {
    ar: 'رقم الشهر من 1 إلى 12',
    en: 'Month must be 1 to 12',
  },
  [MSG.customer_foreign_vat_conflict]: {
    ar: 'رقم التسجيل الضريبي السعودي لمن سُجّل في المملكة — عميلٌ بلده غير السعودية يُكتب معرّفه في «المعرّف البديل» بمخطّطه (TIN)',
    en: 'A Saudi VAT registration number belongs to a KSA-registered person — a customer outside Saudi Arabia carries their identifier in the alternative identifier with its scheme (TIN)',
  },
  [MSG.zatca_buyer_id_missing]: {
    ar: 'الفاتورة الكاملة لمشترٍ بلا رقم ضريبي تشترط معرّفه البديل بمخطّطه (سجل تجاري · هوية · إقامة · …) — أكمله في بطاقة «{customer}» ثم أعد الإرسال (BR-KSA-81)',
    en: 'A standard invoice for a buyer without a VAT number requires the buyer\'s alternative identifier with its scheme (CRN · NAT · IQA · …) — complete it on "{customer}" and resubmit (BR-KSA-81)',
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
  [MSG.zatca_attempt_failed]: {
    ar: 'تعذّرت المحاولة ولم تُجب الهيئة على المستند ({reason}) — المستند كما هو، وسيُعاد الإرسال آلياً بتراجع؛ وإن استُنفدت المحاولات بقي مُعلَناً في «صادرٌ لم يصل» ويُعاد يدوياً',
    en: 'The attempt failed without an answer from the authority ({reason}) — the document is unchanged and will be resent automatically with backoff; if the attempts run out it stays declared under "issued, not delivered" and can be resent manually',
  },
  [MSG.zatca_stamp_in_progress]: { ar: 'المستند قيد الختم الآن من مسارٍ آخر — أعد المحاولة بعد لحظات', en: 'This document is being stamped by anotherprocess — retry shortly' },
  [MSG.zatca_previous_unstamped]: { ar: 'سلفُ هذا المستند في السلسلة ({no} — الموقع {icv}) لم يُختم بعد، فلا يُختم قبله — يُعاد تلقائياً', en: 'The previous document in the chain ({no} — position {icv}) is not stamped yet, so this one cannot be stamped before it — retried automatically' },
  [MSG.zatca_not_stamped]: { ar: 'لا مستندٌ موقَّعٌ محفوظٌ لهذه الفاتورة — تُختم أولاً ثم تُبلَّغ', en: 'No stored signed document for this invoice — it must be stamped before it is reported' },
  // ⚖️ الإشعارُ على إشعارٍ مقابل لا على إشعارٍ من نوعه (`ق-٩٥٢`) — والمخرجُ مسمّىً في رسالة المنع (`ق-٢٦٥`).
  [MSG.credit_note_target_invalid]: { ar: 'الإشعار يُصدَر على فاتورة أصلية أو على إشعار مقابل (مدين يصحّح دائناً، ودائن يصحّح مديناً) — لا على إشعار من نوعه', en: 'A note is issued against an original invoice or against the opposite kind of note (a debit note correcting a credit note, or a credit note correcting a debit note) — never against a note of its own kind' },
  [MSG.credit_note_exceeds_remaining]: { ar: 'قيمة الإشعار تتجاوز المتبقي من المستند الذي يصحّحه', en: 'The note amount exceeds what remains of the document it corrects' },
  [MSG.supplier_note_target_invalid]: { ar: 'إشعارُ المورّد يُسجَّل على فاتورة شراء أو على إشعارٍ مقابل لها فقط', en: 'A supplier note is recorded against a purchase invoice or against its opposite note only' },
  [MSG.supplier_note_exceeds_remaining]: { ar: 'قيمة إشعار المورّد تتجاوز المتبقي من المستند الذي يصحّحه', en: 'The supplier note amount exceeds what remains of the document it corrects' },
  [MSG.purchase_has_notes]: { ar: 'فاتورة الشراء {no} صدرت عليها إشعاراتٌ من المورّد فلا تُحذف — والتصحيح بإشعارٍ مقابل', en: 'Purchase invoice {no} has supplier notes recorded against it and cannot be deleted — correct it with an opposite note' },
  [MSG.supplier_return_line_not_original]: { ar: 'سطر الإعادة يجب أن يشير إلى سطرٍ من فاتورة الشراء الأصلية نفسها وبصنفه', en: 'A returned line must reference a line of the same original purchase invoice, with its product' },
  [MSG.supplier_return_exceeds_received]: { ar: 'الكمية المعادة {requested} تتجاوز ما استُلم في السطر ({sold})', en: 'The returned quantity {requested} exceeds what the line received ({sold})' },
  [MSG.supplier_return_exceeds_stock]: { ar: 'لا يمكن إعادة {requested} إلى المورّد — على الرفّ من هذه الفاتورة {remaining} فقط، وما بيع لا يُعاد', en: 'Cannot return {requested} to the supplier — only {remaining} of this invoice remains on the shelf, and what was sold cannot be returned' },
  [MSG.supplier_note_debit_no_goods]: { ar: 'الإشعار المدين من المورّد فوترةٌ إضافية — لا بضاعة تُعاد فيه', en: 'A supplier debit note is additional billing — goods are not returned on it' },
  [MSG.supplier_note_immutable]: { ar: 'إشعار المورّد رُحِّل فلا يُعدَّل ولا يُحذف — صحّحه بإشعار مقابل: مدين لدائن زائد، ودائن لمدين زائد', en: 'This supplier note is posted and cannot be edited or deleted — correct it with an opposite note: a debit note for an excess credit, a credit note for an excess debit' },
  [MSG.purchase_frozen_after_consumption]: { ar: 'الكمية والتكلفة في فاتورة الشراء {no} مجمَّدتان — استُهلك من بضاعتها أو صدر عليها إشعار، فالتصحيح بإشعار من المورّد (دائن أو مدين على الفاتورة) لا بتعديلها؛ وما عداهما يُعدَّل', en: 'Quantity and cost on purchase invoice {no} are frozen — some of its goods were consumed or a note was recorded against it, so corrections go through a supplier note (credit or debit against the invoice), not an edit; everything else stays editable' },
  [MSG.purchase_voided]: { ar: 'فاتورة الشراء {no} مُلغاة بقيد عكس — لا تُعدَّل ولا تُلغى ثانية', en: 'Purchase invoice {no} was voided by a reversing entry — it cannot be edited or voided again' },
  [MSG.purchase_void_consumed]: { ar: 'فاتورة الشراء {no} لا تُلغى — استُهلك من بضاعتها، والمخرج إشعار من المورّد على ما بقي', en: 'Purchase invoice {no} cannot be voided — some of its goods were consumed; the way out is a supplier note for what remains' },
  [MSG.supplier_note_target_voided]: { ar: 'فاتورة الشراء مُلغاة — لا إشعار على مُلغاة', en: 'The purchase invoice was voided — no note can be recorded against it' },
  [MSG.purchase_lines_frozen_after_receipt]: { ar: 'بنود فاتورة الشراء {no} لا تُعدَّل وعليها استلامٌ مسجَّل — أُلغِ الاستلام أولاً ثم عدِّل البنود', en: 'Lines of purchase invoice {no} cannot be edited while a recorded goods receipt stands — void the receipt first, then edit the lines' },
  [MSG.goods_receipt_not_found]: { ar: 'الاستلام غير موجود', en: 'Goods receipt not found' },
  [MSG.goods_receipt_voided]: { ar: 'الاستلام مُلغى — لا يُعاد إلغاؤه', en: 'The goods receipt is already voided' },
  [MSG.goods_receipt_on_note]: { ar: 'الاستلام يُسجَّل على فاتورة شراء لا على إشعار مورّد', en: 'A goods receipt is recorded against a purchase invoice, not a supplier note' },
  [MSG.goods_receipt_line_repeated]: { ar: 'سطر الشراء مكرَّر في الاستلام نفسه', en: 'The same purchase line appears twice in one receipt' },
  [MSG.goods_receipt_line_not_of_purchase]: { ar: 'سطر الشراء ليس من هذه الفاتورة أو تجاوزه تعديلٌ', en: 'The purchase line does not belong to this invoice or was superseded by an edit' },
  [MSG.goods_receipt_line_not_stocked]: { ar: 'سطرٌ خدميّ بلا صنف — لا يُستلم على الرفّ', en: 'A service line has no item — nothing to receive into stock' },
  [MSG.goods_receipt_exceeds_remaining]: { ar: 'الكمية المطلوب استلامها ({requested}) تتجاوز ما بقي من سطر فاتورة الشراء {no} ({remaining})', en: 'The quantity to receive ({requested}) exceeds what remains on the line of purchase invoice {no} ({remaining})' },
  [MSG.goods_receipt_migration_missing]: { ar: 'هجرة الاستلام المستقلّ غير مطبَّقة — المطابقة لا تقيس قاعدةً بلا وسيط', en: 'The goods-receipt migration is not applied — the reconciliation cannot measure a database without the clearing account' },
  [MSG.receipt_clearing_account_type_conflict]: { ar: 'حساب وسيط الاستلام غُيِّر نوعه في الدليل — أعده إلى «التزام» أو راجع المحاسب', en: 'The receipt clearing account was reclassified in the chart — restore it to a liability or consult the accountant' },
  [MSG.receipt_clearing_code_range_full]: { ar: 'لا رمز حرّ لوسيط الاستلام في النطاق 2101–2199', en: 'No free code for the receipt clearing account in the 2101–2199 range' },

  // ٣٠ الأرصدةُ الافتتاحية بالطبقات (ق-١١٧٧ · ق-١١٧٩)
  [MSG.stock_opening_not_found]: { ar: 'إعلان الرصيد الافتتاحي غير موجود', en: 'Opening stock declaration not found' },
  [MSG.stock_opening_lines_required]: { ar: 'إعلان الرصيد الافتتاحي يحتاج سطراً واحداً على الأقل', en: 'An opening stock declaration needs at least one line' },
  [MSG.stock_opening_date_mismatch]: { ar: 'تاريخ الافتتاح واحدٌ للمنشأة: أُعلن من قبل على {declared} ولا يُعلَن ثانيةً على {requested} — أضف السطور بالتاريخ المعلَن', en: 'The opening date is one per company: it was declared as {declared} and cannot be declared again as {requested} — add the lines under the declared date' },
  [MSG.stock_opening_acquired_after_opening]: { ar: 'تاريخ اقتناء السطر ({acquired}) يأتي بعد تاريخ الافتتاح ({opening}) — ما اقتُني بعد الافتتاح يدخل استلاماً أو حركةً لا رصيداً افتتاحياً', en: 'The line acquisition date ({acquired}) is after the opening date ({opening}) — stock acquired after the opening enters as a receipt or a movement, not as opening stock' },
  [MSG.stock_opening_after_movement]: { ar: 'للصنف حركة مخزون بتاريخ {moved} قبل تاريخ الافتتاح ({opening}) — الافتتاح يسبق كل حركة، فأعلن بتاريخ افتتاحٍ لا يسبقها أو أدخلها حركةً', en: 'The product has a stock movement dated {moved}, before the opening date ({opening}) — the opening precedes every movement; declare an opening date not preceded by it, or enter it as a movement' },
  [MSG.stock_opening_line_not_found]: { ar: 'سطر الإعلان الافتتاحي غير موجود', en: 'Opening stock line not found' },
  [MSG.stock_opening_line_voided]: { ar: 'سطر الإعلان الافتتاحي مُلغى من قبل', en: 'This opening stock line has already been voided' },
  [MSG.stock_opening_line_consumed]: { ar: 'طبقة هذا السطر الافتتاحي استُهلك منها — لا يُلغى، والتصحيح بسطر افتتاحٍ جديد أو تسوية', en: 'The cost layer of this opening line has been consumed — it cannot be voided; correct with a new opening line or an adjustment' },
  [MSG.account_opening_inventory_via_stock]: { ar: 'الرصيد الافتتاحي لحساب المخزون ({code}) يُعلَن من المخزون بطبقاته (إعلان الرصيد الافتتاحي) لا من شاشة الحسابات — وإلا ازدوج المصدران', en: 'The opening balance of the inventory account ({code}) is declared from inventory by its layers (opening stock declaration), not from the accounts screen — otherwise the two sources double-count' },

  // ٧ التكاليفُ المحمَّلة — نصوصٌ لمفاتيحَ شُحنت بلا نصّ (ق-١١٨٤): رسائلُ رفضٍ تقع حيث يُمنع التاجرُ من فعل
  [MSG.landed_cost_not_found]: { ar: 'توزيع التكلفة المحمَّلة غير موجود', en: 'Landed cost distribution not found' },
  [MSG.landed_cost_voided]: { ar: 'توزيع التكلفة المحمَّلة مُلغى من قبل', en: 'This landed cost distribution has already been voided' },
  [MSG.landed_cost_on_note]: { ar: 'التكلفة المحمَّلة تُوزَّع من فاتورة شراء لا من إشعار مورّد', en: 'Landed costs are distributed from a purchase invoice, not from a supplier note' },
  [MSG.landed_cost_purchase_not_posted]: { ar: 'فاتورة الشراء {no} لم تُرحَّل إلى الدفتر — لا تُوزَّع تكلفتها قبل ترحيلها', en: 'Purchase invoice {no} has not been posted to the ledger — its cost cannot be distributed before it is posted' },
  [MSG.landed_cost_line_not_of_purchase]: { ar: 'السطر المطلوب توزيعه ليس من فاتورة الشراء هذه', en: 'The line to distribute does not belong to this purchase invoice' },
  [MSG.landed_cost_line_not_service]: { ar: 'يُوزَّع السطر الخدمي وحده (شحن · تخليص · رسوم) — السطر المخزني يحمل صنفاً فلا يُوزَّع', en: 'Only a service line (freight, clearance, fees) can be distributed — a stocked line carries a product and is not distributed' },
  [MSG.landed_cost_line_zero]: { ar: 'قيمة السطر صفر أو سالبة — لا شيء يُوزَّع', en: 'The line value is zero or negative — there is nothing to distribute' },
  [MSG.landed_cost_line_already_distributed]: { ar: 'هذا السطر من فاتورة الشراء {no} له توزيع قائم — أَلغِ التوزيع القائم أولاً', en: 'This line of purchase invoice {no} already has an active distribution — void the active distribution first' },
  [MSG.landed_cost_no_layers]: { ar: 'لا طبقة تكلفة صالحة للتوزيع عليها — سمِّ طبقات الاستلام أو الاستلامات، وبمبلغٍ لا يُنتج نصيباً سالباً', en: 'No cost layer is eligible for distribution — name the receipt layers or the receipts, with an amount that yields no negative share' },
  [MSG.landed_cost_layer_repeated]: { ar: 'الطبقة نفسها سُمّيت أكثر من مرة في التوزيع', en: 'The same layer was named more than once in the distribution' },
  [MSG.landed_cost_layer_not_receipt]: { ar: 'الطبقة {layerId} ليست طبقة استلامٍ قائم — لا تُوزَّع عليها التكلفة المحمَّلة', en: 'Layer {layerId} is not a layer of an active goods receipt — landed costs cannot be distributed to it' },
  [MSG.landed_cost_layer_changed]: { ar: 'تغيّرت الطبقة {layerId} أثناء التوزيع (استهلاكٌ أو تسوية متزامنة) — أعد المحاولة', en: 'Layer {layerId} changed during the distribution (a concurrent consumption or adjustment) — retry' },
  [MSG.non_deductible_vat_layer_changed]: { ar: 'تغيّرت الطبقة {layerId} أثناء ترحيل ضريبة المدخلات غير القابلة للخصم (استهلاكٌ أو تسوية متزامنة) — أعد المحاولة', en: 'Layer {layerId} changed while posting non-deductible input VAT (a concurrent consumption or adjustment) — retry' },
  [MSG.supplier_note_layer_changed]: { ar: 'تغيّرت الطبقة {layerId} أثناء تطبيق إشعار المورّد على تكلفتها (استهلاكٌ أو تسوية متزامنة) — أعد المحاولة', en: 'Layer {layerId} changed while applying the supplier note to its cost (a concurrent consumption or adjustment) — retry' },
  [MSG.landed_cost_manual_sum_mismatch]: { ar: 'مجموع الأنصبة اليدوية ({given}) لا يساوي قيمة السطر ({expected})', en: 'The manual shares total ({given}) does not equal the line value ({expected})' },
  [MSG.landed_cost_manual_lines_required]: { ar: 'التوزيع اليدوي يحتاج أنصبةً مسمّاة لكل طبقة', en: 'A manual distribution needs a named share for each layer' },
  [MSG.landed_cost_void_after_consumption]: { ar: 'توزيع التكلفة المحمَّلة على فاتورة الشراء {no} لا يُلغى بعد استهلاكٍ من طبقاته — التصحيح بتوزيعٍ جديد', en: 'The landed cost distribution on purchase invoice {no} cannot be voided after its layers were consumed — correct with a new distribution' },
  [MSG.purchase_frozen_by_landed_costs]: { ar: 'فاتورة الشراء {no} عليها توزيع تكلفة محمَّلة قائم — لا تُعدَّل ولا تُلغى قبل إلغاء التوزيع', en: 'Purchase invoice {no} has an active landed cost distribution — it cannot be edited or voided before the distribution is voided' },
  [MSG.goods_receipt_void_with_landed_cost]: { ar: 'الاستلام {no} وُزِّعت على طبقاته تكلفة محمَّلة — لا يُلغى قبل إلغاء التوزيع', en: 'Goods receipt {no} has landed costs distributed to its layers — it cannot be voided before the distribution is voided' },
  [MSG.supplier_note_line_not_received]: { ar: 'إشعار المورّد {no} يشير إلى سطر لم يُستلم كاملاً بعد — يُسجَّل الاستلام أولاً ثم الإشعار', en: 'Supplier note {no} references a line not fully received yet — record the receipt first, then the note' },
  [MSG.supplier_note_line_multi_receipt]: { ar: 'إشعار المورّد {no} يشير إلى سطر استُلم على أكثر من استلام — لا يُحسم على طبقة واحدة، ويُعمَّم حين يُطلب', en: 'Supplier note {no} references a line received across several receipts — it cannot be settled on a single layer yet' },
  [MSG.credit_note_immutable]: { ar: 'الإشعار صدر فلا يُعدَّل ولا يُحذف — صحّحه بإشعار مقابل: إشعار مدين لدائن زائد، وإشعار دائن لمدين زائد', en: 'This note has been issued and can be neither edited nor deleted — correct it with the opposite note: a debit note for an excess credit note, a credit note for an excess debit note' },
  [MSG.return_line_not_original]: { ar: 'سطر المرتجع يجب أن يشير إلى سطرٍ من الفاتورة الأصلية نفسها وبصنفه', en: 'A returned line must reference a line of the same original invoice, with its product' },
  [MSG.return_exceeds_sold]: { ar: 'الكمية المرتجعة ({requested}) تتجاوز المتاح: بِيع {sold} وأُرجع منه {returned} من قبل', en: 'Returned quantity ({requested}) exceeds what is available: {sold} sold, {returned} already returned' },
  [MSG.refund_target_invalid]: { ar: 'سند الردّ يُصدَر على إشعارٍ دائن مرتبطٍ بفاتورةٍ أصلية فقط', en: 'A refund is issued against a credit note linked to an original invoice only' },
  [MSG.refund_nothing_refundable]: { ar: 'لا شيء قابلٌ للردّ: الإشعار خُصم من متبقي الفاتورة غير المسدَّد، أو رُدّ من قبل', en: 'Nothing is refundable: the note offset the unpaid balance of its invoice, or was already refunded' },
  [MSG.refund_exceeds_refundable]: { ar: 'مبلغ الردّ ({amount}) يتجاوز القابل للردّ ({refundable}) — الخصم من الفاتورة غير المسدَّدة إلزاميّ أولاً', en: 'Refund ({amount}) exceeds the refundable amount ({refundable}) — the unpaid invoice balance must be offset first' },
  /**
   * ⚖️ **الفاتورةُ الصادرة لا تُعدَّل ولا تُحذف — مختومةً كانت أو لا** (`ق-٩٤٣`): العميلُ يحمل رقمَها ورمزَها
   * منذ لحظة الإصدار، وإيصالُ الكاشير يخرج قبل الإجازة، ولا نافذةَ ضيّقة حيث لا تسجيل. **ورسالةٌ واحدة
   * للجميع** (`ق-٩٥٠`): السببُ (مصدَّقةٌ · قيدَ الإرسال · مختومةٌ · لها خَلَف) لا يغيّر الحكمَ ولا المخرج،
   * والمخرجُ مسمّىً (`ق-٢٦٥`). والملاحظاتُ وحالةُ السداد تبقى متاحتَين — لا تدخلان المستند.
   */
  [MSG.invoice_issued_locked]: {
    ar: 'الفاتورة صدرت فلا تُعدَّل ولا تُحذف — صحّحها بإشعار دائن (يخفّضها أو يلغيها) أو إشعار مدين (يزيدها). (الملاحظات وحالة السداد تبقى متاحتَين)',
    en: 'This invoice has been issued and can be neither edited nor deleted — correct it with a credit note (to reduce or cancel it) or a debit note (to increase it). (Notes and payment status can still be changed.)',
  },
  /**
   * ⚖️ **المردودةُ تُغلق ولا تُمسّ، ويُصدَر بدلاً منها جديد** (`ق-٩٥٨`): بنصّ الهيئة لا يُمسّ عدّادُها ولا تجزئتُها،
   * والتصحيحُ مستندٌ جديد بعدّادٍ وتجزئةٍ جديدَين — لا تعديلٌ ولا إعادةُ إرسال؛ ولا إشعارَ عليها لأنها ليست فاتورةً صحيحة.
   * والرسائلُ تسمّي المخرج (`ق-٢٦٥`): «أصدِر بدلاً».
   */
  [MSG.invoice_replacement_only_rejected]: { ar: 'لا يُصدَر بدلٌ إلا عن فاتورة مردودة من هيئة الزكاة', en: 'A replacement can only be issued for an invoice rejected by ZATCA' },
  [MSG.invoice_already_replaced]: { ar: 'صدر بدلُ هذه الفاتورة المردودة من قبل: {no} — والمردودة مغلقة لا تُمسّ', en: 'A replacement for this rejected invoice was already issued: {no} — the rejected one is closed and untouched' },
  [MSG.zatca_rejected_not_resubmittable]: { ar: 'الفاتورة المردودة لا تُعاد إلى الهيئة ولا تُوقَّع ثانيةً — عدّادها وتجزئتها كما هما؛ أصدِر بدلاً عنها', en: 'A rejected invoice is not resubmitted or re-signed — its counter and hash stay as they are; issue a replacement instead' },
  [MSG.credit_note_target_rejected]: { ar: 'لا إشعار على فاتورة مردودة — فهي ليست فاتورة ضريبية صحيحة؛ أصدِر بدلاً عنها ثم صحّح البدل إن لزم', en: 'No note can be issued against a rejected invoice — it is not a valid tax invoice; issue a replacement, then correct the replacement if needed' },

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
  [MSG.fiscal_year_span_out_of_range]: { ar: 'مدّةُ السنة المالية {months} شهراً — والنظام يجيز من ٦ إلى ١٨ شهراً (نظام الشركات، المادة ١٦: اثنا عشر شهراً، والأولى من ستّة إلى ثمانية عشر)', en: 'The fiscal year spans {months} months — the law allows 6 to 18 (Companies Law art. 16)' },
  [MSG.fiscal_no_period_for_date]: {
    ar: 'لا توجد فترة مالية معرَّفة لهذا التاريخ',
    en: 'No fiscal period is defined for this date',
  },
  [MSG.fiscal_period_closed]: {
    ar: 'الفترة {period} مقفلة — التصحيح يكون بقيد عكسي في فترة مفتوحة',
    en: 'Period {period} is closed — post a reversing entry in an open period instead',
  },
  [MSG.fiscal_year_has_closed_period]: {
    ar: 'لا يمكن حذف سنة مالية فيها فترة مقفلة ({period}) — حذف التقويم لا يفكّ الإقفال؛ أعد فتح الفترة أولاً',
    en: 'Cannot delete a fiscal year that still has a closed period ({period}) — deleting the calendar does not unlock it; reopen the period first',
  },
  [MSG.fiscal_year_close_needs_closed_periods]: {
    ar: 'لا تُقفل السنة المالية وفيها فترة مفتوحة — الفترة {period} ما زالت مفتوحة',
    en: 'A fiscal year cannot be closed while a period is open — {period} is still open',
  },
  [MSG.fiscal_year_already_closed]: {
    ar: 'السنة المالية مقفلة بقيد إقفال قائم — أعد فتح فترة منها ليُعكس القيد أولاً',
    en: 'This fiscal year already has a closing entry — reopen one of its periods to reverse it first',
  },
  [MSG.fiscal_year_nothing_to_close]: {
    ar: 'لا حركة إيراد ولا مصروف حتى نهاية السنة — لا شيء يُقفل',
    en: 'No revenue or expense movement up to the year end — nothing to close',
  },
  [MSG.account_system_protected]: {
    ar: 'الحساب {code} حساب نظامي — لا يُحذف ولا يُعدَّل رمزه',
    en: 'Account {code} is a system account — it cannot be deleted and its code cannot be changed',
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
  [MSG.trash_retained_by_law]: { ar: 'لا يُمحى نهائياً: محفوظٌ نظاماً حتى {until} لأن له {by} — يبقى في السلة قابلاً للاسترجاع', en: 'Cannot be purged: retained by law until {until} because it has {by} — it stays in the trash and can be restored' },
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
  [MSG.page_size_without_page]: { ar: 'حجمُ الصفحة (pageSize) يُرسَل مع رقم الصفحة (page) — بلا page تعود القائمةُ كاملةً ولا يسري سقف', en: 'pageSize must be sent together with page — without page the full list is returned and no cap applies' },
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
