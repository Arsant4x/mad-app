import { apiClient } from './client';
import type { ExtinguishedGrant } from '../auth/PermissionsContext';

/**
 * عميل التفويض — **ينقل ولا يحسب**.
 *
 * كل حقلٍ هنا نتيجةٌ حسمها الخادم: `grantable` مرشَّحةٌ بما يملكه المفوِّض،
 * و`active` ما نفذ، و`extinguished` ما انطفأ **بسببه**. ولا دالة في هذا
 * الملف تشتقّ حالةً من أخرى.
 */

export interface DelegationRow {
  id: string;
  seq: number;
  grantorId: string;
  granteeId: string;
  nodeKey: string;
  grants: string[];
  state: 'ACTIVE' | 'SEALED' | 'REVOKED';
  createdAt: string;
  revokedAt: string | null;
}

export interface DelegationView {
  granteeId: string;
  grantable: string[];
  links: DelegationRow[];
  active: string[];
  extinguished: ExtinguishedGrant[];
}

export interface LogNode {
  granteeId: string;
  entries: {
    seq: number;
    event: 'GRANT' | 'REVOKE';
    grantorId: string;
    granteeId: string;
    nodeKey: string;
    grants: string[];
    at: string;
  }[];
  children: LogNode[];
}

export interface DelegationLog {
  roots: LogNode[];
  rows: DelegationRow[];
  /** فجوةٌ في التسلسل = صفٌّ غاب. تُعرض ولا تُبتلع. */
  sequenceBreak: { at: number; expected: number } | null;
}

export const getDelegationView = (granteeId: string) =>
  apiClient.get<DelegationView>(`/delegations/${granteeId}`).then((r) => r.data);

export const getDelegationLog = () => apiClient.get<DelegationLog>('/delegations/log').then((r) => r.data);

export const createDelegation = (granteeId: string, nodeKey: string, grants: string[]) =>
  apiClient.post<DelegationRow>('/delegations', { granteeId, nodeKey, grants }).then((r) => r.data);

export const revokeDelegation = (id: string) =>
  apiClient.patch<DelegationRow>(`/delegations/${id}/revoke`).then((r) => r.data);
