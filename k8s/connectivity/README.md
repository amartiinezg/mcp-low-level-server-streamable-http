# SAP BTP Connectivity and Destination Service Setup

This directory contains the Kubernetes resources needed to deploy the SAP BTP Connectivity Proxy and Destination Service in Kyma, which enables access to OnPremise systems via Cloud Connector.

## Components

### 1. Connectivity Service
- **ServiceInstance** (`01-connectivity-service-instance.yaml`): Instancia del servicio de conectividad
- **ServiceBinding** (`02-connectivity-service-binding.yaml`): Binding que genera el secret `connectivity-service-credentials`

### 2. Destination Service
- **ServiceInstance** (`04-destination-service-instance.yaml`): Instancia del servicio de destinos
- **ServiceBinding** (`05-destination-service-binding.yaml`): Binding que genera el secret `destination-service-credentials`

## Prerequisites

1. **SAP BTP Operator** installed in your Kyma cluster
2. **Cloud Connector** configured and connected to your SAP BTP subaccount
3. **Destination** configured in BTP Cockpit pointing to your OnPremise system

## Installation Steps

### 1. Create Service Instances

First, create both service instances (Connectivity and Destination):

```bash
# Create Connectivity Service Instance
kubectl apply -f 01-connectivity-service-instance.yaml

# Create Destination Service Instance
kubectl apply -f 04-destination-service-instance.yaml
```

**Wait for the service instances to be ready (this may take several minutes):**

```bash
kubectl get serviceinstances -n mcp-cap-integration
```

Expected output:
```
NAME                   OFFERING       PLAN                STATUS
connectivity-service   connectivity   connectivity_proxy  Ready
destination-service    destination    lite                Ready
```

### 2. Create Service Bindings

Once both instances are ready, create the bindings:

```bash
# Create Connectivity Service Binding
kubectl apply -f 02-connectivity-service-binding.yaml

# Create Destination Service Binding
kubectl apply -f 05-destination-service-binding.yaml
```

**Wait for the bindings to be ready:**

```bash
kubectl get servicebindings -n mcp-cap-integration
```

**Verify the secrets were created:**

```bash
kubectl get secret -n mcp-cap-integration | grep -E "(connectivity|destination)"
```

Expected output:
```
connectivity-service-credentials   Opaque   1      Xm
destination-service-credentials    Opaque   6      Xm
```

### 3. Connectivity Proxy (Optional - Already in kyma-system)

**IMPORTANT:** If you deployed the Kyma connectivity module, the connectivity-proxy is already running in the `kyma-system` namespace. You do **NOT** need to deploy `03-connectivity-proxy-deployment.yaml`.

The connectivity-proxy in `kyma-system` is used internally by SAP BTP services (like Destination Service) to route traffic through the Cloud Connector.

To verify it's running:
```bash
kubectl get pods -n kyma-system | grep connectivity
kubectl get svc -n kyma-system connectivity-proxy
```

### 4. Deploy or Update MCP Service

The MCP service deployment uses the Destination Service, which automatically routes through the connectivity-proxy. Deploy or update it:

```bash
kubectl apply -f ../mcp-service/deployment.yaml
```

**Verify the deployment:**

```bash
kubectl get pods -n mcp-cap-integration -l app=mcp-service
kubectl logs -n mcp-cap-integration -l app=mcp-service --tail=50
```

## Configuration

### MCP Service Environment Variables

The MCP service is now configured with the following environment variables:

**Destination Service:**
- `BTP_DESTINATION_SERVICE_URL`: URL del servicio de destinos (from secret)
- `BTP_DESTINATION_CLIENT_ID`: Client ID para OAuth (from secret)
- `BTP_DESTINATION_CLIENT_SECRET`: Client Secret para OAuth (from secret)
- `BTP_DESTINATION_TOKEN_URL`: OAuth token endpoint (from secret)
- `BTP_DESTINATION_NAME`: Nombre del destino en BTP Cockpit (default: "SAP_OnPremise")

## Secrets Generated

### connectivity-service-credentials
Contains:
- `serviceCredentials`: Complete JSON with connectivity configuration

