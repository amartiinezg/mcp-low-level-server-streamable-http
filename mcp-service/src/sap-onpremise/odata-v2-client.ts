/**
 * Generic OData V2 Query Client
 * Provides flexible querying capabilities for SAP OData V2 services
 */

import axios, { AxiosInstance } from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import type { DestinationConfiguration } from './types.js';
import { DestinationServiceClient } from './destination-service.js';
import { ConnectivityServiceClient } from './connectivity-service.js';

export interface ODataV2QueryOptions {
  /** Entity set name (e.g., "A_BusinessPartner") */
  entitySet: string;

  /** Entity key for single entity retrieval (e.g., "'1000001'") */
  key?: string;

  /** $filter parameter (OData V2 syntax) */
  filter?: string;

  /** $select parameter (comma-separated properties) */
  select?: string;

  /** $expand parameter (navigation properties, comma-separated) */
  expand?: string;

  /** $orderby parameter (e.g., "CreationDate desc") */
  orderby?: string;

  /** $top parameter (limit results) */
  top?: number;

  /** $skip parameter (skip results for pagination) */
  skip?: number;

  /** $count parameter (include count in response) */
  inlinecount?: 'allpages' | 'none';
}

export interface ODataV2Response<T = any> {
  d: {
    results?: T[];
    __count?: string;
  } & T;
}

export class ODataV2Client {
  private destinationClient: DestinationServiceClient;
  private connectivityClient: ConnectivityServiceClient | null;
  private httpClient: AxiosInstance;
  private connectivityProxyUrl: string;
  private baseServicePath: string;

  constructor(
    destinationClient: DestinationServiceClient,
    connectivityClient: ConnectivityServiceClient | null = null,
    baseServicePath: string = '/sap/opu/odata/sap/API_BUSINESS_PARTNER'
  ) {
    this.destinationClient = destinationClient;
    this.connectivityClient = connectivityClient;
    this.baseServicePath = baseServicePath;
    this.connectivityProxyUrl = process.env.CONNECTIVITY_PROXY_URL ||
      'http://connectivity-proxy.kyma-system.svc.cluster.local:20003';

    this.httpClient = axios.create({
      timeout: 60000,
    });
  }

