import { DelegationLink, effectiveGrants, hasGrant, RootGrants } from './intersection';
import { Grant } from './permission-tree';

/**
 * حارس التقاطع الحيّ.
 *
 * **المتطلب المُلزِم** (الملحق (1) من قرار ZATCA، `Uncontrolled access` ⇒
 * `Absence of user session management`): **السحب يسري على جلسة قائمة فوراً**
 * — لا بعد إعادة الدخول ولا بعد انقضاء رمز.
 *
 * وتحقيقه هنا بنيويّ: لا نسخة تُبطَل، بل تقاطعٌ يُحسب لحظة كل فحص. فالحارس
 * يفحص **السلوك عند الحساب** لا وجود دالة إبطال.
 *
 * ⚠️ ويقرأ **مصدره لا مخرَجه** (القاعدة السابعة): يبني السلسلة صراحةً
 * ويستدعي الدالتين المصدَّرتين، بلا طبقة ترشيح بينهما.
 */
const g = (...items: string[]): Set<Grant> => new Set(items as Grant[]);

const link = (granted: Set<Grant>, revoked = false): DelegationLink => ({
  grantorId: 'a',
  granteeId: 'b',
  granted,
  revoked,
});

const ROOT: RootGrants = g('contracts:view', 'contracts:edit', 'contracts:delete', 'invoice:view');

describe('التقاطع الحيّ — لا يمنح المفوَّض ما لا يملكه هو', () => {
  it('بلا تفويض: الفاعل يملك ما لجذره', () => {
    expect([...effectiveGrants(ROOT, [])].sort()).toEqual([...ROOT].sort());
  });

  it('التفويض يضيّق ولا يوسّع — ما لم يملكه المفوِّض لا يمرّ', () => {
    // يحاول منح `invoice:edit` وهو لا يملكها، و`accounts:view` خارج نطاقه.
    const out = effectiveGrants(ROOT, [link(g('contracts:view', 'invoice:edit', 'accounts:view'))]);
    expect([...out]).toEqual(['contracts:view']);
  });

  it('سلسلة عميقة: كل مستوى يضيّق ما فوقه', () => {
    const chain = [
      link(g('contracts:view', 'contracts:edit', 'invoice:view')),
      link(g('contracts:view', 'contracts:edit')),
      link(g('contracts:view')),
    ];
    expect([...effectiveGrants(ROOT, chain)]).toEqual(['contracts:view']);
  });

  it('⭐ السحب يسري فوراً — بلا عملية إبطال تمشي على الأبناء', () => {
    const supervisor = link(g('contracts:view', 'contracts:edit'));
    const employee = link(g('contracts:view'));

    // قبل السحب: الموظف يرى العقود.
    expect(hasGrant(ROOT, [supervisor, employee], 'contracts:view' as Grant)).toBe(true);

    // تُسحب من المشرف — ولم يُمسّ صفّ الموظف إطلاقاً.
    const revokedSupervisor = { ...supervisor, revoked: true };

    // ⚠️ هنا كان يقع العطل لو نُسخت الصلاحيات: الموظف يحتفظ بنسخته.
    expect(hasGrant(ROOT, [revokedSupervisor, employee], 'contracts:view' as Grant)).toBe(false);
    expect(effectiveGrants(ROOT, [revokedSupervisor, employee]).size).toBe(0);
  });

  it('⚠️ الحلقة المسحوبة تقطع السلسلة ولا تُتخطّى', () => {
    // تخطّيها يعني أن المرؤوس يرث من الجذر مباشرةً — أي أن السحب لا يسحب.
    const chain = [link(g('contracts:view'), true), link(g('contracts:view'))];
    expect(effectiveGrants(ROOT, chain).size).toBe(0);
    expect(hasGrant(ROOT, chain, 'contracts:view' as Grant)).toBe(false);
  });

  it('الجذر سقفٌ لا يُتجاوز — حتى لو منحت كل الحلقات', () => {
    const chain = [link(g('accounts:delete')), link(g('accounts:delete'))];
    expect(effectiveGrants(ROOT, chain).size).toBe(0);
    expect(hasGrant(ROOT, chain, 'accounts:delete' as Grant)).toBe(false);
  });

  it('`hasGrant` و`effectiveGrants` لا يختلفان أبداً', () => {
    const chain = [link(g('contracts:view', 'contracts:edit')), link(g('contracts:view', 'contracts:delete'))];
    const full = effectiveGrants(ROOT, chain);
    for (const candidate of ROOT) {
      expect(hasGrant(ROOT, chain, candidate)).toBe(full.has(candidate));
    }
  });

  it('التقاطع الفارغ لا يعود يمتلئ — حلقةٌ سخيّة بعد ضيّقة لا تُعيد شيئاً', () => {
    const chain = [
      link(g('invoice:view')), // ضيّقت إلى الفواتير وحدها
      link(g('contracts:view', 'contracts:edit', 'invoice:view')), // ثم «توسّعت»
    ];
    // التقاطع لا يُنمّي: ما خرج لا يعود.
    expect([...effectiveGrants(ROOT, chain)]).toEqual(['invoice:view']);
    expect(hasGrant(ROOT, chain, 'contracts:view' as Grant)).toBe(false);
  });
});
