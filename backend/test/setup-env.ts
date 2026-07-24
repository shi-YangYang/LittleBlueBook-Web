process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL =
  'postgresql://littlebluebook:littlebluebook-local@127.0.0.1:5432/littlebluebook';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:3000';
process.env.SWAGGER_ENABLED = 'true';
process.env.TRUST_PROXY_HOPS = '0';
process.env.COOKIE_SECURE = 'false';
process.env.AUTH_CODE_HASH_SECRET =
  'test-only-auth-code-hash-secret-32-characters';
process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_PORT = '465';
process.env.SMTP_SECURE = 'true';
process.env.SMTP_FROM_ADDRESS = 'sender@example.test';
process.env.SMTP_USERNAME = 'sender@example.test';
process.env.SMTP_AUTH_CODE = 'test-only-placeholder';
process.env.SMTP_FROM_NAME = '小蓝书';
process.env.MAIL_TRANSPORT = 'memory';
process.env.E2E_TEST_CODE = '246810';
