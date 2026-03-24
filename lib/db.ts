import { neon } from '@neondatabase/serverless';

export const getDb = () => neon(process.env.DATABASE_URL!);
