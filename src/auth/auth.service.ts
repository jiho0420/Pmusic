import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  // 이메일과 비밀번호로 사용자 검증
  async validateUser(email: string, password: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    // 비밀번호 제외하고 반환
    const { password: _, ...result } = user;
    return result;
  }

  // JWT 토큰 발급
  // 프론트엔드 기대 응답: { userId, token, nickname, email }
  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    const payload = {
      sub: user.id, // JWT 표준: subject = user id
      email: user.email,
      nickname: user.nickname,
    };

    return {
      userId: user.id,
      token: this.jwtService.sign(payload),
      nickname: user.nickname,
      email: user.email,
    };
  }

  // 토큰에서 사용자 정보 추출 (Guard에서 사용)
  async validateToken(payload: { sub: number; email: string }) {
    const user = await this.userService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
    return user;
  }
}
