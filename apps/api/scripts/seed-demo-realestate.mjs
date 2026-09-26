/**
 * بذرة منشأة العرض العقارية — تُشغَّل مرتين بلا تكرار، **وتشترط بذرةً قبلها**.
 *
 * تُنشئ **منشأة واحدة كاملة بمنطق واقعي**، لا أرقاماً عشوائية تملأ الشاشات:
 * عقاران بوحدات · مستأجرون · عقود سارية وأخرى منتهية · أقساط مسدَّدة ومتأخرة
 * · بلاغ صيانة مغلق وآخر مفتوح · فواتير ومقبوضات جزئية · مصروفات.
 *
 * **لماذا عبر الـAPI لا عبر Prisma مباشرة؟** لأن الغرض عرضُ النظام كما يراه
 * المستخدم. الكتابة المباشرة في القاعدة تتجاوز الترحيل المحاسبي وتوليد
 * الأقساط وحساب حالة الوحدة — فتُنتج بياناتٍ تبدو صحيحة في الجداول وتناقض
 * نفسها في التقارير. كل صفٍّ هنا يمرّ بنفس المسار الذي يمرّ به عميل حقيقي.
 *
 * ⚠️ **شرطٌ سابق: `prisma/seed.ts` لا بدّ أن تكون شُغِّلت على هذه القاعدة.**
 * كان مكتوباً هنا أن السكربت «مستقلّ» — وليس كذلك. فـ`‎/auth/register` يقرأ
 * قالب صلاحيات `isAllScreens` لا تُنشئه إلا البذرة الأساسية، وبدونه يردّ
 * **409 «التسجيل غير متاح مؤقتاً»**. والرسالة لا تذكر القالب، فتبدو عطلاً في
 * الخادم لا شرطاً ناقصاً. (قِيس بالتشغيل على قاعدة مُرحَّلة بلا بذرة أساسية.)
 *
 * التشغيل:
 *   node apps/api/scripts/seed-demo-realestate.mjs https://test-api.example.com
 *
 * ## إعادة التشغيل — ما تضمنه وما لا تضمنه
 *
 * ✅ **بلا تكرار**: قِيس بتشغيلتين متتاليتين على قاعدة نظيفة — ٤٨٢ صفاً ثم
 * ٤٨٣. والصفّ الزائد `refresh_tokens` من مسبار الدخول أدناه نفسه، لا من
 * بيانات مكرَّرة. فصفر تكرارٍ في بيانات العمل.
 *
 * ⚠️ **لكن المسبار يقيس الوجود لا الاكتمال.** هو محاولة دخولٍ ناجحة — تصدق
 * على منشأةٍ اكتملت وعلى منشأةٍ انقطع بناؤها بعد `‎/auth/register` مباشرةً
 * سواءً. فانقطاعٌ في المنتصف يترك منشأةً نصفَ مبنية، **وإعادة التشغيل تراها
 * موجودة فتتوقف** — ولا تُكملها. راجع رسالة الفشل أدناه: تطلب الحذف اليدوي
 * لهذا السبب بالذات.
 *
 * لبذرة نظيفة، احذف المنشأة أولاً (من لوحة المدير، أو بحذف صف
 * login_identities المقابل).
 */

const API = (process.argv[2] || '').replace(/\/$/, '');
if (!API) {
  console.error('الاستعمال: node seed-demo-realestate.mjs <API_BASE_URL>');
  process.exit(1);
}

/**
 * هوية المنشأة — **وسائط بقيمٍ افتراضية، لا ثوابت مثبَّتة**.
 *
 * كانت الثلاثة مكتوبةً في الشيفرة، فكان السكربت يبني **منشأةً واحدة بعينها**
 * ولا شيء غيرها. وأول حاجةٍ إلى منشأةِ اختبارٍ ثانية اصطدمت بذلك: الخيار
 * الوحيد كان تعديل الثوابت — أي المساس ببذرة العرض القائمة.
 *
 * فصارت تُقرأ من البيئة، **والافتراضي هو السلوك القديم حرفياً** — فمن يشغّله
 * بلا متغيّرات يحصل على ما كان يحصل عليه.
 *
 *     SEED_USER=aa SEED_PASS='…' SEED_ORG='…' SEED_SECTOR=REALESTATE \
 *       node seed-demo-realestate.mjs http://127.0.0.1:3000
 */
