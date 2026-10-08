import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FormInstanceStatus, FormLinkPurpose, FormSignerRole, NotificationKind, Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { SCHEDULE_TIME_ZONE } from '../common/wall-clock.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { groupIdOf } from './form-instances.service';
import { FormSigningService } from './form-signing.service';
import { formLinkUrl, recordFormEvent, SMS_TEXT, SYSTEM_ACTOR } from './form-signing.util';

type Tx = Prisma.TransactionClient;

/** يومٌ بالمللي ثانية — «وقبل نهايتها بيوم» (`ق-١٦٣٣` ⑭). */
const DAY_MS = 24 * 60 * 60 * 1000;

interface Reminder {
  instanceId: string;
  kind: 'REMINDER_MID' | 'REMINDER_LAST';
  token: string;
  to: string;
  masked: string;
}

/**
 * ⚖️ **الانقضاءُ والتذكيرُ الآليّ** (توجيه ٢٨٧ ③ و④ · `ق-١٦٣٣` ⑬ إلى ⑮ · `ق-١٦٧١`).
 *
 * **التذكيرُ في منتصف المدّة وقبل نهايتها بيوم**، والمدّةُ واحدةٌ من أوّل إرسال (`ق-١٦٧١`) فالمنتصفُ بين أوّل إرسالٍ للمجموعة وموعدها؛ وكلُّ
 * تذكيرٍ مرّةً للمجموعة (يُعرف بحدثه)، ويحمل رابطاً جديداً لأن الرمزَ لا يُخزَّن إلا بصمة. **ولا تذكيرَ لمعترَضٍ عليه**: الكرةُ عند الموظّف.
 * **وعند الانقضاء**: النسخةُ التي تنتظر التوقيع «انقضت مدّتُه دون توقيع العميل» — **وليس موافقة** (`ق-١٦٣٣`) — والمعترَضُ عليها التي لم تتبعها
 * نسخةٌ أُرسلت «خلافٌ قائم» (`ق-١٦٣٣` ⑮)، والروابطُ تُقفل، ويُعلَم التاجر. **والرسائلُ بعد الالتزام**، وكلُّ منشأةٍ في معاملتها.
 */
@Injectable()
export class FormSigningSweepService {
  private readonly logger = new Logger(FormSigningSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly signing: FormSigningService,
  ) {}

