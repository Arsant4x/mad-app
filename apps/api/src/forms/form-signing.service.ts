import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FormInstanceStatus, FormLinkPurpose, FormSignatureChannel, FormSignatureLevel, FormSignerRole, Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';
import { identityPlanOf, maskMobile, normalizeMobile } from '../common/region/mobile';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { FilesService } from '../files/files.service';
import { VerificationGateway } from '../verification/verification-gateway.service';
import { mobileIndex } from '../verification/otp-challenges.service';
import { signPeriodDaysFor } from './form-signing-settings.service';
import { bytesSha256, deadlineFrom, formLinkUrl, newOpaqueToken, opaqueTokenHash, recordFormEvent, SMS_TEXT } from './form-signing.util';
import { contentHashOf, FormInstancesService, groupIdOf, presentInstance, type FormActor, type FormLinkedEntity, type InstanceFull } from './form-instances.service';

type Tx = Prisma.TransactionClient;

/** ملفٌّ مرفوعٌ كما يصل من `multer`. */
export interface UploadedEvidence {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/**
 * **الطرفُ الذي يوقّع** — يكتبه النشاطُ الطالب من كيانه (العقدُ من بطاقة عميله، `ق-١٠٢٨`: العميلُ مصدرُ الحقيقة لاسم المستأجر وجواله).
 * والمحرّكُ لا يعرف العقد: يأخذ الطرفَ وقيمةَ الكيان بعملة أساس المنشأة.
 */
export interface FormCounterparty {
  customerId: string;
  name: string;
  /** صفةُ العميل (`NATURAL` · `ESTABLISHMENT` · `LEGAL_PERSON` · …). */
  kind: string;
  mobile: string | null;
  idScheme: string | null;
  idIndex: string | null;
}

/** ما يحتاجه الإرسال من مكان الطلب: الشبكةُ والمتصفّح، كما يحفظهما سجلُّ التدقيق. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** صورةُ الرسم ساكنةً (`ق-١٦٣٥` ⑫): صورةٌ لا غير، وغيرُ فارغة. */
export function assertDrawing(file: UploadedEvidence | undefined): UploadedEvidence {
  if (!file || !file.buffer?.length) throw new BadRequestException(MSG.form_signature_drawing_required);
  if (!IMAGE_TYPES.has(file.mimetype)) throw new BadRequestException(MSG.form_signature_drawing_type);
  return file;
}

/**
 * ⚖️ **مسارُ التوقيع من جهة الموظّف** (توجيه ٢٨٧ ① و③ · `ق-١٦٢٠` · `ق-١٦٦٨` إلى `ق-١٦٧١`).
 *
 * **الموظّفُ يعبّئ النموذجَ كاملاً ويوقّع، ثم يُرسل رابطُه للمستأجر**: التوقيعُ صفٌّ ملحقٌ فقط بمستوى «مرسومٌ بجلسة الموظّف» وبصمةِ ما وُقّع
 * عليه، والنسخةُ تصير «تنتظر التوقيع» ولا تُعدَّل بعدها، **وموعدُ الانقضاء يُختم عند أوّل إرسال** وترثه النسخُ المعدّلة (`ق-١٦٧١`). **والرابطُ
 * إلى جوال المستأجر المسجَّل في بطاقته** مطبَّعاً بإقليم المنشأة، ورمزُه بصمةٌ في القاعدة. **ونفاذٌ شرطٌ** لنسخةٍ قيمةُ كيانها فوق حدّ المنشأة
 * (`ق-١٦٣٣` ①ب)، فيُرفض الإرسالُ إن خلت البطاقةُ من رقم هويّةٍ يتحقّق منه نفاذ. **والرسالةُ تُرسل بعد الالتزام** لا داخل المعاملة (مهلتُها
 * خمسُ ثوانٍ، ونداءُ الشبكة لا يحبسها)، وفشلُها يُسجَّل حدثاً ويُعاد الإرسالُ من الشاشة.
 */
@Injectable()
export class FormSigningService {
  private readonly logger = new Logger(FormSigningService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly instances: FormInstancesService,
    private readonly files: FilesService,
    private readonly gateway: VerificationGateway,
  ) {}

