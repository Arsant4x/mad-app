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
