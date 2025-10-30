/**
 * SAP OnPremise Integration Types
 * Types for BTP Destination Service and Business Partner API
 */

/**
 * BTP Destination Service Configuration
 */
export interface DestinationServiceConfig {
  url: string;
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  destinationName: string;
}

/**
 * OAuth Token Response from BTP
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Destination Configuration from Destination Service
 */
export interface DestinationConfiguration {
  Name: string;
  Type: string;
  URL: string;
  Authentication: string;
  ProxyType?: string;
  CloudConnectorLocationId?: string;
  User?: string;
  Password?: string;
  [key: string]: any;
}

/**
 * Destination Service Response
 */
export interface DestinationServiceResponse {
  owner: {
    SubaccountId: string;
    InstanceId: string | null;
  };
  destinationConfiguration: DestinationConfiguration;
  authTokens?: Array<{
    type: string;
    value: string;
    expires_in?: string;
    http_header?: {
      key: string;
      value: string;
    };
  }>;
}

/**
 * Business Partner Address
 */
export interface BusinessPartnerAddress {
  AddressID?: string;
  Country?: string;
  CityName?: string;
  PostalCode?: string;
  StreetName?: string;
  HouseNumber?: string;
  Region?: string;
}

/**
 * Business Partner from SAP API
 */
export interface BusinessPartner {
  BusinessPartner: string;
  BusinessPartnerFullName?: string;
  BusinessPartnerName?: string;
  FirstName?: string;
  LastName?: string;
  OrganizationBPName1?: string;
  OrganizationBPName2?: string;
  SearchTerm1?: string;
  BusinessPartnerCategory?: string;
  BusinessPartnerGrouping?: string;
  CreationDate?: string;
  CreatedByUser?: string;
  LastChangeDate?: string;
  LastChangedByUser?: string;
  to_BusinessPartnerAddress?: {
    results: BusinessPartnerAddress[];
  };
}

/**
 * Business Partner API Response
 */
export interface BusinessPartnerResponse {
  d: {
    results?: BusinessPartner[];
    BusinessPartner?: string;
    BusinessPartnerFullName?: string;
    [key: string]: any;
  } | BusinessPartner;
}
