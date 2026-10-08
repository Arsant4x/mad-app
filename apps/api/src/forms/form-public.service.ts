import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { FormInstanceStatus, FormLinkPurpose, FormSignatureChannel, FormSignatureLevel, FormSignerRole, NotificationKind, Prisma } from '@mad-app/db';
import { AuditService } from '../audit/audit.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { identityPlanOf } from '../common/region/mobile';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { customerOtherIdIndex } from '../customers/customer-identity.util';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OtpChallengesService } from '../verification/otp-challenges.service';
import { VerificationGateway } from '../verification/verification-gateway.service';
import type { VerificationPurpose } from '../verification/otp-policy';
import { contentHashOf, FormInstancesService, groupIdOf, INSTANCE_INCLUDE, verifyInstanceWithinTx, type InstanceFull } from './form-instances.service';
import { assertDrawing, FormSigningService, type RequestMeta, type UploadedEvidence } from './form-signing.service';
import { bytesSha256, formLinkUrl, LINK_ACTOR, opaqueTokenHash, recordFormEvent, SMS_TEXT, type FormSigningEventKind } from './form-signing.util';

type Tx = Prisma.TransactionClient;

/** جلسةُ الدخول بعد الرمز أو نفاذ: قصيرةٌ، وبصمةٌ في القاعدة، ولنسخةٍ واحدةٍ وغرضٍ واحد (توجيه ٢٨٧ ⑪). */
export const FORM_SESSION_MS = 30 * 60 * 1000;

const PHOTO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

type LinkRow = Prisma.FormSigningLinkGetPayload<object>;

/**
 * ⚖️ **صفحةُ الرابط العامّة** (توجيه ٢٨٧ ① إلى ③ و⑨ و⑪ · `ق-١٦٢٠` · `ق-١٦٣٣` · السطحُ الخامس في الخطّة §٥: «أخطرُ سطحٍ أمنيٍّ في الخطّة»).
 *
 * **الفاعلُ العميلُ النهائيّ** (`CLAUDE.md §3.5`) بلا حساب، **وما يملكه نموذجُه وحدَه**: الرابطُ يُقرأ ببصمة رمزه في معاملةٍ ضيّقة (قراءةُ صفٍّ
 * واحد)، وكلُّ ما بعده في سياق منشأته وعلى نسخته وحدَها. **وقبل الدخول لا تُقرأ من السجلّ كلمة**: لا اسمَ ولا صورةَ ولا مبلغ ولا اسمَ منشأة؛
 * والدخولُ **برمزٍ إلى الجوال المسجَّل في بطاقته** أو **بنفاذ** (شرطٌ فوق حدّ المنشأة)، ولا بريدَ بديلاً. **والجلسةُ** بصمةٌ على صفّ الرابط،
 * ثلاثون دقيقةً لهذه النسخة. **والتوقيعُ** صورةُ رسمٍ ساكنةٌ وبصمةُ ما وُقّع عليه، **وهو الختم** حين يكتمل النصاب (`ق-١٦٧٠`). **والاعتراضُ**
 * ملاحظةٌ وصورة، فيصير النموذجُ «معترَضاً عليه» (`ق-١٦٦٩`). **وكلُّ خطوةٍ** حدثٌ في سجلّ النموذج وصفٌّ في سجلّ التدقيق، والجوالُ فيهما مقنَّع.
 */
