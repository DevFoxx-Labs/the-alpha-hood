/** Errors from the provider services (SMS, email, storage), mapped to responses by lib/providers/http.ts. */
export class ProviderError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
