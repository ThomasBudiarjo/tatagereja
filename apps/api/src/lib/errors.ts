import type { ErrorCode, ValidationIssue } from '@tatagereja/shared';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly errorCode: ErrorCode;
  readonly issues: ValidationIssue[] | undefined;

  constructor(
    statusCode: number,
    errorCode: ErrorCode,
    message: string,
    issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.issues = issues;
  }

  toBody() {
    return {
      error: {
        code: this.errorCode,
        message: this.message,
        ...(this.issues ? { issues: this.issues } : {}),
      },
    };
  }
}

export const badRequest = (message: string, issues?: ValidationIssue[]) =>
  new HttpError(400, 'BAD_REQUEST', message, issues);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do that') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);
export const rateLimited = (retryAfterSeconds: number) =>
  new HttpError(
    429,
    'RATE_LIMITED',
    `Too many attempts. Try again in ${Math.max(1, retryAfterSeconds)} seconds`,
  );
export const validationError = (message: string, issues: ValidationIssue[]) =>
  new HttpError(422, 'VALIDATION', message, issues);
