import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required config "${name}". Set it in .env (see .env.example).`);
  }
  return value;
}

/** Central test configuration, loaded from .env */
export const config = {
  baseUrl: required('BASE_URL'),
  username: required('TEST_USERNAME'),
  password: required('TEST_PASSWORD'),
  /** Where the logged-in browser session is saved and reused by tests */
  authFile: path.resolve(__dirname, '..', 'playwright', '.auth', 'user.json'),
};
