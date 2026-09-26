import { BadRequestException } from '@nestjs/common';
import { MSG } from '../common/i18n/messages';
import { IntegrationsService, KNOWN_PROVIDERS, TEST_ONLY_PROVIDERS } from './integrations.service';
import { isCompleteListing, LICENSED_PAYMENT_PROVIDERS, RegulatorListing, unlistedProviders } from './licensed-payment-providers';

/**
 * 🔴 **حارسُ `ق-١٤٩٨`**: «وقائمةُ ساما: المرجعُ في اختيار مزوّد الدفع، ولا يُربط إلا بمدرَجٍ فيها.» (حكمُ المالك 2026-09-27)
 *
 * طبقتان: ① **الشيفرة** — كلُّ مزوّدٍ حقيقيٍّ لبوّابة الدفع في `KNOWN_PROVIDERS` له مدخلٌ مكتملٌ في `LICENSED_PAYMENT_PROVIDERS`
 * وإلا سقطت الحزمة · ② **الطلب** — لو سُجّل مزوّدٌ بلا مدخلٍ رفض الإنشاءُ ربطَه برسالةٍ مسمّاة.
 *
 * ⚠️ **والمسبارُ مُصادَقٌ بحالتين** قبل الحكم على السجلّ الحقيقيّ (`ق-١٣٦`): مزوّدٌ بلا مدخلٍ يُمسَك، ومدخلٌ مكتملٌ يمرّ —
 * فصفرُ السجلّ الحقيقيّ اليوم (لا مزوّدَ حقيقيّ بعد) حكمٌ لا عمى.
 */
describe('🔴 لا يُربط مزوّدُ دفعٍ إلا بمدرَجٍ في سجلّ جهته المنظِّمة (ق-١٤٩٨)', () => {
  const complete: RegulatorListing = {
    regulator: 'REGULATOR',
    listedName: 'Example Payments Company',
    category: 'Payment Institution',
    registerUrl: 'https://regulator.example/licensed-companies',
    readOn: '2026-09-27',
  };

  it('⓪ المسبارُ يرى: مزوّدٌ حقيقيٌّ بلا مدخلٍ يُمسَك، والتجريبيُّ خارجُه، والمدخلُ المكتملُ يمرّ', () => {
    const testOnly = new Set(['MOCK']);
    expect(unlistedProviders(['ACME', 'MOCK'], testOnly, {})).toEqual(['ACME']);
    expect(unlistedProviders(['ACME', 'MOCK'], testOnly, { ACME: complete })).toEqual([]);
  });

  it('⓪ والمدخلُ الناقص لا يُرضي الحارسَ شكلاً: اسمٌ فارغ · رابطٌ غيرُ آمن · تاريخٌ بلا صيغته · جهةٌ فارغة', () => {
    expect(isCompleteListing(complete)).toBe(true);
    expect(isCompleteListing({ ...complete, listedName: '  ' })).toBe(false);
    expect(isCompleteListing({ ...complete, registerUrl: 'http://regulator.example/list' })).toBe(false);
    expect(isCompleteListing({ ...complete, readOn: '27/09/2026' })).toBe(false);
    expect(isCompleteListing({ ...complete, regulator: '' })).toBe(false);
    expect(isCompleteListing(undefined)).toBe(false);
  });

  it('① السجلُّ الحقيقيّ: كلُّ مزوّدٍ حقيقيٍّ لبوّابة الدفع مدرَج — والمسبارُ يقرأ القائمةَ الحقيقية لا فارغة', () => {
    const gateway = KNOWN_PROVIDERS.PAYMENT_GATEWAY;
    // يرى: القائمةُ الحقيقية فيها على الأقلّ التجريبيّ — فصفرٌ بعدها ليس قائمةً فارغةً قُرئت.
    expect(gateway.length).toBeGreaterThan(0);
    expect(unlistedProviders(gateway, TEST_ONLY_PROVIDERS, LICENSED_PAYMENT_PROVIDERS)).toEqual([]);
    // وكلُّ مدخلٍ في السجلّ مكتمل — لا مدخلَ ناقصٌ ينتظر مزوّداً.
    expect(Object.entries(LICENSED_PAYMENT_PROVIDERS).filter(([, l]) => !isCompleteListing(l)).map(([p]) => p)).toEqual([]);
  });

  it('② الطلب: مزوّدٌ سُجّل في الشيفرة بلا مدخلٍ يُرفض ربطُه برسالةٍ مسمّاة — ولا صفَّ يُنشأ', async () => {
    const tx = { integrationConnection: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() } };
    const tenantPrisma = { runInTenantContext: (_c: string, fn: (t: unknown) => unknown) => fn(tx) };
    const service = new IntegrationsService(tenantPrisma as never);
    KNOWN_PROVIDERS.PAYMENT_GATEWAY.push('UNLISTED_PROVIDER');
    try {
      const refused = await service
        .create('c1', { kind: 'PAYMENT_GATEWAY', provider: 'UNLISTED_PROVIDER', credentials: { apiKey: 'k' } })
        .catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(BadRequestException);
      expect(String((refused as Error).message)).toContain(MSG.integration_provider_not_licensed);
      expect(tx.integrationConnection.create).not.toHaveBeenCalled();
    } finally {
      KNOWN_PROVIDERS.PAYMENT_GATEWAY.splice(KNOWN_PROVIDERS.PAYMENT_GATEWAY.indexOf('UNLISTED_PROVIDER'), 1);
    }
  });
});
