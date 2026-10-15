import { ApiProperty } from '@nestjs/swagger';
import { PlatformRole } from '@mad-app/db';

/** One platform audit row as it is sent: the time is an ISO string. */
export class PlatformAuditRowResponse {
  id!: string;
  adminId!: string;
  /** The administrator's login name at the time of the request. */
  adminName!: string;
  @ApiProperty({ enum: PlatformRole })
  adminRole!: PlatformRole;
  method!: string;
  /** The declared route pattern, for example /companies/:id. */
  route!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' }, nullable: true })
  params!: Record<string, string> | null;
  targetCompanyId!: string | null;
  /** The status sent to the client; 499 when the client closed the connection first. */
  status!: number;
  /** The request body with secrets removed, only for a request that succeeded. */
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  details!: Record<string, unknown> | null;
  ip!: string | null;
  createdAt!: string;
}

/** A page of the platform audit log, newest first. */
export class PlatformAuditPageResponse {
  items!: PlatformAuditRowResponse[];
  total!: number;
  page!: number;
  pageSize!: number;
}
