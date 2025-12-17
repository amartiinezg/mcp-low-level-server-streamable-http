/**
 * 📝 MCP (Model Context Protocol) Sample Server
 *
 * Este archivo implementa un servidor didáctico usando el Model Context Protocol (MCP)
 * para gestionar notas de texto. Utiliza la Low-Level API del SDK MCP y Express.js
 * para exponer endpoints HTTP que permiten listar, leer, crear y resumir notas.
 *
 * Características principales:
 * - Almacenamiento en memoria de notas (sin base de datos).
 * - Exposición de recursos (notas) vía MCP.
 * - Herramienta para crear nuevas notas.
 * - Prompt para resumir todas las notas.
 * - Manejo de sesiones MCP vía HTTP (POST, GET, DELETE).
 *
 * Ideal para aprender cómo funciona MCP y cómo integrar recursos, herramientas y prompts.
 */

// Cargar variables de entorno desde .env en desarrollo
import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";

import { randomUUID } from "node:crypto";
import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import { CAPClient } from "./cap-integration.js";
import { loadIASConfig, initializeJWKSClient, authMiddleware, combinedAuthMiddleware, extractToken } from "./auth/ias-auth.js";
import {
  loadOAuthConfig,
  handleLogin,
  handleCallback,
  handleLogout,
  requireSession,
  getTokenFromSession,
} from "./auth/oauth-flow.js";
import { DestinationServiceClient, loadDestinationServiceConfig } from "./sap-onpremise/destination-service.js";
import { ConnectivityServiceClient, loadConnectivityServiceConfig } from "./sap-onpremise/connectivity-service.js";
import { BusinessPartnerClient } from "./sap-onpremise/business-partner-client.js";
import { ODataV2MetadataParser } from "./sap-onpremise/odata-v2-metadata-parser.js";
import { ODataV2Client } from "./sap-onpremise/odata-v2-client.js";
import { ODataV2Validator } from "./sap-onpremise/odata-v2-validator.js";

/**
 * Tipo para una nota.
 */
type Note = { title: string; content: string };

/**
 * Almacenamiento en memoria de notas.
 * En una app real, esto sería una base de datos.
 */
const notes: { [id: string]: Note } = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" },
};

// 🚀 Inicializa la app Express
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Para OAuth token requests
app.use(cookieParser());

// 🔐 Configuración de autenticación IAS
const iasConfig = loadIASConfig();
initializeJWKSClient(iasConfig);

// 🔐 Configuración de OAuth Flow
const oauthConfig = loadOAuthConfig();

// Mapa de transports por sesión
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Mapa de tokens por sesión (para pasar el token al CAP service)
const sessionTokens: { [sessionId: string]: string } = {};


// 🔗 Cliente CAP para interactuar con OData
const CAP_URL = process.env.CAP_SERVICE_URL || "http://localhost:4004";
console.log(`🔗 Inicializando CAPClient con URL: ${CAP_URL}`);
const capClient = new CAPClient(CAP_URL);

// 🏢 Cliente SAP OnPremise para Business Partner API
const destinationConfig = loadDestinationServiceConfig();
const connectivityConfig = loadConnectivityServiceConfig();
let businessPartnerClient: BusinessPartnerClient | null = null;
let bpODataClient: ODataV2Client | null = null;
let bpMetadataParser: ODataV2MetadataParser | null = null;

// 🏢 Cliente SAP OnPremise para G/L Account Balances
let glAccountODataClient: ODataV2Client | null = null;
let glAccountMetadataParser: ODataV2MetadataParser | null = null;

// 🏢 Cliente SAP OnPremise para Overdue Receivables
let overdueReceivablesODataClient: ODataV2Client | null = null;
let overdueReceivablesMetadataParser: ODataV2MetadataParser | null = null;

// 🏢 Cliente SAP OnPremise para Journal Entries
let journalEntriesODataClient: ODataV2Client | null = null;
let journalEntriesMetadataParser: ODataV2MetadataParser | null = null;

if (destinationConfig) {
  console.log(`🏢 Inicializando SAP OnPremise Clients con destino: ${destinationConfig.destinationName}`);
  const destinationClient = new DestinationServiceClient(destinationConfig);

  let connectivityClient: ConnectivityServiceClient | null = null;
  if (connectivityConfig) {
    console.log('🔗 Connectivity Service configurado - Se usará connectivity-proxy para llamadas OnPremise');
    connectivityClient = new ConnectivityServiceClient(connectivityConfig);
  } else {
    console.warn('⚠️  Connectivity Service no configurado. Se intentará acceso directo (puede fallar para OnPremise).');
  }

  // ==================== Business Partner Client ====================
  businessPartnerClient = new BusinessPartnerClient(destinationClient, connectivityClient);

  // Inicializar cliente OData V2 para Business Partner
  console.log('📋 Inicializando Business Partner OData V2 Client');
  bpODataClient = new ODataV2Client(
    destinationClient,
    connectivityClient,
    '/sap/opu/odata/sap/API_BUSINESS_PARTNER'
  );
  bpMetadataParser = new ODataV2MetadataParser(
    destinationClient,
    connectivityClient,
    '/sap/opu/odata/sap/API_BUSINESS_PARTNER'
  );

  // ==================== G/L Account Balances Client ====================
  console.log('💰 Inicializando G/L Account Balances OData V2 Client');
  glAccountODataClient = new ODataV2Client(
    destinationClient,
    connectivityClient,
    '/sap/opu/odata/sap/C_GLACCOUNTBALANCEQUERY_CDS'
  );
  glAccountMetadataParser = new ODataV2MetadataParser(
    destinationClient,
    connectivityClient,
    '/sap/opu/odata/sap/C_GLACCOUNTBALANCEQUERY_CDS'
  );

  // ==================== Overdue Receivables Client ====================
  console.log('📊 Inicializando Overdue Receivables OData V2 Client');
  overdueReceivablesODataClient = new ODataV2Client(
    destinationClient,
    connectivityClient,
    '/sap/opu/odata/sap/c_overdueacctrbls_cds'
  );
  overdueReceivablesMetadataParser = new ODataV2MetadataParser(
    destinationClient,
    connectivityClient,
    '/sap/opu/odata/sap/c_overdueacctrbls_cds'
  );

  // ==================== Journal Entries Client ====================
  console.log('📓 Inicializando Journal Entries OData V2 Client');
  journalEntriesODataClient = new ODataV2Client(
    destinationClient,
    connectivityClient,
    '/sap/opu/odata/sap/api_journalentryitembasic_srv'
  );
  journalEntriesMetadataParser = new ODataV2MetadataParser(
    destinationClient,
    connectivityClient,
    '/sap/opu/odata/sap/api_journalentryitembasic_srv'
  );

  // Validar conectividad en el inicio (sin bloquear el servidor)
  businessPartnerClient.validateConnectivity().then((isValid) => {
    if (isValid) {
      console.log('✅ [Startup] Business Partner API connectivity validated successfully');
      // Pre-fetch metadata para caché de ambos servicios
      bpMetadataParser?.fetchMetadata().then(() => {
        console.log('✅ [Startup] Business Partner metadata cached successfully');
      }).catch((error) => {
        console.warn('⚠️ [Startup] Failed to cache Business Partner metadata:', error.message);
      });

      glAccountMetadataParser?.fetchMetadata().then(() => {
        console.log('✅ [Startup] G/L Account Balances metadata cached successfully');
      }).catch((error) => {
        console.warn('⚠️ [Startup] Failed to cache G/L Account Balances metadata:', error.message);
      });

      overdueReceivablesMetadataParser?.fetchMetadata().then(() => {
        console.log('✅ [Startup] Overdue Receivables metadata cached successfully');
      }).catch((error) => {
        console.warn('⚠️ [Startup] Failed to cache Overdue Receivables metadata:', error.message);
      });

      journalEntriesMetadataParser?.fetchMetadata().then(() => {
        console.log('✅ [Startup] Journal Entries metadata cached successfully');
      }).catch((error) => {
        console.warn('⚠️ [Startup] Failed to cache Journal Entries metadata:', error.message);
      });
    } else {
      console.warn('⚠️ [Startup] SAP OnPremise connectivity validation failed - tools will be available but may not work');
    }
  }).catch((error) => {
    console.error('❌ [Startup] Failed to validate SAP OnPremise connectivity:', error.message);
  });
} else {
  console.log(`⚠️ SAP OnPremise Clients no inicializados (configuración no encontrada)`);
}

