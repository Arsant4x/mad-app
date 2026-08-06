import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ZatcaEnvironment, ZatcaOnboardingStatus } from '@prisma/client';
import { decryptSecret, encryptSecret, secretIsSet } from '../common/crypto/secret.util';
import { MSG } from '../common/i18n/messages';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { StartOnboardingDto, SubmitOtpDto } from './dto/onboarding.dto';
import { csrToBase64, generateCsr, ZatcaEnv } from './csr.util';

/**
 * Fatoora onboarding, run by the platform on the merchant's behalf.
 *
 * The merchant's entire share of this is pasting one OTP from the Fatoora
 * portal. Everything else — keypair, CSR, certificate exchange, storage — is
 * the platform's job, because that is what a SaaS is (CLAUDE.md §1).
 *
 * ⚠️ The authority's endpoints and the exact request/response shapes must be
 * confirmed against the current ZATCA API documentation before onboarding a
 * real merchant. Nothing here has been exercised against a live portal.
 */

/**
 * Redirects every outbound ZATCA call, for tests and local staging.
 *
 * Without it a test that exercises the dispatch path would send real traffic to
 * a government API. Deliberately read at call time, not module load, so a test
 * can set it after the app has booted. **Must never be set in production** —
 * it would silently point clearance at somewhere that is not the authority.
 */
export function apiBaseFor(environment: ZatcaEnvironment): string {
  return process.env.ZATCA_API_BASE_OVERRIDE?.trim() || API_BASE[environment];
}

/** Per-environment API base. Kept beside the certificate template names in
 * csr.util so the two can't drift apart. */
export const API_BASE: Record<ZatcaEnvironment, string> = {
  SANDBOX: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  SIMULATION: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  PRODUCTION: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

/** Identifies this platform as the E-invoice Generation Solution. */
const SOLUTION_NAME = 'mad-app';

function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.company_profile_owner_only);
  }
}

@Injectable()
export class ZatcaOnboardingService {
  private readonly logger = new Logger(ZatcaOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** `zatca_credentials` is FORCE-RLS, and rightly so — it holds signing keys.
   * Every read and write therefore goes through the tenant context; the raw
   * client would silently see an empty table. */
  private credential(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.findUnique({ where: { companyId } }));
  }

