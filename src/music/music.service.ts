import { Injectable, HttpException, HttpStatus, Inject, forwardRef, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { createReadStream, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import AdmZip from 'adm-zip';
import { Music } from './music.entity';
import { HistoryService } from '../history/history.service';

@Injectable()
export class MusicService {
  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Music)
    private readonly musicRepository: Repository<Music>,
    @Inject(forwardRef(() => HistoryService))
    private readonly historyService: HistoryService,
  ) {}

  // 사설 클라우드 AI 서버 주소 (환경변수 또는 하드코딩)
  // 기본값은 AI 서버 README에 따르면 포트 8080 사용
  private readonly AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8080';
  private readonly BASE_URL = process.env.BASE_URL || 'http://localhost:65041';

  // iTunes API 캐싱 (메모리 캐시, TTL: 1시간)
  private readonly albumCoverCache = new Map<string, { url: string; expiry: number }>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1시간

  // --- [기능 1] 음원 분리 (AI 서버 연동) ---
  // ZIP 파일을 받아서 풀고, 개별 파트 파일 정보 반환 (프론트엔드에서 직접 재생 가능하도록)
  // 원본 파일은 처리 후 삭제하여 디스크 공간 절약
  async separateMusic(file: Express.Multer.File): Promise<{
    files: Array<{ name: string; url: string; type: string }>;
  }> {
    // 파일 유효성 검사
    if (!file || !file.path) {
      throw new BadRequestException('유효한 파일이 필요합니다.');
    }

    const formData = new FormData();
    formData.append('file', createReadStream(file.path), file.originalname);
    formData.append('model', 'htdemucs'); 

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.AI_SERVER_URL}/separate`, formData, {
          headers: formData.getHeaders(),
          responseType: 'arraybuffer', // ZIP 파일 바이너리 수신
          timeout: 600000, // 10분 (분리 작업은 오래 걸림)
        }),
      );

      // ZIP 파일 압축 해제
      const zip = new AdmZip(Buffer.from(response.data));
      const uploadDir = process.env.UPLOAD_PATH || './uploads';
      const separatedDir = join(uploadDir, 'separated');
      
      // 분리된 파일 저장 디렉토리 생성
      if (!existsSync(separatedDir)) {
        mkdirSync(separatedDir, { recursive: true });
      }

      // ZIP 파일 내의 각 파일 추출
      const zipEntries = zip.getEntries();
      const fileInfos: Array<{ name: string; url: string; type: string }> = [];

      for (const entry of zipEntries) {
        if (!entry.isDirectory) {
          // 파일명에서 파트 타입 추출 (예: "song_drums.wav" -> "drums")
          const fileName = entry.entryName;
          const fileExt = extname(fileName);
          const baseName = fileName.replace(fileExt, '');
          
          // 파트 타입 추출
          const partType = this.extractPartType(baseName);

          // 파일 저장
          const fileBuffer = entry.getData();
          const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const savedFileName = `${baseName}-${uniqueId}${fileExt}`;
          const savedPath = join(separatedDir, savedFileName);
          
          writeFileSync(savedPath, fileBuffer);

          // 접근 가능한 URL 생성
          const fileUrl = `${this.BASE_URL}/music/separated/${savedFileName}`;
          
          fileInfos.push({
            name: fileName,
            url: fileUrl,
            type: partType,
          });
        }
      }

      return { files: fileInfos };
    } catch (error) {
      console.error('AI Separation Failed:', error.message);
      throw new HttpException('AI 서버 음원 분리 실패', HttpStatus.BAD_GATEWAY);
    } finally {
      // 원본 파일 삭제 (디스크 공간 절약)
      this.deleteFileIfExists(file.path);
    }
  }

  // [보조] 파일명에서 파트 타입 추출
  private extractPartType(baseName: string): string {
    const lowerName = baseName.toLowerCase();
    if (lowerName.includes('drums') || lowerName.includes('drum')) return 'drums';
    if (lowerName.includes('vocals') || lowerName.includes('vocal')) return 'vocals';
    if (lowerName.includes('bass')) return 'bass';
    if (lowerName.includes('piano')) return 'piano';
    if (lowerName.includes('guitar')) return 'guitar';
    return 'other';
  }

  // --- [기능 2] AI 서버로부터 유사한 음악 추천 받기 ---
  // AI 서버에 오디오 파일, 악기 이름, 시작/종료 시간을 전송하여 추천 받음
  // 원본 파일은 처리 후 삭제하여 디스크 공간 절약
  async getRecommendationsFromAI(params: {
    file: Express.Multer.File;
    instrument: string;
    startSec: number;
    endSec: number;
  }): Promise<any[]> {
    // 파일 유효성 검사
    if (!params.file || !params.file.path) {
      throw new BadRequestException('유효한 파일이 필요합니다.');
    }

    const formData = new FormData();
    formData.append('file', createReadStream(params.file.path), params.file.originalname);
    formData.append('instrument', params.instrument);
    formData.append('start_sec', params.startSec.toString());
    formData.append('end_sec', params.endSec.toString());

    try {
      // AI 서버의 추천 API 호출
      // 입력: 오디오 파일, 악기 이름, 시작 시간, 종료 시간
      // 출력: 유사한 음악 리스트 top_k = 5
      const response = await firstValueFrom(
        this.httpService.post(`${this.AI_SERVER_URL}/recommend`, formData, {
          headers: formData.getHeaders(),
          timeout: 30000, // 30초 타임아웃
        }),
      );
      
      // AI 서버 응답 형식: { "status": "success", "results": [...] }
      if (response.data.status === 'success' && response.data.results) {
        return response.data.results;
      }
      
      throw new Error('AI 서버 응답 형식이 올바르지 않습니다.');
    } catch (error) {
      console.error('AI 서버 추천 실패:', error.message);
      throw new HttpException(
        `AI 서버 추천 실패: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      // 원본 파일 삭제 (디스크 공간 절약)
      this.deleteFileIfExists(params.file.path);
    }
  }

  // --- [기능 3] AI 서버 추천 결과를 DB Music 정보와 결합 ---
  // AI 서버는 similarity를 직접 반환 (코사인 유사도, 0~1)
  async enrichRecommendationsWithMusicInfo(aiResults: any[]): Promise<any[]> {
    const enrichedResults: any[] = [];

    for (const result of aiResults) {
      // AI 서버가 반환한 song_name으로 DB에서 음악 정보 조회
      // song_name 형식이 "제목 - 아티스트" 또는 "제목"일 수 있음
      const songName = result.song_name || '';
      const [title, artist] = songName.split(' - ').map((s: string) => s.trim());

      const similarity = result.similarity ?? (result.distance ? 1 - result.distance : 0);

      let musicInfo: Music | null = null;
      if (title) {
        // 제목으로 검색
        musicInfo = await this.musicRepository.findOne({
          where: { title },
        });
        
        // 제목만으로 못 찾으면 아티스트도 함께 검색
        if (!musicInfo && artist) {
          musicInfo = await this.musicRepository.findOne({
            where: { title, artist },
          });
        }
      }

      // 공통 기본 정보
      const baseResult = {
        id: result.id,
        similarity, // AI 서버에서 직접 받은 유사도 사용
        songName: result.song_name,
        instrument: result.instrument,
        startSec: result.start_sec,
        endSec: result.end_sec,
      };

      // DB에 없는 경우 iTunes API로 정보 가져오기 (캐싱 적용)
      if (!musicInfo && title) {
        const albumCoverUrl = await this.fetchAlbumCoverFromItunes(title, artist || '');
        
        enrichedResults.push({
          ...baseResult,
          title,
          artist: artist || 'Unknown',
          albumCoverUrl,
          youtubeVideoId: null,
        });
      } else if (musicInfo) {
        // DB에 있는 경우 기존 정보 사용
        enrichedResults.push({
          ...baseResult,
          title: musicInfo.title,
          artist: musicInfo.artist,
          albumCoverUrl: musicInfo.albumCoverUrl || '',
          youtubeVideoId: musicInfo.youtubeVideoId,
          youtubeStartTime: musicInfo.youtubeStartTime,
        });
      } else {
        // 정보를 찾을 수 없는 경우 기본 정보만 반환
        enrichedResults.push({
          ...baseResult,
          title: songName,
          artist: 'Unknown',
        });
      }
    }

    return enrichedResults;
  }

  // [보조] iTunes Search API + 메모리 캐싱
  async fetchAlbumCoverFromItunes(title: string, artist: string): Promise<string> {
    const cacheKey = `${title}|${artist}`.toLowerCase();
    
    // 캐시에서 먼저 확인
    const cached = this.albumCoverCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.url;
    }

    try {
      const term = encodeURIComponent(`${title} ${artist}`);
      const url = `https://itunes.apple.com/search?term=${term}&media=music&limit=1`;
      
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 5000 }), // 타임아웃 추가
      );
      
      let albumCoverUrl = '';
      if (response.data.resultCount > 0) {
        // 100x100 저화질을 600x600 고화질로 변환
        albumCoverUrl = response.data.results[0].artworkUrl100.replace('100x100', '600x600');
      }

      // 캐시에 저장 (결과가 없어도 캐싱하여 반복 호출 방지)
      this.albumCoverCache.set(cacheKey, {
        url: albumCoverUrl,
        expiry: Date.now() + this.CACHE_TTL,
      });

      return albumCoverUrl;
    } catch (e) {
      console.error('iTunes API Error:', e.message);
      return '';
    }
  }

  // [보조] 코사인 유사도 수학 공식
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return magA && magB ? dotProduct / (magA * magB) : 0;
  }

  // [보조] 음악 데이터 등록
  async registerMusic(data: Partial<Music>) {
    if (!data.title) {
      throw new BadRequestException('제목은 필수입니다.');
    }
    return this.musicRepository.save(data);
  }

  // [보조] 추천 히스토리 저장
  // 파일은 저장하지 않고, 원본 파일명과 악기 정보만 기록
  async saveRecommendationHistory(params: {
    userId: number;
    originalFileName: string;
    instrument: string;
    recommendedMusic: any[];
  }) {
    // 파일명과 악기 정보를 조합하여 저장 (참고용 정보)
    const audioInfo = `${params.originalFileName} (${params.instrument})`;

    return this.historyService.createHistory({
      userId: params.userId,
      userUploadedAudio: audioInfo, // 파일명과 악기 정보만 저장
      recommendedMusic: params.recommendedMusic,
    });
  }

  // [보조] 파일 삭제 (존재하는 경우에만)
  private deleteFileIfExists(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`파일 삭제 실패: ${filePath}`, error.message);
    }
  }
}