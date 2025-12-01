import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MusicModule } from './music/music.module';
import { Music } from './music/music.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mariadb',
      host: 'localhost',
      port: 3306,
      username: 'dbid25xxx',  // 🚨 팀 계정 ID로 수정
      password: 'dbpass25xxx', // 🚨 팀 계정 암호로 수정
      database: 'db25xxx',    // 🚨 팀 DB명으로 수정
      entities: [Music],
      synchronize: true, // 개발용 (테이블 자동 생성)
    }),
    MusicModule,
  ],
})
export class AppModule {}