import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'soroprotocol',
  username: process.env.DB_USER || 'soro',
  password: process.env.DB_PASSWORD || 'soro',
  migrations: ['src/database/migrations/*.ts'],
  entities: ['src/**/*.entity.ts'],
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
