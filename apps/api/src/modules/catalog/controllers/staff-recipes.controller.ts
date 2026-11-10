import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UserRole } from '../../../generated/prisma/client.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { UsersService } from '../../users/users.service.js';
import { CatalogService } from '../services/catalog.service.js';

@Controller('staff/recipes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BARISTA)
export class StaffRecipesController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: { id: string }) {
    await this.users.assertActiveBarista(this.prisma, user.id);
    return { data: await this.catalog.getRecipes() };
  }
}
