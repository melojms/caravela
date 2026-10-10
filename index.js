// Must load before @jellyfin/sdk: Vega's URL has no `search` setter.
import './src/api/urlPolyfill';
import { AppRegistry, LogBox } from 'react-native';
import { App } from './src/App';
import { name as appName } from './app.json';

// Temporary workaround for problem with nested text
// not working currently.
LogBox.ignoreAllLogs();

AppRegistry.registerComponent(appName, () => App);
