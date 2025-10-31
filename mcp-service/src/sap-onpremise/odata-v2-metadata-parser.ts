/**
 * OData V2 Metadata Parser
 * Parses $metadata XML from SAP OData V2 services
 */

import axios, { AxiosInstance } from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import type { DestinationConfiguration } from './types.js';
import { DestinationServiceClient } from './destination-service.js';
import { ConnectivityServiceClient } from './connectivity-service.js';

export interface ODataProperty {
  name: string;
  type: string;
  nullable?: boolean;
  maxLength?: string;
  precision?: string;
  scale?: string;
}

export interface ODataNavigationProperty {
  name: string;
  relationship: string;
  fromRole: string;
  toRole: string;
}

export interface ODataEntityType {
  name: string;
  namespace: string;
  properties: ODataProperty[];
  navigationProperties: ODataNavigationProperty[];
  keys: string[];
}

export interface ODataEntitySet {
  name: string;
  entityType: string;
}

export interface ODataAssociation {
  name: string;
  ends: Array<{
    role: string;
    type: string;
    multiplicity: string;
  }>;
}

export interface ODataSchema {
  namespace: string;
  entityTypes: ODataEntityType[];
  entitySets: ODataEntitySet[];
  associations: ODataAssociation[];
}

export class ODataV2MetadataParser {
  private destinationClient: DestinationServiceClient;
  private connectivityClient: ConnectivityServiceClient | null;
  private httpClient: AxiosInstance;
  private connectivityProxyUrl: string;
  private cachedMetadata: ODataSchema | null = null;
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
   * Fetch and parse $metadata XML
   */
  async fetchMetadata(): Promise<ODataSchema> {
    // Return cached metadata if available
    if (this.cachedMetadata) {
      console.log('[OData Metadata] Returning cached metadata');
      return this.cachedMetadata;
    }

    try {
      const destination = await this.destinationClient.getDestination();
      const config = destination.destinationConfiguration;

      console.log('[OData Metadata] Fetching $metadata...');

      const metadataPath = `${this.baseServicePath}/$metadata`;
      const requestUrl = `${config.URL}${metadataPath}`;

      const headers: Record<string, string> = {
        'Accept': 'application/xml',
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

      const response = await this.httpClient.get(requestUrl, axiosConfig);

      console.log('[OData Metadata] $metadata fetched successfully');

      // Parse XML to extract schema
      const schema = this.parseMetadataXML(response.data);

      // Cache the parsed metadata
      this.cachedMetadata = schema;

      return schema;
    } catch (error) {
      console.error('[OData Metadata] Failed to fetch metadata:', error);
      throw new Error(`Failed to fetch OData metadata: ${error}`);
    }
  }

  /**
   * Parse OData V2 $metadata XML
   * Uses simple regex-based parsing for essential elements
   */
  private parseMetadataXML(xml: string): ODataSchema {
    const schema: ODataSchema = {
      namespace: '',
      entityTypes: [],
      entitySets: [],
      associations: [],
    };

    // Extract namespace from Schema element
    const schemaMatch = xml.match(/<Schema[^>]+Namespace="([^"]+)"/);
    if (schemaMatch) {
      schema.namespace = schemaMatch[1];
    }

    // Extract EntityTypes
    const entityTypeRegex = /<EntityType[^>]+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EntityType>/g;
    let entityTypeMatch;

    while ((entityTypeMatch = entityTypeRegex.exec(xml)) !== null) {
      const entityName = entityTypeMatch[1];
      const entityContent = entityTypeMatch[2];

      const entityType: ODataEntityType = {
        name: entityName,
        namespace: schema.namespace,
        properties: [],
        navigationProperties: [],
        keys: [],
      };

      // Extract Key properties
      const keyMatch = entityContent.match(/<Key>([\s\S]*?)<\/Key>/);
      if (keyMatch) {
        const propertyRefRegex = /<PropertyRef[^>]+Name="([^"]+)"/g;
        let keyPropMatch;
        while ((keyPropMatch = propertyRefRegex.exec(keyMatch[1])) !== null) {
          entityType.keys.push(keyPropMatch[1]);
        }
      }