  /** الموظّفُ يوقّع النسخةَ ويرسل رابطَها (`ق-١٦٢٠`). */
  async signAndSend(
    companyId: string,
    linked: FormLinkedEntity,
    id: string,
    input: { actor: FormActor; drawing: UploadedEvidence | undefined; counterparty: FormCounterparty | null; entityBaseValue: Prisma.Decimal | null; meta: RequestMeta },
  ) {
    const drawing = assertDrawing(input.drawing);
    const stored = await this.files.uploadSensitive(companyId, drawing);
    let outbound: { to: string; masked: string; token: string; instanceId: string } | null = null;
    try {
      outbound = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "form_instances" WHERE "id" = ${id} FOR UPDATE`;
        const instance = await this.instances.load(tx, linked, id);
        if (instance.status === FormInstanceStatus.SEALED) throw new ConflictException(MSG.form_instance_sealed);
        if (instance.status !== FormInstanceStatus.DRAFT) throw new ConflictException(MSG.form_instance_sent_locked);
        this.instances.assertComplete(instance);

        const party = await this.resolveCounterparty(tx, companyId, input.counterparty);
        const now = new Date();
        const deadline = await this.deadlineFor(tx, instance, now);
        const nafathRequired = await this.nafathRequired(tx, companyId, input.entityBaseValue);
        if (nafathRequired) assertNafathPossible(party.country, input.counterparty!);

        await tx.formSignature.create({
          data: {
            companyId,
            instanceId: id,
            role: FormSignerRole.STAFF,
            level: FormSignatureLevel.DRAWN_STAFF_SESSION,
            channel: FormSignatureChannel.STAFF_DEVICE,
            signerName: input.actor.name,
            signerUserId: input.actor.id,
            evidenceKey: stored.key,
            evidenceSha256: bytesSha256(drawing.buffer),
            signedContentHash: contentHashOf(instance),
            ip: input.meta.ip,
            userAgent: input.meta.userAgent,
          },
        });
        await tx.formInstance.update({
          where: { id },
          data: {
            status: FormInstanceStatus.AWAITING_SIGNATURE,
            revisionGroupId: groupIdOf(instance),
            sentAt: now,
            signDeadline: deadline,
            counterpartyCustomerId: party.customerId,
            nafathRequired,
          },
        });
        await recordFormEvent(tx, { companyId, instanceId: id, kind: 'STAFF_SIGNED', actor: input.actor.name });
        const token = await this.openLink(tx, companyId, id, FormLinkPurpose.SIGN, FormSignerRole.COUNTERPARTY, deadline);
        return { to: party.mobile, masked: party.masked, token, instanceId: id };
      });
    } catch (e) {
      // الرسمُ رُفع قبل المعاملة: إن ارتدّت لا يبقى ملفٌّ يتيم (كصور التسليم).
      await this.files.remove(companyId, stored.key).catch(() => undefined);
      throw e;
    }
    const delivery = await this.deliver(companyId, outbound.instanceId, outbound.to, outbound.masked, SMS_TEXT.sign(formLinkUrl(outbound.token)), 'LINK_SENT', 'LINK_SEND_FAILED', input.actor.name);
    return { form: await this.instances.get(companyId, linked, id), delivery };
  }

  /** رابطٌ جديد للنسخة نفسِها إن لم يصل الأوّل — ولا يمسّ المدّة. */
  async resendLink(companyId: string, linked: FormLinkedEntity, id: string, actor: FormActor) {
    const outbound = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.instances.load(tx, linked, id);
      if (instance.status !== FormInstanceStatus.AWAITING_SIGNATURE) throw new ConflictException(MSG.form_signing_not_awaiting);
      if (!instance.signDeadline || instance.signDeadline.getTime() <= Date.now()) throw new ConflictException(MSG.form_signing_deadline_passed);
      const party = await this.partyOf(tx, companyId, instance.counterpartyCustomerId);
      const token = await this.openLink(tx, companyId, id, FormLinkPurpose.SIGN, FormSignerRole.COUNTERPARTY, instance.signDeadline);
      return { to: party.mobile, masked: party.masked, token };
    });
    const delivery = await this.deliver(companyId, id, outbound.to, outbound.masked, SMS_TEXT.sign(formLinkUrl(outbound.token)), 'LINK_SENT', 'LINK_SEND_FAILED', actor.name);
    return { form: await this.instances.get(companyId, linked, id), delivery };
  }

  /**
   * **النسخةُ المعدّلة** (`ق-١٦٦٩`): ردُّ الموظّف على الاعتراض سجلٌّ جديدٌ في المجموعة نفسِها، برقم نسخته ومعرّف سابقته، وقيمُه منسوخةٌ
   * من السابقة ليصحّحها؛ والسابقةُ تبقى «معترَضاً عليه» لا تُعدَّل. ولا نسخةَ بعد انقضاء المدّة (`ق-١٦٧١`)، ولا نسختين لسابقةٍ واحدة.
   */
  async revise(companyId: string, linked: FormLinkedEntity, id: string, actor: FormActor) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "form_instances" WHERE "id" = ${id} FOR UPDATE`;
      const objected = await this.instances.load(tx, linked, id);
      if (objected.status !== FormInstanceStatus.OBJECTED) throw new ConflictException(MSG.form_revision_requires_objection);
      if (!objected.signDeadline || objected.signDeadline.getTime() <= Date.now()) throw new ConflictException(MSG.form_signing_deadline_passed);
      const existing = await tx.formInstance.count({ where: { previousRevisionId: id } });
      if (existing > 0) throw new ConflictException(MSG.form_revision_exists);
      const created = await tx.formInstance.create({
        data: {
          companyId,
          templateVersionId: objected.templateVersionId,
          linkedEntityType: objected.linkedEntityType,
          linkedEntityId: objected.linkedEntityId,
          formDate: objected.formDate,
          filledById: actor.id,
          filledByName: actor.name,
          revisionGroupId: groupIdOf(objected),
          revisionNo: objected.revisionNo + 1,
          previousRevisionId: objected.id,
        },
        select: { id: true },
      });
      for (const v of objected.values) {
        await tx.formValue.create({
          data: { companyId, instanceId: created.id, itemId: v.itemId, textValue: v.textValue, numberValue: v.numberValue, boolValue: v.boolValue, note: v.note },
        });
      }
      await recordFormEvent(tx, { companyId, instanceId: objected.id, kind: 'REVISED', actor: actor.name, note: `النسخة ${objected.revisionNo + 1}` });
      return presentInstance(await this.instances.load(tx, linked, created.id));
    });
  }

