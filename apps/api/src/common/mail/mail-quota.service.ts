import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hourBucket } from './mail-quota.util';

/**
 * ⑬A1 (`ق-١٣٣٣`) — **عدّادُ البريد لنافذة «آخر أربعٍ وعشرين ساعة»** عند المزوّد.
 *
 * **دلوٌ لكلِّ ساعة يُزاد ذرّياً** (`INSERT … ON CONFLICT DO UPDATE` — فرسالتان متزامنتان لا تعدّان واحدة)،
 * **ويُضاف إليه ما في الدلاء الثلاثة والعشرين قبله**. والجدولُ للمنصّة كلِّها لا لمنشأة — فالقراءةُ بلا سياق
 * مستأجرٍ صوابٌ لا ثغرة (لا `companyId` ولا سياسةَ عزل، وصفُّه رقمٌ وساعة).
 *
 * ⚠️ **ويُعدّ ما أُرسل إلى المزوّد لا ما قبله**: رسالةٌ رفضها المزوّد تُعدّ — فالعدّادُ يُنذر مبكّراً لا متأخّراً،
 * وهو الاتجاهُ الآمن لإنذارٍ غرضُه «قبل أن يُبلغ».
 */
@Injectable()
export class MailQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * يزيد دلوَ الساعة ويُعيد موضعَ **هذه الرسالة بعينها** في النافذة: قبلها وبعدها.
   *
   * ⚠️ **وموضعُها من `RETURNING` لا من جمعٍ لاحق**: لو جُمعت النافذةُ بعد الزيادة لرأت رسالتان متزامنتان
   * المجموعَ نفسَه فـ«عبرت» كلتاهما العتبةَ أو لم تعبرها أيٌّ منهما — والإنذارُ يُفقد. **وقيمةُ الدلو بعد زيادةٍ
   * ذرّية فريدةٌ لكلِّ رسالة**، والدلاءُ الماضية لا تتغيّر، فالعبورُ يقع لرسالةٍ واحدة بالضبط.
   */
  async recordSend(at: Date = new Date()): Promise<{ before: number; after: number }> {
    const hour = hourBucket(at);
    const rows = await this.prisma.$queryRaw<{ sent: number }[]>`
      INSERT INTO "mail_send_counts" ("hour", "sent") VALUES (${hour}, 1)
      ON CONFLICT ("hour") DO UPDATE SET "sent" = "mail_send_counts"."sent" + 1
      RETURNING "sent"`;
    const current = Number(rows[0].sent);
    const past = await this.pastHoursTotal(hour);
    return { before: past + current - 1, after: past + current };
  }

  /** الدلاءُ الثلاثةُ والعشرون قبل ساعة `hour` — وهي لا تتغيّر، فتُجمع بلا سباق. */
  private async pastHoursTotal(hour: Date): Promise<number> {
    const from = new Date(hour.getTime() - 23 * 3_600_000);
    const rows = await this.prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM("sent")::bigint AS "total" FROM "mail_send_counts" WHERE "hour" >= ${from} AND "hour" < ${hour}`;
    return Number(rows[0]?.total ?? 0);
  }
}
