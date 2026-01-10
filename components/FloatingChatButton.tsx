import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

interface FloatingChatButtonProps {
  bottomOffset?: number;
}

export function FloatingChatButton({ bottomOffset = 110 }: FloatingChatButtonProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={[styles.floatingButton, { bottom: bottomOffset }]}
      onPress={() => router.push('/(tabs)/chat')}
      activeOpacity={0.8}
    >
      <Ionicons name="chatbubble-ellipses" size={30} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
    zIndex: 9999,
  },
});

