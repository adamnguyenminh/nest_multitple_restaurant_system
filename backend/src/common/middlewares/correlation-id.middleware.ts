// correlation-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Nếu request gửi lên đã có correlation-id thì lấy, chưa có thì sinh mới
    const correlationId =
      (req.headers['x-correlation-id'] as string) || uuidv4();

    // Gắn ngược lại vào header của req và res
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    console.log(req.body);

    console.log(
      `[Middleware] [${correlationId}] Incoming Request: ${req.method} ${req.url}`,
    );
    next(); // Chuyển giao Request sang tầng Guard
  }
}
