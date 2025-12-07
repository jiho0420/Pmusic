import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';

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
    await this.userService.create(body);
    return { message: '회원가입이 완료되었습니다.' };
  }

  // 로그인 API: POST /api/users/login
  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
  ) {
    return this.authService.login(body.email, body.password);
  }

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(Number(id));
  }
}


