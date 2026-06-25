import { IsArray, IsOptional, IsObject } from "class-validator";

export class UpdateModelConfigDto {
  @IsOptional()
  @IsArray()
  mappings?: unknown[];

  @IsOptional()
  @IsArray()
  imageConfigs?: unknown[];

  @IsOptional()
  @IsObject()
  dictionaries?: {
    sizes?: string[];
    aspectRatios?: string[];
    qualities?: string[];
  };

  @IsOptional()
  @IsObject()
  agentConfig?: {
    systemPrompt?: string;
    chatModel?: string;
    visionModel?: string;
  };
}
