import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService, AuthUserView } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, RegisterDto, ResetPasswordDto } from './dto/password-reset.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from './types';
import { MSG } from '../common/i18n/messages';
import { API_VERSION_PREFIX } from '../common/versioning';

const REFRESH_COOKIE = 'refresh_token';
/** بابا المسار (`ق-١٢٨٦`): المحايد والمُصدَّر — والكوكي يُضيَّق على أحدهما لا يُوسَّع لهما. */
const AUTH_COOKIE_PATHS = ['/auth', `/${API_VERSION_PREFIX}/auth`] as const;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Hard per-IP throttle: 10 attempts a minute is generous for a human and
   * useless for a password-guessing script. */
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string; user: AuthUserView }> {
    const result = await this.authService.login(dto.username, dto.password, dto.code);
    this.setRefreshCookie(req, res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  /** Always 200 with the same body — see AuthService.forgotPassword for why. */
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.authService.forgotPassword(dto.username);
    return { ok: true };
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
  }

  /** Self-signup with a trial — returns a working session immediately. */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string; user: AuthUserView }> {
    const result = await this.authService.register(dto.orgName, dto.username, dto.password, dto.email, dto.country);
    this.setRefreshCookie(req, res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string; user: AuthUserView }> {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw new UnauthorizedException(MSG.session_missing);
    const result = await this.authService.refresh(presented);
    this.setRefreshCookie(req, res, result.refreshToken, result.refreshTokenExpiresAt);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) await this.authService.logout(presented);
    // **يُمحى من البابين معاً** — فمن دخل من بابٍ وخرج من آخر لا يترك كوكيّاً حيّاً.
    for (const path of AUTH_COOKIE_PATHS) res.clearCookie(REFRESH_COOKIE, { path });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request): Promise<AuthUserView> {
    return this.authService.whoAmI(req.user as JwtPayload);
  }

  /**
   * **مسارُ الكوكي يتبع البابَ الذي جاء منه الطلب** (`ق-١٢٨٦`).
   *
   * 🔴 **العطلُ الذي منعه**: الكوكي كان مضيَّقاً على `/auth` — فلمّا صارت الواجهةُ تطلب
   * `/v1/auth/refresh` **توقّف المتصفّح عن إرساله**، فيخرج كلُّ مستخدمٍ عند أوّل تحديثِ
   * صفحة. **أمسكه `playwright` لا القراءة** (`e2e/delegation.spec.ts` سقط في السير).
   *
   * **ولا يُوسَّع إلى `/`** — فذلك يُرسل رمزَ التحديث مع **كلِّ** طلبٍ في المنصّة، وهو
   * نقضٌ لتضييقٍ مقصود. فالمسارُ يُشتقّ من الباب: من دخل من `/v1` أخذ كوكيّاً على
   * `/v1/auth`، ومن دخل من المحايد أخذه على `/auth` — **والمتصفّحُ يلزم بابَه**.
   */
  private setRefreshCookie(req: Request, res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: req.originalUrl.startsWith(`/${API_VERSION_PREFIX}/`) ? `/${API_VERSION_PREFIX}/auth` : '/auth',
      expires: expiresAt,
    });
  }
}