@Injectable()
export class FormPublicService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly instances: FormInstancesService,
    private readonly signing: FormSigningService,
    private readonly otp: OtpChallengesService,
    private readonly gateway: VerificationGateway,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  /** فتحُ الرابط: حالُه وطرقُ الدخول وحدَها — لا شيءَ من النموذج. */
  async open(token: string, meta: RequestMeta) {
    const link = await this.resolve(token);
    return this.inCompany(link, meta, 'LINK_OPENED', async (tx, instance) => {
      const active = isActive(link, instance);
      const plan = identityPlanOf((await tx.company.findUniqueOrThrow({ where: { id: link.companyId }, select: { country: true } })).country);
      const party = active ? await this.recipientOrNull(tx, link, instance) : null;
      const nafathPossible = !!(plan && party?.idIndex && party.idScheme && plan.idSchemes.includes(party.idScheme));
      const nafathOnly = nafathOnlyOf(link, instance);
      // موافقةُ المستأجر على البديل برمزه (`ق-١٦٧٢`) لا بنفاذ.
      const consent = link.purpose === FormLinkPurpose.SUBSTITUTE_CONSENT;
      return {
        state: active ? ('ACTIVE' as const) : ('CLOSED' as const),
        purpose: link.purpose,
        methods: { otp: active && !nafathOnly, nafath: active && nafathPossible && !consent },
        // ⚖️ البديلُ في نموذج نفاذ: الرمزُ أوّلاً ثم نفاذ (`ق-١٦٧٧`)، لا أحدُهما.
        nafathAfterOtp: active && twoStepOf(link, instance),
        identityProvider: plan?.displayName ?? null,
      };
    });
  }

  /** طلبُ رمزٍ إلى الجوال المسجَّل (ستّةُ أرقام · خمسُ دقائق · ثلاثُ محاولات · خمسُ إعادات). */
  async requestOtp(token: string, meta: RequestMeta) {
    const link = await this.resolve(token);
    const outbound = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
      const instance = await this.activeInstance(tx, link);
      if (nafathOnlyOf(link, instance)) throw new ForbiddenException(MSG.form_signing_nafath_only);
      const party = await this.signing.recipientOf(tx, link.companyId, instance, link.recipientRole);
      const challenge = await this.otp.issueWithinTx(tx, {
        companyId: link.companyId,
        purpose: otpPurposeOf(link.purpose),
        subjectKey: subjectOf(instance, link.purpose),
        mobileE164: party.mobile,
        mobileMasked: party.masked,
      });
      // ⚖️ رمزُ البديل يحمل نصَّ الإحاطة باسم المنشأة قبله (`ق-١٦٧٤`)، ورمزُ غيره كما هو.
      let text = SMS_TEXT.otp(challenge.code);
      if (party.role === FormSignerRole.SUBSTITUTE) {
        const company = await tx.company.findUniqueOrThrow({ where: { id: link.companyId }, select: { legalName: true, orgName: true } });
        text = SMS_TEXT.substituteOtp(challenge.code, company.legalName?.trim() || company.orgName);
      }
      return { party, challenge, instanceId: instance.id, text };
    });
    const delivery = await this.signing.deliver(
      link.companyId,
      outbound.instanceId,
      outbound.party.mobile,
      outbound.party.masked,
      outbound.text,
      'OTP_SENT',
      'OTP_SEND_FAILED',
      LINK_ACTOR,
    );
    await this.trail(link, outbound.instanceId, 'otp_requested', meta, { delivery });
    if (delivery === 'FAILED') throw new HttpException(MSG.form_signing_sms_failed, HttpStatus.SERVICE_UNAVAILABLE);
    return { challengeId: outbound.challenge.id, expiresAt: outbound.challenge.expiresAt.toISOString(), mobileMasked: outbound.party.masked };
  }

  /** الرمزُ: الصحيحُ يفتح جلسةً قصيرة، والخطأُ يُحفظ ويُعاد عدُّ ما بقي، والثالثُ يقفل التحدّي. */
  async verifyOtp(token: string, input: { challengeId: string; code: string }, meta: RequestMeta) {
    const link = await this.resolve(token);
    const outcome = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
      const instance = await this.activeInstance(tx, link);
      if (nafathOnlyOf(link, instance)) throw new ForbiddenException(MSG.form_signing_nafath_only);
      const verdict = await this.otp.verifyWithinTx(tx, {
        companyId: link.companyId,
        id: input.challengeId,
        purpose: otpPurposeOf(link.purpose),
        subjectKey: subjectOf(instance, link.purpose),
        code: input.code,
      });
      if (verdict.result !== 'OK') {
        await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind: verdict.result === 'LOCKED' ? 'OTP_LOCKED' : 'OTP_FAILED', actor: LINK_ACTOR, note: verdict.result });
        return { verdict, instanceId: instance.id, session: null };
      }
      const session = await this.openSession(tx, link, 'OTP', input.challengeId);
      await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind: 'LOGIN', actor: LINK_ACTOR, note: 'OTP' });
      return { verdict, instanceId: instance.id, session };
    });
    await this.trail(link, outcome.instanceId, 'otp_verified', meta, { result: outcome.verdict.result });
    if (!outcome.session) {
      // يُرمى بعد الالتزام: المحاولةُ الخاطئة محفوظة، فلا يصير التخمينُ بلا حدّ.
      const msg = outcome.verdict.result === 'WRONG' ? formatMessage(MSG.otp_wrong, { left: String(outcome.verdict.attemptsLeft) }) : otpRefusal(outcome.verdict.result);
      throw new HttpException(msg, outcome.verdict.result === 'LOCKED' ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST);
    }
    return outcome.session;
  }

  /**
   * نفاذ: يبدأ معاملةً برقم الهويّة في بطاقة العميل، ويُعيد الرقمَ الذي يختاره في تطبيقه. ⚖️ **والبديلُ في نموذج نفاذ** (`ق-١٦٧٧`) لا يبدأ نفاذ
   * إلا بجلسة رمزٍ قائمةٍ على رابطه: الرمزُ أوّلاً.
   */
  async startNafath(token: string, session: string | undefined, meta: RequestMeta) {
    const link = await this.resolve(token);
    const started = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
      const instance = await this.activeInstance(tx, link);
      if (twoStepOf(link, instance)) await this.otpStepDone(tx, link, session);
      const party = await this.signing.recipientOf(tx, link.companyId, instance, link.recipientRole);
      const plan = identityPlanOf(party.country);
      if (!plan || !party.idScheme || !plan.idSchemes.includes(party.idScheme)) {
        throw new ConflictException(formatMessage(MSG.form_signing_nafath_id_missing, { provider: plan?.displayName ?? '' }));
      }
      const nationalId = party.nationalId();
      if (!nationalId) throw new ConflictException(formatMessage(MSG.form_signing_nafath_id_missing, { provider: plan.displayName }));
      return { instanceId: instance.id, nationalId };
    });
    const tx = await this.gateway.identity().start({ nationalId: started.nationalId });
    await this.tenantPrisma.runInTenantContext(link.companyId, async (t) => {
      await t.formSigningLink.update({ where: { id: link.id }, data: { identityTxRef: tx.transactionId } });
      await recordFormEvent(t, { companyId: link.companyId, instanceId: started.instanceId, kind: 'NAFATH_STARTED', actor: LINK_ACTOR });
    });
    await this.trail(link, started.instanceId, 'nafath_started', meta, null);
    return { displayCode: tx.displayCode };
  }

  /**
   * حكمُ نفاذ: المقبولُ برقم هويّةٍ يطابق بصمةَ البطاقة يفتح الجلسة، والمرفوضُ يُرفض. وللبديل في نموذج نفاذ تبقى مرجعيّةُ رمزه على الجلسة
   * (`sessionRef`) فيحمل صفُّ توقيعه الاثنين.
   */
  async pollNafath(token: string, session: string | undefined, meta: RequestMeta) {
    const link = await this.resolve(token);
    if (!link.identityTxRef) throw new ConflictException(MSG.form_signing_nafath_not_started);
    const decision = await this.gateway.identity().status(link.identityTxRef);
    const outcome = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
      const instance = await this.activeInstance(tx, link);
      const otpStep = twoStepOf(link, instance) ? await this.otpStepDone(tx, link, session) : null;
      if (decision.decision === 'PENDING') return { state: 'PENDING' as const, session: null, instanceId: instance.id };
      const party = await this.signing.recipientOf(tx, link.companyId, instance, link.recipientRole);
      const matches = decision.decision === 'APPROVED' && !!decision.nationalId && !!party.idIndex && party.idIndex === customerOtherIdIndex(decision.nationalId, link.companyId);
      if (!matches) {
        await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind: 'NAFATH_REJECTED', actor: LINK_ACTOR, note: decision.decision });
        return { state: 'REJECTED' as const, session: null, instanceId: instance.id };
      }
      const opened = await this.openSession(tx, link, 'NAFATH', otpStep ? otpStep.challengeId : link.identityTxRef!);
      await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind: 'LOGIN', actor: LINK_ACTOR, note: otpStep ? 'OTP+NAFATH' : 'NAFATH' });
      return { state: 'APPROVED' as const, session: opened, instanceId: instance.id };
    });
    await this.trail(link, outcome.instanceId, 'nafath_polled', meta, { state: outcome.state });
    if (outcome.state === 'REJECTED') throw new ForbiddenException(MSG.form_signing_nafath_rejected);
    return { state: outcome.state, session: outcome.session };
  }

  /** النموذجُ بعد الدخول: بنودُه وقيمُه وتوقيعُ الموظّف والمدّة — للنسخة نفسِها وحدَها. */
  async view(token: string, session: string | undefined, meta: RequestMeta) {
    const link = await this.resolve(token);
    return this.withSession(link, session, meta, 'viewed', async (tx, instance) => {
      const view = await publicView(tx, instance, link.purpose);
      if (link.purpose !== FormLinkPurpose.SUBSTITUTE_CONSENT) return view;
      const pending = await this.signing.pendingSubstitute(tx, groupIdOf(instance));
      return { ...view, substitute: pending ? { name: pending.name, mobileMasked: pending.mobileMasked } : null };
    });
  }

  /**
   * ⚖️ **حكمُ المستأجر على المستلم البديل** (توجيه ٢٨٧ ⑦ · `ق-١٦٧٢`): برابط الموافقة بعد الدخول برمزه. **الموافقةُ** تجعل البديلَ مستلمَ
   * المجموعة: يُقفل رابطُ المستأجر ورابطُ الموافقة، ويصل البديلَ رابطُه على جواله فيكون رمزُه تحقّقاً من جواله (`ق-١٥٩٠`). **والرفضُ**
   * يُبقي المستأجرَ مستلماً. وكلاهما حدثٌ في سجلّ النموذج ويُعلَم التاجر.
   */
  async decideSubstitute(token: string, session: string | undefined, approve: boolean, meta: RequestMeta) {
    const link = await this.resolve(token);
    if (link.purpose !== FormLinkPurpose.SUBSTITUTE_CONSENT) throw new ForbiddenException(MSG.form_link_unavailable);
    const outcome = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
      await this.sessionLink(tx, link, session);
      await tx.$queryRaw`SELECT "id" FROM "form_instances" WHERE "id" = ${link.instanceId} FOR UPDATE`;
      const instance = await this.activeInstance(tx, link);
      const pending = await this.signing.pendingSubstitute(tx, groupIdOf(instance));
      if (!pending) throw new ConflictException(MSG.form_substitute_not_pending);
      const now = new Date();
      await tx.formSignerDesignation.update({ where: { id: pending.id }, data: { status: approve ? 'APPROVED' : 'REJECTED', decidedAt: now } });
      await tx.formSigningLink.updateMany({ where: { instanceId: instance.id, revokedAt: null, purpose: FormLinkPurpose.SUBSTITUTE_CONSENT }, data: { revokedAt: now } });
      await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind: approve ? 'SUBSTITUTE_APPROVED' : 'SUBSTITUTE_REJECTED', actor: LINK_ACTOR, recipientMasked: pending.mobileMasked });
      await NotificationsService.raise(tx, link.companyId, {
        kind: NotificationKind.FORM_SUBSTITUTE_DECIDED,
        dedupeKey: `form-substitute:${pending.id}`,
        title: approve ? 'وافق المستأجرُ على مستلمٍ بديل' : 'رفض المستأجرُ المستلمَ البديل',
        body: `«${instance.templateVersion.name}» (النسخة ${instance.revisionNo}): ${approve ? 'أُرسل الرابطُ إلى البديل' : 'يبقى المستأجرُ مستلماً'}.`,
        linkScreen: 'forms',
        linkId: instance.id,
      });
      if (!approve) return { instanceId: instance.id, outbound: null };
      // البديلُ مستلمُ المجموعة الآن: رابطُ المستأجر يُقفل كي لا يوقّع اثنان، ورابطُ البديل إلى جواله.
      await tx.formSigningLink.updateMany({ where: { instanceId: instance.id, revokedAt: null, purpose: FormLinkPurpose.SIGN }, data: { revokedAt: now } });
      const substitute = await this.signing.recipientOf(tx, link.companyId, instance, FormSignerRole.SUBSTITUTE);
      const t = await this.signing.openLink(tx, link.companyId, instance.id, FormLinkPurpose.SIGN, FormSignerRole.SUBSTITUTE, instance.signDeadline);
      return { instanceId: instance.id, outbound: { to: substitute.mobile, masked: substitute.masked, token: t } };
    });
    await this.trail(link, outcome.instanceId, approve ? 'substitute_approved' : 'substitute_rejected', meta, null);
    const delivery = outcome.outbound
      ? await this.signing.deliver(link.companyId, outcome.instanceId, outcome.outbound.to, outcome.outbound.masked, SMS_TEXT.sign(formLinkUrl(outcome.outbound.token)), 'LINK_SENT', 'LINK_SEND_FAILED', LINK_ACTOR)
      : ('NONE' as const);
    return { decision: approve ? ('APPROVED' as const) : ('REJECTED' as const), delivery };
  }

  /** الإقرارُ والتوقيع: صفُّ توقيعٍ برسمه وبصمةِ ما وُقّع عليه، ثم الختمُ بالصيغة ٢، ثم رابطُ النسخة النهائية. */
  async sign(token: string, session: string | undefined, drawingFile: UploadedEvidence | undefined, acknowledged: boolean, meta: RequestMeta) {
    const link = await this.resolve(token);
    if (link.purpose !== FormLinkPurpose.SIGN) throw new ForbiddenException(MSG.form_link_unavailable);
    if (!acknowledged) throw new ConflictException(MSG.form_signing_ack_required);
    const drawing = assertDrawing(drawingFile);
    const stored = await this.files.uploadSensitive(link.companyId, drawing);
    let finalToken: string | null;
    let party: { mobile: string; masked: string } | null;
    let instanceId: string;
    try {
      ({ finalToken, party, instanceId } = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
        const fresh = await this.sessionLink(tx, link, session);
        await tx.$queryRaw`SELECT "id" FROM "form_instances" WHERE "id" = ${link.instanceId} FOR UPDATE`;
        const instance = await this.activeInstance(tx, link);
        this.assertFullLogin(fresh, link, instance);
        const staff = instance.signatures.find((s) => s.role === FormSignerRole.STAFF);
        if (!staff) throw new ConflictException(MSG.form_signing_not_awaiting);
        // ما يوقّعه الطرفُ هو ما وقّعه الموظّفُ بعينه — والقاعدةُ تمنع تعديلَ المرسَل، وهذا يقابل البصمتين.
        if (staff.signedContentHash !== contentHashOf(instance)) throw new ConflictException(MSG.form_signing_content_changed);
        const p = await this.signing.recipientOf(tx, link.companyId, instance, link.recipientRole);
        await tx.formSignature.create({
          data: {
            companyId: link.companyId,
            instanceId: instance.id,
            role: p.role,
            level: fresh.sessionMethod === 'NAFATH' ? FormSignatureLevel.DRAWN_NAFATH : FormSignatureLevel.DRAWN_OTP,
            // ⑤: الخطوتان نفسُهما على جهاز الموظّف، والقناةُ تُسجَّل.
            channel: link.staffDevice ? FormSignatureChannel.STAFF_DEVICE : FormSignatureChannel.LINK,
            signerName: p.name,
            signerCustomerId: p.customerId,
            signerKind: p.kind,
            authorityType: p.authority?.type ?? null,
            authorityRef: p.authority?.ref ?? null,
            authorityEvidenceKey: p.authority?.evidenceKey ?? null,
            authorityEvidenceSha256: p.authority?.evidenceSha256 ?? null,
            authorityVerification: p.authority?.verification ?? null,
            mobileMasked: p.masked,
            mobileIndex: p.index,
            evidenceKey: stored.key,
            evidenceSha256: bytesSha256(drawing.buffer),
            signedContentHash: contentHashOf(instance),
            // البديلُ في نموذج نفاذ دخل بالاثنين: مرجعُ رمزه على الجلسة، ومعاملةُ نفاذ على الرابط (`ق-١٦٧٧`).
            challengeId: fresh.sessionMethod === 'OTP' || twoStepOf(link, instance) ? fresh.sessionRef : null,
            identityTxRef: fresh.sessionMethod === 'NAFATH' ? fresh.identityTxRef : null,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind: 'SIGNED', actor: LINK_ACTOR, recipientMasked: p.masked });
        // النصابُ اكتمل (الموظّفُ والطرف): الختمُ في المعاملة نفسِها (توجيه ٢٨٧ ⑨)، والروابطُ تُقفل.
        await this.instances.sealWithinTx(tx, instance.id, { id: staff.signerUserId ?? staff.id, name: staff.signerName });
        await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind: 'SEALED', actor: LINK_ACTOR });
        await tx.formSigningLink.updateMany({
          where: { instanceId: instance.id, revokedAt: null, purpose: { in: [FormLinkPurpose.SIGN, FormLinkPurpose.SUBSTITUTE_CONSENT] } },
          data: { revokedAt: new Date() },
        });
        // ⚖️ النسخةُ النهائية إلى جوال بطاقة المستأجر في كلِّ مسار (`ق-١٦٧٨` (ب) · توجيه ٢٨٧ ⑨)، وقّع بنفسه أو عنه ممثّلٌ أو بديل؛
        // وبلا جوالٍ صالحٍ في البطاقة لا رابطَ نهائيّ.
        const finalTo = await this.signing.finalCopyRecipientOrNull(tx, link.companyId, instance.counterpartyCustomerId);
        const t = finalTo ? await this.signing.openLink(tx, link.companyId, instance.id, FormLinkPurpose.FINAL_COPY, finalTo.role, null) : null;
        return { finalToken: t, party: finalTo, instanceId: instance.id };
      }));
    } catch (e) {
      await this.files.remove(link.companyId, stored.key).catch(() => undefined);
      throw e;
    }
    await this.trail(link, instanceId, 'signed', meta, null);
    const delivery =
      party && finalToken
        ? await this.signing.deliver(link.companyId, instanceId, party.mobile, party.masked, SMS_TEXT.finalCopy(formLinkUrl(finalToken)), 'FINAL_SENT', 'FINAL_SEND_FAILED', LINK_ACTOR)
        : ('NONE' as const);
    return { status: FormInstanceStatus.SEALED, finalCopy: delivery };
  }

  /** الاعتراضُ بملاحظةٍ وصورة: يصير النموذجُ «معترَضاً عليه» ولا يُعدَّل، ويُعلَم التاجر، والردُّ نسخةٌ معدّلة (`ق-١٦٦٩`). */
  async object(token: string, session: string | undefined, note: string | undefined, photo: UploadedEvidence | undefined, meta: RequestMeta) {
    const link = await this.resolve(token);
    if (link.purpose !== FormLinkPurpose.SIGN) throw new ForbiddenException(MSG.form_link_unavailable);
    const text = (note ?? '').trim();
    if (!text) throw new ConflictException(MSG.form_objection_note_required);
    if (photo && !PHOTO_TYPES.has(photo.mimetype)) throw new ConflictException(MSG.form_signature_drawing_type);
    const stored = photo?.buffer?.length ? await this.files.uploadSensitive(link.companyId, photo) : null;
    let instanceId: string;
    try {
      instanceId = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
        const fresh = await this.sessionLink(tx, link, session);
        await tx.$queryRaw`SELECT "id" FROM "form_instances" WHERE "id" = ${link.instanceId} FOR UPDATE`;
        const instance = await this.activeInstance(tx, link);
        this.assertFullLogin(fresh, link, instance);
        const p = await this.signing.recipientOf(tx, link.companyId, instance, link.recipientRole);
        await tx.formObjection.create({
          data: {
            companyId: link.companyId,
            instanceId: instance.id,
            note: text,
            photoKey: stored?.key ?? null,
            photoSha256: stored && photo ? bytesSha256(photo.buffer) : null,
            photoMime: stored && photo ? photo.mimetype : null,
            byName: p.name,
            mobileMasked: p.masked,
          },
        });
        const done = await tx.formInstance.updateMany({ where: { id: instance.id, status: FormInstanceStatus.AWAITING_SIGNATURE }, data: { status: FormInstanceStatus.OBJECTED } });
        if (done.count !== 1) throw new ConflictException(MSG.form_signing_not_awaiting);
        await tx.formSigningLink.updateMany({ where: { instanceId: instance.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind: 'OBJECTED', actor: LINK_ACTOR, recipientMasked: p.masked });
        await NotificationsService.raise(tx, link.companyId, {
          kind: NotificationKind.FORM_OBJECTED,
          dedupeKey: `form-objected:${instance.id}`,
          title: 'اعتراضٌ على نموذج',
          body: `اعترض المستأجرُ على «${instance.templateVersion.name}» (النسخة ${instance.revisionNo})، والردُّ نسخةٌ معدّلة قبل انقضاء المدّة.`,
          linkScreen: 'forms',
          linkId: instance.id,
        });
        return instance.id;
      });
    } catch (e) {
      if (stored) await this.files.remove(link.companyId, stored.key).catch(() => undefined);
      throw e;
    }
    await this.trail(link, instanceId, 'objected', meta, null);
    return { status: FormInstanceStatus.OBJECTED };
  }

  // ── داخليّ ───────────────────────────────────────────────────────────────

  /** الرابطُ ببصمة رمزه في معاملةٍ ضيّقة — ورمزٌ مجهولٌ `404` بلا تفصيل. */
  private async resolve(token: string): Promise<LinkRow> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token ?? '')) throw new NotFoundException(MSG.form_link_unavailable);
    const hash = opaqueTokenHash(token);
    const link = await this.tenantPrisma.runAsFormLinkLookup((tx) => tx.formSigningLink.findUnique({ where: { tokenHash: hash } }));
    if (!link) throw new NotFoundException(MSG.form_link_unavailable);
    return link;
  }

  /** النسخةُ التي يخدمها رابطٌ فعّال — وما سواه `410` بلا تفصيل. */
  private async activeInstance(tx: Tx, link: LinkRow): Promise<InstanceFull> {
    const instance = await tx.formInstance.findUnique({ where: { id: link.instanceId }, include: INSTANCE_INCLUDE });
    if (!instance || !isActive(link, instance)) throw new HttpException(MSG.form_link_unavailable, HttpStatus.GONE);
    return instance;
  }

  private async openSession(tx: Tx, link: LinkRow, method: 'OTP' | 'NAFATH', ref: string) {
    const session = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + FORM_SESSION_MS);
    await tx.formSigningLink.update({
      where: { id: link.id },
      data: { sessionHash: opaqueTokenHash(session), sessionExpiresAt: expiresAt, sessionMethod: method, sessionRef: ref },
    });
    return { session, expiresAt: expiresAt.toISOString() };
  }

  /** الجلسةُ تُطابَق ببصمتها على صفّ الرابط نفسِه ووقتها — فجلسةُ رابطٍ لا تفتح غيره. */
  private async sessionLink(tx: Tx, link: LinkRow, session: string | undefined) {
    const fresh = await tx.formSigningLink.findUnique({ where: { id: link.id } });
    const ok =
      !!session &&
      !!fresh?.sessionHash &&
      fresh.sessionHash === opaqueTokenHash(session) &&
      !!fresh.sessionExpiresAt &&
      fresh.sessionExpiresAt.getTime() > Date.now();
    if (!ok || !fresh) throw new UnauthorizedException(MSG.form_session_required);
    return fresh;
  }

  /**
   * ⚖️ **البديلُ في نموذج نفاذ** (`ق-١٦٧٧`): جلسةُ رمزٍ قائمةٌ على رابطه شرطُ بدء نفاذ وحكمِه — فلا نفاذَ قبل الرمز. ويُعيد مرجعَ الرمز ليُحمل
   * على جلسة نفاذ.
   */
  private async otpStepDone(tx: Tx, link: LinkRow, session: string | undefined) {
    let fresh: Awaited<ReturnType<FormPublicService['sessionLink']>>;
    try {
      fresh = await this.sessionLink(tx, link, session);
    } catch {
      throw new UnauthorizedException(MSG.form_substitute_otp_first);
    }
    if (!fresh.sessionRef || (fresh.sessionMethod !== 'OTP' && fresh.sessionMethod !== 'NAFATH')) throw new UnauthorizedException(MSG.form_substitute_otp_first);
    return { challengeId: fresh.sessionRef };
  }

  /** في نموذجٍ يشترط نفاذ لا يُرى النموذجُ ولا يُعترض عليه ولا يُوقَّع إلا بجلسة نفاذ — ولو قامت قبلها جلسةُ رمز البديل (`ق-١٦٧٧`). */
  private assertFullLogin(fresh: { sessionMethod: string | null }, link: LinkRow, instance: InstanceFull) {
    if (link.purpose === FormLinkPurpose.SIGN && instance.nafathRequired && fresh.sessionMethod !== 'NAFATH') throw new ForbiddenException(MSG.form_signing_nafath_only);
  }

  private async withSession<T>(link: LinkRow, session: string | undefined, meta: RequestMeta, action: string, work: (tx: Tx, instance: InstanceFull) => Promise<T>) {
    const result = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
      const fresh = await this.sessionLink(tx, link, session);
      const instance = await this.activeInstance(tx, link);
      this.assertFullLogin(fresh, link, instance);
      return { value: await work(tx, instance), instanceId: instance.id };
    });
    await this.trail(link, result.instanceId, action, meta, null);
    return result.value;
  }

  private async inCompany<T>(link: LinkRow, meta: RequestMeta, kind: FormSigningEventKind, work: (tx: Tx, instance: InstanceFull) => Promise<T>) {
    const result = await this.tenantPrisma.runInTenantContext(link.companyId, async (tx) => {
      const instance = await tx.formInstance.findUnique({ where: { id: link.instanceId }, include: INSTANCE_INCLUDE });
      if (!instance) throw new NotFoundException(MSG.form_link_unavailable);
      await recordFormEvent(tx, { companyId: link.companyId, instanceId: instance.id, kind, actor: LINK_ACTOR });
      return { value: await work(tx, instance), instanceId: instance.id };
    });
    await this.trail(link, result.instanceId, 'opened', meta, null);
    return result.value;
  }

  private async recipientOrNull(tx: Tx, link: LinkRow, instance: InstanceFull) {
    try {
      return await this.signing.recipientOf(tx, link.companyId, instance, link.recipientRole);
    } catch {
      return null;
    }
  }

  /** كلُّ خطوةٍ صفٌّ في سجلّ التدقيق (توجيه ٢٨٧ ⑪)، بفاعلٍ «العميل عبر الرابط» ولا رمزَ ولا جوال. */
  private async trail(link: LinkRow, instanceId: string, action: string, meta: RequestMeta, details: Record<string, unknown> | null) {
    await this.audit.record({
      companyId: link.companyId,
      actorType: 'FORM_LINK',
      actorId: link.id,
      actorName: LINK_ACTOR,
      screen: 'forms',
      action,
      entity: 'formInstance',
      entityId: instanceId,
      method: 'PUBLIC',
      path: `/public/forms/${link.purpose.toLowerCase()}`,
      details,
      ip: meta.ip,
    });
  }
}

