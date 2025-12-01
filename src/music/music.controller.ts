import { Controller, Post, UploadedFile, UseInterceptors, Body, Res, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MusicService } from './music.service';
import * as express from 'express';;

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  // 1. 음원 분리 API
  @Post('separate')
  @UseInterceptors(FileInterceptor('file'))
  async separateMusic(@UploadedFile() file: Express.Multer.File, @Res() res: express.Response) {
    if (!file) throw new HttpException('파일이 없습니다.', HttpStatus.BAD_REQUEST);

    // AI 서버에서 받은 ZIP 데이터를 클라이언트에 스트림으로 전송
    const zipBuffer = await this.musicService.separateMusic(file);
    
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="separated_${file.originalname}.zip"`,
    });
    res.send(zipBuffer);
  }

  // 2. 음악 추천 API (핵심 기능)
  @Post('recommend')
  @UseInterceptors(FileInterceptor('stemFile'))
  async recommendMusic(@UploadedFile() stemFile: Express.Multer.File) {
    if (!stemFile) throw new HttpException('파일이 없습니다.', HttpStatus.BAD_REQUEST);

    // 1단계: AI 서버를 통해 입력 파일의 특징 벡터 추출
    const inputVector = await this.musicService.extractVector(stemFile);

    // 2단계: DB에서 유사한 음악 검색 및 결과 반환
    return await this.musicService.findSimilarMusic(inputVector);
  }

  // 3. 음악 등록 API (관리자/테스트 데이터 추가용)
  // Postman으로 { "title": "Dynamite", "artist": "BTS", "youtubeVideoId": "...", ... } 등을 보냄
  @Post('register')
  async registerMusic(@Body() body: any) {
    return await this.musicService.registerMusic(body);
  }
}