// One Power Automate "Import package (legacy)" for one flow, as the list of ZIP members.
//
// Used by scripts/build-mailer-flows.mjs (the packages committed under mailer/flows/packages)
// and by tools/setup.mjs --export-flows (packages of the flows as they are in the tenant), so an
// exported package has exactly the shape of the ones built here. The caller zips the members.

const API_DISPLAY = { sharepointonline: 'SharePoint', office365: 'Office 365 Outlook' };

/**
 * @param {object} o
 * @param {string} o.name                    the flow's display name
 * @param {string} [o.description]
 * @param {object} o.definition              the workflow definition
 * @param {object} o.connectionReferences    { shared_<api>: { connectionName, id, ... } }
 * @param {(label: string) => string} o.guid a GUID for a label (stable labels give a stable package)
 * @param {string} o.createdTime
 * @param {string} o.creator
 * @param {string} [o.sourceEnvironment]
 * @returns {{name: string, data: string}[]}
 */
export function flowPackageEntries({ name, description = '', definition, connectionReferences, guid, createdTime, creator, sourceEnvironment = '' }) {
  const flowId = guid(`${name}:package-resource`);
  const resources = {};
  const apisMap = {};
  const connectionsMap = {};
  const dependsOn = [];

  for (const [ref, c] of Object.entries(connectionReferences || {})) {
    const api = c.apiName || ref.replace(/^shared_/, '');
    const display = API_DISPLAY[api] || api;
    const apiRes = guid(`${name}:${api}:api`);
    const conRes = guid(`${name}:${api}:connection`);
    resources[apiRes] = {
      id: c.id || `/providers/Microsoft.PowerApps/apis/${ref}`,
      name: ref,
      type: 'Microsoft.PowerApps/apis',
      suggestedCreationType: 'Existing',
      details: { displayName: display },
      configurableBy: 'System',
      hierarchy: 'Child',
      dependsOn: [],
    };
    resources[conRes] = {
      type: 'Microsoft.PowerApps/apis/connections',
      suggestedCreationType: 'Existing',
      creationType: 'Existing',
      details: { displayName: `${display} connection (select during import)` },
      configurableBy: 'User',
      hierarchy: 'Child',
      dependsOn: [apiRes],
    };
    apisMap[ref] = apiRes;
    connectionsMap[ref] = conRes;
    dependsOn.push(apiRes, conRes);
  }

  const manifest = {
    schema: '1.0',
    details: {
      displayName: name,
      description,
      createdTime,
      packageTelemetryId: guid(`${name}:telemetry`),
      creator,
      sourceEnvironment,
    },
    resources: {
      [flowId]: {
        type: 'Microsoft.Flow/flows',
        suggestedCreationType: 'New',
        creationType: 'Existing, New, Update',
        details: { displayName: name },
        configurableBy: 'User',
        hierarchy: 'Root',
        dependsOn,
      },
      ...resources,
    },
  };

  const flowName = guid(`${name}:flow-name`);
  const flowDefinition = {
    name: flowName,
    id: `/providers/Microsoft.Flow/flows/${flowName}`,
    type: 'Microsoft.Flow/flows',
    properties: {
      apiId: '/providers/Microsoft.PowerApps/apis/shared_logicflows',
      displayName: name,
      definition,
      connectionReferences,
      flowFailureAlertSubscribed: false,
      isManaged: false,
    },
  };

  return [
    { name: 'manifest.json', data: JSON.stringify(manifest) },
    { name: 'Microsoft.Flow/flows/manifest.json', data: JSON.stringify({ packageSchemaVersion: '1.0', flowAssets: { assetPaths: [flowId] } }) },
    { name: `Microsoft.Flow/flows/${flowId}/definition.json`, data: JSON.stringify(flowDefinition) },
    { name: `Microsoft.Flow/flows/${flowId}/apisMap.json`, data: JSON.stringify(apisMap) },
    { name: `Microsoft.Flow/flows/${flowId}/connectionsMap.json`, data: JSON.stringify(connectionsMap) },
  ];
}
