import { Body, Controller, Post, Delete, HttpCode, UseGuards, Request, ConflictException, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  // 회원가입 API: POST /api/users/register
  @Post('register')
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      nickname: string;
    },
  ) {
    // 입력값 검증
    if (!body.email || !body.password || !body.nickname) {
      throw new BadRequestException('이메일, 비밀번호, 닉네임은 필수입니다.');
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      throw new BadRequestException('올바른 이메일 형식이 아닙니다.');
    }

    // 비밀번호 길이 검증 (최소 6자)
    if (body.password.length < 6) {
      throw new BadRequestException('비밀번호는 최소 6자 이상이어야 합니다.');
    }

    // 닉네임 길이 검증 (2~20자)
    if (body.nickname.length < 2 || body.nickname.length > 20) {
      throw new BadRequestException('닉네임은 2~20자 사이여야 합니다.');
    }

    // 중복 이메일 체크
    const existingUser = await this.userService.findByEmail(body.email);
    if (existingUser) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    await this.userService.create(body);
    return { message: '회원가입이 완료되었습니다.' };
  }

  // 로그인 API: POST /api/users/login
  // 참고: /api/auth/login과 동일한 기능 (프론트엔드 편의를 위해 유지)
  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
  ) {
    return this.authService.login(body.email, body.password);
  }

  // 로그아웃 API: POST /api/users/logout
  // JWT는 stateless이므로 서버 측 토큰 무효화 없이 성공 응답 반환
  // 실제 토큰 삭제는 프론트엔드에서 처리
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout() {
    return { message: '로그아웃 되었습니다.' };
  }

  // 계정 삭제 API: DELETE /api/users/delete
  // 본인 계정만 삭제 가능 (JWT 토큰에서 userId 추출)
  @Delete('delete')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async deleteAccount(@Request() req: { user: { id: number } }) {
    await this.userService.deleteUser(req.user.id);
  }
}


