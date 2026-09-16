import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * ⚖️ **خادمٌ محلّيٌّ يمثّل الهيئة — يجيب برمز الحالة** (`ق-٩٧١`/٢).
 *
 * كانت الحِزمُ تصنع «المردودة» بمنفذٍ لا يصغي (`127.0.0.1:9`) — وذاك **سقوطُ نقلٍ لا ردٌّ**،
 * وقد افترقا: سقوطُ النقل يُرمى فيعود الطابور، و`REJECTED` لا يُكتب إلا على **جوابٍ** من
 * الهيئة. فالمردودةُ الحقيقيةُ الشكل تُصنع هنا: جوابُ `400` بنتائج تحقّقٍ — كما تجيب الهيئة.
 *
 * ⛔ لا شبكةَ هيئة: العنوانُ يُضبط في `ZATCA_API_BASE_OVERRIDE` على هذا الخادم وحده.
 */
export type AuthorityVerdict =
  /** `400` بنتائج تحقّق — ردٌّ على المستند (`REJECTED`). */
  | 'reject'
  /** `200` — قبول (`CLEARED`). */
  | 'clear'
  /** `503` — خادمُ الهيئة معطَّل: ليس جواباً على المستند. */
  | 'outage'
  /** `401` — اعتمادٌ مرفوض: ليس جواباً على المستند. */
  | 'unauthorized';

export interface AuthorityStub {
  url: string;
  verdict: AuthorityVerdict;
  /** ما وصل الخادمَ — مسارُه وجسدُه — كي يُثبَت أن الإرسال وقع فعلاً. */
  requests: { path: string; body: Record<string, unknown> }[];
  set(verdict: AuthorityVerdict): void;
  close(): Promise<void>;
}

export const STUB_REJECTION_MESSAGE = 'رفضٌ من خادمٍ محلّيٍّ يمثّل الهيئة — BR-KSA-STUB';

/** يُشغَّل في `beforeAll` ويُغلق في `afterAll`؛ ويضبط `ZATCA_API_BASE_OVERRIDE` بنفسه. */
export async function startAuthorityStub(initial: AuthorityVerdict = 'reject'): Promise<AuthorityStub> {
  const requests: AuthorityStub['requests'] = [];
  let verdict: AuthorityVerdict = initial;
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      let body: Record<string, unknown> = {};
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        body = { raw };
      }
      requests.push({ path: req.url ?? '', body });
      res.setHeader('Content-Type', 'application/json');
      const reporting = (req.url ?? '').includes('/reporting/');
      switch (verdict) {
        case 'clear':
          res.statusCode = 200;
          res.end(JSON.stringify(reporting ? { reportingStatus: 'REPORTED', validationResults: { status: 'PASS' } } : { clearanceStatus: 'CLEARED', validationResults: { status: 'PASS' } }));
          return;
        case 'reject':
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              ...(reporting ? { reportingStatus: 'NOT_REPORTED' } : { clearanceStatus: 'NOT_CLEARED' }),
              validationResults: { status: 'ERROR', errorMessages: [{ type: 'ERROR', code: 'BR-KSA-STUB', category: 'STUB', message: STUB_REJECTION_MESSAGE, status: 'ERROR' }] },
            }),
          );
          return;
        case 'outage':
          res.statusCode = 503;
          res.end(JSON.stringify({ message: 'stub: authority unavailable' }));
          return;
        case 'unauthorized':
          res.statusCode = 401;
          res.end(JSON.stringify({ message: 'stub: unauthorized' }));
          return;
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ZATCA_API_BASE_OVERRIDE = url;
  return {
    url,
    get verdict() {
      return verdict;
    },
    requests,
    set(next) {
      verdict = next;
    },
    async close() {
      delete process.env.ZATCA_API_BASE_OVERRIDE;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** منفذٌ لا يصغي — سقوطُ نقلٍ خالص، لا جوابَ فيه. */
export const DEAD_PORT_URL = 'http://127.0.0.1:9';
