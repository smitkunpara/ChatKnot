import 'react-native-url-polyfill/auto';
import 'text-encoding-polyfill';
import { registerRootComponent } from 'expo';
import { createDebugLogger } from './src/utils/debugLogger';

import App from './App';

const debug = createDebugLogger('index');
debug.moduleLoaded();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