  /** سجلُّ أحداث المجموعة كلِّها — الإرسالُ والتذكيرُ والفتحُ والدخولُ والتوقيعُ والاعتراض، بترتيب وقوعها. */
  events(companyId: string, linked: FormLinkedEntity, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.instances.load(tx, linked, id);
      const group = groupIdOf(instance);
      const members = await tx.formInstance.findMany({ where: { OR: [{ id: group }, { revisionGroupId: group }] }, select: { id: true, revisionNo: true } });
      const revisionOf = new Map(members.map((m) => [m.id, m.revisionNo]));
      const rows = await tx.formSigningEvent.findMany({ where: { instanceId: { in: members.map((m) => m.id) } }, orderBy: [{ at: 'asc' }, { id: 'asc' }] });
      return rows.map((e) => ({ kind: e.kind, actor: e.actor, recipientMasked: e.recipientMasked, note: e.note, at: e.at.toISOString(), revisionNo: revisionOf.get(e.instanceId) ?? 1 }));
    });
  }

  /** صورةُ رسمٍ أو ورقةٍ أو اعتراضٍ للموظّف — تُبثّ عبر الخادم من المخزن الحسّاس. */
  async evidence(companyId: string, linked: FormLinkedEntity, id: string, which: { signatureId?: string; objection?: true }) {
    const found = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.instances.load(tx, linked, id);
      if (which.signatureId) {
        const s = await tx.formSignature.findFirst({ where: { id: which.signatureId, instanceId: id }, select: { evidenceKey: true } });
        return s?.evidenceKey ? { key: s.evidenceKey, mime: 'image/png' } : null;
      }
      const o = await tx.formObjection.findFirst({ where: { instanceId: id }, select: { photoKey: true, photoMime: true } });
      return o?.photoKey ? { key: o.photoKey, mime: o.photoMime ?? 'application/octet-stream' } : null;
    });
    if (!found) throw new NotFoundException(MSG.form_evidence_not_found);
    return { buffer: await this.files.readSensitive(companyId, found.key), mime: found.mime };
  }

  // ── داخليّ ───────────────────────────────────────────────────────────────

  /** يفتح رابطاً لنسخةٍ وغرضٍ ويُعيد رمزَه نصّاً مرّةً واحدة (لا يُخزَّن إلا بصمتُه). */
  async openLink(tx: Tx, companyId: string, instanceId: string, purpose: FormLinkPurpose, role: FormSignerRole, expiresAt: Date | null): Promise<string> {
    const token = newOpaqueToken();
    await tx.formSigningLink.create({ data: { companyId, instanceId, purpose, recipientRole: role, tokenHash: opaqueTokenHash(token), expiresAt } });
    return token;
  }

  /** يرسل رسالةً بعد الالتزام ويُسجّل نتيجتَها حدثاً — والفشلُ يُعاد من الشاشة لا يُرمى على ما التزم. */
  async deliver(companyId: string, instanceId: string, to: string, masked: string, text: string, ok: 'LINK_SENT' | 'FINAL_SENT' | 'OTP_SENT', failed: 'LINK_SEND_FAILED' | 'FINAL_SEND_FAILED' | 'OTP_SEND_FAILED', actor: string) {
    let delivered = true;
    try {
      await this.gateway.sms().send({ to, text });
    } catch (e) {
      delivered = false;
      this.logger.warn(`تعذّر إرسالُ رسالة النموذج ${instanceId}: ${(e as Error).message}`);
    }
    await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      recordFormEvent(tx, { companyId, instanceId, kind: delivered ? ok : failed, actor, recipientMasked: masked }),
    );
    return delivered ? ('SENT' as const) : ('FAILED' as const);
  }

  /** الطرفُ قبل الإرسال: له جوالٌ صالحٌ بإقليم المنشأة، والشخصُ الاعتباريُّ يوقّع عنه ممثّلُه. */
  private async resolveCounterparty(tx: Tx, companyId: string, party: FormCounterparty | null) {
    if (!party) throw new ConflictException(MSG.form_signing_no_counterparty);
    if (party.kind === 'LEGAL_PERSON') throw new ConflictException(MSG.form_signing_representative_required);
    const country = (await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { country: true } })).country;
    const mobile = normalizeMobile(party.mobile, country);
    if (!mobile) throw new ConflictException(MSG.form_signing_mobile_invalid);
    return { customerId: party.customerId, mobile, masked: maskMobile(mobile, country), country };
  }

  /** الطرفُ بعد الإرسال من بطاقته الآن (مصدرُ الحقيقة) — لإعادة الرابط والرمز والتذكير. */
  async partyOf(tx: Tx, companyId: string, customerId: string | null) {
    if (!customerId) throw new ConflictException(MSG.form_signing_no_counterparty);
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, kind: true, phone: true, otherIdScheme: true, otherIdIndex: true, otherIdCipher: true } });
    if (!customer) throw new ConflictException(MSG.form_signing_no_counterparty);
    const country = (await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { country: true } })).country;
    const mobile = normalizeMobile(customer.phone, country);
    if (!mobile) throw new ConflictException(MSG.form_signing_mobile_invalid);
    return { customer, mobile, masked: maskMobile(mobile, country), index: mobileIndex(companyId, mobile), country };
  }

  /** موعدُ الانقضاء: من أوّل إرسالٍ بمدّة النوع، وترثه النسخةُ المعدّلة ولا تُرسل بعده (`ق-١٦٧١`). */
  private async deadlineFor(tx: Tx, instance: InstanceFull, now: Date): Promise<Date> {
    if (!instance.previousRevisionId) return deadlineFrom(now, await signPeriodDaysFor(tx, instance.templateVersion.formTypeId));
    const previous = await tx.formInstance.findUniqueOrThrow({ where: { id: instance.previousRevisionId }, select: { signDeadline: true } });
    if (!previous.signDeadline || previous.signDeadline.getTime() <= now.getTime()) throw new ConflictException(MSG.form_signing_deadline_passed);
    return previous.signDeadline;
  }

  /** نفاذٌ شرطٌ فوق حدّ المنشأة بقيمة الكيان بعملة أساسها (`ق-١٦٣٥` ①)، والحدُّ الفارغ لا يشترط. */
  private async nafathRequired(tx: Tx, companyId: string, value: Prisma.Decimal | null): Promise<boolean> {
    const { formsNafathThreshold } = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { formsNafathThreshold: true } });
    if (formsNafathThreshold === null || value === null) return false;
    return new Prisma.Decimal(value).greaterThan(formsNafathThreshold);
  }
}

/** نفاذٌ يتحقّق برقم هويّةٍ في البطاقة بمخطّطٍ يعرفه مزوّدُ الإقليم، وإلا فلا يُرسل الرابطُ لنسخةٍ تشترطه (معلَنٌ في تقرير ٢٨٧). */
function assertNafathPossible(country: string, party: FormCounterparty): void {
  const plan = identityPlanOf(country);
  if (!plan || !party.idScheme || !party.idIndex || !plan.idSchemes.includes(party.idScheme)) {
    throw new ConflictException(formatMessage(MSG.form_signing_nafath_id_missing, { provider: plan?.displayName ?? '' }));
  }
}
