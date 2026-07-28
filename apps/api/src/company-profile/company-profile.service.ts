import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

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
  logoFileKey: true,
} as const;

/** Matches CompanyUsersService's assertIsCompanyOwner — only the company
 * owner (actorType COMPANY) edits its own legal/tax profile; employee
 * sub-accounts can read it (e.g. to print a compliant invoice) but not
 * change it. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException('تعديل بيانات المنشأة متاح لحساب الشركة الرئيسي فقط');
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
  constructor(private readonly prisma: PrismaService) {}

  get(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: PROFILE_SELECT });
  }

  update(companyId: string, actorType: string, dto: UpdateCompanyProfileDto) {
    assertIsCompanyOwner(actorType);

    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        legalName: dto.legalName.trim(),
        vatNumber: emptyToNull(dto.vatNumber),
        crNumber: emptyToNull(dto.crNumber),
        phone: emptyToNull(dto.phone),
        email: emptyToNull(dto.email),
        website: emptyToNull(dto.website),
        address: emptyToNull(dto.address),
      },
      select: PROFILE_SELECT,
    });
  }
}
