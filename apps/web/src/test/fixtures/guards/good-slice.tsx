// الحالةُ السليمة — يجب أن تمرّ من الحرّاس الخمسة كلِّها (مصادقةُ المسبار: حالةٌ يجب ألّا يجدها).
import { useAuth } from '../../../auth/AuthContext';
import { MoneyCell } from '../../../components/MoneyCell';
import { useContractsPage } from '../../../hooks/contracts';

export function GoodSlice({ page }: { page: number }) {
  const { user } = useAuth();
  const r = useContractsPage({ page });
  // مقارنةٌ للعرض لا للحكم: فرعاها نصّان — مسموحة بموضعها.
  const who = user?.actorType === 'COMPANY' ? 'المنشأة' : 'مستخدم';
  if (r.status !== 'ready') return <div>{who}</div>;
  return (
    <div>
      {r.data.items.map((c) => (
        <MoneyCell key={c.id} value={c.value} />
      ))}
      <span>{r.data.total}</span>
    </div>
  );
}