// 🛠️ Crea el servidor MCP con capacidades de recursos, herramientas y prompts
const server = new Server(
  {
    name: "mcp-sampling",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
      // sampling: {}
    },
  }
);

/**
 * 📋 Handler para listar recursos MCP (notas + schema OData).
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = Object.entries(notes).map(([id, note]) => ({
    uri: `note:///${id}`,
    mimeType: "text/plain",
    name: note.title,
    description: `A text note: ${note.title}`,
  }));

  // Add OData schema resources if available
  if (bpMetadataParser) {
    resources.push({
      uri: "sap://businesspartner/schema",
      mimeType: "text/plain",
      name: "SAP Business Partner OData Schema",
      description: "Complete OData V2 schema with entities, properties, and relationships for the Business Partner API",
    });
  }

  if (glAccountMetadataParser) {
    resources.push({
      uri: "sap://glaccount/schema",
      mimeType: "text/plain",
      name: "SAP G/L Account Balances OData Schema",
      description: "Complete OData V2 schema for G/L Account Balances CDS view",
    });
  }

  if (overdueReceivablesMetadataParser) {
    resources.push({
      uri: "sap://overduereceivables/schema",
      mimeType: "text/plain",
      name: "SAP Overdue Receivables OData Schema",
      description: "Complete OData V2 schema for Overdue Receivables CDS view",
    });
  }

  return { resources };
});

/**
 * 📖 Handler para leer el contenido de recursos (notas + schemas OData).
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);

  // Handle SAP Business Partner OData schema resource
  if (url.protocol === 'sap:' && url.pathname === '//businesspartner/schema') {
    if (!bpMetadataParser) {
      throw new Error('Business Partner OData schema not available - Business Partner API not configured');
    }

    const schemaInfo = await bpMetadataParser.getSchemaInfo();

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "text/plain",
          text: schemaInfo,
        },
      ],
    };
  }

  // Handle SAP G/L Account Balances OData schema resource
  if (url.protocol === 'sap:' && url.pathname === '//glaccount/schema') {
    if (!glAccountMetadataParser) {
      throw new Error('G/L Account Balances OData schema not available - SAP OnPremise not configured');
    }

    const schemaInfo = await glAccountMetadataParser.getSchemaInfo();

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "text/plain",
          text: schemaInfo,
        },
      ],
    };
  }

  // Handle SAP Overdue Receivables OData schema resource
  if (url.protocol === 'sap:' && url.pathname === '//overduereceivables/schema') {
    if (!overdueReceivablesMetadataParser) {
      throw new Error('Overdue Receivables OData schema not available - SAP OnPremise not configured');
    }

    const schemaInfo = await overdueReceivablesMetadataParser.getSchemaInfo();

    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: "text/plain",
          text: schemaInfo,
        },
      ],
    };
  }

  // Handle note resources
  const id = url.pathname.replace(/^\//, "");
  const note = notes[id];

  if (!note) {
    throw new Error(`Note ${id} not found`);
  }

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "text/plain",
        text: note.content,
      },
    ],
  };
});

/**
 * 🛠️ Handler para listar herramientas disponibles.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "CAP_List_Products",
        description: "Lista todos los productos disponibles en el catálogo OData de CAP",
        inputSchema: {
          type: "object",
          properties: {
            filterByLowStock: {
              type: "boolean",
              description: "Si es true, filtra solo productos con bajo stock (menos de 10 unidades)",
            },
            threshold: {
              type: "number",
              description: "Umbral de stock para filtrar (solo si filterByLowStock es true)",
            },
          },
        },
      },
      {
        name: "CAP_Create_Order",
        description: "Crea una nueva orden de compra en el sistema CAP con productos específicos",
        inputSchema: {
          type: "object",
          properties: {
            customerName: {
              type: "string",
              description: "Nombre del cliente que realiza la orden",
            },
            items: {
              type: "array",
              description: "Lista de productos a ordenar con sus cantidades",
              items: {
                type: "object",
                properties: {
                  productId: {
                    type: "string",
                    description: "UUID del producto",
                  },
                  quantity: {
                    type: "number",
                    description: "Cantidad de unidades a ordenar",
                  },
                },
                required: ["productId", "quantity"],
              },
            },
          },
          required: ["customerName", "items"],
        },
      },
      {
        name: "CAP_Update_Order_Status",
        description: "Actualiza el estado de una orden existente en el sistema CAP",
        inputSchema: {
          type: "object",
          properties: {
            orderId: {
              type: "string",
              description: "UUID de la orden a actualizar",
            },
            newStatus: {
              type: "string",
              description: "Nuevo estado de la orden",
              enum: ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
            },
          },
          required: ["orderId", "newStatus"],
        },
      },
      {
        name: "SAP_Business_Partner",
        description: "Consulta información de Business Partners desde SAP S/4HANA incluyendo datos maestros, direcciones, contactos, roles, bancos y datos fiscales. Soporta filtrado, expansión de navegaciones, selección de campos, ordenamiento y paginación.",
        inputSchema: {
          type: "object",
          properties: {
            entitySet: {
              type: "string",
              description: "Nombre del EntitySet a consultar (ej: 'A_BusinessPartner', 'A_BusinessPartnerAddress', 'A_AddressEmailAddress').",
            },
            key: {
              type: "string",
              description: "Clave de la entidad para recuperar un registro específico (ej: '1000001'). Si se proporciona, retorna solo ese registro.",
            },
            filter: {
              type: "string",
              description: "Expresión de filtro OData V2 para la entidad raíz.",
            },
            select: {
              type: "string",
              description: "Propiedades a seleccionar separadas por comas.",
            },
            expand: {
              type: "string",
              description: "Propiedades de navegación a expandir separadas por comas.",
            },
            orderby: {
              type: "string",
              description: "Propiedad y dirección de ordenamiento (asc o desc).",
            },
            top: {
              type: "number",
              description: "Número máximo de registros a retornar (paginación). Solo aplica a la entidad raíz.",
            },
            skip: {
              type: "number",
              description: "Número de registros a saltar (paginación)",
            },
            inlinecount: {
              type: "string",
              description: "Incluir conteo total de resultados ('allpages' o 'none')",
              enum: ["allpages", "none"],
            },
          },
          required: ["entitySet"],
        },
      },
      {
        name: "SAP_GL_Account",
        description: "Consulta saldos de cuentas contables (G/L Account Balances) desde SAP S/4HANA usando función parametrizada. IMPORTANTE: Para ver balances, incluir campos StartingBalAmtInDspCrcy, DebitAmountInDisplayCrcy, CreditAmountInDisplayCrcy, EndingBalAmtInDspCrcy en el select.",
        inputSchema: {
          type: "object",
          properties: {
            P_CompanyCode: {
              type: "string",
              description: "Código de sociedad (Company Code). Requerido.",
            },
            P_FiscalYear: {
              type: "string",
              description: "Año fiscal. Requerido.",
            },
            P_Ledger: {
              type: "string",
              description: "Libro mayor (Ledger). Requerido.",
            },
            P_CurrencyRole: {
              type: "string",
              description: "Rol de moneda (normalmente '10'). Requerido.",
            },
            P_DisplayAltvAcct: {
              type: "string",
              description: "Display Alternative Account (normalmente ' '). Requerido.",
            },
            P_FromPostingDate: {
              type: "string",
              description: "Fecha desde en formato datetime (ej: datetime'2024-11-01T00:00:00'). Requerido.",
            },
            P_ToPostingDate: {
              type: "string",
              description: "Fecha hasta en formato datetime (ej: datetime'2024-11-30T00:00:00'). Requerido.",
            },
            P_FiscalPeriod: {
              type: "string",
              description: "Período fiscal (ej: '011'). Requerido.",
            },
            P_DspTimeDependentDesc: {
              type: "string",
              description: "Display Time Dependent Description (normalmente ' '). Requerido.",
            },
            filter: {
              type: "string",
              description: "Expresión de filtro OData V2 para filtrar resultados (ej: \"GLAccount eq '61007000'\").",
            },
            select: {
              type: "string",
              description: "Propiedades a seleccionar separadas por comas.",
            },
            expand: {
              type: "string",
              description: "Propiedades de navegación a expandir separadas por comas.",
            },
            orderby: {
              type: "string",
              description: "Propiedad y dirección de ordenamiento (asc o desc).",
            },
            top: {
              type: "number",
              description: "Número máximo de registros a retornar (paginación).",
            },
            skip: {
              type: "number",
              description: "Número de registros a saltar (paginación)",
            },
            inlinecount: {
              type: "string",
              description: "Incluir conteo total de resultados ('allpages' o 'none')",
              enum: ["allpages", "none"],
            },
          },
          required: ["P_CompanyCode", "P_FiscalYear", "P_Ledger", "P_CurrencyRole", "P_DisplayAltvAcct", "P_FromPostingDate", "P_ToPostingDate", "P_FiscalPeriod", "P_DspTimeDependentDesc"],
        },
      },
      {
        name: "SAP_Overdue_Receivables",
        description: "Consulta cuentas por cobrar vencidas (Overdue Receivables) desde SAP S/4HANA usando función parametrizada. Permite analizar cuentas vencidas por intervalos de días, cliente, sociedad y otros criterios de gestión de cobros.",
        inputSchema: {
          type: "object",
          properties: {
            P_DateFunction: {
              type: "string",
              description: "Función de fecha para el cálculo de vencimientos. Requerido.",
            },
            P_DisplayCurrency: {
              type: "string",
              description: "Moneda de visualización (ej: 'EUR', 'USD'). Requerido.",
            },
            P_ExchangeRateType: {
              type: "string",
              description: "Tipo de cambio a usar (ej: 'M' para tipo medio). Requerido.",
            },
            P_NetDueInterval1InDays: {
              type: "string",
              description: "Intervalo 1 en días para clasificación de vencimientos (ej: '30'). Requerido.",
            },
            P_NetDueInterval2InDays: {
              type: "string",
              description: "Intervalo 2 en días para clasificación de vencimientos (ej: '60'). Requerido.",
            },
            P_NetDueInterval3InDays: {
              type: "string",
              description: "Intervalo 3 en días para clasificación de vencimientos (ej: '90'). Requerido.",
            },
            filter: {
              type: "string",
              description: "Expresión de filtro OData V2 para filtrar resultados.",
            },
            select: {
              type: "string",
              description: "Propiedades a seleccionar separadas por comas.",
            },
            expand: {
              type: "string",
              description: "Propiedades de navegación a expandir separadas por comas.",
            },
            orderby: {
              type: "string",
              description: "Propiedad y dirección de ordenamiento (asc o desc).",
            },
            top: {
              type: "number",
              description: "Número máximo de registros a retornar (paginación).",
            },
            skip: {
              type: "number",
              description: "Número de registros a saltar (paginación).",
            },
            inlinecount: {
              type: "string",
              description: "Incluir conteo total de resultados ('allpages' o 'none')",
              enum: ["allpages", "none"],
            },
          },
          required: ["P_DateFunction", "P_DisplayCurrency", "P_ExchangeRateType", "P_NetDueInterval1InDays", "P_NetDueInterval2InDays", "P_NetDueInterval3InDays"],
        },
      },
      {
        name: "SAP_Journal_Entries",
        description: "Consulta asientos contables (Journal Entries) desde SAP S/4HANA incluyendo documentos contables, partidas individuales, centros de coste, segmentos y detalles de contabilización. Soporta filtrado, expansión de navegaciones, selección de campos, ordenamiento y paginación.",
        inputSchema: {
          type: "object",
          properties: {
            entitySet: {
              type: "string",
              description: "Nombre del EntitySet a consultar (ej: 'A_JournalEntryItem', 'A_OperationalAcctgDocItem').",
            },
            key: {
              type: "string",
              description: "Clave de la entidad para recuperar un registro específico. Si se proporciona, retorna solo ese registro.",
            },
            filter: {
              type: "string",
              description: "Expresión de filtro OData V2 para la entidad raíz.",
            },
            select: {
              type: "string",
              description: "Propiedades a seleccionar separadas por comas.",
            },
            expand: {
              type: "string",
              description: "Propiedades de navegación a expandir separadas por comas.",
            },
            orderby: {
              type: "string",
              description: "Propiedad y dirección de ordenamiento (asc o desc).",
            },
            top: {
              type: "number",
              description: "Número máximo de registros a retornar (paginación).",
            },
            skip: {
              type: "number",
              description: "Número de registros a saltar (paginación).",
            },
            inlinecount: {
              type: "string",
              description: "Incluir conteo total de resultados ('allpages' o 'none')",
              enum: ["allpages", "none"],
            },
          },
          required: ["entitySet"],
        },
      },
      {
        name: "SAP_Get_Schema",
        description: "Obtiene información detallada sobre el schema de servicios OData V2 SAP, incluyendo EntitySets disponibles, propiedades de cada entidad, claves primarias, tipos de datos y relaciones/navegaciones.",
        inputSchema: {
          type: "object",
          properties: {
            service: {
              type: "string",
              description: "Servicio SAP a consultar: 'businesspartner' para Business Partner API, 'glaccount' para G/L Account Balances, 'overduereceivables' para Overdue Receivables, o 'journalentries' para Journal Entries",
              enum: ["businesspartner", "glaccount", "overduereceivables", "journalentries"],
            },
            entityType: {
              type: "string",
              description: "Nombre del tipo de entidad para obtener detalles específicos (ej: 'A_BusinessPartner', 'GLAccountBalance'). Si no se proporciona, retorna un resumen de todas las entidades.",
            },
          },
          required: ["service"],
        },
      },
    ],
  };
});

/**
 * Helper para obtener el token de autenticación de la sesión actual
 */
