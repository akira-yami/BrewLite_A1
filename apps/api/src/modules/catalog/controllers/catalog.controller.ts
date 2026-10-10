import { Controller, Get } from '@nestjs/common';
import { CatalogService } from '../services/catalog.service.js';

@Controller('products')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  async getProducts() {
    const data = await this.catalogService.getProducts();
    return {
      success: true,
      data,
    };
  }
}