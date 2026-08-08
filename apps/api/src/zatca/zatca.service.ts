import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { decryptSecret, secretIsSet } from '../common/crypto/secret.util';
import { MSG } from '../common/i18n/messages';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { invoiceTypeFor, latestChainHash, nextIcv } from './hash-chain.util';
import { buildUnsignedInvoiceXml } from './ubl/invoice-xml.util';
import { signInvoice } from './ubl/xades.util';
import { API_BASE, apiBaseFor } from './zatca-onboarding.service';

/** Only the company owner submits to the authority — clearing an invoice is a
 * legal act on the merchant's behalf, not routine data entry. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.company_profile_owner_only);
  }
}

@Injectable()
export class ZatcaService {
  private readonly logger = new Logger(ZatcaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /**
   * Assembles everything the authority needs for one invoice, records the chain
   * link, then submits it using **this merchant's own certificate**, which the
   * platform holds on their behalf (CLAUDE.md §1 — the merchant is the end user
   * and never operates infrastructure).
   */
  async submitInvoice(companyId: string, actorType: string, invoiceId: string) {
    assertIsCompanyOwner(actorType);

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        legalName: true,
        vatNumber: true,
        crNumber: true,
        address: true,
        street: true,
        buildingNumber: true,
        district: true,
        city: true,
        postalCode: true,
      },
    });

    if (!company.legalName?.trim() || !company.vatNumber?.trim()) {
      throw new BadRequestException(MSG.zatca_profile_incomplete);
    }

    // `zatca_credentials` is FORCE-RLS (it holds signing keys), so this has to
    // go through the tenant context — the raw client sees an empty table.
    const credential = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.findUnique({ where: { companyId } }));
    if (!credential || !secretIsSet(credential.productionCsidEnc)) {
      throw new BadRequestException(MSG.zatca_not_onboarded);
    }

    const unsigned = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { customer: true, lines: true, relatedInvoice: { select: { no: true } } },
      });
      if (!invoice) throw new NotFoundException(MSG.invoice_not_found);
      if (invoice.zatcaStatus === 'CLEARED') throw new BadRequestException(MSG.zatca_already_cleared);

      // The chain link is assigned once and kept: re-submitting a rejected
      // invoice must reuse its UUID, position and counter, not mint new ones,
      // or the chain would gain a gap.
      const uuid = invoice.zatcaUuid ?? randomUUID();
      const previousHash = invoice.zatcaPreviousHash ?? (await latestChainHash(tx));
      const icv = invoice.zatcaIcv ?? (await nextIcv(tx));
      const invoiceType = invoiceTypeFor(invoice.customer.vatNumber);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { zatcaUuid: uuid, zatcaPreviousHash: previousHash, zatcaIcv: icv, zatcaStatus: 'SUBMITTING' },
      });

      const xml = buildUnsignedInvoiceXml({
        number: invoice.no,
        uuid,
        issuedAt: invoice.issueDate,
        invoiceType,
        // Credit/debit notes travel as the same Invoice structure with type
        // code 381/383 plus the original's reference and the reason — and
        // they occupy ordinary positions in the same ICV/PIH chain.
        documentType: invoice.docType === 'CREDIT_NOTE' ? 'credit' : invoice.docType === 'DEBIT_NOTE' ? 'debit' : 'invoice',
        billingReference: invoice.relatedInvoice ? { invoiceNumber: invoice.relatedInvoice.no } : undefined,
        adjustmentReason: invoice.adjustmentReason ?? undefined,
        icv,
        pih: previousHash,
        seller: {
          name: company.legalName!,
          vatNumber: company.vatNumber,
          crNumber: company.crNumber,
          // The structured parts the authority reads. `address` is the
          // display line and is deliberately not parsed into these — it falls
          // back only where the merchant has left a part blank.
          street: company.street ?? company.address,
          buildingNumber: company.buildingNumber,
          district: company.district,
          city: company.city,
          postalCode: company.postalCode,
        },
        buyer: { name: invoice.customer.name, vatNumber: invoice.customer.vatNumber },
        lines: invoice.lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          taxRate: Number(l.taxRate),
        })),
        currency: invoice.currency,
        subtotal: Number(invoice.subtotal),
        taxTotal: Number(invoice.taxTotal),
        total: Number(invoice.total),
        // The tax always goes to the authority in SAR, whatever the invoice is
        // denominated in.
        taxTotalSar: Number(invoice.baseTaxTotal ?? invoice.taxTotal),
      });

      return {
        xml,
        uuid,
        invoiceType,
        qr: {
          sellerName: company.legalName!,
          vatNumber: company.vatNumber!,
          issuedAt: invoice.issueDate,
          total: Number(invoice.total),
          vatAmount: Number(invoice.taxTotal),
        },
      };
    });

    return this.dispatch(companyId, invoiceId, credential, unsigned);
  }

  /**
   * Signs the document with the merchant's certificate, submits it, and
   * records the outcome. Any failure marks the invoice REJECTED with the
   * reason rather than leaving it stuck on SUBMITTING forever.
   */
  private async dispatch(
    companyId: string,
    invoiceId: string,
    credential: {
      environment: keyof typeof API_BASE;
      privateKeyEnc: string | null;
      productionCsidEnc: string | null;
      productionSecretEnc: string | null;
    },
    unsigned: {
      xml: string;
      uuid: string;
      invoiceType: 'standard' | 'simplified';
      qr: { sellerName: string; vatNumber: string; issuedAt: Date; total: number; vatAmount: number };
    },
  ) {
    try {
      // The certificate is the merchant's, held by the platform on their
      // behalf — signing happens here, in-process, and the key is decrypted
      // only for the duration of this call.
      const { signedXml, invoiceHash } = await signInvoice({
        unsignedXml: unsigned.xml,
        privateKeyPem: decryptSecret(credential.privateKeyEnc!),
        certificateBase64: decryptSecret(credential.productionCsidEnc!),
        qr: unsigned.qr,
      });

      // The hash is only knowable after the document is built, and it is what
      // the next invoice chains onto — so it is stored before the network call,
      // not after it succeeds.
      await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.invoice.update({ where: { id: invoiceId }, data: { zatcaHash: invoiceHash } }),
      );

      // Standard (B2B) invoices are *cleared* before being given to the buyer;
      // simplified (B2C) ones are *reported* within 24h. Sending one down the
      // other's path is rejected.
      const path = unsigned.invoiceType === 'standard' ? '/invoices/clearance/single' : '/invoices/reporting/single';
      const token = decryptSecret(credential.productionCsidEnc!);
      const secret = decryptSecret(credential.productionSecretEnc!);

      const res = await fetch(`${apiBaseFor(credential.environment)}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          'Clearance-Status': unsigned.invoiceType === 'standard' ? '1' : '0',
          Authorization: `Basic ${Buffer.from(`${token}:${secret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          invoiceHash,
          uuid: unsigned.uuid,
          // The authority takes the signed document base64-encoded.
          invoice: Buffer.from(signedXml, 'utf8').toString('base64'),
        }),
      });

      const body = (await res.json().catch(() => ({}))) as { message?: string };
      const cleared = res.ok;
      await this.recordResult(companyId, invoiceId, cleared, body.message ?? (cleared ? null : `HTTP ${res.status}`));
      return this.statusOf(companyId, invoiceId);
    } catch (e) {
      const message = (e as Error).message;
      this.logger.warn(`ZATCA submission failed for invoice ${invoiceId}: ${message}`);
      await this.recordResult(companyId, invoiceId, false, message);
      return this.statusOf(companyId, invoiceId);
    }
  }

  private recordResult(companyId: string, invoiceId: string, cleared: boolean, message: string | null) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.update({
        where: { id: invoiceId },
        data: {
          zatcaStatus: cleared ? 'CLEARED' : 'REJECTED',
          zatcaSubmittedAt: new Date(),
          zatcaMessage: message,
        },
      }),
    );
  }

  private statusOf(companyId: string, invoiceId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: {
          id: true,
          no: true,
          zatcaStatus: true,
          zatcaUuid: true,
          zatcaHash: true,
          zatcaPreviousHash: true,
          zatcaIcv: true,
          zatcaSubmittedAt: true,
          zatcaMessage: true,
        },
      }),
    );
  }
}
