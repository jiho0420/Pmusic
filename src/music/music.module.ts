import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { MusicController } from './music.controller';
import { MusicService } from './music.service';
import { Music } from './music.entity';
import { HistoryModule } from '../history/history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Music]), // Repository 주입
    HttpModule.register({              // 외부 통신 설정
      timeout: 60000,                  // 기본 60초 타임아웃
      maxRedirects: 5,
    }),
    forwardRef(() => HistoryModule),   // HistoryService 사용을 위한 순환 참조 해결
  ],
  controllers: [MusicController],
  providers: [MusicService],
  exports: [MusicService],              // 다른 모듈에서 MusicService 사용 가능
})
export class MusicModule {}