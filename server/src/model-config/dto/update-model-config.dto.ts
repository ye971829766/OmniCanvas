import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

export class UpdateModelConfigDto {
  @IsOptional()
  @IsArray()
  mappings?: unknown[];
}
