import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ALLOWED_SCREENS, SCREEN_ACTIONS } from '../templates/screens';
import { RAW_DOMAINS, buildTree } from './permission-tree';
import { CreateDelegationDto } from './dto/create-delegation.dto';

const dto = (over: Partial<CreateDelegationDto> = {}) =>
  plainToInstance(CreateDelegationDto, { granteeId: 'u1', nodeKey: 'contracts', grants: ['contracts:view'], ...over });
const errorsOn = (d: CreateDelegationDto) => validateSync(d).map((e) => e.property);

describe('مفردات التفويض مشتقّة من مصدرها — لا مكتوبة يدوياً', () => {
  it('⭐ كل عقدة تنتجها `buildTree` مقبولة في الـDTO', () => {
    // الاتجاه الذي يُنسى: قائمةٌ منسوخة تُرشِّح صامتاً، فعقدةٌ حقيقية
    // يعرضها الشريط تُرفض بـ400 برسالةٍ لا تدلّ على السبب. والفحص يمشي
    // على **مخرَج الشجرة** لا على القائمة نفسها.
    const nodes = ['root', ...buildTree().flatMap((d) => [d.key, ...d.children.map((c) => c.key)])];
    const rejected = nodes.filter((n) => errorsOn(dto({ nodeKey: n })).includes('nodeKey'));
    expect(rejected).toEqual([]);
  });

  it('⭐ كل نطاق في `RAW_DOMAINS` مقبول — ولو لم تنتجه الشجرة بعد', () => {
    const rejected = RAW_DOMAINS.map((d) => d.key).filter((k) => errorsOn(dto({ nodeKey: k })).includes('nodeKey'));
    expect(rejected).toEqual([]);
  });

  it('عقدة مخترَعة تُرفض', () => {
    expect(errorsOn(dto({ nodeKey: 'invoices' }))).toContain('nodeKey');
    expect(errorsOn(dto({ nodeKey: 'audit-log' }))).toContain('nodeKey');
  });

  it('⭐ الـ168 زوجاً كلها مقبولة، وما خرج عنها مرفوض', () => {
    const all = ALLOWED_SCREENS.flatMap((s) => SCREEN_ACTIONS.map((a) => `${s}:${a}`));
    expect(all).toHaveLength(168);
    expect(all.filter((g) => errorsOn(dto({ grants: [g] })).includes('grants'))).toEqual([]);
    for (const bad of ['contracts:approve', 'invoices:view', 'contracts', 'contracts:view:extra', '*:*']) {
      expect({ bad, rejected: errorsOn(dto({ grants: [bad] })).includes('grants') }).toEqual({ bad, rejected: true });
    }
  });

  it('منحةٌ فارغة تُرفض — «اختر واحدة» أوضح من نجاحٍ بلا أثر', () => {
    expect(errorsOn(dto({ grants: [] }))).toContain('grants');
  });

  it('⭐ لا قائمة أسماءٍ منسوخة في الـDTO', () => {
    // القاعدة السادسة حرفياً: لا تُكتب قائمة أسماء إلا مقروءةً من مصدرها.
    // وقد خُرقت في أول صياغة لهذا الملف بعينه — كُتبت أسماء النطاقات
    // التسعة يدوياً.
    const src = readFileSync(join(__dirname, 'dto', 'create-delegation.dto.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    for (const name of RAW_DOMAINS.map((d) => d.key)) {
      expect({ name, hardcoded: new RegExp(`['"\`]${name}['"\`]`).test(code) }).toEqual({ name, hardcoded: false });
    }
    for (const s of ALLOWED_SCREENS) {
      expect({ screen: s, hardcoded: new RegExp(`['"\`]${s}['"\`]`).test(code) }).toEqual({ screen: s, hardcoded: false });
    }
  });
});

describe('السقف يُفحص في الخادم — لا في الواجهة', () => {
  const service = readFileSync(join(__dirname, 'delegations.service.ts'), 'utf8');
  const code = service.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('⭐ `grant` يرفض ما يتجاوز ما يملكه المفوِّض', () => {
    // «إخفاء الزر ليس منعاً»: الواجهة ترشّح الشجرة، وطلبٌ مصنوع بيد
    // يتجاوز الترشيح في ثانية. فبلا هذا الفحص يمنح موظفٌ نفسه — عبر
    // وسيط — ما لا يملكه أحد فوقه.
    const grantBody = code.slice(code.indexOf('async grant('), code.indexOf('async revoke('));
    expect(grantBody).toContain('effectiveFor');
    expect(grantBody).toContain('delegation_exceeds_grantor');
    expect(grantBody).toContain('assertNoCycle');
  });

  it('⭐ الموظف يُتحقَّق من انتمائه لهذه المنشأة', () => {
    // معرّفٌ يُرسَل بيد لموظف منشأةٍ أخرى: RLS يمنع قراءة صفوفه، لكن
    // الإدراج يقع في **منشأتنا** بمعرّفٍ غريب — صفٌّ يتيمٌ في سجلٍّ
    // لا يُحذف منه أبداً.
    const grantBody = code.slice(code.indexOf('async grant('), code.indexOf('async revoke('));
    expect(grantBody).toMatch(/companyUser\.findFirst[\s\S]*?companyId: tenant\.companyId/);
    expect(grantBody).toContain('delegation_grantee_not_found');
  });

  it('⭐ السحب ختمٌ على مرحلتين — لا حذف ولا قفزَ وسط', () => {
    const revokeBody = code.slice(code.indexOf('async revoke('));
    expect(revokeBody).toContain(`'SEALED'`);
    expect(revokeBody).toContain(`'REVOKED'`);
    expect(/DELETE\s+FROM\s+"delegation_logs"/i.test(code)).toBe(false);
    expect(/deleteMany|\.delete\(/.test(code)).toBe(false);
  });

  it('⭐ كل قراءة للصفوف تمرّ بسياق المستأجر', () => {
    // RLS يُرجع **فارغاً بنجاح** خارج السياق: «لا تفويض» و«لم أرَ شيئاً»
    // يبدوان سواء. فأي `$queryRaw` على الجدول خارج `runInTenantContext`
    // ثغرةٌ صامتة.
    const outside = code
      .split('runInTenantContext')
      .slice(0, 1)
      .join('');
    expect(/delegation_logs/.test(outside)).toBe(false);
    expect(/this\.prisma\.\$queryRaw/.test(code)).toBe(false);
  });

  it('⭐ السجل غابةٌ لا شجرة — لا تفويض يختفي', () => {
    // `buildLogTree` يمشي **نزولاً** من جذر. فبناءٌ من جذرٍ واحد يُخفي كل
    // تفويضٍ بين موظفَين لم يمرّ بالفاعل — وهو أكثر ما يحتاج المالك رؤيته.
    // والإخفاء صامت: السجل يبدو كاملاً وهو ناقص.
    const body = code.slice(code.indexOf('async logTree('), code.indexOf('// ═══════════════════ الكتابة'));
    expect(body).toContain('rootIds');
    expect(body).toContain('roots:');
    // ولا بناءٌ من `profileId` وحده.
    expect(/buildLogTree\(entries,\s*tenant\.profileId\)/.test(body)).toBe(false);
  });

  it('⭐ تعارض التسلسل يُترجَم ولا يُبتلع', () => {
    // الفهرس الفريد يرفض إحدى منحتين متزامنتين — وهو التصرّف الصحيح.
    // لكن رفضاً غير مترجَم يخرج 500 بلا رسالة، فيبدو «عطلاً في المنصة».
    expect(code).toContain('delegation_sequence_conflict');
    expect(code).toContain('23505');
  });
});
