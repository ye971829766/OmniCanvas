import { Controller, Get, Post, Body } from "@nestjs/common";
import { TokensService } from "./tokens.service";
import type { SystemTokenStats, RecordTokenPayload } from "./tokens.service";

@Controller()
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get("admin/token-stats")
  getTokenStats(): SystemTokenStats {
    return this.tokensService.getTokenStats();
  }

  @Get("tokens/stats")
  getUserTokenStats(): SystemTokenStats {
    return this.tokensService.getTokenStats();
  }

  @Post("tokens/log")
  recordUsage(@Body() body: RecordTokenPayload) {
    this.tokensService.recordTokenUsage(body);
    return { success: true };
  }
}
