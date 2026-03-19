import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard, RolesGuard } from './auth.guard';
import { Roles } from './roles.decorator';
import type { JwtPayload } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: { login: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.login || !body.password) {
      throw new BadRequestException('Логин и пароль обязательны');
    }

    const { user, token } = await this.authService.validateLogin(
      body.login,
      body.password,
    );

    res.cookie('az_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    return user;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('az_token', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: Request) {
    const payload = (req as any).user as JwtPayload;
    return this.authService.getMe(payload.sub);
  }

  @Put('profile')
  @UseGuards(AuthGuard)
  async updateProfile(
    @Req() req: Request,
    @Body() body: { name: string },
  ) {
    const payload = (req as any).user as JwtPayload;
    if (!body.name?.trim()) {
      throw new BadRequestException('Название обязательно');
    }
    return this.authService.updateProfile(payload.sub, { name: body.name });
  }

  @Get('admin/clients')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async listClients() {
    return this.authService.listClients();
  }

  @Post('admin/clients')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async createClient(@Body() body: { name: string }) {
    if (!body.name?.trim()) {
      throw new BadRequestException('Название клиента обязательно');
    }
    return this.authService.createClient({ name: body.name });
  }

  @Get('admin/clients/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async getClient(@Param('id') id: string) {
    return this.authService.getClientDetail(id);
  }

  @Put('admin/clients/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async updateClient(
    @Param('id') id: string,
    @Body() body: { name?: string; login?: string },
  ) {
    return this.authService.updateClient(id, body);
  }

  @Put('admin/clients/:id/password')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async changePassword(
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    if (!body.password || body.password.length < 6) {
      throw new BadRequestException('Пароль должен быть не менее 6 символов');
    }
    return this.authService.changeClientPassword(id, body.password);
  }

  @Delete('admin/clients/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async toggleClient(@Param('id') id: string) {
    return this.authService.toggleClientActive(id);
  }

  @Get('admin/clients/:id/suppliers')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async getClientSuppliers(@Param('id') id: string) {
    return this.authService.getClientSuppliers(id);
  }

  @Get('admin/clients/:id/history')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  async getClientHistory(@Param('id') id: string) {
    return this.authService.getClientHistory(id);
  }
}
