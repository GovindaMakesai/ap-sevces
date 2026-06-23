/**
 * Downloads production Android keystore from EAS for the client Expo account.
 * Requires: npm i -g eas-cli && eas login (as aparif786-web / client Expo user)
 */
const path = require('path');
const fs = require('fs');

const EXPO_OWNER = process.env.EXPO_OWNER || 'aparif786-web';
const projectDir = path.resolve(__dirname, '..', 'ap-services-app');
const easRoot =
  process.env.EAS_CLI_ROOT ||
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'eas-cli');
if (!fs.existsSync(path.join(easRoot, 'package.json'))) {
  throw new Error(`eas-cli not found at ${easRoot}. Install: npm i -g eas-cli`);
}
const requireEas = (p) => require(path.join(easRoot, p));

async function main() {
  const Analytics = requireEas('build/analytics/Analytics').default;
  const SessionManager = requireEas('build/user/SessionManager').default;
  const { createGraphqlClient } = requireEas(
    'build/commandUtils/context/contextUtils/createGraphqlClient'
  );
  const androidApi = requireEas('build/credentials/android/api/GraphqlClient');
  const { getOwnerAccountForProjectIdAsync } = requireEas(
    'build/project/projectUtils'
  );
  const { getProjectConfigAsync } = requireEas('build/project/projectUtils');
  const { getProjectIdAsync } = requireEas(
    'build/commandUtils/context/contextUtils/getProjectIdAsync'
  );

  const analytics = new Analytics();
  const sessionManager = new SessionManager(analytics);
  const { actor, authenticationInfo } = await sessionManager.ensureLoggedInAsync({
    nonInteractive: true,
  });
  if (actor.username !== EXPO_OWNER) {
    throw new Error(`Expected Expo user ${EXPO_OWNER}, got ${actor.username}. Run: eas login`);
  }

  const graphqlClient = createGraphqlClient(authenticationInfo);
  const { exp } = await getProjectConfigAsync(projectDir);
  const projectId = await getProjectIdAsync(sessionManager, exp, {
    nonInteractive: true,
  });
  const account = await getOwnerAccountForProjectIdAsync(graphqlClient, projectId);

  const appLookupParams = {
    account,
    projectName: 'ap-services-app',
    androidApplicationIdentifier: 'com.apservices.app',
  };

  let buildCredentials =
    (await androidApi.getAndroidAppBuildCredentialsByNameAsync(
      graphqlClient,
      appLookupParams,
      'production'
    )) ||
    (await androidApi.getDefaultAndroidAppBuildCredentialsAsync(
      graphqlClient,
      appLookupParams
    ));

  if (!buildCredentials?.androidKeystore) {
    const list = await androidApi.getAndroidAppBuildCredentialsListAsync(
      graphqlClient,
      appLookupParams
    );
    buildCredentials = list.find((c) => c.androidKeystore) ?? null;
  }

  if (!buildCredentials?.androidKeystore) {
    throw new Error(`No Android keystore found on EAS for @${EXPO_OWNER}/ap-services-app`);
  }

  const keystore = buildCredentials.androidKeystore;
  const outDir = path.join(projectDir, 'android', 'app');
  const keystoreFileName = 'ap-services-upload.jks';
  const keystorePath = path.join(outDir, keystoreFileName);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(keystorePath, Buffer.from(keystore.keystore, 'base64'));

  const meta = {
    keystoreFileName,
    keystorePath,
    keyAlias: keystore.keyAlias,
    storePassword: keystore.keystorePassword,
    keyPassword: keystore.keyPassword ?? keystore.keystorePassword,
    buildCredentialsName: buildCredentials.name,
    project: `@${EXPO_OWNER}/ap-services-app`,
  };

  const metaPath = path.join(projectDir, 'scripts', '.keystore-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log('KEYSTORE_DOWNLOADED');
  console.log(JSON.stringify(meta));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
