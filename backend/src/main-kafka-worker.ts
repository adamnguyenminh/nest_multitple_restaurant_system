import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
        },
        consumer: {
          groupId: 'inventory-service-group',
        },
        subscribe: {
          fromBeginning: false, // Tránh consume lại các message rác từ offset 0
        },
      },
    },
  );

  await app.listen();
  console.log('Kafka Consumer listening for CDC events...');
}
bootstrap().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});
