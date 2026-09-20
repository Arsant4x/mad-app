// كسرٌ مقصود للقاعدة ② — الصفحةُ تستدعي api/ بنفسها وتبتلع الخطأ.
import { useEffect, useState } from 'react';
import { listContracts, type ContractListItem } from '../../../api/contracts';

export function BadDirectApi() {
  const [rows, setRows] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listContracts()
      .then((r) => setRows(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return null;
  return <div>{rows.length === 0 ? 'لا عقود' : rows.length}</div>;
}
