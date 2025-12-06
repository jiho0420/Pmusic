import { Controller, Post, UploadedFile, UseInterceptors, Body, Res, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { MusicService } from './music.service';
import * as express from 'express';

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  // 1. 음원 분리 API
  // 분리된 음원 파일들을 개별적으로 접근 가능한 URL과 함께 반환
  @Post('separate')
  @UseInterceptors(FileInterceptor('file'))
  async separateMusic(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new HttpException('파일이 없습니다.', HttpStatus.BAD_REQUEST);

    // AI 서버에서 ZIP 받아서 풀고, 개별 파일 정보 반환
    const result = await this.musicService.separateMusic(file);
    
    return {
      status: 'success',
      files: result.files, // 각 파트별 파일 정보 (name, url, type)
    };
  }

  // 2. 음악 추천 API (핵심 기능)
  // 사용자가 선택한 파트(드럼, 보컬 등)와 유사한 노래를 AI 서버에서 추천받음
  @Post('recommend')
  @UseInterceptors(
    FileInterceptor('audioFile', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = process.env.UPLOAD_PATH || './uploads';
          if (!existsSync(uploadDir)) {
            mkdirSync(uploadDir, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const name = file.originalname.replace(ext, '');
          cb(null, `${name}-${uniqueSuffix}${ext}`);
        },
      }),
    }),
  )
  async recommendMusic(
    @UploadedFile() audioFile: Express.Multer.File,
    @Body() body: {
      userId?: number;
      instrument: string; // 'drums', 'vocals', 'bass', 'other' 등
      startSec: number; // 시작 시간 (초)
      endSec: number; // 종료 시간 (초)
    },
  ) {
    if (!audioFile) {
      throw new HttpException('파일이 없습니다.', HttpStatus.BAD_REQUEST);
    }

    if (!body.instrument || body.startSec === undefined || body.endSec === undefined) {
      throw new HttpException(
        '악기 이름, 시작 시간, 종료 시간이 필요합니다.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 1단계: AI 서버로 오디오 파일, 악기, 시간 정보 전송하여 추천 받기
    const aiResults = await this.musicService.getRecommendationsFromAI({
      file: audioFile,
      instrument: body.instrument,
      startSec: body.startSec,
      endSec: body.endSec,
    });

    // 2단계: AI 서버 결과를 DB Music 정보와 결합하여 풍부한 정보 제공
    const enrichedResults = await this.musicService.enrichRecommendationsWithMusicInfo(
      aiResults,
    );

    // 3단계: 히스토리 자동 저장 (userId가 제공된 경우)
    if (body.userId) {
      await this.musicService.saveRecommendationHistory({
        userId: body.userId,
        filePath: audioFile.path, // 저장된 파일 경로
        recommendedMusic: enrichedResults,
      });
    }

    return {
      status: 'success',
      results: enrichedResults,
    };
  }

  // 3. 음악 등록 API (관리자/테스트 데이터 추가용)
  // Postman으로 { "title": "Dynamite", "artist": "BTS", "youtubeVideoId": "...", ... } 등을 보냄
  @Post('register')
  async registerMusic(@Body() body: any) {
    return await this.musicService.registerMusic(body);
  }
}