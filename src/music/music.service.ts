import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import { Music } from './music.entity';

@Injectable()
export class MusicService {
  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Music)
    private readonly musicRepository: Repository<Music>,
  ) {}

  // 사설 클라우드 AI 서버 주소 (환경변수 또는 하드코딩)
  private readonly AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:8000';

  // --- [기능 1] 음원 분리 (AI 서버 연동) ---
  async separateMusic(file: Express.Multer.File): Promise<Buffer> {
    const formData = new FormData();
    formData.append('file', file.buffer, file.originalname);
    formData.append('model', 'htdemucs'); 

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.AI_SERVER_URL}/separate`, formData, {
          headers: formData.getHeaders(),
          responseType: 'arraybuffer', // ZIP 파일 바이너리 수신
          timeout: 600000, // 10분 (분리 작업은 오래 걸림)
        }),
      );
      return response.data;
    } catch (error) {
      console.error('AI Separation Failed:', error.message);
      throw new HttpException('AI 서버 음원 분리 실패', HttpStatus.BAD_GATEWAY);
    }
  }

  // --- [기능 2] 벡터 추출 (AI 서버 연동 + 안전장치) ---
  async extractVector(file: Express.Multer.File): Promise<number[]> {
    const formData = new FormData();
    formData.append('file', file.buffer, file.originalname);

    try {
      // AI 서버의 /embedding API 호출
      const response = await firstValueFrom(
        this.httpService.post(`${this.AI_SERVER_URL}/embedding`, formData, {
          headers: formData.getHeaders(),
          timeout: 10000, // 10초
        }),
      );
      return response.data.vector;
    } catch (error) {
      console.warn('⚠️ AI 서버 연결 실패 또는 API 미구현. (테스트용 랜덤 벡터 사용)');
      // AI 서버 개발이 덜 되었어도 프론트 개발을 위해 랜덤 벡터 반환 (나중에 제거)
      return Array.from({ length: 128 }, () => Math.random());
    }
  }

  // --- [기능 3] 유사도 검색 및 정보 조합 ---
  async findSimilarMusic(inputVector: number[]) {
    // 1. 모든 음악 데이터 조회
    const allMusic = await this.musicRepository.find();
    
    // 2. 코사인 유사도 계산
    const results = allMusic.map(music => {
      if (!music.featureVector) return { ...music, similarity: 0 };
      const similarity = this.cosineSimilarity(inputVector, music.featureVector);
      return { ...music, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity) // 유사도 높은 순 정렬
    .slice(0, 5); // 상위 5개 선택

    // 3. 앨범 커버 채우기 (Lazy Loading)
    for (const music of results) {
      if (!music.albumCoverUrl) {
        // DB에 없으면 iTunes API로 검색
        music.albumCoverUrl = await this.fetchAlbumCoverFromItunes(music.title, music.artist);
        // 찾은 URL을 DB에 저장 (다음엔 바로 씀)
        await this.musicRepository.update(music.id, { albumCoverUrl: music.albumCoverUrl });
      }
    }

    return results;
  }

  // [보조] iTunes Search API (무료, 인증 불필요)
  async fetchAlbumCoverFromItunes(title: string, artist: string): Promise<string> {
    try {
      const term = encodeURIComponent(`${title} ${artist}`);
      const url = `https://itunes.apple.com/search?term=${term}&media=music&limit=1`;
      
      const response = await firstValueFrom(this.httpService.get(url));
      
      if (response.data.resultCount > 0) {
        // 100x100 저화질을 600x600 고화질로 변환
        return response.data.results[0].artworkUrl100.replace('100x100', '600x600');
      }
      return ''; // 검색 결과 없음
    } catch (e) {
      console.error('iTunes API Error:', e.message);
      return ''; // 검색 결과 없음
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
    return this.musicRepository.save(data);
  }
}