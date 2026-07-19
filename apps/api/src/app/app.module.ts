import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from '../db/database.module';
import { PageModule } from '../pages/page.module';

@Module({
  imports: [DatabaseModule, PageModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