function getCurrentSessionToken(): string | undefined {
  // Buscar el token en las sesiones activas
  // Nota: Esto funciona porque cada request MCP tiene una sesión asociada
  const sessionIds = Object.keys(sessionTokens);
  if (sessionIds.length > 0) {
    // Retornar el token de la última sesión activa
    return sessionTokens[sessionIds[sessionIds.length - 1]];
  }
  return undefined;
}


/**
 * 📝 Handler para las herramientas (tools).
 */
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  // Obtener el token de autenticación de la sesión
  const authToken = getCurrentSessionToken();

  // Si hay token, actualizar el CAPClient con el token
  if (authToken) {
    console.log(`[CallTool] Usando token de autenticación para llamada a CAP service`);
    capClient.setAuthToken(authToken);
  } else {
    console.log(`[CallTool] No hay token de autenticación disponible`);
    capClient.clearAuthToken();
  }

  switch (request.params.name) {
    case "CAP_List_Products": {
      try {
        const filterByLowStock = request.params.arguments?.filterByLowStock as boolean;
        const threshold = request.params.arguments?.threshold as number;

        let products;
        if (filterByLowStock) {
          products = await capClient.getLowStockProducts(threshold || 10);
        } else {
          products = await capClient.getProducts();
        }

        const productList = products.map((p: any) =>
          `- ${p.name} (${p.category})\n  Precio: $${p.price} | Stock: ${p.stock} unidades\n  ID: ${p.ID}`
        ).join('\n\n');

        return {
          content: [
            {
              type: "text",
              text: `📦 Productos encontrados: ${products.length}\n\n${productList || 'No hay productos disponibles'}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Error al obtener productos: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "CAP_Create_Order": {
      try {
        const customerName = String(request.params.arguments?.customerName);
        const items = request.params.arguments?.items as Array<{ productId: string; quantity: number }>;

        if (!customerName || !items || items.length === 0) {
          throw new Error("customerName e items son requeridos");
        }

        const result = await capClient.createCompleteOrder(customerName, items);

        return {
          content: [
            {
              type: "text",
              text: `✅ Orden creada exitosamente!\n\n` +
                `📋 Número de Orden: ${result.orderNumber}\n` +
                `🆔 ID: ${result.orderId}\n` +
                `💰 Total: $${result.totalAmount}\n` +
                `👤 Cliente: ${customerName}\n` +
                `📦 Productos: ${items.length} ítems`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Error al crear orden: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "CAP_Update_Order_Status": {
      try {
        const orderId = String(request.params.arguments?.orderId);
        const newStatus = String(request.params.arguments?.newStatus);

        if (!orderId || !newStatus) {
          throw new Error("orderId y newStatus son requeridos");
        }

        const updatedOrder = await capClient.updateOrderStatus(orderId, newStatus);

        return {
          content: [
            {
              type: "text",
              text: `✅ Estado de orden actualizado!\n\n` +
                `📋 Orden: ${updatedOrder.orderNumber}\n` +
                `🔄 Nuevo Estado: ${updatedOrder.status}\n` +
                `👤 Cliente: ${updatedOrder.customerName}\n` +
                `💰 Total: $${updatedOrder.totalAmount}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Error al actualizar estado de orden: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "SAP_Business_Partner": {
      if (!bpODataClient) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Business Partner OData Client no está configurado. Por favor configure las variables de entorno BTP_DESTINATION_*`,
            },
          ],
          isError: true,
        };
      }

      try {
        const entitySet = String(request.params.arguments?.entitySet);
        const key = request.params.arguments?.key as string | undefined;
        const filter = request.params.arguments?.filter as string | undefined;
        const select = request.params.arguments?.select as string | undefined;
        const expand = request.params.arguments?.expand as string | undefined;
        const orderby = request.params.arguments?.orderby as string | undefined;
        const top = request.params.arguments?.top as number | undefined;
        const skip = request.params.arguments?.skip as number | undefined;
        const inlinecount = request.params.arguments?.inlinecount as 'allpages' | 'none' | undefined;

        if (!entitySet) {
          throw new Error("entitySet es requerido");
        }

        // ✨ Validar query contra restricciones de S/4HANA 2022
        const validation = ODataV2Validator.validateQuery({
          entitySet,
          select,
          expand,
          filter
        });

        // Si hay errores críticos, retornar advertencias sin ejecutar
        if (!validation.isValid) {
          const warningText = ODataV2Validator.formatWarnings(validation.warnings);
          const suggestions = ODataV2Validator.suggestAlternatives({
            entitySet,
            select,
            expand,
            filter
          });

          return {
            content: [
              {
                type: "text",
                text: `❌ Query NO compatible con S/4HANA 2022 On-Premise\n${warningText}${suggestions.length > 0 ? '\n' + suggestions.join('\n') : ''}`,
              },
            ],
            isError: true,
          };
        }

        // Si solo hay warnings (no errores), ejecutar pero mostrar advertencias
        const warningText = validation.warnings.length > 0
          ? ODataV2Validator.formatWarnings(validation.warnings)
          : '';

        console.log(`[sap_businesspartner_query] Consultando EntitySet: ${entitySet}`);

        const result = await bpODataClient.query({
          entitySet,
          key,
          filter,
          select,
          expand,
          orderby,
          top,
          skip,
          inlinecount,
        });

        const formattedResults = ODataV2Client.formatResults(result.results, { maxResults: 20 });

        let responseText = warningText; // Incluir warnings si existen
        responseText += `✅ Business Partner - Consulta OData ejecutada exitosamente\n\n`;
        responseText += `📊 EntitySet: ${entitySet}\n`;
        if (key) responseText += `🔑 Key: ${key}\n`;
        if (result.count !== undefined) responseText += `📈 Total count: ${result.count}\n`;
        responseText += `📦 Resultados retornados: ${result.results.length}\n\n`;
        responseText += formattedResults;

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        // 🚀 Validación proactiva: Si el error parece ser de EntityType o propiedad no válida, incluir schema
        const entitySet = String(request.params.arguments?.entitySet || '');
        let errorMessage = `❌ Error al ejecutar consulta Business Partner OData: ${error.message}`;

        // Detectar errores relacionados con schema inválido
        const isSchemaError = error.message.includes('not found') ||
          error.message.includes('invalid') ||
          error.message.includes('does not exist') ||
          error.message.includes('Unknown') ||
          error.message.toLowerCase().includes('property');

        if (isSchemaError && bpMetadataParser) {
          try {
            // Agregar información del schema para ayudar al usuario
            const schemaInfo = await bpMetadataParser.getSchemaInfo();
            errorMessage += `\n\n💡 **Available Schema:**\n\n`;
            errorMessage += `📋 EntitySets disponibles:\n${schemaInfo.split('\n').slice(0, 30).join('\n')}`;
            errorMessage += `\n\n... (usa 'sap_get_schema_info' con service='businesspartner' para ver el schema completo)`;
          } catch (schemaError) {
            console.error('[sap_businesspartner_query] Error obteniendo schema:', schemaError);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }
    }

    case "SAP_GL_Account": {
      if (!glAccountODataClient) {
        return {
          content: [
            {
              type: "text",
              text: `❌ G/L Account Balances OData Client no está configurado. Por favor configure las variables de entorno BTP_DESTINATION_*`,
            },
          ],
          isError: true,
        };
      }

      try {
        // Extraer parámetros de función requeridos
        const P_CompanyCode = String(request.params.arguments?.P_CompanyCode || '');
        const P_FiscalYear = String(request.params.arguments?.P_FiscalYear || '');
        const P_Ledger = String(request.params.arguments?.P_Ledger || '');
        const P_CurrencyRole = String(request.params.arguments?.P_CurrencyRole || '');
        const P_DisplayAltvAcct = String(request.params.arguments?.P_DisplayAltvAcct || '');
        const P_FromPostingDate = String(request.params.arguments?.P_FromPostingDate || '');
        const P_ToPostingDate = String(request.params.arguments?.P_ToPostingDate || '');
        const P_FiscalPeriod = String(request.params.arguments?.P_FiscalPeriod || '');
        const P_DspTimeDependentDesc = String(request.params.arguments?.P_DspTimeDependentDesc || '');

        // Validar parámetros requeridos
        const missingParams: string[] = [];
        if (!P_CompanyCode) missingParams.push('P_CompanyCode');
        if (!P_FiscalYear) missingParams.push('P_FiscalYear');
        if (!P_Ledger) missingParams.push('P_Ledger');
        if (!P_CurrencyRole) missingParams.push('P_CurrencyRole');
        if (!P_DisplayAltvAcct) missingParams.push('P_DisplayAltvAcct');
        if (!P_FromPostingDate) missingParams.push('P_FromPostingDate');
        if (!P_ToPostingDate) missingParams.push('P_ToPostingDate');
        if (!P_FiscalPeriod) missingParams.push('P_FiscalPeriod');
        if (!P_DspTimeDependentDesc) missingParams.push('P_DspTimeDependentDesc');

        if (missingParams.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Parámetros requeridos faltantes: ${missingParams.join(', ')}`,
              },
            ],
            isError: true,
          };
        }

        // Extraer query options opcionales
        const filter = request.params.arguments?.filter as string | undefined;
        const select = request.params.arguments?.select as string | undefined;
        const expand = request.params.arguments?.expand as string | undefined;
        const orderby = request.params.arguments?.orderby as string | undefined;
        const top = request.params.arguments?.top as number | undefined;
        const skip = request.params.arguments?.skip as number | undefined;
        const inlinecount = request.params.arguments?.inlinecount as 'allpages' | 'none' | undefined;

        // Construir objeto de parámetros de función para la URL
        const functionParams: Record<string, string> = {
          P_CompanyCode: `'${P_CompanyCode}'`,
          P_FiscalYear: `'${P_FiscalYear}'`,
          P_Ledger: `'${P_Ledger}'`,
          P_CurrencyRole: `'${P_CurrencyRole}'`,
          P_DisplayAltvAcct: `'${P_DisplayAltvAcct}'`,
          P_FromPostingDate: P_FromPostingDate,
          P_ToPostingDate: P_ToPostingDate,
          P_FiscalPeriod: `'${P_FiscalPeriod}'`,
          P_DspTimeDependentDesc: `'${P_DspTimeDependentDesc}'`
        };

        console.log(`[sap_glaccount_query] Ejecutando función C_GLACCOUNTBALANCEQUERY con parámetros:`, functionParams);

        const result = await glAccountODataClient.query({
          entitySet: 'C_GLACCOUNTBALANCEQUERY',
          functionParams,
          filter,
          select,
          expand,
          orderby,
          top,
          skip,
          inlinecount,
        });

        const formattedResults = ODataV2Client.formatResults(result.results, { maxResults: 20 });

        let responseText = `✅ G/L Account Balances - Consulta ejecutada exitosamente\n\n`;
        responseText += `📊 Función: C_GLACCOUNTBALANCEQUERY\n`;
        responseText += `📅 Período: ${P_FiscalYear}/${P_FiscalPeriod}\n`;
        if (result.count !== undefined) responseText += `📈 Total count: ${result.count}\n`;
        responseText += `📦 Resultados retornados: ${result.results.length}\n\n`;
        responseText += formattedResults;

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        console.error('[sap_glaccount_query] Error ejecutando query:', error);
        let errorMessage = `❌ Error al ejecutar consulta G/L Account Balances: ${error.message}\n\n`;
        errorMessage += `💡 Verifica que los parámetros tengan el formato correcto y que los campos del select/filter existan en el schema.\n`;
        errorMessage += `💡 Usa 'sap_get_schema_info' con service='glaccount' para ver el schema disponible.`;

        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }
    }

    case "SAP_Overdue_Receivables": {
      if (!overdueReceivablesODataClient) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Overdue Receivables OData Client no está configurado. Por favor configure las variables de entorno BTP_DESTINATION_*`,
            },
          ],
          isError: true,
        };
      }

      try {
        // Extraer parámetros de función obligatorios
        const P_DateFunction = String(request.params.arguments?.P_DateFunction || '');
        const P_DisplayCurrency = String(request.params.arguments?.P_DisplayCurrency || '');
        const P_ExchangeRateType = String(request.params.arguments?.P_ExchangeRateType || '');
        const P_NetDueInterval1InDays = String(request.params.arguments?.P_NetDueInterval1InDays || '');
        const P_NetDueInterval2InDays = String(request.params.arguments?.P_NetDueInterval2InDays || '');
        const P_NetDueInterval3InDays = String(request.params.arguments?.P_NetDueInterval3InDays || '');

        // Extraer parámetros opcionales de OData
        const filter = request.params.arguments?.filter as string | undefined;
        const select = request.params.arguments?.select as string | undefined;
        const expand = request.params.arguments?.expand as string | undefined;
        const orderby = request.params.arguments?.orderby as string | undefined;
        const top = request.params.arguments?.top as number | undefined;
        const skip = request.params.arguments?.skip as number | undefined;
        const inlinecount = request.params.arguments?.inlinecount as 'allpages' | 'none' | undefined;

        // Validar parámetros obligatorios
        const missingParams: string[] = [];
        if (!P_DateFunction) missingParams.push('P_DateFunction');
        if (!P_DisplayCurrency) missingParams.push('P_DisplayCurrency');
        if (!P_ExchangeRateType) missingParams.push('P_ExchangeRateType');
        if (!P_NetDueInterval1InDays) missingParams.push('P_NetDueInterval1InDays');
        if (!P_NetDueInterval2InDays) missingParams.push('P_NetDueInterval2InDays');
        if (!P_NetDueInterval3InDays) missingParams.push('P_NetDueInterval3InDays');

        if (missingParams.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Parámetros requeridos faltantes: ${missingParams.join(', ')}\n\n💡 Esta función requiere 6 parámetros obligatorios para calcular los intervalos de vencimiento.`,
              },
            ],
            isError: true,
          };
        }

        // Construir objeto de parámetros de función
        const functionParams: Record<string, string> = {
          P_DateFunction: `'${P_DateFunction}'`,
          P_DisplayCurrency: `'${P_DisplayCurrency}'`,
          P_ExchangeRateType: `'${P_ExchangeRateType}'`,
          P_NetDueInterval1InDays: `'${P_NetDueInterval1InDays}'`,
          P_NetDueInterval2InDays: `'${P_NetDueInterval2InDays}'`,
          P_NetDueInterval3InDays: `'${P_NetDueInterval3InDays}'`
        };

        console.log(`[sap_overduereceivables_query] Ejecutando función C_OVERDUEACCTRBLS con parámetros:`, functionParams);

        // Ejecutar query con function import
        const result = await overdueReceivablesODataClient.query({
          entitySet: 'C_OVERDUEACCTRBLS',
          functionParams,
          filter,
          select,
          expand,
          orderby,
          top,
          skip,
          inlinecount,
        });

        const formattedResults = ODataV2Client.formatResults(result.results, { maxResults: 20 });

        let responseText = `✅ Overdue Receivables - Consulta ejecutada exitosamente\n\n`;
        responseText += `📊 Función: C_OVERDUEACCTRBLS\n`;
        responseText += `💱 Moneda: ${P_DisplayCurrency}, Tipo cambio: ${P_ExchangeRateType}\n`;
        responseText += `📅 Intervalos: ${P_NetDueInterval1InDays}/${P_NetDueInterval2InDays}/${P_NetDueInterval3InDays} días\n`;
        if (result.count !== undefined) responseText += `📈 Total count: ${result.count}\n`;
        responseText += `📦 Resultados retornados: ${result.results.length}\n\n`;
        responseText += formattedResults;

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        console.error('[sap_overduereceivables_query] Error ejecutando query:', error);
        return {
          content: [
            {
              type: "text",
              text: `❌ Error ejecutando Overdue Receivables query:\n\n${error.message}\n\n💡 Verifica los parámetros. Usa 'sap_get_schema_info' con service='overduereceivables' para ver las properties disponibles.`,
            },
          ],
          isError: true,
        };
      }
    }

    case "SAP_Journal_Entries": {
      if (!journalEntriesODataClient) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Journal Entries OData Client no está configurado. Por favor configure las variables de entorno BTP_DESTINATION_*`,
            },
          ],
          isError: true,
        };
      }

      try {
        const entitySet = String(request.params.arguments?.entitySet);
        const key = request.params.arguments?.key as string | undefined;
        const filter = request.params.arguments?.filter as string | undefined;
        const select = request.params.arguments?.select as string | undefined;
        const expand = request.params.arguments?.expand as string | undefined;
        const orderby = request.params.arguments?.orderby as string | undefined;
        const top = request.params.arguments?.top as number | undefined;
        const skip = request.params.arguments?.skip as number | undefined;
        const inlinecount = request.params.arguments?.inlinecount as 'allpages' | 'none' | undefined;

        if (!entitySet) {
          throw new Error("entitySet es requerido");
        }

        // ✨ Validar query contra restricciones de S/4HANA 2022
        const validation = ODataV2Validator.validateQuery({
          entitySet,
          select,
          expand,
          filter
        });

        let warningText = '';
        if (validation.warnings.length > 0) {
          warningText = `⚠️  ADVERTENCIAS:\n${validation.warnings.map(w => `  • ${w}`).join('\n')}\n\n`;
        }

        // Ejecutar query
        const result = await journalEntriesODataClient.query({
          entitySet,
          key,
          filter,
          select,
          expand,
          orderby,
          top,
          skip,
          inlinecount,
        });

        const formattedResults = ODataV2Client.formatResults(result.results, { maxResults: 20 });

        let responseText = warningText; // Incluir warnings si existen
        responseText += `✅ Journal Entries - Consulta OData ejecutada exitosamente\n\n`;
        responseText += `📊 EntitySet: ${entitySet}\n`;
        if (key) responseText += `🔑 Key: ${key}\n`;
        if (result.count !== undefined) responseText += `📈 Total count: ${result.count}\n`;
        responseText += `📦 Resultados retornados: ${result.results.length}\n\n`;
        responseText += formattedResults;

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error: any) {
        console.error('[sap_journalentries_query] Error ejecutando query:', error);

        // 🚀 Validación proactiva: Si el error parece ser de EntityType o propiedad no válida, incluir schema
        const entitySet = String(request.params.arguments?.entitySet || '');
        let errorMessage = `❌ Error al ejecutar consulta Journal Entries OData: ${error.message}`;

        // Detectar errores relacionados con schema inválido
        const isSchemaError = error.message.includes('not found') ||
          error.message.includes('invalid') ||
          error.message.includes('does not exist') ||
          error.message.includes('Unknown') ||
          error.message.toLowerCase().includes('property');

        if (isSchemaError && journalEntriesMetadataParser) {
          try {
            // Agregar información del schema para ayudar al usuario
            const schemaInfo = await journalEntriesMetadataParser.getSchemaInfo();
            errorMessage += `\n\n💡 **Available Schema:**\n\n`;
            errorMessage += `📋 EntitySets disponibles:\n${schemaInfo.split('\n').slice(0, 30).join('\n')}`;
            errorMessage += `\n\n... (usa 'SAP_Get_Schema' con service='journalentries' para ver el schema completo)`;
          } catch (schemaError) {
            console.error('[sap_journalentries_query] Error obteniendo schema:', schemaError);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }
    }

    case "SAP_Get_Schema": {
      const service = request.params.arguments?.service as string;

      // Select appropriate parser based on service parameter
      let metadataParser: ODataV2MetadataParser | null = null;
      let serviceName: string = "";

      if (service === "businesspartner") {
        metadataParser = bpMetadataParser;
        serviceName = "Business Partner";
      } else if (service === "glaccount") {
        metadataParser = glAccountMetadataParser;
        serviceName = "G/L Account Balances";
      } else if (service === "overduereceivables") {
        metadataParser = overdueReceivablesMetadataParser;
        serviceName = "Overdue Receivables";
      } else if (service === "journalentries") {
        metadataParser = journalEntriesMetadataParser;
        serviceName = "Journal Entries";
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ Servicio desconocido: '${service}'. Usa 'businesspartner', 'glaccount', 'overduereceivables' o 'journalentries'.`,
            },
          ],
          isError: true,
        };
      }

      if (!metadataParser) {
        return {
          content: [
            {
              type: "text",
              text: `❌ ${serviceName} Metadata Parser no está configurado. Por favor configure las variables de entorno BTP_DESTINATION_*`,
            },
          ],
          isError: true,
        };
      }

      try {
        const entityType = request.params.arguments?.entityType as string | undefined;

        if (entityType) {
          // Get details for specific entity type
          const details = await metadataParser.getEntityTypeDetails(entityType);
          return {
            content: [
              {
                type: "text",
                text: `✅ ${serviceName} - Detalles del Entity Type:\n\n${details}`,
              },
            ],
          };
        } else {
          // Special handling for G/L Account: show C_GLACCOUNTBALANCEQUERYResult EntityType by default
          if (service === "glaccount") {
            const details = await metadataParser.getEntityTypeDetails('C_GLACCOUNTBALANCEQUERYResult');
            return {
              content: [
                {
                  type: "text",
                  text: `✅ ${serviceName} - Properties disponibles en C_GLACCOUNTBALANCEQUERYResult:\n\n${details}\n\n💡 Este EntityType contiene los campos con los que se trabaja en las consultas de G/L Account Balances.`,
                },
              ],
            };
          } else if (service === "overduereceivables") {
            // Special handling for Overdue Receivables: show C_OVERDUEACCTRBLSResult EntityType by default
            const details = await metadataParser.getEntityTypeDetails('C_OVERDUEACCTRBLSResult');
            return {
              content: [
                {
                  type: "text",
                  text: `✅ ${serviceName} - Properties disponibles en C_OVERDUEACCTRBLSResult:\n\n${details}\n\n💡 Este EntityType contiene los campos con los que se trabaja en las consultas de Overdue Receivables.`,
                },
              ],
            };
          } else {
            // Get schema overview for other services
            const schemaInfo = await metadataParser.getSchemaInfo();
            return {
              content: [
                {
                  type: "text",
                  text: `✅ ${serviceName} - Schema Info:\n\n${schemaInfo}`,
                },
              ],
            };
          }
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Error al obtener información del schema de ${serviceName}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * 💡 Handler para listar prompts disponibles.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "sap_businesspartner_query_with_schema",
        description: "Query SAP Business Partner API with automatic schema context. Use this prompt instead of directly calling tools to get faster results and avoid invalid queries.",
        arguments: [
          {
            name: "query_description",
            description: "Natural language description of what you want to query (e.g., 'Find business partners with name Smith', 'Get addresses for BP 1000001')",
            required: true,
          },
        ],
      },
      {
        name: "sap_glaccount_query_with_schema",
        description: "Query SAP G/L Account Balances with automatic schema context. Use this prompt instead of directly calling tools to get faster results and avoid invalid queries.",
        arguments: [
          {
            name: "query_description",
            description: "Natural language description of what you want to query (e.g., 'Get balances for company code 1010 in ledger 0L for 2024')",
            required: true,
          },
        ],
      },
    ],
  };
});

