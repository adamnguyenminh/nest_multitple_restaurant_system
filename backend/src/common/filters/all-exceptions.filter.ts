// src/common/filters/all-exceptions.filter.ts
import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlArgumentsHost } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    // 🟢 1. Kiểm tra xem Request có phải là GraphQL không
    if ((host.getType() as string) === 'graphql') {
      const gqlHost = GqlArgumentsHost.create(host);
      const req = gqlHost.getContext()?.req;
      const correlationId = req?.headers?.['x-correlation-id'] || 'N/A';

      const status =
        exception instanceof HttpException ? exception.getStatus() : 500;
      const message = exception.message || 'Lỗi hệ thống nội bộ';

      this.logger.error(
        `[GraphQL TraceID: ${correlationId}] ${status} - ${message}`,
      );

      // Trả về GraphQLError cho GraphQL Client
      return new GraphQLError(message, {
        extensions: {
          code: status,
          correlationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 🟢 2. Xử lý Request HTTP REST thông thường[cite: 1]
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Lỗi hệ thống nội bộ';

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request?.url,
      message,
    });
  }
}
