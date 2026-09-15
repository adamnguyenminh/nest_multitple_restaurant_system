import { ObjectType, Field, InputType } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
} from 'class-validator';

@ObjectType()
export class UserType {
  @Field() id: number;
  @Field() email: string;
  @Field() role: string;
}

@ObjectType()
export class AuthPayload {
  @Field() accessToken: string;
  @Field() refreshToken: string;
  @Field(() => UserType) user: UserType;
}

@InputType()
export class LoginInput {
  @Field()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @Field()
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  pass: string;
}

@InputType()
export class SignUpInput {
  @Field()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @Field()
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @Field({ nullable: true, defaultValue: 'user' })
  @IsOptional()
  @IsString()
  role?: string;
}
