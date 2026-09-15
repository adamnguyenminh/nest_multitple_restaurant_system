import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SignUpInput } from './dto/auth.types';
import { UserRepository } from '../users/users.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  // Luồng SignUp: Đăng ký và tự động cấp Token[cite: 3]
  async signUp(input: SignUpInput) {
    const existingUser = await this.userRepository.findOne({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictException('Email này đã được sử dụng'); // Bị bắt bởi GraphQLExceptionFilter
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    const newUser = this.userRepository.create({
      email: input.email,
      password: hashedPassword,
      role: input.role || 'user',
    });

    await this.userRepository.save(newUser);

    const tokens = await this.generateTokens(
      newUser.id,
      newUser.email,
      newUser.role,
    );
    await this.updateRefreshToken(newUser.id, tokens.refreshToken);

    return {
      ...tokens,
      user: newUser,
    };
  }

  async login(email: string, pass: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(pass, user.password))) {
      throw new UnauthorizedException('Thông tin đăng nhập không hợp lệ');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return { ...tokens, user };
  }

  async refreshTokens(userId: number, refreshToken: string) {
    // 1. Lấy thông tin user trong DB
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.hashedRefreshToken) {
      throw new ForbiddenException('Truy cập bị từ chối');
    }

    // 2. Verify JWT chữ ký và hạn dùng
    try {
      await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret_key',
      });
    } catch (error) {
      await this.userRepository.update(userId, { hashedRefreshToken: null });
      throw new ForbiddenException('Refresh Token không hợp lệ');
    }

    // 3. So sánh Token A với Hash trong DB
    const isMatch = await bcrypt.compare(refreshToken, user.hashedRefreshToken);
    if (!isMatch) {
      // Nếu không match -> Phát hiện dùng lại Token cũ -> Xóa session vĩnh viễn
      await this.userRepository.update(userId, { hashedRefreshToken: null });
      throw new ForbiddenException(
        'Refresh Token không hợp lệ hoặc đã bị vô hiệu hóa',
      );
    }

    // 4. Tạo bộ Token MỚI (Token B)
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    // 5. BẮT BUỘC: Đảm bảo AWAIT hoàn tất việc cập nhật Hash B vào DB
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return { ...tokens, user };
  }

  private async generateTokens(userId: number, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET || 'access_secret_key',
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'refresh_secret_key',
        expiresIn: '7d',
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<void> {
    const saltRounds = 10;
    const hash = await bcrypt.hash(refreshToken, saltRounds);

    // Thực hiện update và chờ DB ghi nhận
    const updateResult = await this.userRepository.update(userId, {
      hashedRefreshToken: hash,
    });

    if (updateResult.affected === 0) {
      throw new InternalServerErrorException(
        'Không thể cập nhật Refresh Token',
      );
    }
  }

  // Phương thức Logout để xóa Refresh Token
  async logout(userId: number) {
    await this.userRepository.update(userId, { hashedRefreshToken: null });
    return true;
  }
}
