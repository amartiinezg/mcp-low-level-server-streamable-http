/**
 * SAP BTP Destination Service Client
 * Handles OAuth authentication and destination retrieval
 */

import axios, { AxiosInstance } from 'axios';
import type {
  DestinationServiceConfig,
  OAuthTokenResponse,
  DestinationServiceResponse,
  DestinationConfiguration,
} from './types.js';

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
 */
export function loadDestinationServiceConfig(): DestinationServiceConfig | null {
  const url = process.env.BTP_DESTINATION_SERVICE_URL;
  const clientId = process.env.BTP_DESTINATION_CLIENT_ID;
  const clientSecret = process.env.BTP_DESTINATION_CLIENT_SECRET;
  const tokenUrl = process.env.BTP_DESTINATION_TOKEN_URL;
  const destinationName = process.env.BTP_DESTINATION_NAME;

  if (!url || !clientId || !clientSecret || !tokenUrl || !destinationName) {
    console.warn('[Destination Service] Configuration not found in environment variables');
    console.warn('[Destination Service] SAP OnPremise integration will be disabled');
    return null;
  }

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
