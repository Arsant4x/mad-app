import { useSearchParams } from 'react-router-dom';
import { CompanyTemplatesTab } from './CompanyTemplatesTab';
import { FormRecordsTab } from './FormRecordsTab';

type Tab = 'records' | 'templates';

/**
 * ⚖️ **شاشةُ «النماذج»** (توجيه ٢٧٨ · `ق-١٦٣٨`، بحكم صاحب المشروع: «تُبنيان شاشةً مستقلّةً باسم «النماذج» لا داخل نافذة العقد،
 * فلا تنتظران فرعَ وكيل الواجهة، وشاشةُ العقد الجديدة تضيف لاحقاً زرّاً يفتحها»).
 *
 * **بوّابةُ الفاعل** (`CLAUDE.md §3.5`): الفاعلُ مالكُ المنشأة وموظّفوها، والشاشةُ في واجهة المنشأة. **السجلّاتُ** (الموجة ١د)
 * بأفعال شاشة العقود، **وقوالبُ المنشأة** (الموجة ١ب) يحرّرها المالك ويراها غيرُه. والتبويبُ في الرابط (`?tab=`) كالعقد.
 */
export function FormsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'templates' ? 'templates' : 'records';
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
        <button className={tab === 'records' ? 'tab active' : 'tab'} onClick={() => select('records')}>
          السجلّات
        </button>
        <button className={tab === 'templates' ? 'tab active' : 'tab'} onClick={() => select('templates')}>
          قوالبُ المنشأة
        </button>
      </div>

      {tab === 'records' ? <FormRecordsTab /> : <CompanyTemplatesTab />}
    </div>
  );
}