### destination-service-credentials
Contains:
- `uri`: Destination service URL
- `clientid`: OAuth client ID
- `clientsecret`: OAuth client secret
- `url`: OAuth token endpoint URL
- Additional fields for service configuration

## Architecture

```
MCP Service (mcp-cap-integration namespace)
    ↓ OAuth 2.0
Destination Service (BTP Cloud)
    ↓ (uses connectivity-proxy internally)
Connectivity Proxy (kyma-system namespace)
    ↓
Cloud Connector (BTP - your on-premise location)
    ↓
SAP OnPremise System
```

**Flow:**
1. MCP Service authenticates with Destination Service using OAuth 2.0 client credentials
2. MCP Service retrieves destination configuration (URL, credentials, ProxyType: OnPremise)
3. MCP Service makes HTTP request to destination URL
4. Destination Service internally routes through connectivity-proxy (in kyma-system)
5. Connectivity proxy forwards to Cloud Connector via secure tunnel
6. Cloud Connector routes to SAP OnPremise system
7. Response flows back through the same path

**Important Notes:**
- The connectivity-proxy in `kyma-system` is managed by Kyma and used internally by BTP services
- Your application code does NOT need to communicate directly with connectivity-proxy
- The Destination Service handles all the proxy routing automatically
- The Cloud Connector must be running and connected to your BTP subaccount

## Troubleshooting

### ServiceInstance stuck in "Creating" or "Ready"

Check SAP BTP Operator logs:

```bash
kubectl logs -n kyma-system -l app.kubernetes.io/name=sap-btp-operator
```

Describe the service instance to see detailed status:

```bash
kubectl describe serviceinstance connectivity-service -n mcp-cap-integration
kubectl describe serviceinstance destination-service -n mcp-cap-integration
```

### ServiceBinding not creating secret

1. **Verify the ServiceInstance is Ready:**

```bash
kubectl get serviceinstances -n mcp-cap-integration
```

2. **Check ServiceBinding status:**

```bash
kubectl describe servicebinding connectivity-service-binding -n mcp-cap-integration
kubectl describe servicebinding destination-service-binding -n mcp-cap-integration
```

3. **Check BTP Operator logs for errors:**

```bash
kubectl logs -n kyma-system -l app.kubernetes.io/name=sap-btp-operator --tail=100
```

### MCP Service fails to connect to Destination Service

1. **Check if destination-service-credentials secret exists:**

```bash
kubectl get secret -n mcp-cap-integration destination-service-credentials
```

2. **Verify secret contents:**

```bash
kubectl get secret -n mcp-cap-integration destination-service-credentials -o yaml
```

3. **Check MCP service logs for authentication errors:**

```bash
kubectl logs -n mcp-cap-integration -l app=mcp-service --tail=100 | grep -i "destination"
```

### Connection to OnPremise system fails

1. **Verify Cloud Connector is running** in BTP Cockpit
2. **Check access control** in Cloud Connector for the API endpoint
3. **Verify destination** configuration in BTP Cockpit (ensure destination name matches `BTP_DESTINATION_NAME`)
4. **Test destination configuration** in BTP Cockpit using "Check Connection"
5. **Check MCP service logs:**

```bash
kubectl logs -n mcp-cap-integration -l app=mcp-service --tail=100
```

## Cleanup

To remove all components in reverse order:

```bash
# 1. Delete service bindings (this will delete the secrets)
kubectl delete -f 02-connectivity-service-binding.yaml
kubectl delete -f 05-destination-service-binding.yaml

# 2. Delete service instances (wait for bindings to be deleted first)
kubectl delete -f 01-connectivity-service-instance.yaml
kubectl delete -f 04-destination-service-instance.yaml
```

**Note:** Always delete in this order:
1. ServiceBindings (creating secrets)
2. ServiceInstances (the actual BTP services)

## References

- [SAP BTP Connectivity Proxy Documentation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/connectivity-proxy-for-kubernetes)
- [SAP BTP Destination Service Documentation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/destination-service)
- [SAP BTP Operator Documentation](https://github.com/SAP/sap-btp-service-operator)
- [SAP Cloud Connector Documentation](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/cloud-connector)
