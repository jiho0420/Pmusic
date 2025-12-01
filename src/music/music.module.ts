import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { MusicController } from './music.controller';
import { MusicService } from './music.service';
import { Music } from './music.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Music]), // Repository 주입
    HttpModule.register({              // 외부 통신 설정
      timeout: 60000,                  // 기본 60초 타임아웃
      maxRedirects: 5,
    }),
  ],
  controllers: [MusicController],
  providers: [MusicService],
})
export class MusicModule {}