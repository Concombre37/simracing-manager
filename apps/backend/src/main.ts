import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN') ?? '*',
    credentials: true,
  });

  // 'tablet-menu' exclue : servie par TabletMenuHtmlController, en dehors
  // du préfixe /api comme le reste du frontend statique.
  app.setGlobalPrefix('api', { exclude: ['tablet-menu'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SimRacing Manager API')
    .setDescription('Backend API and agent gateway documentation')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('PORT') ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`Application listening on port ${port}`);
}

bootstrap();
