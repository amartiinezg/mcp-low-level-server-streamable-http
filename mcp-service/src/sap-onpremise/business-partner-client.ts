/**
 * SAP Business Partner API Client
 * Connects to OnPremise SAP system via Cloud Connector
 */

import axios, { AxiosInstance } from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import type {
  DestinationConfiguration,
  BusinessPartner,
  BusinessPartnerResponse,
} from './types.js';
import { DestinationServiceClient } from './destination-service.js';
import { ConnectivityServiceClient } from './connectivity-service.js';

export class BusinessPartnerClient {
  private destinationClient: DestinationServiceClient;
  private connectivityClient: ConnectivityServiceClient | null;
  private httpClient: AxiosInstance;
  private destinationConfig: DestinationConfiguration | null = null;
  private connectivityProxyUrl: string;

  constructor(
    destinationClient: DestinationServiceClient,
    connectivityClient: ConnectivityServiceClient | null = null
  ) {
    this.destinationClient = destinationClient;
    this.connectivityClient = connectivityClient;
    this.connectivityProxyUrl = process.env.CONNECTIVITY_PROXY_URL ||
      'http://connectivity-proxy.kyma-system.svc.cluster.local:20003';

    this.httpClient = axios.create({
      timeout: 60000, // 60 seconds for OnPremise connections
    });
  }

  /**
   * Initialize and cache destination configuration
   */
  private async getDestinationConfig(): Promise<DestinationConfiguration> {
    if (!this.destinationConfig) {
      this.destinationConfig = await this.destinationClient.getDestinationConfig();
    }
    return this.destinationConfig;
  }

