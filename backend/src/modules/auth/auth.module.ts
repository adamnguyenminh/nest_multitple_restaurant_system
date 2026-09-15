import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { EntityRegistry } from '../../core/database/entity_registry.service';
import { User } from '../users/entities/user.entity';

// Module tự đăng ký Table entity vào Registry
EntityRegistry.register([User]);

@Module({
  imports: [UsersModule, JwtModule],
  providers: [AuthResolver, AuthService],
})
export class AuthModule {}
