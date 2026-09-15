import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable, tap } from 'rxjs';

@Injectable()
export class GqlLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('GraphQL');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const gqlCtx = GqlExecutionContext.create(context);
    const info = gqlCtx.getInfo();
    const correlationId =
      gqlCtx.getContext().req?.headers['x-correlation-id'] || 'N/A';
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `[${correlationId}] ${info.parentType.name} -> ${info.fieldName} (${Date.now() - now}ms)`,
        );
      }),
    );
  }
}
