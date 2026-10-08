import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FormInstanceStatus, FormLinkPurpose, FormSignatureChannel, FormSignatureLevel, FormSignerRole, Prisma } from '@mad-app/db';
import { decryptField, encryptField } from '../common/crypto/field-cipher.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { identityPlanOf, maskMobile, normalizeMobile } from '../common/region/mobile';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { customerOtherIdIndex, decryptCustomerOtherId, normalizeOtherId } from '../customers/customer-identity.util';
import { FilesService } from '../files/files.service';
import type { AuthorityType } from '../verification/providers';
import { VerificationGateway } from '../verification/verification-gateway.service';
import { mobileIndex } from '../verification/otp-challenges.service';
import { signPeriodDaysFor } from './form-signing-settings.service';
import { bytesSha256, deadlineFrom, formLinkUrl, newOpaqueToken, opaqueTokenHash, recordFormEvent, SMS_TEXT, type FormSigningEventKind } from './form-signing.util';
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

/**
 * ⚖️ **ممثّلُ الشخص الاعتباريّ** كما يدخله الموظّف عند الإرسال (توجيه ٢٨٧ ⑥ · `ق-١٥٩١` · `ق-١٦٣٥` ②): مديرٌ مقيّدٌ في السجلّ التجاريّ أو
 * وكيلٌ بوكالةٍ من ناجز، بنوع السند ورقمه، وجوالُه يستلم الرابط، ورقمُ هويّته حين يلزم نفاذ وحدَه.
 */
export interface RepresentativeInput {
  name: string;
  mobile: string;
  authorityType: string;
  authorityRef: string;
  nationalId?: string | null;
}

/** سندُ الممثّل كما يُختم مع توقيعه. */
export interface RecipientAuthority {
  type: string;
  ref: string;
  evidenceKey: string | null;
  evidenceSha256: string | null;
  verification: string | null;
}

/**
 * **من يستلم الرابطَ ويوقّع عن الطرف**: الطرفُ نفسُه من بطاقة عميله، أو ممثّلُه من صفّ التعيين. جوالُه كاملاً للإرسال وحدَه، ومقنَّعاً
 * وبصمتُه لما يُكتب (`ق-١٦٦٨`)، وبصمةُ هويّته بدالّة بطاقة العميل نفسِها فيقابلها نفاذٌ بطريقةٍ واحدة.
 */
