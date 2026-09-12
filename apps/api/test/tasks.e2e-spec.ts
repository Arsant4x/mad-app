import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * المهام — **القواعد الثلاث مُثبَتةً سلوكياً على قاعدة حيّة**.
 *
 * وما يُثبَت هنا لا يُثبته حارسٌ نصّي: الحارس النصّي يقول إن الشيفرة
 * **مكتوبةٌ** كذلك، وهذا يقول إنها **تتصرّف** كذلك — عبر المسار الكامل
 * (قالب ⇒ موظف ⇒ إسناد ⇒ قراءة) بطلباتٍ حقيقية.
 */
describe('المهام — الرؤية والانتقال والاشتقاق (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let clerkId: string;
  let clerkToken: string;
  let mgrId: string;
  let mgrToken: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const created: string[] = [];

  const makeTemplate = (name: string, allowedScreens: string[], screenActions: Record<string, string[]>) =>
    request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `${name}-${suffix}`, isAllScreens: false, allowedScreens, screenActions })
      .expect(201);

  const makeUser = async (name: string, templateId: string) => {
    const res = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name, username: `${name}-${suffix}`, password: 'TaskPass123!', permissionTemplateId: templateId })
      .expect(201);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: `${name}-${suffix}`, password: 'TaskPass123!' });
    return { id: res.body.id as string, token: login.body.accessToken as string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    ownerToken = login.body.accessToken;

    // كاتبٌ **لا يملك شاشة العقود إطلاقاً** — هو موضع القاعدة الأولى.
    const clerkTpl = await makeTemplate('كاتب', ['dashboard'], { dashboard: ['view'] });
    const clerk = await makeUser('clerk', clerkTpl.body.id);
    clerkId = clerk.id;
    clerkToken = clerk.token;

    // مشرفٌ يرى العقود ويعدّلها — **بلا `review`**، فلا يُقفل مهمة عليها.
    const mgrTpl = await makeTemplate('مشرف', ['dashboard', 'contracts'], { dashboard: ['view'], contracts: ['view', 'edit'] });
    const mgr = await makeUser('taskmgr', mgrTpl.body.id);
    mgrId = mgr.id;
    mgrToken = mgr.token;
  }, 120000);

  afterAll(async () => {
    for (const id of [clerkId, mgrId]) {
      if (id) await request(app.getHttpServer()).delete(`/company-users/${id}`).set('Authorization', `Bearer ${ownerToken}`);
    }
    await app.close();
  });

  it('⭐① المكلَّف يرى وجود المهمة ولا يفتح المستند', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'راجع بند التأمين', assigneeId: clerkId, targetScreen: 'contracts', targetId: 'c-123' })
      .expect(201);
    created.push(res.body.id);

    const mine = await request(app.getHttpServer()).get('/tasks/mine').set('Authorization', `Bearer ${clerkToken}`).expect(200);
    const task = mine.body.find((t: { id: string }) => t.id === res.body.id);

    // يرى العنوان ووجود الهدف…
    expect(task.title).toBe('راجع بند التأمين');
    expect(task.target).toEqual({ screen: 'contracts', entityId: 'c-123' });
    // …ولا يُسمح له بفتحه.
    expect(task.canOpenTarget).toBe(false);
    // ولا حرفٌ من المستند نفسه في الجواب.
    expect(JSON.stringify(task)).not.toContain('contractNumber');
  });

  it('⭐② الإسناد لا يمنح صلاحية — `/me/permissions` لا يتغيّر', async () => {
    const me = await request(app.getHttpServer()).get('/me/permissions').set('Authorization', `Bearer ${clerkToken}`).expect(200);
    expect(me.body.grants).not.toContain('contracts:view');
    expect(me.body.grants).not.toContain('contracts:edit');
  });

  it('⭐③ ومَن يملك الشاشة يفتحها — نفس المهمة، فاعلٌ آخر', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'راجع نفس العقد', assigneeId: mgrId, targetScreen: 'contracts', targetId: 'c-123' })
      .expect(201);
    created.push(res.body.id);

    const mine = await request(app.getHttpServer()).get('/tasks/mine').set('Authorization', `Bearer ${mgrToken}`).expect(200);
    expect(mine.body.find((t: { id: string }) => t.id === res.body.id).canOpenTarget).toBe(true);
  });

  it('⭐④ المُسنِد لا يربط مستنداً لا يراه — الطرف الآخر من القاعدة', async () => {
    // الكاتب لا يملك `contracts:view`، فلا يربط مهمةً بعقد — وإلا كشف
    // وجود العقد ومعرّفه لمن يفتحه.
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ title: 'محاولة ربط', assigneeId: mgrId, targetScreen: 'contracts', targetId: 'c-999' })
      .expect(403);
    expect(res.body.message).toContain('لا تراه');
  });

  it('⭐⑤ الانتقال بالتفويض لا بالملكية — مكلَّفٌ بلا `review` لا يُقفل', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'أقفلني', assigneeId: mgrId, targetScreen: 'contracts', targetId: 'c-1' })
      .expect(201);
    created.push(res.body.id);

    // المشرف يملك `edit` ⇒ يبدأ العمل…
    await request(app.getHttpServer())
      .patch(`/tasks/${res.body.id}/status`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ to: 'IN_PROGRESS' })
      .expect(200);

    // …ولا يملك `review` ⇒ لا يُقفل، **وهي مهمته**.
    const denied = await request(app.getHttpServer())
      .patch(`/tasks/${res.body.id}/status`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ to: 'DONE' })
      .expect(403);
    expect(denied.body.message).toContain('الإسناد لا يمنح صلاحية');

    // والمالك يملك كل شيء ⇒ يُقفل.
    const done = await request(app.getHttpServer())
      .patch(`/tasks/${res.body.id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ to: 'DONE' })
      .expect(200);
    expect(done.body.status).toBe('DONE');
  });

  /**
   * 🔴 **ما تحجبه القائمةُ يفتحه مسارٌ بمعرّف** (`ق-٦٣٦`) — من عائلة عزل الفروع.
   *
   * «مهامي» تعرض ما كُلِّف به الفاعل. **لكنّ انتقالَ الحالة كان يفحص التفويضَ
   * وحدَه** — فحسابٌ فرعيٌّ يملك `edit` على شاشة المستند **يغيّر حالةَ مهمّةٍ
   * ليست له** إن عرف معرّفَها. **والتفويضُ يبقى شرطاً** (⭐⑤ أعلاه) **ويُضاف
   * إليه الفاعل**: المكلَّفُ أو المُنشئ — كقاعدة التعليق نصّاً — **والمالكُ
   * معفىً** كما في ورديات نقطة البيع.
   */
  it('🔴 حسابٌ فرعيٌّ يملك التفويضَ لا يغيّر حالةَ مهمّةٍ ليست له بمعرّفها (ق-٦٣٦)', async () => {
    // مهمّةٌ على العقود **مكلَّفُها الكاتب** — والمشرفُ يملك `contracts:edit`.
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'ليست للمشرف', assigneeId: clerkId, targetScreen: 'contracts', targetId: 'c-2' })
      .expect(201);
    created.push(res.body.id);

    // المشرفُ ليس مكلَّفاً ولا مُنشئاً — **والتفويضُ وحدَه كان يكفيه**.
    const denied = await request(app.getHttpServer())
      .patch(`/tasks/${res.body.id}/status`)
      .set('Authorization', `Bearer ${mgrToken}`)
      .send({ to: 'IN_PROGRESS' });
    expect(denied.status).toBe(403);

    // ⚠️ **ومُنع فعلاً لا شكلاً**: الحالةُ لم تتغيّر — يقرؤها المالك من سجلّ المهمّة.
    const log = await request(app.getHttpServer()).get(`/tasks/${res.body.id}/log`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect((log.body as { toStatus: string }[]).some((e) => e.toStatus === 'IN_PROGRESS')).toBe(false);

    // والمالكُ — الفاعلُ الذي أنشأها — يُغيّرها؛ **فالمنعُ على الغريب لا على القاعدة**.
    await request(app.getHttpServer())
      .patch(`/tasks/${res.body.id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ to: 'CANCELLED' })
      .expect(200);
  });

  it('⭐⑥ الحالة النهائية لا يُنتقل منها — إعادة الفتح مهمةٌ جديدة', async () => {
    const closed = created[created.length - 1];
    await request(app.getHttpServer())
      .patch(`/tasks/${closed}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ to: 'IN_PROGRESS' })
      .expect(403);
  });

  it('⭐⑦ التأخّر مشتقٌّ من الزمن — لا عمود يحمله', async () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'متأخّرة', assigneeId: mgrId, recurEveryDays: 0, dueAnchor: past })
      .expect(201);
    created.push(res.body.id);

    const mine = await request(app.getHttpServer()).get('/tasks/mine').set('Authorization', `Bearer ${mgrToken}`).expect(200);
    const t = mine.body.find((x: { id: string }) => x.id === res.body.id);
    expect(t.isOverdue).toBe(true);
    expect(new Date(t.dueAt).toISOString()).toBe(new Date(past).toISOString());

    const counters = await request(app.getHttpServer()).get('/tasks/counters').set('Authorization', `Bearer ${mgrToken}`).expect(200);
    expect(counters.body.overdue).toBeGreaterThan(0);
  });

  it('⭐⑧ لا يرى أحدٌ مهام غيره', async () => {
    const mine = await request(app.getHttpServer()).get('/tasks/mine').set('Authorization', `Bearer ${clerkToken}`).expect(200);
    expect(mine.body.every((t: { assigneeId: string }) => t.assigneeId === clerkId)).toBe(true);
  });

  /**
   * التذكرةُ الداخلية (`SPEC 1.11`) **مهمّةٌ بحقلين لا محرّكٌ ثانٍ** (`ق-٥٣٢`):
   * أولويةٌ من قائمةٍ مغلقةٍ في القاعدة (وهي `SPEC 14.2` نفسُها) · وقسمٌ ·
   * وتعليقٌ بلا انتقال — والمسؤولُ والحالةُ والرابطُ والسجلُّ قائمةٌ أصلاً.
   */
  it('[SPEC 14.2] ⭐⑩ الأولويةُ من قائمةٍ مغلقة — تُحفظ وتُعرض للمكلَّف، والمخترَعةُ تُرفض، والافتراضُ عادي', async () => {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `مهمّةٌ عاجلة ${suffix}`, assigneeId: clerkId, priority: 'URGENT', department: 'محاسبة' })
      .expect(201);
    expect(res.body.priority).toBe('URGENT');
    expect(res.body.department).toBe('محاسبة');

    const mine = await request(app.getHttpServer()).get('/tasks/mine').set('Authorization', `Bearer ${clerkToken}`).expect(200);
    const seen = (mine.body as { id: string; priority: string; department: string | null }[]).find((t) => t.id === res.body.id);
    expect(seen?.priority).toBe('URGENT');
    expect(seen?.department).toBe('محاسبة');

    // المخترَعةُ تُرفض قبل الخدمة — والقائمةُ مقروءةٌ من نوع القاعدة لا منسوخة.
    await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `أولويةٌ مخترَعة ${suffix}`, assigneeId: clerkId, priority: 'حرج' })
      .expect(400);

    const plain = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `بلا أولوية ${suffix}`, assigneeId: clerkId })
      .expect(201);
    expect(plain.body.priority).toBe('NORMAL');
    expect(plain.body.department).toBeNull();
  });

  it('[SPEC 1.11] ⭐⑪ تعليقٌ بلا انتقال — سطرٌ في السجل لا يغيّر الحالة، لطرفَي المهمّة وحدهما', async () => {
    const t = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `تذكرةُ عميل ${suffix}`, assigneeId: clerkId, department: 'دعم', note: 'العميل يسأل عن فاتورة يوليو' })
      .expect(201);

    // المكلَّفُ يعلّق — والحالةُ كما هي.
    const after = await request(app.getHttpServer())
      .post(`/tasks/${t.body.id}/comments`)
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ note: `تواصلتُ مع العميل ${suffix}` })
      .expect(201);
    expect(after.body.status).toBe('OPEN');

    // والمُسنِدُ يقرأ السجلَّ ويعلّق: سطرُ الإنشاء أوّلاً، ثم التعليقُ حالتُه من وإلى سواء.
    const log = await request(app.getHttpServer()).get(`/tasks/${t.body.id}/log`).set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const lines = log.body as { seq: number; fromStatus: string | null; toStatus: string; note: string | null }[];
    expect(lines[0].fromStatus).toBeNull();
    expect(lines[0].toStatus).toBe('OPEN');
    const comment = lines.find((l) => l.note?.includes(suffix) && l.fromStatus === 'OPEN' && l.toStatus === 'OPEN');
    expect(comment).toBeTruthy();
    expect(lines.map((l) => l.seq)).toEqual([...lines.map((l) => l.seq)].sort((a, b) => a - b));
    await request(app.getHttpServer()).post(`/tasks/${t.body.id}/comments`).set('Authorization', `Bearer ${ownerToken}`).send({ note: 'شكراً — تابع' }).expect(201);

    // 🔴 وغيرُ الطرفين يُردّ — لا يعلّق ولا يقرأ: الحوارُ للمكلَّف ومن أسنده.
    await request(app.getHttpServer()).post(`/tasks/${t.body.id}/comments`).set('Authorization', `Bearer ${mgrToken}`).send({ note: 'دخيل' }).expect(403);
    await request(app.getHttpServer()).get(`/tasks/${t.body.id}/log`).set('Authorization', `Bearer ${mgrToken}`).expect(403);

    // وتعليقٌ فارغٌ يُرفض قبل الخدمة.
    await request(app.getHttpServer()).post(`/tasks/${t.body.id}/comments`).set('Authorization', `Bearer ${clerkToken}`).send({ note: '' }).expect(400);
  });

  it('⭐⑨ المفردات المخترَعة مرفوضة قبل أن تصل الخدمة', async () => {
    for (const bad of [
      { targetScreen: 'invoices', targetId: 'x' },
      { targetScreen: 'contracts' },
      { recurEveryDays: 7 },
    ]) {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: 'خطأ', assigneeId: mgrId, ...bad })
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch(`/tasks/${created[0]}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ to: 'ARCHIVED' })
      .expect(400);
  });
});
