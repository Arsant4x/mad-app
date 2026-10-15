import { SetMetadata } from '@nestjs/common';

export const ALLOW_ENROLMENT_SESSION_KEY = 'auth:allow-enrolment-session';

/** Lets the enrolment-only session of a platform administrator reach this route; every other route refuses it. */
export const AllowEnrolmentSession = () => SetMetadata(ALLOW_ENROLMENT_SESSION_KEY, true);
