import { ComputeManagementClient } from "@azure/arm-compute";
import { NetworkManagementClient } from "@azure/arm-network";
import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-resources-subscriptions";

const credential = {
  async getToken() {
    return { token: "shape-check-only", expiresOnTimestamp: Date.now() + 60_000 };
  },
};
const subscriptionId = "00000000-0000-0000-0000-000000000000";
const compute = new ComputeManagementClient(credential, subscriptionId);
const network = new NetworkManagementClient(credential, subscriptionId);
const resources = new ResourceManagementClient(credential, subscriptionId);
const subscriptions = new SubscriptionClient(credential);

const checks = {
  "subscriptions.get": subscriptions.subscriptions?.get,
  "subscriptions.listLocations": subscriptions.subscriptions?.listLocations,
  "compute.resourceSkus.list": compute.resourceSkus?.list,
  "compute.usage.list": compute.usage?.list,
  "compute.virtualMachineImages.list": compute.virtualMachineImages?.list,
  "compute.virtualMachines.get": compute.virtualMachines?.get,
  "compute.virtualMachines.beginCreateOrUpdate": compute.virtualMachines?.beginCreateOrUpdate,
  "compute.virtualMachineRunCommands.beginCreateOrUpdateAndWait": compute.virtualMachineRunCommands?.beginCreateOrUpdateAndWait,
  "compute.virtualMachineRunCommands.beginDeleteAndWait": compute.virtualMachineRunCommands?.beginDeleteAndWait,
  "network.networkSecurityGroups.beginCreateOrUpdateAndWait": network.networkSecurityGroups?.beginCreateOrUpdateAndWait,
  "network.virtualNetworks.beginCreateOrUpdateAndWait": network.virtualNetworks?.beginCreateOrUpdateAndWait,
  "network.publicIPAddresses.get": network.publicIPAddresses?.get,
  "network.publicIPAddresses.beginCreateOrUpdateAndWait": network.publicIPAddresses?.beginCreateOrUpdateAndWait,
  "network.networkInterfaces.beginCreateOrUpdateAndWait": network.networkInterfaces?.beginCreateOrUpdateAndWait,
  "resources.resourceGroups.get": resources.resourceGroups?.get,
  "resources.resourceGroups.createOrUpdate": resources.resourceGroups?.createOrUpdate,
  "resources.resourceGroups.beginDeleteAndWait": resources.resourceGroups?.beginDeleteAndWait,
};

const missing = Object.entries(checks).filter(([, value]) => typeof value !== "function").map(([name]) => name);
if (missing.length > 0) {
  throw new Error(`Azure SDK method shape mismatch: ${missing.join(", ")}`);
}
console.log(`Azure SDK shape OK (${Object.keys(checks).length} methods)`);
