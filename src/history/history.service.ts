import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { History } from './history.entity';
import { User } from '../user/user.entity';

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(History)
    private readonly historyRepository: Repository<History>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createHistory(params: {
    userId: number;
    youtubeUrl: string;
    instrument: string;
    startSec: number;
    endSec: number;
    recommendedMusic: any[];
  }) {
    const user = await this.userRepository.findOne({
      where: { id: params.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const history = this.historyRepository.create({
      userId: params.userId,
      user: user,
      youtubeUrl: params.youtubeUrl,
      instrument: params.instrument,
      startSec: params.startSec,
      endSec: params.endSec,
      recommendedMusic: params.recommendedMusic,
    });
    return this.historyRepository.save(history);
  }

  findByUserId(userId: number) {
    return this.historyRepository.find({
      where: { userId },
      order: { date: 'DESC' },
    });
  }
}