/** رابطٌ فعّال: لم يُقفل ولم ينقضِ، والنسخةُ في الحال التي يخدمها غرضُه. */
function isActive(link: LinkRow, instance: { status: FormInstanceStatus }): boolean {
  if (link.revokedAt) return false;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return false;
  if (link.purpose === FormLinkPurpose.SIGN) return instance.status === FormInstanceStatus.AWAITING_SIGNATURE;
  if (link.purpose === FormLinkPurpose.SUBSTITUTE_CONSENT) return instance.status === FormInstanceStatus.AWAITING_SIGNATURE;
  if (link.purpose === FormLinkPurpose.FINAL_COPY) return instance.status === FormInstanceStatus.SEALED;
  return false;
}

/** ⚖️ البديلُ في نموذجٍ يشترط نفاذ: الرمزُ أوّلاً ثم نفاذ (`ق-١٦٧٧`). */
const twoStepOf = (link: LinkRow, instance: { nafathRequired: boolean }): boolean =>
  link.purpose === FormLinkPurpose.SIGN && instance.nafathRequired && link.recipientRole === FormSignerRole.SUBSTITUTE;

/** نفاذٌ وحدَه: رابطُ توقيعٍ لنموذجٍ يشترط نفاذ، إلا البديلَ فرمزُه أوّلاً. */
const nafathOnlyOf = (link: LinkRow, instance: { nafathRequired: boolean }): boolean =>
  link.purpose === FormLinkPurpose.SIGN && instance.nafathRequired && !twoStepOf(link, instance);