  /**
   * Build authorization header based on destination authentication type
   */
  private getAuthHeaders(config: DestinationConfiguration): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (config.Authentication === 'BasicAuthentication' && config.User && config.Password) {
      const credentials = Buffer.from(`${config.User}:${config.Password}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (config.Authentication === 'NoAuthentication') {
      // No auth header needed
    } else {
      console.warn(`[Business Partner] Unsupported authentication type: ${config.Authentication}`);
    }

    return headers;
  }

  /**
   * Get a specific Business Partner by ID
   */
  async getBusinessPartner(businessPartnerId: string): Promise<BusinessPartner | null> {
    try {
      // Get full destination with auth tokens
      const destination = await this.destinationClient.getDestination();
      const config = destination.destinationConfiguration;

      console.log(`[Business Partner] Fetching Business Partner: ${businessPartnerId}`);
      console.log(`[Business Partner] Destination Type: ${config.ProxyType}`);
      console.log(`[Business Partner] Backend URL: ${config.URL}`);

      // Build the backend path
      const backendPath = `/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner('${businessPartnerId}')`;
      const queryString = '?$format=json&$expand=to_BusinessPartnerAddress';

      // Build request URL
      const requestUrl = `${config.URL}${backendPath}${queryString}`;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      // Add basic auth if configured
      if (config.Authentication === 'BasicAuthentication' && config.User && config.Password) {
        const credentials = Buffer.from(`${config.User}:${config.Password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      console.log(`[Business Partner] Request URL: ${requestUrl}`);

      // Configure axios options
      const axiosConfig: any = { headers };

      // If OnPremise proxy type, route through connectivity-proxy
      if (config.ProxyType === 'OnPremise' && this.connectivityClient) {
        console.log(`[Business Partner] Using connectivity-proxy: ${this.connectivityProxyUrl}`);

        // Get connectivity token
        const connectivityToken = await this.connectivityClient.getConnectivityToken();

        // Only add Proxy-Authorization header (not SAP-Connectivity-Authentication)
        // SAP-Connectivity-Authentication is for principal propagation which requires user tokens
        // Since we're using BasicAuthentication in the destination, we don't need it
        headers['Proxy-Authorization'] = `Bearer ${connectivityToken}`;

        // Configure HTTP proxy (connectivity-proxy handles the secure tunnel)
        axiosConfig.proxy = false; // Disable default proxy handling
        axiosConfig.httpAgent = new HttpProxyAgent(this.connectivityProxyUrl);
        // No httpsAgent needed - connectivity-proxy only accepts HTTP

        console.log('[Business Partner] Connectivity proxy configured');
      }

      const response = await this.httpClient.get<BusinessPartnerResponse>(requestUrl, axiosConfig);

      console.log('[Business Partner] Business Partner retrieved successfully');

      // Handle OData response format
      if (response.data.d) {
        // If it's a single entity response
        if ('BusinessPartner' in response.data.d) {
          return response.data.d as BusinessPartner;
        }
      }

      return null;
    } catch (error) {
      console.error('[Business Partner] Failed to get Business Partner:', error);
      if (axios.isAxiosError(error)) {
        console.error('URL:', error.config?.url);
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
        console.error('Request headers:', error.config?.headers);
      }
      throw new Error(`Failed to retrieve Business Partner: ${error}`);
    }
  }

  /**
   * Search Business Partners by name
   */
  async searchBusinessPartners(searchTerm: string, top: number = 10): Promise<BusinessPartner[]> {
    try {
      // Get full destination with auth tokens
      const destination = await this.destinationClient.getDestination();
      const config = destination.destinationConfiguration;

      console.log(`[Business Partner] Searching Business Partners with term: ${searchTerm}`);

      // Build the backend path
      const backendPath = `/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner`;

      // Build filter for search
      const filter = `substringof('${searchTerm}',BusinessPartnerFullName) or substringof('${searchTerm}',SearchTerm1)`;
      const queryString = `?$format=json&$filter=${encodeURIComponent(filter)}&$top=${top}&$expand=to_BusinessPartnerAddress`;

      // Build request URL
      const requestUrl = `${config.URL}${backendPath}${queryString}`;

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      // Add basic auth if configured
      if (config.Authentication === 'BasicAuthentication' && config.User && config.Password) {
        const credentials = Buffer.from(`${config.User}:${config.Password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      console.log(`[Business Partner] Request URL: ${requestUrl}`);

      // Configure axios options
      const axiosConfig: any = { headers };

      // If OnPremise proxy type, route through connectivity-proxy
      if (config.ProxyType === 'OnPremise' && this.connectivityClient) {
        console.log(`[Business Partner] Using connectivity-proxy: ${this.connectivityProxyUrl}`);

        // Get connectivity token
        const connectivityToken = await this.connectivityClient.getConnectivityToken();

        // Only add Proxy-Authorization header (not SAP-Connectivity-Authentication)
        // SAP-Connectivity-Authentication is for principal propagation which requires user tokens
        // Since we're using BasicAuthentication in the destination, we don't need it
        headers['Proxy-Authorization'] = `Bearer ${connectivityToken}`;

        // Configure HTTP proxy (connectivity-proxy handles the secure tunnel)
        axiosConfig.proxy = false;
        axiosConfig.httpAgent = new HttpProxyAgent(this.connectivityProxyUrl);

        console.log('[Business Partner] Connectivity proxy configured');
      }

      const response = await this.httpClient.get<BusinessPartnerResponse>(requestUrl, axiosConfig);

      console.log('[Business Partner] Search completed successfully');

      // Handle OData collection response
      if (response.data.d && 'results' in response.data.d) {
        return response.data.d.results || [];
      }

      return [];
    } catch (error) {
      console.error('[Business Partner] Failed to search Business Partners:', error);
      if (axios.isAxiosError(error)) {
        console.error('URL:', error.config?.url);
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
        console.error('Request headers:', error.config?.headers);
      }
      throw new Error(`Failed to search Business Partners: ${error}`);
    }
  }

  /**
   * Validate connectivity to SAP OnPremise system
   * Calls the metadata endpoint to verify the connection
   */
  async validateConnectivity(): Promise<boolean> {
    try {
      console.log('[Business Partner] Validating connectivity to SAP OnPremise...');

      // Get full destination with auth tokens
      const destination = await this.destinationClient.getDestination();
      const config = destination.destinationConfiguration;

      // Build service endpoint path (without query params - just the service root)
      // This returns the service document which is enough to validate connectivity
      const servicePath = `/sap/opu/odata/sap/API_BUSINESS_PARTNER`;

      // Build request URL
      const requestUrl = `${config.URL}${servicePath}`;

      const headers: Record<string, string> = {
        'Accept': 'application/xml, application/json',
      };

      // Add basic auth if configured
      if (config.Authentication === 'BasicAuthentication' && config.User && config.Password) {
        const credentials = Buffer.from(`${config.User}:${config.Password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      console.log(`[Business Partner] Validating against: ${requestUrl}`);

      // Configure axios options
      const axiosConfig: any = { headers };

      // If OnPremise proxy type, route through connectivity-proxy
      if (config.ProxyType === 'OnPremise' && this.connectivityClient) {
        console.log(`[Business Partner] Using connectivity-proxy: ${this.connectivityProxyUrl}`);

        // Get connectivity token
        const connectivityToken = await this.connectivityClient.getConnectivityToken();

        // Only add Proxy-Authorization header (not SAP-Connectivity-Authentication)
        // SAP-Connectivity-Authentication is for principal propagation which requires user tokens
        // Since we're using BasicAuthentication in the destination, we don't need it
        headers['Proxy-Authorization'] = `Bearer ${connectivityToken}`;

        // Configure HTTP proxy (connectivity-proxy handles the secure tunnel)
        axiosConfig.proxy = false;
        axiosConfig.httpAgent = new HttpProxyAgent(this.connectivityProxyUrl);

        console.log('[Business Partner] Connectivity proxy configured');
      }

      const response = await this.httpClient.get(requestUrl, axiosConfig);

      if (response.status === 200) {
        console.log('✅ [Business Partner] Connectivity validation successful');
        console.log(`[Business Partner] Metadata response length: ${response.data.length} characters`);
        return true;
      } else {
        console.warn(`⚠️ [Business Partner] Unexpected status code: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ [Business Partner] Connectivity validation failed:', error);
      if (axios.isAxiosError(error)) {
        console.error('URL:', error.config?.url);
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
        console.error('Request headers:', error.config?.headers);
      }
      return false;
    }
  }

  /**
   * Format Business Partner for display
   */
  formatBusinessPartner(bp: BusinessPartner): string {
    let formatted = `Business Partner: ${bp.BusinessPartner}\n`;
    formatted += `Name: ${bp.BusinessPartnerFullName || bp.BusinessPartnerName || 'N/A'}\n`;

    if (bp.FirstName || bp.LastName) {
      formatted += `First Name: ${bp.FirstName || 'N/A'}\n`;
      formatted += `Last Name: ${bp.LastName || 'N/A'}\n`;
    }

    if (bp.OrganizationBPName1) {
      formatted += `Organization: ${bp.OrganizationBPName1}\n`;
    }

    formatted += `Category: ${bp.BusinessPartnerCategory || 'N/A'}\n`;
    formatted += `Grouping: ${bp.BusinessPartnerGrouping || 'N/A'}\n`;

    if (bp.CreationDate) {
      formatted += `Created: ${bp.CreationDate} by ${bp.CreatedByUser || 'N/A'}\n`;
    }

    // Format addresses
    if (bp.to_BusinessPartnerAddress?.results && bp.to_BusinessPartnerAddress.results.length > 0) {
      formatted += `\nAddresses:\n`;
      bp.to_BusinessPartnerAddress.results.forEach((addr, index) => {
        formatted += `  Address ${index + 1}:\n`;
        if (addr.StreetName || addr.HouseNumber) {
          formatted += `    ${addr.StreetName || ''} ${addr.HouseNumber || ''}\n`;
        }
        if (addr.PostalCode || addr.CityName) {
          formatted += `    ${addr.PostalCode || ''} ${addr.CityName || ''}\n`;
        }
        if (addr.Region) {
          formatted += `    ${addr.Region}\n`;
        }
        if (addr.Country) {
          formatted += `    ${addr.Country}\n`;
        }
      });
    }

    return formatted;
  }
}
