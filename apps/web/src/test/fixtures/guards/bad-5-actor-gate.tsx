// كسرٌ مقصود للقاعدة ⑤ — الشاشةُ تحكم بالفاعل لا بمنحةٍ من الخادم.
import { useAuth } from '../../../auth/AuthContext';

export function BadActorGate() {
  const { user } = useAuth();
  const canManage = user?.actorType === 'COMPANY';
  return (
    <div>
      {canManage ? <button type="button">حذف</button> : null}
      {user?.actorType === 'COMPANY' && <button type="button">تعديل</button>}
    </div>
  );
}