  /**
   * Execute generic OData V2 query
   */
  async query<T = any>(options: ODataV2QueryOptions): Promise<{
    results: T[];
    count?: number;
  }> {
    try {
      const destination = await this.destinationClient.getDestination();
      const config = destination.destinationConfiguration;

      // Log sap-client configuration
      if (config['sap-client']) {
        console.log(`[OData V2 Client] Using sap-client: ${config['sap-client']}`);
      } else {
        console.log('[OData V2 Client] No sap-client configured in destination');
      }

      // Build entity path
      let entityPath = `${this.baseServicePath}/${options.entitySet}`;
      if (options.key) {
        entityPath += `(${options.key})`;
      }

      // Build query parameters
      const queryParams: string[] = ['$format=json'];

      // Add sap-client if configured in destination
      if (config['sap-client']) {
        queryParams.push(`sap-client=${config['sap-client']}`);
      }

      if (options.filter) {
        queryParams.push(`$filter=${encodeURIComponent(options.filter)}`);
      }

      if (options.select) {
        queryParams.push(`$select=${encodeURIComponent(options.select)}`);
      }

      if (options.expand) {
        queryParams.push(`$expand=${encodeURIComponent(options.expand)}`);
      }

      if (options.orderby) {
        queryParams.push(`$orderby=${encodeURIComponent(options.orderby)}`);
      }

      if (options.top !== undefined) {
        queryParams.push(`$top=${options.top}`);
      }

      if (options.skip !== undefined) {
        queryParams.push(`$skip=${options.skip}`);
      }

      if (options.inlinecount) {
        queryParams.push(`$inlinecount=${options.inlinecount}`);
      }

      const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const requestUrl = `${config.URL}${entityPath}${queryString}`;

      console.log(`[OData V2 Client] Query: ${options.entitySet}${options.key ? `(${options.key})` : ''}`);
      console.log(`[OData V2 Client] URL: ${requestUrl}`);

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      // Add basic auth if configured
      if (config.Authentication === 'BasicAuthentication' && config.User && config.Password) {
        const credentials = Buffer.from(`${config.User}:${config.Password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const axiosConfig: any = { headers };

      // If OnPremise proxy type, route through connectivity-proxy
      if (config.ProxyType === 'OnPremise' && this.connectivityClient) {
        const connectivityToken = await this.connectivityClient.getConnectivityToken();
        headers['Proxy-Authorization'] = `Bearer ${connectivityToken}`;
        axiosConfig.proxy = false;
        axiosConfig.httpAgent = new HttpProxyAgent(this.connectivityProxyUrl);
      }

      const response = await this.httpClient.get<ODataV2Response<T>>(requestUrl, axiosConfig);

      console.log('[OData V2 Client] Query completed successfully');

      // Handle single entity response
      if (options.key && response.data.d && !('results' in response.data.d)) {
        return {
          results: [response.data.d as T],
        };
      }

      // Handle collection response
      if (response.data.d && 'results' in response.data.d) {
        const result: { results: T[]; count?: number } = {
          results: response.data.d.results || [],
        };

        if (response.data.d.__count) {
          result.count = parseInt(response.data.d.__count, 10);
        }

        return result;
      }

      return { results: [] };
    } catch (error) {
      console.error('[OData V2 Client] Query failed:', error);
      if (axios.isAxiosError(error)) {
        console.error('URL:', error.config?.url);
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
      }
      throw new Error(`OData V2 query failed: ${error}`);
    }
  }

  /**
   * Execute raw OData V2 query with custom path
   * For advanced use cases or function imports
   */
  async queryRaw<T = any>(
    customPath: string,
    queryParams?: Record<string, string>
  ): Promise<T> {
    try {
      const destination = await this.destinationClient.getDestination();
      const config = destination.destinationConfiguration;

      // Build query string
      const params = queryParams || {};
      if (!params['$format']) {
        params['$format'] = 'json';
      }

      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      const requestUrl = `${config.URL}${this.baseServicePath}${customPath}${queryString ? '?' + queryString : ''}`;

      console.log(`[OData V2 Client] Raw query: ${customPath}`);

      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      // Add basic auth if configured
      if (config.Authentication === 'BasicAuthentication' && config.User && config.Password) {
        const credentials = Buffer.from(`${config.User}:${config.Password}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }

      const axiosConfig: any = { headers };

      // If OnPremise proxy type, route through connectivity-proxy
      if (config.ProxyType === 'OnPremise' && this.connectivityClient) {
        const connectivityToken = await this.connectivityClient.getConnectivityToken();
        headers['Proxy-Authorization'] = `Bearer ${connectivityToken}`;
        axiosConfig.proxy = false;
        axiosConfig.httpAgent = new HttpProxyAgent(this.connectivityProxyUrl);
      }

      const response = await this.httpClient.get<T>(requestUrl, axiosConfig);

      console.log('[OData V2 Client] Raw query completed successfully');

      return response.data;
    } catch (error) {
      console.error('[OData V2 Client] Raw query failed:', error);
      throw new Error(`OData V2 raw query failed: ${error}`);
    }
  }

  /**
   * Build OData V2 filter expression helpers
   */
  static buildFilter = {
    /** Equal: property eq 'value' */
    eq: (property: string, value: string | number | boolean) =>
      typeof value === 'string'
        ? `${property} eq '${value}'`
        : `${property} eq ${value}`,

    /** Not equal: property ne 'value' */
    ne: (property: string, value: string | number | boolean) =>
      typeof value === 'string'
        ? `${property} ne '${value}'`
        : `${property} ne ${value}`,

    /** Greater than: property gt value */
    gt: (property: string, value: number) => `${property} gt ${value}`,

    /** Greater or equal: property ge value */
    ge: (property: string, value: number) => `${property} ge ${value}`,

    /** Less than: property lt value */
    lt: (property: string, value: number) => `${property} lt ${value}`,

    /** Less or equal: property le value */
    le: (property: string, value: number) => `${property} le ${value}`,

    /** Substring of (OData V2): substringof('value', property) */
    substringof: (value: string, property: string) =>
      `substringof('${value}',${property})`,

    /** Starts with: startswith(property, 'value') */
    startswith: (property: string, value: string) =>
      `startswith(${property},'${value}')`,

    /** Ends with: endswith(property, 'value') */
    endswith: (property: string, value: string) =>
      `endswith(${property},'${value}')`,

    /** And: filter1 and filter2 */
    and: (...filters: string[]) => filters.join(' and '),

    /** Or: filter1 or filter2 */
    or: (...filters: string[]) => filters.join(' or '),

    /** Not: not (filter) */
    not: (filter: string) => `not (${filter})`,
  };

  /**
   * Format OData V2 results for display
   */
  static formatResults<T = any>(
    results: T[],
    options?: {
      properties?: string[];
      maxResults?: number;
    }
  ): string {
    const maxResults = options?.maxResults || 10;
    const displayResults = results.slice(0, maxResults);

    if (displayResults.length === 0) {
      return 'No results found';
    }

    let formatted = `Found ${results.length} result(s)${results.length > maxResults ? ` (showing first ${maxResults})` : ''}:\n\n`;

    displayResults.forEach((result, index) => {
      formatted += `${index + 1}. `;

      if (options?.properties) {
        const props = options.properties
          .map(prop => {
            const value = (result as any)[prop];
            return value !== undefined ? `${prop}: ${value}` : null;
          })
          .filter(Boolean)
          .join(', ');
        formatted += props;
      } else {
        // Display all properties
        const props = Object.entries(result as any)
          .filter(([key, value]) => !key.startsWith('__') && value !== null && value !== undefined)
          .slice(0, 5)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        formatted += props;
      }

      formatted += '\n';
    });

    if (results.length > maxResults) {
      formatted += `\n... and ${results.length - maxResults} more result(s)`;
    }

    return formatted;
  }
}