  /** Never exposes key material — only where the merchant is in the process. */
  async getStatus(companyId: string) {
    const [credential, company] = await Promise.all([
      this.credential(companyId),
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { legalName: true, vatNumber: true },
      }),
    ]);

    return {
      status: credential?.status ?? ZatcaOnboardingStatus.NOT_STARTED,
      environment: credential?.environment ?? ZatcaEnvironment.SANDBOX,
      hasKeys: secretIsSet(credential?.privateKeyEnc),
      hasComplianceCertificate: secretIsSet(credential?.complianceCsidEnc),
      hasProductionCertificate: secretIsSet(credential?.productionCsidEnc),
      onboardedAt: credential?.onboardedAt ?? null,
      lastError: credential?.lastError ?? null,
      // Surfaced so the screen can explain what's missing instead of failing
      // only once the merchant presses the button.
      profileComplete: Boolean(company.legalName?.trim() && company.vatNumber?.trim()),
    };
  }

  /**
   * Step 1 — generate this merchant's keypair and CSR.
   *
   * Refuses to regenerate once a production certificate exists: the key is
   * what that certificate was issued against, so replacing it would silently
   * invalidate the merchant's ability to clear invoices.
   */
  async start(companyId: string, actorType: string, dto: StartOnboardingDto) {
    assertIsCompanyOwner(actorType);

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { legalName: true, vatNumber: true, address: true },
    });
    if (!company.legalName?.trim() || !company.vatNumber?.trim()) {
      throw new BadRequestException(MSG.zatca_profile_incomplete);
    }

    const existing = await this.credential(companyId);
    if (existing && secretIsSet(existing.productionCsidEnc)) {
      throw new BadRequestException(MSG.zatca_already_onboarded);
    }

    const environment = (dto.environment ?? ZatcaEnvironment.SANDBOX) as ZatcaEnvironment;
    const { privateKeyPem, csrPem } = await generateCsr(
      {
        organizationName: company.legalName.trim(),
        vatNumber: company.vatNumber.trim(),
        organizationUnit: dto.branchName?.trim() || company.legalName.trim(),
        commonName: `${SOLUTION_NAME}-${company.vatNumber.trim()}`,
        registeredAddress: dto.registeredAddress?.trim() || company.address?.trim() || 'Saudi Arabia',
        businessCategory: dto.businessCategory?.trim() || 'General',
        // `1-<solution>|2-<model>|3-<serial>` identifies this EGS unit.
        serialNumber: `1-${SOLUTION_NAME}|2-web|3-${companyId}`,
        invoiceType: dto.invoiceType?.trim() || '1100',
      },
      environment as ZatcaEnv,
    );

    await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.zatcaCredential.upsert({
        where: { companyId },
        create: {
          companyId,
          privateKeyEnc: encryptSecret(privateKeyPem),
          csr: csrPem,
          environment,
          status: ZatcaOnboardingStatus.AWAITING_OTP,
        },
        update: {
          privateKeyEnc: encryptSecret(privateKeyPem),
          csr: csrPem,
          environment,
          status: ZatcaOnboardingStatus.AWAITING_OTP,
          lastError: null,
        },
      }),
    );

    return this.getStatus(companyId);
  }

  /**
   * Step 2 — exchange the merchant's OTP for a compliance certificate.
   *
   * The OTP is short-lived and single-use, so it is passed straight through
   * and never stored.
   */
  async submitOtp(companyId: string, actorType: string, dto: SubmitOtpDto) {
    assertIsCompanyOwner(actorType);

    const credential = await this.credential(companyId);
    if (!credential?.csr) throw new BadRequestException(MSG.zatca_onboarding_not_started);

    try {
      const res = await fetch(`${apiBaseFor(credential.environment)}/compliance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          OTP: dto.otp,
        },
        body: JSON.stringify({ csr: csrToBase64(credential.csr) }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        binarySecurityToken?: string;
        secret?: string;
        errors?: unknown;
      };

      if (!res.ok || !body.binarySecurityToken || !body.secret) {
        return this.fail(companyId, `HTTP ${res.status} — ${JSON.stringify(body.errors ?? body)}`.slice(0, 500));
      }

      // Pulled out of `body` before the callback: TypeScript drops property
      // narrowing inside a closure, so `body.secret` would read as possibly
      // undefined there despite the guard above.
      const { binarySecurityToken, secret } = body;

      await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.zatcaCredential.update({
          where: { companyId },
          data: {
            complianceCsidEnc: encryptSecret(binarySecurityToken),
            complianceSecretEnc: encryptSecret(secret),
            status: ZatcaOnboardingStatus.COMPLIANCE_ISSUED,
            lastError: null,
          },
        }),
      );

      return this.getStatus(companyId);
    } catch (e) {
      this.logger.warn(`ZATCA compliance request failed for company ${companyId}: ${(e as Error).message}`);
      return this.fail(companyId, (e as Error).message);
    }
  }

  /**
   * Step 3 — swap the compliance certificate for a production one, which is
   * what actually clears real invoices.
   *
   * The authority only issues this after the merchant's solution has passed
   * the conformance checks, so a rejection here usually means those haven't
   * been completed rather than that anything is misconfigured.
   */
  async requestProductionCertificate(companyId: string, actorType: string) {
    assertIsCompanyOwner(actorType);

    const credential = await this.credential(companyId);
    if (!credential || !secretIsSet(credential.complianceCsidEnc)) {
      throw new BadRequestException(MSG.zatca_compliance_required);
    }

    const token = decryptSecret(credential.complianceCsidEnc!);
    const secret = decryptSecret(credential.complianceSecretEnc!);

    try {
      const res = await fetch(`${apiBaseFor(credential.environment)}/production/csids`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          Authorization: `Basic ${Buffer.from(`${token}:${secret}`).toString('base64')}`,
        },
        body: JSON.stringify({ compliance_request_id: credential.id }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        binarySecurityToken?: string;
        secret?: string;
        errors?: unknown;
      };

      if (!res.ok || !body.binarySecurityToken || !body.secret) {
        return this.fail(companyId, `HTTP ${res.status} — ${JSON.stringify(body.errors ?? body)}`.slice(0, 500));
      }

      // Destructured for the same narrowing reason as in `submitOtp`.
      const { binarySecurityToken, secret: productionSecret } = body;

      await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.zatcaCredential.update({
          where: { companyId },
          data: {
            productionCsidEnc: encryptSecret(binarySecurityToken),
            productionSecretEnc: encryptSecret(productionSecret),
            status: ZatcaOnboardingStatus.PRODUCTION_ISSUED,
            onboardedAt: new Date(),
            lastError: null,
          },
        }),
      );

      return this.getStatus(companyId);
    } catch (e) {
      this.logger.warn(`ZATCA production CSID request failed for company ${companyId}: ${(e as Error).message}`);
      return this.fail(companyId, (e as Error).message);
    }
  }

  /** Records why onboarding stopped so the merchant sees something actionable
   * rather than a generic retry prompt. */
  private async fail(companyId: string, message: string) {
    await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.zatcaCredential.update({
        where: { companyId },
        data: { status: ZatcaOnboardingStatus.FAILED, lastError: message },
      }),
    );
    return this.getStatus(companyId);
  }
}
