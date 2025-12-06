import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { History } from './history.entity';
import { User } from '../user/user.entity';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';

@Module({
  imports: [TypeOrmModule.forFeature([History, User])],
  providers: [HistoryService],
  controllers: [HistoryController],
  exports: [HistoryService],              // 다른 모듈에서 HistoryService 사용 가능
})
export class HistoryModule {}
