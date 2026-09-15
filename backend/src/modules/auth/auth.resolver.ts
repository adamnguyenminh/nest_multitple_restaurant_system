import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AuthPayload,
  SignUpInput,
  LoginInput,
  UserType,
} from './dto/auth.types';
import { GqlJwtAuthGuard } from './guards/gql-jwt.guard';
import { GqlRolesGuard } from './guards/gql-roles.guard';
import { Roles } from '../../common/decorator/roles.decorator';
import { CurrentUser } from '../../common/decorator/current-user.decorator';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => AuthPayload)
  async signUp(@Args('input') input: SignUpInput) {
    return this.authService.signUp(input);
  }

  @Mutation(() => AuthPayload)
  async login(@Args('input') input: LoginInput) {
    return this.authService.login(input.email, input.pass);
  }

  @Mutation(() => AuthPayload)
  async refreshToken(
    @Args('userId') userId: number,
    @Args('refreshToken') refreshToken: string,
  ) {
    return this.authService.refreshTokens(userId, refreshToken);
  }

  @Query(() => UserType)
  @UseGuards(GqlJwtAuthGuard)
  async me(@CurrentUser() user: any) {
    return user;
  }

  @Query(() => String)
  @UseGuards(GqlJwtAuthGuard, GqlRolesGuard)
  @Roles('admin')
  async adminOnlyData() {
    return 'Dữ liệu bảo mật chỉ dành cho Admin';
  }
}
