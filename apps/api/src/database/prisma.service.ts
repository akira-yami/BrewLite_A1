
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    let connectionString = process.env.DATABASE_URL;

    // Tự động bảo vệ: nếu chạy ngoài Railway mà DATABASE_URL chứa domain nội bộ postgres.railway.internal
    if (
      connectionString?.includes('postgres.railway.internal') &&
      !process.env.RAILWAY_ENVIRONMENT &&
      !process.env.RAILWAY_PROJECT_ID
    ) {
      let resolved = 'postgresql://brewlite:123456@localhost:5433/brewlite?schema=public';
      try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
          if (match && !match[1].includes('postgres.railway.internal')) {
            resolved = match[1];
          }
        }
      } catch {
        // fallback mặc định
      }

      new Logger('PrismaService').warn(
        `Phát hiện DATABASE_URL trỏ vào 'postgres.railway.internal' khi đang chạy ở máy local. ` +
        `Tự động chuyển kết nối về database local: ${resolved}`
      );
      connectionString = resolved;
    }

    if (!connectionString) {
      throw new Error('Thiếu biến môi trường DATABASE_URL trong file .env');
    }

    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

