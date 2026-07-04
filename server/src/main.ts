import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import { json, urlencoded } from "express";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase payload limit for base64 image uploads
  app.use(json({ limit: "50mb" }));
  app.use(urlencoded({ extended: true, limit: "50mb" }));

  // Enable CORS with security restrictions
  const corsOrigin = process.env.CORS_ORIGIN;
  // const origins = corsOrigin
  //   ? corsOrigin.split(',').map((o) => o.trim())
  //   : ['http://localhost:5173', 'http://localhost:5174'];

  app.enableCors({
    origin: "*",
    credentials: true,
  });

  // Validate DTOs globally — whitelist strips unknown fields (prevents id/createdAt injection)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Use global exception filter for compatible error formatting
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Server running at http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error("Failed to bootstrap NestJS server:", err);
});
