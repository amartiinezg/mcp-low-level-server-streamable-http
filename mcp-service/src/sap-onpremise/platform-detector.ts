/**
 * Platform Detection Utility
 * Detects whether the application is running on Kyma or Cloud Foundry
 */

export type Platform = 'kyma' | 'cloudfoundry' | 'local';

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  // Cloud Foundry has VCAP_SERVICES environment variable
  if (process.env.VCAP_SERVICES) {
    return 'cloudfoundry';
  }

  // Kyma has Kubernetes service environment variables
  if (process.env.KUBERNETES_SERVICE_HOST) {
    return 'kyma';
  }

  // Default to local development
  return 'local';
}

/**
 * Get connectivity proxy URL based on platform
 */
export function getConnectivityProxyUrl(): string {
  const platform = detectPlatform();
  const envUrl = process.env.CONNECTIVITY_PROXY_URL;

  // If explicitly set, use that
  if (envUrl) {
    return envUrl;
  }

  // Platform-specific defaults
  switch (platform) {
    case 'kyma':
      // Kyma uses connectivity-proxy as a Kubernetes service
      return 'http://connectivity-proxy.kyma-system.svc.cluster.local:20003';

    case 'cloudfoundry':
      // Cloud Foundry uses connectivity service proxy from VCAP_SERVICES
      return getCloudFoundryConnectivityProxy();

    case 'local':
      // Local development might not have proxy
      return 'http://localhost:20003';
  }
}

/**
 * Extract connectivity proxy URL from Cloud Foundry VCAP_SERVICES
 */
function getCloudFoundryConnectivityProxy(): string {
  try {
    const vcapServices = JSON.parse(process.env.VCAP_SERVICES || '{}');
    const connectivityService = vcapServices.connectivity?.[0];

    if (connectivityService?.credentials?.onpremise_proxy_http_port) {
      const host = connectivityService.credentials.onpremise_proxy_host || 'localhost';
      const port = connectivityService.credentials.onpremise_proxy_http_port;
      return `http://${host}:${port}`;
    }
  } catch (error) {
    console.error('[Platform Detector] Error parsing VCAP_SERVICES:', error);
  }

  // Fallback
  return 'http://localhost:20003';
}

/**
 * Get service credentials from Cloud Foundry VCAP_SERVICES
 */
export function getCloudFoundryServiceCredentials(serviceName: string): any | null {
  if (detectPlatform() !== 'cloudfoundry') {
    return null;
  }

  try {
    const vcapServices = JSON.parse(process.env.VCAP_SERVICES || '{}');

    // Search in all service types
    for (const serviceType of Object.keys(vcapServices)) {
      const services = vcapServices[serviceType];
      if (Array.isArray(services)) {
        const service = services.find((s: any) =>
          s.name === serviceName ||
          s.label === serviceName ||
          serviceType === serviceName
        );
        if (service?.credentials) {
          return service.credentials;
        }
      }
    }
  } catch (error) {
    console.error(`[Platform Detector] Error getting credentials for ${serviceName}:`, error);
  }

  return null;
}

/**
 * Get Cloud Foundry subaccount ID (tenantid) from connectivity service credentials
 * This is required for the SAP-Connectivity-ConsumerAccount header
 */
export function getCloudFoundrySubaccountId(): string | null {
  const credentials = getCloudFoundryServiceCredentials('connectivity');
  return credentials?.tenantid || null;
}
