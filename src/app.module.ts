import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MusicModule } from './music/music.module';
import { Music } from './music/music.entity';
import { HistoryModule } from './history/history.module';
import { History } from './history/history.entity';
import { UserModule } from './user/user.module';
import { User } from './user/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mariadb',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: parseInt(config.get<string>('DB_PORT', '3306'), 10),
        username: config.get<string>('DB_USERNAME', 'dbid25xxx'),
        password: config.get<string>('DB_PASSWORD', 'dbpass25xxx'),
        database: config.get<string>('DB_DATABASE', 'db25xxx'),
        entities: [Music, User, History],
        synchronize: config.get<string>('DB_SYNC', 'true') === 'true',
      }),
    }),
    MusicModule,
    HistoryModule,
    UserModule,
  ],
})
export class AppModule {}