const DEMO_USER = process.env.SEED_USER || 'rikz-demo-realestate';
const DEMO_PASS = process.env.SEED_PASS || 'RikzDemo2026!';
const ORG = process.env.SEED_ORG || 'شركة رِكز للاستثمار العقاري (عرض)';

/**
 * القطاع (النشاط الرئيس) — **فارغٌ افتراضاً**، وضبطه يُشغّل ترشيح الشاشات.
 *
 * ⚠️ وبذرة العرض القائمة تتركه فارغاً **عمداً**: ضبط `activityType` على الوحدة
 * يقيّد كل عقدٍ عليها بنوع نشاطها. لكنّ **النشاط الرئيس للمنشأة** شيءٌ آخر —
 * يقرّر أي الشاشات تظهر، ولا يمسّ العقود. فتُفصَل الحالتان.
 */
const SEED_SECTOR = process.env.SEED_SECTOR || '';

/**
 * اليوم كمرجع لكل التواريخ — فالبيانات تبقى منطقية مهما تأخر تشغيل السكربت.
 *
 * ⚠️ التنسيق **محلي لا `toISOString()`**: الأخيرة تحوّل إلى UTC، فعلى توقيت
 * الرياض (+3) يصير أولُ الشهر آخرَ اليوم السابق — وتخرج عقود عرضٍ تبدأ يوم
 * 31 و30. لا يكسر شيئاً، لكنه يجعل بيانات العرض تبدو مرتجلة، وهي معروضة على
 * عميل.
 */
const TODAY = new Date();
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (offsetDays) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offsetDays);
  return fmt(d);
};
const monthsFromToday = (m, dayOfMonth = 1) => fmt(new Date(TODAY.getFullYear(), TODAY.getMonth() + m, dayOfMonth));

