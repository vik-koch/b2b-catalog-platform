import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { AppService } from './app.service';
import { helloWorldContract } from '@b2b-catalog-platform/shared';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @TsRestHandler(helloWorldContract.getHelloWorld)
  async getData() {
    return tsRestHandler(helloWorldContract.getHelloWorld, async () => {
      return { status: 200, body: await this.appService.getData() };
    });
  }
}
