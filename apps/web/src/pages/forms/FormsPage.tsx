import { useSearchParams } from 'react-router-dom';
import { CompanyTemplatesTab } from './CompanyTemplatesTab';
import { FormRecordsTab } from './FormRecordsTab';
import { SigningSettingsTab } from './SigningSettingsTab';

type Tab = 'records' | 'templates' | 'signing';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'records', label: 'السجلّات' },
  { id: 'templates', label: 'قوالبُ المنشأة' },
  { id: 'signing', label: 'إعدادُ التوقيع' },
];

/**
 * ⚖️ **شاشةُ «النماذج»** (توجيه ٢٧٨ · `ق-١٦٣٨`، بحكم صاحب المشروع: «تُبنيان شاشةً مستقلّةً باسم «النماذج» لا داخل نافذة العقد،
 * فلا تنتظران فرعَ وكيل الواجهة، وشاشةُ العقد الجديدة تضيف لاحقاً زرّاً يفتحها»).
 *
 * **بوّابةُ الفاعل** (`CLAUDE.md §3.5`): الفاعلُ مالكُ المنشأة وموظّفوها، والشاشةُ في واجهة المنشأة. **السجلّاتُ** (الموجة ١د)
 * بأفعال شاشة العقود، **وقوالبُ المنشأة** (الموجة ١ب) يحرّرها المالك ويراها غيرُه، **وإعدادُ التوقيع** (توجيه ٢٨٧) لمالك المنشأة.
 * والتبويبُ في الرابط (`?tab=`) كالعقد.
 */
export function FormsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = requested === 'templates' || requested === 'signing' ? requested : 'records';
  const select = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'records') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">النماذج</div>
          <div className="page-sub">نماذجُ التسليم والاستلام: تُعبّأ على قالبٍ منشور، وتُختم ببصمةٍ ورقمٍ فلا تُعدَّل بعدها</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => select(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'records' ? <FormRecordsTab /> : tab === 'templates' ? <CompanyTemplatesTab /> : <SigningSettingsTab />}
    </div>
  );
}
