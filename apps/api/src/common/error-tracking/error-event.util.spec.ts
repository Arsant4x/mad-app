import { ALLOWED_EVENT_KEYS, buildErrorEvent, deriveUserKey, errorValue, hashUserId, parseDsn, parseStack, routeOf, scrubText } from './error-event.util';

/**
 * ③ (`ق-١٣٣١`) — **حدثُ الخطأ بقائمة سماح**: لا يخرج إلا المسارُ والخطأُ والتتبّعُ ومعرّفُ الطلب ومعرّفُ المستخدم
 * مُبصَّماً؛ **والنصُّ الحرّ الوحيد (الرسالة) يُقصّ ويُعمّى**. والعيّناتُ تُبنى بدوالّ لا حرفياً (`§8.7`).
 */
const email = (): string => ['merchant', 'example.org'].join('@');
const nationalId = (): string => ['10', '23456789'].join('');
const vatNo = (): string => ['3001', '2345', '6789', '003'].join('');
const iban = (): string => ['SA', '03', '8000', '0000', '6080', '1016', '7519'].join('');
const uuid = (): string => '0b6f5c3e-8d1a-4c2b-9e7f-1a2b3c4d5e6f';

describe('③ حدثُ الخطأ — قائمةُ سماحٍ لا حجب (ق-١٣٣١)', () => {
  it('① لا يحمل الحدثُ إلا المفاتيحَ المسمّاة — ولا بابَ فيه لجسمٍ أو ترويسةٍ أو كوكي أو استعلام', () => {
    const event = buildErrorEvent(new Error('boom'), { method: 'post', route: '/invoices/:id', status: 500, requestId: uuid(), userId: 'identity-1' }, { environment: 'production', userKey: deriveUserKey('s'.repeat(64)) });
    for (const key of Object.keys(event)) expect(ALLOWED_EVENT_KEYS).toContain(key);
    expect(Object.keys(event.tags).sort()).toEqual(['http_method', 'request_id', 'status_code']);
    expect(Object.keys(event.user ?? {})).toEqual(['id']);
    expect(event.transaction).toBe('POST /invoices/:id');
    expect(event.tags).toEqual({ http_method: 'POST', status_code: '500', request_id: uuid() });
    // ولا مفتاحَ اسمُه ما يُحجب — في أيّ عمق.
    const json = JSON.stringify(event).toLowerCase();
    for (const banned of ['"request"', '"headers"', '"cookies"', '"data"', '"query_string"', '"ip_address"', '"breadcrumbs"', '"extra"']) expect(json).not.toContain(banned);
  });

  it('② التعميةُ: بريدٌ وهويةٌ ورقمٌ ضريبيٌّ وآيبانٌ وهاتفٌ ورمزٌ ومعرّفٌ وقيمةٌ منصوصة — ويبقى ما ليس بياناً', () => {
    const text = `failed for ${email()} id ${nationalId()} vat ${vatNo()} iban ${iban()} tel +966501234567 or 0551234567 token eyJhbGciOiJI.eyJzdWIiOiIx.c2lnbmF0dXJl bearer abc.def row ${uuid()} value "محمد العتيبي" in "users" line 42 amount 1500 ٤٥٦٧٨٩١٢٣٤`;
    const out = scrubText(text);
    for (const leak of [email(), nationalId(), vatNo(), iban(), '501234567', '0551234567', 'eyJhbGciOiJI', 'abc.def', uuid(), 'محمد', '٤٥٦٧٨٩١٢٣٤']) expect(out).not.toContain(leak);
    for (const kept of ['"users"', 'line 42', 'amount 1500', '<email>', '<iban>', '<phone>', '<token>', '<id>', '"<v>"', '<n>']) expect(out).toContain(kept);
  });

  it('③ الرسالةُ سطرُها الأوّل وحدَه — ونسخةُ الاستدعاء بقيمه في أخطاء Prisma لا تخرج', () => {
    const prismaValidation = new Error(['', 'Invalid `prisma.companyUser.create()` invocation in', '/app/dist/src/x.js:10:5', '', `→ 10   data: { email: "${email()}", password: "Secret123!" }`, 'Argument `name` is missing.'].join('\n'));
    const value = errorValue(prismaValidation);
    expect(value).toBe('Invalid `prisma.companyUser.create()` invocation in');
    expect(value).not.toContain(email());

    // الخطأُ المعروف: رمزُه وأسماءُ حقوله — لا نصُّه.
    const known = Object.assign(new Error(`Unique constraint failed: ${email()}`), { code: 'P2002', meta: { modelName: 'CompanyUser', target: ['email'] } });
    expect(errorValue(known)).toBe('Prisma P2002 · CompanyUser · email');

    expect(errorValue('x'.repeat(1000)).length).toBe(300);
    expect(errorValue({ weird: true })).toBe('');
  });

  it('④ التتبّعُ: الأقدمُ أوّلاً، والمسارُ نسبيٌّ بلا اسم مستخدم الجهاز، وإطاراتُ المكتبات ليست من التطبيق', () => {
    const stack = [
      'Error: boom',
      '    at InvoicesService.create (C:\\Users\\someone\\mad-app\\apps\\api\\dist\\src\\invoices\\invoices.service.js:120:11)',
      '    at /app/node_modules/@nestjs/core/router/router-execution-context.js:46:28',
      '    at async Promise.all (index 0)',
      '    at node:internal/process/task_queues:95:5',
    ].join('\n');
    const frames = parseStack(stack);
    expect(frames.map((f) => f.filename)).toEqual(['node:internal/process/task_queues', 'node_modules/@nestjs/core/router/router-execution-context.js', 'apps/api/dist/src/invoices/invoices.service.js']);
    expect(frames.map((f) => f.in_app)).toEqual([false, false, true]);
    expect(frames[2]).toMatchObject({ function: 'InvoicesService.create', lineno: 120, colno: 11 });
    expect(JSON.stringify(frames)).not.toContain('someone');
  });

  it('⑤ معرّفُ المستخدم مُبصَّمٌ بمفتاح — ثابتٌ للواحد ومختلفٌ بين اثنين ولا يحمل الخام؛ وبلا مفتاحٍ لا يُرسَل', () => {
    const key = deriveUserKey('k'.repeat(64));
    const a = hashUserId('identity-1', key);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(hashUserId('identity-1', key)).toBe(a);
    expect(hashUserId('identity-2', key)).not.toBe(a);
    expect(hashUserId('identity-1', deriveUserKey('z'.repeat(64)))).not.toBe(a);
    const withoutKey = buildErrorEvent(new Error('x'), { method: 'GET', route: '/me', status: 500, userId: 'identity-1' });
    expect(withoutKey.user).toBeUndefined();
    const withKey = buildErrorEvent(new Error('x'), { method: 'GET', route: '/me', status: 500, userId: 'identity-1' }, { userKey: key });
    expect(withKey.user).toEqual({ id: a });
    expect(JSON.stringify(withKey)).not.toContain('identity-1');
  });

  it('⑥ المسارُ قالبٌ بلا استعلام — والمسارُ الخامُ تُستبدل معرّفاتُه', () => {
    expect(routeOf('/invoices/:id')).toBe('/invoices/:id');
    expect(routeOf(`/invoices/${uuid()}/lines/7?search=${encodeURIComponent('محمد')}&email=${email()}`)).toBe('/invoices/:id/lines/:n');
  });

  it('⑦ الـDSN: https وحدَه (إلا المحلّيّ للاختبار) — ومفتاحٌ ورقمُ مشروعٍ لازمان', () => {
    expect(parseDsn('https://abc123@errors.rikzapp.com/12')).toEqual({ endpoint: 'https://errors.rikzapp.com/api/12/store/', publicKey: 'abc123' });
    expect(parseDsn('https://abc123@errors.rikzapp.com/gt/12')).toEqual({ endpoint: 'https://errors.rikzapp.com/gt/api/12/store/', publicKey: 'abc123' });
    expect(parseDsn('http://abc@127.0.0.1:9123/3')?.endpoint).toBe('http://127.0.0.1:9123/api/3/store/');
    for (const bad of ['http://abc@errors.rikzapp.com/12', 'https://errors.rikzapp.com/12', 'https://abc@errors.rikzapp.com/project', 'ليس عنواناً', '']) expect(parseDsn(bad)).toBeNull();
  });
});
