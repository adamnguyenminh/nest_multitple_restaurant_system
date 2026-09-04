import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Decorator @Catch() không truyền tham số để bắt TẤT CẢ các loại lỗi
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 1. Xác định HTTP Status Code & Error Message
    let status: number;
    let message: string | object;
    let errorCode = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Nếu lỗi từ Class-Validator (DTO), exceptionResponse sẽ là 1 object chứa message dạng array
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || exceptionResponse;
        errorCode = (exceptionResponse as any).error || 'BAD_REQUEST';
      } else {
        message = exceptionResponse;
      }
    } else {
      // Các lỗi không dự đoán trước được (Crash code, DB Connection, Null pointer...)
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Đã có lỗi hệ thống xảy ra, vui lòng thử lại sau';
      errorCode = 'SYSTEM_ERROR';

      // Log chi tiết lỗi 500 ra Console/Log file để Dev debug
      this.logger.error(
        `[Unhandled Exception] ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // 2. Lấy Correlation ID (nếu đã tạo từ Middleware ở các bài trước)
    const correlationId = request.headers['x-correlation-id'] || 'N/A';

    // 3. Chuẩn hóa Payload lỗi trả về cho Client
    const errorResponse = {
      success: false,
      statusCode: status,
      errorCode,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    // 4. Trả về cho Client
    response.status(status).json(errorResponse);
  }
}
