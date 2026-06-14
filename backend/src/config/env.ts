import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: process.env.PORT || '3001',
  DB_NAME: process.env.DB_NAME || './data/sim_center.sqlite',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret_key',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
};
