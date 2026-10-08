import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MSG } from '../common/i18n/messages';
import {
  chosenProvider,
  IDENTITY_PROVIDER_FACTORIES,
  type IdentityProvider,
  SMS_CHANNEL_FACTORIES,
  type SmsChannel,
  TEST_ONLY_IDENTITY_PROVIDERS,
  TEST_ONLY_SMS_PROVIDERS,
} from './providers';

/**
 * **الباب الواحد إلى المزوّدَين** (توجيه ٢٨٧ ⑩): المزوّدُ يُقرأ من البيئة عند كلِّ استعمال ويُفحص:
 * غائبٌ ⟵ `503` باسمه (لا إرسالَ ولا نزولَ إلى غيره) · تجريبيٌّ في الإنتاج ⟵ `503` باسمه (الحاجزُ الثاني بعد الإقلاع، كحاجز «الشحن» في
 * الجهاز التجريبيّ) · غيرُ مسجَّل ⟵ `503`. والمحوّلُ نفسُه يُبنى مرّةً لكلِّ اسم، فيقرأ الاختبارُ صندوقَ التجريبيّ الذي أرسل إليه المسار.
 */
@Injectable()
export class VerificationGateway {
  private readonly smsCache = new Map<string, SmsChannel>();
  private readonly identityCache = new Map<string, IdentityProvider>();

  sms(): SmsChannel {
    const name = chosenProvider('SMS');
    if (!name) throw new ServiceUnavailableException(MSG.sms_provider_missing);
    if (process.env.NODE_ENV === 'production' && TEST_ONLY_SMS_PROVIDERS.has(name)) throw new ServiceUnavailableException(MSG.sms_test_provider_in_production);
    const factory = SMS_CHANNEL_FACTORIES[name];
    if (!factory) throw new ServiceUnavailableException(MSG.sms_provider_missing);
    let channel = this.smsCache.get(name);
    if (!channel) this.smsCache.set(name, (channel = factory()));
    return channel;
  }

  identity(): IdentityProvider {
    const name = chosenProvider('IDENTITY');
    if (!name) throw new ServiceUnavailableException(MSG.identity_provider_missing);
    if (process.env.NODE_ENV === 'production' && TEST_ONLY_IDENTITY_PROVIDERS.has(name)) throw new ServiceUnavailableException(MSG.identity_test_provider_in_production);
    const factory = IDENTITY_PROVIDER_FACTORIES[name];
    if (!factory) throw new ServiceUnavailableException(MSG.identity_provider_missing);
    let provider = this.identityCache.get(name);
    if (!provider) this.identityCache.set(name, (provider = factory()));
    return provider;
  }
}
