import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
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
  
  @Get(':id')
  async getProductDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.catalogService.getProductDetailById(id);

    return {
      success: true,
      data,
    };
  }

}