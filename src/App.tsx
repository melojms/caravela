import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

export const App = () => {
  return (
    <View style={styles.container} testID="splash">
      <Image
        source={require('./assets/caravela-icon.png')}
        style={styles.icon}
        resizeMode="contain"
        testID="splash-icon"
      />
      <Text style={styles.name}>Caravela</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a1628',
  },
  icon: {
    width: 240,
    height: 240,
  },
  name: {
    marginTop: 32,
    color: '#f1f5fb',
    fontSize: 64,
    fontWeight: '700',
  },
});
