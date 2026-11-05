export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.status = status; this.code = code;
    if (field !== undefined) this.field = field;
  }
}
