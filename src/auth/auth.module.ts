import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    forwardRef(() => UserModule), // 순환 참조 해결
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'pmusic-secret-key'),
        signOptions: {
          // 타입 호환성을 위해 any 캐스팅 (JWT 라이브러리 StringValue 타입 문제)
          expiresIn: configService.get('JWT_EXPIRES_IN', '7d') as any, // 토큰 유효기간 7일
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService, JwtModule], // 다른 모듈에서 사용 가능하도록 export
})
export class AuthModule {}
