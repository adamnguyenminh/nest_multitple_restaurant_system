import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, map } from 'rxjs/operators';

@Injectable()
export class AuditAndTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const correlationId = request.headers['x-correlation-id'];
    const userId = request.user?.id;
    const startTime = Date.now();

    console.log(
      `[Interceptor Pre] [${correlationId}] User ${userId} đang thực thi Action...`,
    );

    return next.handle().pipe(
      // 1. Post-controller (Xử lý tác vụ phụ: Log Audit Trail)
      tap(() => {
        const executionTime = Date.now() - startTime;
        console.log(
          `[Interceptor Post] [${correlationId}] Xử lý xong trong ${executionTime}ms. Ghi nhận Audit Log vào Database...`,
        );
      }),
      // 2. Post-controller (Biến đổi Response đầu ra chuẩn chỉnh)[cite: 1]
      map((resultData) => ({
        success: true,
        meta: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
        data: resultData,
      })),
    );
  }
}
