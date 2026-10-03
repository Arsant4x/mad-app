import { Injectable, NotFoundException } from '@nestjs/common';
import { MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FormInstancesService, type FormActor, type FormLinkedEntity, type FormValueInput } from '../forms/form-instances.service';

/** نوعُ الكيان الذي يكتبه العقدُ على سجلّات النماذج (`linkedEntityType`) — النشاطُ يسمّي كيانَه، والمحرّكُ يقابله ولا يعرف معناه. */
export const CONTRACT_FORM_ENTITY = 'contract';

/**
 * ⚖️ **نماذجُ العقد** (توجيه ٢٧٨ · `ق-١٦٣٦`، والنموذجُ المرئيّ المُقرّ: «تعبئةُ نموذج تسليم: العقد … · الوحدة …»).
 *
 * العقدُ يطلب النموذجَ لنفسه ويتحقّق من وجوده في المنشأة، ثم يمرّ بالمحرّك (النشاطُ يستورد المحرّك ولا عكس — `CLAUDE.md §3` أ).
 */
@Injectable()
export class ContractFormsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly forms: FormInstancesService,
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

  async seal(companyId: string, contractId: string, formId: string, actor: FormActor) {
    return this.forms.seal(companyId, await this.linkedOf(companyId, contractId), formId, actor);
  }

  async verify(companyId: string, contractId: string, formId: string) {
    return this.forms.verify(companyId, await this.linkedOf(companyId, contractId), formId);
  }
}
