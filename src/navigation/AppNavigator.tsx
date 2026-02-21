import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer } from '@react-navigation/native';
import { ChatScreen } from '../screens/ChatScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { Sidebar } from '../components/Sidebar/ConversationList';
import { getNavigationTheme, useAppTheme } from '../theme/useAppTheme';

const Drawer = createDrawerNavigator();

export const AppNavigator = () => {
  const { colors } = useAppTheme();

  return (
    <NavigationContainer theme={getNavigationTheme(colors)}>
      <Drawer.Navigator 
        initialRouteName="Chat"
        drawerContent={(props) => <Sidebar {...props} />}
        screenOptions={{
          headerShown: false,
          drawerHideStatusBarOnOpen: false,
          drawerStyle: {
            backgroundColor: colors.background,
            width: 280,
          },
          sceneContainerStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Drawer.Screen name="Chat" component={ChatScreen} />
        <Drawer.Screen name="Settings" component={SettingsScreen} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
};
