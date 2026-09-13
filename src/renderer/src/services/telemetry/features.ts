import { telemetry } from './client'

export const captureFeatureUsed = (
  feature: string,
  action: string,
  value?: string | number | boolean,
): void => telemetry.capture('feature_used', { feature, action, value })
