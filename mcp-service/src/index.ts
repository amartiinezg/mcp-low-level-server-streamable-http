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
let odataV2Client: ODataV2Client | null = null;
let metadataParser: ODataV2MetadataParser | null = null;

if (destinationConfig) {
  console.log(`🏢 Inicializando Business Partner Client con destino: ${destinationConfig.destinationName}`);
  const destinationClient = new DestinationServiceClient(destinationConfig);

  let connectivityClient: ConnectivityServiceClient | null = null;
  if (connectivityConfig) {
    console.log('🔗 Connectivity Service configurado - Se usará connectivity-proxy para llamadas OnPremise');
    connectivityClient = new ConnectivityServiceClient(connectivityConfig);
  } else {
    console.warn('⚠️  Connectivity Service no configurado. Se intentará acceso directo (puede fallar para OnPremise).');
  }

  businessPartnerClient = new BusinessPartnerClient(destinationClient, connectivityClient);

  // Inicializar cliente OData V2 genérico y metadata parser
  console.log('📋 Inicializando OData V2 Client y Metadata Parser');
  odataV2Client = new ODataV2Client(destinationClient, connectivityClient);
  metadataParser = new ODataV2MetadataParser(destinationClient, connectivityClient);

  // Validar conectividad en el inicio (sin bloquear el servidor)
  businessPartnerClient.validateConnectivity().then((isValid) => {
    if (isValid) {
      console.log('✅ [Startup] Business Partner API connectivity validated successfully');
      // Pre-fetch metadata para caché
      metadataParser?.fetchMetadata().then(() => {
        console.log('✅ [Startup] OData metadata cached successfully');
      }).catch((error) => {
        console.warn('⚠️ [Startup] Failed to cache metadata:', error.message);
      });
    } else {
      console.warn('⚠️ [Startup] Business Partner API connectivity validation failed - tool will be available but may not work');
    }
  }).catch((error) => {
    console.error('❌ [Startup] Failed to validate Business Partner connectivity:', error.message);
  });
} else {
  console.log(`⚠️ Business Partner Client no inicializado (configuración no encontrada)`);
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

  // Add OData schema resource if available
  if (metadataParser) {
    resources.push({
      uri: "sap://businesspartner/schema",
      mimeType: "text/plain",
      name: "SAP Business Partner OData Schema",
      description: "Complete OData V2 schema with entities, properties, and relationships for the Business Partner API",
    });
  }

  return { resources };
});