/**
 * 🧠 Handler para prompts.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const promptName = request.params.name;

  // Prompt: sap_businesspartner_query_with_schema
  if (promptName === "sap_businesspartner_query_with_schema") {
    const queryDescription = request.params.arguments?.query_description as string;

    if (!queryDescription) {
      throw new Error("query_description argument is required");
    }

    // Obtener el schema automáticamente
    let schemaInfo = "Business Partner schema not available";
    if (bpMetadataParser) {
      try {
        schemaInfo = await bpMetadataParser.getSchemaInfo();
      } catch (error) {
        console.error("[Prompt] Error obteniendo schema de Business Partner:", error);
        schemaInfo = "⚠️ Error loading Business Partner schema. Available EntitySets: A_BusinessPartner, A_BusinessPartnerAddress, A_AddressEmailAddress, A_BusinessPartnerBank, A_BusinessPartnerRole";
      }
    }

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `📋 SAP Business Partner API Schema:

${schemaInfo}

⚠️ IMPORTANT RESTRICTIONS (S/4HANA 2022 On-Premise OData V2):
1. ❌ DO NOT combine $select with $expand - the expand will disappear
2. ❌ DO NOT use $select inside $expand - syntax not supported
3. ❌ DO NOT use $filter with any() lambda operator
4. ✅ For complex queries, use multiple simple calls
5. ✅ Query navigation EntitySets directly when needed

👤 User Query: "${queryDescription}"

📝 Task: Based on the schema above and the restrictions, construct the appropriate query using the 'sap_odata_query' tool. If the query needs multiple calls, explain the strategy first.`,
          },
        },
      ],
    };
  }

  // Prompt: sap_glaccount_query_with_schema
  if (promptName === "sap_glaccount_query_with_schema") {
    const queryDescription = request.params.arguments?.query_description as string;

    if (!queryDescription) {
      throw new Error("query_description argument is required");
    }

    // Obtener el schema específico de C_GLACCOUNTBALANCEQUERYResult (contiene las properties reales)
    let schemaInfo = "G/L Account Balances schema not available";
    if (glAccountMetadataParser) {
      try {
        schemaInfo = await glAccountMetadataParser.getEntityTypeDetails('C_GLACCOUNTBALANCEQUERYResult');
      } catch (error) {
        console.error("[Prompt] Error obteniendo schema de G/L Account:", error);
        schemaInfo = "⚠️ Error loading G/L Account schema. This service requires 9 mandatory parameters in the function call.";
      }
    }

    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `📋 SAP G/L Account Balances - Properties disponibles en C_GLACCOUNTBALANCEQUERYResult:

${schemaInfo}

🔑 MANDATORY FUNCTION PARAMETERS (Required in all queries):
The 'sap_glaccount_query' tool requires 9 mandatory parameters:
- P_CompanyCode (e.g., '1010')
- P_FiscalYear (e.g., '2024')
- P_Ledger (e.g., '0L')
- P_CurrencyRole (normally '10')
- P_DisplayAltvAcct (normally ' ')
- P_FromPostingDate (datetime format: datetime'2024-11-01T00:00:00')
- P_ToPostingDate (datetime format: datetime'2024-11-30T00:00:00')
- P_FiscalPeriod (e.g., '011')
- P_DspTimeDependentDesc (normally ' ')

💡 IMPORTANT for Balance Queries:
To see balance information, include these fields in $select: StartingBalAmtInDspCrcy, DebitAmountInDisplayCrcy, CreditAmountInDisplayCrcy, EndingBalAmtInDspCrcy

⚠️ RESTRICTIONS (S/4HANA 2022 On-Premise OData V2):
1. ❌ DO NOT combine $select with $expand
2. ❌ DO NOT use $select inside $expand
3. ❌ DO NOT use $filter with any()

👤 User Query: "${queryDescription}"

📝 Task: Based on the properties above and the mandatory requirements, construct the appropriate query using the 'sap_glaccount_query' tool.`,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown prompt: ${promptName}`);
});

/**************** Fin de la configuración del servidor MCP ****************/

