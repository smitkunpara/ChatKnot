import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { ChatScreen } from '../screens/ChatScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { Sidebar } from '../components/Sidebar/ConversationList';
import { useSettingsStore } from '../store/useSettingsStore';

const Drawer = createDrawerNavigator();

export const AppNavigator = () => {
  const theme = useSettingsStore(state => state.theme);
  const isDark = theme === 'dark';

  const MyDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: '#007AFF',
      background: '#121212',
      card: '#1e1e1e',
      text: '#ffffff',
      border: '#333333',
      notification: '#ff4444',
    },
  };

  const MyLightTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: '#007AFF',
    },
  };

  return (
    <NavigationContainer theme={isDark ? MyDarkTheme : MyLightTheme}>
      <Drawer.Navigator 
        initialRouteName="Chat"
        drawerContent={(props) => <Sidebar {...props} />}
        screenOptions={{
          headerShown: false,
          drawerStyle: {
            backgroundColor: isDark ? '#121212' : '#fff',
            width: 280,
          }
        }}
      >
        <Drawer.Screen name="Chat" component={ChatScreen} />
        <Drawer.Screen name="Settings" component={SettingsScreen} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
};
