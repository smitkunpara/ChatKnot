import React from 'react';
import { createDrawerNavigator, DrawerNavigationProp } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import { ChatScreen } from '../screens/ChatScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { Sidebar } from '../components/Sidebar/ConversationList';
import { getNavigationTheme, useAppTheme } from '../theme/useAppTheme';
import { StartupWarningBanner } from '../components/Common/StartupWarningBanner';
import { View } from 'react-native';
import { shouldShowStartupWarnings } from './appNavigatorHelpers';

export type AppDrawerParamList = {
  Chat: undefined;
  Settings: undefined;
};

export type AppDrawerNavigation = DrawerNavigationProp<AppDrawerParamList>;

const Drawer = createDrawerNavigator<AppDrawerParamList>();
const noop = () => {};

interface AppNavigatorProps {
  startupWarnings?: string[];
  onDismissWarnings?: () => void;
}

export const AppNavigator: React.FC<AppNavigatorProps> = ({
  startupWarnings = [],
  onDismissWarnings = noop,
}) => {
  const { colors } = useAppTheme();
  const startupWarningVisible = shouldShowStartupWarnings(startupWarnings);

  return (
    <NavigationContainer theme={getNavigationTheme(colors)}>
      <View style={{ flex: 1 }}>
        <Drawer.Navigator
          initialRouteName="Chat"
          drawerContent={(props) => <Sidebar {...props} />}
          screenOptions={{
            headerShown: false,
            freezeOnBlur: true,
            drawerHideStatusBarOnOpen: false,
            drawerStyle: {
              backgroundColor: colors.background,
              width: 280,
            },
            sceneStyle: {
              backgroundColor: colors.background,
            },
          }}
        >
          <Drawer.Screen name="Chat" component={ChatScreen} />
          <Drawer.Screen name="Settings" component={SettingsScreen} />
        </Drawer.Navigator>
        <StartupWarningBanner 
          warnings={startupWarnings} 
          visible={startupWarningVisible}
          onDismiss={onDismissWarnings} 
        />
      </View>
    </NavigationContainer>
  );
};
