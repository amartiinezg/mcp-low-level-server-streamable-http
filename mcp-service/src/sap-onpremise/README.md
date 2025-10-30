# SAP OnPremise Integration via BTP Destination Service

This module provides integration with SAP OnPremise systems through BTP Destination Service and Cloud Connector.

## Architecture

```
MCP Server → BTP Destination Service → Connectivity Proxy (kyma-system) → Cloud Connector → SAP OnPremise System
```

**Important:** The connectivity-proxy runs in the `kyma-system` namespace when you deploy Kyma connectivity modules. Your application code communicates only with the Destination Service API, which internally uses the connectivity-proxy to route traffic through the Cloud Connector.

## Features

- **Destination Service Client**: Authenticates with BTP Destination Service using OAuth 2.0 Client Credentials
- **Business Partner API Client**: Queries Business Partner data from SAP OnPremise systems
- **MCP Tools**:
  - `sap_get_business_partner`: Get specific Business Partner by ID
  - `sap_search_business_partners`: Search Business Partners by name

## Configuration

### 1. Configure Cloud Connector

Ensure your Cloud Connector is configured to expose the SAP OnPremise system:

1. In Cloud Connector, add your SAP system as a backend
2. Configure the virtual host and port
3. Add access controls for `/sap/opu/odata/sap/API_BUSINESS_PARTNER`

### 2. Create Destination in BTP Cockpit

1. Navigate to your BTP Subaccount → Connectivity → Destinations
2. Create a new destination with these properties:
   - **Name**: Choose a name (e.g., `SAP_ONPREMISE`)
   - **Type**: HTTP
   - **URL**: Virtual URL from Cloud Connector (e.g., `http://virtualsap:8000`)
   - **Proxy Type**: OnPremise
   - **Authentication**: BasicAuthentication
   - **User**: SAP username
   - **Password**: SAP password

### 3. Create Destination Service Instance

1. In BTP Cockpit → Services → Service Marketplace
2. Create instance of "Destination" service
3. Create a service key
4. Note the credentials from the service key:
   - `uri` → BTP_DESTINATION_SERVICE_URL
   - `clientid` → BTP_DESTINATION_CLIENT_ID
   - `clientsecret` → BTP_DESTINATION_CLIENT_SECRET
   - `url` (token endpoint) → BTP_DESTINATION_TOKEN_URL

### 4. Configure Environment Variables

Add to your `.env` file:

```bash
# SAP BTP Destination Service
BTP_DESTINATION_SERVICE_URL=https://<subaccount>.dest.cfapps.<region>.hana.ondemand.com
BTP_DESTINATION_CLIENT_ID=<client-id>
BTP_DESTINATION_CLIENT_SECRET=<client-secret>
BTP_DESTINATION_TOKEN_URL=https://<subdomain>.authentication.<region>.hana.ondemand.com/oauth/token
BTP_DESTINATION_NAME=SAP_ONPREMISE
```

## Usage

### From MCP Client (Gemini CLI, Claude Desktop, etc.)

```bash
# Get specific Business Partner
/mcp call sap_get_business_partner --businessPartnerId "1000001"

# Search Business Partners
/mcp call sap_search_business_partners --searchTerm "Smith" --top 5
```

### Response Format

**Get Business Partner:**
```
Business Partner: 1000001
Name: John Smith
First Name: John
Last Name: Smith
Category: 1
Grouping: BP01
Created: 2023-01-15 by SYSTEM

Addresses:
  Address 1:
    123 Main Street
    12345 New York
    NY
    US
```

**Search Business Partners:**
```
Business Partners encontrados: 3

1. 1000001 - John Smith
   Categoría: 1

2. 1000002 - Jane Smith
   Categoría: 2

3. 1000003 - Smith Corp
   Categoría: 2
```

## API Details

### Destination Service Client

**Class**: `DestinationServiceClient`

**Methods**:
- `getAccessToken()`: Obtains OAuth token using client credentials
- `getDestination()`: Retrieves full destination configuration with auth tokens
- `getDestinationConfig()`: Returns only the destination configuration

### Business Partner Client

**Class**: `BusinessPartnerClient`

**Methods**:
- `getBusinessPartner(businessPartnerId: string)`: Get specific Business Partner
- `searchBusinessPartners(searchTerm: string, top?: number)`: Search Business Partners
- `formatBusinessPartner(bp: BusinessPartner)`: Format Business Partner for display

## Troubleshooting

### Common Issues

1. **"Failed to authenticate with Destination Service"**
   - Verify BTP_DESTINATION_CLIENT_ID and BTP_DESTINATION_CLIENT_SECRET
   - Check BTP_DESTINATION_TOKEN_URL is correct
   - Ensure service key is still valid

2. **"Failed to retrieve destination"**
   - Verify BTP_DESTINATION_NAME matches the destination name in BTP Cockpit
   - Check destination service binding has correct permissions
   - Ensure destination exists in the same subaccount

3. **"Failed to retrieve Business Partner"**
   - Verify Cloud Connector is running
   - Check Cloud Connector has access controls configured
   - Verify SAP system credentials in destination
   - Ensure Business Partner API is enabled in SAP system

### Debug Mode

Enable debug logging by checking console output:
- `[Destination Service]` prefix: Destination Service operations
- `[Business Partner]` prefix: Business Partner API operations

## Extending

To add more SAP APIs:

1. Add new types to `types.ts`
2. Create a new client class (similar to `BusinessPartnerClient`)
3. Add new tools in `mcp-service/src/index.ts`
4. Update this documentation

## References

- [SAP Business Partner API](https://api.sap.com/api/API_BUSINESS_PARTNER/overview)
- [BTP Destination Service](https://help.sap.com/docs/CP_CONNECTIVITY/cca91383641e40ffbe03bdc78f00f681/7e306250e08340f89d6c103e28840f30.html)
- [Cloud Connector Configuration](https://help.sap.com/docs/CP_CONNECTIVITY/cca91383641e40ffbe03bdc78f00f681/e6c7616abb5710148cfcf3e75d96d596.html)
