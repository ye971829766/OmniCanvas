import { CanActivate, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { isAgentEnabled } from "./agent-enabled";

@Injectable()
export class AgentEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (!isAgentEnabled()) {
      throw new ServiceUnavailableException("Agent 功能已关闭");
    }
    return true;
  }
}