/**
 * 🔐 OAuth 2.0 Authorization Code Flow Endpoints
 */

// Endpoint de login - Redirige al usuario a IAS
app.get("/mcp/login", handleLogin(oauthConfig));

// Endpoint de callback - Recibe el code y obtiene el token
app.get("/mcp/callback", handleCallback(oauthConfig));

// Endpoint de logout - Cierra la sesión
app.get("/mcp/logout", handleLogout());

// Página de inicio con información de autenticación
app.get("/", (req: Request, res: Response) => {
  const sessionId = req.cookies?.mcp_session;
  const isAuthenticated = !!sessionId;

  res.send(`
    <html>
      <head>
        <title>MCP Service - OAuth 2.0</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
          }
          .status {
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
          }
          .authenticated {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
          }
          .not-authenticated {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
          }
          button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            margin: 5px;
          }
          button:hover {
            background: #0056b3;
          }
          .logout-btn {
            background: #dc3545;
          }
          .logout-btn:hover {
            background: #c82333;
          }
        </style>
      </head>
      <body>
        <h1>🔗 MCP Service with OAuth 2.0</h1>

        <div class="status ${isAuthenticated ? 'authenticated' : 'not-authenticated'}">
          ${isAuthenticated
      ? '✅ You are authenticated'
      : '❌ You are not authenticated'
    }
        </div>

        <h2>Authentication</h2>
        ${!isAuthenticated
      ? '<button onclick="window.location.href=\'/mcp/login\'">🔐 Login with SAP IAS</button>'
      : '<button class="logout-btn" onclick="window.location.href=\'/mcp/logout\'">🚪 Logout</button>'
    }

        <h2>Endpoints</h2>
        <ul>
          <li><strong>POST /mcp</strong> - MCP endpoint (requires authentication)</li>
          <li><strong>GET /health</strong> - Health check (public)</li>
          <li><strong>GET /ready</strong> - Readiness check (public)</li>
          <li><strong>GET /mcp/login</strong> - OAuth login</li>
          <li><strong>GET /mcp/callback</strong> - OAuth callback</li>
          <li><strong>GET /mcp/logout</strong> - Logout</li>
        </ul>

        <h2>Configuration</h2>
        <ul>
          <li>OAuth Enabled: ${oauthConfig.enabled ? '✅ Yes' : '❌ No'}</li>
          <li>IAS Issuer: ${oauthConfig.issuer || 'Not configured'}</li>
          <li>Client ID: ${oauthConfig.clientId || 'Not configured'}</li>
          <li>Redirect URI: ${oauthConfig.redirectUri}</li>
        </ul>
      </body>
    </html>
  `);
});