      // Extract Properties
      const propertyRegex = /<Property[^>]+Name="([^"]+)"[^>]+Type="([^"]+)"([^>]*)\/>/g;
      let propMatch;

      while ((propMatch = propertyRegex.exec(entityContent)) !== null) {
        const propName = propMatch[1];
        const propType = propMatch[2];
        const propAttrs = propMatch[3];

        const property: ODataProperty = {
          name: propName,
          type: propType,
        };

        // Extract optional attributes
        const nullableMatch = propAttrs.match(/Nullable="([^"]+)"/);
        if (nullableMatch) {
          property.nullable = nullableMatch[1] === 'true';
        }

        const maxLengthMatch = propAttrs.match(/MaxLength="([^"]+)"/);
        if (maxLengthMatch) {
          property.maxLength = maxLengthMatch[1];
        }

        entityType.properties.push(property);
      }

      // Extract NavigationProperties
      const navPropRegex = /<NavigationProperty[^>]+Name="([^"]+)"[^>]+Relationship="([^"]+)"[^>]+FromRole="([^"]+)"[^>]+ToRole="([^"]+)"/g;
      let navPropMatch;

      while ((navPropMatch = navPropRegex.exec(entityContent)) !== null) {
        entityType.navigationProperties.push({
          name: navPropMatch[1],
          relationship: navPropMatch[2],
          fromRole: navPropMatch[3],
          toRole: navPropMatch[4],
        });
      }

      schema.entityTypes.push(entityType);
    }

    // Extract EntitySets
    const entitySetRegex = /<EntitySet[^>]+Name="([^"]+)"[^>]+EntityType="([^"]+)"/g;
    let entitySetMatch;

    while ((entitySetMatch = entitySetRegex.exec(xml)) !== null) {
      schema.entitySets.push({
        name: entitySetMatch[1],
        entityType: entitySetMatch[2],
      });
    }

    // Extract Associations
    const associationRegex = /<Association[^>]+Name="([^"]+)"[^>]*>([\s\S]*?)<\/Association>/g;
    let assocMatch;

    while ((assocMatch = associationRegex.exec(xml)) !== null) {
      const assocName = assocMatch[1];
      const assocContent = assocMatch[2];

      const association: ODataAssociation = {
        name: assocName,
        ends: [],
      };

      // More flexible regex that captures attributes in any order
      const endRegex = /<End([^>]*)>/g;
      let endMatch;

      while ((endMatch = endRegex.exec(assocContent)) !== null) {
        const endAttrs = endMatch[1];
        const roleMatch = endAttrs.match(/Role="([^"]+)"/);
        const typeMatch = endAttrs.match(/Type="([^"]+)"/);
        const multiplicityMatch = endAttrs.match(/Multiplicity="([^"]+)"/);

        if (roleMatch && typeMatch && multiplicityMatch) {
          association.ends.push({
            role: roleMatch[1],
            type: typeMatch[1],
            multiplicity: multiplicityMatch[1],
          });
        }
      }

      // Only add associations that have valid ends
      if (association.ends.length > 0) {
        schema.associations.push(association);
      }
    }

    console.log(`[OData Metadata] Parsed ${schema.entityTypes.length} entity types, ${schema.entitySets.length} entity sets, ${schema.associations.length} associations`);

    return schema;
  }

  /**
   * Get entity type by name
   */
  async getEntityType(entityTypeName: string): Promise<ODataEntityType | null> {
    const metadata = await this.fetchMetadata();
    return metadata.entityTypes.find(et => et.name === entityTypeName) || null;
  }

  /**
   * Get all entity sets
   */
  async getEntitySets(): Promise<ODataEntitySet[]> {
    const metadata = await this.fetchMetadata();
    return metadata.entitySets;
  }

  /**
   * Get human-readable schema summary
   */
  async getSchemaInfo(): Promise<string> {
    const metadata = await this.fetchMetadata();

    let info = `📋 OData V2 Service Schema\n`;
    info += `🌐 Namespace: ${metadata.namespace}\n\n`;

    info += `📦 Entity Sets (${metadata.entitySets.length}):\n`;
    for (const entitySet of metadata.entitySets) {
      const entityTypeName = entitySet.entityType.split('.').pop() || entitySet.entityType;
      const entityType = metadata.entityTypes.find(et => et.name === entityTypeName);

      info += `\n  • ${entitySet.name} -> ${entityTypeName}\n`;

      if (entityType) {
        info += `    Keys: ${entityType.keys.join(', ')}\n`;
        info += `    Properties (${entityType.properties.length}): ${entityType.properties.slice(0, 5).map(p => p.name).join(', ')}${entityType.properties.length > 5 ? '...' : ''}\n`;

        if (entityType.navigationProperties.length > 0) {
          info += `    Navigation: ${entityType.navigationProperties.map(np => np.name).join(', ')}\n`;
        }
      }
    }

    info += `\n🔗 Associations (${metadata.associations.length}):\n`;
    for (const assoc of metadata.associations.slice(0, 10)) {
      if (assoc.ends && assoc.ends.length >= 2) {
        const end1 = assoc.ends[0];
        const end2 = assoc.ends[1];
        info += `  • ${end1.role} (${end1.multiplicity}) ↔ ${end2.role} (${end2.multiplicity})\n`;
      } else {
        info += `  • ${assoc.name} (incomplete association definition)\n`;
      }
    }

    if (metadata.associations.length > 10) {
      info += `  ... and ${metadata.associations.length - 10} more associations\n`;
    }

    return info;
  }

  /**
   * Format entity type details for display
   */
  async getEntityTypeDetails(entityTypeName: string): Promise<string> {
    const metadata = await this.fetchMetadata();
    const entityType = metadata.entityTypes.find(et => et.name === entityTypeName);

    if (!entityType) {
      return `Entity type "${entityTypeName}" not found`;
    }

    let details = `📄 Entity Type: ${entityType.name}\n`;
    details += `🌐 Namespace: ${entityType.namespace}\n\n`;

    details += `🔑 Key Properties:\n`;
    for (const key of entityType.keys) {
      const prop = entityType.properties.find(p => p.name === key);
      if (prop) {
        details += `  • ${key}: ${prop.type}\n`;
      }
    }

    details += `\n📋 Properties (${entityType.properties.length}):\n`;
    for (const prop of entityType.properties) {
      details += `  • ${prop.name}: ${prop.type}`;
      if (prop.nullable === false) details += ' (required)';
      if (prop.maxLength) details += ` [max: ${prop.maxLength}]`;
      details += '\n';
    }

    if (entityType.navigationProperties.length > 0) {
      details += `\n🔗 Navigation Properties (${entityType.navigationProperties.length}):\n`;
      for (const navProp of entityType.navigationProperties) {
        const assoc = metadata.associations.find(a => a.name === navProp.relationship.split('.').pop());
        if (assoc && assoc.ends && assoc.ends.length > 0) {
          const targetEnd = assoc.ends.find(e => e.role === navProp.toRole);
          const targetType = targetEnd?.type.split('.').pop() || 'Unknown';
          details += `  • ${navProp.name} -> ${targetType} (${targetEnd?.multiplicity || '?'})\n`;
        } else {
          details += `  • ${navProp.name} -> (association not found)\n`;
        }
      }
    }

    return details;
  }

  /**
   * Clear cached metadata (force refresh on next fetch)
   */
  clearCache(): void {
    this.cachedMetadata = null;
    console.log('[OData Metadata] Cache cleared');
  }
}
