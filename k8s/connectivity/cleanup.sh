#!/bin/bash

# SAP BTP Connectivity and Destination Service Cleanup Script
# This script removes the connectivity and destination services in the correct order

set -e

NAMESPACE="mcp-cap-integration"

echo "========================================"
echo "SAP BTP Services Cleanup"
echo "========================================"
echo ""
echo "WARNING: This will delete all connectivity and destination service resources."
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo ""
echo "Step 1: Deleting ServiceBindings..."
echo "-----------------------------------"
if kubectl get servicebinding connectivity-service-binding -n $NAMESPACE &> /dev/null; then
    kubectl delete -f 02-connectivity-service-binding.yaml
    echo "✓ Connectivity ServiceBinding deleted"
else
    echo "ℹ Connectivity ServiceBinding not found, skipping..."
fi

if kubectl get servicebinding destination-service-binding -n $NAMESPACE &> /dev/null; then
    kubectl delete -f 05-destination-service-binding.yaml
    echo "✓ Destination ServiceBinding deleted"
else
    echo "ℹ Destination ServiceBinding not found, skipping..."
fi

echo ""
echo "Waiting for ServiceBindings to be fully deleted..."
sleep 10

echo ""
echo "Step 2: Deleting ServiceInstances..."
echo "-----------------------------------"
if kubectl get serviceinstance connectivity-service -n $NAMESPACE &> /dev/null; then
    kubectl delete -f 01-connectivity-service-instance.yaml
    echo "✓ Connectivity ServiceInstance deleted"
else
    echo "ℹ Connectivity ServiceInstance not found, skipping..."
fi

if kubectl get serviceinstance destination-service -n $NAMESPACE &> /dev/null; then
    kubectl delete -f 04-destination-service-instance.yaml
    echo "✓ Destination ServiceInstance deleted"
else
    echo "ℹ Destination ServiceInstance not found, skipping..."
fi

echo ""
echo "Waiting for ServiceInstances to be fully deleted (this may take a few minutes)..."
echo "You can monitor the progress with: kubectl get serviceinstances -n $NAMESPACE"

# Wait for both service instances to be deleted
while kubectl get serviceinstance connectivity-service -n $NAMESPACE &> /dev/null || \
      kubectl get serviceinstance destination-service -n $NAMESPACE &> /dev/null; do
    echo -n "."
    sleep 5
done

echo ""
echo ""
echo "========================================"
echo "✓ Cleanup completed successfully!"
echo "========================================"
echo ""
echo "Remaining resources in namespace $NAMESPACE:"
kubectl get all -n $NAMESPACE
echo ""
