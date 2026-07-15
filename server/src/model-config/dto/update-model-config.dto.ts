import { IsArray, IsOptional, IsObject } from "class-validator";

export class UpdateModelConfigDto {
  @IsOptional()
  @IsArray()
  mappings?: unknown[];

  @IsOptional()
  @IsArray()
  imageConfigs?: unknown[];

  @IsOptional()
  @IsArray()
  videoConfigs?: unknown[];

  /** Reusable model logo assets used by the Models page picker. */
  @IsOptional()
  @IsArray()
  logoLibrary?: unknown[];

  @IsOptional()
  @IsObject()
  dictionaries?: {
    sizes?: string[];
    aspectRatios?: string[];
    qualities?: string[];
    videoSizes?: string[];
  };

  @IsOptional()
  @IsObject()
  agentConfig?: {
    systemPrompt?: string;
    chatModel?: string;
    visionModel?: string;
    /** Default image generation model (绘画模型). Empty = first enabled image mapping. */
    imageModel?: string;
    inpaintModel?: string;
  };
}
