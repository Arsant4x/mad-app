import { sealSignatureOf } from './form-instances.service';
import { SEAL_FORMAT_SIGNED, sealHash, type SealContent } from './seal-content.util';

type Row = Parameters<typeof sealSignatureOf>[0];

/** صفُّ توقيعٍ كما يُقرأ من القاعدة — والسندُ فارغٌ لغير الممثّل. */
function row(extra: Partial<Row> = {}): Row {
  return {
    id: 's-1',
    companyId: 'co-1',
    instanceId: 'fi-1',
    role: 'COUNTERPARTY',
    level: 'DRAWN_OTP',
    channel: 'LINK',
    signerName: 'شركة المستأجر',
    signerCustomerId: 'cu-1',
    signerKind: 'LEGAL_PERSON',
    signerUserId: null,
    mobileMasked: '0555 ••• 442',
    mobileIndex: 'b1:abc',
    evidenceKey: 'k',
    evidenceSha256: 'a'.repeat(64),
    signedContentHash: 'b'.repeat(64),
    challengeId: 'ch-1',
    identityTxRef: null,
    witnessUserId: null,
    witnessUserName: null,
    authorityType: null,
    authorityRef: null,
    authorityEvidenceKey: null,
    authorityEvidenceSha256: null,
    authorityVerification: null,
    ip: null,
    userAgent: null,
    signedAt: new Date('2026-10-08T10:00:00.000Z'),
    ...extra,
  } as Row;
}

const content = (signatures: ReturnType<typeof sealSignatureOf>[]): SealContent => ({
  companyId: 'co-1',
  instanceId: 'fi-1',
  no: 'FRM-2026-0001',
  sealSeq: 1,
  prevHash: null,
  formDate: '2026-10-08',
  template: { id: 't-1', familyId: 't-1', version: 1, name: 'تسليمُ مكتب' },
  formTypeCode: 'UNIT_HANDOVER',
  linkedEntity: { type: 'contract', id: 'c-1' },
  items: [{ lineNo: 1, itemId: 'i-1', label: 'قراءةُ العدّاد', itemType: 'METER_READING', text: null, number: '1234', bool: null, note: null }],
  filledBy: { id: 'u-1', name: 'salem' },
  sealedBy: { id: 'u-1', name: 'salem' },
  sealedAt: '2026-10-08T10:00:01.000Z',
  signatures,
  revision: { no: 1, groupId: 'fi-1', previousId: null, previousContentHash: null },
});

describe('سندُ الممثّل في بصمة الختم (توجيه ٢٨٧ ⑥ · ق-١٦٧٠)', () => {
  it('① توقيعٌ بلا ممثّلٍ لا يحمل مفتاحَ السند، فبصمتُه قبل الشريحة وبعدها واحدة', () => {
    const s = sealSignatureOf(row());
    expect('authority' in s).toBe(false);
  });

  it('② توقيعُ الممثّل يحمل نوعَ سنده ورقمَه وبصمةَ صورته وحكمَ التحقّق، وأيُّ تغييرٍ فيها يغيّر البصمة', () => {
    const rep = row({ role: 'REPRESENTATIVE', authorityType: 'CR_MANAGER', authorityRef: '1010101010', authorityEvidenceSha256: 'c'.repeat(64), authorityVerification: 'VERIFIED' });
    const s = sealSignatureOf(rep);
    expect(s.authority).toEqual({ type: 'CR_MANAGER', ref: '1010101010', evidenceSha256: 'c'.repeat(64), verification: 'VERIFIED' });
    const h = sealHash(content([s]), SEAL_FORMAT_SIGNED);
    for (const changed of [{ authorityRef: '1010101011' }, { authorityType: 'NAJIZ_POA' }, { authorityVerification: 'UNVERIFIED' }, { authorityEvidenceSha256: 'd'.repeat(64) }]) {
      expect(sealHash(content([sealSignatureOf(row({ ...rep, ...changed }))]), SEAL_FORMAT_SIGNED)).not.toBe(h);
    }
  });
});
