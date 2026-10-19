import { INestApplication } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { UserRepository } from '../src/modules/auth/repositories/user.repository.js';

describe('JWT guard and current user (HTTP)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const findById = vi.fn();
  const user = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    username: 'huy',
    role: 'CUSTOMER',
    passwordHash: 'must-not-leak',
    loyaltyBalance: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(UserRepository)
      .useValue({ findById })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    jwt = app.get(JwtService);
  });
  beforeEach(() => {
    findById.mockReset();
    findById.mockResolvedValue(user);
  });
  afterAll(async () => {
    await app?.close();
  });

  it('rejects a missing token without looking up a user', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects malformed tokens', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
    expect(findById).not.toHaveBeenCalled();
  });

  it.each([
    { expiresIn: -1 },
    { secret: 'wrong-signature-key' },
    { issuer: 'wrong-issuer' },
    { audience: 'wrong-audience' },
  ] satisfies JwtSignOptions[])(
    'rejects invalid claims or signature: %j',
    async (options) => {
      const token = jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        options,
      );
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(findById).not.toHaveBeenCalled();
      expect(JSON.stringify(response.body)).not.toContain(token);
      expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
    },
  );

  it('rejects a signed token with no subject', async () => {
    const token = jwt.sign({ username: user.username, role: user.role });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(findById).not.toHaveBeenCalled();
  });

  it('uses JWT subject for the profile and never exposes the password hash', async () => {
    const token = jwt.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(findById).toHaveBeenCalledWith(user.id);
    expect(response.body.data).toMatchObject({
      id: user.id,
      username: 'huy',
      role: 'CUSTOMER',
    });
    expect(response.body.data).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('must-not-leak');
  });
});
