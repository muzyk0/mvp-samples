import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export type CorsOriginDelegate = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => void;

export function createCorsOriginDelegate(
  allowedOrigins: string[],
  logger: Pick<Logger, 'warn'>,
): CorsOriginDelegate {
  return (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    logger.warn(`Rejected CORS request from origin: ${origin}`);
    callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
  };
}

export async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    logger.warn(
      'ALLOWED_ORIGINS is empty. Browser requests with an Origin header will be rejected while non-browser requests without Origin remain allowed.',
    );
  } else {
    logger.log(`Configured CORS origins: ${allowedOrigins.join(', ')}`);
  }

  app.enableCors({
    origin: createCorsOriginDelegate(allowedOrigins, logger),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`Приложение запущено на порту ${port}`);
  logger.log(`Эндпоинт экспорта: http://localhost:${port}/export`);
}

if (require.main === module) {
  void bootstrap();
}
