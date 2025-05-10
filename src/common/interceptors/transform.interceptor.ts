import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  timestamp: string;
  path: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  private readonly logger = new Logger(TransformInterceptor.name);

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const { url } = request;

    return next.handle().pipe(
      map(data => {
        const response = {
          data,
          timestamp: new Date().toISOString(),
          path: url,
        };

        this.logger.debug(
          `Response for ${request.method} ${url}`,
          JSON.stringify(response),
        );

        return response;
      }),
    );
  }
} 