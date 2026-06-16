import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ChannelsService } from "./channels.service";
import type { Channel } from "./channels.service";
import { CreateChannelDto } from "./dto/create-channel.dto";
import { UpdateChannelDto } from "./dto/update-channel.dto";

@Controller("channels")
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  async getAll(): Promise<Channel[]> {
    return this.channelsService.getAll();
  }


  @Post()
  async create(@Body() body: CreateChannelDto): Promise<Channel> {
    return this.channelsService.create(body);
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateChannelDto,
  ): Promise<Channel> {
    return this.channelsService.update(id, body);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string): Promise<void> {
    return this.channelsService.delete(id);
  }

  @Post(":id/test")
  async testConnection(
    @Param("id") id: string,
  ): Promise<{ success: boolean; latency: number; error?: string }> {
    return this.channelsService.testConnection(id);
  }

  @Post("discover-models")
  async discoverModelsWithParams(
    @Body() body: { baseUrl: string; apiKey: string },
  ): Promise<{ success: boolean; models: string[]; error?: string }> {
    return this.channelsService.discoverModelsWithCredentials(body.baseUrl, body.apiKey);
  }

  @Get(":id/discover-models")
  async discoverChannelModels(
    @Param("id") id: string,
  ): Promise<{ success: boolean; models: string[]; error?: string }> {
    return this.channelsService.discoverModels(id);
  }
}
