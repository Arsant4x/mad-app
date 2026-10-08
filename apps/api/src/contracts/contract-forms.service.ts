import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FormInstancesService, type FormActor, type FormLinkedEntity, type FormValueInput } from '../forms/form-instances.service';
import { FormSigningService, type FormCounterparty, type RepresentativeInput, type RequestMeta, type UploadedEvidence } from '../forms/form-signing.service';

/** نوعُ الكيان الذي يكتبه العقدُ على سجلّات النماذج (`linkedEntityType`) — النشاطُ يسمّي كيانَه، والمحرّكُ يقابله ولا يعرف معناه. */
export const CONTRACT_FORM_ENTITY = 'contract';

/**
 * ⚖️ **نماذجُ العقد** (توجيه ٢٧٨ · `ق-١٦٣٦`، والنموذجُ المرئيّ المُقرّ: «تعبئةُ نموذج تسليم: العقد … · الوحدة …»).
 *
 * العقدُ يطلب النموذجَ لنفسه ويتحقّق من وجوده في المنشأة، ثم يمرّ بالمحرّك (النشاطُ يستورد المحرّك ولا عكس — `CLAUDE.md §3` أ).
 * ⚖️ **وفي مسار التوقيع** (توجيه ٢٨٧) **العقدُ يسمّي الطرفَ** من بطاقة عميله (`ق-١٠٢٨`: العميلُ مصدرُ الحقيقة لاسم المستأجر وجواله)
 * **وقيمتَه** بعملة أساس المنشأة (`baseValue`، «قيمةُ العقد كلِّها» `ق-١٦٣٥` ①)، والمحرّكُ يحكم بهما ولا يعرف العقد.
 */
@Injectable()
export class ContractFormsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly forms: FormInstancesService,
    private readonly signing: FormSigningService,
  ) {}

  private async linkedOf(companyId: string, contractId: string): Promise<FormLinkedEntity> {
    const found = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.contract.findUnique({ where: { id: contractId }, select: { id: true } }));
    if (!found) throw new NotFoundException(MSG.contract_not_found);
    return { type: CONTRACT_FORM_ENTITY, id: contractId };
  }

  async list(companyId: string, contractId: string) {
    return this.forms.list(companyId, await this.linkedOf(companyId, contractId));
  }

  async create(companyId: string, contractId: string, input: { templateId: string; formDate?: string }, actor: FormActor) {
    return this.forms.create(companyId, await this.linkedOf(companyId, contractId), input, actor);
  }

  async get(companyId: string, contractId: string, formId: string) {
    return this.forms.get(companyId, await this.linkedOf(companyId, contractId), formId);
  }

  async setValues(companyId: string, contractId: string, formId: string, values: readonly FormValueInput[]) {
    return this.forms.setValues(companyId, await this.linkedOf(companyId, contractId), formId, values);
  }

  async remove(companyId: string, contractId: string, formId: string) {
    return this.forms.remove(companyId, await this.linkedOf(companyId, contractId), formId);
  }

  /** ⚖️ الختمُ باليد سقط: الموظّفُ يوقّع ويرسل، ويُختم النموذجُ حين يكتمل النصاب (توجيه ٢٨٧ ⑨). */
  async seal(companyId: string, contractId: string): Promise<never> {
    await this.linkedOf(companyId, contractId);
    throw new ConflictException(MSG.form_seal_by_signatures);
  }

  /** الطرفُ من بطاقة عميل العقد، وقيمةُ العقد بعملة أساس المنشأة. */
  private partyOf(companyId: string, contractId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const contract = await tx.contract.findUniqueOrThrow({
        where: { id: contractId },
        select: {
          baseValue: true,
          customer: { select: { id: true, name: true, kind: true, phone: true, otherIdScheme: true, otherIdIndex: true } },
        },
      });
      const c = contract.customer;
      const party: FormCounterparty | null = c
        ? { customerId: c.id, name: c.name, kind: c.kind, mobile: c.phone, idScheme: c.otherIdScheme, idIndex: c.otherIdIndex }
        : null;
      return { counterparty: party, baseValue: contract.baseValue };
    });
  }

  /** الموظّفُ يوقّع ويرسل الرابطَ إلى جوال المستأجر المسجَّل في بطاقة العميل، أو إلى ممثّل الشخص الاعتباريّ. */
  async send(
    companyId: string,
    contractId: string,
    formId: string,
    actor: FormActor,
    drawing: UploadedEvidence | undefined,
    meta: RequestMeta,
    representative: RepresentativeInput | null = null,
    authorityDocument?: UploadedEvidence,
  ) {
    const linked = await this.linkedOf(companyId, contractId);
    const { counterparty, baseValue } = await this.partyOf(companyId, contractId);
    return this.signing.signAndSend(companyId, linked, formId, { actor, drawing, counterparty, entityBaseValue: baseValue, meta, representative, authorityDocument });
  }

  /** التوقيعُ الورقيّ بشهادة الموظّف (توجيه ٢٨٧ ⑧). */
  async paper(
    companyId: string,
    contractId: string,
    formId: string,
    actor: FormActor,
    paper: UploadedEvidence | undefined,
    drawing: UploadedEvidence | undefined,
    signerName: string | null,
    meta: RequestMeta,
  ) {
    const linked = await this.linkedOf(companyId, contractId);
    const { counterparty, baseValue } = await this.partyOf(companyId, contractId);
    return this.signing.signPaper(companyId, linked, formId, { actor, paper, drawing, counterparty, entityBaseValue: baseValue, signerName, meta });
  }

  /** رابطُ جهاز الموظّف (توجيه ٢٨٧ ⑤). */
  async deviceLink(companyId: string, contractId: string, formId: string, actor: FormActor) {
    return this.signing.staffDeviceLink(companyId, await this.linkedOf(companyId, contractId), formId, actor);
  }

  async resend(companyId: string, contractId: string, formId: string, actor: FormActor) {
    return this.signing.resendLink(companyId, await this.linkedOf(companyId, contractId), formId, actor);
  }

  async revise(companyId: string, contractId: string, formId: string, actor: FormActor) {
    return this.signing.revise(companyId, await this.linkedOf(companyId, contractId), formId, actor);
  }

  async events(companyId: string, contractId: string, formId: string) {
    return this.signing.events(companyId, await this.linkedOf(companyId, contractId), formId);
  }

  async evidence(companyId: string, contractId: string, formId: string, which: { signatureId?: string; objection?: true }) {
    return this.signing.evidence(companyId, await this.linkedOf(companyId, contractId), formId, which);
  }

  async verify(companyId: string, contractId: string, formId: string) {
    return this.forms.verify(companyId, await this.linkedOf(companyId, contractId), formId);
  }
}
