import { Module, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ZatcaModule } from '../zatca/zatca.module';
import { ZatcaService } from '../zatca/zatca.service';
import { INVOICE_ISSUED, type InvoiceIssuedPayload } from '../shared/events/domain-events';
import { OutboxService } from './outbox.service';

/**
 * الموزّع الدوريّ.
 *
 * ⚠️ **يجري في عملية الواجهة اليوم** — كما تجري كنسة التنبيهات. ونسختان من
 * الخادم تعنيان دورتين، **وهو غير ضارّ بالتصميم**: المطالبة المشروطة تجعل
 * الثانية بلا أثر. **وهذه بعينها الخاصية التي تجعل نقلَه إلى `worker` آمناً**
 * حين يُبنى (`ق-٤٠`) — والعلامة المُشغِّلة له قد حلّت بهذا الطابور.
 */
@Injectable()
export class OutboxDispatcherJob {
  private readonly logger = new Logger(OutboxDispatcherJob.name);
  constructor(private readonly outbox: OutboxService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    const r = await this.outbox.dispatchDue();
    // لا يُسجَّل إلا ما جرى فعلاً — سطرٌ كل دقيقة يقول «صفر» يُهجَر فلا يُقرأ.
    if (r.claimed > 0) this.logger.log(`Outbox: طُولب ${r.claimed} · أُرسل ${r.sent} · أُجّل ${r.retried} · فشل ${r.failed}`);
  }
}

@Module({
  imports: [PrismaModule, ZatcaModule],
  providers: [OutboxService, OutboxDispatcherJob],
  exports: [OutboxService],
})
export class OutboxModule implements OnModuleInit {
  constructor(
    private readonly outbox: OutboxService,
    private readonly zatca: ZatcaService,
  ) {}

  /**
   * التسجيل **صريحٌ بسطرٍ يُقرأ** — لا مسحَ مجلدات ولا `import()` ديناميكي
   * (`ق-٤٢`)، فحارس اتجاه الاستيراد يرى ما يعتمد على ماذا.
   */
  onModuleInit(): void {
    this.outbox.register(INVOICE_ISSUED, async (row) => {
      const { invoiceId } = row.payload as InvoiceIssuedPayload;
      // مستندٌ أجابت عنه الهيئةُ مُوصَلٌ فيُختم الحدثُ بلا إرسال (`ق-٩٨٣`) — وإلا أُرسل.
      await this.zatca.deliverIssued(row.companyId, invoiceId);
    });
  }
}
