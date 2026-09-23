import { ArgumentsHost, BadRequestException, ConflictException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpExceptionFilter } from '../i18n/http-exception.filter';
import { ALLOWED_EVENT_KEYS } from './error-event.util';
import { ErrorReporter } from './error-reporter';

/**
 * ③ (`ق-١٣٣١`) — **الإرسالُ من المصفاة الحقيقية إلى خادمٍ محلّيٍّ يمثّل GlitchTip** (لا مكتبةَ ولا شبكة):
 * يُثبت أن ما يصل الخادمَ **هو قائمةُ السماح وحدَها** مهما حمل الطلبُ — جسمٌ فيه كلمةُ مرورٍ وبريد، وترويسةُ مصادقة،
 * وكوكي، واستعلامٌ باسمٍ، وعنوانُ الشبكة — **وأن الإرسالَ لا يكسر الاستجابة** إن سقط الخادمُ أو أبطأ.
 */
interface Received {
  method?: string;
  url?: string;
  auth?: string;
  body: string;
}

async function startServer(mode: 'ok' | 'hang' = 'ok'): Promise<{ server: Server; port: number; next: () => Promise<Received> }> {
  const queue: Received[] = [];
  const waiters: Array<(r: Received) => void> = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf8')));
    req.on('end', () => {
      const got: Received = { method: req.method, url: req.url, auth: req.headers['x-sentry-auth'] as string | undefined, body };
      const w = waiters.shift();
      if (w) w(got);
      else queue.push(got);
      if (mode === 'ok') res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":"x"}');
      // `hang`: لا ردّ — ليُثبَت أن المهلةَ تقطع ولا تحبس شيئاً.
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const next = () =>
    new Promise<Received>((resolve, reject) => {
      const ready = queue.shift();
      if (ready) return resolve(ready);
      const timer = setTimeout(() => reject(new Error('لم يصل الخادمَ شيءٌ خلال ثلاث ثوانٍ')), 3000);
      waiters.push((r) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
  return { server, port, next };
}

async function stop(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

const email = (): string => ['merchant', 'example.org'].join('@');
const REQUEST_ID = '0b6f5c3e-8d1a-4c2b-9e7f-1a2b3c4d5e6f';

/** طلبٌ يحمل كلَّ ما يُحجب — ليُثبَت أن شيئاً منه لا يصل. */
function loadedRequest() {
  return {
    method: 'POST',
    baseUrl: '',
    route: { path: '/invoices/:id' },
    path: '/invoices/77',
    url: '/invoices/77?search=%D9%85%D8%AD%D9%85%D8%AF',
    headers: { authorization: 'Bearer eyJhbGciOiJI.eyJzdWIiOiIx.c2lnbmF0dXJl', cookie: 'refresh=super-secret-cookie', 'accept-language': 'ar' },
    cookies: { refresh: 'super-secret-cookie' },
    body: { email: email(), password: 'Secret123!', notes: 'هوية 1023456789' },
    query: { search: 'محمد' },
    ip: '10.1.2.3',
    requestId: REQUEST_ID,
    user: { sub: 'identity-9' },
  };
}

function fakeHost(req: object) {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as unknown as ArgumentsHost;
  return { host, res };
}

describe('③ متتبّعُ الأخطاء — ما يصل الخادمَ قائمةُ السماح وحدَها، والإرسالُ لا يكسر الاستجابة (ق-١٣٣١)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('⭐ ① خطأٌ داخليّ من المصفاة الحقيقية ⟸ يصل الخادمَ حدثٌ بقائمة السماح — ولا شيءَ من الجسم أو الترويسات أو الكوكي أو الاستعلام', async () => {
    const { server, port, next } = await startServer();
    try {
      const reporter = new ErrorReporter({ endpoint: `http://127.0.0.1:${port}/api/7/store/`, publicKey: 'pubkey' }, { environment: 'production', userKey: Buffer.from('k'.repeat(32)) });
      const { host, res } = fakeHost(loadedRequest());
      new HttpExceptionFilter(reporter).catch(new Error(`boom for ${email()}`), host);

      // الاستجابةُ كما كانت: 500 برسالةٍ محلّية لا بنصّ الخطأ.
      expect(res.statusCode).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('boom');

      const got = await next();
      expect(got.method).toBe('POST');
      expect(got.url).toBe('/api/7/store/');
      expect(got.auth).toContain('sentry_key=pubkey');
      const event = JSON.parse(got.body) as Record<string, unknown>;
      for (const key of Object.keys(event)) expect(ALLOWED_EVENT_KEYS).toContain(key);
      expect(event.transaction).toBe('POST /invoices/:id');
      expect((event.tags as Record<string, string>).request_id).toBe(REQUEST_ID);
      for (const leak of [email(), 'Secret123!', 'eyJhbGciOiJI', 'super-secret-cookie', 'محمد', '%D9%85', '1023456789', '10.1.2.3', 'identity-9', 'refresh']) {
        expect(got.body).not.toContain(leak);
      }
      expect(got.body).toContain('<email>');
    } finally {
      await stop(server);
    }
  });

  it('② رفضٌ مسمّى (4xx) لا يُبلَّغ — وعطلُ خدمةٍ (503) يُبلَّغ', () => {
    const reporter = new ErrorReporter({ endpoint: 'http://127.0.0.1:9/api/1/store/', publicKey: 'k' });
    const report = jest.spyOn(reporter, 'report').mockResolvedValue(true);
    const filter = new HttpExceptionFilter(reporter);
    for (const e of [new BadRequestException('x'), new NotFoundException('x'), new ConflictException('x')]) filter.catch(e, fakeHost(loadedRequest()).host);
    expect(report).not.toHaveBeenCalled();
    filter.catch(new ServiceUnavailableException('x'), fakeHost(loadedRequest()).host);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][2]).toBe(503);
  });

  it('③ خادمٌ ساقط ⟸ الإرسالُ يعود «لم يُحفظ» ولا يرمي — والاستجابةُ 500 كما هي', async () => {
    const { server, port } = await startServer();
    await stop(server); // المنفذُ مغلق: رفضُ اتصال.
    const reporter = new ErrorReporter({ endpoint: `http://127.0.0.1:${port}/api/1/store/`, publicKey: 'k' });
    const { host, res } = fakeHost(loadedRequest());
    new HttpExceptionFilter(reporter).catch(new Error('db down'), host);
    expect(res.statusCode).toBe(500);
    await expect(reporter.report(new Error('db down'), loadedRequest() as never, 500)).resolves.toBe(false);
  });

  it('④ خادمٌ لا يردّ ⟸ المهلةُ تقطع — وعاصفةُ أخطاءٍ لا تصير عاصفةَ اتصالات (حدُّ ما في الطريق)', async () => {
    const { server, port } = await startServer('hang');
    try {
      const reporter = new ErrorReporter({ endpoint: `http://127.0.0.1:${port}/api/1/store/`, publicKey: 'k' }, { timeoutMs: 300, maxInFlight: 2 });
      const started = Date.now();
      const first = reporter.report(new Error('a'), loadedRequest() as never, 500);
      const second = reporter.report(new Error('b'), loadedRequest() as never, 500);
      // الثالثُ فوق الحدّ: يُسقَط فوراً بلا اتصال.
      await expect(reporter.report(new Error('c'), loadedRequest() as never, 500)).resolves.toBe(false);
      await expect(first).resolves.toBe(false);
      await expect(second).resolves.toBe(false);
      expect(Date.now() - started).toBeLessThan(2500);
    } finally {
      await stop(server);
    }
  });

  it('⑤ من البيئة: بلا DSN لا مُرسِلَ أصلاً — وDSN مكسورٌ يُخطئ باسمٍ ولا يُرسِل', () => {
    expect(ErrorReporter.fromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(ErrorReporter.fromEnv({ ERROR_TRACKING_DSN: '   ' } as NodeJS.ProcessEnv)).toBeNull();
    expect(ErrorReporter.fromEnv({ ERROR_TRACKING_DSN: 'http://k@errors.rikzapp.com/1' } as NodeJS.ProcessEnv)).toBeNull();
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('ERROR_TRACKING_DSN غير صالح'));
    expect(ErrorReporter.fromEnv({ ERROR_TRACKING_DSN: 'https://k@errors.rikzapp.com/1', SECRETS_ENCRYPTION_KEY: 's'.repeat(64) } as NodeJS.ProcessEnv)).toBeInstanceOf(ErrorReporter);
  });
});
