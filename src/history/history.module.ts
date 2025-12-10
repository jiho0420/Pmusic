import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { History } from './history.entity';
import { User } from '../user/user.entity';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([History, User]),
    AuthModule,                           // JWT Guard 사용을 위해 import
  ],
  providers: [HistoryService],
  controllers: [HistoryController],
  exports: [HistoryService],              // 다른 모듈에서 HistoryService 사용 가능
})
export class HistoryModule {}
