import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

/**
 * ⛔ **لا مسارَ حذفٍ مباشراً** (`ق-٥٤٨`): إغلاقُ منشأةٍ أو حذفُها واقعةٌ تمسّ التاجر، فلا
 * تقع بضغطةٍ بلا طلبٍ منه وأثرٍ يحمل من قرّر — **المسارُ الوحيد طلبُ الحذف وموافقتُه**
 * (`/admin/deletion-requests`). كان هنا `DELETE /companies/:id` وحُذف.
 */
@Controller('companies')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  list(@Query() query: PagedQueryDto) {
    return this.companiesService.list(query);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }
}
