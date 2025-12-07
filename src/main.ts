import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Global prefix 설정 (프론트엔드 요청 URL: /api/...)
  app.setGlobalPrefix('api');

  // CORS 설정 (프론트엔드와 연동을 위해)
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Vite 기본 포트
    credentials: true,
  });

  // 정적 파일 서빙 설정 (분리된 음원 파일만 서빙)
  // 원본 업로드 파일은 AI 처리 후 삭제되므로 서빙 불필요
  const uploadPath = process.env.UPLOAD_PATH || './uploads';
  app.useStaticAssets(join(process.cwd(), uploadPath, 'separated'), {
    prefix: '/music/separated/',
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 65041;
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();