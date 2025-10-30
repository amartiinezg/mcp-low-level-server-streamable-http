#!/bin/bash

# SAP BTP Connectivity and Destination Service Deployment Script
# This script deploys the connectivity and destination services in the correct order
# NOTE: The connectivity-proxy is already deployed in kyma-system as a Kyma module

set -e

NAMESPACE="mcp-cap-integration"

echo "========================================"
echo "SAP BTP Services Deployment"
echo "========================================"
echo ""
echo "NOTE: This script deploys ServiceInstances and ServiceBindings only."
echo "The connectivity-proxy is already deployed in kyma-system as a Kyma module."
echo ""

# Check if namespace exists
if ! kubectl get namespace $NAMESPACE &> /dev/null; then
    echo "Error: Namespace $NAMESPACE does not exist"
    echo "Please create it first: kubectl create namespace $NAMESPACE"
    exit 1
fi

echo "Step 1: Creating ServiceInstances..."
echo "-----------------------------------"
kubectl apply -f 01-connectivity-service-instance.yaml
kubectl apply -f 04-destination-service-instance.yaml

echo ""
echo "Waiting for ServiceInstances to be ready (this may take several minutes)..."
echo "Checking connectivity-service..."
kubectl wait --for=jsonpath='{.status.ready}'=True \
    serviceinstance/connectivity-service \
    -n $NAMESPACE \
    --timeout=600s

echo "Checking destination-service..."
kubectl wait --for=jsonpath='{.status.ready}'=True \
    serviceinstance/destination-service \
    -n $NAMESPACE \
    --timeout=600s

echo ""
echo "✓ ServiceInstances are ready"
echo ""

echo "Step 2: Creating ServiceBindings..."
echo "-----------------------------------"
kubectl apply -f 02-connectivity-service-binding.yaml
kubectl apply -f 05-destination-service-binding.yaml

echo ""
echo "Waiting for ServiceBindings to be ready..."
kubectl wait --for=jsonpath='{.status.ready}'=True \
    servicebinding/connectivity-service-binding \
    -n $NAMESPACE \
    --timeout=300s

kubectl wait --for=jsonpath='{.status.ready}'=True \
    servicebinding/destination-service-binding \
    -n $NAMESPACE \
    --timeout=300s

echo ""
echo "✓ ServiceBindings are ready"
echo ""

echo "Step 3: Verifying secrets..."
echo "-----------------------------------"
if kubectl get secret connectivity-service-credentials -n $NAMESPACE &> /dev/null; then
    echo "✓ connectivity-service-credentials secret exists"
else
    echo "✗ connectivity-service-credentials secret not found"
    exit 1
fi

if kubectl get secret destination-service-credentials -n $NAMESPACE &> /dev/null; then
    echo "✓ destination-service-credentials secret exists"
else
    echo "✗ destination-service-credentials secret not found"
    exit 1
fi

echo ""
echo "Step 4: Updating MCP Service..."
echo "-----------------------------------"
kubectl apply -f ../mcp-service/deployment.yaml

echo ""
echo "Waiting for MCP Service to be ready..."
kubectl wait --for=condition=available \
    deployment/mcp-service \
    -n $NAMESPACE \
    --timeout=300s

echo ""
echo "✓ MCP Service is ready"
echo ""

echo "========================================"
echo "Deployment Summary"
echo "========================================"
echo ""
echo "ServiceInstances:"
kubectl get serviceinstances -n $NAMESPACE

echo ""
echo "ServiceBindings:"
kubectl get servicebindings -n $NAMESPACE

echo ""
echo "Deployments:"
kubectl get deployments -n $NAMESPACE

echo ""
echo "Pods:"
kubectl get pods -n $NAMESPACE

echo ""
echo "Secrets:"
kubectl get secrets -n $NAMESPACE | grep -E "(connectivity|destination)"

echo ""
echo "========================================"
echo "✓ Deployment completed successfully!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Verify Cloud Connector is connected in BTP Cockpit"
echo "2. Configure destination 'SAP_OnPremise' in BTP Cockpit"
echo "3. Test MCP tools: sap_get_business_partner, sap_search_business_partners"
echo ""
