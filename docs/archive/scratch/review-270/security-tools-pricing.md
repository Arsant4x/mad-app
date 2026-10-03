# أدواتُ الفحص الآليّ لمستودعٍ خاصّ: ما المجانيّ وما بكلفة (قراءةٌ ٣٠ سبتمبر ٢٠٢٦، لا تثبيت)

**قيدٌ حاكمٌ أوّلاً:** المستودع خاصٌّ على **حسابٍ شخصيٍّ بخطّة Pro**. ووثائق GitHub نصّاً: «You must be on a GitHub Team or GitHub Enterprise plan in order to purchase GitHub Code Security or GitHub Secret Protection». فأدواتُ GitHub الأمنية المدفوعة **لا تُشترى لحسابنا كما هو**؛ تحتاج نقلَ المستودع إلى منظّمة على Team.

| الطبقة (ق-١٥٤٥/ب) | مجانيٌّ لمستودعنا | بكلفة، وكم |
|---|---|---|
| **ثغراتُ المكتبات** | تنبيهاتُ Dependabot (مذكورةٌ في خطّة Free للحساب الشخصيّ) · Trivy (رخصة Apache 2.0) · Semgrep Supply Chain في الطبقة المجانية (حتى ١٠ مساهمين و١٠ مستودعاتٍ خاصّة) | Semgrep Supply Chain ‏30$ للمساهم شهرياً · Snyk Team «يبدأ من 25$ شهرياً» |
| **الأسرار** | gitleaks (لا يحتاج مفتاحَ ترخيص لحسابٍ شخصيّ؛ ويحتاج مفتاحاً مجانياً لحساب منظّمة) · Trivy يفحص الأسرار أيضاً | GitHub Secret Protection ‏19$ لكلّ مُلتزمٍ نشِط شهرياً (يشترط منظّمةً على Team) · Semgrep Secrets ‏15$ للمساهم شهرياً (ليس في الطبقة المجانية) |
| **تحليلُ الكود بقواعد أمنية** | Semgrep Code في الطبقة المجانية (حتى ١٠ مساهمين) | GitHub Code Security (CodeQL) ‏30$ لكلّ مُلتزمٍ نشِط شهرياً (يشترط منظّمةً على Team) · Semgrep Code ‏30$ للمساهم شهرياً · Snyk Code المجانيّ ١٠٠ فحصٍ شهرياً فقط |
| **فحصُ صور الحاويات** | Trivy (Apache 2.0) | Snyk Container ضمن خططه |
| **هجومٌ آليٌّ على نسخةٍ تجريبية** | ZAP بإجرائه `zaproxy/action-baseline` (Apache 2.0، فحصٌ سلبيٌّ لعنوانٍ مُعطى) | لا حاجةَ لمدفوعٍ في هذه الطبقة مبدئياً |

**وكلفةٌ خفيّة في كلّ ما سبق:** كلُّ أداةٍ تعمل في GitHub Actions تستهلك دقائقَ المستودع الخاصّ (خطّةُ Pro فيها ٣٬٠٠٠ دقيقة شهرياً، و«المجانيّ للمستودعات العامة» وحدَها). فالأداةُ المجانية ليست بلا كلفة إن شُغّلت مع كلّ دمج.

**ولو نُقل المستودع إلى منظّمة:** Team ‏4$ للمستخدم شهرياً (أوّلَ ١٢ شهراً بنصّ الصفحة) + ‏19$ للأسرار + ‏30$ لتحليل الكود، لكلّ مُلتزمٍ نشِط. والمُلتزمُ اليومَ حسابٌ واحد.

**ما لم يُقرأ:** هل تحديثاتُ Dependabot الأمنية (لا التنبيهات وحدها) مجانيةٌ للحساب الشخصيّ الخاصّ؛ حدودُ Snyk المجانية لغير Code؛ ورخصةُ إجراء gitleaks بعد إصداره الثاني (تغيّرت عن MIT والنصُّ في ملفٍّ لم يُقرأ).

**المصادر:** github.com/security/plans · docs.github.com (about GitHub Advanced Security · GitHub's plans) · github.com/pricing · semgrep.dev/pricing · github.com/gitleaks/gitleaks-action · github.com/aquasecurity/trivy · github.com/zaproxy/action-baseline · snyk.io/plans
