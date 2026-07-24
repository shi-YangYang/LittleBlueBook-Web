import { isValidNickname, normalizeEmail } from './email.js';

describe('email and nickname rules', () => {
  it('normalizes email before storage and lookup', () => {
    expect(normalizeEmail('  User.Name@Example.COM ')).toBe(
      'user.name@example.com',
    );
  });

  it.each(['蓝书用户', 'user_01', '蓝书User_01'])(
    'accepts a valid nickname: %s',
    (nickname) => {
      expect(isValidNickname(nickname)).toBe(true);
    },
  );

  it.each(['a', '包含-横线', 'has space', 'a'.repeat(21)])(
    'rejects an invalid nickname: %s',
    (nickname) => {
      expect(isValidNickname(nickname)).toBe(false);
    },
  );
});
