import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  statusCode: number;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const statusCode = context.switchToHttp().getResponse().statusCode;

    // next.handle() trả về một RxJS Observable chứa dữ liệu từ Controller trả về
    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: statusCode,
        data: data, // Dữ liệu gốc từ Controller được bọc vào thuộc tính "data"
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
