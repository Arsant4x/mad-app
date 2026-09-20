// كسرٌ مقصود للقاعدة ④ — القائمةُ كلُّها في الذاكرة ثم تُقسَّم في الشاشة.
import { useState } from 'react';
import type { ContractRow } from '../../../hooks/contracts';

const PAGE_SIZE = 25;

export function BadClientPaging({ all }: { all: ContractRow[] }) {
  const [page, setPage] = useState(1);
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div>
      {rows.length}
      <button type="button" onClick={() => setPage(page + 1)}>
        التالي
      </button>
    </div>
  );
}
