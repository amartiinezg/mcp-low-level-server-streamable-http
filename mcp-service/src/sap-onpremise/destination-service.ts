/**
 * SAP BTP Destination Service Client
 * Handles OAuth authentication and destination retrieval
 * Supports both Kyma and Cloud Foundry environments
 */

import axios, { AxiosInstance } from 'axios';
import type {
  DestinationServiceConfig,
  OAuthTokenResponse,
  DestinationServiceResponse,
  DestinationConfiguration,
} from './types.js';
import { detectPlatform, getCloudFoundryServiceCredentials } from './platform-detector.js';

export class DestinationServiceClient {
  private config: DestinationServiceConfig;
  private httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: DestinationServiceConfig) {
    this.config = config;
    this.httpClient = axios.create({
      timeout: 30000,
    });
  }

  /**
   * True when running in LOCAL_SAP_DIRECT mode (no BTP).
   */
  private isLocalDirect(): boolean {
    return !!this.config.localDirect;
  }

  /**
   * Build a synthetic destination response for LOCAL_SAP_DIRECT mode.
   * No BTP HTTP calls; SAP is reached directly over corporate network.
   */
  private buildLocalDirectDestination(): DestinationServiceResponse {
    const ld = this.config.localDirect!;
    const auth = ld.authentication || (ld.user && ld.password ? 'BasicAuthentication' : 'NoAuthentication');
    const destinationConfiguration: DestinationConfiguration = {
      Name: this.config.destinationName,
      Type: 'HTTP',
      URL: ld.sapUrl.replace(/\/+$/, ''),
      Authentication: auth,
      ProxyType: 'Internet', // Skips connectivity-proxy / Cloud Connector path
      User: ld.user,
      Password: ld.password,
    };
    if (ld.sapClient) {
      destinationConfiguration['sap-client'] = ld.sapClient;
    }
    return {
      owner: { SubaccountId: 'local', InstanceId: null },
      destinationConfiguration,
    };
  }

  /**
   * Get OAuth2 access token using client credentials flow
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      console.log('[Destination Service] Fetching OAuth token...');

      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', this.config.clientId);
      params.append('client_secret', this.config.clientSecret);

      const response = await this.httpClient.post<OAuthTokenResponse>(
        this.config.tokenUrl,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;

      // Set expiry with 5 minute buffer
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 300) * 1000);

      console.log('[Destination Service] OAuth token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('[Destination Service] Failed to get OAuth token:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
      }
      throw new Error(`Failed to authenticate with Destination Service: ${error}`);
    }
  }

  /**
   * Get destination configuration from Destination Service
   */
  async getDestination(): Promise<DestinationServiceResponse> {
    // LOCAL_SAP_DIRECT mode: skip BTP, return synthetic destination
    if (this.isLocalDirect()) {
      console.log('[Destination Service] LOCAL_SAP_DIRECT mode - bypassing BTP');
      return this.buildLocalDirectDestination();
    }

    try {
      const token = await this.getAccessToken();

      console.log(`[Destination Service] Fetching destination: ${this.config.destinationName}`);

      const url = `${this.config.url}/destination-configuration/v1/destinations/${this.config.destinationName}`;

      const response = await this.httpClient.get<DestinationServiceResponse>(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('[Destination Service] Destination retrieved successfully');
      console.log(`[Destination Service] URL: ${response.data.destinationConfiguration.URL}`);
      console.log(`[Destination Service] Auth Type: ${response.data.destinationConfiguration.Authentication}`);

      return response.data;
    } catch (error) {
      console.error('[Destination Service] Failed to get destination:', error);
      if (axios.isAxiosError(error)) {
        console.error('URL:', error.config?.url);
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
      }
      throw new Error(`Failed to retrieve destination: ${error}`);
    }
  }

  /**
   * Get destination configuration only (without auth tokens)
   */
  async getDestinationConfig(): Promise<DestinationConfiguration> {
    const destination = await this.getDestination();
    return destination.destinationConfiguration;
  }
}

/**
 * Load Destination Service configuration from environment variables
 * Supports both Kyma (env vars) and Cloud Foundry (VCAP_SERVICES)
 */
export function loadDestinationServiceConfig(): DestinationServiceConfig | null {
  // ─── LOCAL_SAP_DIRECT mode: bypass BTP entirely ───────────────────────────
  // Use when running locally on the same corporate network as the SAP system.
  // Required env: LOCAL_SAP_DIRECT=true, LOCAL_SAP_URL=https://sap.host:port
  // Optional:    LOCAL_SAP_USER, LOCAL_SAP_PASSWORD, LOCAL_SAP_CLIENT
  if (process.env.LOCAL_SAP_DIRECT === 'true') {
    const sapUrl = process.env.LOCAL_SAP_URL;
    if (!sapUrl) {
      console.warn('[Destination Service] LOCAL_SAP_DIRECT=true but LOCAL_SAP_URL is missing - SAP integration disabled');
      return null;
    }
    console.log('[Destination Service] LOCAL_SAP_DIRECT enabled - calling SAP directly, no BTP');
    console.log(`[Destination Service] SAP URL: ${sapUrl}`);
    return {
      url: '',
      clientId: '',
      clientSecret: '',
      tokenUrl: '',
      destinationName: process.env.BTP_DESTINATION_NAME || 'LOCAL_DIRECT',
      localDirect: {
        sapUrl,
        user: process.env.LOCAL_SAP_USER,
        password: process.env.LOCAL_SAP_PASSWORD,
        sapClient: process.env.LOCAL_SAP_CLIENT,
        authentication: process.env.LOCAL_SAP_USER && process.env.LOCAL_SAP_PASSWORD
          ? 'BasicAuthentication'
          : 'NoAuthentication',
      },
    };
  }

  const platform = detectPlatform();

  console.log(`[Destination Service] Detected platform: ${platform}`);

  // Try Cloud Foundry VCAP_SERVICES first
  if (platform === 'cloudfoundry') {
    const credentials = getCloudFoundryServiceCredentials('destination');
    if (credentials) {
      console.log('[Destination Service] Loading configuration from VCAP_SERVICES');

      const destinationName = process.env.BTP_DESTINATION_NAME || 'SAP_OnPremise';

      return {
        url: credentials.uri,
        clientId: credentials.clientid,
        clientSecret: credentials.clientsecret,
        tokenUrl: credentials.token_service_url || `${credentials.url}/oauth/token`,
        destinationName,
      };
    }
  }

  // Fallback to environment variables (Kyma or local)
  const url = process.env.BTP_DESTINATION_SERVICE_URL;
  const clientId = process.env.BTP_DESTINATION_CLIENT_ID;
  const clientSecret = process.env.BTP_DESTINATION_CLIENT_SECRET;
  const tokenUrl = process.env.BTP_DESTINATION_TOKEN_URL;
  const destinationName = process.env.BTP_DESTINATION_NAME;

  if (!url || !clientId || !clientSecret || !tokenUrl || !destinationName) {
    console.warn('[Destination Service] Configuration not found in environment variables or VCAP_SERVICES');
    console.warn('[Destination Service] SAP OnPremise integration will be disabled');
    return null;
  }

  console.log('[Destination Service] Loading configuration from environment variables');

  // Ensure tokenUrl has /oauth/token suffix
  const normalizedTokenUrl = tokenUrl.endsWith('/oauth/token')
    ? tokenUrl
    : `${tokenUrl}/oauth/token`;

  return {
    url,
    clientId,
    clientSecret,
    tokenUrl: normalizedTokenUrl,
    destinationName,
  };
}
