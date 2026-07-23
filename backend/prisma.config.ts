import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const localDatabaseUrl =
  'postgresql://littlebluebook:littlebluebook-local@127.0.0.1:5432/littlebluebook';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? localDatabaseUrl,
  },
});
