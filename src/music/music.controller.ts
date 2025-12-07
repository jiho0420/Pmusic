import { Controller, Post, UploadedFile, UseInterceptors, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { MusicService } from './music.service';
import * as os from 'os';

// Multer 디스크 저장 설정 (임시 디렉토리에 저장, AI 처리 후 삭제)
const tempDiskStorage = diskStorage({
  destination: (req, file, cb) => {
    const tempDir = os.tmpdir(); // OS 임시 디렉토리 사용
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    const name = file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  // 1. 음원 분리 API
  // 분리된 음원 파일들을 개별적으로 접근 가능한 URL과 함께 반환
  @Post('separate')
  @UseInterceptors(FileInterceptor('file', { storage: tempDiskStorage }))
  async separateMusic(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('파일이 없습니다.');
    }

    // AI 서버에서 ZIP 받아서 풀고, 개별 파일 정보 반환 (원본 파일은 처리 후 삭제됨)
    const result = await this.musicService.separateMusic(file);
    
    return {
      status: 'success',
      files: result.files, // 각 파트별 파일 정보 (name, url, type)
    };
  }

  // 2. 음악 추천 API (핵심 기능)
  // 프론트에서 원본 노래, 시간 정보, 악기, 유저ID를 보내면
  // 백엔드에서 노래를 자르고 AI 서버에서 추천받음
  // 비로그인 유저는 userId를 null/빈값으로 보내면 됨
  @Post('recommend')
  @UseInterceptors(FileInterceptor('audioFile', { storage: tempDiskStorage }))
  async recommendMusic(
    @UploadedFile() audioFile: Express.Multer.File,
    @Body() body: {
      userId?: string; // 로그인 유저: 숫자 문자열, 비로그인: null/빈값/'null'
      instrument: string; // 'drums', 'vocals', 'bass', 'other' 등
      startSec: string; // form-data에서는 문자열로 전달됨
      endSec: string; // form-data에서는 문자열로 전달됨
    },
  ) {
    // 파일 유효성 검사
    if (!audioFile) {
      throw new BadRequestException('파일이 없습니다.');
    }

    // 필수 파라미터 검증 및 타입 변환
    if (!body.instrument) {
      throw new BadRequestException('악기 이름(instrument)이 필요합니다.');
    }

    const startSec = parseFloat(body.startSec);
    const endSec = parseFloat(body.endSec);

    if (isNaN(startSec) || isNaN(endSec)) {
      throw new BadRequestException('시작 시간(startSec)과 종료 시간(endSec)이 필요합니다.');
    }

    if (startSec < 0 || endSec <= startSec) {
      throw new BadRequestException('유효한 시간 범위가 아닙니다. (startSec < endSec)');
    }

    // userId 처리: null, 빈문자열, 'null' 문자열 모두 비로그인으로 처리
    const isLoggedIn = body.userId && body.userId.trim() !== '' && body.userId.trim().toLowerCase() !== 'null';
    const userId = isLoggedIn ? parseInt(body.userId!, 10) : null;
    const validUserId = userId && !isNaN(userId) ? userId : null;

    // 1단계: 백엔드에서 오디오 파일 트리밍 (startSec ~ endSec 구간)
    const { trimmedFilePath, originalPath } = await this.musicService.trimAudio({
      file: audioFile,
      startSec,
      endSec,
    });

    // 2단계: 트리밍된 파일을 AI 서버로 전송하여 추천 받기
    // (트리밍된 파일과 원본 파일은 처리 후 삭제됨)
    const aiResults = await this.musicService.getRecommendationsFromAI({
      trimmedFilePath,
      originalFilePath: originalPath,
      originalFileName: audioFile.originalname,
      instrument: body.instrument,
    });

    // 3단계: AI 서버 결과를 DB Music 정보와 결합하여 풍부한 정보 제공
    const enrichedResults = await this.musicService.enrichRecommendationsWithMusicInfo(
      aiResults,
    );

    // 4단계: 히스토리 자동 저장 (로그인 유저만)
    if (validUserId) {
      await this.musicService.saveRecommendationHistory({
        userId: validUserId,
        originalFileName: audioFile.originalname,
        instrument: body.instrument,
        recommendedMusic: enrichedResults,
      });
    }

    return {
      status: 'success',
      isLoggedIn: !!validUserId, // 프론트에서 로그인 상태 확인 가능
      historySaved: !!validUserId, // 히스토리 저장 여부
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