/**
 * 🏥 Health check endpoint para Kubernetes liveness probe
 */
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    notesCount: Object.keys(notes).length,
    activeSessions: Object.keys(transports).length
  });
});

/**
 * 🏥 Readiness check endpoint para Kubernetes readiness probe
 */
app.get("/ready", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ready",
    timestamp: new Date().toISOString()
  });
});

/**
 * 🔄 OAuth 2.0 Proxy Endpoints (para filtrar parámetro "resource")
 *
 * Gemini CLI y otros clientes MCP envían el parámetro "resource" (RFC 8707)
 * que SAP IAS no soporta. Estos endpoints actúan como proxy, filtrando
 * el parámetro "resource" antes de redirigir a SAP IAS.
 */

// Proxy para authorization endpoint - Filtra "resource" parameter
app.get("/oauth/authorize", (req: Request, res: Response) => {
  if (!oauthConfig.enabled) {
    res.status(404).send("OAuth is not enabled on this server");
    return;
  }

  // Clonar query params y eliminar "resource"
  const params = new URLSearchParams(req.query as any);
  params.delete('resource'); // ← Esto elimina el parámetro problemático

  // Redirigir a SAP IAS sin el parámetro "resource"
  const iasUrl = `${oauthConfig.issuer}/oauth2/authorize?${params.toString()}`;
  console.log(`🔄 Proxy OAuth: Redirigiendo a IAS (sin resource): ${iasUrl}`);
  res.redirect(iasUrl);
});

