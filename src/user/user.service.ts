import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

// 비밀번호를 제외한 안전한 유저 정보 타입
type SafeUser = Omit<User, 'password'>;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(data: Pick<User, 'email' | 'password' | 'nickname'>): Promise<SafeUser> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = this.userRepository.create({
      ...data,
      password: hashedPassword,
    });
    const savedUser = await this.userRepository.save(user);
    
    // 비밀번호 제외하고 반환
    const { password: _, ...safeUser } = savedUser;
    return safeUser as SafeUser;
  }

  // 내부에서만 사용 (인증용) - 비밀번호 포함
  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  // ID로 유저 조회 (비밀번호 제외)
  async findOne(id: number): Promise<SafeUser | null> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) return null;
    
    const { password: _, ...safeUser } = user;
    return safeUser as SafeUser;
  }

  // 인증용 전체 유저 정보 조회 (내부 사용)
  findOneWithPassword(id: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }
}
