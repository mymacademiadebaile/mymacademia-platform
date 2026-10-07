export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = "APP_ERROR",
    /** Structured data the UI can show (for example the conflicting sessions). */
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}
