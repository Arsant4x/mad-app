import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { MSG } from '../common/i18n/messages';
import { assertKeyBelongsToCompany, FilesService } from '../files/files.service';

const PROFILE_SELECT = {
  id: true,
  orgName: true,
  legalName: true,
  vatNumber: true,
  crNumber: true,
  phone: true,
  email: true,
  website: true,
  address: true,
  street: true,
  buildingNumber: true,
  district: true,
  city: true,
  postalCode: true,
  additionalNumber: true,
  unitNumber: true,
  logoFileKey: true,
  masterDataLocked: true,
  writeOffRequiresTwoPersons: true,
} as const;

/** Matches CompanyUsersService's assertIsCompanyOwner — only the company
 * owner (actorType COMPANY) edits its own legal/tax profile; employee
 * sub-accounts can read it (e.g. to print a compliant invoice) but not
 * change it. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.company_profile_owner_only);
  }
}

/** Converts a PATCH's empty-string fields to `null` (explicit "clear this
 * field") while leaving omitted keys untouched — same convention as every
 * other optional-field update in this app never conflating "not sent" with
 * "sent empty". */
function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value === '' ? null : value;
}

@Injectable()
export class CompanyProfileService {
  private readonly logger = new Logger(CompanyProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  get(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: PROFILE_SELECT });
  }

  async update(companyId: string, actorType: string, dto: UpdateCompanyProfileDto) {
    assertIsCompanyOwner(actorType);

    const logoFileKey = emptyToNull(dto.logoFileKey);
    // A storage key is just a string on this row — nothing stops a caller from
    // sending another company's key, and RLS can't help because MinIO isn't
    // Postgres. So re-verify it resolves under *this* company's prefix before
    // storing it, the same way a foreign id from a request body is re-checked
    // elsewhere in this codebase.
    if (logoFileKey) assertKeyBelongsToCompany(logoFileKey, companyId);

    const previous = logoFileKey !== undefined ? await this.prisma.company.findUnique({ where: { id: companyId }, select: { logoFileKey: true } }) : null;

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        legalName: dto.legalName.trim(),
        vatNumber: emptyToNull(dto.vatNumber),
        crNumber: emptyToNull(dto.crNumber),
        phone: emptyToNull(dto.phone),
        email: emptyToNull(dto.email),
        website: emptyToNull(dto.website),
        address: emptyToNull(dto.address),
        street: emptyToNull(dto.street),
        buildingNumber: emptyToNull(dto.buildingNumber),
        district: emptyToNull(dto.district),
        city: emptyToNull(dto.city),
        postalCode: emptyToNull(dto.postalCode),
        additionalNumber: emptyToNull(dto.additionalNumber),
        unitNumber: emptyToNull(dto.unitNumber),
        ...(logoFileKey !== undefined ? { logoFileKey } : {}),
        ...(dto.masterDataLocked !== undefined ? { masterDataLocked: dto.masterDataLocked } : {}),
        ...(dto.writeOffRequiresTwoPersons !== undefined ? { writeOffRequiresTwoPersons: dto.writeOffRequiresTwoPersons } : {}),
      },
      select: PROFILE_SELECT,
    });

    // Replacing or clearing the logo leaves the old object orphaned in storage
    // — nothing else ever references it. Deleted after the row is safely
    // updated, and failures are logged rather than thrown: a stale object is a
    // cleanup problem, not a reason to fail the user's save.
    const staleKey = previous?.logoFileKey;
    if (staleKey && staleKey !== logoFileKey) {
      await this.files.remove(companyId, staleKey).catch((e: Error) => this.logger.warn(`Could not delete replaced logo "${staleKey}": ${e.message}`));
    }

    return updated;
  }
}
