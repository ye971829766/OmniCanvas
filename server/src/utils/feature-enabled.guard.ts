import {
  CanActivate,
  mixin,
  ServiceUnavailableException,
  type Type,
} from "@nestjs/common";

export function FeatureEnabledGuard(
  isEnabled: () => boolean,
  message: string,
): Type<CanActivate> {
  class MixinGuard implements CanActivate {
    canActivate(): boolean {
      if (!isEnabled()) {
        throw new ServiceUnavailableException(message);
      }
      return true;
    }
  }
  return mixin(MixinGuard);
}
