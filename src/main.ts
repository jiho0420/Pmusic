import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 🚨 팀에 할당된 포트 번호로 수정 (예: 60008)
  await app.listen(60008); 
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();