// GET /oauth/token - Error informativo (OAuth 2.0 requiere POST)
app.get("/oauth/token", (req: Request, res: Response) => {
  res.status(405).json({
    error: "method_not_allowed",
    error_description: "The token endpoint only accepts POST requests per OAuth 2.0 RFC 6749",
    allowed_methods: ["POST"]
  });
});

// Proxy para token endpoint - Filtra "resource" parameter
app.post("/oauth/token", async (req: Request, res: Response) => {
  if (!oauthConfig.enabled) {
    res.status(404).json({ error: "OAuth is not enabled on this server" });
    return;
  }

  try {
    // Clonar body y eliminar "resource"
    const body = { ...req.body };
    delete body.resource; // ← Esto elimina el parámetro problemático

    console.log(`🔄 Proxy OAuth: Reenviando token request a IAS (sin resource)`);

    // Reenviar la petición a SAP IAS
    const axios = await import('axios');
    const response = await axios.default.post(
      `${oauthConfig.issuer}/oauth2/token`,
      new URLSearchParams(body).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    // Retornar la respuesta de IAS tal cual
    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error('❌ Error en proxy OAuth token:', error.response?.data || error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ error: 'Internal proxy error' });
    }
  }
});

/**
 * 🔍 OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * Endpoint de discovery para que clientes MCP descubran automáticamente la configuración OAuth
 *
 * IMPORTANTE: Apunta a nuestros endpoints PROXY en lugar de directamente a SAP IAS
 */