const otpPurposeOf = (purpose: FormLinkPurpose): VerificationPurpose =>
  purpose === FormLinkPurpose.FINAL_COPY ? 'FORM_FINAL_COPY_LOGIN' : purpose === FormLinkPurpose.SUBSTITUTE_CONSENT ? 'FORM_SUBSTITUTE_CONSENT' : 'FORM_SIGNER_LOGIN';

/** موضوعُ الرمز: مجموعةُ النموذج وغرضُ الرابط — فالإعاداتُ الخمس «للنموذج الواحد» (`ق-١٦٣٥` ④) لا لكلِّ نسخة. */
const subjectOf = (instance: { id: string; revisionGroupId: string | null }, purpose: FormLinkPurpose) => `form:${groupIdOf(instance)}:${purpose}`;

function otpRefusal(result: string): string {
  if (result === 'EXPIRED') return MSG.otp_expired;
  if (result === 'LOCKED') return MSG.otp_locked;
  return MSG.otp_used;
}

/** ما يراه العميلُ بعد الدخول — بلا معرّفاتٍ داخلية ولا مبالغ، وللنسخة النهائية حكمُ التحقّق. */
async function publicView(tx: Tx, instance: InstanceFull, purpose: FormLinkPurpose) {
  const byItem = new Map(instance.values.map((v) => [v.itemId, v]));
  const verification = purpose === FormLinkPurpose.FINAL_COPY ? await verifyInstanceWithinTx(tx, instance) : null;
  return {
    purpose,
    status: instance.status,
    templateName: instance.templateVersion.name,
    formTypeName: instance.templateVersion.formType.name,
    formDate: instance.formDate.toISOString().slice(0, 10),
    revisionNo: instance.revisionNo,
    signDeadline: instance.signDeadline ? instance.signDeadline.toISOString() : null,
    nafathRequired: instance.nafathRequired,
    items: instance.templateVersion.items.map((item) => {
      const v = byItem.get(item.id);
      return {
        lineNo: item.lineNo,
        label: item.label,
        itemType: item.itemType,
        unit: item.unit,
        text: v?.textValue ?? null,
        number: v?.numberValue === null || v?.numberValue === undefined ? null : v.numberValue.toString(),
        bool: v?.boolValue ?? null,
        note: v?.note ?? null,
      };
    }),
    signatures: instance.signatures.map((s) => ({ role: s.role, level: s.level, channel: s.channel, signerName: s.signerName, signedAt: s.signedAt.toISOString() })),
    seal: instance.seal ? { no: instance.seal.no, contentHash: instance.seal.contentHash, sealedAt: instance.seal.sealedAt.toISOString(), valid: verification?.valid ?? null } : null,
    substitute: null as { name: string; mobileMasked: string } | null,
  };
}