  @Cron('*/15 * * * *', { timeZone: SCHEDULE_TIME_ZONE })
  async runForAllCompanies(): Promise<{ companies: number; expired: number; disputed: number; reminded: number }> {
    // العميلُ غيرُ المقيَّد عمداً: هذا الموضعُ يعبر المستأجرين ليدخل سياقَ كلٍّ.
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    const total = { companies: companies.length, expired: 0, disputed: 0, reminded: 0 };
    for (const c of companies) {
      try {
        const r = await this.runForCompany(c.id);
        total.expired += r.expired;
        total.disputed += r.disputed;
        total.reminded += r.reminded;
      } catch (e) {
        this.logger.error(`كنسُ توقيع النماذج أخفق للمنشأة ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
    }
    return total;
  }

  async runForCompany(companyId: string, now: Date = new Date()): Promise<{ expired: number; disputed: number; reminded: number }> {
    const { expired, disputed, reminders } = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const closed = await this.closeExpired(tx, companyId, now);
      const due = await this.dueReminders(tx, companyId, now);
      return { ...closed, reminders: due };
    });
    for (const r of reminders) {
      await this.signing.deliver(companyId, r.instanceId, r.to, r.masked, SMS_TEXT.reminder(formLinkUrl(r.token)), r.kind, 'LINK_SEND_FAILED', SYSTEM_ACTOR);
    }
    return { expired, disputed, reminded: reminders.length };
  }

  /** ما انقضى موعدُه: ينتظر ⟵ «انقضت مدّتُه»، ومعترَضٌ عليه بلا نسخةٍ أُرسلت بعده ⟵ «خلافٌ قائم». */
  private async closeExpired(tx: Tx, companyId: string, now: Date) {
    const due = await tx.formInstance.findMany({
      where: { status: { in: [FormInstanceStatus.AWAITING_SIGNATURE, FormInstanceStatus.OBJECTED] }, signDeadline: { lte: now } },
      select: { id: true, status: true, revisionGroupId: true, revisionNo: true, templateVersion: { select: { name: true } } },
    });
    let expired = 0;
    let disputed = 0;
    for (const f of due) {
      if (f.status === FormInstanceStatus.OBJECTED) {
        // نسخةٌ بعدها أُرسلت ⟵ تُحسم هي، وتبقى هذه «معترَضاً عليه» كما حكمت `ق-١٦٦٩`.
        const sentAfter = await tx.formInstance.count({ where: { previousRevisionId: f.id, sentAt: { not: null } } });
        if (sentAfter > 0) continue;
      }
      const next = f.status === FormInstanceStatus.AWAITING_SIGNATURE ? FormInstanceStatus.EXPIRED : FormInstanceStatus.DISPUTED;
      const done = await tx.formInstance.updateMany({ where: { id: f.id, status: f.status }, data: { status: next } });
      if (done.count !== 1) continue;
      await tx.formSigningLink.updateMany({ where: { instanceId: f.id, revokedAt: null, purpose: FormLinkPurpose.SIGN }, data: { revokedAt: now } });
      await recordFormEvent(tx, { companyId, instanceId: f.id, kind: next === FormInstanceStatus.EXPIRED ? 'EXPIRED' : 'DISPUTED', actor: SYSTEM_ACTOR });
      const group = f.revisionGroupId ?? f.id;
      await NotificationsService.raise(tx, companyId, {
        kind: NotificationKind.FORM_SIGNING_EXPIRED,
        dedupeKey: `form-signing-closed:${group}`,
        title: next === FormInstanceStatus.EXPIRED ? 'انقضت مدّةُ نموذجٍ دون توقيع العميل' : 'نموذجٌ بقي خلافاً قائماً',
        body:
          next === FormInstanceStatus.EXPIRED
            ? `«${f.templateVersion.name}» (النسخة ${f.revisionNo}): انقضت مدّتُه دون توقيع العميل، ولا يُعدّ ذلك موافقة.`
            : `«${f.templateVersion.name}» (النسخة ${f.revisionNo}): بقي اعتراضُ العميل بلا حسمٍ حتى انقضت المدّة، فهو خلافٌ قائم.`,
        linkScreen: 'forms',
        linkId: f.id,
      });
      if (next === FormInstanceStatus.EXPIRED) expired++;
      else disputed++;
    }
    return { expired, disputed };
  }

  /** تذكيرُ منتصف المدّة وتذكيرُ ما قبل نهايتها بيوم — مرّةً لكلٍّ في المجموعة، ورسالةٌ واحدة في الدورة. */
  private async dueReminders(tx: Tx, companyId: string, now: Date): Promise<Reminder[]> {
    const awaiting = await tx.formInstance.findMany({
      where: { status: FormInstanceStatus.AWAITING_SIGNATURE, signDeadline: { gt: now } },
      select: { id: true, revisionGroupId: true, signDeadline: true, counterpartyCustomerId: true },
    });
    const out: Reminder[] = [];
    for (const f of awaiting) {
      const group = groupIdOf(f);
      const members = await tx.formInstance.findMany({ where: { OR: [{ id: group }, { revisionGroupId: group }] }, select: { id: true, sentAt: true } });
      const firstSent = members.map((m) => m.sentAt).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime())[0];
      if (!firstSent || !f.signDeadline) continue;
      const sent = new Set(
        (await tx.formSigningEvent.findMany({ where: { instanceId: { in: members.map((m) => m.id) }, kind: { in: ['REMINDER_MID', 'REMINDER_LAST'] } }, select: { kind: true } })).map(
          (e) => e.kind,
        ),
      );
      const mid = firstSent.getTime() + (f.signDeadline.getTime() - firstSent.getTime()) / 2;
      const last = f.signDeadline.getTime() - DAY_MS;
      let kind: Reminder['kind'] | null = null;
      if (!sent.has('REMINDER_LAST') && now.getTime() >= last) kind = 'REMINDER_LAST';
      else if (!sent.has('REMINDER_MID') && !sent.has('REMINDER_LAST') && now.getTime() >= mid) kind = 'REMINDER_MID';
      if (!kind) continue;
      let party;
      try {
        party = await this.signing.partyOf(tx, companyId, f.counterpartyCustomerId);
      } catch {
        // جوالٌ صار غيرَ صالحٍ في البطاقة: يُسجَّل التذكيرُ «لم يُرسل» مرّةً (فلا يُعاد كلَّ دورة) ويُرى في سجلّ النموذج.
        await recordFormEvent(tx, { companyId, instanceId: f.id, kind, actor: SYSTEM_ACTOR, note: 'لم يُرسل: جوالُ العميل في بطاقته غيرُ صالح' });
        continue;
      }
      const token = await this.signing.openLink(tx, companyId, f.id, FormLinkPurpose.SIGN, FormSignerRole.COUNTERPARTY, f.signDeadline);
      out.push({ instanceId: f.id, kind, token, to: party.mobile, masked: party.masked });
    }
    return out;
  }
}
