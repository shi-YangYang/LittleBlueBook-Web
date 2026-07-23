process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL =
  'postgresql://littlebluebook:littlebluebook-local@127.0.0.1:5432/littlebluebook';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.FRONTEND_ORIGIN = 'http://127.0.0.1:3000';
process.env.SWAGGER_ENABLED = 'true';