app.get("/.well-known/oauth-authorization-server", (req: Request, res: Response) => {
  if (!oauthConfig.enabled) {
    res.status(404).json({
      error: "OAuth is not enabled on this server",
      message: "Set IAS_ENABLED=true to enable OAuth 2.0 authentication"
    });
    return;
  }

  const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

  // OAuth 2.0 Authorization Server Metadata (RFC 8414)
  // Note: registration_endpoint is intentionally omitted because SAP IAS
  // requires authenticated registration (not public), which Gemini CLI doesn't support.
  // Users must pre-configure client_id and client_secret in their MCP client config.
  //
  // IMPORTANTE: authorization_endpoint y token_endpoint apuntan a nuestros endpoints PROXY
  // que filtran el parámetro "resource" antes de redirigir a SAP IAS
  res.status(200).json({
    issuer: oauthConfig.issuer,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,  // ← PROXY endpoint
    token_endpoint: `${baseUrl}/oauth/token`,              // ← PROXY endpoint
    jwks_uri: `${oauthConfig.issuer}/oauth2/certs`,       // ← Directo a IAS (no necesita proxy)
    scopes_supported: oauthConfig.scopes,
    response_types_supported: ["code"],
    response_modes_supported: ["query", "fragment"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post"
    ],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${baseUrl}/`,
    ui_locales_supported: ["en-US", "es-ES"]
  });
});

/**
 * 🔍 OAuth 2.0 Protected Resource Metadata (RFC 9728) - DISABLED
 *
 * IMPORTANTE: Este endpoint está deshabilitado porque SAP IAS no soporta
 * el parámetro "resource" de RFC 8707. Cuando Gemini CLI detecta este endpoint,
 * automáticamente agrega el parámetro "resource" a la autorización OAuth,
 * causando el error "invalid_target".
 *
 * Solución: No exponer este endpoint para que Gemini CLI no intente usar
 * RFC 9728 protected resource metadata.
 */
// app.get("/.well-known/oauth-protected-resource", (req: Request, res: Response) => {
//   if (!oauthConfig.enabled) {
//     res.status(404).json({
//       error: "OAuth is not enabled on this server"
//     });
//     return;
//   }

//   const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

//   res.status(200).json({
//     // resource: baseUrl, // REMOVED: SAP IAS doesn't support RFC 8707 resource parameter
//     authorization_servers: [oauthConfig.issuer],
//     scopes_supported: oauthConfig.scopes,
//     bearer_methods_supported: ["header"],
//     resource_documentation: `${baseUrl}/`,
//     resource_signing_alg_values_supported: ["RS256"]
//   });
// });

/**
 * Endpoint principal MCP (POST).
 * Protegido con autenticación combinada (JWT header o cookie de sesión)
 */
app.post("/mcp", combinedAuthMiddleware(iasConfig, getTokenFromSession), async (req, res) => {
  console.log("📨 Recibida petición MCP POST");
  console.log("📦 Cuerpo de la petición:", req.body);

  try {
    // Busca sessionId en cabecera
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    console.log(`🔑 Procesando para session ID: ${sessionId}`);

    // Extraer token de autenticación del request (puede venir del header Authorization o de la sesión OAuth)
    const authToken = (req as any).accessToken || extractToken(req);

    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      console.log(`🔄 Reutilizando transport para sesión ${sessionId}`);
      transport = transports[sessionId];

      // Actualizar el token de la sesión
      if (authToken) {
        sessionTokens[sessionId] = authToken;
        console.log(`🔐 Token de autenticación actualizado para sesión ${sessionId}`);
      }
    } else if (!sessionId && isInitializeRequest(req.body)) {
      console.log("🆕 Sin session ID, inicializando nuevo transport");

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          transports[newSessionId] = transport;

          // Guardar el token para esta sesión
          if (authToken) {
            sessionTokens[newSessionId] = authToken;
            console.log(`🔐 Token de autenticación guardado para nueva sesión ${newSessionId}`);
          }
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
          delete sessionTokens[transport.sessionId]; // Limpiar token al cerrar sesión
        }
      };

      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: req?.body?.id,
      });
      return;
    }

    // Maneja la petición con el transport correspondiente
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("❌ Error manejando petición MCP:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: req?.body?.id,
      });
      return;
    }
  }
});

/**
 * Endpoint GET para SSE streams (usado por MCP para eventos).
 * Protegido con autenticación combinada (JWT header o cookie de sesión)
 */
app.get("/mcp", combinedAuthMiddleware(iasConfig, getTokenFromSession), async (req: Request, res: Response) => {
  console.error("📥 Recibida petición MCP GET");
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: req?.body?.id,
    });
    return;
  }

  const lastEventId = req.headers["last-event-id"] as string | undefined;
  if (lastEventId) {
    console.error(`🔁 Cliente reconectando con Last-Event-ID: ${lastEventId}`);
  } else {
    console.error(`🌐 Estableciendo nuevo SSE para sesión ${sessionId}`);
  }

  const transport = transports[sessionId];
  await transport!.handleRequest(req, res);
});

/**
 * Endpoint DELETE para terminar sesión MCP.
 * Protegido con autenticación combinada (JWT header o cookie de sesión)
 */
app.delete("/mcp", combinedAuthMiddleware(iasConfig, getTokenFromSession), async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: req?.body?.id,
    });
    return;
  }

  console.error(
    `🗑️ Recibida petición de terminación de sesión para ${sessionId}`
  );

  try {
    const transport = transports[sessionId];
    await transport!.handleRequest(req, res);
  } catch (error) {
    console.error("❌ Error al terminar sesión:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Error handling session termination",
        },
        id: req?.body?.id,
      });
      return;
    }
  }
});

/**
 * 🚦 Inicia el servidor Express.
 */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`📡 MCP Streamable HTTP Server escuchando en puerto ${PORT}`);
});

/**
 * 🛑 Maneja el apagado del servidor y limpia recursos.
 */
process.on("SIGINT", async () => {
  console.log("🛑 Apagando servidor...");

  // Cierra todos los transports activos
  for (const sessionId in transports) {
    try {
      console.log(`🔒 Cerrando transport para sesión ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`❌ Error cerrando transport para sesión ${sessionId}:`, error);
    }
  }

  console.error("✅ Apagado completo");
  process.exit(0);
});