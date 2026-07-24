export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidNickname(nickname: string): boolean {
  return /^[\u3400-\u9fffA-Za-z0-9_]{2,20}$/u.test(nickname);
}