export interface FormRecipient {
  role: FormSignerRole;
  name: string;
  customerId: string | null;
  kind: string | null;
  mobile: string;
  masked: string;
  index: string;
  country: string;
  idScheme: string | null;
  idIndex: string | null;
  nationalId: () => string | null;
  authority: RecipientAuthority | null;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const PAPER_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const AUTHORITY_TYPES: ReadonlySet<string> = new Set<AuthorityType>(['CR_MANAGER', 'NAJIZ_POA']);
const REPRESENTATIVE_ID_SCHEME = 'NAT';

const designationAad = (companyId: string, id: string, field: 'mobile' | 'national_id') => `${companyId}|form_signer_designations.${field}|${id}`;

/** صورةُ الرسم ساكنةً (`ق-١٦٣٥` ⑫): صورةٌ لا غير، وغيرُ فارغة. */
export function assertDrawing(file: UploadedEvidence | undefined): UploadedEvidence {
  if (!file || !file.buffer?.length) throw new BadRequestException(MSG.form_signature_drawing_required);
  if (!IMAGE_TYPES.has(file.mimetype)) throw new BadRequestException(MSG.form_signature_drawing_type);
  return file;
}

/** حقولُ الممثّل كاملةً قبل أيّ نداء (`ق-١٦٣٥` ②: «حقلان إلزاميان» للسند). */
function representativeOf(input: RepresentativeInput | null | undefined): RepresentativeInput | null {
  if (!input) return null;
  const name = input.name?.trim() ?? '';
  const ref = input.authorityRef?.trim() ?? '';
  if (!name || !input.mobile?.trim() || !AUTHORITY_TYPES.has(input.authorityType) || !ref) throw new BadRequestException(MSG.form_representative_required_fields);
  const nationalId = input.nationalId?.trim() ? normalizeOtherId(REPRESENTATIVE_ID_SCHEME, input.nationalId) : null;
  return { name, mobile: input.mobile.trim(), authorityType: input.authorityType, authorityRef: ref, nationalId };
}

/**
 * ⚖️ **مسارُ التوقيع من جهة الموظّف** (توجيه ٢٨٧ ① و③ · `ق-١٦٢٠` · `ق-١٦٦٨` إلى `ق-١٦٧١`).
 *
 * **الموظّفُ يعبّئ النموذجَ كاملاً ويوقّع، ثم يُرسل رابطُه للمستأجر**: التوقيعُ صفٌّ ملحقٌ فقط بمستوى «مرسومٌ بجلسة الموظّف» وبصمةِ ما وُقّع
 * عليه، والنسخةُ تصير «تنتظر التوقيع» ولا تُعدَّل بعدها، **وموعدُ الانقضاء يُختم عند أوّل إرسال** وترثه النسخُ المعدّلة (`ق-١٦٧١`). **والرابطُ
 * إلى جوال المستأجر المسجَّل في بطاقته** مطبَّعاً بإقليم المنشأة، ورمزُه بصمةٌ في القاعدة. **ونفاذٌ شرطٌ** لنسخةٍ قيمةُ كيانها فوق حدّ المنشأة
 * (`ق-١٦٣٣` ①ب)، فيُرفض الإرسالُ إن خلت البطاقةُ من رقم هويّةٍ يتحقّق منه نفاذ. **والرسالةُ تُرسل بعد الالتزام** لا داخل المعاملة (مهلتُها
 * خمسُ ثوانٍ، ونداءُ الشبكة لا يحبسها)، وفشلُها يُسجَّل حدثاً ويُعاد الإرسالُ من الشاشة.
 *
 * ⚖️ **والشخصُ الاعتباريّ يوقّع عنه ممثّلُه** (⑥): يُعيَّن عند الإرسال بسنده، ويُتحقَّق من السند قبل المعاملة (مزوّدٌ خلف واجهة؛ وبلا مزوّدٍ
 * يُسجَّل «لم يُتحقَّق منه» ولا يُحبس به التوقيع، وما لم يُعثر عليه يُرفض)، والتعيينُ للمجموعة كلِّها فترثه النسخُ المعدّلة. **والورقيّ** (⑧)
 * صورةُ الورقة الموقَّعة يشهد عليها الموظّف، **ورابطُ جهاز الموظّف** (⑤) الخطوتان نفسُهما بقناةٍ تُسجَّل.
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

  /** الموظّفُ يوقّع النسخةَ ويرسل رابطَها (`ق-١٦٢٠`)، والشخصُ الاعتباريّ إلى ممثّله. */
  async signAndSend(
    companyId: string,
    linked: FormLinkedEntity,
    id: string,
    input: {
      actor: FormActor;
      drawing: UploadedEvidence | undefined;
      counterparty: FormCounterparty | null;
      entityBaseValue: Prisma.Decimal | null;
      meta: RequestMeta;
      representative?: RepresentativeInput | null;
      authorityDocument?: UploadedEvidence | undefined;
    },
  ) {
    const drawing = assertDrawing(input.drawing);
    const rep = representativeOf(input.representative);
    const document = rep && input.authorityDocument?.buffer?.length ? input.authorityDocument : null;
    if (document && !PAPER_TYPES.has(document.mimetype)) throw new BadRequestException(MSG.form_paper_file_required);
    // السندُ يُسأل عنه قبل المعاملة (نداءُ شبكة)، وما لم يُعثر عليه لا يُعيَّن به أحد.
    const verification = rep ? await this.verifyAuthority(rep) : null;
    const stored = await this.files.uploadSensitive(companyId, drawing);
    const storedDocument = document ? await this.files.uploadSensitive(companyId, document) : null;
    let outbound: { to: string; masked: string; token: string; instanceId: string } | null = null;
    try {
      outbound = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "form_instances" WHERE "id" = ${id} FOR UPDATE`;
        const instance = await this.instances.load(tx, linked, id);
        if (instance.status === FormInstanceStatus.SEALED) throw new ConflictException(MSG.form_instance_sealed);
        if (instance.status !== FormInstanceStatus.DRAFT) throw new ConflictException(MSG.form_instance_sent_locked);
        this.instances.assertComplete(instance);

        const party = input.counterparty;
        if (!party) throw new ConflictException(MSG.form_signing_no_counterparty);
        const country = await countryOf(tx, companyId);
        const now = new Date();
        const deadline = await this.deadlineFor(tx, instance, now);
        const nafathRequired = await this.nafathRequired(tx, companyId, input.entityBaseValue);
        const group = groupIdOf(instance);

        let recipient: { role: FormSignerRole; mobile: string; masked: string; designated: boolean };
        if (party.kind === 'LEGAL_PERSON') {
          recipient = await this.designateRepresentative(tx, companyId, instance, group, country, nafathRequired, rep, verification, storedDocument && document ? { key: storedDocument.key, sha256: bytesSha256(document.buffer) } : null);
        } else {
          if (rep) throw new BadRequestException(MSG.form_representative_legal_only);
          // بديلٌ وافق عليه المستأجر يبقى للمجموعة: النسخةُ المعدّلة تُرسل إليه (`ق-١٦٧٢`).
          const substitute = instance.previousRevisionId ? await this.approvedSubstitute(tx, group) : null;
          if (substitute) {
            if (nafathRequired && !substitute.nationalIdIndex) throw new ConflictException(MSG.form_substitute_nafath_id);
            const mobile = decryptField(substitute.mobileCipher, designationAad(companyId, substitute.id, 'mobile'));
            recipient = { role: FormSignerRole.SUBSTITUTE, mobile, masked: substitute.mobileMasked, designated: false };
          } else {
            const mobile = normalizeMobile(party.mobile, country);
            if (!mobile) throw new ConflictException(MSG.form_signing_mobile_invalid);
            if (nafathRequired) assertNafathPossible(country, party);
            recipient = { role: FormSignerRole.COUNTERPARTY, mobile, masked: maskMobile(mobile, country), designated: false };
          }
        }

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
            revisionGroupId: group,
            sentAt: now,
            signDeadline: deadline,
            counterpartyCustomerId: party.customerId,
            nafathRequired,
          },
        });
        await recordFormEvent(tx, { companyId, instanceId: id, kind: 'STAFF_SIGNED', actor: input.actor.name });
        if (recipient.designated) await recordFormEvent(tx, { companyId, instanceId: id, kind: 'REPRESENTATIVE_DESIGNATED', actor: input.actor.name, recipientMasked: recipient.masked });
        const token = await this.openLink(tx, companyId, id, FormLinkPurpose.SIGN, recipient.role, deadline);
        return { to: recipient.mobile, masked: recipient.masked, token, instanceId: id };
      });
    } catch (e) {
      // الرسمُ والسندُ رُفعا قبل المعاملة: إن ارتدّت لا يبقى ملفٌّ يتيم (كصور التسليم).
      await this.files.remove(companyId, stored.key).catch(() => undefined);
      if (storedDocument) await this.files.remove(companyId, storedDocument.key).catch(() => undefined);
      throw e;
    }
    const delivery = await this.deliver(companyId, outbound.instanceId, outbound.to, outbound.masked, SMS_TEXT.sign(formLinkUrl(outbound.token)), 'LINK_SENT', 'LINK_SEND_FAILED', input.actor.name);
    return { form: await this.instances.get(companyId, linked, id), delivery };
  }

  /** رابطٌ جديد للنسخة نفسِها إن لم يصل الأوّل — ولا يمسّ المدّة. */
  async resendLink(companyId: string, linked: FormLinkedEntity, id: string, actor: FormActor) {
    const outbound = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.awaiting(tx, linked, id);
      const role = await this.recipientRoleOf(tx, instance);
      const recipient = await this.recipientOf(tx, companyId, instance, role);
      const token = await this.openLink(tx, companyId, id, FormLinkPurpose.SIGN, role, instance.signDeadline);
      return { to: recipient.mobile, masked: recipient.masked, token };
    });
    const delivery = await this.deliver(companyId, id, outbound.to, outbound.masked, SMS_TEXT.sign(formLinkUrl(outbound.token)), 'LINK_SENT', 'LINK_SEND_FAILED', actor.name);
    return { form: await this.instances.get(companyId, linked, id), delivery };
  }

  /**
   * ⚖️ **طلبُ مستلمٍ بديل** (توجيه ٢٨٧ ⑦ · `ق-١٦٣٥` ⑨ · `ق-١٦٧٢`): الموظّفُ يُدخل اسمَ البديل وجوالَه، فيُحفظ تعييناً «ينتظر موافقة
   * المستأجر»، **ويصل جوالَ المستأجر المسجَّل رابطٌ يدخله برمزه** فيرى اسمَ البديل والنموذجَ ويوافق أو يرفض؛ **والرمزُ لا يمرّ بالموظّف**. ولا
   * بديلَ عن ممثّل شخصٍ اعتباريّ (الممثّلُ نفسُه من يُعيَّن)، وطلبٌ جديد يحلّ محلّ ما لم يُحكم فيه.
   *
   * ⚠️ **ولا بديلَ في نموذجٍ يشترط نفاذ، حتى يحكم صاحبُ المشروع**: موافقةُ البديل على حفظ بياناته بإدخال رمزٍ يحمل نصَّ الإحاطة (`ق-١٦٧٣` ·
   * `ق-١٦٧٤`)، والنموذجُ الذي يشترط نفاذ لا رمزَ فيه؛ فيُردّ مسمّىً ولا يُخمَّن كيف يجتمعان. **ولا يُحفظ رقمُ هويّته** لأنه لا يلزم إلا لنفاذ.
   */
  async requestSubstitute(companyId: string, linked: FormLinkedEntity, id: string, actor: FormActor, input: { name: string; mobile: string }) {
    const name = input.name?.trim() ?? '';
    if (!name || !input.mobile?.trim()) throw new BadRequestException(MSG.form_substitute_required_fields);
    const outbound = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "form_instances" WHERE "id" = ${id} FOR UPDATE`;
      const instance = await this.awaiting(tx, linked, id);
      const group = groupIdOf(instance);
      if (await this.activeRepresentative(tx, group)) throw new ConflictException(MSG.form_substitute_not_for_representative);
      const tenant = await this.recipientOf(tx, companyId, instance, FormSignerRole.COUNTERPARTY);
      const mobile = normalizeMobile(input.mobile, tenant.country);
      if (!mobile) throw new ConflictException(MSG.form_signing_mobile_invalid);
      if (mobile === tenant.mobile) throw new ConflictException(MSG.form_substitute_same_mobile);
      if (instance.nafathRequired) throw new ConflictException(MSG.form_substitute_nafath_id);
      // طلبٌ جديد يحلّ محلّ ما ينتظر؛ والموافَقُ عليه يبقى حتى يحلّ محلَّه موافَقٌ أحدث.
      await tx.formSignerDesignation.updateMany({ where: { groupId: group, role: FormSignerRole.SUBSTITUTE, status: 'PENDING_CONSENT' }, data: { status: 'REPLACED', decidedAt: new Date() } });
      await tx.formSigningLink.updateMany({ where: { instanceId: id, purpose: FormLinkPurpose.SUBSTITUTE_CONSENT, revokedAt: null }, data: { revokedAt: new Date() } });
      const designationId = randomUUID();
      const masked = maskMobile(mobile, tenant.country);
      await tx.formSignerDesignation.create({
        data: {
          id: designationId,
          companyId,
          instanceId: id,
          groupId: group,
          role: FormSignerRole.SUBSTITUTE,
          name,
          mobileCipher: encryptField(mobile, designationAad(companyId, designationId, 'mobile')),
          mobileMasked: masked,
          mobileIndex: mobileIndex(companyId, mobile),
          status: 'PENDING_CONSENT',
        },
      });
      await recordFormEvent(tx, { companyId, instanceId: id, kind: 'SUBSTITUTE_REQUESTED', actor: actor.name, recipientMasked: masked });
      const token = await this.openLink(tx, companyId, id, FormLinkPurpose.SUBSTITUTE_CONSENT, FormSignerRole.COUNTERPARTY, instance.signDeadline);
      return { to: tenant.mobile, masked: tenant.masked, token };
    });
    const delivery = await this.deliver(companyId, id, outbound.to, outbound.masked, SMS_TEXT.substituteConsent(formLinkUrl(outbound.token)), 'LINK_SENT', 'LINK_SEND_FAILED', actor.name);
    return { form: await this.instances.get(companyId, linked, id), delivery };
  }

  /**
   * ⚖️ **التوقيعُ على جهاز الموظّف** (توجيه ٢٨٧ ⑤ · `ق-١٦٢٠`): رابطٌ للنسخة نفسِها يُفتح على جهاز الموظّف بحضور الطرف، **والخطوتان نفسُهما**:
   * الرمزُ إلى جوال الطرف أو نفاذ، ثم المراجعةُ والتوقيع. لا يُرسل إلى أحد، ويعود للموظّف مرّةً واحدة، وينتهي بانتهاء المدّة أو الإقفال، والقناةُ
   * «جهاز الموظّف» على صفّ التوقيع.
   */
  async staffDeviceLink(companyId: string, linked: FormLinkedEntity, id: string, actor: FormActor) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.awaiting(tx, linked, id);
      const role = await this.recipientRoleOf(tx, instance);
      const token = await this.openLink(tx, companyId, id, FormLinkPurpose.SIGN, role, instance.signDeadline, true);
      await recordFormEvent(tx, { companyId, instanceId: id, kind: 'DEVICE_LINK', actor: actor.name });
      return { url: formLinkUrl(token), expiresAt: instance.signDeadline!.toISOString() };
    });
  }

  /**
   * ⚖️ **التوقيعُ الورقيّ** (توجيه ٢٨٧ ⑧ · `ق-١٦٣٥` ⑨): من لا جوالَ له أو يرفض يوقّع ورقاً، فتُرفع صورةُ الورقة ويشهد عليها الموظّف. من
   * المسوّدة (ومعه رسمُ الموظّف فيوقّع ويُرسَل ويُختم في معاملةٍ واحدة) أو من «تنتظر التوقيع»؛ **والختمُ بالصيغة ٢ عند اكتمال التواقيع**،
   * ورابطُ النسخة النهائية إلى جوال الطرف إن صلح. ولا يُقبل على مختومٍ أو معترَضٍ عليه أو منقضٍ.
   *
   * ⚖️ **والمستأجرُ شخصٌ اعتباريّ يوقّع عنه ممثّلُه ورقاً** (`ق-١٦٧٥`): الصفُّ بدور «الممثّل» باسم من وقّع ونوعِ سنده (مديرٌ في السجلّ التجاريّ
   * أو وكالةٌ من ناجز) ورقمِه، من الطلب أو من ممثّلٍ معيَّنٍ للمجموعة؛ ويُتحقَّق من السند بالمزوّد إن وُجد (وما لم يُعثر عليه يُردّ)، **وبلا
   * مزوّدٍ «لم يُتحقَّق منه»**، وسندُه يدخل بصمةَ الختم كالممثّل الإلكترونيّ. **وشهادةُ الموظّف تبقى بديلَ نفاذ** في الورقيّ (`ق-١٦٧٦` ⑦).
   */
  async signPaper(
    companyId: string,
    linked: FormLinkedEntity,
    id: string,
    input: {
      actor: FormActor;
      paper: UploadedEvidence | undefined;
      drawing: UploadedEvidence | undefined;
      counterparty: FormCounterparty | null;
      entityBaseValue: Prisma.Decimal | null;
      signerName?: string | null;
      authority?: { type: string; ref: string } | null;
      authorityDocument?: UploadedEvidence | undefined;
      meta: RequestMeta;
    },
  ) {
    const paper = input.paper;
    if (!paper?.buffer?.length || !PAPER_TYPES.has(paper.mimetype)) throw new BadRequestException(MSG.form_paper_file_required);
    const drawing = input.drawing?.buffer?.length ? assertDrawing(input.drawing) : null;
    const document = input.authorityDocument?.buffer?.length ? input.authorityDocument : null;
    if (document && !PAPER_TYPES.has(document.mimetype)) throw new BadRequestException(MSG.form_paper_file_required);
    // من يوقّع ورقاً عن الطرف: يُقرأ قبل المعاملة لأن التحقّقَ من السند نداءُ شبكة.
    const paperRep = await this.paperRepresentativeOf(companyId, linked, id, input.counterparty, input.signerName ?? null, input.authority ?? null);
    const storedPaper = await this.files.uploadSensitive(companyId, paper);
    const storedDrawing = drawing ? await this.files.uploadSensitive(companyId, drawing) : null;
    const storedDocument = paperRep && document ? await this.files.uploadSensitive(companyId, document) : null;
    let drawingUsed = false;
    let outbound: { to: string; masked: string; token: string } | null = null;
    try {
      outbound = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "form_instances" WHERE "id" = ${id} FOR UPDATE`;
        let instance = await this.instances.load(tx, linked, id);
        const now = new Date();
        let customerId: string;
        if (instance.status === FormInstanceStatus.DRAFT) {
          if (!drawing || !storedDrawing) throw new BadRequestException(MSG.form_signature_drawing_required);
          this.instances.assertComplete(instance);
          if (!input.counterparty) throw new ConflictException(MSG.form_signing_no_counterparty);
          customerId = input.counterparty.customerId;
          const deadline = await this.deadlineFor(tx, instance, now);
          const nafathRequired = await this.nafathRequired(tx, companyId, input.entityBaseValue);
          await tx.formSignature.create({
            data: {
              companyId,
              instanceId: id,
              role: FormSignerRole.STAFF,
              level: FormSignatureLevel.DRAWN_STAFF_SESSION,
              channel: FormSignatureChannel.STAFF_DEVICE,
              signerName: input.actor.name,
              signerUserId: input.actor.id,
              evidenceKey: storedDrawing.key,
              evidenceSha256: bytesSha256(drawing.buffer),
              signedContentHash: contentHashOf(instance),
              ip: input.meta.ip,
              userAgent: input.meta.userAgent,
            },
          });
          drawingUsed = true;
          await tx.formInstance.update({
            where: { id },
            data: { status: FormInstanceStatus.AWAITING_SIGNATURE, revisionGroupId: groupIdOf(instance), sentAt: now, signDeadline: deadline, counterpartyCustomerId: customerId, nafathRequired },
          });
          await recordFormEvent(tx, { companyId, instanceId: id, kind: 'STAFF_SIGNED', actor: input.actor.name });
          instance = await this.instances.load(tx, linked, id);
        } else if (instance.status === FormInstanceStatus.AWAITING_SIGNATURE) {
          if (!instance.signDeadline || instance.signDeadline.getTime() <= now.getTime()) throw new ConflictException(MSG.form_signing_deadline_passed);
          const staff = instance.signatures.find((s) => s.role === FormSignerRole.STAFF);
          if (!staff || staff.signedContentHash !== contentHashOf(instance)) throw new ConflictException(MSG.form_signing_content_changed);
          if (!instance.counterpartyCustomerId) throw new ConflictException(MSG.form_signing_no_counterparty);
          customerId = instance.counterpartyCustomerId;
        } else {
          throw new ConflictException(MSG.form_paper_not_allowed);
        }

        const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, kind: true, phone: true } });
        if (!customer) throw new ConflictException(MSG.form_signing_no_counterparty);
        // الصفةُ تُقرأ ثانيةً تحت القفل: الحكمُ بما في البطاقة الآن لا بما قُرئ قبل المعاملة.
        if ((customer.kind === 'LEGAL_PERSON') !== !!paperRep) throw new ConflictException(MSG.form_signing_content_changed);
        const country = await countryOf(tx, companyId);
        // الجوالُ اختياريٌّ هنا (من لا جوالَ له يوقّع ورقاً): يُكتب مقنَّعاً وبصمتَه إن صلح، ويُرسل إليه رابطُ النسخة النهائية؛ وللممثّل جوالُه
        // المعيَّن إن وُجد، وإلا فجوالُ البطاقة للنسخة النهائية وحدَها لا على صفّ توقيعه.
        const cardMobile = normalizeMobile(customer.phone, country);
        const signerMobile = paperRep ? paperRep.mobile : cardMobile;
        const masked = signerMobile ? maskMobile(signerMobile, country) : null;
        const finalMobile = paperRep ? (paperRep.mobile ?? cardMobile) : cardMobile;
        await tx.formSignature.create({
          data: {
            companyId,
            instanceId: id,
            role: paperRep ? FormSignerRole.REPRESENTATIVE : FormSignerRole.COUNTERPARTY,
            level: FormSignatureLevel.PAPER_WITNESSED,
            channel: FormSignatureChannel.PAPER,
            signerName: paperRep ? paperRep.name : input.signerName?.trim() || customer.name,
            signerCustomerId: customer.id,
            signerKind: customer.kind,
            authorityType: paperRep?.type ?? null,
            authorityRef: paperRep?.ref ?? null,
            authorityEvidenceKey: paperRep ? (storedDocument?.key ?? paperRep.evidenceKey) : null,
            authorityEvidenceSha256: paperRep ? (storedDocument && document ? bytesSha256(document.buffer) : paperRep.evidenceSha256) : null,
            authorityVerification: paperRep?.verification ?? null,
            mobileMasked: masked,
            mobileIndex: signerMobile ? mobileIndex(companyId, signerMobile) : null,
            evidenceKey: storedPaper.key,
            evidenceSha256: bytesSha256(paper.buffer),
            signedContentHash: contentHashOf(instance),
            witnessUserId: input.actor.id,
            witnessUserName: input.actor.name,
            ip: input.meta.ip,
            userAgent: input.meta.userAgent,
          },
        });
        await recordFormEvent(tx, { companyId, instanceId: id, kind: 'PAPER_UPLOADED', actor: input.actor.name });
        await recordFormEvent(tx, { companyId, instanceId: id, kind: 'SIGNED', actor: input.actor.name, note: 'ورقيّ بشهادة الموظّف' });
        await this.instances.sealWithinTx(tx, id, input.actor);
        await recordFormEvent(tx, { companyId, instanceId: id, kind: 'SEALED', actor: input.actor.name });
        await tx.formSigningLink.updateMany({ where: { instanceId: id, revokedAt: null, purpose: FormLinkPurpose.SIGN }, data: { revokedAt: new Date() } });
        if (!finalMobile) return null;
        const finalRole = paperRep?.mobile ? FormSignerRole.REPRESENTATIVE : FormSignerRole.COUNTERPARTY;
        const token = await this.openLink(tx, companyId, id, FormLinkPurpose.FINAL_COPY, finalRole, null);
        return { to: finalMobile, masked: maskMobile(finalMobile, country), token };
      });
    } catch (e) {
      await this.files.remove(companyId, storedPaper.key).catch(() => undefined);
      if (storedDrawing) await this.files.remove(companyId, storedDrawing.key).catch(() => undefined);
      if (storedDocument) await this.files.remove(companyId, storedDocument.key).catch(() => undefined);
      throw e;
    }
    // رسمٌ أُرفق لنموذجٍ وقّعه الموظّفُ من قبل: لا يُستعمل ولا يبقى.
    if (storedDrawing && !drawingUsed) await this.files.remove(companyId, storedDrawing.key).catch(() => undefined);
    const finalCopy = outbound
      ? await this.deliver(companyId, id, outbound.to, outbound.masked, SMS_TEXT.finalCopy(formLinkUrl(outbound.token)), 'FINAL_SENT', 'FINAL_SEND_FAILED', input.actor.name)
      : ('NONE' as const);
    return { form: await this.instances.get(companyId, linked, id), finalCopy };
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
        const s = await tx.formSignature.findFirst({ where: { id: which.signatureId, instanceId: id }, select: { evidenceKey: true, level: true } });
        if (!s?.evidenceKey) return null;
        return { key: s.evidenceKey, mime: s.level === FormSignatureLevel.PAPER_WITNESSED ? null : 'image/png' };
      }
      const o = await tx.formObjection.findFirst({ where: { instanceId: id }, select: { photoKey: true, photoMime: true } });
      return o?.photoKey ? { key: o.photoKey, mime: o.photoMime ?? 'application/octet-stream' } : null;
    });
    if (!found) throw new NotFoundException(MSG.form_evidence_not_found);
    const buffer = await this.files.readSensitive(companyId, found.key);
    return { buffer, mime: found.mime ?? sniffMime(buffer) };
  }

  // ── داخليّ ───────────────────────────────────────────────────────────────

  /** يفتح رابطاً لنسخةٍ وغرضٍ ويُعيد رمزَه نصّاً مرّةً واحدة (لا يُخزَّن إلا بصمتُه). */
  async openLink(tx: Tx, companyId: string, instanceId: string, purpose: FormLinkPurpose, role: FormSignerRole, expiresAt: Date | null, staffDevice = false): Promise<string> {
    const token = newOpaqueToken();
    await tx.formSigningLink.create({ data: { companyId, instanceId, purpose, recipientRole: role, tokenHash: opaqueTokenHash(token), expiresAt, staffDevice } });
    return token;
  }

  /** يرسل رسالةً بعد الالتزام ويُسجّل نتيجتَها حدثاً — والفشلُ يُعاد من الشاشة لا يُرمى على ما التزم. */
  async deliver(companyId: string, instanceId: string, to: string, masked: string, text: string, ok: FormSigningEventKind, failed: FormSigningEventKind, actor: string) {
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

  /** الطرفُ بعد الإرسال من بطاقته الآن (مصدرُ الحقيقة) — لإعادة الرابط والرمز والتذكير. */
  async partyOf(tx: Tx, companyId: string, customerId: string | null) {
    if (!customerId) throw new ConflictException(MSG.form_signing_no_counterparty);
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, kind: true, phone: true, otherIdScheme: true, otherIdIndex: true, otherIdCipher: true } });
    if (!customer) throw new ConflictException(MSG.form_signing_no_counterparty);
    const country = await countryOf(tx, companyId);
    const mobile = normalizeMobile(customer.phone, country);
    if (!mobile) throw new ConflictException(MSG.form_signing_mobile_invalid);
    return { customer, mobile, masked: maskMobile(mobile, country), index: mobileIndex(companyId, mobile), country };
  }

  /** من يستلم روابطَ المجموعة: بديلٌ وافق عليه المستأجر، أو ممثّلٌ معيَّن، وإلا الطرفُ نفسُه. */
  async recipientRoleOf(tx: Tx, instance: { id: string; revisionGroupId: string | null }): Promise<FormSignerRole> {
    const group = groupIdOf(instance);
    if (await this.approvedSubstitute(tx, group)) return FormSignerRole.SUBSTITUTE;
    const rep = await this.activeRepresentative(tx, group);
    return rep ? FormSignerRole.REPRESENTATIVE : FormSignerRole.COUNTERPARTY;
  }

  /** المستلمُ بدوره: الطرفُ من بطاقته الآن، أو الممثّلُ أو البديلُ من صفّ تعيينه (جوالُه يُفكّ للإرسال وحدَه). */
  async recipientOf(tx: Tx, companyId: string, instance: { id: string; revisionGroupId: string | null; counterpartyCustomerId: string | null }, role: FormSignerRole): Promise<FormRecipient> {
    if (role === FormSignerRole.SUBSTITUTE) {
      const d = await this.approvedSubstitute(tx, groupIdOf(instance));
      if (!d) throw new ConflictException(MSG.form_substitute_not_approved);
      const country = await countryOf(tx, companyId);
      return {
        role,
        name: d.name,
        customerId: instance.counterpartyCustomerId,
        kind: null,
        mobile: decryptField(d.mobileCipher, designationAad(companyId, d.id, 'mobile')),
        masked: d.mobileMasked,
        index: d.mobileIndex,
        country,
        idScheme: d.nationalIdIndex ? REPRESENTATIVE_ID_SCHEME : null,
        idIndex: d.nationalIdIndex,
        nationalId: () => (d.nationalIdCipher ? decryptField(d.nationalIdCipher, designationAad(companyId, d.id, 'national_id')) : null),
        authority: null,
      };
    }
    if (role === FormSignerRole.REPRESENTATIVE) {
      const d = await this.activeRepresentative(tx, groupIdOf(instance));
      if (!d) throw new ConflictException(MSG.form_signing_representative_required);
      const country = await countryOf(tx, companyId);
      return {
        role,
        name: d.name,
        customerId: instance.counterpartyCustomerId,
        kind: 'LEGAL_PERSON',
        mobile: decryptField(d.mobileCipher, designationAad(companyId, d.id, 'mobile')),
        masked: d.mobileMasked,
        index: d.mobileIndex,
        country,
        idScheme: d.nationalIdIndex ? REPRESENTATIVE_ID_SCHEME : null,
        idIndex: d.nationalIdIndex,
        nationalId: () => (d.nationalIdCipher ? decryptField(d.nationalIdCipher, designationAad(companyId, d.id, 'national_id')) : null),
        authority: { type: d.authorityType!, ref: d.authorityRef!, evidenceKey: d.authorityEvidenceKey, evidenceSha256: d.authorityEvidenceSha256, verification: d.authorityVerification },
      };
    }
    const p = await this.partyOf(tx, companyId, instance.counterpartyCustomerId);
    return {
      role: FormSignerRole.COUNTERPARTY,
      name: p.customer.name,
      customerId: p.customer.id,
      kind: p.customer.kind,
      mobile: p.mobile,
      masked: p.masked,
      index: p.index,
      country: p.country,
      idScheme: p.customer.otherIdScheme,
      idIndex: p.customer.otherIdIndex,
      nationalId: () => decryptCustomerOtherId(companyId, p.customer),
      authority: null,
    };
  }

  private activeRepresentative(tx: Tx, groupId: string) {
    return tx.formSignerDesignation.findFirst({ where: { groupId, role: FormSignerRole.REPRESENTATIVE, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  }

  approvedSubstitute(tx: Tx, groupId: string) {
    return tx.formSignerDesignation.findFirst({ where: { groupId, role: FormSignerRole.SUBSTITUTE, status: 'APPROVED' }, orderBy: { createdAt: 'desc' } });
  }

  /** البديلُ الذي ينتظر موافقةَ المستأجر — لرابط الموافقة وحدَه. */
  pendingSubstitute(tx: Tx, groupId: string) {
    return tx.formSignerDesignation.findFirst({ where: { groupId, role: FormSignerRole.SUBSTITUTE, status: 'PENDING_CONSENT' }, orderBy: { createdAt: 'desc' } });
  }

  private async awaiting(tx: Tx, linked: FormLinkedEntity, id: string) {
    const instance = await this.instances.load(tx, linked, id);
    if (instance.status !== FormInstanceStatus.AWAITING_SIGNATURE) throw new ConflictException(MSG.form_signing_not_awaiting);
    if (!instance.signDeadline || instance.signDeadline.getTime() <= Date.now()) throw new ConflictException(MSG.form_signing_deadline_passed);
    return instance;
  }

  /** حكمُ السند: ما لم يُعثر عليه يُرفض، وبلا مزوّدٍ «لم يُتحقَّق منه» (`ق-١٦٣٥` ②: يُشغَّل حين يُرخَّص الربط). */
  private async verifyAuthority(rep: RepresentativeInput): Promise<'VERIFIED' | 'UNVERIFIED'> {
    const verifier = this.gateway.authority();
    if (!verifier) return 'UNVERIFIED';
    const { decision } = await verifier.verify({ type: rep.authorityType as AuthorityType, ref: rep.authorityRef, representativeName: rep.name });
    if (decision !== 'VERIFIED') throw new ConflictException(MSG.form_representative_authority_not_found);
    return 'VERIFIED';
  }

  /**
   * ⚖️ **من يوقّع ورقاً عن الطرف** (`ق-١٦٧٥`): للشخص الطبيعيّ لا أحد (يوقّع بنفسه، وحقولُ السند تُردّ `400`)؛ وللشخص الاعتباريّ ممثّلٌ
   * **إمّا بثلاثته في الطلب** (اسمُ من وقّع ونوعُ السند ورقمُه، ويُتحقَّق منه بالمزوّد إن وُجد) **وإمّا ممثّلٌ معيَّنٌ للمجموعة** بسنده وحكمه
   * وجواله؛ ولا ثالث: اسمٌ بلا سندٍ، أو لا اسمَ ولا تعيين، يُردّ `400`. والصفةُ تُقرأ من حيث يقرؤها الإرسال: من الطلب للمسوّدة، ومن
   * المختوم على النسخة بعدها؛ وتُعاد قراءتُها من البطاقة تحت القفل.
   */
  private async paperRepresentativeOf(
    companyId: string,
    linked: FormLinkedEntity,
    id: string,
    counterparty: FormCounterparty | null,
    signerName: string | null,
    authority: { type: string; ref: string } | null,
  ): Promise<{
    name: string;
    type: string;
    ref: string;
    evidenceKey: string | null;
    evidenceSha256: string | null;
    verification: 'VERIFIED' | 'UNVERIFIED';
    mobile: string | null;
  } | null> {
    const context = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const instance = await this.instances.load(tx, linked, id);
      const customerId = instance.status === FormInstanceStatus.DRAFT ? (counterparty?.customerId ?? null) : instance.counterpartyCustomerId;
      if (!customerId) return null;
      const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { kind: true } });
      if (!customer) return null;
      const designation = customer.kind === 'LEGAL_PERSON' ? await this.activeRepresentative(tx, groupIdOf(instance)) : null;
      return { legal: customer.kind === 'LEGAL_PERSON', designation };
    });
    const hasAuthority = !!(authority && (authority.type?.trim() || authority.ref?.trim()));
    if (!context) return null;
    if (!context.legal) {
      if (hasAuthority) throw new BadRequestException(MSG.form_representative_legal_only);
      return null;
    }
    if (hasAuthority) {
      const name = signerName?.trim() ?? '';
      const ref = authority!.ref?.trim() ?? '';
      if (!name || !AUTHORITY_TYPES.has(authority!.type) || !ref) throw new BadRequestException(MSG.form_representative_required_fields);
      const verification = await this.verifyAuthority({ name, mobile: '', authorityType: authority!.type, authorityRef: ref });
      return { name, type: authority!.type, ref, evidenceKey: null, evidenceSha256: null, verification, mobile: null };
    }
    const d = context.designation;
    if (signerName?.trim() || !d) throw new BadRequestException(MSG.form_representative_required_fields);
    return {
      name: d.name,
      type: d.authorityType!,
      ref: d.authorityRef!,
      evidenceKey: d.authorityEvidenceKey,
      evidenceSha256: d.authorityEvidenceSha256,
      verification: (d.authorityVerification as 'VERIFIED' | 'UNVERIFIED' | null) ?? 'UNVERIFIED',
      mobile: decryptField(d.mobileCipher, designationAad(companyId, d.id, 'mobile')),
    };
  }

  /**
   * ممثّلُ الشخص الاعتباريّ: يُعيَّن بما أدخله الموظّف، أو يُورث من نسخةٍ سابقةٍ في المجموعة. ونفاذٌ إن لزم يشترط رقمَ هويّته، والرابطُ
   * إلى جواله.
   */
  private async designateRepresentative(
    tx: Tx,
    companyId: string,
    instance: InstanceFull,
    group: string,
    country: string,
    nafathRequired: boolean,
    rep: RepresentativeInput | null,
    verification: 'VERIFIED' | 'UNVERIFIED' | null,
    document: { key: string; sha256: string } | null,
  ): Promise<{ role: FormSignerRole; mobile: string; masked: string; designated: boolean }> {
    const plan = identityPlanOf(country);
    if (!rep) {
      const existing = await this.activeRepresentative(tx, group);
      if (!existing) throw new ConflictException(MSG.form_signing_representative_required);
      if (nafathRequired && !existing.nationalIdIndex) throw new ConflictException(MSG.form_representative_nafath_id);
      const mobile = decryptField(existing.mobileCipher, designationAad(companyId, existing.id, 'mobile'));
      return { role: FormSignerRole.REPRESENTATIVE, mobile, masked: existing.mobileMasked, designated: false };
    }
    const mobile = normalizeMobile(rep.mobile, country);
    if (!mobile) throw new ConflictException(MSG.form_signing_mobile_invalid);
    if (nafathRequired && (!rep.nationalId || !plan || !plan.idSchemes.includes(REPRESENTATIVE_ID_SCHEME))) throw new ConflictException(MSG.form_representative_nafath_id);
    const designationId = randomUUID();
    const masked = maskMobile(mobile, country);
    // تعيينٌ جديد يحلّ محلّ ما قبله في المجموعة: القديمُ يُستبدل حالُه ولا يُحذف.
    await tx.formSignerDesignation.updateMany({ where: { groupId: group, role: FormSignerRole.REPRESENTATIVE, status: 'ACTIVE' }, data: { status: 'REPLACED', decidedAt: new Date() } });
    await tx.formSignerDesignation.create({
      data: {
        id: designationId,
        companyId,
        instanceId: instance.id,
        groupId: group,
        role: FormSignerRole.REPRESENTATIVE,
        name: rep.name,
        mobileCipher: encryptField(mobile, designationAad(companyId, designationId, 'mobile')),
        mobileMasked: masked,
        mobileIndex: mobileIndex(companyId, mobile),
        nationalIdCipher: rep.nationalId ? encryptField(rep.nationalId, designationAad(companyId, designationId, 'national_id')) : null,
        nationalIdIndex: rep.nationalId ? customerOtherIdIndex(rep.nationalId, companyId) : null,
        authorityType: rep.authorityType,
        authorityRef: rep.authorityRef,
        authorityEvidenceKey: document?.key ?? null,
        authorityEvidenceSha256: document?.sha256 ?? null,
        authorityVerification: verification,
        status: 'ACTIVE',
      },
    });
    return { role: FormSignerRole.REPRESENTATIVE, mobile, masked, designated: true };
  }

  /** موعدُ الانقضاء: من أوّل إرسالٍ بمدّة النوع، وترثه النسخةُ المعدّلة ولا تُرسل بعده (`ق-١٦٧١`). */
  private async deadlineFor(tx: Tx, instance: InstanceFull, now: Date): Promise<Date> {
    if (!instance.previousRevisionId) return deadlineFrom(now, await signPeriodDaysFor(tx, instance.templateVersion.formTypeId));
    const previous = await tx.formInstance.findUniqueOrThrow({ where: { id: instance.previousRevisionId }, select: { signDeadline: true, status: true } });
    // السابقةُ ما زالت «معترَضاً عليها»: فإن حُسمت المجموعةُ خلافاً قائماً عند الموعد فلا تُرسل نسختُها بعده (`ق-١٦٣٣` ⑮).
    if (previous.status !== FormInstanceStatus.OBJECTED) throw new ConflictException(MSG.form_signing_deadline_passed);
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

async function countryOf(tx: Tx, companyId: string): Promise<string> {
  return (await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { country: true } })).country;
}

/** نوعُ الورقة المخزَّنة من أوّل بايتاتها — صورةٌ أو PDF. */
function sniffMime(buffer: Buffer): string {
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF') return 'image/webp';
  return 'image/png';
}

/** نفاذٌ يتحقّق برقم هويّةٍ في البطاقة بمخطّطٍ يعرفه مزوّدُ الإقليم، وإلا فلا يُرسل الرابطُ لنسخةٍ تشترطه (معلَنٌ في تقرير ٢٨٧). */
function assertNafathPossible(country: string, party: FormCounterparty): void {
  const plan = identityPlanOf(country);
  if (!plan || !party.idScheme || !party.idIndex || !plan.idSchemes.includes(party.idScheme)) {
    throw new ConflictException(formatMessage(MSG.form_signing_nafath_id_missing, { provider: plan?.displayName ?? '' }));
  }
}
