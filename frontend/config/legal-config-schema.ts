export type LegalConfig = Readonly<{
  operator: Readonly<{ displayName: string }>;
  contact: Readonly<{ email: string }>;
  legal: Readonly<{
    governingLaw: 'CN_MAINLAND';
    effectiveDate: string;
  }>;
}>;

export class LegalConfigUnavailableError extends Error {
  constructor() {
    super('LEGAL_CONFIG_UNAVAILABLE');
    this.name = 'LegalConfigUnavailableError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = Object.hasOwn(record, key) ? record[key] : undefined;
  if (typeof value !== 'string' || value.trim() !== value || !value) {
    throw new LegalConfigUnavailableError();
  }
  return value;
}

export function parseLegalConfig(input: unknown): LegalConfig {
  if (!isRecord(input)) throw new LegalConfigUnavailableError();
  const operator = input.operator;
  const contact = input.contact;
  const legal = input.legal;
  if (!isRecord(operator) || !isRecord(contact) || !isRecord(legal)) {
    throw new LegalConfigUnavailableError();
  }

  const displayName = requiredString(operator, 'displayName');
  const email = requiredString(contact, 'email');
  const governingLaw = requiredString(legal, 'governingLaw');
  const effectiveDate = requiredString(legal, 'effectiveDate');

  if (
    displayName.includes('请填写') ||
    email.endsWith('.invalid') ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    governingLaw !== 'CN_MAINLAND' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
  ) {
    throw new LegalConfigUnavailableError();
  }

  const parsedDate = new Date(`${effectiveDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== effectiveDate
  ) {
    throw new LegalConfigUnavailableError();
  }

  return Object.freeze({
    operator: Object.freeze({ displayName }),
    contact: Object.freeze({ email }),
    legal: Object.freeze({
      governingLaw: 'CN_MAINLAND' as const,
      effectiveDate,
    }),
  });
}