let token = '';
const log = (msg) => console.log(msg);

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    // الرسالة كاملة: بذرة تفشل صامتةً تترك منشأةً نصفَ مبنيّة، وهي أسوأ من
    // فشلٍ صريح لأن أحداً لن يلاحظ حتى يُعرض النظام على عميل.
    throw new Error(`${method} ${path} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  // ── إعادة التشغيل: هل المنشأة موجودة سلفاً؟ ─────────────────────────────
  const probe = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DEMO_USER, password: DEMO_PASS }),
  });
  if (probe.ok) {
    log('— منشأة العرض موجودة مسبقاً. لم يُنشأ شيء (السكربت عديم الأثر عند التكرار).');
    log(`  للدخول: ${DEMO_USER} / ${DEMO_PASS}`);
    log('  لبذرة نظيفة: احذف المنشأة أولاً ثم أعد التشغيل.');
    return;
  }

  log('▶ إنشاء المنشأة…');
  const reg = await api('POST', '/auth/register', { orgName: ORG, username: DEMO_USER, password: DEMO_PASS });
  token = reg.accessToken;
  log(`  ✔ ${ORG}`);

  // ── صندوق نقدي: كل تحصيل يحتاج وجهةً حقيقية، وإلا لم يظهر في الخزينة ───
  const box = await api('POST', '/banks', { name: 'صندوق الإدارة', kind: 'CASH_BOX', openingBalance: 0, openingDate: day(-400) });
  log('  ✔ صندوق الإدارة');

  // ── العقاران ────────────────────────────────────────────────────────────
  // ownership='owned' وبلا activityType عمداً: ضبط activityType يقيّد كل عقد
  // على الوحدة بنوع نشاطها (contracts.service.ts) — قيدٌ صحيح في الإنتاج،
  // ومصدر فشلٍ لا داعي له في بذرة عرض.
  const burj = await api('POST', '/properties', {
    name: 'برج رِكز التجاري',
    ownership: 'owned',
    address: 'طريق الملك فهد، الرياض',
    floors: 4,
    deedNo: '3101/ب/2019',
  });
  const yasmin = await api('POST', '/properties', {
    name: 'مجمع الياسمين السكني',
    ownership: 'owned',
    address: 'حي الياسمين، الرياض',
    floors: 3,
    deedNo: '7742/أ/2021',
  });
  log('  ✔ عقاران: برج رِكز التجاري · مجمع الياسمين السكني');

  // ── الوحدات ─────────────────────────────────────────────────────────────
  const mk = (propertyId, unitNo, type, rentMonthly, floor, extra = {}) =>
    api('POST', '/units', { propertyId, unitNo, type, rentMonthly, floor, ...extra });

  const u = {};
  u.shop1 = await mk(burj.id, 'M-01', 'محل', 8000, 'الأرضي', { roomDetails: 'واجهة زجاجية، مستودع خلفي' });
  u.shop2 = await mk(burj.id, 'M-02', 'محل', 7500, 'الأرضي');
  u.off1 = await mk(burj.id, 'O-11', 'مكتب', 6000, 'الأول', { roomDetails: '٣ غرف + استقبال' });
  u.off2 = await mk(burj.id, 'O-12', 'مكتب', 5500, 'الأول');
  u.off3 = await mk(burj.id, 'O-21', 'مكتب', 5500, 'الثاني');
  u.apt1 = await mk(yasmin.id, 'A-101', 'سكني', 3500, 'الأول', { roomDetails: 'غرفتان + صالة + مطبخ' });
  u.apt2 = await mk(yasmin.id, 'A-102', 'سكني', 3500, 'الأول');
  u.apt3 = await mk(yasmin.id, 'A-201', 'سكني', 4000, 'الثاني', { roomDetails: '٣ غرف + صالة' });
  u.apt4 = await mk(yasmin.id, 'A-202', 'سكني', 4000, 'الثاني');
  // وحدة تحت الصيانة: الحالة الوحيدة التي تُضبط مباشرة — البقية محسوبة.
  u.apt5 = await mk(yasmin.id, 'A-301', 'سكني', 4200, 'الثالث', { underMaintenance: true });
  log('  ✔ ١٠ وحدات (٥ تجارية · ٥ سكنية، إحداها تحت الصيانة)');

  // ── العقود ──────────────────────────────────────────────────────────────
  // منطق زمني مقصود: المنتهي يسبق الساري، والأقساط تتولّد من تاريخ البداية
  // فتُنتج ماضياً حقيقياً (مسدَّد ومتأخر) لا أرقاماً مصطنعة.
  // التصنيفُ يُعلَن لكل عقد (ق-٨٩١): تجاريٌّ للمحال والمكاتب، سكنيٌّ للشقق — والقيمةُ غيرُ شاملةٍ للضريبة.
  // المستأجرُ عميلٌ يُنشأ صراحةً ثم يُربط بمعرّفه (ق-١٠٢٨/①) — لا اسمٌ يبحث عنه العقد.
  const contract = async (unitId, tenant, phone, value, cycle, start, end, classification, extra = {}) => {
    const customer = await api('POST', '/customers', { name: tenant, phone, allowSameName: true });
    return api('POST', '/contracts', { unitId, customerId: customer.id, value, cycle, start, end, classification, vatInclusion: 'EXCLUSIVE', ...extra });
  };

  // (١) عقد منتهٍ — انتهى قبل شهرين
  const expired = await contract(u.off2.id, 'مؤسسة الأفق للتجارة', '0551000111', 66000, 'monthly', monthsFromToday(-14), monthsFromToday(-2, 28), 'COMMERCIAL');
  // (٢) عقد سارٍ شهري بدأ قبل ٦ أشهر — أقساطه الماضية مادّة السداد والتأخر
  const activeMonthly = await contract(u.shop1.id, 'شركة النخبة للأغذية', '0552000222', 96000, 'monthly', monthsFromToday(-6), monthsFromToday(6, 28), 'COMMERCIAL', { deposit: 8000 });
  // (٣) عقد سارٍ ربع سنوي
  const activeQuarterly = await contract(u.off1.id, 'مكتب البيان للاستشارات', '0553000333', 72000, 'quarterly', monthsFromToday(-4), monthsFromToday(8, 28), 'COMMERCIAL');
  // (٤) عقدان سكنيان
  const apt1c = await contract(u.apt1.id, 'عبدالله محمد الحربي', '0554000444', 42000, 'monthly', monthsFromToday(-5), monthsFromToday(7, 28), 'RESIDENTIAL');
  const apt3c = await contract(u.apt3.id, 'سارة عبدالعزيز القحطاني', '0555000555', 48000, 'monthly', monthsFromToday(-3), monthsFromToday(9, 28), 'RESIDENTIAL');
  log('  ✔ ٥ عقود (١ منتهٍ · ٤ سارية) — والأقساط تولّدت تلقائياً');

  // ── الأقساط: سدّد الماضي جزئياً واترك الباقي متأخراً ────────────────────
  const todayStr = day(0);
  let paidCount = 0;
  let leftLate = 0;

  /** يسدّد أول `n` قسطاً مستحقاً (تاريخه ماضٍ) ويترك البقية بلا سداد. */
  async function payFirst(c, n) {
    const due = (c.installments || []).filter((i) => i.dueDate.slice(0, 10) <= todayStr);
    for (let idx = 0; idx < due.length; idx++) {
      if (idx < n) {
        await api('POST', `/contracts/${c.id}/payments`, {
          date: due[idx].dueDate.slice(0, 10),
          amount: Number(due[idx].amount),
          method: 'CASH',
          bankId: box.id,
          installmentId: due[idx].id,
        });
        paidCount++;
      } else {
        leftLate++;
      }
    }
  }

  await payFirst(expired, 99); // المنتهي مسدَّد بالكامل — عقدٌ أُغلق نظيفاً
  await payFirst(activeMonthly, 4); // سدّد ٤ وترك الباقي متأخراً
  await payFirst(activeQuarterly, 1);
  await payFirst(apt1c, 3);
  await payFirst(apt3c, 1); // الأحدث: متأخر أكثر — لتتنوّع شرائح الأعمار
  log(`  ✔ ${paidCount} قسطاً مسدَّداً · ${leftLate} قسطاً بلا سداد (يصير متأخراً عند القراءة)`);

  // ── الصيانة: واحد مغلق بتكلفة، وواحد مفتوح ──────────────────────────────
  const mClosed = await api('POST', '/maintenance', {
    propertyId: burj.id,
    unitId: u.shop1.id,
    title: 'تسريب في تكييف المحل',
    description: 'تسريب مياه من وحدة التكييف المركزي أعلى الواجهة',
    priority: 'HIGH',
    reportedAt: day(-25),
    reportedBy: 'شركة النخبة للأغذية',
  });
  await api('POST', `/maintenance/${mClosed.id}/assign`, { assignedTo: 'مؤسسة الفهد للتكييف' });
  await api('POST', `/maintenance/${mClosed.id}/start`, { startedAt: day(-23) });
  await api('POST', `/maintenance/${mClosed.id}/complete`, { completedAt: day(-20), cost: 1850, notes: 'استُبدل خط التصريف ونُظّفت الوحدة' });
  await api('POST', `/maintenance/${mClosed.id}/close`, { closedAt: day(-19) });

  const mOpen = await api('POST', '/maintenance', {
    propertyId: yasmin.id,
    unitId: u.apt5.id,
    title: 'إعادة تأهيل الشقة قبل التأجير',
    description: 'دهان كامل وإصلاح دورة المياه',
    priority: 'NORMAL',
    reportedAt: day(-6),
    reportedBy: 'إدارة المجمع',
  });
  await api('POST', `/maintenance/${mOpen.id}/assign`, { assignedTo: 'ورشة البناء الحديث' });
  await api('POST', `/maintenance/${mOpen.id}/start`, { startedAt: day(-4) });
  log('  ✔ بلاغا صيانة: مغلق بتكلفة ١٨٥٠ · ومفتوح قيد التنفيذ');

  // ── فواتير ومقبوضات جزئية ───────────────────────────────────────────────
  // خدمات تُفوتر خارج عقد الإيجار (نظافة/تشغيل) — وهي ما يُنتج ذمماً بأعمار.
  // العملاءُ أُنشئوا صراحةً أعلاه قبل عقودهم (ق-١٠٢٨/①) — فتُجلب القائمةُ ويُطابَق بالاسم هنا
  // لأن أسماءَ البذرة فريدةٌ بالبناء؛ وهذا ما يجعل السكربت يعكس الواقع: المستأجر والعميل كيانٌ واحد.
  const existingCustomers = await api('GET', '/customers');
  const byName = (name) => {
    const hit = existingCustomers.find((c) => c.name === name);
    if (!hit) throw new Error(`لم يُعثر على العميل "${name}" — كان يُفترض أن يُنشئه العقد.`);
    return hit;
  };
  const cust1 = byName('شركة النخبة للأغذية');
  const cust2 = byName('مكتب البيان للاستشارات');

  const inv = async (customerId, issueOffset, dueOffset, desc, price) =>
    api('POST', '/invoices', {
      customerId,
      issueDate: day(issueOffset),
      dueDate: day(dueOffset),
      lines: [{ description: desc, quantity: 1, unitPrice: price, taxRate: 15 }],
    });

  const i1 = await inv(cust1.id, -75, -45, 'خدمات نظافة وتشغيل — الربع الأول', 12000); // متأخرة كثيراً
  const i2 = await inv(cust1.id, -40, -10, 'رسوم مواقف إضافية', 4000); // متأخرة
  const i3 = await inv(cust2.id, -20, 10, 'خدمات أمن وحراسة', 6000); // جارية
  const i4 = await inv(cust2.id, -5, 25, 'صيانة دورية للمكاتب', 3000); // جارية

  // مقبوض جزئي على الفاتورة الأقدم: يترك متبقياً حقيقياً يظهر في أعمار الذمم
  await api('POST', '/payments', {
    customerId: cust1.id,
    date: day(-30),
    amount: 5000,
    method: 'BANK',
    bankId: box.id,
    allocations: [{ invoiceId: i1.id, amount: 5000 }],
  });
  // وسداد كامل لفاتورة أخرى — كي لا تكون كل الذمم متأخرة
  await api('POST', '/payments', {
    customerId: cust2.id,
    date: day(-2),
    amount: Number(i4.total),
    method: 'CASH',
    bankId: box.id,
    allocations: [{ invoiceId: i4.id, amount: Number(i4.total) }],
  });
  log('  ✔ ٤ فواتير · مقبوض جزئي ٥٠٠٠ على الأقدم · وسداد كامل لأخرى');

  // ── المصروفات ───────────────────────────────────────────────────────────
  const supMaint = await api('POST', '/suppliers', { name: 'مؤسسة الفهد للتكييف', phone: '0556000666', category: 'صيانة' });
  const supAdmin = await api('POST', '/suppliers', { name: 'مكتب الرواد للمحاسبة', phone: '0557000777', category: 'خدمات مهنية' });
  const supStaff = await api('POST', '/suppliers', { name: 'كشوف رواتب الحراسة', phone: '0558000888', category: 'رواتب' });

  await api('POST', '/purchases', { supplierId: supMaint.id, date: day(-20), subtotal: 1850, category: 'مصروفات أخرى' });
  await api('POST', '/purchases', { supplierId: supAdmin.id, date: day(-35), subtotal: 3500 });
  await api('POST', '/purchases', { supplierId: supStaff.id, date: day(-30), subtotal: 9000, category: 'رواتب' });
  await api('POST', '/purchases', { supplierId: supStaff.id, date: day(-60), subtotal: 9000, category: 'رواتب' });
  log('  ✔ ٤ مصروفات (صيانة · خدمات مهنية · راتبان)');

  // ── القطاع: يُشغّل ترشيح الشاشات ────────────────────────────────────────
  //
  // ⚠️ **نشاطُ المنشأة الرئيس غير `activityType` على الوحدة.** الثاني يقيّد كل
  // عقدٍ على الوحدة بنوعها (ولذلك تتركه بذرة العرض فارغاً)، والأول يقرّر **أي
  // الشاشات تظهر** ولا يمسّ العقود. فيُضبط هنا بلا أثرٍ على ما سبق.
  //
  // و`confirmed: true` لازم: المسار يعرض أولاً ثم يطبّق بتأكيد — نقطتان
  // منفصلتان عمداً «لئلا يغيّر العرضُ الحالة».
  if (SEED_SECTOR) {
    const activity = await api('POST', '/activities', { name: 'النشاط الرئيس', sector: SEED_SECTOR });
    await api('PATCH', '/activities/primary', { activityId: activity.id, confirmed: true });
    log(`  ✔ القطاع: ${SEED_SECTOR} — الترشيح يعمل`);
  }

  // ── موظّف ومهامّ مسنَدة ──────────────────────────────────────────────────
  //
  // المهمة **تتطلّب `assigneeId` لمستخدم منشأة قائم** (`tasks.service.ts`)،
  // فلا «مهمة مسنَدة» بلا موظّف. ولذلك يُنشأ هنا لا في شاشةٍ منفصلة.
  //
  // ⚠️ و`POST /company-users` عليه حدُّ **٥ طلبات/دقيقة** (تخفيف تسريب أسماء
  // المستخدمين) — فموظّفٌ واحد كافٍ، وإنشاء أكثر يصطدم بالحدّ.
  const templates = await api('GET', '/templates');
  const template = templates.find((t) => t.isAllScreens && !t.isSystem) || templates.find((t) => !t.isSystem);
  const employee = await api('POST', '/company-users', {
    name: 'سارة العتيبي',
    username: `${DEMO_USER}-emp`,
    password: `${DEMO_PASS}emp`,
    permissionTemplateId: template.id,
  });
  log(`  ✔ موظّف: سارة العتيبي (${DEMO_USER}-emp)`);

  // `POST /company-users` يُعيد **صفّ `companyUser` مباشرةً** (`return
  // identity.companyUser!`) لا الهوية الملتفّة حوله — مقروءٌ من الخدمة لا
  // مفترَضاً. وأول صياغةٍ هنا كتبت `employee.companyUser?.id ?? employee.id`
  // احتياطاً لشكلٍ لم يُقرأ، والاحتياط يُخفي الخطأ بدل أن يكشفه.
  const empId = employee.id;
  await api('POST', '/tasks', {
    title: 'متابعة تحصيل قسط متأخر — الوحدة C-201',
    assigneeId: empId,
    note: 'المستأجر وعد بالسداد نهاية الأسبوع.',
  });
  await api('POST', '/tasks', {
    title: 'جدولة صيانة المصعد قبل تجديد العقد',
    assigneeId: empId,
    note: 'بلاغ الصيانة المفتوح مرتبط بهذه الوحدة.',
  });
  log('  ✔ مهمّتان مسنَدتان إلى الموظّف');

  log('');
  log('════════════════════════════════════════════');
  log('  اكتملت بذرة منشأة العرض');
  log('════════════════════════════════════════════');
  log(`  المستخدم: ${DEMO_USER}`);
  log(`  كلمة المرور: ${DEMO_PASS}`);
  log(`  الموظّف:   ${DEMO_USER}-emp / ${DEMO_PASS}emp`);
  if (SEED_SECTOR) log(`  القطاع:    ${SEED_SECTOR}`);
  log('════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('\n✘ فشلت البذرة:', e.message);
  console.error('  المنشأة قد تكون نصفَ مبنيّة — احذفها قبل إعادة التشغيل.');
  process.exit(1);
});
