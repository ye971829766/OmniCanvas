import {
  IsString,
  IsUrl,
  IsIn,
  IsArray,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  MinLength,
  ArrayMinSize,
} from "class-validator";

export class CreateChannelDto {
  @IsString()
  @MinLength(1, { message: "渠道名称不能为空" })
  name!: string;

  @IsUrl(
    { require_protocol: true, protocols: ["http", "https"] },
    { message: "接口地址必须是有效的 HTTP/HTTPS URL" },
  )
  baseUrl!: string;

  @IsString()
  @MinLength(3, { message: "API Key 长度不能少于 3 位" })
  apiKey!: string;

  @IsIn(["all", "chat", "image", "video"], {
    message: "渠道类型必须是 all, chat, image 或 video",
  })
  type!: "image" | "chat" | "video" | "all";

  @IsArray()
  @ArrayMinSize(1, { message: "至少需要指定一个支持的模型" })
  @IsString({ each: true })
  models!: string[];

  @IsNumber({}, { message: "权重必须是数字" })
  @Min(1, { message: "权重不能小于 1" })
  @Max(100, { message: "权重不能大于 100" })
  weight!: number;

  @IsBoolean()
  status!: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
