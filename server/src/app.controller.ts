import { Controller, Get, Header } from '@nestjs/common';
import { getFeatureFlags } from './utils/feature-flags';

@Controller()
export class AppController {
  @Get()
  getHello() {
    return {
      message: "ok",
    };
  }

  @Get('features')
  @Header('Cache-Control', 'no-store')
  getFeatures() {
    return getFeatureFlags();
  }
}
