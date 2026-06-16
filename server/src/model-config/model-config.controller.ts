import { Body, Controller, Get, Put } from "@nestjs/common";
import { ModelConfigService } from "./model-config.service";
import type { ModelConfigState } from "./model-config.service";
import { UpdateModelConfigDto } from "./dto/update-model-config.dto";

@Controller("model-config")
export class ModelConfigController {
  constructor(private readonly modelConfigService: ModelConfigService) {}

  @Get()
  getConfig(): Promise<ModelConfigState> {
    return this.modelConfigService.getConfig();
  }

  @Put()
  updateConfig(@Body() body: UpdateModelConfigDto): Promise<ModelConfigState> {
    return this.modelConfigService.updateConfig(body);
  }
}
