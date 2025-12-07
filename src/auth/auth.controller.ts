import { Body, Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 로그인 API
  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
  ) {
    return this.authService.login(body.email, body.password);
  }

  // 현재 로그인한 사용자 정보 조회 (토큰 검증 테스트용)
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Request() req: { user: { id: number; email: string; nickname: string } }) {
    return {
      id: req.user.id,
      email: req.user.email,
      nickname: req.user.nickname,
    };
  }
}
