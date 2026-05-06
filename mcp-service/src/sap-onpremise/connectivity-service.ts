/**
 * SAP BTP Connectivity Service Client
 * Handles authentication and token generation for connectivity-proxy
 * Supports both Kyma and Cloud Foundry environments
 */

import axios, { AxiosInstance } from 'axios';
import type { OAuthTokenResponse } from './types.js';
import { detectPlatform, getCloudFoundryServiceCredentials } from './platform-detector.js';

export interface ConnectivityServiceConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  connectivityServiceUrl: string;
}

export class ConnectivityServiceClient {
  private config: ConnectivityServiceConfig;
  private httpClient: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: ConnectivityServiceConfig) {
    this.config = config;
    this.httpClient = axios.create({
      timeout: 30000,
    });
  }

  /**
   * Get OAuth2 access token for connectivity service
   */
  async getConnectivityToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      console.log('[Connectivity Service] Fetching connectivity token...');
      console.log('[Connectivity Service] Token URL:', this.config.tokenUrl);
      console.log('[Connectivity Service] Client ID:', this.config.clientId?.substring(0, 10) + '...');

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

      console.log('[Connectivity Service] Connectivity token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('[Connectivity Service] Failed to get connectivity token:', error);
      if (axios.isAxiosError(error)) {
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
      }
      throw new Error(`Failed to authenticate with Connectivity Service: ${error}`);
    }
  }
}

/**
 * Load Connectivity Service configuration from environment variables
 * Supports both Kyma (env vars) and Cloud Foundry (VCAP_SERVICES)
 */
export function loadConnectivityServiceConfig(): ConnectivityServiceConfig | null {
  const platform = detectPlatform();

  console.log(`[Connectivity Service] Detected platform: ${platform}`);

  // Try Cloud Foundry VCAP_SERVICES first
  if (platform === 'cloudfoundry') {
    const credentials = getCloudFoundryServiceCredentials('connectivity');
    if (credentials) {
      console.log('[Connectivity Service] Loading configuration from VCAP_SERVICES');

      // Get token URL from credentials
      let tokenUrl = credentials.token_service_url || credentials.url;

      // Ensure tokenUrl has /oauth/token suffix
      if (!tokenUrl.endsWith('/oauth/token')) {
        tokenUrl = `${tokenUrl}/oauth/token`;
      }

      return {
        clientId: credentials.clientid,
        clientSecret: credentials.clientsecret,
        tokenUrl: tokenUrl,
        connectivityServiceUrl: credentials.url,
      };
    }
  }

  // Fallback to environment variables (Kyma or local)
  const clientId = process.env.CONNECTIVITY_CLIENT_ID;
  const clientSecret = process.env.CONNECTIVITY_CLIENT_SECRET;
  const tokenUrl = process.env.CONNECTIVITY_TOKEN_URL;
  const connectivityServiceUrl = process.env.CONNECTIVITY_SERVICE_URL;

  if (!clientId || !clientSecret || !tokenUrl || !connectivityServiceUrl) {
    console.warn('[Connectivity Service] Configuration not found in environment variables or VCAP_SERVICES');
    return null;
  }

  console.log('[Connectivity Service] Loading configuration from environment variables');

  // Ensure tokenUrl has /oauth/token suffix
  const normalizedTokenUrl = tokenUrl.endsWith('/oauth/token')
    ? tokenUrl
    : `${tokenUrl}/oauth/token`;

  return {
    clientId,
    clientSecret,
    tokenUrl: normalizedTokenUrl,
    connectivityServiceUrl,
  };
}
