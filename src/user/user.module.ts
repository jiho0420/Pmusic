import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule), // 순환 참조 해결 (로그인에 AuthService 필요)
  ],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService], // AuthModule에서 사용하기 위해 export
})
export class UserModule {}
