import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// 필수 인증 Guard - 토큰이 없거나 유효하지 않으면 401 에러
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// 선택적 인증 Guard - 토큰이 있으면 검증, 없어도 통과 (비로그인 허용)
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: TUser,
    info: any,
    context: ExecutionContext,
  ): TUser | null {
    // 에러가 있거나 user가 없어도 null 반환 (에러 던지지 않음)
    if (err || !user) {
      return null as any;
    }
    return user;
  }
}