/**
 * 📖 Handler para leer el contenido de recursos (notas + schema OData).
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);

  // Handle SAP OData schema resource
  if (url.protocol === 'sap:' && url.pathname === '//businesspartner/schema') {
    if (!metadataParser) {
      throw new Error('OData schema not available - Business Partner API not configured');
    }

    const schemaInfo = await metadataParser.getSchemaInfo();

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
        name: "create_note",
        description: "Create a new note",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of the note",
            },
            content: {
              type: "string",
              description: "Text content of the note",
            },
          },
          required: ["title", "content"],
        },
      },
      {
        name: "cap_list_products",
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
        name: "cap_create_order",
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
        name: "cap_update_order_status",
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
        name: "sap_odata_query",
        description: `Ejecuta consultas al servicio SAP Business Partner OData V2 (S/4HANA 2022 On-Premise).

⚠️  RESTRICCIONES IMPORTANTES DE S/4HANA 2022 ON-PREMISE:

1. **$select + $expand NO COMPATIBLE**: No combines $select en la raíz con $expand. El expand desaparecerá de la respuesta.
   ❌ INCORRECTO: entitySet='A_BusinessPartner', select='BusinessPartner,BusinessPartnerFullName', expand='to_BusinessPartnerAddress'
   ✅ CORRECTO: entitySet='A_BusinessPartner', expand='to_BusinessPartnerAddress' (sin select, traer todos los campos de la raíz)

2. **$select dentro de $expand NO SOPORTADO**: No puedes usar $expand=to_NavigationProperty($select=Field).
   ❌ INCORRECTO: expand='to_BusinessPartnerAddress($select=StreetName,City)'
   ✅ CORRECTO: expand='to_BusinessPartnerAddress' (traer todos los campos del expand, filtrar localmente si es necesario)

3. **$filter con any() NO SOPORTADO**: No puedes filtrar sobre propiedades de navegación con any().
   ❌ INCORRECTO: filter="to_BusinessPartnerAddress/any(d: d/Country eq 'ES')"
   ✅ ALTERNATIVA 1: Traer con expand='to_BusinessPartnerAddress' y filtrar localmente en tu código
   ✅ ALTERNATIVA 2: Hacer dos llamadas:
      - Llamada 1: entitySet='A_BusinessPartner', expand='to_BusinessPartnerAddress'
      - Llamada 2: entitySet='A_BusinessPartnerAddress', filter="Country eq 'ES'"

4. **Datos de navegación profundos requieren llamadas directas**: Para datos como emails, roles, bancos, etc., si necesitas $filter o $select:
   ✅ SOLUCIÓN: Llamada directa al EntitySet específico
   - Ejemplo emails: entitySet='A_AddressEmailAddress', filter="AddressID eq '12345'", select='EmailAddress'
   - Ejemplo bancos: entitySet='A_BusinessPartnerBank', filter="BusinessPartner eq '1000001'"
   - Ejemplo roles: entitySet='A_BusinessPartnerRole', filter="BusinessPartner eq '1000001' and BusinessPartnerRole eq 'FLCU00'"

5. **Siempre usa $format=json**: Ya incluido automáticamente en todas las peticiones.

RECOMENDACIONES:
- Prioriza traer datos completos con $expand y filtrar localmente cuando sea posible
- Si necesitas filtros o selects específicos en navegaciones, haz llamadas directas a esos EntitySets
- Usa $top en la raíz para limitar resultados, pero nunca sobre navegaciones
- Para casos complejos, divide en múltiples llamadas simples

Usa 'sap_get_schema_info' para conocer todas las entidades y navegaciones disponibles.`,
        inputSchema: {
          type: "object",
          properties: {
            entitySet: {
              type: "string",
              description: "Nombre del EntitySet a consultar (ej: 'A_BusinessPartner', 'A_BusinessPartnerAddress', 'A_AddressEmailAddress'). Consulta el schema para ver entidades disponibles.",
            },
            key: {
              type: "string",
              description: "Clave de la entidad para recuperar un registro específico (ej: '1000001'). Si se proporciona, retorna solo ese registro.",
            },
            filter: {
              type: "string",
              description: "Expresión de filtro OData V2 SOLO para la entidad raíz (ej: \"substringof('Smith',BusinessPartnerFullName)\", \"BusinessPartnerCategory eq '1'\"). NO usar any() sobre navegaciones.",
            },
            select: {
              type: "string",
              description: "Propiedades a seleccionar separadas por comas (ej: 'BusinessPartner,BusinessPartnerFullName'). ⚠️ NO combinar con $expand o el expand desaparecerá. Si usas expand, omite select y filtra localmente.",
            },
            expand: {
              type: "string",
              description: "Propiedades de navegación a expandir separadas por comas (ej: 'to_BusinessPartnerAddress,to_BusinessPartnerRole'). ⚠️ NO usar con $select en la raíz. NO soporta $select dentro del expand como 'to_Address($select=City)'.",
            },
            orderby: {
              type: "string",
              description: "Propiedad y dirección de ordenamiento (ej: 'CreationDate desc', 'BusinessPartnerFullName asc')",
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
        name: "sap_get_schema_info",
        description: "Obtiene información detallada sobre el schema del servicio OData V2 Business Partner, incluyendo EntitySets disponibles, propiedades de cada entidad, claves primarias, tipos de datos y relaciones/navegaciones. Usa esta herramienta antes de 'sap_odata_query' para saber qué entidades y propiedades están disponibles.",
        inputSchema: {
          type: "object",
          properties: {
            entityType: {
              type: "string",
              description: "Nombre del tipo de entidad para obtener detalles específicos (ej: 'A_BusinessPartner'). Si no se proporciona, retorna un resumen de todas las entidades.",
            },
          },
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
    case "create_note": {
      const title = String(request.params.arguments?.title);
      const content = String(request.params.arguments?.content);
      if (!title || !content) {
        throw new Error("Title and content are required");
      }

      const id = String(Object.keys(notes).length + 1);
      notes[id] = { title, content };

      return {
        content: [
          {
            type: "text",
            text: `Created note ${id}: ${title}`,
          },
        ],
      };
    }

    case "cap_list_products": {
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

    case "cap_create_order": {
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

    case "cap_update_order_status": {
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

    case "sap_odata_query": {
      if (!odataV2Client) {
        return {
          content: [
            {
              type: "text",
              text: `❌ OData V2 Client no está configurado. Por favor configure las variables de entorno BTP_DESTINATION_*`,
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

        console.log(`[sap_odata_query] Consultando EntitySet: ${entitySet}`);

        const result = await odataV2Client.query({
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
        responseText += `✅ Consulta OData ejecutada exitosamente\n\n`;
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
        return {
          content: [
            {
              type: "text",
              text: `❌ Error al ejecutar consulta OData: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }

    case "sap_get_schema_info": {
      if (!metadataParser) {
        return {
          content: [
            {
              type: "text",
              text: `❌ OData Metadata Parser no está configurado. Por favor configure las variables de entorno BTP_DESTINATION_*`,
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
                text: `✅ Detalles del Entity Type:\n\n${details}`,
              },
            ],
          };
        } else {
          // Get schema overview
          const schemaInfo = await metadataParser.getSchemaInfo();
          return {
            content: [
              {
                type: "text",
                text: schemaInfo,
              },
            ],
          };
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Error al obtener información del schema: ${error.message}`,
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
 * 💡 Handler para listar prompts disponibles (solo "summarize_notes").
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "summarize_notes",
        description: "Summarize all notes",
      },
    ],
  };
});

/**
 * 🧠 Handler para el prompt "summarize_notes".
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "summarize_notes") {
    throw new Error("Unknown prompt");
  }

  const embeddedNotes = Object.entries(notes).map(([id, note]) => ({
    type: "resource" as const,
    resource: {
      uri: `note:///${id}`,
      mimeType: "text/plain",
      text: note.content,
    },
  }));

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Please summarize the following notes:",
        },
      },
      ...embeddedNotes.map((note) => ({
        role: "user" as const,
        content: note,
      })),
      {
        role: "user",
        content: {
          type: "text",
          text: "Provide a concise summary of all the notes above.",
        },
      },
    ],
  };
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