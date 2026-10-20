import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.ts';
import { configureApp, setupSwagger } from './app.setup.ts';
import { intEnv, loadEnv } from './config.ts';

async function bootstrap(): Promise<void> {
  loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1); // atrás do proxy do Render, para o limite de requisições usar o IP real
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
    }),
  );
  const origins = (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins.includes('*') ? true : origins, methods: ['GET'] });
  configureApp(app);
  setupSwagger(app);
  app.enableShutdownHooks();
  const port = intEnv('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API no ar: http://localhost:${port}/docs  (Swagger)  |  http://localhost:${port}/api/v1/health`);
}

bootstrap().catch((e) => {
  console.error('Falha ao iniciar a API:', e instanceof Error ? e.message : e);
  process.exit(1);
});
